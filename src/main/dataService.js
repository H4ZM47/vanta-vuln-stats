const path = require('path');
let electronApp = null;
try {
  ({ app: electronApp } = require('electron'));
} catch (error) {
  // Running outside of Electron (e.g., during tests)
  electronApp = null;
}
const Store = require('electron-store');
const { VantaApiClient } = require('../core/apiClient');
const { VulnerabilityDatabase } = require('../core/database');
const { formatStatistics } = require('../core/stats');

/**
 * Service for managing vulnerability data synchronization and storage.
 * Supports dependency injection for testing and custom configurations.
 */
class DataService {
  /**
   * Creates a new DataService instance.
   *
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.store] - Custom store implementation for settings
   * @param {string} [options.databasePath] - Custom path for the database file
   * @param {Object} [options.appInstance] - Custom Electron app instance
   * @param {Function} [options.databaseFactory] - Factory function to create database instances
   * @param {Function} [options.apiClientFactory] - Factory function to create API client instances
   * @param {string} [options.userDataPath] - Custom user data directory path
   * @param {number} [options.batchSize=1000] - Number of records to buffer before flushing to database
   * @throws {TypeError} If factory functions are not functions
   */
  constructor(options = {}) {
    const {
      store,
      databasePath,
      appInstance,
      databaseFactory,
      apiClientFactory,
      userDataPath,
      batchSize,
    } = options;

    // Validate factory functions if provided
    if (databaseFactory !== undefined && typeof databaseFactory !== 'function') {
      throw new TypeError('databaseFactory must be a function');
    }
    if (apiClientFactory !== undefined && typeof apiClientFactory !== 'function') {
      throw new TypeError('apiClientFactory must be a function');
    }

    this.store = store ?? new Store({
      name: 'settings',
      defaults: {
        credentials: {
          clientId: '',
          clientSecret: '',
        },
      },
    });

    this.app = appInstance ?? electronApp;

    const defaultUserDataPath =
      userDataPath ??
      (this.app?.getPath ? this.app.getPath('userData') : path.join(process.cwd(), 'user-data'));

    this.databasePath = databasePath ?? path.join(defaultUserDataPath, 'storage', 'vanta_vulnerabilities.db');
    const createDatabase = databaseFactory ?? ((filePath) => new VulnerabilityDatabase(filePath));
    this.database = createDatabase(this.databasePath);
    this.createApiClient = apiClientFactory ?? ((credentials) => new VantaApiClient(credentials));
    this.batchSize = batchSize ?? 1000;
    this.activeSync = null;
    this.syncState = {
      state: 'idle', // idle, running, paused, stopping
      abortController: null,
      pausePromiseResolve: null,
      isPaused: false,
    };
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

  /**
   * Synchronizes vulnerability and remediation data from the Vanta API.
   * Fetches data in batches, persists to database, and provides progress updates.
   *
   * @param {Function} [progressCallback] - Called with progress updates: {type: string, count: number}
   * @param {Function} [onIncrementalUpdate] - Called when batches are flushed: {type: string, stats: Object, flushed: number}
   * @param {Function} [stateCallback] - Called with state changes: 'running' | 'paused' | 'idle'
   * @returns {Promise<{vulnerabilities: Object, remediations: Object}>} Statistics about synced data
   * @throws {Error} If a sync is already in progress
   * @throws {Error} If credentials are not configured
   * @throws {Error} If sync is stopped by user
   * @throws {Error} If database flush operations fail
   */
  async syncData(progressCallback, onIncrementalUpdate, stateCallback) {
    if (this.activeSync) {
      throw new Error('A sync is already in progress.');
    }

    const credentials = this.getCredentials();
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new Error('Client ID and Client Secret must be configured before syncing.');
    }

    const apiClient = this.createApiClient({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
    });

    const syncState = {
      cancelled: false,
    };

    this.activeSync = syncState;
    this.syncState.state = 'running';
    this.syncState.abortController = new AbortController();
    this.syncState.isPaused = false;
    stateCallback?.('running');

    try {
      const vulnerabilities = [];
      const remediations = [];

      let vulnerabilitiesStats = { new: 0, updated: 0, remediated: 0, total: 0 };
      let remediationsStats = { new: 0, updated: 0, total: 0 };
      let processedVulnerabilities = 0;
      let processedRemediations = 0;

      // Helper to check for pause/stop
      const checkPauseOrStop = async () => {
        // Check if stopping
        if (this.syncState.abortController.signal.aborted) {
          throw new Error('Sync stopped by user');
        }

        // Check if paused
        if (this.syncState.isPaused) {
          stateCallback?.('paused');
          // Wait until resumed or stopped
          await new Promise((resolve) => {
            this.syncState.pausePromiseResolve = resolve;
          });
          stateCallback?.('running');
        }
      };

      const flushVulnerabilityBuffer = () => {
        if (!vulnerabilities.length) {
          return;
        }
        try {
          const stats = this.database.storeVulnerabilitiesBatch(vulnerabilities);
          vulnerabilitiesStats.new += stats.new;
          vulnerabilitiesStats.updated += stats.updated;
          vulnerabilitiesStats.remediated += stats.remediated;
          vulnerabilitiesStats.total += stats.total;

          onIncrementalUpdate?.({
            type: 'vulnerabilities',
            stats: { ...vulnerabilitiesStats },
            flushed: stats.total,
          });

          vulnerabilities.length = 0;
        } catch (error) {
          throw new Error(`Failed to flush vulnerability buffer: ${error.message}`);
        }
      };

      const flushRemediationBuffer = () => {
        if (!remediations.length) {
          return;
        }
        try {
          const stats = this.database.storeRemediationsBatch(remediations);
          remediationsStats.new += stats.new;
          remediationsStats.updated += stats.updated;
          remediationsStats.total += stats.total;

          onIncrementalUpdate?.({
            type: 'remediations',
            stats: { ...remediationsStats },
            flushed: stats.total,
          });

          remediations.length = 0;
        } catch (error) {
          throw new Error(`Failed to flush remediation buffer: ${error.message}`);
        }
      };

      // Fetch vulnerabilities and remediations in parallel for faster sync
      await Promise.all([
        apiClient.getVulnerabilities({
          onBatch: async (batch) => {
            await checkPauseOrStop();
            vulnerabilities.push(...batch);
            processedVulnerabilities += batch.length;
            progressCallback?.({ type: 'vulnerabilities', count: processedVulnerabilities });

            // Flush to database when buffer reaches batch size
            if (vulnerabilities.length >= this.batchSize) {
              flushVulnerabilityBuffer();
            }
          },
          signal: this.syncState.abortController.signal,
        }),
        apiClient.getRemediations({
          onBatch: async (batch) => {
            await checkPauseOrStop();
            remediations.push(...batch);
            processedRemediations += batch.length;
            progressCallback?.({ type: 'remediations', count: processedRemediations });

            // Flush to database when buffer reaches batch size
            if (remediations.length >= this.batchSize) {
              flushRemediationBuffer();
            }
          },
          signal: this.syncState.abortController.signal,
        }),
      ]);

      // Store any remaining records
      if (vulnerabilities.length > 0) {
        flushVulnerabilityBuffer();
      }

      if (remediations.length > 0) {
        flushRemediationBuffer();
      }

      // Record combined sync history
      this.database.recordSyncHistory(vulnerabilitiesStats, remediationsStats);

      return {
        vulnerabilities: vulnerabilitiesStats,
        remediations: remediationsStats,
      };
    } catch (error) {
      if (error.message === 'Sync stopped by user') {
        stateCallback?.('idle');
        throw error;
      }
      throw error;
    } finally {
      this.activeSync = null;
      this.syncState.state = 'idle';
      this.syncState.abortController = null;
      this.syncState.pausePromiseResolve = null;
      this.syncState.isPaused = false;
      stateCallback?.('idle');
    }
  }

  pauseSync() {
    if (this.syncState.state !== 'running') {
      throw new Error('No active sync to pause.');
    }
    this.syncState.isPaused = true;
    this.syncState.state = 'paused';
    return { success: true };
  }

  resumeSync() {
    if (this.syncState.state !== 'paused') {
      throw new Error('Sync is not paused.');
    }
    this.syncState.isPaused = false;
    this.syncState.state = 'running';
    if (this.syncState.pausePromiseResolve) {
      this.syncState.pausePromiseResolve();
      this.syncState.pausePromiseResolve = null;
    }
    return { success: true };
  }

  stopSync() {
    if (!this.activeSync) {
      throw new Error('No active sync to stop.');
    }
    this.syncState.state = 'stopping';

    // If paused, resolve the pause promise first
    if (this.syncState.pausePromiseResolve) {
      this.syncState.pausePromiseResolve();
      this.syncState.pausePromiseResolve = null;
    }

    // Abort the sync
    if (this.syncState.abortController) {
      this.syncState.abortController.abort();
    }

    return { success: true };
  }

  getSyncState() {
    return {
      state: this.syncState.state,
      hasActiveSync: !!this.activeSync,
    };
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
