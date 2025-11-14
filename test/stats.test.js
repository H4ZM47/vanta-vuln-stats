const test = require('node:test');
const assert = require('node:assert/strict');
const { formatStatistics } = require('../src/core/stats');

test('formatStatistics formats asset statistics with empty assets', () => {
  const rawStats = {
    totalCount: 0,
    bySeverity: {},
    byIntegration: {},
    fixable: 0,
    notFixable: 0,
    active: 0,
    remediated: 0,
    uniqueAssets: 0,
    uniqueCves: 0,
    averageCvssBySeverity: {},
    lastSync: null,
    remediations: null,
    assets: {
      total: 0,
      byType: {},
      byIntegration: {},
      topVulnerable: [],
      averageVulnerabilitiesPerAsset: 0,
      withCriticalVulnerabilities: 0,
      withHighVulnerabilities: 0,
    },
  };

  const formatted = formatStatistics(rawStats);

  assert.ok(formatted.assets, 'Should have assets object');
  assert.equal(formatted.assets.total, 0, 'Total should be 0');
  assert.deepEqual(formatted.assets.byType, [], 'byType should be empty array');
  assert.deepEqual(formatted.assets.byIntegration, [], 'byIntegration should be empty array');
  assert.deepEqual(formatted.assets.topVulnerable, [], 'topVulnerable should be empty array');
  assert.equal(formatted.assets.averageVulnerabilitiesPerAsset, 0, 'Average should be 0');
  assert.equal(formatted.assets.withCriticalVulnerabilities, 0, 'Should have 0 with critical');
  assert.equal(formatted.assets.withHighVulnerabilities, 0, 'Should have 0 with high');
});

test('formatStatistics formats asset statistics with populated data', () => {
  const rawStats = {
    totalCount: 100,
    bySeverity: { CRITICAL: 10, HIGH: 20, MEDIUM: 50, LOW: 20 },
    byIntegration: { qualys: 60, tenable: 40 },
    fixable: 70,
    notFixable: 30,
    active: 80,
    remediated: 20,
    uniqueAssets: 50,
    uniqueCves: 75,
    averageCvssBySeverity: { critical: 9.5, high: 7.2 },
    lastSync: '2024-01-15T12:00:00.000Z',
    remediations: null,
    assets: {
      total: 50,
      byType: {
        SERVER: 30,
        WORKSTATION: 15,
        CONTAINER: 5,
      },
      byIntegration: {
        qualys: 25,
        tenable: 20,
        snyk: 5,
      },
      topVulnerable: [
        {
          id: 'asset-1',
          display_name: 'production-server-01',
          asset_type: 'SERVER',
          vulnerability_count: 100,
          critical_count: 20,
          high_count: 30,
          medium_count: 40,
          low_count: 10,
        },
        {
          id: 'asset-2',
          display_name: 'staging-server-01',
          asset_type: 'SERVER',
          vulnerability_count: 50,
          critical_count: 10,
          high_count: 15,
          medium_count: 20,
          low_count: 5,
        },
      ],
      averageVulnerabilitiesPerAsset: 23.75,
      withCriticalVulnerabilities: 30,
      withHighVulnerabilities: 45,
    },
  };

  const formatted = formatStatistics(rawStats);

  // Verify asset statistics formatting
  assert.ok(formatted.assets, 'Should have assets object');
  assert.equal(formatted.assets.total, 50, 'Total should be 50');

  // Verify byType formatting with percentages
  assert.ok(Array.isArray(formatted.assets.byType), 'byType should be an array');
  assert.equal(formatted.assets.byType.length, 3, 'Should have 3 asset types');

  const serverType = formatted.assets.byType.find(t => t.label === 'SERVER');
  assert.ok(serverType, 'Should have SERVER type');
  assert.equal(serverType.count, 30, 'SERVER count should be 30');
  assert.equal(serverType.percentage, '60.0%', 'SERVER percentage should be 60.0%');

  const workstationType = formatted.assets.byType.find(t => t.label === 'WORKSTATION');
  assert.ok(workstationType, 'Should have WORKSTATION type');
  assert.equal(workstationType.count, 15, 'WORKSTATION count should be 15');
  assert.equal(workstationType.percentage, '30.0%', 'WORKSTATION percentage should be 30.0%');

  // Verify byIntegration formatting
  assert.ok(Array.isArray(formatted.assets.byIntegration), 'byIntegration should be an array');
  assert.equal(formatted.assets.byIntegration.length, 3, 'Should have 3 integrations');

  const qualysIntegration = formatted.assets.byIntegration.find(i => i.label === 'qualys');
  assert.ok(qualysIntegration, 'Should have qualys integration');
  assert.equal(qualysIntegration.count, 25, 'qualys count should be 25');
  assert.equal(qualysIntegration.percentage, '50.0%', 'qualys percentage should be 50.0%');

  // Verify topVulnerable formatting
  assert.ok(Array.isArray(formatted.assets.topVulnerable), 'topVulnerable should be an array');
  assert.equal(formatted.assets.topVulnerable.length, 2, 'Should have 2 top vulnerable assets');

  const topAsset = formatted.assets.topVulnerable[0];
  assert.equal(topAsset.id, 'asset-1', 'First asset ID should be asset-1');
  assert.equal(topAsset.name, 'production-server-01', 'First asset name should be formatted');
  assert.equal(topAsset.type, 'SERVER', 'First asset type should be formatted');
  assert.equal(topAsset.vulnerabilityCount, 100, 'First asset vulnerability count should be 100');
  assert.equal(topAsset.criticalCount, 20, 'First asset critical count should be 20');
  assert.equal(topAsset.highCount, 30, 'First asset high count should be 30');
  assert.equal(topAsset.criticalAndHigh, 50, 'First asset criticalAndHigh should be 50');
  assert.equal(topAsset.label, 'production-server-01 (SERVER)', 'First asset label should be formatted');

  // Verify average formatting
  assert.equal(formatted.assets.averageVulnerabilitiesPerAsset, 23.75, 'Average should be formatted');

  // Verify critical and high counts
  assert.equal(formatted.assets.withCriticalVulnerabilities, 30, 'Should have 30 with critical');
  assert.equal(formatted.assets.withHighVulnerabilities, 45, 'Should have 45 with high');
});

