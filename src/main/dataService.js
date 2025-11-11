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

  async syncData(progressCallback, onIncrementalUpdate, stateCallback) {
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
    this.syncState.state = 'running';
    this.syncState.abortController = new AbortController();
    this.syncState.isPaused = false;
    stateCallback?.('running');

    try {
      const vulnerabilities = [];
      const remediations = [];
      const BATCH_SIZE = 1000;

      let vulnerabilitiesStats = { new: 0, updated: 0, remediated: 0, total: 0 };
      let remediationsStats = { new: 0, updated: 0, total: 0 };

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

      // Fetch vulnerabilities and remediations in parallel for faster sync
      await Promise.all([
        apiClient.getVulnerabilities({
          onBatch: async (batch) => {
            await checkPauseOrStop();
            vulnerabilities.push(...batch);
            progressCallback?.({ type: 'vulnerabilities', count: vulnerabilities.length });

            // Flush to database every 1000 records
            if (vulnerabilities.length >= BATCH_SIZE) {
              const stats = this.database.storeVulnerabilitiesBatch(vulnerabilities);
              vulnerabilitiesStats.new += stats.new;
              vulnerabilitiesStats.updated += stats.updated;
              vulnerabilitiesStats.remediated += stats.remediated;
              vulnerabilitiesStats.total += stats.total;

              // Notify about incremental update
              onIncrementalUpdate?.({
                type: 'vulnerabilities',
                stats: { ...vulnerabilitiesStats },
                flushed: vulnerabilities.length,
              });

              vulnerabilities.length = 0; // Clear the buffer
            }
          },
          signal: this.syncState.abortController.signal,
        }),
        apiClient.getRemediations({
          onBatch: async (batch) => {
            await checkPauseOrStop();
            remediations.push(...batch);
            progressCallback?.({ type: 'remediations', count: remediations.length });

            // Flush to database every 1000 records
            if (remediations.length >= BATCH_SIZE) {
              const stats = this.database.storeRemediationsBatch(remediations);
              remediationsStats.new += stats.new;
              remediationsStats.updated += stats.updated;
              remediationsStats.total += stats.total;

              // Notify about incremental update
              onIncrementalUpdate?.({
                type: 'remediations',
                stats: { ...remediationsStats },
                flushed: remediations.length,
              });

              remediations.length = 0; // Clear the buffer
            }
          },
          signal: this.syncState.abortController.signal,
        }),
      ]);

      // Store any remaining records
      if (vulnerabilities.length > 0) {
        const stats = this.database.storeVulnerabilitiesBatch(vulnerabilities);
        vulnerabilitiesStats.new += stats.new;
        vulnerabilitiesStats.updated += stats.updated;
        vulnerabilitiesStats.remediated += stats.remediated;
        vulnerabilitiesStats.total += stats.total;
      }

      if (remediations.length > 0) {
        const stats = this.database.storeRemediationsBatch(remediations);
        remediationsStats.new += stats.new;
        remediationsStats.updated += stats.updated;
        remediationsStats.total += stats.total;
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
    const { filters = {}, limit = 100, offset = 0, sortColumn = 'first_detected', sortDirection = 'desc' } = options;
    const data = this.database.getVulnerabilities({ filters, limit, offset, sortColumn, sortDirection });
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
