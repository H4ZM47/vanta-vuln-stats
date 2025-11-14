const axios = require('axios');

const BASE_URL = 'https://api.vanta.com/v1';
const AUTH_URL = 'https://api.vanta.com/oauth/token';
const MAX_PAGE_SIZE = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class VantaApiClient {
  constructor({ clientId, clientSecret }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 120000,
    });
  }

  get isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  async authenticate(force = false) {
    if (!this.isConfigured) {
      throw new Error('Client ID and secret are required before authenticating.');
    }

    if (!force && this.accessToken && this.tokenExpiresAt) {
      const expiresIn = this.tokenExpiresAt - Date.now();
      if (expiresIn > 60_000) {
        return this.accessToken;
      }
    }

    const payload = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'vanta-api.all:read',
      grant_type: 'client_credentials',
    };

    const response = await axios.post(AUTH_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    const { access_token: token, expires_in: expiresIn } = response.data;
    if (!token) {
      throw new Error('Authentication succeeded but returned no access token.');
    }

    this.accessToken = token;
    this.tokenExpiresAt = Date.now() + (expiresIn ? expiresIn * 1000 : 3_300_000);
    this.http.defaults.headers.common.Authorization = `Bearer ${token}`;

    return token;
  }

  async requestWithRetry(config, retries = 5) {
    let attempt = 0;
    // ensure token
    await this.authenticate();

    while (attempt <= retries) {
      try {
        return await this.http.request(config);
      } catch (error) {
        // Check if request was aborted
        if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          throw error;
        }

        const status = error?.response?.status;
        if (status === 401 && attempt < retries) {
          await this.authenticate(true);
          attempt += 1;
          continue;
        }
        if (status === 429 && attempt < retries) {
          const retryAfter = Number(error.response.headers['retry-after'] || 60);
          await sleep((retryAfter + 1) * 1000);
          attempt += 1;
          continue;
        }
        if (status && status >= 500 && attempt < retries) {
          await sleep(1_000 * Math.pow(2, attempt));
          attempt += 1;
          continue;
        }
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
   * Fetch assets from the Vanta API
   * @param {Object} options - Query options
   * @param {number} [options.pageSize=100] - Number of items per page (1-100)
   * @param {Function} [options.onBatch] - Callback for each batch of results
   * @param {Object} [options.filters={}] - Filter parameters supported by the API
   * @param {AbortSignal} [options.signal] - Abort signal for cancellation
   * @returns {Promise<Array>} Array of asset objects
   */
  async getAssets({ pageSize = MAX_PAGE_SIZE, onBatch, filters = {}, signal } = {}) {
    return this.paginate({
      endpoint: '/assets',
      params: { pageSize, ...filters },
      onBatch,
      signal,
    });
  }
}

module.exports = { VantaApiClient };