test('formatStatistics handles null asset statistics', () => {
  const rawStats = {
    totalCount: 10,
    bySeverity: { HIGH: 10 },
    byIntegration: {},
    fixable: 5,
    notFixable: 5,
    active: 10,
    remediated: 0,
    uniqueAssets: 5,
    uniqueCves: 8,
    averageCvssBySeverity: {},
    lastSync: null,
    remediations: null,
    assets: null,
  };

  const formatted = formatStatistics(rawStats);

  assert.equal(formatted.assets, null, 'assets should be null when input is null');
});

test('formatStatistics handles assets with Unknown labels', () => {
  const rawStats = {
    totalCount: 10,
    bySeverity: {},
    byIntegration: {},
    fixable: 0,
    notFixable: 0,
    active: 0,
    remediated: 0,
    uniqueAssets: 0,
    uniqueCves: 0,
    averageCvssBySeverity: {},
    lastSync: null,
    remediations: null,
    assets: {
      total: 3,
      byType: {
        SERVER: 1,
        UNKNOWN: 2,
      },
      byIntegration: {
        qualys: 1,
        UNKNOWN: 2,
      },
      topVulnerable: [
        {
          id: 'asset-unknown',
          display_name: null,
          asset_type: null,
          vulnerability_count: 10,
          critical_count: 0,
          high_count: 0,
          medium_count: 0,
          low_count: 0,
        },
      ],
      averageVulnerabilitiesPerAsset: 5,
      withCriticalVulnerabilities: 0,
      withHighVulnerabilities: 0,
    },
  };

  const formatted = formatStatistics(rawStats);

  // Verify UNKNOWN type is handled (database uses UNKNOWN for null values)
  const unknownType = formatted.assets.byType.find(t => t.label === 'UNKNOWN');
  assert.ok(unknownType, 'Should have UNKNOWN type');
  assert.equal(unknownType.count, 2, 'UNKNOWN type count should be 2');

  // Verify UNKNOWN integration is handled (database uses UNKNOWN for null values)
  const unknownIntegration = formatted.assets.byIntegration.find(i => i.label === 'UNKNOWN');
  assert.ok(unknownIntegration, 'Should have UNKNOWN integration');
  assert.equal(unknownIntegration.count, 2, 'UNKNOWN integration count should be 2');

  // Verify top asset with null values
  const topAsset = formatted.assets.topVulnerable[0];
  assert.equal(topAsset.name, 'Unknown', 'Asset with null name should be "Unknown"');
  assert.equal(topAsset.type, 'Unknown', 'Asset with null type should be "Unknown"');
  assert.equal(topAsset.label, 'Unknown (Unknown)', 'Asset label should handle nulls');
});

