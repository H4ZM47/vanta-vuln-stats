const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { VulnerabilityDatabase } = require('../src/core/database');

// Helper to create a temporary database
function createTempDb() {
  const tempPath = path.join(__dirname, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);
  return new VulnerabilityDatabase(tempPath);
}

// Helper to clean up database
function cleanupDb(db) {
  const dbPath = db.databasePath;
  db.close();
  try {
    fs.unlinkSync(dbPath);
    // Also remove WAL files
    try { fs.unlinkSync(`${dbPath}-wal`); } catch {}
    try { fs.unlinkSync(`${dbPath}-shm`); } catch {}
  } catch {}
}

test('storeVulnerabilitiesBatch handles duplicate IDs within same batch', () => {
  const db = createTempDb();

  try {
    // First batch with duplicate ID 'v-1'
    const batch = [
      { id: 'v-1', name: 'First occurrence', severity: 'HIGH' },
      { id: 'v-1', name: 'Second occurrence (updated)', severity: 'CRITICAL' }, // Same ID, different data
      { id: 'v-2', name: 'Different vuln', severity: 'MEDIUM' },
    ];

    const result = db.storeVulnerabilitiesBatch(batch);

    // Should count first as new, second as update (not both as new)
    assert.equal(result.new, 2, 'Should have 2 new vulnerabilities (v-1 and v-2)');
    assert.equal(result.updated, 1, 'Should have 1 update (second v-1 occurrence)');
    assert.equal(result.total, 3, 'Total should be 3');

    // Verify database state - should only have 2 records
    const count = db.getVulnerabilityCount();
    assert.equal(count, 2, 'Database should only have 2 unique vulnerabilities');

    // Verify the latest data was written
    const details = db.getVulnerabilityDetails('v-1');
    assert.equal(details.name, 'Second occurrence (updated)');
    assert.equal(details.severity, 'CRITICAL');
  } finally {
    cleanupDb(db);
  }
});

test('storeVulnerabilitiesBatch handles remediation tracking with duplicate IDs', () => {
  const db = createTempDb();

  try {
    // First batch: create active vulnerability
    const batch1 = [
      { id: 'v-1', name: 'Active vuln', severity: 'HIGH' },
    ];
    const result1 = db.storeVulnerabilitiesBatch(batch1);
    assert.equal(result1.new, 1);
    assert.equal(result1.remediated, 0);

    // Second batch: same ID appears twice - first still active, then remediated
    const batch2 = [
      { id: 'v-1', name: 'Active vuln', severity: 'HIGH' }, // No change from DB
      { id: 'v-1', name: 'Active vuln', severity: 'HIGH', deactivateMetadata: { deactivatedOnDate: '2024-01-10' } }, // Now remediated
    ];
    const result2 = db.storeVulnerabilitiesBatch(batch2);

    // Should detect remediation from within the same batch
    assert.equal(result2.new, 0, 'Should have 0 new (already exists)');
    assert.equal(result2.updated, 1, 'Should have 1 update (only second occurrence changes data)');
    assert.equal(result2.remediated, 1, 'Should detect 1 remediation');

    // Verify final state is remediated
    const details = db.getVulnerabilityDetails('v-1');
    assert.ok(details.deactivateMetadata?.deactivatedOnDate, 'Should be remediated');
  } finally {
    cleanupDb(db);
  }
});

test('storeVulnerabilitiesBatch handles remediated duplicate in new batch', () => {
  const db = createTempDb();

  try {
    // Batch with duplicate ID where both occurrences are already remediated
    const batch = [
      { id: 'v-1', name: 'Remediated vuln', severity: 'HIGH', deactivateMetadata: { deactivatedOnDate: '2024-01-10' } },
      { id: 'v-1', name: 'Remediated vuln updated', severity: 'CRITICAL', deactivateMetadata: { deactivatedOnDate: '2024-01-10' } },
    ];

    const result = db.storeVulnerabilitiesBatch(batch);

    // First is new+remediated, second is update (not new+remediated again)
    assert.equal(result.new, 1, 'Should have 1 new');
    assert.equal(result.updated, 1, 'Should have 1 update');
    assert.equal(result.remediated, 1, 'Should only count remediation once');
  } finally {
    cleanupDb(db);
  }
});

test('storeRemediationsBatch handles duplicate IDs within same batch', () => {
  const db = createTempDb();

  try {
    // First batch with duplicate ID 'r-1'
    const batch = [
      { id: 'r-1', vulnerabilityId: 'v-1', status: 'open' },
      { id: 'r-1', vulnerabilityId: 'v-1', status: 'closed' }, // Same ID, different data
      { id: 'r-2', vulnerabilityId: 'v-2', status: 'open' },
    ];

    const result = db.storeRemediationsBatch(batch);

    // Should count first as new, second as update
    assert.equal(result.new, 2, 'Should have 2 new remediations (r-1 and r-2)');
    assert.equal(result.updated, 1, 'Should have 1 update (second r-1 occurrence)');
    assert.equal(result.total, 3, 'Total should be 3');

    // Verify the latest data was written
    const details = db.getRemediationsForVulnerability('v-1');
    assert.equal(details.length, 1, 'Should only have 1 remediation record for v-1');
    assert.equal(details[0].status, 'closed', 'Should have the latest status');
  } finally {
    cleanupDb(db);
  }
});

test('storeRemediationsBatch handles triple duplicate IDs', () => {
  const db = createTempDb();

  try {
    // Batch with same ID appearing three times
    const batch = [
      { id: 'r-1', vulnerabilityId: 'v-1', status: 'open' },
      { id: 'r-1', vulnerabilityId: 'v-1', status: 'in_progress' },
      { id: 'r-1', vulnerabilityId: 'v-1', status: 'closed' },
    ];

    const result = db.storeRemediationsBatch(batch);

    assert.equal(result.new, 1, 'Should have 1 new');
    assert.equal(result.updated, 2, 'Should have 2 updates (second and third occurrences)');
    assert.equal(result.total, 3);

    const details = db.getRemediationsForVulnerability('v-1');
    assert.equal(details[0].status, 'closed', 'Should have final status');
  } finally {
    cleanupDb(db);
  }
});

test('batch operations work correctly with empty arrays', () => {
  const db = createTempDb();

  try {
    const vulnResult = db.storeVulnerabilitiesBatch([]);
    assert.equal(vulnResult.new, 0);
    assert.equal(vulnResult.updated, 0);
    assert.equal(vulnResult.total, 0);

    const remResult = db.storeRemediationsBatch([]);
    assert.equal(remResult.new, 0);
    assert.equal(remResult.updated, 0);
    assert.equal(remResult.total, 0);
  } finally {
    cleanupDb(db);
  }
});

test('batch operations handle records without IDs', () => {
  const db = createTempDb();

  try {
    const batch = [
      { id: 'v-1', name: 'Valid' },
      { name: 'No ID' }, // Missing ID
      null, // Null record
      { id: 'v-2', name: 'Another valid' },
    ];

    const result = db.storeVulnerabilitiesBatch(batch);

    assert.equal(result.new, 2, 'Should only process records with IDs');
    assert.equal(result.total, 4, 'Total should include all records passed');
  } finally {
    cleanupDb(db);
  }
});

// ============================================================================
// Vulnerable Assets Tests
// ============================================================================

