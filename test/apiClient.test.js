const test = require('node:test');
const assert = require('node:assert/strict');
const { VantaApiClient } = require('../src/core/apiClient');

// Mock axios module
const axios = require('axios');
const originalAxios = { ...axios };
const originalCreate = axios.create;

function resetAxiosMocks() {
  axios.create = originalCreate;
  axios.post = originalAxios.post;
}

test('VantaApiClient paginate reduces page size on 500 errors', async () => {
  // Track page sizes attempted
  const pageSizesAttempted = [];
  let attemptCount = 0;

  const mockAxiosInstance = {
    request: async (config) => {
      attemptCount++;
      pageSizesAttempted.push(config.params.pageSize);

      // Fail for the first 7 attempts (more than requestWithRetry's 6 attempts)
      // to trigger page size reduction
      if (attemptCount <= 7) {
        const error = new Error('Server error');
        error.response = {
          status: 500,
          data: { error: 'Internal server error' },
          headers: {},
        };
        throw error;
      }

      // Eventually succeed
      return {
        data: {
          results: {
            data: [],
            pageInfo: { hasNextPage: false },
          },
        },
      };
    },
    defaults: {
      headers: { common: {} },
    },
  };

  axios.create = () => mockAxiosInstance;
  axios.post = async () => ({
    data: { access_token: 'test-token', expires_in: 3600 },
  });

  const apiClient = new VantaApiClient({
    clientId: 'test-id',
    clientSecret: 'test-secret',
  });

  // Suppress console warnings
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  // Override sleep to make test fast
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => fn();

  try {
    await apiClient.paginate({
      endpoint: '/test',
      params: { pageSize: 4 },
    });

    // Should have logged page size reductions
    const sizeReductionLogs = warnings.filter(w =>
      w.some(arg => typeof arg === 'string' && arg.includes('Retrying with pageSize'))
    );
    assert.ok(sizeReductionLogs.length > 0, 'Should log page size reductions');
  } finally {
    console.warn = originalWarn;
    global.setTimeout = originalSetTimeout;
    resetAxiosMocks();
  }
});

