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

// Helper to seed test data
function seedTestData(db) {
  // Create assets
  const assets = [
    {
      id: 'asset-1',
      name: 'Production Server 1',
      assetType: 'SERVER',
      environment: 'production',
      owners: ['alice@example.com']
    },
    {
      id: 'asset-2',
      name: 'Production Server 2',
      assetType: 'SERVER',
      environment: 'production',
      owners: ['bob@example.com']
    },
    {
      id: 'asset-3',
      name: 'Development Server',
      assetType: 'SERVER',
      environment: 'development',
      owners: ['alice@example.com']
    }
  ];
  db.storeAssetsBatch(assets);

  // Create vulnerabilities with different severities
  const vulnerabilities = [
    // Asset 1: 2 critical, 1 high (worst health)
    { id: 'v-1', targetId: 'asset-1', name: 'CVE-2024-001', severity: 'CRITICAL', cvssSeverityScore: 9.8 },
    { id: 'v-2', targetId: 'asset-1', name: 'CVE-2024-002', severity: 'CRITICAL', cvssSeverityScore: 9.5 },
    { id: 'v-3', targetId: 'asset-1', name: 'CVE-2024-003', severity: 'HIGH', cvssSeverityScore: 7.5 },
    // Asset 2: 1 critical, 1 medium (medium health)
    { id: 'v-4', targetId: 'asset-2', name: 'CVE-2024-004', severity: 'CRITICAL', cvssSeverityScore: 9.0 },
    { id: 'v-5', targetId: 'asset-2', name: 'CVE-2024-005', severity: 'MEDIUM', cvssSeverityScore: 5.0 },
    // Asset 3: 1 low (best health)
    { id: 'v-6', targetId: 'asset-3', name: 'CVE-2024-006', severity: 'LOW', cvssSeverityScore: 2.0 },
    // Asset 1: 1 remediated vulnerability (should improve health score)
    { id: 'v-7', targetId: 'asset-1', name: 'CVE-2024-007', severity: 'HIGH', cvssSeverityScore: 7.0, deactivateMetadata: { deactivatedOnDate: '2024-01-01' } }
  ];
  db.storeVulnerabilitiesBatch(vulnerabilities);
}

test('Phase 3: calculateAssetHealthScore returns 100 for assets with no vulnerabilities', () => {
  const db = createTempDb();

  try {
    // Create an asset with no vulnerabilities
    db.storeAssetsBatch([{ id: 'asset-clean', name: 'Clean Server', assetType: 'SERVER' }]);

    const healthScore = db.calculateAssetHealthScore('asset-clean');
    assert.equal(healthScore, 100, 'Clean asset should have perfect health score of 100');
  } finally {
    cleanupDb(db);
  }
});

test('Phase 3: calculateAssetHealthScore penalizes critical vulnerabilities heavily', () => {
  const db = createTempDb();

  try {
    db.storeAssetsBatch([{ id: 'asset-1', name: 'Server 1', assetType: 'SERVER' }]);

    // Single critical vulnerability
    db.storeVulnerabilitiesBatch([
      { id: 'v-1', targetId: 'asset-1', name: 'CVE-001', severity: 'CRITICAL', cvssSeverityScore: 10.0 }
    ]);

    const healthScore = db.calculateAssetHealthScore('asset-1');

    // Score should be 100 - 25 (critical) - 20 (CVSS 10.0 * 2) = 55
    assert.equal(healthScore, 55, 'Single critical vuln should result in health score of 55');
  } finally {
    cleanupDb(db);
  }
});

test('Phase 3: calculateAssetHealthScore rewards high remediation rate', () => {
  const db = createTempDb();

  try {
    db.storeAssetsBatch([{ id: 'asset-1', name: 'Server 1', assetType: 'SERVER' }]);

    // 2 critical vulnerabilities, 1 remediated
    db.storeVulnerabilitiesBatch([
      { id: 'v-1', targetId: 'asset-1', name: 'CVE-001', severity: 'CRITICAL', cvssSeverityScore: 9.0 },
      { id: 'v-2', targetId: 'asset-1', name: 'CVE-002', severity: 'CRITICAL', cvssSeverityScore: 9.0, deactivateMetadata: { deactivatedOnDate: '2024-01-01' } }
    ]);

    const healthScore = db.calculateAssetHealthScore('asset-1');

    // 100 - 50 (2 critical) - 18 (avg CVSS 9.0 * 2) + 10 (50% remediation rate * 20) = 42
    assert.equal(healthScore, 42, 'Should reward 50% remediation rate');
  } finally {
    cleanupDb(db);
  }
});

