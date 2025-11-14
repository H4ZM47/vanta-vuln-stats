const toSortedArray = (counts) => {
  return Object.entries(counts)
    .map(([key, value]) => ({ label: key || 'UNKNOWN', value }))
    .sort((a, b) => b.value - a.value);
};

const formatAssetDistribution = (distribution, total) => {
  return Object.entries(distribution)
    .map(([type, count]) => ({
      label: type || 'Unknown',
      count,
      percentage: total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0.0%',
    }))
    .sort((a, b) => b.count - a.count);
};

const formatTopAssets = (topAssets) => {
  return topAssets.map((asset) => ({
    id: asset.id,
    name: asset.display_name || 'Unknown',
    type: asset.asset_type || 'Unknown',
    vulnerabilityCount: asset.vulnerability_count,
    criticalCount: asset.critical_count,
    highCount: asset.high_count,
    mediumCount: asset.medium_count,
    lowCount: asset.low_count,
    criticalAndHigh: asset.critical_count + asset.high_count,
    label: `${asset.display_name || 'Unknown'} (${asset.asset_type || 'Unknown'})`,
  }));
};

const formatAssetMetrics = (assetStats) => {
  if (!assetStats) {
    return null;
  }

  return {
    total: assetStats.total ?? 0,
    byType: formatAssetDistribution(assetStats.byType ?? {}, assetStats.total ?? 0),
    byIntegration: formatAssetDistribution(assetStats.byIntegration ?? {}, assetStats.total ?? 0),
    topVulnerable: formatTopAssets(assetStats.topVulnerable ?? []),
    averageVulnerabilitiesPerAsset: assetStats.averageVulnerabilitiesPerAsset
      ? Number(assetStats.averageVulnerabilitiesPerAsset.toFixed(2))
      : 0,
    withCriticalVulnerabilities: assetStats.withCriticalVulnerabilities ?? 0,
    withHighVulnerabilities: assetStats.withHighVulnerabilities ?? 0,
  };
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
    assets: formatAssetMetrics(stats.assets),
  };
};

module.exports = { formatStatistics };
