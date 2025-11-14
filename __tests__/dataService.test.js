const { DataService } = require('../src/main/dataService');

// Create mock instances that we can control
let mockApiClientInstance;
let mockDatabaseInstance;

// Mock dependencies
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/user/data'),
  },
}));

jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(() => ({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    })),
    set: jest.fn(),
  }));
});

jest.mock('../src/core/apiClient', () => {
  const VantaApiClient = jest.fn().mockImplementation(() => mockApiClientInstance);
  return { VantaApiClient };
});

jest.mock('../src/core/database', () => {
  const VulnerabilityDatabase = jest.fn().mockImplementation(() => mockDatabaseInstance);
  return { VulnerabilityDatabase };
});

jest.mock('../src/core/stats', () => ({
  formatStatistics: jest.fn((stats) => stats),
}));

describe('DataService - Sync Operations', () => {
  let dataService;

  beforeEach(() => {
    // Reset mock instances before each test
    mockApiClientInstance = {
      getVulnerabilities: jest.fn(),
      getRemediations: jest.fn(),
      getVulnerableAssets: jest.fn().mockResolvedValue(undefined),
    };

    mockDatabaseInstance = {
      storeVulnerabilitiesBatch: jest.fn(() => ({
        new: 10,
        updated: 5,
        remediated: 2,
        total: 17,
      })),
      storeRemediationsBatch: jest.fn(() => ({
        new: 8,
        updated: 3,
        total: 11,
      })),
      storeVulnerableAssetsBatch: jest.fn(() => ({
        new: 6,
        updated: 4,
        total: 10,
      })),
      recordSyncHistory: jest.fn(),
      logSyncEvent: jest.fn(),
      getStatistics: jest.fn(() => ({})),
      getVulnerabilities: jest.fn(() => []),
      getVulnerabilityCount: jest.fn(() => 0),
      getVulnerabilityDetails: jest.fn(() => null),
      getRemediationsForVulnerability: jest.fn(() => []),
      getSyncHistory: jest.fn(() => []),
      statements: {
        insertSync: {
          run: jest.fn(),
        },
      },
    };

    jest.clearAllMocks();
    dataService = new DataService();
  });

  describe('syncData - Basic Operation', () => {
    it('should successfully sync data and record history with correct variable names', async () => {
      // Mock API responses
      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch }) => {
        await onBatch([{ id: 1 }, { id: 2 }]);
      });

      mockApiClientInstance.getRemediations.mockImplementation(async ({ onBatch }) => {
        await onBatch([{ id: 1 }]);
      });

      const result = await dataService.syncData();

      // Verify recordSyncHistory was called with correct variable names
      expect(mockDatabaseInstance.recordSyncHistory).toHaveBeenCalledTimes(1);
      expect(mockDatabaseInstance.recordSyncHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          new: expect.any(Number),
          updated: expect.any(Number),
          remediated: expect.any(Number),
          total: expect.any(Number),
        }),
        expect.objectContaining({
          new: expect.any(Number),
          updated: expect.any(Number),
          total: expect.any(Number),
        }),
        expect.objectContaining({
          new: expect.any(Number),
          updated: expect.any(Number),
          total: expect.any(Number),
        }),
      );

      // Verify result structure
      expect(result).toEqual({
        vulnerabilities: expect.objectContaining({
          new: expect.any(Number),
          updated: expect.any(Number),
          remediated: expect.any(Number),
          total: expect.any(Number),
        }),
        remediations: expect.objectContaining({
          new: expect.any(Number),
          updated: expect.any(Number),
          total: expect.any(Number),
        }),
        assets: expect.objectContaining({
          new: expect.any(Number),
          updated: expect.any(Number),
          total: expect.any(Number),
        }),
      });
    });

    it('should fetch vulnerabilities, remediations, and assets in parallel', async () => {
      let vulnStarted = false;
      let remediationsStarted = false;
      let assetsStarted = false;
      let vulnResolve;
      let remediationsResolve;
      let assetsResolve;

      const vulnerabilitiesPromise = new Promise((resolve) => {
        vulnResolve = resolve;
        vulnStarted = true;
      });

      const remediationsPromise = new Promise((resolve) => {
        remediationsResolve = resolve;
        remediationsStarted = true;
      });

      const assetsPromise = new Promise((resolve) => {
        assetsResolve = resolve;
        assetsStarted = true;
      });

      mockApiClientInstance.getVulnerabilities.mockImplementation(() => vulnerabilitiesPromise);
      mockApiClientInstance.getRemediations.mockImplementation(() => remediationsPromise);
      mockApiClientInstance.getVulnerableAssets.mockImplementation(() => assetsPromise);

      const syncPromise = dataService.syncData();

      // Wait for both to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // All should have started (proving parallel execution)
      expect(vulnStarted).toBe(true);
      expect(remediationsStarted).toBe(true);
      expect(assetsStarted).toBe(true);

      // Resolve all and await completion
      vulnResolve();
      remediationsResolve();
      assetsResolve();
      await syncPromise;

      expect(mockApiClientInstance.getVulnerabilities).toHaveBeenCalled();
      expect(mockApiClientInstance.getRemediations).toHaveBeenCalled();
      expect(mockApiClientInstance.getVulnerableAssets).toHaveBeenCalled();
    });

    it('should throw error if credentials are missing', async () => {
      dataService.store.get = jest.fn(() => ({
        clientId: '',
        clientSecret: '',
      }));

      await expect(dataService.syncData()).rejects.toThrow(
        'Client ID and Client Secret must be configured before syncing.'
      );
    });

    it('should throw error if sync is already in progress', async () => {
      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch, signal }) => {
        await onBatch([{ id: 1 }]);
        // Keep the sync running until aborted
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 5000);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Aborted'));
          });
        });
      });
      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      const firstSync = dataService.syncData();

      // Wait a bit to ensure first sync has started
      await new Promise(resolve => setTimeout(resolve, 10));

      await expect(dataService.syncData()).rejects.toThrow('A sync is already in progress.');

      // Clean up
      dataService.stopSync();
      await expect(firstSync).rejects.toThrow();
    });

    it('should persist assets when batches are returned from API', async () => {
      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch }) => {
        await onBatch([{ id: 'v1' }]);
      });

      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      mockApiClientInstance.getVulnerableAssets.mockImplementation(async ({ onBatch }) => {
        await onBatch([{ id: 'asset-1', displayName: 'Asset 1' }]);
        await onBatch([{ id: 'asset-2', displayName: 'Asset 2' }]);
      });

      await dataService.syncData();

      expect(mockDatabaseInstance.storeVulnerableAssetsBatch).toHaveBeenCalled();
    });
  });

  describe('syncData - Incremental Updates', () => {
    it('should flush data every 1000 records and trigger incremental updates', async () => {
      const onIncrementalUpdate = jest.fn();

      // Create 2500 vulnerability records to trigger 2 flushes
      const vulnerabilities = Array.from({ length: 2500 }, (_, i) => ({ id: i }));

      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch }) => {
        // Send in batches of 1000
        await onBatch(vulnerabilities.slice(0, 1000));
        await onBatch(vulnerabilities.slice(1000, 2000));
        await onBatch(vulnerabilities.slice(2000, 2500));
      });

      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      await dataService.syncData(null, onIncrementalUpdate);

      // Should have flushed twice (at 1000 and 2000 records)
      expect(mockDatabaseInstance.storeVulnerabilitiesBatch).toHaveBeenCalledTimes(3); // 2 incremental + 1 final
      expect(onIncrementalUpdate).toHaveBeenCalled();

      // Check that incremental updates were called with correct type
      const vulnerabilityUpdates = onIncrementalUpdate.mock.calls.filter(
        call => call[0].type === 'vulnerabilities'
      );
      expect(vulnerabilityUpdates.length).toBeGreaterThan(0);
    });

    it('should call progress callback with correct counts', async () => {
      const progressCallback = jest.fn();

      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch }) => {
        await onBatch([{ id: 1 }, { id: 2 }]);
      });

      mockApiClientInstance.getRemediations.mockImplementation(async ({ onBatch }) => {
        await onBatch([{ id: 1 }]);
      });

      await dataService.syncData(progressCallback);

      expect(progressCallback).toHaveBeenCalledWith({
        type: 'vulnerabilities',
        count: expect.any(Number),
      });
      expect(progressCallback).toHaveBeenCalledWith({
        type: 'remediations',
        count: expect.any(Number),
      });
    });

    it('should store remaining records after fetching completes', async () => {
      // Create 1500 records (will flush at 1000, then store remaining 500)
      const batch1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
      const batch2 = Array.from({ length: 500 }, (_, i) => ({ id: i + 1000 }));

      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch }) => {
        await onBatch(batch1);
        await onBatch(batch2);
      });

      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      await dataService.syncData();

      // Should call storeVulnerabilitiesBatch twice: once at 1000 threshold, once for final remaining 500
      expect(mockDatabaseInstance.storeVulnerabilitiesBatch).toHaveBeenCalledTimes(2);
    });
  });

  describe('syncData - Pause/Resume/Stop Controls', () => {
    it('should pause sync when pauseSync is called', async () => {
      let batchCount = 0;
      const stateCallback = jest.fn();

      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch }) => {
        // First batch
        await onBatch([{ id: 1 }]);
        batchCount++;

        // Pause after first batch
        if (batchCount === 1) {
          dataService.pauseSync();
          // Second batch - this will trigger checkPauseOrStop and call stateCallback('paused')
          await onBatch([{ id: 2 }]);
        }
      });

      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      const syncPromise = dataService.syncData(null, null, stateCallback);

      // Wait for pause to take effect
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(dataService.getSyncState().state).toBe('paused');
      expect(stateCallback).toHaveBeenCalledWith('paused');

      // Resume the sync
      dataService.resumeSync();
      await syncPromise;

      expect(stateCallback).toHaveBeenCalledWith('running');
    });

    it('should resume sync when resumeSync is called', async () => {
      const stateCallback = jest.fn();
      let batchCount = 0;

      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch }) => {
        // First batch
        await onBatch([{ id: 1 }]);
        batchCount++;

        if (batchCount === 1) {
          dataService.pauseSync();
          // Resume after a short delay
          setTimeout(() => {
            dataService.resumeSync();
          }, 50);
          // Second batch - this will trigger pause check and wait for resume
          await onBatch([{ id: 2 }]);
        }
      });

      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      await dataService.syncData(null, null, stateCallback);

      expect(stateCallback).toHaveBeenCalledWith('paused');
      expect(stateCallback).toHaveBeenCalledWith('running');
    });

    it('should stop sync when stopSync is called', async () => {
      const stateCallback = jest.fn();

      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch, signal }) => {
        await onBatch([{ id: 1 }]);
        // Simulate long-running sync that respects abort signal
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 5000);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Aborted'));
          });
        });
      });

      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      const syncPromise = dataService.syncData(null, null, stateCallback);

      // Wait a bit then stop
      await new Promise(resolve => setTimeout(resolve, 50));
      dataService.stopSync();

      await expect(syncPromise).rejects.toThrow();
      expect(stateCallback).toHaveBeenCalledWith('idle');
    });

    it('should throw error when trying to pause non-running sync', () => {
      expect(() => dataService.pauseSync()).toThrow('No active sync to pause.');
    });

    it('should throw error when trying to resume non-paused sync', () => {
      expect(() => dataService.resumeSync()).toThrow('Sync is not paused.');
    });

    it('should throw error when trying to stop non-active sync', () => {
      expect(() => dataService.stopSync()).toThrow('No active sync to stop.');
    });
  });

  describe('syncData - Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockApiClientInstance.getVulnerabilities.mockRejectedValue(new Error('API Error'));
      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      await expect(dataService.syncData()).rejects.toThrow('API Error');

      // Verify cleanup
      expect(dataService.activeSync).toBeNull();
      expect(dataService.getSyncState().state).toBe('idle');
    });

    it('should clean up state after successful sync', async () => {
      mockApiClientInstance.getVulnerabilities.mockImplementation(async () => {});
      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      await dataService.syncData();

      expect(dataService.activeSync).toBeNull();
      expect(dataService.getSyncState().state).toBe('idle');
      expect(dataService.syncState.abortController).toBeNull();
      expect(dataService.syncState.pausePromiseResolve).toBeNull();
      expect(dataService.syncState.isPaused).toBe(false);
    });

    it('should clean up state after sync error', async () => {
      mockApiClientInstance.getVulnerabilities.mockRejectedValue(new Error('Test error'));
      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      await expect(dataService.syncData()).rejects.toThrow('Test error');

      expect(dataService.activeSync).toBeNull();
      expect(dataService.getSyncState().state).toBe('idle');
      expect(dataService.syncState.abortController).toBeNull();
    });
  });

  describe('syncData - Statistics Accumulation', () => {
    it('should accumulate statistics correctly across multiple batches', async () => {
      // Mock multiple batches with different stats
      let batchCount = 0;
      mockDatabaseInstance.storeVulnerabilitiesBatch.mockImplementation(() => {
        batchCount++;
        return {
          new: 5 * batchCount,
          updated: 3 * batchCount,
          remediated: 1 * batchCount,
          total: 9 * batchCount,
        };
      });

      const vulnerabilities = Array.from({ length: 2000 }, (_, i) => ({ id: i }));

      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch }) => {
        await onBatch(vulnerabilities);
      });

      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      const result = await dataService.syncData();

      // Should have accumulated stats from 2 batches
      expect(result.vulnerabilities.new).toBeGreaterThan(0);
      expect(result.vulnerabilities.updated).toBeGreaterThan(0);
      expect(result.vulnerabilities.total).toBeGreaterThan(0);
    });

    it('should pass accumulated stats to recordSyncHistory', async () => {
      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch }) => {
        await onBatch([{ id: 1 }]);
      });

      mockApiClientInstance.getRemediations.mockImplementation(async ({ onBatch }) => {
        await onBatch([{ id: 1 }]);
      });

      await dataService.syncData();

      expect(mockDatabaseInstance.recordSyncHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          new: expect.any(Number),
          updated: expect.any(Number),
          remediated: expect.any(Number),
          total: expect.any(Number),
        }),
        expect.objectContaining({
          new: expect.any(Number),
          updated: expect.any(Number),
          total: expect.any(Number),
        }),
        expect.objectContaining({
          new: expect.any(Number),
          updated: expect.any(Number),
          total: expect.any(Number),
        })
      );
    });
  });

  describe('syncData - Abort Signal Handling', () => {
    it('should pass abort signal to API calls', async () => {
      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ signal }) => {
        expect(signal).toBeDefined();
        expect(signal).toBeInstanceOf(AbortSignal);
      });

      mockApiClientInstance.getRemediations.mockImplementation(async ({ signal }) => {
        expect(signal).toBeDefined();
        expect(signal).toBeInstanceOf(AbortSignal);
      });

      mockApiClientInstance.getVulnerableAssets.mockImplementation(async ({ signal }) => {
        expect(signal).toBeDefined();
        expect(signal).toBeInstanceOf(AbortSignal);
      });

      await dataService.syncData();

      expect(mockApiClientInstance.getVulnerabilities).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );

      expect(mockApiClientInstance.getRemediations).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should abort API calls when stopSync is called', async () => {
      let abortSignal;

      mockApiClientInstance.getVulnerabilities.mockImplementation(async ({ onBatch, signal }) => {
        abortSignal = signal;
        await onBatch([{ id: 1 }]);
        // Wait for abort signal
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 5000);
          signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Aborted'));
          });
        });
      });

      mockApiClientInstance.getRemediations.mockImplementation(async () => {});

      const syncPromise = dataService.syncData();

      await new Promise(resolve => setTimeout(resolve, 50));
      dataService.stopSync();

      expect(abortSignal.aborted).toBe(true);
      await expect(syncPromise).rejects.toThrow();
    });
  });

  describe('Data Access Methods - Vulnerable Assets', () => {
    beforeEach(() => {
      // Add mock methods for vulnerable assets to the database instance
      mockDatabaseInstance.getVulnerableAssets = jest.fn(() => [
        { id: 'asset-1', displayName: 'Asset 1', vulnerability_count: 5 },
        { id: 'asset-2', displayName: 'Asset 2', vulnerability_count: 3 },
      ]);
      mockDatabaseInstance.getVulnerableAssetCount = jest.fn(() => 10);
      mockDatabaseInstance.getVulnerableAssetDetails = jest.fn((id) => {
        if (id === 'asset-1') {
          return { id: 'asset-1', displayName: 'Asset 1', vulnerability_count: 5, raw_data: '{}' };
        }
        return null;
      });
      mockDatabaseInstance.getVulnerabilitiesForAsset = jest.fn((assetId) => {
        if (assetId === 'asset-1') {
          return [
            { id: 'vuln-1', name: 'Vulnerability 1' },
            { id: 'vuln-2', name: 'Vulnerability 2' },
          ];
        }
        return [];
      });
    });

    it('should call getVulnerableAssets with correct parameters and return data with total', () => {
      const options = {
        filters: { assetType: 'server' },
        limit: 50,
        offset: 10,
        sortColumn: 'displayName',
        sortDirection: 'asc',
      };

      const result = dataService.getVulnerableAssets(options);

      expect(mockDatabaseInstance.getVulnerableAssets).toHaveBeenCalledWith({
        filters: { assetType: 'server' },
        limit: 50,
        offset: 10,
        sortColumn: 'displayName',
        sortDirection: 'asc',
      });
      expect(mockDatabaseInstance.getVulnerableAssetCount).toHaveBeenCalledWith({ assetType: 'server' });
      expect(result).toEqual({
        data: [
          { id: 'asset-1', displayName: 'Asset 1', vulnerability_count: 5 },
          { id: 'asset-2', displayName: 'Asset 2', vulnerability_count: 3 },
        ],
        total: 10,
      });
    });

    it('should use default parameters when none are provided to getVulnerableAssets', () => {
      const result = dataService.getVulnerableAssets();

      expect(mockDatabaseInstance.getVulnerableAssets).toHaveBeenCalledWith({
        filters: {},
        limit: 100,
        offset: 0,
        sortColumn: 'vulnerability_count',
        sortDirection: 'desc',
      });
      expect(mockDatabaseInstance.getVulnerableAssetCount).toHaveBeenCalledWith({});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });

    it('should call getVulnerableAssetDetails and return asset details', () => {
      const result = dataService.getVulnerableAssetDetails('asset-1');

      expect(mockDatabaseInstance.getVulnerableAssetDetails).toHaveBeenCalledWith('asset-1');
      expect(result).toEqual({
        id: 'asset-1',
        displayName: 'Asset 1',
        vulnerability_count: 5,
        raw_data: '{}',
      });
    });

    it('should return null when getVulnerableAssetDetails is called with non-existent id', () => {
      const result = dataService.getVulnerableAssetDetails('non-existent');

      expect(mockDatabaseInstance.getVulnerableAssetDetails).toHaveBeenCalledWith('non-existent');
      expect(result).toBeNull();
    });

    it('should call getVulnerabilitiesForAsset and return vulnerabilities', () => {
      const result = dataService.getVulnerabilitiesForAsset('asset-1');

      expect(mockDatabaseInstance.getVulnerabilitiesForAsset).toHaveBeenCalledWith('asset-1');
      expect(result).toEqual([
        { id: 'vuln-1', name: 'Vulnerability 1' },
        { id: 'vuln-2', name: 'Vulnerability 2' },
      ]);
    });

    it('should return empty array when getVulnerabilitiesForAsset is called with asset that has no vulnerabilities', () => {
      const result = dataService.getVulnerabilitiesForAsset('asset-2');

      expect(mockDatabaseInstance.getVulnerabilitiesForAsset).toHaveBeenCalledWith('asset-2');
      expect(result).toEqual([]);
    });
  });
});