test('Phase 3: getAssetsByHealthScore sorts assets by health (worst first)', () => {
  const db = createTempDb();

  try {
    seedTestData(db);

    const assetsByHealth = db.getAssetsByHealthScore(10);

    assert.ok(Array.isArray(assetsByHealth), 'Should return an array');
    assert.equal(assetsByHealth.length, 3, 'Should return 3 assets');

    // Verify sorting: asset-1 should be worst (most criticals), asset-3 should be best (only low)
    assert.equal(assetsByHealth[0].id, 'asset-1', 'Asset with most critical vulns should be first (worst health)');
    assert.equal(assetsByHealth[2].id, 'asset-3', 'Asset with only low severity should be last (best health)');

    // Verify health scores are included and descending order (worst to best)
    assert.ok(assetsByHealth[0].healthScore <= assetsByHealth[1].healthScore, 'Health scores should be in ascending order');
    assert.ok(assetsByHealth[1].healthScore <= assetsByHealth[2].healthScore, 'Health scores should be in ascending order');
  } finally {
    cleanupDb(db);
  }
});

test('Phase 3: getDetailedAssetStatistics returns comprehensive statistics', () => {
  const db = createTempDb();

  try {
    seedTestData(db);

    const stats = db.getDetailedAssetStatistics();

    // Verify structure
    assert.ok(stats.topCriticalAssets, 'Should have topCriticalAssets');
    assert.ok(stats.topVulnerableAssets, 'Should have topVulnerableAssets');
    assert.ok(stats.ownerStats, 'Should have ownerStats');
    assert.ok(stats.domainStats, 'Should have domainStats');

    // Verify topCriticalAssets
    assert.ok(Array.isArray(stats.topCriticalAssets), 'topCriticalAssets should be an array');
    assert.ok(stats.topCriticalAssets.length > 0, 'Should have critical assets');

    // Asset 1 has 2 critical, Asset 2 has 1 critical
    const topCritical = stats.topCriticalAssets[0];
    assert.equal(topCritical.id, 'asset-1', 'Asset 1 should have most critical vulns');
    assert.equal(topCritical.critical_count, 2, 'Asset 1 should have 2 critical vulns');

    // Verify topVulnerableAssets
    assert.ok(Array.isArray(stats.topVulnerableAssets), 'topVulnerableAssets should be an array');
    const topVuln = stats.topVulnerableAssets[0];
    assert.ok(topVuln.vuln_count > 0, 'Should have vulnerability count');
    assert.ok(topVuln.critical >= 0, 'Should have critical count');
    assert.ok(topVuln.high >= 0, 'Should have high count');

    // Verify ownerStats
    assert.ok(Array.isArray(stats.ownerStats), 'ownerStats should be an array');
    assert.ok(stats.ownerStats.length > 0, 'Should have owner stats');
    const ownerStat = stats.ownerStats.find(s => s.owner_email === 'alice@example.com');
    assert.ok(ownerStat, 'Should have stats for alice@example.com');
    assert.ok(ownerStat.asset_count > 0, 'Should have asset count');
    assert.ok(ownerStat.vuln_count > 0, 'Should have vulnerability count');

    // Verify domainStats
    assert.ok(Array.isArray(stats.domainStats), 'domainStats should be an array');
    assert.ok(stats.domainStats.length > 0, 'Should have domain stats');
    const prodDomain = stats.domainStats.find(s => s.domain === 'production');
    assert.ok(prodDomain, 'Should have stats for production domain');
    assert.ok(prodDomain.asset_count > 0, 'Should have asset count for production');
  } finally {
    cleanupDb(db);
  }
});