test('_normaliseVulnerableAsset handles basic asset data', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'asset-123',
      name: 'production-server-01',
      assetType: 'SERVER',
      integrationId: 'qualys',
      integrationType: 'VULNERABILITY_SCANNER',
      vulnerabilityCounts: {
        total: 10,
        critical: 2,
        high: 3,
        medium: 4,
        low: 1,
      },
      firstDetected: '2024-01-01T00:00:00.000Z',
      lastDetected: '2024-01-10T00:00:00.000Z',
    };

    const normalized = db._normaliseVulnerableAsset(asset);

    assert.equal(normalized.id, 'asset-123');
    assert.equal(normalized.display_name, 'production-server-01');
    assert.equal(normalized.asset_type, 'SERVER');
    assert.equal(normalized.integration_id, 'qualys');
    assert.equal(normalized.integration_type, 'VULNERABILITY_SCANNER');
    assert.equal(normalized.vulnerability_count, 10);
    assert.equal(normalized.critical_count, 2);
    assert.equal(normalized.high_count, 3);
    assert.equal(normalized.medium_count, 4);
    assert.equal(normalized.low_count, 1);
    assert.equal(normalized.first_detected, '2024-01-01T00:00:00.000Z');
    assert.equal(normalized.last_detected, '2024-01-10T00:00:00.000Z');
    assert.ok(normalized.updated_at);
    assert.ok(normalized.raw_data);
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseVulnerableAsset handles missing vulnerability counts', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'asset-456',
      name: 'test-server',
      assetType: 'WORKSTATION',
    };

    const normalized = db._normaliseVulnerableAsset(asset);

    assert.equal(normalized.id, 'asset-456');
    assert.equal(normalized.vulnerability_count, 0);
    assert.equal(normalized.critical_count, 0);
    assert.equal(normalized.high_count, 0);
    assert.equal(normalized.medium_count, 0);
    assert.equal(normalized.low_count, 0);
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseVulnerableAsset returns null for asset without ID', () => {
  const db = createTempDb();

  try {
    const asset = { name: 'no-id-asset' };
    const normalized = db._normaliseVulnerableAsset(asset);
    assert.equal(normalized, null);
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseVulnerableAsset extracts scanner metadata', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'asset-789',
      displayName: 'scanner-detected-asset',
      scanners: [
        {
          integrationId: 'tenable',
          operatingSystems: ['Ubuntu 20.04'],
          targetId: 'target-123',
        },
      ],
    };

    const normalized = db._normaliseVulnerableAsset(asset);

    assert.equal(normalized.id, 'asset-789');
    assert.equal(normalized.display_name, 'scanner-detected-asset');
    assert.equal(normalized.integration_id, 'tenable');
  } finally {
    cleanupDb(db);
  }
});

test('storeVulnerableAssetsBatch stores new assets', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'asset-1',
        name: 'server-1',
        assetType: 'SERVER',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
      {
        id: 'asset-2',
        name: 'server-2',
        assetType: 'WORKSTATION',
        vulnerabilityCounts: { total: 3, critical: 0, high: 1, medium: 2, low: 0 },
      },
    ];

    const result = db.storeVulnerableAssetsBatch(assets);

    assert.equal(result.new, 2);
    assert.equal(result.updated, 0);
    assert.equal(result.total, 2);

    const count = db.getVulnerableAssetCount();
    assert.equal(count, 2);
  } finally {
    cleanupDb(db);
  }
});

test('storeVulnerableAssetsBatch updates existing assets', () => {
  const db = createTempDb();

  try {
    // Insert initial assets
    const initialAssets = [
      {
        id: 'asset-1',
        name: 'server-1',
        assetType: 'SERVER',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
    ];
    db.storeVulnerableAssetsBatch(initialAssets);

    // Update with different counts
    const updatedAssets = [
      {
        id: 'asset-1',
        name: 'server-1-updated',
        assetType: 'SERVER',
        vulnerabilityCounts: { total: 8, critical: 2, high: 3, medium: 3, low: 0 },
      },
    ];

    const result = db.storeVulnerableAssetsBatch(updatedAssets);

    assert.equal(result.new, 0);
    assert.equal(result.updated, 1);
    assert.equal(result.total, 1);

    const details = db.getVulnerableAssetDetails('asset-1');
    assert.equal(details.display_name, 'server-1-updated');
    assert.equal(details.vulnerability_count, 8);
    assert.equal(details.critical_count, 2);
  } finally {
    cleanupDb(db);
  }
});

test('storeVulnerableAssetsBatch handles duplicate IDs in same batch', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'asset-1',
        name: 'first-occurrence',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
      {
        id: 'asset-1',
        name: 'second-occurrence',
        vulnerabilityCounts: { total: 10, critical: 3, high: 4, medium: 3, low: 0 },
      },
    ];

    const result = db.storeVulnerableAssetsBatch(assets);

    assert.equal(result.new, 1);
    assert.equal(result.updated, 1);
    assert.equal(result.total, 2);

    const details = db.getVulnerableAssetDetails('asset-1');
    assert.equal(details.display_name, 'second-occurrence');
    assert.equal(details.vulnerability_count, 10);
  } finally {
    cleanupDb(db);
  }
});

test('storeVulnerableAssetsBatch handles empty array', () => {
  const db = createTempDb();

  try {
    const result = db.storeVulnerableAssetsBatch([]);
    assert.equal(result.new, 0);
    assert.equal(result.updated, 0);
    assert.equal(result.total, 0);
  } finally {
    cleanupDb(db);
  }
});

