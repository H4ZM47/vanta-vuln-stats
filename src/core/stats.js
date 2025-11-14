const toSortedArray = (counts) => {
  return Object.entries(counts)
    .map(([key, value]) => ({ label: key || 'UNKNOWN', value }))
    .sort((a, b) => b.value - a.value);
};

const formatStatistics = (stats) => {
  const remediationStats = stats.remediations;

  const resolvedStatus = remediationStats?.byStatus ?? {
    remediated: remediationStats?.remediated ?? 0,
    overdue: remediationStats?.overdue ?? 0,
    open: remediationStats?.open ?? 0,
  };

  const resolvedTimeliness = remediationStats?.byTimeliness ?? {
    onTime: remediationStats?.onTime ?? 0,
    late: remediationStats?.late ?? 0,
    pending: remediationStats?.pending ?? 0,
  };

  return {
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
    remediations: remediationStats
      ? {
          total: remediationStats.total ?? 0,
          withMatchingVulnerability: remediationStats.withMatchingVulnerability ?? 0,
          withoutMatchingVulnerability: remediationStats.withoutMatchingVulnerability ?? 0,
          byStatus: {
            remediated: resolvedStatus.remediated ?? 0,
            overdue: resolvedStatus.overdue ?? 0,
            open: resolvedStatus.open ?? 0,
          },
          byTimeliness: {
            onTime: resolvedTimeliness.onTime ?? 0,
            late: resolvedTimeliness.late ?? 0,
            pending: resolvedTimeliness.pending ?? 0,
          },
        }
      : null,
  };
};

module.exports = { formatStatistics };
