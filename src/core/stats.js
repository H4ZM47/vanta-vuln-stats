const toSortedArray = (counts) => {
  return Object.entries(counts)
    .map(([key, value]) => ({ label: key || 'UNKNOWN', value }))
    .sort((a, b) => b.value - a.value);
};

const formatStatistics = (stats) => ({
  totalCount: stats.totalCount ?? 0,
  bySeverity: toSortedArray(stats.bySeverity ?? {}),
  byIntegration: toSortedArray(stats.byIntegration ?? {}),
  fixable: stats.fixable ?? 0,
  notFixable: stats.notFixable ?? 0,
  active: stats.active ?? 0,
  deactivated: stats.deactivated ?? 0,
  uniqueAssets: stats.uniqueAssets ?? 0,
  uniqueCves: stats.uniqueCves ?? 0,
  averageCvssBySeverity: Object.entries(stats.averageCvssBySeverity ?? {}).map(([severity, value]) => ({
    severity,
    value,
  })),
  lastSync: stats.lastSync ?? null,
});

module.exports = { formatStatistics };
