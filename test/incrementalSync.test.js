const test = require('node:test');
const assert = require('node:assert/strict');
const { DataService } = require('../src/main/dataService');
const { createMockDatabase, createMockApiClient, MemoryStore } = require('./testHelpers');

test('syncData with incremental=true uses remediatedAfterDate filter', async () => {
  const store = new MemoryStore({
    credentials: {
      clientId: 'test-client',
      clientSecret: 'test-secret',
    },
  });

  const lastSyncDate = '2024-01-15T10:00:00.000Z';
  const mockDb = createMockDatabase();

  // Mock getLastSuccessfulSyncDate to return a date
  mockDb.getLastSuccessfulSyncDate = () => lastSyncDate;

  let capturedRemediationFilters = null;
  let capturedVulnerabilityFilters = null;

  const fakeApiConfig = {
    vulnerabilityBatches: [[{ id: 'vuln1', name: 'Test Vuln' }]],
    remediationBatches: [[{ id: 'rem1', vulnerabilityId: 'vuln1' }]],
  };

  const mockApiClient = createMockApiClient(fakeApiConfig);

  // Capture the filters passed to getRemediations
  const originalGetRemediations = mockApiClient.getRemediations.bind(mockApiClient);
  mockApiClient.getRemediations = async (options) => {
    capturedRemediationFilters = options.filters;
    return originalGetRemediations(options);
  };

  // Capture the filters passed to getVulnerabilities
  const originalGetVulnerabilities = mockApiClient.getVulnerabilities.bind(mockApiClient);
  mockApiClient.getVulnerabilities = async (options) => {
    capturedVulnerabilityFilters = options.filters;
    return originalGetVulnerabilities(options);
  };

  const service = new DataService({
    store,
    databaseFactory: () => mockDb,
    apiClientFactory: () => mockApiClient,
  });

  await service.syncData(
    () => {}, // progress callback
    () => {}, // incremental update callback
    () => {}, // state callback
    { incremental: true }
  );

  // Verify that the remediatedAfterDate filter was set
  assert.ok(capturedRemediationFilters, 'Remediation filters should be captured');
  assert.equal(
    capturedRemediationFilters.remediatedAfterDate,
    lastSyncDate,
    'Should filter remediations by last sync date'
  );

  // Verify vulnerability filters are empty (no date filter available)
  assert.deepEqual(
    capturedVulnerabilityFilters,
    {},
    'Vulnerability filters should be empty'
  );
});

test('syncData with incremental=true but no previous sync falls back to full sync', async () => {
  const store = new MemoryStore({
    credentials: {
      clientId: 'test-client',
      clientSecret: 'test-secret',
    },
  });

  const mockDb = createMockDatabase();

  // Mock getLastSuccessfulSyncDate to return null (no previous sync)
  mockDb.getLastSuccessfulSyncDate = () => null;

  let capturedRemediationFilters = null;

  const fakeApiConfig = {
    vulnerabilityBatches: [[{ id: 'vuln1', name: 'Test Vuln' }]],
    remediationBatches: [[{ id: 'rem1', vulnerabilityId: 'vuln1' }]],
  };

  const mockApiClient = createMockApiClient(fakeApiConfig);

  // Capture the filters passed to getRemediations
  const originalGetRemediations = mockApiClient.getRemediations.bind(mockApiClient);
  mockApiClient.getRemediations = async (options) => {
    capturedRemediationFilters = options.filters;
    return originalGetRemediations(options);
  };

  const service = new DataService({
    store,
    databaseFactory: () => mockDb,
    apiClientFactory: () => mockApiClient,
  });

  await service.syncData(
    () => {}, // progress callback
    () => {}, // incremental update callback
    () => {}, // state callback
    { incremental: true }
  );

  // Verify that no filters were set (full sync)
  assert.deepEqual(
    capturedRemediationFilters,
    {},
    'Should not use filters when no previous sync exists'
  );
});

test('syncData with incremental=false performs full sync', async () => {
  const store = new MemoryStore({
    credentials: {
      clientId: 'test-client',
      clientSecret: 'test-secret',
    },
  });

  const mockDb = createMockDatabase();

  // Even if there's a last sync date, it should not be used when incremental=false
  mockDb.getLastSuccessfulSyncDate = () => '2024-01-15T10:00:00.000Z';

  let capturedRemediationFilters = null;

  const fakeApiConfig = {
    vulnerabilityBatches: [[{ id: 'vuln1', name: 'Test Vuln' }]],
    remediationBatches: [[{ id: 'rem1', vulnerabilityId: 'vuln1' }]],
  };

  const mockApiClient = createMockApiClient(fakeApiConfig);

  // Capture the filters passed to getRemediations
  const originalGetRemediations = mockApiClient.getRemediations.bind(mockApiClient);
  mockApiClient.getRemediations = async (options) => {
    capturedRemediationFilters = options.filters;
    return originalGetRemediations(options);
  };

  const service = new DataService({
    store,
    databaseFactory: () => mockDb,
    apiClientFactory: () => mockApiClient,
  });

  await service.syncData(
    () => {}, // progress callback
    () => {}, // incremental update callback
    () => {}, // state callback
    { incremental: false }
  );

  // Verify that no filters were set (full sync)
  assert.deepEqual(
    capturedRemediationFilters,
    {},
    'Should not use filters when incremental=false'
  );
});