test('storeVulnerableAssetsBatch skips assets without IDs', () => {
  const db = createTempDb();

  try {
    const assets = [
      { id: 'asset-1', name: 'valid-asset' },
      { name: 'no-id-asset' }, // Missing ID
      null, // Null record
      { id: 'asset-2', name: 'another-valid' },
    ];

    const result = db.storeVulnerableAssetsBatch(assets);

    assert.equal(result.new, 2);
    assert.equal(result.total, 4);
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerableAssets retrieves all assets', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'asset-1',
        name: 'server-1',
        assetType: 'SERVER',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
      },
      {
        id: 'asset-2',
        name: 'server-2',
        assetType: 'WORKSTATION',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const results = db.getVulnerableAssets();

    assert.equal(results.length, 2);
    assert.equal(results[0].id, 'asset-1'); // Sorted by vulnerability_count DESC
    assert.equal(results[0].vulnerability_count, 10);
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerableAssets filters by asset type', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'asset-1',
        name: 'server-1',
        assetType: 'SERVER',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
      {
        id: 'asset-2',
        name: 'workstation-1',
        assetType: 'WORKSTATION',
        vulnerabilityCounts: { total: 3, critical: 0, high: 1, medium: 2, low: 0 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const results = db.getVulnerableAssets({ filters: { assetType: 'SERVER' } });

    assert.equal(results.length, 1);
    assert.equal(results[0].asset_type, 'SERVER');
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerableAssets filters by vulnerability count range', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'asset-1',
        name: 'high-vuln',
        vulnerabilityCounts: { total: 50, critical: 10, high: 20, medium: 20, low: 0 },
      },
      {
        id: 'asset-2',
        name: 'medium-vuln',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
      },
      {
        id: 'asset-3',
        name: 'low-vuln',
        vulnerabilityCounts: { total: 2, critical: 0, high: 1, medium: 1, low: 0 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const results = db.getVulnerableAssets({
      filters: { minVulnerabilityCount: 5, maxVulnerabilityCount: 15 },
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'asset-2');
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerableAssets supports pagination', () => {
  const db = createTempDb();

  try {
    const assets = Array.from({ length: 10 }, (_, i) => ({
      id: `asset-${i}`,
      name: `server-${i}`,
      vulnerabilityCounts: { total: 10 - i, critical: 1, high: 2, medium: 3, low: 0 },
    }));

    db.storeVulnerableAssetsBatch(assets);

    const page1 = db.getVulnerableAssets({ limit: 5, offset: 0 });
    const page2 = db.getVulnerableAssets({ limit: 5, offset: 5 });

    assert.equal(page1.length, 5);
    assert.equal(page2.length, 5);
    assert.equal(page1[0].id, 'asset-0'); // Highest count
    assert.equal(page2[0].id, 'asset-5');
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerableAssets sorts by different columns', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'asset-1',
        name: 'zebra-server',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
      {
        id: 'asset-2',
        name: 'alpha-server',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const byName = db.getVulnerableAssets({ sortColumn: 'display_name', sortDirection: 'asc' });
    assert.equal(byName[0].display_name, 'alpha-server');

    const byCount = db.getVulnerableAssets({ sortColumn: 'vulnerability_count', sortDirection: 'desc' });
    assert.equal(byCount[0].vulnerability_count, 10);
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerableAssetCount returns correct count', () => {
  const db = createTempDb();

  try {
    const assets = [
      { id: 'asset-1', name: 'server-1', assetType: 'SERVER' },
      { id: 'asset-2', name: 'server-2', assetType: 'SERVER' },
      { id: 'asset-3', name: 'workstation-1', assetType: 'WORKSTATION' },
    ];

    db.storeVulnerableAssetsBatch(assets);

    assert.equal(db.getVulnerableAssetCount(), 3);
    assert.equal(db.getVulnerableAssetCount({ assetType: 'SERVER' }), 2);
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerableAssetDetails retrieves full asset details', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'asset-1',
      name: 'test-server',
      assetType: 'SERVER',
      integrationId: 'qualys',
      vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
      metadata: { region: 'us-east-1', env: 'production' },
    };

    db.storeVulnerableAssetsBatch([asset]);

    const details = db.getVulnerableAssetDetails('asset-1');

    assert.equal(details.id, 'asset-1');
    assert.equal(details.display_name, 'test-server');
    assert.equal(details.vulnerability_count, 10);
    assert.equal(details.metadata.region, 'us-east-1');
    assert.ok(details.raw_data);
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerableAssetDetails returns null for non-existent asset', () => {
  const db = createTempDb();

  try {
    const details = db.getVulnerableAssetDetails('non-existent');
    assert.equal(details, null);
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerabilitiesForAsset retrieves vulnerabilities by asset ID', () => {
  const db = createTempDb();

  try {
    // Store vulnerabilities with different target IDs
    const vulnerabilities = [
      { id: 'v-1', name: 'CVE-2024-001', targetId: 'asset-1', severity: 'CRITICAL' },
      { id: 'v-2', name: 'CVE-2024-002', targetId: 'asset-1', severity: 'HIGH' },
      { id: 'v-3', name: 'CVE-2024-003', targetId: 'asset-2', severity: 'MEDIUM' },
    ];

    db.storeVulnerabilitiesBatch(vulnerabilities);

    const asset1Vulns = db.getVulnerabilitiesForAsset('asset-1');
    const asset2Vulns = db.getVulnerabilitiesForAsset('asset-2');

    assert.equal(asset1Vulns.length, 2);
    assert.equal(asset2Vulns.length, 1);
    assert.equal(asset1Vulns[0].severity, 'CRITICAL'); // Sorted by severity
    assert.equal(asset1Vulns[1].severity, 'HIGH');
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerabilitiesForAsset returns empty array for asset with no vulnerabilities', () => {
  const db = createTempDb();

  try {
    const result = db.getVulnerabilitiesForAsset('non-existent-asset');
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  } finally {
    cleanupDb(db);
  }
});

test('getVulnerabilitiesForAsset handles null asset ID', () => {
  const db = createTempDb();

  try {
    const result = db.getVulnerabilitiesForAsset(null);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics correctly correlates vulnerabilities with remediations', () => {
  const db = createTempDb();

  try {
    // Create vulnerabilities
    const vulnerabilities = [
      { id: 'v-1', name: 'CVE-2024-001', severity: 'HIGH' },
      { id: 'v-2', name: 'CVE-2024-002', severity: 'MEDIUM' },
      { id: 'v-3', name: 'CVE-2024-003', severity: 'LOW' },
      { id: 'v-4', name: 'CVE-2024-004', severity: 'CRITICAL' },
    ];
    db.storeVulnerabilitiesBatch(vulnerabilities);

    // Create remediations
    const remediations = [
      // v-1: 2 remediations, 1 remediated, 1 open
      { id: 'r-1', vulnerabilityId: 'v-1', status: 'closed', remediationDate: '2024-01-15', isRemediatedOnTime: true },
      { id: 'r-2', vulnerabilityId: 'v-1', status: 'open' },

      // v-2: 1 remediation, late
      { id: 'r-3', vulnerabilityId: 'v-2', status: 'closed', remediationDate: '2024-01-20', isRemediatedOnTime: false },

      // v-3: no remediations (active)

      // v-4: 1 remediation, overdue
      { id: 'r-4', vulnerabilityId: 'v-4', status: 'overdue' },

      // Orphaned remediation (no matching vulnerability)
      { id: 'r-5', vulnerabilityId: 'v-999', status: 'closed', remediationDate: '2024-01-25', isRemediatedOnTime: true },
    ];
    db.storeRemediationsBatch(remediations);

    // Get statistics
    const stats = db.getStatistics();

    // Verify vulnerability counts
    assert.equal(stats.totalCount, 4, 'Should have 4 total vulnerabilities');
    assert.equal(stats.active, 2, 'v-3 and v-4 should be active (no remediation_date)');
    assert.equal(stats.remediated, 2, 'v-1 and v-2 should be remediated (have remediation_date)');

    // Verify remediation statistics
    assert.ok(stats.remediations, 'Should have remediation statistics');
    assert.equal(stats.remediations.total, 5, 'Should have 5 total remediation records');
    assert.equal(stats.remediations.withMatchingVulnerability, 4, 'Should have 4 remediations with matching vulnerabilities');
    assert.equal(stats.remediations.withoutMatchingVulnerability, 1, 'Should have 1 orphaned remediation (r-5)');

    // Verify remediation status
    assert.equal(stats.remediations.byStatus.remediated, 3, 'Should have 3 remediated (r-1, r-3, r-5)');
    assert.equal(stats.remediations.byStatus.open, 1, 'Should have 1 open (r-2)');
    assert.equal(stats.remediations.byStatus.overdue, 1, 'Should have 1 overdue (r-4)');

    // Verify timeliness
    assert.equal(stats.remediations.byTimeliness.onTime, 2, 'Should have 2 on-time remediations (r-1, r-5)');
    assert.equal(stats.remediations.byTimeliness.late, 1, 'Should have 1 late remediation (r-3)');
    assert.equal(stats.remediations.byTimeliness.pending, 2, 'Should have 2 pending remediations (r-2, r-4)');

  } finally {
    cleanupDb(db);
  }
});

test('getStatistics with filters correctly correlates remediations', () => {
  const db = createTempDb();

  try {
    // Create vulnerabilities
    const vulnerabilities = [
      { id: 'v-1', name: 'CVE-2024-001', severity: 'HIGH' },
      { id: 'v-2', name: 'CVE-2024-002', severity: 'MEDIUM' },
      { id: 'v-3', name: 'CVE-2024-003', severity: 'HIGH' },
    ];
    db.storeVulnerabilitiesBatch(vulnerabilities);

    // Create remediations
    const remediations = [
      { id: 'r-1', vulnerabilityId: 'v-1', status: 'closed', remediationDate: '2024-01-15', isRemediatedOnTime: true },
      { id: 'r-2', vulnerabilityId: 'v-2', status: 'closed', remediationDate: '2024-01-20', isRemediatedOnTime: false },
      { id: 'r-3', vulnerabilityId: 'v-3', status: 'open' },
    ];
    db.storeRemediationsBatch(remediations);

    // Get statistics filtered by HIGH severity
    const stats = db.getStatistics({ severity: ['HIGH'] });

    // Should only count vulnerabilities with HIGH severity
    assert.equal(stats.totalCount, 2, 'Should have 2 HIGH severity vulnerabilities');

    // Should only count remediations for HIGH severity vulnerabilities
    assert.equal(stats.remediations.total, 2, 'Should have 2 remediations for HIGH severity vulnerabilities (r-1, r-3)');
    assert.equal(stats.remediations.byStatus.remediated, 1, 'Should have 1 remediated HIGH severity (r-1)');
    assert.equal(stats.remediations.byStatus.open, 1, 'Should have 1 open HIGH severity (r-3)');

  } finally {
    cleanupDb(db);
  }
});

test('getStatistics includes vulnerable assets count', () => {
  const db = createTempDb();

  try {
    // Create some vulnerabilities
    const vulnerabilities = [
      { id: 'v-1', name: 'CVE-2024-001', severity: 'HIGH', targetId: 'asset-1' },
      { id: 'v-2', name: 'CVE-2024-002', severity: 'MEDIUM', targetId: 'asset-2' },
    ];
    db.storeVulnerabilitiesBatch(vulnerabilities);

    // Create vulnerable assets
    const assets = [
      {
        id: 'asset-1',
        name: 'server-1',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
      {
        id: 'asset-2',
        name: 'server-2',
        vulnerabilityCounts: { total: 3, critical: 0, high: 1, medium: 2, low: 0 },
      },
      {
        id: 'asset-3',
        name: 'server-3',
        vulnerabilityCounts: { total: 1, critical: 0, high: 0, medium: 1, low: 0 },
      },
    ];
    db.storeVulnerableAssetsBatch(assets);

    // Get statistics
    const stats = db.getStatistics();

    // Verify vulnerable assets count is included
    assert.equal(stats.totalVulnerableAssets, 3, 'Should have 3 vulnerable assets in statistics');
  } finally {
    cleanupDb(db);
  }
});

test('active status filter uses remediation-based classification', () => {
  const db = createTempDb();

  try {
    // v-1 looks deactivated but has no remediation records, so it should be treated as active
    // v-2 has a remediation record with a remediation_date, so it should be treated as remediated
    const vulnerabilities = [
      {
        id: 'v-1',
        name: 'Deactivated but still active',
        severity: 'HIGH',
        deactivateMetadata: { deactivatedOnDate: '2024-02-01' },
      },
      {
        id: 'v-2',
        name: 'Has remediation record',
        severity: 'LOW',
      },
    ];
    db.storeVulnerabilitiesBatch(vulnerabilities);

    const remediations = [
      {
        id: 'r-1',
        vulnerabilityId: 'v-2',
        status: 'closed',
        remediationDate: '2024-02-10',
      },
    ];
    db.storeRemediationsBatch(remediations);

    const stats = db.getStatistics({ status: 'active' });
    assert.equal(stats.totalCount, 1, 'Active filter should include v-1 even with deactivated_on set');
    assert.equal(stats.active, 1, 'Active count should reflect remediation-based classification');
    assert.equal(stats.remediated, 0, 'Remediated count should be zero after active filter applied');
  } finally {
    cleanupDb(db);
  }
});

// Scanner Metadata Extraction Tests
test('_normaliseAsset extracts integration_id from scanners[0].integrationId', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'scanner-integration-001',
      displayName: 'Scanner Integration Test',
      assetType: 'SERVER',
      scanners: [{
        resourceId: 'scanner-resource-123',
        integrationId: 'qualys-scanner',
        operatingSystems: ['Ubuntu 20.04'],
        assetTags: []
      }]
    };

    const normalized = db._normaliseAsset(asset);

    assert.ok(normalized, 'Should return normalized asset');
    assert.equal(normalized.integration_id, 'qualys-scanner', 'Should extract integration_id from scanner');
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseAsset extracts environment from scanner assetTags', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'scanner-env-001',
      displayName: 'Scanner Environment Test',
      assetType: 'SERVER',
      scanners: [{
        resourceId: 'scanner-123',
        integrationId: 'qualys',
        assetTags: [
          { key: 'environment', value: 'staging' },
          { key: 'team', value: 'security' }
        ]
      }]
    };

    const normalized = db._normaliseAsset(asset);

    assert.ok(normalized, 'Should return normalized asset');
    assert.equal(normalized.environment, 'staging', 'Should extract environment from scanner assetTags');
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseAsset extracts platform from scanner operatingSystems', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'scanner-os-001',
      displayName: 'Scanner OS Test',
      assetType: 'SERVER',
      scanners: [{
        resourceId: 'scanner-456',
        integrationId: 'aqua',
        operatingSystems: ['CentOS 7', 'Red Hat Enterprise Linux 8'],
        assetTags: []
      }]
    };

    const normalized = db._normaliseAsset(asset);

    assert.ok(normalized, 'Should return normalized asset');
    assert.equal(normalized.platform, 'CentOS 7', 'Should extract first OS from scanner operatingSystems');
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseAsset extracts external_identifier from scanner targetId', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'scanner-target-001',
      displayName: 'Scanner Target Test',
      assetType: 'CONTAINER',
      scanners: [{
        resourceId: 'scanner-789',
        integrationId: 'snyk',
        targetId: 'external-target-xyz-123',
        operatingSystems: []
      }]
    };

    const normalized = db._normaliseAsset(asset);

    assert.ok(normalized, 'Should return normalized asset');
    assert.equal(normalized.external_identifier, 'external-target-xyz-123', 'Should extract external_identifier from scanner targetId');
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseAsset handles missing scanners array gracefully', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'no-scanner-001',
      displayName: 'No Scanner Test',
      assetType: 'WORKSTATION'
    };

    const normalized = db._normaliseAsset(asset);

    assert.ok(normalized, 'Should return normalized asset');
    assert.equal(normalized.id, 'no-scanner-001');
    assert.equal(normalized.integration_id, null, 'integration_id should be null');
    assert.equal(normalized.environment, null, 'environment should be null');
    assert.equal(normalized.platform, null, 'platform should be null');
    assert.equal(normalized.external_identifier, null, 'external_identifier should be null');
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseAsset handles empty scanners array', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'empty-scanner-001',
      displayName: 'Empty Scanner Array Test',
      assetType: 'APPLICATION',
      scanners: []
    };

    const normalized = db._normaliseAsset(asset);

    assert.ok(normalized, 'Should return normalized asset');
    assert.equal(normalized.id, 'empty-scanner-001');
    assert.equal(normalized.integration_id, null, 'integration_id should be null');
    assert.equal(normalized.environment, null, 'environment should be null');
    assert.equal(normalized.platform, null, 'platform should be null');
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseAsset prioritizes top-level fields over scanner fields', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'priority-test-001',
      displayName: 'Priority Test',
      assetType: 'SERVER',
      integrationId: 'top-level-integration',
      environment: 'production',
      platform: 'Ubuntu 22.04 LTS',
      externalIdentifier: 'top-level-ext-id',
      scanners: [{
        resourceId: 'scanner-999',
        integrationId: 'scanner-integration',
        targetId: 'scanner-target-id',
        operatingSystems: ['Ubuntu 20.04 LTS'],
        assetTags: [
          { key: 'environment', value: 'development' }
        ]
      }]
    };

    const normalized = db._normaliseAsset(asset);

    assert.ok(normalized, 'Should return normalized asset');
    assert.equal(normalized.integration_id, 'top-level-integration', 'Should use top-level integration_id');
    assert.equal(normalized.environment, 'production', 'Should use top-level environment');
    assert.equal(normalized.platform, 'Ubuntu 22.04 LTS', 'Should use top-level platform');
    assert.equal(normalized.external_identifier, 'top-level-ext-id', 'Should use top-level external_identifier');
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseAsset handles scanner with partial metadata', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'partial-scanner-001',
      displayName: 'Partial Scanner Metadata',
      assetType: 'CONTAINER',
      scanners: [{
        resourceId: 'scanner-partial',
        integrationId: 'partial-integration'
      }]
    };

    const normalized = db._normaliseAsset(asset);

    assert.ok(normalized, 'Should return normalized asset');
    assert.equal(normalized.integration_id, 'partial-integration');
    assert.equal(normalized.environment, null, 'environment should be null when missing');
    assert.equal(normalized.platform, null, 'platform should be null when missing');
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseAsset extracts environment from scanner with multiple assetTags', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'multi-tag-001',
      displayName: 'Multiple Asset Tags',
      assetType: 'SERVER',
      scanners: [{
        resourceId: 'scanner-tags',
        integrationId: 'qualys',
        assetTags: [
          { key: 'team', value: 'platform' },
          { key: 'environment', value: 'qa' },
          { key: 'region', value: 'us-west-2' }
        ]
      }]
    };

    const normalized = db._normaliseAsset(asset);

    assert.ok(normalized, 'Should return normalized asset');
    assert.equal(normalized.environment, 'qa', 'Should find environment tag among multiple tags');
  } finally {
    cleanupDb(db);
  }
});

