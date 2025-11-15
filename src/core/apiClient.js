const axios = require('axios');
const { VantaRateLimiters } = require('./rateLimiter');

const BASE_URL = 'https://api.vanta.com/v1';
const AUTH_URL = 'https://api.vanta.com/oauth/token';
const MAX_PAGE_SIZE = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class VantaApiClient {
  constructor({ clientId, clientSecret, rateLimitSafetyMargin = 0.85 }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.authenticationPromise = null; // Lock to prevent concurrent auth attempts
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 120000,
    });

    // Initialize rate limiters for proactive rate limit prevention
    this.rateLimiters = new VantaRateLimiters({
      safetyMargin: rateLimitSafetyMargin
    });
  }

  get isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  async authenticate(force = false) {
    if (!this.isConfigured) {
      throw new Error('Client ID and secret are required before authenticating.');
    }

    // Check if we have a valid cached token
    if (!force && this.accessToken && this.tokenExpiresAt) {
      const expiresIn = this.tokenExpiresAt - Date.now();
      if (expiresIn > 60_000) {
        return this.accessToken;
      }
    }

    // If authentication is already in progress, wait for it to complete
    if (this.authenticationPromise) {
      try {
        return await this.authenticationPromise;
      } catch (error) {
        // If the concurrent authentication failed, we'll retry below
        // But first, clear the promise so we can try again
        this.authenticationPromise = null;
      }
    }

    // Create a new authentication promise to prevent concurrent attempts
    this.authenticationPromise = this._performAuthentication();

    try {
      const token = await this.authenticationPromise;
      return token;
    } finally {
      // Clear the promise after authentication completes (success or failure)
      this.authenticationPromise = null;
    }
  }

  async _performAuthentication(maxRetries = 5) {
    const payload = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'vanta-api.all:read',
      grant_type: 'client_credentials',
    };

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Acquire rate limiter token before making OAuth request
        // This prevents hitting the 5 req/min OAuth endpoint limit
        await this.rateLimiters.oauth.acquire();

        const response = await axios.post(AUTH_URL, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000, // 30 second timeout for auth requests
        });

        const { access_token: token, expires_in: expiresIn } = response.data;
        if (!token) {
          throw new Error('Authentication succeeded but returned no access token.');
        }

        this.accessToken = token;
        this.tokenExpiresAt = Date.now() + (expiresIn ? expiresIn * 1000 : 3_300_000);
        this.http.defaults.headers.common.Authorization = `Bearer ${token}`;

        // Log successful authentication after retries
        if (attempt > 0) {
          console.log(`[VantaApiClient] Successfully authenticated after ${attempt} retries`);
        }

        return token;
      } catch (error) {
        lastError = error;
        const status = error?.response?.status;

        // Handle different error scenarios
        if (status === 429) {
          // Rate limited - use exponential backoff with jitter
          const retryAfter = Number(error.response?.headers?.['retry-after']) || 60;
          const baseDelay = Math.max(retryAfter, 2 ** attempt) * 1000;
          const jitter = Math.random() * 1000; // Add up to 1 second of jitter
          const delay = baseDelay + jitter;

          console.warn(
            `[VantaApiClient] OAuth rate limited (429). Waiting ${Math.round(delay / 1000)}s before retry ${attempt + 1}/${maxRetries + 1}`
          );

          if (attempt < maxRetries) {
            await sleep(delay);
            continue;
          }
        } else if (status === 401) {
          // Invalid credentials - don't retry
          throw new Error(`Authentication failed: Invalid client credentials (401)`);
        } else if (status && status >= 500) {
          // Server error - exponential backoff
          const delay = Math.min(30000, 1000 * (2 ** attempt));

          console.warn(
            `[VantaApiClient] OAuth server error (${status}). Waiting ${delay / 1000}s before retry ${attempt + 1}/${maxRetries + 1}`
          );

          if (attempt < maxRetries) {
            await sleep(delay);
            continue;
          }
        } else if (!status && attempt < maxRetries) {
          // Network error - retry with backoff
          const delay = Math.min(10000, 1000 * (2 ** attempt));

          console.warn(
            `[VantaApiClient] Network error during authentication. Waiting ${delay / 1000}s before retry ${attempt + 1}/${maxRetries + 1}`
          );

          await sleep(delay);
          continue;
        }

        // If we've exhausted retries or hit an unrecoverable error, throw
        if (attempt === maxRetries) {
          throw new Error(
            `Authentication failed after ${maxRetries + 1} attempts: ${lastError.message}`,
            { cause: lastError }
          );
        }
      }
    }

    throw lastError;
  }

  async requestWithRetry(config, retries = 5) {
    let attempt = 0;
    let authRetryCount = 0;
    const maxAuthRetries = 2; // Limit authentication retries to avoid infinite loops

    while (attempt <= retries) {
      try {
        // Ensure we have a valid token before making the request
        await this.authenticate();

        // Acquire rate limiter token before making API request
        // This prevents hitting the 20 req/min API endpoint limit
        await this.rateLimiters.api.acquire();

        // Make the actual API request
        return await this.http.request(config);
      } catch (error) {
        // Check if request was aborted
        if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          throw error;
        }

        const status = error?.response?.status;

        // Handle 401 Unauthorized - token might have expired
        if (status === 401 && attempt < retries) {
          authRetryCount++;
          if (authRetryCount > maxAuthRetries) {
            throw new Error('Authentication failed repeatedly. Please check your credentials.');
          }

          console.warn(`[VantaApiClient] Got 401, forcing re-authentication (attempt ${authRetryCount}/${maxAuthRetries})`);

          // Force re-authentication
          await this.authenticate(true);
          attempt += 1;
          continue;
        }

        // Handle 429 Too Many Requests - rate limited on regular API calls
        if (status === 429 && attempt < retries) {
          const retryAfter = Number(error.response?.headers?.['retry-after']) || 60;
          const delay = (retryAfter + 1) * 1000;

          console.warn(
            `[VantaApiClient] API rate limited (429) for ${config.url}. Waiting ${retryAfter + 1}s before retry ${attempt + 1}/${retries + 1}`
          );

          await sleep(delay);
          attempt += 1;
          continue;
        }

        // Handle 5xx Server Errors - temporary issues
        if (status && status >= 500 && attempt < retries) {
          const delay = Math.min(30000, 1000 * Math.pow(2, attempt));

          console.warn(
            `[VantaApiClient] Server error (${status}) for ${config.url}. Waiting ${delay / 1000}s before retry ${attempt + 1}/${retries + 1}`
          );

          await sleep(delay);
          attempt += 1;
          continue;
        }

        // If we've exhausted all retries or hit an unrecoverable error, throw
        throw error;
      }
    }

    throw new Error(`Failed to complete request after ${retries + 1} attempts.`);
  }

  async paginate({ endpoint, params = {}, onBatch, signal }) {
    const results = [];
    let pageCursor;
    const { pageSize: initialPageSize = MAX_PAGE_SIZE, ...restParams } = params;
    let currentPageSize = Math.min(initialPageSize, MAX_PAGE_SIZE);

    do {
      let response;
      try {
        response = await this.requestWithRetry({
          method: 'get',
          url: endpoint,
          params: { ...restParams, pageCursor, pageSize: currentPageSize },
          signal,
        });
      } catch (error) {
        const status = error?.response?.status;
        const canDownsize = status && status >= 500 && currentPageSize > 1;
        if (canDownsize) {
          currentPageSize = Math.max(1, Math.floor(currentPageSize / 2));
          console.warn(
            `[VantaApiClient] ${endpoint} returned ${status}. Retrying with pageSize=${currentPageSize}.`,
          );
          continue;
        }

        // Log 500 error response for debugging - helps diagnose API behavior
        // DO NOT automatically treat as success - real errors must surface
        if (status && status >= 500 && error?.response?.data) {
          const errorBody = error.response.data;
          console.warn(
            `[VantaApiClient] ${endpoint} returned ${status}. Error response:`,
            JSON.stringify(errorBody, null, 2),
          );
        }

        const requestId =
          error?.response?.headers?.['x-amzn-requestid'] ||
          error?.response?.headers?.['x-amz-cf-id'] ||
          error?.response?.headers?.['x-request-id'];
        const metaParts = [
          `endpoint=${endpoint}`,
          `pageSize=${currentPageSize}`,
          pageCursor ? `cursor=${pageCursor}` : null,
          requestId ? `requestId=${requestId}` : null,
        ].filter(Boolean);
        const context = metaParts.length ? ` (${metaParts.join(', ')})` : '';
        throw new Error(`Failed to paginate Vanta API${context}: ${error.message}`, { cause: error });
      }

      const body = response.data || {};
      const pageData = body?.results?.data ?? [];
      const pageInfo = body?.results?.pageInfo ?? {};
      pageCursor = pageInfo.hasNextPage ? pageInfo.endCursor : undefined;

      if (onBatch && pageData.length) {
        await onBatch(pageData);
      }

      results.push(...pageData);

      // Removed artificial delay - API has built-in rate limiting (429 status)
      // which we handle with exponential backoff in requestWithRetry
      // This provides massive speedup without overwhelming the API
    } while (pageCursor);

    return results;
  }

  /**
   * Fetch vulnerabilities from Vanta API
   * @param {Object} options - Query options
   * @param {number} [options.pageSize=100] - Number of items per page (1-100)
   * @param {Function} [options.onBatch] - Callback for each batch of results
   * @param {Object} [options.filters={}] - Filter parameters
   * @param {string} [options.filters.integrationId] - Filter by scanner integration
   * @param {string} [options.filters.severity] - Filter by severity (CRITICAL, HIGH, MEDIUM, LOW)
   * @param {string} [options.filters.slaDeadlineBeforeDate] - Filter vulnerabilities due before date (ISO 8601)
   * @param {string} [options.filters.slaDeadlineAfterDate] - Filter vulnerabilities due after date (ISO 8601)
   * @param {string} [options.filters.vulnerableAssetId] - Filter by vulnerable asset ID
   * @param {AbortSignal} [options.signal] - Abort signal for cancellation
   * @returns {Promise<Array>} Array of vulnerability objects
   */
  async getVulnerabilities({ pageSize = MAX_PAGE_SIZE, onBatch, filters = {}, signal } = {}) {
    return this.paginate({
      endpoint: '/vulnerabilities',
      params: { pageSize, ...filters },
      onBatch,
      signal,
    });
  }

  /**
   * Fetch vulnerability remediations from Vanta API
   * @param {Object} options - Query options
   * @param {number} [options.pageSize=100] - Number of items per page (1-100)
   * @param {Function} [options.onBatch] - Callback for each batch of results
   * @param {Object} [options.filters={}] - Filter parameters
   * @param {string} [options.filters.integrationId] - Filter by scanner integration
   * @param {string} [options.filters.severity] - Filter by severity (CRITICAL, HIGH, MEDIUM, LOW)
   * @param {boolean} [options.filters.isRemediatedOnTime] - Filter by SLA compliance status
   * @param {string} [options.filters.remediatedAfterDate] - Filter remediations after date (ISO 8601)
   * @param {string} [options.filters.remediatedBeforeDate] - Filter remediations before date (ISO 8601)
   * @param {AbortSignal} [options.signal] - Abort signal for cancellation
   * @returns {Promise<Array>} Array of remediation objects
   */
  async getRemediations({ pageSize = MAX_PAGE_SIZE, onBatch, filters = {}, signal } = {}) {
    return this.paginate({
      endpoint: '/vulnerability-remediations',
      params: { pageSize, ...filters },
      onBatch,
      signal,
    });
  }

  /**
   * Fetch vulnerable assets from Vanta API using the /vulnerable-assets endpoint.
   *
   * IMPORTANT: This method uses the /vulnerable-assets endpoint, which replaced the
   * deprecated /assets endpoint that returned 404 errors. The /vulnerable-assets
   * endpoint is the correct and supported way to fetch asset data from the Vanta API.
   *
   * The endpoint returns comprehensive asset information including:
   * - Asset identification (id, name, type, subtype)
   * - Scanner metadata (integration details, scan status)
   * - Network information (IPs, hostnames, FQDNs, MAC addresses)
   * - System details (operating systems, BIOS UUID, platform)
   * - Asset metadata (owners, tags, environment, risk level)
   *
   * @param {Object} options - Query options
   * @param {number} [options.pageSize=100] - Number of items per page (1-100)
   * @param {Function} [options.onBatch] - Callback for each batch of results
   * @param {Object} [options.filters={}] - Filter parameters
   * @param {string} [options.filters.q] - Search query to filter assets by name or identifier
   * @param {string} [options.filters.integrationId] - Filter by scanner integration ID
   * @param {string} [options.filters.assetType] - Filter by asset type (SERVER, WORKSTATION, CODE_REPOSITORY, etc.)
   * @param {string} [options.filters.assetExternalAccountId] - Filter by external account ID
   * @param {AbortSignal} [options.signal] - Abort signal for cancellation support
   * @returns {Promise<Array>} Array of vulnerable asset objects with full metadata
   * @throws {Error} If API returns error or pagination fails
   *
   * @example
   * // Fetch all vulnerable assets
   * const assets = await client.getVulnerableAssets();
   *
   * @example
   * // Fetch only server assets from a specific scanner
   * const servers = await client.getVulnerableAssets({
   *   filters: {
   *     assetType: 'SERVER',
   *     integrationId: 'qualys'
   *   }
   * });
   *
   * @example
   * // Fetch assets with progress tracking
   * const assets = await client.getVulnerableAssets({
   *   pageSize: 100,
   *   onBatch: (batch) => {
   *     console.log(`Fetched ${batch.length} assets`);
   *   }
   * });
   */
  async getVulnerableAssets({ pageSize = MAX_PAGE_SIZE, onBatch, filters = {}, signal } = {}) {
    return this.paginate({
      endpoint: '/vulnerable-assets',
      params: { pageSize, ...filters },
      onBatch,
      signal,
    });
  }

  /**
   * Fetch a single vulnerable asset by ID from the /vulnerable-assets endpoint.
   *
   * IMPORTANT: This method uses the /vulnerable-assets/{id} endpoint, which replaced
   * the deprecated /assets/{id} endpoint that returned 404 errors.
   *
   * @param {string} assetId - The unique asset identifier
   * @returns {Promise<Object>} The vulnerable asset object with full metadata
   * @throws {Error} If asset not found or API returns error
   *
   * @example
   * const asset = await client.getVulnerableAsset('asset-id-123');
   * console.log(asset.name); // "production-server-01"
   * console.log(asset.assetType); // "SERVER"
   */
  async getVulnerableAsset(assetId) {
    const response = await this.requestWithRetry({
      method: 'get',
      url: `/vulnerable-assets/${assetId}`,
    });
    return response.data;
  }

  /**
   * Get rate limiter statistics
   * @returns {Object} Statistics for all rate limiters
   */
  getRateLimiterStats() {
    return this.rateLimiters.getAllStats();
  }

  /**
   * Reset rate limiter statistics (useful for testing)
   */
  resetRateLimiters() {
    this.rateLimiters.resetAll();
  }
}

module.exports = { VantaApiClient };