test('Phase 3: getDetailedAssetStatistics handles empty database gracefully', () => {
  const db = createTempDb();

  try {
    const stats = db.getDetailedAssetStatistics();

    assert.ok(stats.topCriticalAssets, 'Should have topCriticalAssets even if empty');
    assert.ok(stats.topVulnerableAssets, 'Should have topVulnerableAssets even if empty');
    assert.ok(stats.ownerStats, 'Should have ownerStats even if empty');
    assert.ok(stats.domainStats, 'Should have domainStats even if empty');

    assert.equal(stats.topCriticalAssets.length, 0, 'Should have empty topCriticalAssets');
    assert.equal(stats.topVulnerableAssets.length, 0, 'Should have empty topVulnerableAssets');
    assert.equal(stats.ownerStats.length, 0, 'Should have empty ownerStats');
    assert.equal(stats.domainStats.length, 0, 'Should have empty domainStats');
  } finally {
    cleanupDb(db);
  }
});

test('Phase 3: health score calculation clamps to 0-100 range', () => {
  const db = createTempDb();

  try {
    db.storeAssetsBatch([{ id: 'asset-1', name: 'Server 1', assetType: 'SERVER' }]);

    // Add many critical vulnerabilities to drive score below 0
    const vulnerabilities = [];
    for (let i = 0; i < 10; i++) {
      vulnerabilities.push({
        id: `v-${i}`,
        targetId: 'asset-1',
        name: `CVE-${i}`,
        severity: 'CRITICAL',
        cvssSeverityScore: 10.0
      });
    }
    db.storeVulnerabilitiesBatch(vulnerabilities);

    const healthScore = db.calculateAssetHealthScore('asset-1');

    assert.ok(healthScore >= 0, 'Health score should not be negative');
    assert.ok(healthScore <= 100, 'Health score should not exceed 100');
    assert.equal(healthScore, 0, 'With many critical vulns, score should be clamped to 0');
  } finally {
    cleanupDb(db);
  }
});

test('Phase 3: getDetailedAssetStatistics limits results to specified count', () => {
  const db = createTempDb();

  try {
    // Create more than 10 assets
    const assets = [];
    const vulnerabilities = [];
    for (let i = 0; i < 15; i++) {
      assets.push({
        id: `asset-${i}`,
        name: `Server ${i}`,
        assetType: 'SERVER',
        environment: `env-${i % 3}`,
        owners: [`owner${i}@example.com`]
      });
      vulnerabilities.push({
        id: `v-${i}`,
        targetId: `asset-${i}`,
        name: `CVE-${i}`,
        severity: 'CRITICAL'
      });
    }
    db.storeAssetsBatch(assets);
    db.storeVulnerabilitiesBatch(vulnerabilities);

    const stats = db.getDetailedAssetStatistics();

    assert.ok(stats.topCriticalAssets.length <= 10, 'Should limit topCriticalAssets to 10');
    assert.ok(stats.topVulnerableAssets.length <= 10, 'Should limit topVulnerableAssets to 10');
    assert.ok(stats.ownerStats.length <= 20, 'Should limit ownerStats to 20');
    assert.ok(stats.domainStats.length <= 20, 'Should limit domainStats to 20');
  } finally {
    cleanupDb(db);
  }
});