test('_normaliseAsset handles multiple scanners by using first one', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'multi-scanner-001',
      displayName: 'Multiple Scanners',
      assetType: 'SERVER',
      scanners: [
        {
          resourceId: 'scanner-first',
          integrationId: 'first-integration',
          operatingSystems: ['First OS'],
          assetTags: [{ key: 'environment', value: 'first-env' }]
        },
        {
          resourceId: 'scanner-second',
          integrationId: 'second-integration',
          operatingSystems: ['Second OS'],
          assetTags: [{ key: 'environment', value: 'second-env' }]
        }
      ]
    };

    const normalized = db._normaliseAsset(asset);

    assert.ok(normalized, 'Should return normalized asset');
    assert.equal(normalized.integration_id, 'first-integration', 'Should use first scanner integration_id');
    assert.equal(normalized.platform, 'First OS', 'Should use first scanner OS');
    assert.equal(normalized.environment, 'first-env', 'Should use first scanner environment');
  } finally {
    cleanupDb(db);
  }
});

// SQL Injection Prevention Tests
test('storeAssetsBatch handles asset names with SQL injection attempts', () => {
  const db = createTempDb();

  try {
    const maliciousAssets = [
      {
        id: 'sql-inject-1',
        displayName: "'; DROP TABLE assets; --",
        assetType: 'SERVER'
      },
      {
        id: 'sql-inject-2',
        displayName: "admin' OR '1'='1",
        assetType: 'WORKSTATION'
      },
      {
        id: 'sql-inject-3',
        displayName: "1' UNION SELECT * FROM vulnerabilities--",
        assetType: 'CONTAINER'
      }
    ];

    const stats = db.storeAssetsBatch(maliciousAssets);
    assert.equal(stats.new, 3, 'Should store all 3 assets');

    // Verify the assets were stored correctly with their malicious names
    const stored1 = db.getAssetDetails('sql-inject-1');
    const stored2 = db.getAssetDetails('sql-inject-2');
    const stored3 = db.getAssetDetails('sql-inject-3');

    assert.ok(stored1, 'Asset 1 should be stored');
    assert.equal(stored1.name, "'; DROP TABLE assets; --", 'SQL injection attempt should be stored as-is');
    assert.equal(stored2.name, "admin' OR '1'='1", 'SQL injection attempt should be stored as-is');
    assert.equal(stored3.name, "1' UNION SELECT * FROM vulnerabilities--", 'SQL injection attempt should be stored as-is');

    // Verify tables still exist and can be queried
    const count = db.db.prepare('SELECT COUNT(*) as count FROM assets').get();
    assert.ok(count.count >= 3, 'Assets table should still exist and be queryable');
  } finally {
    cleanupDb(db);
  }
});

