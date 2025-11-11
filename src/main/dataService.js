const path = require('path');
const { app } = require('electron');
const Store = require('electron-store');
const { VantaApiClient } = require('../core/apiClient');
const { VulnerabilityDatabase } = require('../core/database');
const { formatStatistics } = require('../core/stats');

class DataService {
  constructor() {
    this.store = new Store({
      name: 'settings',
      defaults: {
        credentials: {
          clientId: '',
          clientSecret: '',
        },
      },
    });

    this.databasePath = path.join(app.getPath('userData'), 'storage', 'vanta_vulnerabilities.db');
    this.database = new VulnerabilityDatabase(this.databasePath);
    this.activeSync = null;
  }

  getCredentials() {
    return this.store.get('credentials', { clientId: '', clientSecret: '' });
  }

  updateCredentials(credentials) {
    const existing = this.getCredentials();
    const merged = { ...existing, ...credentials };
    this.store.set('credentials', merged);
    return merged;
  }

  async syncData(progressCallback) {
    if (this.activeSync) {
      throw new Error('A sync is already in progress.');
    }

    const credentials = this.getCredentials();
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new Error('Client ID and Client Secret must be configured before syncing.');
    }

    const apiClient = new VantaApiClient({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
    });

    const syncState = {
      cancelled: false,
    };

    this.activeSync = syncState;

    try {
      const vulnerabilities = [];
      const remediations = [];

      // Fetch vulnerabilities and remediations in parallel for faster sync
      await Promise.all([
        apiClient.getVulnerabilities({
          onBatch: async (batch) => {
            vulnerabilities.push(...batch);
            progressCallback?.({ type: 'vulnerabilities', count: vulnerabilities.length });
          },
        }),
        apiClient.getRemediations({
          onBatch: async (batch) => {
            remediations.push(...batch);
            progressCallback?.({ type: 'remediations', count: remediations.length });
          },
        }),
      ]);

      const vulnerabilityStats = this.database.storeVulnerabilities(vulnerabilities);
      const remediationStats = this.database.storeRemediations(remediations);

      return {
        vulnerabilities: vulnerabilityStats,
        remediations: remediationStats,
      };
    } finally {
      this.activeSync = null;
    }
  }

  getStatistics(filters) {
    const stats = this.database.getStatistics(filters);
    return formatStatistics(stats);
  }

  getVulnerabilities(options = {}) {
    const { filters = {}, limit = 100, offset = 0 } = options;
    const data = this.database.getVulnerabilities({ filters, limit, offset });
    const total = this.database.getVulnerabilityCount(filters);
    return { data, total };
  }

  getVulnerabilityDetails(id) {
    return this.database.getVulnerabilityDetails(id);
  }

  getRemediations(vulnerabilityId) {
    return this.database.getRemediationsForVulnerability(vulnerabilityId);
  }

  getSyncHistory() {
    return this.database.getSyncHistory();
  }

  getDatabasePath() {
    return this.databasePath;
  }
}

module.exports = { DataService };