test('VantaApiClient paginate successfully handles multi-page responses', async () => {
  let pageCount = 0;
  const mockAxiosInstance = {
    request: async (config) => {
      pageCount++;
      if (pageCount === 1) {
        return {
          data: {
            results: {
              data: [{ id: 1 }, { id: 2 }],
              pageInfo: {
                hasNextPage: true,
                endCursor: 'cursor1',
              },
            },
          },
        };
      } else {
        return {
          data: {
            results: {
              data: [{ id: 3 }],
              pageInfo: {
                hasNextPage: false,
              },
            },
          },
        };
      }
    },
    defaults: {
      headers: { common: {} },
    },
  };

  axios.create = () => mockAxiosInstance;
  axios.post = async () => ({
    data: { access_token: 'test-token', expires_in: 3600 },
  });

  const apiClient = new VantaApiClient({
    clientId: 'test-id',
    clientSecret: 'test-secret',
  });

  const results = await apiClient.paginate({
    endpoint: '/test',
    params: { pageSize: 10 },
  });

  assert.deepEqual(results, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.equal(pageCount, 2);

  resetAxiosMocks();
});

test('VantaApiClient paginate calls onBatch for each page', async () => {
  let pageCount = 0;
  const mockAxiosInstance = {
    request: async (config) => {
      pageCount++;
      return {
        data: {
          results: {
            data: pageCount === 1 ? [{ id: 1 }] : [{ id: 2 }],
            pageInfo: {
              hasNextPage: pageCount < 2,
              endCursor: pageCount < 2 ? 'cursor1' : undefined,
            },
          },
        },
      };
    },
    defaults: {
      headers: { common: {} },
    },
  };

  axios.create = () => mockAxiosInstance;
  axios.post = async () => ({
    data: { access_token: 'test-token', expires_in: 3600 },
  });

  const apiClient = new VantaApiClient({
    clientId: 'test-id',
    clientSecret: 'test-secret',
  });

  const batches = [];
  await apiClient.paginate({
    endpoint: '/test',
    onBatch: async (batch) => batches.push(batch),
  });

  assert.equal(batches.length, 2);
  assert.deepEqual(batches[0], [{ id: 1 }]);
  assert.deepEqual(batches[1], [{ id: 2 }]);

  resetAxiosMocks();
});

test('VantaApiClient paginate logs 500 error response for debugging', async () => {
  let callCount = 0;
  const mockAxiosInstance = {
    request: async (config) => {
      callCount++;
      const error = new Error('Server error');
      error.response = {
        status: 500,
        data: {
          error: 'Database connection failed',
          details: 'Connection timeout',
        },
        headers: {
          'x-request-id': 'req-123',
        },
      };
      throw error;
    },
    defaults: {
      headers: { common: {} },
    },
  };

  axios.create = () => mockAxiosInstance;
  axios.post = async () => ({
    data: { access_token: 'test-token', expires_in: 3600 },
  });

  const apiClient = new VantaApiClient({
    clientId: 'test-id',
    clientSecret: 'test-secret',
  });

  // Capture console warnings
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  // Override sleep to make test fast
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => fn();

  try {
    await apiClient.paginate({
      endpoint: '/test-endpoint',
      params: { pageSize: 1 },
    });
    assert.fail('Should have thrown an error');
  } catch (error) {
    // Verify the error was thrown
    assert.match(error.message, /Failed to paginate Vanta API/);

    // Verify error response was logged for debugging BEFORE throwing
    const errorResponseLogs = warnings.filter(w =>
      w.some(arg => typeof arg === 'string' && arg.includes('Error response'))
    );
    assert.ok(errorResponseLogs.length > 0, 'Should log error response data before throwing');

    // Verify the logged data contains the error details
    const loggedData = errorResponseLogs.flatMap(w => w).join(' ');
    assert.match(loggedData, /Database connection failed/);
  } finally {
    console.warn = originalWarn;
    global.setTimeout = originalSetTimeout;
    resetAxiosMocks();
  }
});

test('VantaApiClient paginate does not mask legitimate 500 errors', async () => {
  let callCount = 0;
  const mockAxiosInstance = {
    request: async (config) => {
      callCount++;
      // Fail consistently to ensure error is thrown eventually
      // After requestWithRetry exhausts retries (6 attempts), it should throw
      const error = new Error('Server error');
      error.response = {
        status: 500,
        data: {
          error: 'Rate limit exceeded',
        },
        headers: {},
      };
      throw error;
    },
    defaults: {
      headers: { common: {} },
    },
  };

  axios.create = () => mockAxiosInstance;
  axios.post = async () => ({
    data: { access_token: 'test-token', expires_in: 3600 },
  });

  const apiClient = new VantaApiClient({
    clientId: 'test-id',
    clientSecret: 'test-secret',
  });

  // Suppress warnings
  const originalWarn = console.warn;
  console.warn = () => {};

  // Override sleep to make test fast
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => fn();

  try {
    await apiClient.paginate({
      endpoint: '/test',
      params: { pageSize: 1 },
    });
    assert.fail('Should have thrown an error for legitimate 500');
  } catch (error) {
    // Error should be thrown, not masked
    assert.match(error.message, /Failed to paginate Vanta API/);
    // Verify multiple retries occurred
    assert.ok(callCount > 1, 'Should have retried multiple times');
  } finally {
    console.warn = originalWarn;
    global.setTimeout = originalSetTimeout;
    resetAxiosMocks();
  }
});

test('VantaApiClient getVulnerabilities calls paginate with correct endpoint', async () => {
  let capturedConfig = null;
  const mockAxiosInstance = {
    request: async (config) => {
      capturedConfig = config;
      return {
        data: {
          results: {
            data: [{ id: 1 }],
            pageInfo: { hasNextPage: false },
          },
        },
      };
    },
    defaults: {
      headers: { common: {} },
    },
  };

  axios.create = () => mockAxiosInstance;
  axios.post = async () => ({
    data: { access_token: 'test-token', expires_in: 3600 },
  });

  const apiClient = new VantaApiClient({
    clientId: 'test-id',
    clientSecret: 'test-secret',
  });

  await apiClient.getVulnerabilities();

  assert.equal(capturedConfig.url, '/vulnerabilities');

  resetAxiosMocks();
});

test('VantaApiClient getRemediations calls paginate with correct endpoint', async () => {
  let capturedConfig = null;
  const mockAxiosInstance = {
    request: async (config) => {
      capturedConfig = config;
      return {
        data: {
          results: {
            data: [{ id: 1 }],
            pageInfo: { hasNextPage: false },
          },
        },
      };
    },
    defaults: {
      headers: { common: {} },
    },
  };

  axios.create = () => mockAxiosInstance;
  axios.post = async () => ({
    data: { access_token: 'test-token', expires_in: 3600 },
  });

  const apiClient = new VantaApiClient({
    clientId: 'test-id',
    clientSecret: 'test-secret',
  });

  await apiClient.getRemediations();

  assert.equal(capturedConfig.url, '/vulnerability-remediations');

  resetAxiosMocks();
});