test('storeAssetsBatch handles special characters properly', () => {
  const db = createTempDb();

  try {
    const specialCharsAssets = [
      {
        id: 'special-1',
        displayName: 'Test\nNewline\tTab',
        assetType: 'SERVER',
        description: 'Contains \\ backslash and " quote'
      },
      {
        id: 'special-2',
        displayName: "O'Brien's Server",
        assetType: 'SERVER'
      },
      {
        id: 'special-3',
        displayName: 'Unicode: 你好 мир 🚀',
        assetType: 'APPLICATION'
      }
    ];

    const stats = db.storeAssetsBatch(specialCharsAssets);
    assert.equal(stats.new, 3, 'Should store all 3 assets with special characters');

    // Verify special characters are preserved
    const asset1 = db.getAssetDetails('special-1');
    const asset2 = db.getAssetDetails('special-2');
    const asset3 = db.getAssetDetails('special-3');

    assert.ok(asset1.name.includes('Newline'), 'Newline should be preserved');
    assert.ok(asset1.description.includes('backslash'), 'Backslash should be preserved');
    assert.equal(asset2.name, "O'Brien's Server", 'Single quote should be preserved');
    assert.ok(asset3.name.includes('你好'), 'Unicode characters should be preserved');
  } finally {
    cleanupDb(db);
  }
});

test('getAssets handles SQL keywords in search filters safely', () => {
  const db = createTempDb();

  try {
    // Store test assets
    db.storeAssetsBatch([
      {
        id: 'search-test-1',
        displayName: 'SELECT FROM WHERE',
        assetType: 'SERVER'
      },
      {
        id: 'search-test-2',
        displayName: 'DROP TABLE users',
        assetType: 'WORKSTATION'
      }
    ]);

    // Add vulnerabilities for these assets so getAssets returns them
    db.storeVulnerabilitiesBatch([
      {
        id: 'vuln-search-1',
        name: 'CVE-2024-SELECT',
        description: 'Test vuln',
        severity: 'HIGH',
        targetId: 'search-test-1',
        relatedVulns: ['CVE-2024-SELECT']
      },
      {
        id: 'vuln-search-2',
        name: 'CVE-2024-DROP',
        description: 'Test vuln',
        severity: 'MEDIUM',
        targetId: 'search-test-2',
        relatedVulns: ['CVE-2024-DROP']
      }
    ]);

    // Search with SQL keywords should work safely
    const results = db.getAssets({ search: 'SELECT' });
    assert.ok(results.length > 0, 'Should find assets matching search');

    const selectAsset = results.find(a => a.assetId === 'search-test-1');
    assert.ok(selectAsset, 'Should find the SELECT asset');
    assert.equal(selectAsset.assetName, 'SELECT FROM WHERE', 'Asset name should be intact');
  } finally {
    cleanupDb(db);
  }
});