test('Phase 3: getAssetsByHealthScore includes assets with zero vulnerabilities', () => {
  const db = createTempDb();

  try {
    // Create assets: some with vulns, some without
    db.storeAssetsBatch([
      { id: 'asset-dirty', name: 'Vulnerable Server', assetType: 'SERVER' },
      { id: 'asset-clean-1', name: 'Clean Server 1', assetType: 'SERVER' },
      { id: 'asset-clean-2', name: 'Clean Server 2', assetType: 'SERVER' }
    ]);

    // Only give one asset vulnerabilities
    db.storeVulnerabilitiesBatch([
      { id: 'v-1', targetId: 'asset-dirty', name: 'CVE-001', severity: 'CRITICAL', cvssSeverityScore: 9.0 }
    ]);

    const results = db.getAssetsByHealthScore(10);

    // Should include all 3 assets
    assert.equal(results.length, 3, 'Should include all assets, even those with zero vulnerabilities');

    // Clean assets should have score of 100
    const cleanAsset1 = results.find(a => a.id === 'asset-clean-1');
    const cleanAsset2 = results.find(a => a.id === 'asset-clean-2');
    assert.ok(cleanAsset1, 'Should include clean asset 1');
    assert.ok(cleanAsset2, 'Should include clean asset 2');
    assert.equal(cleanAsset1.healthScore, 100, 'Clean asset should have perfect health score of 100');
    assert.equal(cleanAsset2.healthScore, 100, 'Clean asset should have perfect health score of 100');

    // Dirty asset should have lower score
    const dirtyAsset = results.find(a => a.id === 'asset-dirty');
    assert.ok(dirtyAsset, 'Should include vulnerable asset');
    assert.ok(dirtyAsset.healthScore < 100, 'Vulnerable asset should have health score below 100');

    // Clean assets should be sorted last (best health = highest score)
    const lastIndex = results.length - 1;
    assert.ok(
      results[lastIndex].healthScore === 100,
      'Assets with best health (100) should be sorted last'
    );
  } finally {
    cleanupDb(db);
  }
});

test('Phase 3: calculateAssetHealthScore throws error for non-existent asset', () => {
  const db = createTempDb();

  try {
    // Create one asset
    db.storeAssetsBatch([{ id: 'asset-exists', name: 'Real Asset', assetType: 'SERVER' }]);

    // Non-existent asset should throw error
    assert.throws(
      () => db.calculateAssetHealthScore('asset-does-not-exist'),
      /Asset not found/,
      'Should throw error for non-existent asset'
    );

    // Existing asset with no vulnerabilities should return 100 (not throw)
    const score = db.calculateAssetHealthScore('asset-exists');
    assert.equal(score, 100, 'Real asset with no vulnerabilities should return 100');
  } finally {
    cleanupDb(db);
  }
});

test('Phase 3: getDetailedAssetStatistics includes remediated vulnerabilities in total count', () => {
  const db = createTempDb();

  try {
    db.storeAssetsBatch([
      { id: 'asset-1', name: 'Server 1', assetType: 'SERVER', owners: ['owner@example.com'] }
    ]);

    // Create vulnerabilities: some active, some remediated
    db.storeVulnerabilitiesBatch([
      { id: 'v-1', targetId: 'asset-1', name: 'CVE-001', severity: 'CRITICAL' }, // Active
      { id: 'v-2', targetId: 'asset-1', name: 'CVE-002', severity: 'HIGH' }, // Active
      { id: 'v-3', targetId: 'asset-1', name: 'CVE-003', severity: 'MEDIUM', deactivateMetadata: { deactivatedOnDate: '2024-01-01' } }, // Remediated
      { id: 'v-4', targetId: 'asset-1', name: 'CVE-004', severity: 'LOW', deactivateMetadata: { deactivatedOnDate: '2024-01-02' } } // Remediated
    ]);

    const stats = db.getDetailedAssetStatistics();

    // topVulnerableAssets should include ALL vulnerabilities (active + remediated)
    const topAsset = stats.topVulnerableAssets.find(a => a.id === 'asset-1');
    assert.ok(topAsset, 'Should include asset in topVulnerableAssets');
    assert.equal(topAsset.vuln_count, 4, 'Total vuln_count should include both active and remediated (2 + 2 = 4)');
    assert.equal(topAsset.active_count, 2, 'Should report 2 active vulnerabilities');
    assert.equal(topAsset.remediated_count, 2, 'Should report 2 remediated vulnerabilities');
    assert.equal(topAsset.critical, 1, 'Should count 1 critical vulnerability');
    assert.equal(topAsset.high, 1, 'Should count 1 high vulnerability');
    assert.equal(topAsset.medium, 1, 'Should count 1 medium vulnerability (even though remediated)');
  } finally {
    cleanupDb(db);
  }
});
