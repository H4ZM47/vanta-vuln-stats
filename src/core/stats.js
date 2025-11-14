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
  remediated: stats.remediated ?? 0,
  deactivated: stats.deactivated ?? 0, // Keep for backward compatibility
  uniqueAssets: stats.uniqueAssets ?? 0,
  uniqueCves: stats.uniqueCves ?? 0,
  averageCvssBySeverity: Object.entries(stats.averageCvssBySeverity ?? {}).map(([severity, value]) => ({
    severity,
    value,
  })),
  lastSync: stats.lastSync ?? null,
  remediations: stats.remediations ? {
    total: stats.remediations.total ?? 0,
    withMatchingVulnerability: stats.remediations.withMatchingVulnerability ?? 0,
    withoutMatchingVulnerability: stats.remediations.withoutMatchingVulnerability ?? 0,
    byStatus: {
      remediated: stats.remediations.remediated ?? 0,
      overdue: stats.remediations.overdue ?? 0,
      open: stats.remediations.open ?? 0,
    },
    byTimeliness: {
      onTime: stats.remediations.onTime ?? 0,
      late: stats.remediations.late ?? 0,
      pending: stats.remediations.pending ?? 0,
    },
  } : null,
});

module.exports = { formatStatistics };