// Transaction Integrity Tests
test('storeAssetsBatch handles mixed valid and invalid assets in transaction', () => {
  const db = createTempDb();

  try {
    // Get initial count
    const initialCount = db.db.prepare('SELECT COUNT(*) as count FROM assets').get().count;

    const mixedBatch = [
      {
        id: 'valid-tx-1',
        displayName: 'Valid Asset 1',
        assetType: 'SERVER'
      },
      {
        id: null, // Invalid - will be skipped
        displayName: 'Invalid - No ID',
        assetType: 'SERVER'
      },
      {
        id: 'valid-tx-2',
        displayName: 'Valid Asset 2',
        assetType: 'WORKSTATION'
      }
    ];

    const stats = db.storeAssetsBatch(mixedBatch);

    assert.equal(stats.total, 3, 'Should report total batch size');
    assert.equal(stats.new, 2, 'Should only count valid assets as new');

    // Verify count increased by 2
    const finalCount = db.db.prepare('SELECT COUNT(*) as count FROM assets').get().count;
    assert.equal(finalCount, initialCount + 2, 'Database should have 2 more assets');

    // Verify valid assets were stored
    const asset1 = db.getAssetDetails('valid-tx-1');
    const asset2 = db.getAssetDetails('valid-tx-2');
    assert.ok(asset1, 'Valid asset 1 should be stored');
    assert.ok(asset2, 'Valid asset 2 should be stored');
  } finally {
    cleanupDb(db);
  }
});

test('storeAssetsBatch maintains data integrity during batch updates', () => {
  const db = createTempDb();

  try {
    const asset = {
      id: 'concurrent-test-1',
      displayName: 'Original Name',
      assetType: 'SERVER',
      environment: 'staging'
    };

    // First batch
    const stats1 = db.storeAssetsBatch([asset]);
    assert.equal(stats1.new, 1, 'Should create new asset');

    // Second batch with updated data
    const updatedAsset = {
      ...asset,
      displayName: 'Updated Name',
      environment: 'production'
    };

    const stats2 = db.storeAssetsBatch([updatedAsset]);
    assert.equal(stats2.updated, 1, 'Should update existing asset');

    // Verify final state
    const stored = db.getAssetDetails('concurrent-test-1');
    assert.equal(stored.name, 'Updated Name', 'Name should be updated');
    assert.equal(stored.environment, 'production', 'Environment should be updated');
  } finally {
    cleanupDb(db);
  }
});

test('storeAssetsBatch handles large batches without corruption', () => {
  const db = createTempDb();

  try {
    // Create a large batch
    const largeBatch = Array.from({ length: 500 }, (_, i) => ({
      id: `large-batch-${i}`,
      displayName: `Asset ${i}`,
      assetType: i % 2 === 0 ? 'SERVER' : 'WORKSTATION',
      environment: i % 3 === 0 ? 'production' : 'staging'
    }));

    const stats = db.storeAssetsBatch(largeBatch);
    assert.equal(stats.new, 500, 'Should create 500 assets');
    assert.equal(stats.total, 500, 'Should report 500 total');

    // Verify random samples
    const sample1 = db.getAssetDetails('large-batch-0');
    const sample2 = db.getAssetDetails('large-batch-250');
    const sample3 = db.getAssetDetails('large-batch-499');

    assert.ok(sample1, 'Sample 1 should exist');
    assert.equal(sample1.name, 'Asset 0', 'Sample 1 name should be correct');
    assert.ok(sample2, 'Sample 2 should exist');
    assert.equal(sample2.name, 'Asset 250', 'Sample 2 name should be correct');
    assert.ok(sample3, 'Sample 3 should exist');
    assert.equal(sample3.name, 'Asset 499', 'Sample 3 name should be correct');
  } finally {
    cleanupDb(db);
  }
});

test('asset-vulnerability referential integrity is maintained', () => {
  const db = createTempDb();

  try {
    // Store asset
    const asset = {
      id: 'integrity-asset-1',
      displayName: 'Integrity Test Asset',
      assetType: 'SERVER'
    };
    db.storeAssetsBatch([asset]);

    // Store vulnerabilities referencing the asset
    const vulns = [
      {
        id: 'integrity-vuln-1',
        name: 'CVE-2024-INT-1',
        description: 'Test',
        severity: 'HIGH',
        targetId: 'integrity-asset-1',
        relatedVulns: ['CVE-2024-INT-1']
      },
      {
        id: 'integrity-vuln-2',
        name: 'CVE-2024-INT-2',
        description: 'Test',
        severity: 'MEDIUM',
        targetId: 'integrity-asset-1',
        relatedVulns: ['CVE-2024-INT-2']
      }
    ];
    db.storeVulnerabilitiesBatch(vulns);

    // Verify join works correctly
    const vulnerabilities = db.getVulnerabilities({ filters: { assetId: 'integrity-asset-1' } });
    assert.equal(vulnerabilities.length, 2, 'Should find 2 vulnerabilities for asset');
    assert.equal(vulnerabilities[0].asset_name, 'Integrity Test Asset', 'First vuln should join with asset');
    assert.equal(vulnerabilities[1].asset_name, 'Integrity Test Asset', 'Second vuln should join with asset');
  } finally {
    cleanupDb(db);
  }
});

// ============================================================================
// Asset Statistics Tests
// ============================================================================

