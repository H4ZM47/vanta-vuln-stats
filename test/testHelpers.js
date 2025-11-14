/**
 * Test utilities and fake implementations for DataService testing.
 * Provides in-memory implementations of database and API client for isolated testing.
 */

/**
 * In-memory fake implementation of VulnerabilityDatabase for testing.
 * Maintains state in memory using Maps without any disk I/O.
 */
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
      const isRemediated = Boolean(row?.deactivateMetadata?.deactivatedOnDate);
      const existing = this.vulnerabilities.get(row.id);

      if (!existing) {
        newCount += 1;
        if (isRemediated) {
          remediatedCount += 1;
        }
      } else {
        const existingData = JSON.stringify(existing.record);
        const newData = JSON.stringify(row);
        if (existingData !== newData) {
          updatedCount += 1;
          if (!existing.isRemediated && isRemediated) {
            remediatedCount += 1;
          }
        }
      }

      this.vulnerabilities.set(row.id, {
        record: { ...row },
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
      const existing = this.remediations.get(row.id);
      if (!existing) {
        newCount += 1;
      } else {
        const existingData = JSON.stringify(existing.record);
        const newData = JSON.stringify(row);
        if (existingData !== newData) {
          updatedCount += 1;
        }
      }
      this.remediations.set(row.id, {
        record: { ...row },
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

  getLastSuccessfulSyncDate() {
    // Find the last sync event with event_type = 'complete'
    const completedSyncs = this.syncHistory.filter((entry) => entry.event_type === 'complete');
    if (completedSyncs.length === 0) {
      return null;
    }
    return completedSyncs[completedSyncs.length - 1].sync_date;
  }

  logSyncEvent(eventType, message, options = {}) {
    // Log verbose sync events for testing
    this.syncHistory.push({
      sync_date: new Date().toISOString(),
      event_type: eventType,
      message: message,
      details: options.details ? JSON.stringify(options.details) : null,
      vulnerabilities_count: options.vulnerabilityStats?.total ?? null,
      vulnerabilities_new: options.vulnerabilityStats?.new ?? null,
      vulnerabilities_updated: options.vulnerabilityStats?.updated ?? null,
      vulnerabilities_remediated: options.vulnerabilityStats?.remediated ?? null,
      remediations_count: options.remediationStats?.total ?? null,
      remediations_new: options.remediationStats?.new ?? null,
      remediations_updated: options.remediationStats?.updated ?? null,
      new_count: options.vulnerabilityStats?.new ?? null,
      updated_count: options.vulnerabilityStats?.updated ?? null,
      remediated_count: options.vulnerabilityStats?.remediated ?? null,
    });
  }

  close() {}
}

/**
 * In-memory store implementation for testing.
 */
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

/**
 * Fake API client that returns predetermined batches of data.
 * Useful for testing different sync scenarios without making real API calls.
 */
class FakeApiClient {
  constructor({ vulnerabilityBatches = [], remediationBatches = [] }) {
    this.vulnerabilityBatches = vulnerabilityBatches;
    this.remediationBatches = remediationBatches;
  }

  async getVulnerabilities({ onBatch, filters = {} }) {
    for (const batch of this.vulnerabilityBatches) {
      await onBatch(batch);
    }
    return this.vulnerabilityBatches.flat();
  }

  async getRemediations({ onBatch, filters = {} }) {
    for (const batch of this.remediationBatches) {
      await onBatch(batch);
    }
    return this.remediationBatches.flat();
  }
}

/**
 * Helper function to create a mock database instance
 */
function createMockDatabase() {
  return new FakeVulnerabilityDatabase();
}

/**
 * Helper function to create a mock API client instance
 */
function createMockApiClient(config) {
  return new FakeApiClient(config);
}

module.exports = {
  FakeVulnerabilityDatabase,
  MemoryStore,
  FakeApiClient,
  createMockDatabase,
  createMockApiClient,
};
