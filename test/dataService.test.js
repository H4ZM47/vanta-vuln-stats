const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { FakeVulnerabilityDatabase, MemoryStore, FakeApiClient } = require('./testHelpers');
const { DataService } = require('../src/main/dataService');

test('syncData streams records, persists them, and records history', async () => {
  const store = new MemoryStore({
    credentials: {
      clientId: 'test-client',
      clientSecret: 'test-secret',
    },
  });

  const fakeApiConfig = {
    vulnerabilityBatches: [
      [
        { id: 'v-1', name: 'SSH vuln', severity: 'critical' },
        { id: 'v-2', name: 'Kernel CVE', severity: 'high', deactivateMetadata: { deactivatedOnDate: '2024-01-10' } },
      ],
      [{ id: 'v-3', name: 'Library bug', severity: 'medium' }],
    ],
    remediationBatches: [
      [
        { id: 'r-1', vulnerabilityId: 'v-1', status: 'open' },
        { id: 'r-2', vulnerabilityId: 'v-2', status: 'closed' },
      ],
    ],
  };

  const progressEvents = [];
  const incrementalEvents = [];
  const stateChanges = [];

  const service = new DataService({
    store,
    databasePath: path.join(__dirname, 'fake.db'),
    apiClientFactory: () => new FakeApiClient(fakeApiConfig),
    databaseFactory: () => new FakeVulnerabilityDatabase(),
  });

  const result = await service.syncData(
    (progress) => progressEvents.push(progress),
    (incremental) => incrementalEvents.push(incremental),
    (state) => stateChanges.push(state),
  );

  assert.equal(result.vulnerabilities.total, 3);
  assert.equal(result.vulnerabilities.remediated, 1);
  assert.equal(result.remediations.total, 2);

  const vulnProgress = progressEvents.filter((event) => event.type === 'vulnerabilities').at(-1);
  const remediationProgress = progressEvents.filter((event) => event.type === 'remediations').at(-1);
  assert.equal(vulnProgress.count, 3);
  assert.equal(remediationProgress.count, 2);

  const vulnIncrementals = incrementalEvents.filter((event) => event.type === 'vulnerabilities');
  const remediationIncrementals = incrementalEvents.filter((event) => event.type === 'remediations');
  assert.ok(vulnIncrementals.length >= 1);
  assert.ok(remediationIncrementals.length >= 1);
  assert.equal(vulnIncrementals.at(-1).stats.total, 3);
  assert.equal(vulnIncrementals.at(-1).flushed, 3);

  const list = service.getVulnerabilities({ limit: 10, offset: 0 });
  assert.equal(list.total, 3);

  const history = service.getSyncHistory();
  // With verbose logging, we now have multiple history entries (start, batch, flush, complete, etc.)
  assert.ok(history.length > 1, 'Should have multiple history entries with verbose logging');

  // Check that we have the expected event types
  const startEvents = history.filter(e => e.event_type === 'start');
  const completeEvents = history.filter(e => e.event_type === 'complete');
  assert.equal(startEvents.length, 1, 'Should have one start event');
  assert.equal(completeEvents.length, 1, 'Should have one complete event');

  // The complete event should have the final stats
  const completeEvent = completeEvents[0];
  assert.equal(completeEvent.vulnerabilities_count, 3);
  assert.equal(completeEvent.vulnerabilities_remediated, 1);
  assert.equal(completeEvent.remediations_count, 2);

  // The old recordSyncHistory entry should also exist
  const legacyEntry = history.find(e => !e.event_type && e.vulnerabilities_count === 3);
  assert.ok(legacyEntry, 'Should have legacy sync history entry from recordSyncHistory');

  assert.equal(stateChanges[0], 'running');
  assert.equal(stateChanges.at(-1), 'idle');

  service.database.close();
});

test('constructor validates factory functions', () => {
  const store = new MemoryStore({
    credentials: { clientId: 'test', clientSecret: 'secret' },
  });

  // Should throw for non-function databaseFactory
  assert.throws(
    () => new DataService({ store, databaseFactory: 'not-a-function' }),
    { name: 'TypeError', message: 'databaseFactory must be a function' }
  );

  // Should throw for non-function apiClientFactory
  assert.throws(
    () => new DataService({ store, apiClientFactory: 123 }),
    { name: 'TypeError', message: 'apiClientFactory must be a function' }
  );

  // Should succeed with valid factories
  const service = new DataService({
    store,
    databaseFactory: () => new FakeVulnerabilityDatabase(),
    apiClientFactory: () => new FakeApiClient({ vulnerabilityBatches: [], remediationBatches: [] }),
  });
  assert.ok(service);
  service.database.close();
});

test('syncData throws error when credentials are missing', async () => {
  const store = new MemoryStore({
    credentials: { clientId: '', clientSecret: '' },
  });

  const service = new DataService({
    store,
    databaseFactory: () => new FakeVulnerabilityDatabase(),
  });

  await assert.rejects(
    async () => await service.syncData(),
    { message: 'Client ID and Client Secret must be configured before syncing.' }
  );

  service.database.close();
});

test('syncData throws error when sync is already in progress', async () => {
  const store = new MemoryStore({
    credentials: { clientId: 'test', clientSecret: 'secret' },
  });

  const fakeApiConfig = {
    vulnerabilityBatches: [[{ id: 'v-1', name: 'Test' }]],
    remediationBatches: [],
  };

  const service = new DataService({
    store,
    databaseFactory: () => new FakeVulnerabilityDatabase(),
    apiClientFactory: () => new FakeApiClient(fakeApiConfig),
  });

  // Start a sync (don't await)
  const syncPromise = service.syncData();

  // Try to start another sync while first is running
  await assert.rejects(
    async () => await service.syncData(),
    { message: 'A sync is already in progress.' }
  );

  // Wait for first sync to complete
  await syncPromise;
  service.database.close();
});

test('syncData handles database flush errors', async () => {
  const store = new MemoryStore({
    credentials: { clientId: 'test', clientSecret: 'secret' },
  });

  // Create a database that throws on batch store
  class ErrorDatabase extends FakeVulnerabilityDatabase {
    storeVulnerabilitiesBatch() {
      throw new Error('Database write failed');
    }
  }

  const fakeApiConfig = {
    vulnerabilityBatches: [[{ id: 'v-1', name: 'Test' }]],
    remediationBatches: [],
  };

  const service = new DataService({
    store,
    databaseFactory: () => new ErrorDatabase(),
    apiClientFactory: () => new FakeApiClient(fakeApiConfig),
    batchSize: 1, // Force immediate flush
  });

  await assert.rejects(
    async () => await service.syncData(),
    { message: /Failed to flush vulnerability buffer/ }
  );

  service.database.close();
});