test('getStatistics returns asset statistics when vulnerable assets exist', () => {
  const db = createTempDb();

  try {
    // Store vulnerable assets with different types and integrations
    const assets = [
      {
        id: 'stats-asset-1',
        name: 'server-1',
        assetType: 'SERVER',
        integrationId: 'qualys',
        vulnerabilityCounts: { total: 50, critical: 10, high: 20, medium: 15, low: 5 },
      },
      {
        id: 'stats-asset-2',
        name: 'server-2',
        assetType: 'SERVER',
        integrationId: 'tenable',
        vulnerabilityCounts: { total: 30, critical: 5, high: 10, medium: 10, low: 5 },
      },
      {
        id: 'stats-asset-3',
        name: 'workstation-1',
        assetType: 'WORKSTATION',
        integrationId: 'qualys',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 3, low: 2 },
      },
      {
        id: 'stats-asset-4',
        name: 'container-1',
        assetType: 'CONTAINER',
        integrationId: 'snyk',
        vulnerabilityCounts: { total: 5, critical: 0, high: 2, medium: 2, low: 1 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const stats = db.getStatistics();

    // Verify asset statistics exist
    assert.ok(stats.assets, 'Should have asset statistics');
    assert.equal(stats.assets.total, 4, 'Should have 4 total assets');

    // Verify byType distribution
    assert.ok(stats.assets.byType, 'Should have byType distribution');
    assert.equal(stats.assets.byType.SERVER, 2, 'Should have 2 SERVER assets');
    assert.equal(stats.assets.byType.WORKSTATION, 1, 'Should have 1 WORKSTATION asset');
    assert.equal(stats.assets.byType.CONTAINER, 1, 'Should have 1 CONTAINER asset');

    // Verify byIntegration distribution
    assert.ok(stats.assets.byIntegration, 'Should have byIntegration distribution');
    assert.equal(stats.assets.byIntegration.qualys, 2, 'Should have 2 qualys assets');
    assert.equal(stats.assets.byIntegration.tenable, 1, 'Should have 1 tenable asset');
    assert.equal(stats.assets.byIntegration.snyk, 1, 'Should have 1 snyk asset');

    // Verify topVulnerable
    assert.ok(Array.isArray(stats.assets.topVulnerable), 'topVulnerable should be an array');
    assert.equal(stats.assets.topVulnerable.length, 4, 'Should have 4 assets in topVulnerable');
    assert.equal(stats.assets.topVulnerable[0].id, 'stats-asset-1', 'First asset should be the one with most vulnerabilities');
    assert.equal(stats.assets.topVulnerable[0].vulnerability_count, 50, 'First asset should have 50 vulnerabilities');

    // Verify average vulnerabilities per asset
    const expectedAverage = (50 + 30 + 10 + 5) / 4; // 23.75
    assert.ok(Math.abs(stats.assets.averageVulnerabilitiesPerAsset - expectedAverage) < 0.01,
      'Average should be approximately 23.75');

    // Verify critical and high counts
    assert.equal(stats.assets.withCriticalVulnerabilities, 3, 'Should have 3 assets with critical vulnerabilities');
    assert.equal(stats.assets.withHighVulnerabilities, 4, 'Should have 4 assets with high vulnerabilities');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics returns empty asset statistics when no vulnerable assets exist', () => {
  const db = createTempDb();

  try {
    const stats = db.getStatistics();

    assert.ok(stats.assets, 'Should have asset statistics object');
    assert.equal(stats.assets.total, 0, 'Should have 0 total assets');
    assert.deepEqual(stats.assets.byType, {}, 'byType should be empty object');
    assert.deepEqual(stats.assets.byIntegration, {}, 'byIntegration should be empty object');
    assert.deepEqual(stats.assets.topVulnerable, [], 'topVulnerable should be empty array');
    assert.equal(stats.assets.averageVulnerabilitiesPerAsset, 0, 'Average should be 0');
    assert.equal(stats.assets.withCriticalVulnerabilities, 0, 'Should have 0 assets with critical');
    assert.equal(stats.assets.withHighVulnerabilities, 0, 'Should have 0 assets with high');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics topVulnerable is limited to 10 assets', () => {
  const db = createTempDb();

  try {
    // Create 15 assets
    const assets = Array.from({ length: 15 }, (_, i) => ({
      id: `top-asset-${i}`,
      name: `asset-${i}`,
      assetType: 'SERVER',
      vulnerabilityCounts: { total: 100 - i, critical: 10, high: 20, medium: 30, low: 40 },
    }));

    db.storeVulnerableAssetsBatch(assets);

    const stats = db.getStatistics();

    assert.equal(stats.assets.topVulnerable.length, 10, 'Should only return top 10 assets');
    assert.equal(stats.assets.topVulnerable[0].id, 'top-asset-0', 'First should have most vulnerabilities');
    assert.equal(stats.assets.topVulnerable[9].id, 'top-asset-9', 'Last should be 10th asset');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics topVulnerable sorts by vulnerability count, then by critical and high', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'sort-asset-1',
        name: 'same-count-more-critical',
        vulnerabilityCounts: { total: 10, critical: 5, high: 3, medium: 2, low: 0 },
      },
      {
        id: 'sort-asset-2',
        name: 'same-count-less-critical',
        vulnerabilityCounts: { total: 10, critical: 2, high: 5, medium: 3, low: 0 },
      },
      {
        id: 'sort-asset-3',
        name: 'more-vulns',
        vulnerabilityCounts: { total: 20, critical: 1, high: 1, medium: 18, low: 0 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const stats = db.getStatistics();

    // Should be sorted: more-vulns (20), same-count-more-critical (10, 5C), same-count-less-critical (10, 2C)
    assert.equal(stats.assets.topVulnerable[0].id, 'sort-asset-3', 'First should be asset with most vulnerabilities');
    assert.equal(stats.assets.topVulnerable[1].id, 'sort-asset-1', 'Second should be asset with more critical');
    assert.equal(stats.assets.topVulnerable[2].id, 'sort-asset-2', 'Third should be asset with fewer critical');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics handles assets with zero vulnerabilities', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'zero-vuln-1',
        name: 'no-vulns',
        vulnerabilityCounts: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
      },
      {
        id: 'has-vulns-1',
        name: 'has-vulns',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const stats = db.getStatistics();

    assert.equal(stats.assets.total, 2, 'Should count both assets');
    assert.equal(stats.assets.averageVulnerabilitiesPerAsset, 2.5, 'Average should include zero-vuln assets');
    assert.equal(stats.assets.withCriticalVulnerabilities, 1, 'Should only count asset with critical > 0');
    assert.equal(stats.assets.withHighVulnerabilities, 1, 'Should only count asset with high > 0');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics handles assets with null/unknown types and integrations', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'null-type-1',
        name: 'null-type',
        assetType: null,
        integrationId: null,
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
      {
        id: 'known-type-1',
        name: 'known-type',
        assetType: 'SERVER',
        integrationId: 'qualys',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const stats = db.getStatistics();

    assert.ok(stats.assets.byType.UNKNOWN, 'Should have UNKNOWN type category');
    assert.equal(stats.assets.byType.UNKNOWN, 1, 'Should count null type as UNKNOWN');
    assert.equal(stats.assets.byType.SERVER, 1, 'Should count known type');

    assert.ok(stats.assets.byIntegration.UNKNOWN, 'Should have UNKNOWN integration category');
    assert.equal(stats.assets.byIntegration.UNKNOWN, 1, 'Should count null integration as UNKNOWN');
    assert.equal(stats.assets.byIntegration.qualys, 1, 'Should count known integration');
  } finally {
    cleanupDb(db);
  }
});

// ============================================================================
// Asset Statistics Filtering Tests
// ============================================================================

test('getStatistics filters asset statistics by asset type', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'filter-server-1',
        name: 'server-1',
        assetType: 'SERVER',
        integrationId: 'qualys',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
      },
      {
        id: 'filter-server-2',
        name: 'server-2',
        assetType: 'SERVER',
        integrationId: 'tenable',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
      {
        id: 'filter-workstation-1',
        name: 'workstation-1',
        assetType: 'WORKSTATION',
        integrationId: 'qualys',
        vulnerabilityCounts: { total: 3, critical: 0, high: 1, medium: 2, low: 0 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const stats = db.getStatistics({ assetType: 'SERVER' });

    assert.equal(stats.assets.total, 2, 'Should only count SERVER assets');
    assert.equal(stats.assets.byType.SERVER, 2, 'byType should only have SERVER');
    assert.equal(stats.assets.byType.WORKSTATION, undefined, 'byType should not have WORKSTATION');
    assert.equal(stats.assets.topVulnerable.length, 2, 'topVulnerable should only have 2 assets');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics filters asset statistics by integration ID', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'filter-qualys-1',
        name: 'qualys-server',
        assetType: 'SERVER',
        integrationId: 'qualys',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
      },
      {
        id: 'filter-qualys-2',
        name: 'qualys-workstation',
        assetType: 'WORKSTATION',
        integrationId: 'qualys',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
      {
        id: 'filter-tenable-1',
        name: 'tenable-server',
        assetType: 'SERVER',
        integrationId: 'tenable',
        vulnerabilityCounts: { total: 8, critical: 1, high: 3, medium: 4, low: 0 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const stats = db.getStatistics({ integrationId: 'qualys' });

    assert.equal(stats.assets.total, 2, 'Should only count qualys assets');
    assert.equal(stats.assets.byIntegration.qualys, 2, 'byIntegration should only have qualys');
    assert.equal(stats.assets.byIntegration.tenable, undefined, 'byIntegration should not have tenable');
    const expectedAvg = (10 + 5) / 2; // 7.5
    assert.ok(Math.abs(stats.assets.averageVulnerabilitiesPerAsset - expectedAvg) < 0.01,
      'Average should be calculated from filtered assets only');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics filters asset statistics by vulnerability count range', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'filter-high-count',
        name: 'high-vulns',
        vulnerabilityCounts: { total: 50, critical: 10, high: 20, medium: 20, low: 0 },
      },
      {
        id: 'filter-medium-count',
        name: 'medium-vulns',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
      },
      {
        id: 'filter-low-count',
        name: 'low-vulns',
        vulnerabilityCounts: { total: 2, critical: 0, high: 1, medium: 1, low: 0 },
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    const stats = db.getStatistics({ minVulnerabilityCount: 5, maxVulnerabilityCount: 15 });

    assert.equal(stats.assets.total, 1, 'Should only count assets with vulnerability count between 5 and 15');
    assert.equal(stats.assets.topVulnerable[0].id, 'filter-medium-count', 'Should only include medium count asset');
    assert.equal(stats.assets.averageVulnerabilitiesPerAsset, 10, 'Average should be 10');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics filters asset statistics by date range', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'filter-old-asset',
        name: 'old-asset',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
        firstDetected: '2024-01-01T00:00:00.000Z',
        lastDetected: '2024-01-15T00:00:00.000Z',
      },
      {
        id: 'filter-recent-asset',
        name: 'recent-asset',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
        firstDetected: '2024-02-01T00:00:00.000Z',
        lastDetected: '2024-02-15T00:00:00.000Z',
      },
      {
        id: 'filter-newest-asset',
        name: 'newest-asset',
        vulnerabilityCounts: { total: 8, critical: 2, high: 3, medium: 3, low: 0 },
        firstDetected: '2024-03-01T00:00:00.000Z',
        lastDetected: '2024-03-15T00:00:00.000Z',
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    // Filter by first detected date range
    const statsFirstDetected = db.getStatistics({
      firstDetectedStart: '2024-02-01T00:00:00.000Z',
      firstDetectedEnd: '2024-02-28T23:59:59.999Z',
    });

    assert.equal(statsFirstDetected.assets.total, 1, 'Should only count assets first detected in February');
    assert.equal(statsFirstDetected.assets.topVulnerable[0].id, 'filter-recent-asset', 'Should be the February asset');

    // Filter by last detected date range
    const statsLastDetected = db.getStatistics({
      lastDetectedStart: '2024-02-01T00:00:00.000Z',
    });

    assert.equal(statsLastDetected.assets.total, 2, 'Should count assets last detected on or after Feb 1');
    assert.equal(statsLastDetected.assets.topVulnerable.length, 2, 'Should have 2 assets in top vulnerable');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics filters asset statistics by multiple criteria', () => {
  const db = createTempDb();

  try {
    const assets = [
      {
        id: 'multi-filter-1',
        name: 'qualys-server-high',
        assetType: 'SERVER',
        integrationId: 'qualys',
        vulnerabilityCounts: { total: 50, critical: 10, high: 20, medium: 20, low: 0 },
        firstDetected: '2024-02-01T00:00:00.000Z',
      },
      {
        id: 'multi-filter-2',
        name: 'qualys-server-low',
        assetType: 'SERVER',
        integrationId: 'qualys',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
        firstDetected: '2024-02-05T00:00:00.000Z',
      },
      {
        id: 'multi-filter-3',
        name: 'tenable-server-high',
        assetType: 'SERVER',
        integrationId: 'tenable',
        vulnerabilityCounts: { total: 45, critical: 8, high: 18, medium: 19, low: 0 },
        firstDetected: '2024-02-10T00:00:00.000Z',
      },
      {
        id: 'multi-filter-4',
        name: 'qualys-workstation',
        assetType: 'WORKSTATION',
        integrationId: 'qualys',
        vulnerabilityCounts: { total: 40, critical: 5, high: 15, medium: 20, low: 0 },
        firstDetected: '2024-02-15T00:00:00.000Z',
      },
    ];

    db.storeVulnerableAssetsBatch(assets);

    // Filter by: type=SERVER, integration=qualys, minVulnerabilityCount=10, firstDetectedStart=2024-02-01
    const stats = db.getStatistics({
      assetType: 'SERVER',
      integrationId: 'qualys',
      minVulnerabilityCount: 10,
      firstDetectedStart: '2024-02-01T00:00:00.000Z',
    });

    assert.equal(stats.assets.total, 1, 'Should only match one asset with all criteria');
    assert.equal(stats.assets.topVulnerable[0].id, 'multi-filter-1', 'Should be the qualys server with high count');
    assert.equal(stats.assets.byType.SERVER, 1, 'Should only have SERVER type');
    assert.equal(stats.assets.byIntegration.qualys, 1, 'Should only have qualys integration');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics asset filters work independently from vulnerability filters', () => {
  const db = createTempDb();

  try {
    // Create vulnerabilities
    const vulnerabilities = [
      { id: 'v-1', name: 'CVE-2024-001', severity: 'CRITICAL' },
      { id: 'v-2', name: 'CVE-2024-002', severity: 'HIGH' },
      { id: 'v-3', name: 'CVE-2024-003', severity: 'MEDIUM' },
    ];
    db.storeVulnerabilitiesBatch(vulnerabilities);

    // Create vulnerable assets
    const assets = [
      {
        id: 'independent-server',
        name: 'server',
        assetType: 'SERVER',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
      },
      {
        id: 'independent-workstation',
        name: 'workstation',
        assetType: 'WORKSTATION',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
    ];
    db.storeVulnerableAssetsBatch(assets);

    // Apply vulnerability filter (severity=CRITICAL) and asset filter (assetType=SERVER)
    const stats = db.getStatistics({ severity: ['CRITICAL'], assetType: 'SERVER' });

    // Vulnerability stats should be filtered by severity
    assert.equal(stats.totalCount, 1, 'Should only count CRITICAL vulnerabilities');

    // Asset stats should be filtered by asset type (independent of vulnerability filter)
    assert.equal(stats.assets.total, 1, 'Should only count SERVER assets');
    assert.equal(stats.assets.topVulnerable[0].id, 'independent-server', 'Should only include SERVER');
  } finally {
    cleanupDb(db);
  }
});

test('getStatistics vulnerability search does not affect asset statistics', () => {
  const db = createTempDb();

  try {
    // Create vulnerabilities with specific CVE names
    const vulnerabilities = [
      { id: 'v-1', name: 'CVE-2024-1234', severity: 'CRITICAL' },
      { id: 'v-2', name: 'CVE-2024-5678', severity: 'HIGH' },
      { id: 'v-3', name: 'CVE-2024-9999', severity: 'MEDIUM' },
    ];
    db.storeVulnerabilitiesBatch(vulnerabilities);

    // Create vulnerable assets with names that don't match CVE search
    const assets = [
      {
        id: 'asset-1',
        name: 'production-server',
        assetType: 'SERVER',
        vulnerabilityCounts: { total: 10, critical: 2, high: 3, medium: 5, low: 0 },
      },
      {
        id: 'asset-2',
        name: 'staging-server',
        assetType: 'SERVER',
        vulnerabilityCounts: { total: 5, critical: 1, high: 2, medium: 2, low: 0 },
      },
      {
        id: 'asset-3',
        name: 'test-workstation',
        assetType: 'WORKSTATION',
        vulnerabilityCounts: { total: 3, critical: 0, high: 1, medium: 2, low: 0 },
      },
    ];
    db.storeVulnerableAssetsBatch(assets);

    // Search for a specific CVE (vulnerability search)
    const stats = db.getStatistics({ search: 'CVE-2024-1234' });

    // Vulnerability stats should be filtered by search
    assert.equal(stats.totalCount, 1, 'Should only count vulnerabilities matching search');

    // Asset stats should NOT be filtered by vulnerability search term
    assert.equal(stats.assets.total, 3, 'Should count all assets (search should not affect assets)');
    assert.equal(stats.assets.byType.SERVER, 2, 'Should have 2 SERVER assets');
    assert.equal(stats.assets.byType.WORKSTATION, 1, 'Should have 1 WORKSTATION asset');
    assert.equal(stats.assets.topVulnerable.length, 3, 'Should have all 3 assets in top vulnerable');
  } finally {
    cleanupDb(db);
  }
});
