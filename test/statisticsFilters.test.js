const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStatisticsFilters } = require('../src/renderer/statisticsFilters');

test('buildStatisticsFilters returns empty object when no filters applied', () => {
  const result = buildStatisticsFilters({});
  assert.deepEqual(result, {});
});

test('buildStatisticsFilters ignores active-only filters', () => {
  const filters = {
    status: 'active',
    severity: ['HIGH'],
    integration: 'aws',
  };

  const result = buildStatisticsFilters(filters);

  assert.deepEqual(result, {});
});
