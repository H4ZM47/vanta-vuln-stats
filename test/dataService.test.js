const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

class FakeVulnerabilityDatabase {
  constructor() {
    this.vulnerabilities = new Map();
    this.remediations = new Map();
    this.syncHistory = [];
  }

  storeVulnerabilitiesBatch(rows) {
    let newCount = 0;
    let updatedCount = 0;
    let remediatedCount = 0;

    rows.forEach((row) => {
      if (!row?.id) {
        return;
      }
      const serialized = JSON.stringify(row);
      const isRemediated = Boolean(row?.deactivateMetadata?.deactivatedOnDate);
      const existing = this.vulnerabilities.get(row.id);

      if (!existing) {
        newCount += 1;
        if (isRemediated) {
          remediatedCount += 1;
        }
      } else if (existing.serialized !== serialized) {
        updatedCount += 1;
        if (!existing.isRemediated && isRemediated) {
          remediatedCount += 1;
        }
      }

      this.vulnerabilities.set(row.id, {
        record: JSON.parse(serialized),
        serialized,
        isRemediated,
      });
    });

    return { new: newCount, updated: updatedCount, remediated: remediatedCount, total: rows.length };
  }

  storeRemediationsBatch(rows) {
    let newCount = 0;
    let updatedCount = 0;

    rows.forEach((row) => {
      if (!row?.id) {
        return;
      }
      const serialized = JSON.stringify(row);
      const existing = this.remediations.get(row.id);
      if (!existing) {
        newCount += 1;
      } else if (existing.serialized !== serialized) {
        updatedCount += 1;
      }
      this.remediations.set(row.id, {
        record: JSON.parse(serialized),
        serialized,
      });
    });

    return { new: newCount, updated: updatedCount, total: rows.length };
  }

  getVulnerabilities({ limit = 100, offset = 0 } = {}) {
    const results = Array.from(this.vulnerabilities.values()).map((entry) => ({
      id: entry.record.id,
      name: entry.record.name,
      severity: entry.record.severity,
      integration_id: entry.record.integrationId ?? entry.record.integration_id ?? null,
      target_id: entry.record.targetId ?? entry.record.target_id ?? null,
      first_detected: entry.record.firstDetectedDate ?? entry.record.first_detected ?? null,
      last_detected: entry.record.lastDetectedDate ?? entry.record.last_detected ?? null,
      deactivated_on: entry.record.deactivateMetadata?.deactivatedOnDate ?? null,
    }));
    return results.slice(offset, offset + limit);
  }

  getVulnerabilityCount() {
    return this.vulnerabilities.size;
  }

  getVulnerabilityDetails(id) {
    return this.vulnerabilities.get(id)?.record ?? null;
  }

  getRemediationsForVulnerability(vulnerabilityId) {
    return Array.from(this.remediations.values())
      .map((entry) => entry.record)
      .filter((record) => record.vulnerabilityId === vulnerabilityId);
  }

  getStatistics() {
    return {
      totalCount: this.vulnerabilities.size,
      bySeverity: {},
      byIntegration: {},
      fixable: 0,
      notFixable: 0,
      active: 0,
      deactivated: 0,
      uniqueAssets: 0,
      uniqueCves: 0,
      averageCvssBySeverity: {},
      lastSync: null,
    };
  }

  recordSyncHistory(vulnerabilityStats, remediationStats) {
    this.syncHistory.push({
      sync_date: new Date().toISOString(),
      vulnerabilities_count: vulnerabilityStats.total,
      vulnerabilities_new: vulnerabilityStats.new,
      vulnerabilities_updated: vulnerabilityStats.updated,
      vulnerabilities_remediated: vulnerabilityStats.remediated,
      remediations_count: remediationStats.total,
      remediations_new: remediationStats.new,
      remediations_updated: remediationStats.updated,
      new_count: vulnerabilityStats.new,
      updated_count: vulnerabilityStats.updated,
      remediated_count: vulnerabilityStats.remediated,
    });
  }

  getSyncHistory() {
    return [...this.syncHistory];
  }

  close() {}
}

const databaseModulePath = path.resolve(__dirname, '..', 'src', 'core', 'database.js');
require.cache[databaseModulePath] = {
  id: databaseModulePath,
  filename: databaseModulePath,
  loaded: true,
  exports: { VulnerabilityDatabase: FakeVulnerabilityDatabase },
};

const { DataService } = require('../src/main/dataService');

class MemoryStore {
  constructor(initial = {}) {
    this.state = { ...initial };
  }

  get(key, defaults) {
    return this.state[key] ?? defaults;
  }

  set(key, value) {
    this.state[key] = value;
  }
}

class FakeApiClient {
  constructor({ vulnerabilityBatches, remediationBatches }) {
    this.vulnerabilityBatches = vulnerabilityBatches;
    this.remediationBatches = remediationBatches;
  }

  async getVulnerabilities({ onBatch }) {
    for (const batch of this.vulnerabilityBatches) {
      await onBatch(batch);
    }
    return this.vulnerabilityBatches.flat();
  }

  async getRemediations({ onBatch }) {
    for (const batch of this.remediationBatches) {
      await onBatch(batch);
    }
    return this.remediationBatches.flat();
  }
}

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
  assert.equal(history.length, 1);
  assert.equal(history[0].vulnerabilities_count, 3);
  assert.equal(history[0].vulnerabilities_remediated, 1);
  assert.equal(history[0].remediations_count, 2);

  assert.equal(stateChanges[0], 'running');
  assert.equal(stateChanges.at(-1), 'idle');

  service.database.close();
});
