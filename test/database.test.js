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
