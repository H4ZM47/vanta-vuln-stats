const axios = require('axios');

const BASE_URL = 'https://api.vanta.com/v1';
const AUTH_URL = 'https://api.vanta.com/oauth/token';

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
    const { pageSize: initialPageSize = 100, ...restParams } = params;
    let currentPageSize = initialPageSize;

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

      // Reduced delay between pages from 500ms to 100ms for faster sync
      // while still being respectful to the API
      if (pageCursor) {
        await sleep(100);
      }
    } while (pageCursor);

    return results;
  }

  async getVulnerabilities({ pageSize = 100, onBatch, filters = {}, signal } = {}) {
    return this.paginate({
      endpoint: '/vulnerabilities',
      params: { pageSize, ...filters },
      onBatch,
      signal,
    });
  }

  async getRemediations({ pageSize = 100, onBatch, filters = {}, signal } = {}) {
    return this.paginate({
      endpoint: '/vulnerability-remediations',
      params: { pageSize, ...filters },
      onBatch,
      signal,
    });
  }
}

module.exports = { VantaApiClient };