test('formatStatistics sorts byType and byIntegration by count descending', () => {
  const rawStats = {
    totalCount: 0,
    bySeverity: {},
    byIntegration: {},
    fixable: 0,
    notFixable: 0,
    active: 0,
    remediated: 0,
    uniqueAssets: 0,
    uniqueCves: 0,
    averageCvssBySeverity: {},
    lastSync: null,
    remediations: null,
    assets: {
      total: 100,
      byType: {
        CONTAINER: 5,
        SERVER: 50,
        WORKSTATION: 30,
        APPLICATION: 15,
      },
      byIntegration: {
        snyk: 10,
        qualys: 60,
        tenable: 30,
      },
      topVulnerable: [],
      averageVulnerabilitiesPerAsset: 0,
      withCriticalVulnerabilities: 0,
      withHighVulnerabilities: 0,
    },
  };

  const formatted = formatStatistics(rawStats);

  // Verify byType is sorted by count descending
  assert.equal(formatted.assets.byType[0].label, 'SERVER', 'First type should be SERVER (50)');
  assert.equal(formatted.assets.byType[1].label, 'WORKSTATION', 'Second type should be WORKSTATION (30)');
  assert.equal(formatted.assets.byType[2].label, 'APPLICATION', 'Third type should be APPLICATION (15)');
  assert.equal(formatted.assets.byType[3].label, 'CONTAINER', 'Fourth type should be CONTAINER (5)');

  // Verify byIntegration is sorted by count descending
  assert.equal(formatted.assets.byIntegration[0].label, 'qualys', 'First integration should be qualys (60)');
  assert.equal(formatted.assets.byIntegration[1].label, 'tenable', 'Second integration should be tenable (30)');
  assert.equal(formatted.assets.byIntegration[2].label, 'snyk', 'Third integration should be snyk (10)');
});

test('formatStatistics rounds average vulnerabilities to 2 decimal places', () => {
  const rawStats = {
    totalCount: 0,
    bySeverity: {},
    byIntegration: {},
    fixable: 0,
    notFixable: 0,
    active: 0,
    remediated: 0,
    uniqueAssets: 0,
    uniqueCves: 0,
    averageCvssBySeverity: {},
    lastSync: null,
    remediations: null,
    assets: {
      total: 3,
      byType: {},
      byIntegration: {},
      topVulnerable: [],
      averageVulnerabilitiesPerAsset: 23.756789,
      withCriticalVulnerabilities: 0,
      withHighVulnerabilities: 0,
    },
  };

  const formatted = formatStatistics(rawStats);

  assert.equal(formatted.assets.averageVulnerabilitiesPerAsset, 23.76, 'Average should be rounded to 2 decimal places');
});

test('formatStatistics handles percentage calculations with zero total', () => {
  const rawStats = {
    totalCount: 0,
    bySeverity: {},
    byIntegration: {},
    fixable: 0,
    notFixable: 0,
    active: 0,
    remediated: 0,
    uniqueAssets: 0,
    uniqueCves: 0,
    averageCvssBySeverity: {},
    lastSync: null,
    remediations: null,
    assets: {
      total: 0,
      byType: {},
      byIntegration: {},
      topVulnerable: [],
      averageVulnerabilitiesPerAsset: 0,
      withCriticalVulnerabilities: 0,
      withHighVulnerabilities: 0,
    },
  };

  const formatted = formatStatistics(rawStats);

  // Should handle division by zero gracefully
  assert.ok(formatted.assets, 'Should have assets object');
  assert.deepEqual(formatted.assets.byType, [], 'byType should be empty array');
  assert.deepEqual(formatted.assets.byIntegration, [], 'byIntegration should be empty array');
});
