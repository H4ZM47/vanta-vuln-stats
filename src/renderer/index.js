const PAGE_SIZE = 25;

// Utility functions
const escapeHtml = (value) => {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const elements = {
  // Tab navigation
  tabButtons: document.querySelectorAll('.tab-button'),
  vulnerabilitiesTab: document.getElementById('vulnerabilitiesTab'),
  settingsTab: document.getElementById('settingsTab'),

  // Explorer tab navigation
  explorerTabButtons: document.querySelectorAll('.explorer-tab-button'),
  explorerListTab: document.getElementById('explorerListTab'),
  explorerAssetTab: document.getElementById('explorerAssetTab'),
  explorerCveTab: document.getElementById('explorerCveTab'),

  // Asset view
  assetSearch: document.getElementById('assetSearch'),
  assetList: document.getElementById('assetList'),
  assetCount: document.getElementById('assetCount'),
  assetVulnTitle: document.getElementById('assetVulnTitle'),
  assetVulnTable: document.getElementById('assetVulnTable'),
  assetMetaCard: document.getElementById('assetMetaCard'),
  assetMetaName: document.getElementById('assetMetaName'),
  assetMetaId: document.getElementById('assetMetaId'),
  assetMetaBadges: document.getElementById('assetMetaBadges'),
  assetMetaIntegration: document.getElementById('assetMetaIntegration'),
  assetMetaOwner: document.getElementById('assetMetaOwner'),
  assetMetaType: document.getElementById('assetMetaType'),
  assetMetaEnvironment: document.getElementById('assetMetaEnvironment'),
  assetMetaPlatform: document.getElementById('assetMetaPlatform'),
  assetMetaLastSeen: document.getElementById('assetMetaLastSeen'),
  prevAssetPage: document.getElementById('prevAssetPage'),
  nextAssetPage: document.getElementById('nextAssetPage'),
  assetPaginationStatus: document.getElementById('assetPaginationStatus'),
  assetPageSize: document.getElementById('assetPageSize'),

  // CVE view
  cveSearch: document.getElementById('cveSearch'),
  cveList: document.getElementById('cveList'),
  cveCount: document.getElementById('cveCount'),
  cveAssetTitle: document.getElementById('cveAssetTitle'),
  cveAssetTable: document.getElementById('cveAssetTable'),
  prevCvePage: document.getElementById('prevCvePage'),
  nextCvePage: document.getElementById('nextCvePage'),
  cvePaginationStatus: document.getElementById('cvePaginationStatus'),
  cvePageSize: document.getElementById('cvePageSize'),

  reportForm: document.getElementById('reportForm'),
  reportFormat: document.getElementById('reportFormat'),
  includeRemediations: document.getElementById('includeRemediations'),
  applyFilters: document.getElementById('applyFilters'),
  reportStatus: document.getElementById('reportStatus'),

  // Credentials
  clientId: document.getElementById('clientId'),
  clientSecret: document.getElementById('clientSecret'),
  saveCredentials: document.getElementById('saveCredentials'),
  credentialsStatus: document.getElementById('credentialsStatus'),

  // Sync controls
  startSyncButton: document.getElementById('startSyncButton'),
  pauseSyncButton: document.getElementById('pauseSyncButton'),
  resumeSyncButton: document.getElementById('resumeSyncButton'),
  stopSyncButton: document.getElementById('stopSyncButton'),
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toastMessage'),

  // Statistics and history
  statistics: document.getElementById('statistics'),
  syncHistoryLog: document.getElementById('syncHistoryLog'),
  syncHistoryEmpty: document.getElementById('syncHistoryEmpty'),

  // Filters
  filtersForm: document.getElementById('filters'),
  severity: document.getElementById('severity'),
  status: document.getElementById('status'),
  fixable: document.getElementById('fixable'),
  integration: document.getElementById('integration'),
  assetId: document.getElementById('assetId'),
  cve: document.getElementById('cve'),
  dateIdentifiedStart: document.getElementById('dateIdentifiedStart'),
  dateIdentifiedEnd: document.getElementById('dateIdentifiedEnd'),
  dateRemediatedStart: document.getElementById('dateRemediatedStart'),
  dateRemediatedEnd: document.getElementById('dateRemediatedEnd'),
  clearFilters: document.getElementById('clearFilters'),

  // Vulnerability table
  vulnerabilityTable: document.getElementById('vulnerabilityTable'),
  paginationStatus: document.getElementById('paginationStatus'),
  prevPage: document.getElementById('prevPage'),
  nextPage: document.getElementById('nextPage'),

  // Details
  vulnerabilityDetails: document.getElementById('vulnerabilityDetails'),
  remediationDetails: document.getElementById('remediationDetails'),
  detailsSubtitle: document.getElementById('detailsSubtitle'),

  // Database
  databasePath: document.getElementById('databasePath'),
  selectDatabaseButton: document.getElementById('selectDatabaseButton'),
  resetDatabaseButton: document.getElementById('resetDatabaseButton'),
  databaseStatus: document.getElementById('databaseStatus'),
};

let statisticsFiltersBuilder = () => ({});
if (typeof window !== 'undefined' && window.VantaStatisticsFilters?.buildStatisticsFilters) {
  statisticsFiltersBuilder = window.VantaStatisticsFilters.buildStatisticsFilters;
} else if (typeof console !== 'undefined' && console.warn) {
  console.warn('Statistics filters helper not found; using default summary filters.');
}

const defaultFilters = () => ({
  severity: [],
  status: 'all',
  fixable: 'any',
  integration: '',
  assetId: '',
  cve: '',
  dateIdentifiedStart: '',
  dateIdentifiedEnd: '',
  dateRemediatedStart: '',
  dateRemediatedEnd: '',
});

const state = {
  filters: defaultFilters(),
  page: 1,
  total: 0,
  vulnerabilities: [],
  selectedId: null,
  sortColumn: 'first_detected',
  sortDirection: 'desc',
  syncState: 'idle', // idle, running, paused, stopping
  explorerTab: 'list', // list, by-asset, by-cve
  assets: [],
  selectedAsset: null,
  assetSearchTerm: '',
  assetPage: 1,
  assetPageSize: 25,
  assetCache: null,
  assetCacheFilters: null,
  assetDetails: new Map(),
  cves: [],
  selectedCve: null,
  cveSearchTerm: '',
  cvePage: 1,
  cvePageSize: 25,
  cveCache: null,
  cveCacheFilters: null,
};

const toISODate = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return date.toISOString();
};

const formatNumber = (value) => value?.toLocaleString?.() ?? '0';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatDateTime = (value) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const switchTab = (tabName) => {
  // Update tab buttons
  elements.tabButtons.forEach((button) => {
    if (button.getAttribute('data-tab') === tabName) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });

  // Update tab content - rely on CSS classes, not inline styles
  if (tabName === 'vulnerabilities') {
    elements.vulnerabilitiesTab.classList.add('active');
    elements.settingsTab.classList.remove('active');
  } else if (tabName === 'settings') {
    elements.settingsTab.classList.add('active');
    elements.vulnerabilitiesTab.classList.remove('active');
  }
};

const switchExplorerTab = (tabName) => {
  state.explorerTab = tabName;

  // Update tab buttons
  elements.explorerTabButtons.forEach((button) => {
    if (button.getAttribute('data-explorer-tab') === tabName) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });

  // Update tab content
  if (tabName === 'list') {
    elements.explorerListTab.classList.add('active');
    elements.explorerAssetTab.classList.remove('active');
    elements.explorerCveTab.classList.remove('active');
  } else if (tabName === 'by-asset') {
    elements.explorerListTab.classList.remove('active');
    elements.explorerAssetTab.classList.add('active');
    elements.explorerCveTab.classList.remove('active');
    loadAssets();
  } else if (tabName === 'by-cve') {
    elements.explorerListTab.classList.remove('active');
    elements.explorerAssetTab.classList.remove('active');
    elements.explorerCveTab.classList.add('active');
    loadCVEs();
  }
};

const showToast = (message, type = 'error', duration = 5000) => {
  elements.toastMessage.textContent = message;
  elements.toast.className = `toast toast-${type}`;
  elements.toast.style.display = 'block';

  // Auto-hide after duration
  setTimeout(() => {
    elements.toast.style.display = 'none';
  }, duration);
};

const updateSyncButtons = (syncState) => {
  state.syncState = syncState;

  // Hide all buttons first
  elements.startSyncButton.style.display = 'none';
  elements.pauseSyncButton.style.display = 'none';
  elements.resumeSyncButton.style.display = 'none';
  elements.stopSyncButton.style.display = 'none';

  // Show appropriate buttons based on state
  switch (syncState) {
    case 'idle':
      elements.startSyncButton.style.display = 'inline-block';
      break;
    case 'running':
      elements.pauseSyncButton.style.display = 'inline-block';
      elements.stopSyncButton.style.display = 'inline-block';
      break;
    case 'paused':
      elements.resumeSyncButton.style.display = 'inline-block';
      elements.stopSyncButton.style.display = 'inline-block';
      break;
    case 'stopping':
      // No buttons shown while stopping
      break;
  }
};

const renderStatistics = (stats) => {
  if (!stats) {
    elements.statistics.innerHTML = '<p>No data available. Run a sync to populate the database.</p>';
    return;
  }

  const severityList = stats.bySeverity
    .map((item) => `<div class="list-item"><span>${item.label}</span><strong>${formatNumber(item.value)}</strong></div>`)
    .join('') || '<p>No severity data.</p>';

  const integrationList = stats.byIntegration
    .slice(0, 8)
    .map((item) => `<div class="list-item"><span>${item.label}</span><strong>${formatNumber(item.value)}</strong></div>`)
    .join('') || '<p>No integration data.</p>';

  const averageList = stats.averageCvssBySeverity
    .map((item) => {
      const score = Number.isFinite(item.value) ? item.value.toFixed(2) : '—';
      return `<div class="list-item"><span>${item.severity.toUpperCase()}</span><strong>${score}</strong></div>`;
    })
    .join('') || '<p>No CVSS scores recorded.</p>';

  // Format asset statistics if available
  let assetStatsSection = '';
  if (stats.assets && stats.assets.total > 0) {
    const assetsByType = stats.assets.byType
      .slice(0, 5)
      .map((item) => `<div class="list-item"><span>${escapeHtml(item.label)}</span><strong>${formatNumber(item.count)} (${item.percentage})</strong></div>`)
      .join('') || '<p>No asset type data.</p>';

    const topVulnerableAssets = stats.assets.topVulnerable
      .slice(0, 3)
      .map((asset, index) => {
        const criticalAndHigh = asset.criticalAndHigh;
        const criticalAndHighLabel = criticalAndHigh > 0 ? ` (${formatNumber(criticalAndHigh)} critical/high)` : '';
        return `<div class="list-item"><span>${index + 1}. ${escapeHtml(asset.name)}</span><strong>${formatNumber(asset.vulnerabilityCount)} vulns${criticalAndHighLabel}</strong></div>`;
      })
      .join('') || '<p>No vulnerable assets found.</p>';

    assetStatsSection = `
      <div class="stat-card asset-stats-card">
        <h3>Vulnerable Assets</h3>
        <div class="asset-stats-summary">
          <div class="asset-stats-total">
            <strong>${formatNumber(stats.assets.total)}</strong>
            <span>Total Assets</span>
          </div>
          <div class="asset-stats-average">
            <strong>${stats.assets.averageVulnerabilitiesPerAsset.toFixed(1)}</strong>
            <span>Avg Vulns/Asset</span>
          </div>
        </div>
        <div style="margin-top: 1rem;">
          <h4 style="font-size: 0.875rem; margin-bottom: 0.5rem; color: rgba(148, 163, 184, 1);">By Type</h4>
          <div class="list-group">${assetsByType}</div>
        </div>
        <div style="margin-top: 1rem;">
          <h4 style="font-size: 0.875rem; margin-bottom: 0.5rem; color: rgba(148, 163, 184, 1);">Top Vulnerable</h4>
          <div class="list-group">${topVulnerableAssets}</div>
        </div>
      </div>
    `;
  }

  elements.statistics.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <h3>Total Vulnerabilities</h3>
        <strong>${formatNumber(stats.totalCount)}</strong>
        <p>Last sync: ${formatDateTime(stats.lastSync)}</p>
      </div>
      <div class="stat-card">
        <h3>Active vs Remediated</h3>
        <strong>${formatNumber(stats.active)} active / ${formatNumber(stats.deactivated)} remediated</strong>
      </div>
      <div class="stat-card">
        <h3>Fixability</h3>
        <strong>${formatNumber(stats.fixable)} fixable / ${formatNumber(stats.notFixable)} not fixable</strong>
      </div>
      <div class="stat-card">
        <h3>Unique Assets & CVEs</h3>
        <strong>${formatNumber(stats.uniqueAssets)} assets / ${formatNumber(stats.uniqueCves)} CVEs</strong>
      </div>
    </div>
    ${assetStatsSection}
    <div class="grid two-columns" style="margin-top: 1.5rem; gap: 1.5rem;">
      <div>
        <h3>By Severity</h3>
        <div class="list-group">${severityList}</div>
      </div>
      <div>
        <h3>By Integration</h3>
        <div class="list-group">${integrationList}</div>
      </div>
    </div>
    <div style="margin-top: 1.5rem;">
      <h3>Average CVSS by Severity</h3>
      <div class="list-group">${averageList}</div>
    </div>
  `;
};

const renderSyncHistory = (history) => {
  const hasHistory = Array.isArray(history) && history.length > 0;

  elements.syncHistoryLog.style.display = hasHistory ? 'flex' : 'none';
  elements.syncHistoryEmpty.style.display = hasHistory ? 'none' : 'block';

  if (!hasHistory) {
    elements.syncHistoryLog.innerHTML = '';
    return;
  }

  const orderedHistory = [...history].reverse();
  elements.syncHistoryLog.innerHTML = orderedHistory
    .map((item) => {
      const timestamp = formatDateTime(item.sync_date);
      let message = '';
      let eventClass = '';

      // Handle new verbose event types
      if (item.event_type) {
        const eventType = item.event_type;
        eventClass = `sync-log-${eventType}`;

        // Use the message from the database
        message = item.message || '';

        // Add additional details for specific event types
        if (eventType === 'flush') {
          const details = item.details ? JSON.parse(item.details) : null;
          if (details) {
            let stats = '';
            if (details.type === 'vulnerabilities') {
              stats = `(new: ${item.vulnerabilities_new || 0}, updated: ${item.vulnerabilities_updated || 0}, remediated: ${item.vulnerabilities_remediated || 0})`;
            } else if (details.type === 'remediations') {
              stats = `(new: ${item.remediations_new || 0}, updated: ${item.remediations_updated || 0})`;
            } else if (details.type === 'assets') {
              stats = `(new: ${item.assets_new || 0}, updated: ${item.assets_updated || 0})`;
            }
            message += ` ${stats}`;
          }
        } else if (eventType === 'complete') {
          const vulnTotal = item.vulnerabilities_count || 0;
          const remTotal = item.remediations_count || 0;
          const assetTotal = item.assets_count || 0;
          const assetSummary = assetTotal || item.assets_new || item.assets_updated
            ? ` | Assets: ${formatNumber(assetTotal)} (new: ${item.assets_new || 0}, updated: ${item.assets_updated || 0})`
            : '';
          message += ` — Vulnerabilities: ${formatNumber(vulnTotal)} (new: ${item.vulnerabilities_new || 0}, updated: ${item.vulnerabilities_updated || 0}, remediated: ${item.vulnerabilities_remediated || 0}) | Remediations: ${formatNumber(remTotal)} (new: ${item.remediations_new || 0}, updated: ${item.remediations_updated || 0})${assetSummary}`;
        }
      } else {
        // Legacy format for old entries without event_type
        eventClass = 'sync-log-complete';
        const segments = [];

        if (item.vulnerabilities_count !== undefined && item.vulnerabilities_count !== null) {
          const vulnParts = [
            `total ${formatNumber(item.vulnerabilities_count)}`,
            `new ${formatNumber(item.vulnerabilities_new || 0)}`,
            `updated ${formatNumber(item.vulnerabilities_updated || 0)}`,
          ];
          if (item.vulnerabilities_remediated !== undefined && item.vulnerabilities_remediated !== null) {
            vulnParts.push(`remediated ${formatNumber(item.vulnerabilities_remediated || 0)}`);
          }
          segments.push(`Vulnerabilities ${vulnParts.join(', ')}`);
        }

        if (item.remediations_count !== undefined && item.remediations_count !== null) {
          const remParts = [
            `total ${formatNumber(item.remediations_count)}`,
            `new ${formatNumber(item.remediations_new || 0)}`,
            `updated ${formatNumber(item.remediations_updated || 0)}`,
          ];
          segments.push(`Remediations ${remParts.join(', ')}`);
        }

        if (item.assets_count !== undefined && item.assets_count !== null) {
          const assetParts = [
            `total ${formatNumber(item.assets_count)}`,
            `new ${formatNumber(item.assets_new || 0)}`,
            `updated ${formatNumber(item.assets_updated || 0)}`,
          ];
          segments.push(`Assets ${assetParts.join(', ')}`);
        }

        message = segments.length ? `Sync completed — ${segments.join(' | ')}` : 'Sync completed.';
      }

      return `
        <div class="sync-log-line ${eventClass}">
          <span class="sync-log-timestamp">[${timestamp}]</span>
          <span class="sync-log-message">${message}</span>
        </div>
      `;
    })
    .join('');

  elements.syncHistoryLog.scrollTop = elements.syncHistoryLog.scrollHeight;
};

const renderVulnerabilities = () => {
  if (!state.vulnerabilities.length) {
    elements.vulnerabilityTable.innerHTML = '<tr><td colspan="8">No vulnerabilities match your filters.</td></tr>';
    return;
  }

  elements.vulnerabilityTable.innerHTML = state.vulnerabilities
    .map((item) => {
      const isRemediated = item.deactivated_on;
      const statusLabel = isRemediated ? 'Remediated' : 'Active';
      const statusClass = isRemediated ? 'status-chip remediated' : 'status-chip active';
      const statusIcon = isRemediated ? '✓' : '●';
      const severityClass = item.severity ? `severity-chip ${item.severity}` : '';
      const isSelected = state.selectedId === item.id ? 'selected' : '';
      const assetDisplay = item.asset_name
        ? `<div>${escapeHtml(item.asset_name)}</div><span class="table-subtext">${escapeHtml(item.target_id || '—')}</span>`
        : escapeHtml(item.target_id || '—');
      const externalUrlDisplay = item.external_url
        ? `<a href="${escapeHtml(item.external_url)}" target="_blank" rel="noopener noreferrer">View</a>`
        : '—';
      return `
        <tr data-id="${item.id}" class="${isSelected}">
          <td>${escapeHtml(item.id)}</td>
          <td>${escapeHtml(item.name || '—')}</td>
          <td><span class="${severityClass}">${escapeHtml(item.severity || 'UNKNOWN')}</span></td>
          <td>${escapeHtml(item.integration_id || '—')}</td>
          <td>${assetDisplay}</td>
          <td>${formatDate(item.first_detected)}</td>
          <td><span class="${statusClass}">${statusIcon} ${statusLabel}</span></td>
          <td>${externalUrlDisplay}</td>
        </tr>
      `;
    })
    .join('');
};

const renderSortIndicators = () => {
  // Clear all indicators first
  document.querySelectorAll('.data-table thead th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
    const indicator = th.querySelector('.sort-indicator');
    if (indicator) {
      indicator.textContent = '';
    }
  });

  // Add indicator to current sort column
  const currentHeader = document.querySelector(`.data-table thead th[data-column="${state.sortColumn}"]`);
  if (currentHeader) {
    const indicator = currentHeader.querySelector('.sort-indicator');
    if (indicator) {
      indicator.textContent = state.sortDirection === 'asc' ? '▲' : '▼';
    }
    currentHeader.classList.add(state.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
  }
};

const renderPagination = () => {
  const start = (state.page - 1) * PAGE_SIZE + 1;
  const end = Math.min(state.page * PAGE_SIZE, state.total);
  const text = state.total ? `Showing ${start}-${end} of ${formatNumber(state.total)} results` : 'No results';
  elements.paginationStatus.textContent = text;
  elements.prevPage.disabled = state.page === 1;
  elements.nextPage.disabled = state.page * PAGE_SIZE >= state.total;
};

const renderDetails = (vulnerability, remediations) => {
  if (!vulnerability) {
    elements.vulnerabilityDetails.textContent = 'No vulnerability selected.';
    elements.remediationDetails.textContent = 'No vulnerability selected.';
    elements.detailsSubtitle.textContent = 'Select a vulnerability to inspect its full payload and remediation history.';
    return;
  }

  elements.detailsSubtitle.textContent = `Details for ${vulnerability.name || vulnerability.id}`;
  elements.vulnerabilityDetails.textContent = JSON.stringify(vulnerability, null, 2);

  if (!remediations?.length) {
    elements.remediationDetails.textContent = 'No remediation history recorded for this vulnerability.';
  } else {
    elements.remediationDetails.textContent = remediations
      .map((item) => `${formatDate(item.remediationDate || item.detectedDate)} — ${item.status || 'Unknown status'}`)
      .join('\n');
  }
};

const renderAssets = () => {
  const searchTerm = state.assetSearchTerm.toLowerCase();
  const filteredAssets = state.assets.filter((asset) => {
    const haystack = `${asset.assetId || ''} ${asset.assetName || ''}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  if (!filteredAssets.length) {
    elements.assetList.innerHTML = '<li style="padding: 2rem; text-align: center; color: rgba(148, 163, 184, 0.6);">No assets found</li>';
    elements.assetCount.textContent = '0 assets';
    elements.assetPaginationStatus.textContent = '';
    elements.prevAssetPage.disabled = true;
    elements.nextAssetPage.disabled = true;
    return;
  }

  // Pagination
  const start = (state.assetPage - 1) * state.assetPageSize;
  const end = start + state.assetPageSize;
  const paginatedAssets = filteredAssets.slice(start, end);

  elements.assetList.innerHTML = paginatedAssets
    .map((asset) => {
      const isSelected = state.selectedAsset === asset.assetId ? 'selected' : '';
      const displayName = asset.assetName || asset.assetId || 'Unknown Asset';
      const idLine =
        asset.assetName && asset.assetId
          ? `<div class="item-id">${escapeHtml(asset.assetId)}</div>`
          : '';
      const metaParts = [];
      if (asset.assetType) metaParts.push(asset.assetType);
      if (asset.assetPlatform) metaParts.push(asset.assetPlatform);
      if (asset.assetEnvironment) metaParts.push(asset.assetEnvironment);
      const metaLine = metaParts.length ? `<div class="item-meta">${escapeHtml(metaParts.join(' · '))}</div>` : '';
      const lastSeen = asset.lastSeen ? ` • Last seen ${formatDate(asset.lastSeen)}` : '';
      return `
        <li class="${isSelected}" data-asset-id="${escapeHtml(asset.assetId)}">
          <div class="item-name">${escapeHtml(displayName)}</div>
          ${idLine}
          ${metaLine}
          <div class="item-count">${formatNumber(asset.vulnerabilityCount)} vulnerabilities (${formatNumber(asset.activeCount)} active, ${formatNumber(asset.remediatedCount)} remediated)${lastSeen}</div>
        </li>
      `;
    })
    .join('');

  elements.assetCount.textContent = `${formatNumber(filteredAssets.length)} assets`;

  // Update pagination controls
  const displayStart = start + 1;
  const displayEnd = Math.min(end, filteredAssets.length);
  elements.assetPaginationStatus.textContent = `${displayStart}-${displayEnd}`;
  elements.prevAssetPage.disabled = state.assetPage === 1;
  elements.nextAssetPage.disabled = end >= filteredAssets.length;
};

const renderAssetMetadata = (assetId, assetDetails) => {
  if (!elements.assetMetaCard) {
    return;
  }

  if (!assetId) {
    elements.assetMetaName.textContent = 'No asset selected';
    elements.assetMetaId.textContent = 'Choose an asset from the list';
    elements.assetMetaIntegration.textContent = '—';
    elements.assetMetaOwner.textContent = '—';
    elements.assetMetaType.textContent = '—';
    elements.assetMetaEnvironment.textContent = '—';
    elements.assetMetaPlatform.textContent = '—';
    elements.assetMetaLastSeen.textContent = '—';
    elements.assetMetaBadges.innerHTML = '';
    return;
  }

  const summary = state.assets.find((asset) => asset.assetId === assetId) || {};
  const metadata = assetDetails ?? state.assetDetails.get(assetId) ?? null;
  const displayName = metadata?.name || summary.assetName || assetId || 'Unknown Asset';
  const externalIdentifier = metadata?.external_identifier || summary.externalIdentifier || null;
  const integrationId = metadata?.integration_id || summary.assetIntegrationId || null;
  const integrationType = metadata?.integration_type || summary.assetIntegrationType || null;
  const owner =
    metadata?.primary_owner ||
    (Array.isArray(metadata?.owners) ? metadata.owners[0] : null) ||
    summary.primaryOwner ||
    null;
  const risk = metadata?.risk_level || null;
  const subtype = metadata?.asset_subtype || summary.assetSubtype || null;

  const badgeValues = [risk, subtype].filter(Boolean);
  elements.assetMetaBadges.innerHTML = badgeValues
    .map((badge) => `<span class="asset-badge">${escapeHtml(String(badge))}</span>`)
    .join('');

  elements.assetMetaName.textContent = displayName;
  elements.assetMetaId.textContent = externalIdentifier
    ? `${assetId} • ${externalIdentifier}`
    : assetId;
  elements.assetMetaIntegration.textContent = [integrationType, integrationId].filter(Boolean).join(' • ') || '—';
  elements.assetMetaOwner.textContent = owner || '—';
  elements.assetMetaType.textContent =
    metadata?.asset_type || summary.assetType || '—';
  elements.assetMetaEnvironment.textContent =
    metadata?.environment || summary.assetEnvironment || '—';
  elements.assetMetaPlatform.textContent =
    metadata?.platform || summary.assetPlatform || '—';
  const lastSeen = metadata?.last_seen || summary.lastSeen;
  elements.assetMetaLastSeen.textContent = lastSeen ? formatDateTime(lastSeen) : '—';
};

const renderAssetVulnerabilities = (vulnerabilities, assetDetails) => {
  if (!state.selectedAsset) {
    elements.assetVulnTable.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: rgba(148, 163, 184, 0.6);">Select an asset to view vulnerabilities</td></tr>';
    elements.assetVulnTitle.textContent = 'Select an asset';
    renderAssetMetadata(null, null);
    return;
  }

  elements.assetVulnTitle.textContent = `Vulnerabilities for ${state.selectedAsset}`;
  renderAssetMetadata(state.selectedAsset, assetDetails);

  if (!vulnerabilities || !vulnerabilities.length) {
    elements.assetVulnTable.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: rgba(148, 163, 184, 0.6);">No vulnerabilities found</td></tr>';
    return;
  }

  elements.assetVulnTable.innerHTML = vulnerabilities
    .map((vuln) => {
      const isRemediated = vuln.deactivated_on;
      const statusLabel = isRemediated ? 'Remediated' : 'Active';
      const statusClass = isRemediated ? 'status-chip remediated' : 'status-chip active';
      const statusIcon = isRemediated ? '✓' : '●';
      const severityClass = vuln.severity ? `severity-chip ${escapeHtml(vuln.severity)}` : '';
      return `
        <tr data-vuln-id="${escapeHtml(vuln.id)}">
          <td>${escapeHtml(vuln.name) || '—'}</td>
          <td><span class="${severityClass}">${escapeHtml(vuln.severity) || 'UNKNOWN'}</span></td>
          <td>${formatDate(vuln.first_detected)}</td>
          <td><span class="${statusClass}">${statusIcon} ${statusLabel}</span></td>
        </tr>
      `;
    })
    .join('');
};

const renderCVEs = () => {
  const searchTerm = state.cveSearchTerm.toLowerCase();
  const filteredCVEs = state.cves.filter((cve) =>
    cve.cveName?.toLowerCase().includes(searchTerm) || cve.description?.toLowerCase().includes(searchTerm)
  );

  if (!filteredCVEs.length) {
    elements.cveList.innerHTML = '<li style="padding: 2rem; text-align: center; color: rgba(148, 163, 184, 0.6);">No CVEs found</li>';
    elements.cveCount.textContent = '0 CVEs';
    elements.cvePaginationStatus.textContent = '';
    elements.prevCvePage.disabled = true;
    elements.nextCvePage.disabled = true;
    return;
  }

  // Pagination
  const start = (state.cvePage - 1) * state.cvePageSize;
  const end = start + state.cvePageSize;
  const paginatedCVEs = filteredCVEs.slice(start, end);

  elements.cveList.innerHTML = paginatedCVEs
    .map((cve) => {
      const isSelected = state.selectedCve === cve.cveName ? 'selected' : '';
      const truncatedDesc = cve.description && cve.description.length > 100
        ? cve.description.substring(0, 100) + '...'
        : cve.description || 'No description available';
      return `
        <li class="${isSelected}" data-cve-name="${escapeHtml(cve.cveName)}">
          <div class="item-name">${escapeHtml(cve.cveName) || 'Unknown CVE'}</div>
          <div class="item-description">${escapeHtml(truncatedDesc)}</div>
          <div class="item-count">${formatNumber(cve.vulnerabilityCount)} assets affected (${formatNumber(cve.activeCount)} active, ${formatNumber(cve.remediatedCount)} remediated)</div>
        </li>
      `;
    })
    .join('');

  elements.cveCount.textContent = `${formatNumber(filteredCVEs.length)} CVEs`;

  // Update pagination controls
  const displayStart = start + 1;
  const displayEnd = Math.min(end, filteredCVEs.length);
  elements.cvePaginationStatus.textContent = `${displayStart}-${displayEnd}`;
  elements.prevCvePage.disabled = state.cvePage === 1;
  elements.nextCvePage.disabled = end >= filteredCVEs.length;
};

const renderCVEAssets = (assets) => {
  if (!state.selectedCve) {
    elements.cveAssetTable.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: rgba(148, 163, 184, 0.6);">Select a CVE to view affected assets</td></tr>';
    elements.cveAssetTitle.textContent = 'Select a CVE';
    return;
  }

  elements.cveAssetTitle.textContent = `Assets affected by ${state.selectedCve}`;

  if (!assets || !assets.length) {
    elements.cveAssetTable.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: rgba(148, 163, 184, 0.6);">No assets found</td></tr>';
    return;
  }

  elements.cveAssetTable.innerHTML = assets
    .map((asset) => {
      const isRemediated = asset.deactivated_on;
      const statusLabel = isRemediated ? 'Remediated' : 'Active';
      const statusClass = isRemediated ? 'status-chip remediated' : 'status-chip active';
      const statusIcon = isRemediated ? '✓' : '●';
      const severityClass = asset.severity ? `severity-chip ${escapeHtml(asset.severity)}` : '';
      const assetDisplay = asset.assetName
        ? `<div>${escapeHtml(asset.assetName)}</div><span class="table-subtext">${escapeHtml(asset.assetId || '—')}</span>`
        : escapeHtml(asset.assetId || '—');
      return `
        <tr data-vuln-id="${escapeHtml(asset.id)}">
          <td>${assetDisplay}</td>
          <td><span class="${severityClass}">${escapeHtml(asset.severity || 'UNKNOWN')}</span></td>
          <td>${formatDate(asset.first_detected)}</td>
          <td><span class="${statusClass}">${statusIcon} ${statusLabel}</span></td>
        </tr>
      `;
    })
    .join('');
};

const getFiltersFromInputs = () => ({
  severity: Array.from(elements.severity.selectedOptions).map((option) => option.value),
  status: elements.status.value,
  fixable: elements.fixable.value,
  integration: elements.integration.value.trim(),
  assetId: elements.assetId.value.trim(),
  cve: elements.cve.value.trim(),
  dateIdentifiedStart: toISODate(elements.dateIdentifiedStart.value),
  dateIdentifiedEnd: toISODate(elements.dateIdentifiedEnd.value),
  dateRemediatedStart: toISODate(elements.dateRemediatedStart.value),
  dateRemediatedEnd: toISODate(elements.dateRemediatedEnd.value),
});

const populateFilterInputs = () => {
  Array.from(elements.severity.options).forEach((option) => {
    option.selected = state.filters.severity.includes(option.value);
  });
  elements.status.value = state.filters.status;
  elements.fixable.value = state.filters.fixable;
  elements.integration.value = state.filters.integration;
  elements.assetId.value = state.filters.assetId;
  elements.cve.value = state.filters.cve;
  elements.dateIdentifiedStart.value = state.filters.dateIdentifiedStart ? state.filters.dateIdentifiedStart.slice(0, 10) : '';
  elements.dateIdentifiedEnd.value = state.filters.dateIdentifiedEnd ? state.filters.dateIdentifiedEnd.slice(0, 10) : '';
  elements.dateRemediatedStart.value = state.filters.dateRemediatedStart ? state.filters.dateRemediatedStart.slice(0, 10) : '';
  elements.dateRemediatedEnd.value = state.filters.dateRemediatedEnd ? state.filters.dateRemediatedEnd.slice(0, 10) : '';
};

const loadSettings = async () => {
  const settings = await window.vanta.getSettings();
  elements.clientId.value = settings.clientId ?? '';
  elements.clientSecret.value = settings.clientSecret ?? '';
};

const loadDatabasePath = async () => {
  const path = await window.vanta.getDatabasePath();
  elements.databasePath.textContent = path;
};

const loadStatistics = async () => {
  const summaryFilters = statisticsFiltersBuilder(state.filters);
  const stats = await window.vanta.getStatistics(summaryFilters);
  renderStatistics(stats);
};

const loadSyncHistory = async () => {
  const history = await window.vanta.getSyncHistory();
  renderSyncHistory(history);
};

const loadVulnerabilities = async () => {
  const offset = (state.page - 1) * PAGE_SIZE;
  const response = await window.vanta.listVulnerabilities({
    filters: state.filters,
    limit: PAGE_SIZE,
    offset,
    sortColumn: state.sortColumn,
    sortDirection: state.sortDirection,
  });
  state.vulnerabilities = response.data;
  state.total = response.total;
  renderVulnerabilities();
  renderPagination();
  renderSortIndicators();
};

const loadAssets = async () => {
  try {
    // Check cache
    const filtersKey = JSON.stringify(state.filters);
    if (state.assetCache && state.assetCacheFilters === filtersKey) {
      // Use cached data
      state.assets = state.assetCache;
      renderAssets();
      if (!state.selectedAsset) {
        renderAssetVulnerabilities(null);
      } else if (state.assets.every((asset) => asset.assetId !== state.selectedAsset)) {
        state.selectedAsset = null;
        renderAssetVulnerabilities(null);
      } else {
        renderAssetMetadata(state.selectedAsset, state.assetDetails.get(state.selectedAsset) || null);
      }
      return;
    }

    // Fetch fresh data
    elements.assetList.innerHTML = '<li style="padding: 2rem; text-align: center;">Loading assets...</li>';
    state.assets = await window.vanta.getAssets(state.filters);

    // Update cache
    state.assetCache = state.assets;
    state.assetCacheFilters = filtersKey;

    // Reset to first page when data changes
    state.assetPage = 1;

    renderAssets();
    if (!state.selectedAsset) {
      renderAssetVulnerabilities(null);
    } else if (state.assets.every((asset) => asset.assetId !== state.selectedAsset)) {
      state.selectedAsset = null;
      renderAssetVulnerabilities(null);
    } else {
      renderAssetMetadata(state.selectedAsset, state.assetDetails.get(state.selectedAsset) || null);
    }
  } catch (error) {
    console.error('Failed to load assets:', error);
    showToast(`Failed to load assets: ${error.message}`);
    elements.assetList.innerHTML = '<li style="padding: 2rem; text-align: center; color: rgba(248, 113, 113, 0.8);">Failed to load assets</li>';
  }
};

const selectAsset = async (assetId) => {
  try {
    state.selectedAsset = assetId;
    renderAssets();
    renderAssetMetadata(assetId, state.assetDetails.get(assetId) || null);
    elements.assetVulnTable.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">Loading vulnerabilities...</td></tr>';

    const [vulnerabilities, assetDetails] = await Promise.all([
      window.vanta.getVulnerabilitiesByAsset(assetId, state.filters),
      window.vanta.getAssetDetails(assetId).catch(() => null),
    ]);

    if (assetDetails) {
      state.assetDetails.set(assetId, assetDetails);
    }

    renderAssetVulnerabilities(vulnerabilities, assetDetails || null);
  } catch (error) {
    console.error('Failed to load asset vulnerabilities:', error);
    showToast(`Failed to load vulnerabilities for asset: ${error.message}`);
    elements.assetVulnTable.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: rgba(248, 113, 113, 0.8);">Failed to load vulnerabilities</td></tr>';
    renderAssetMetadata(null, null);
  }
};

const loadCVEs = async () => {
  try {
    // Check cache
    const filtersKey = JSON.stringify(state.filters);
    if (state.cveCache && state.cveCacheFilters === filtersKey) {
      // Use cached data
      state.cves = state.cveCache;
      renderCVEs();
      if (!state.selectedCve) {
        renderCVEAssets(null);
      }
      return;
    }

    // Fetch fresh data
    elements.cveList.innerHTML = '<li style="padding: 2rem; text-align: center;">Loading CVEs...</li>';
    state.cves = await window.vanta.getCVEs(state.filters);

    // Update cache
    state.cveCache = state.cves;
    state.cveCacheFilters = filtersKey;

    // Reset to first page when data changes
    state.cvePage = 1;

    renderCVEs();
    if (!state.selectedCve) {
      renderCVEAssets(null);
    }
  } catch (error) {
    console.error('Failed to load CVEs:', error);
    showToast(`Failed to load CVEs: ${error.message}`);
    elements.cveList.innerHTML = '<li style="padding: 2rem; text-align: center; color: rgba(248, 113, 113, 0.8);">Failed to load CVEs</li>';
  }
};

const selectCVE = async (cveName) => {
  try {
    state.selectedCve = cveName;
    renderCVEs();
    elements.cveAssetTable.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">Loading assets...</td></tr>';
    const assets = await window.vanta.getAssetsByCVE(cveName, state.filters);
    renderCVEAssets(assets);
  } catch (error) {
    console.error('Failed to load CVE assets:', error);
    showToast(`Failed to load assets for CVE: ${error.message}`);
    elements.cveAssetTable.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: rgba(248, 113, 113, 0.8);">Failed to load assets</td></tr>';
  }
};

const selectVulnerability = async (id) => {
  state.selectedId = id;
  renderVulnerabilities();
  if (!id) {
    renderDetails(null, []);
    return;
  }
  const [details, remediations] = await Promise.all([
    window.vanta.getVulnerabilityDetails(id),
    window.vanta.getRemediations(id),
  ]);
  renderDetails(details, remediations);
};

const resetDetails = () => {
  state.selectedId = null;
  renderVulnerabilities();
  renderDetails(null, []);
};

const handleTableClick = (event) => {
  const row = event.target.closest('tr[data-id]');
  if (!row) return;
  const id = row.getAttribute('data-id');
  selectVulnerability(id);
};

const handleColumnSort = async (event) => {
  const th = event.target.closest('th.sortable');
  if (!th) return;

  const column = th.getAttribute('data-column');
  if (!column) return;

  // Toggle direction if clicking the same column, otherwise default to descending
  if (state.sortColumn === column) {
    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortColumn = column;
    state.sortDirection = 'desc';
  }

  // Reset to first page when sorting changes
  state.page = 1;

  // Update indicators immediately for responsive UI
  renderSortIndicators();

  await loadVulnerabilities();
  resetDetails();
};

const generateCSVReport = (vulnerabilities, remediationsMap, includeRemediations) => {
  const headers = [
    'ID',
    'Name',
    'Severity',
    'CVSS Score',
    'Status',
    'Fixable',
    'Integration',
    'Asset ID',
    'First Detected',
    'Deactivated On',
    'CVE',
    'Description',
  ];

  if (includeRemediations) {
    headers.push('Remediations Count', 'Latest Remediation Date', 'Remediation Status');
  }

  const escapeCSV = (value) => {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [headers.map(escapeCSV).join(',')];

  vulnerabilities.forEach((vuln) => {
    const row = [
      vuln.id,
      vuln.name,
      vuln.severity,
      vuln.cvss_score,
      vuln.deactivated_on ? 'Remediated' : 'Active',
      vuln.fixable ? 'Yes' : 'No',
      vuln.integration_id,
      vuln.target_id,
      formatDate(vuln.first_detected),
      formatDate(vuln.deactivated_on),
      vuln.cve,
      vuln.description,
    ];

    if (includeRemediations) {
      const rems = remediationsMap[vuln.id] || [];
      row.push(
        rems.length,
        rems.length > 0 ? formatDate(rems[0].remediationDate || rems[0].detectedDate) : '',
        rems.length > 0 ? rems[0].status : ''
      );
    }

    rows.push(row.map(escapeCSV).join(','));
  });

  return rows.join('\n');
};

const generateHTMLReport = (vulnerabilities, remediationsMap, includeRemediations) => {
  const timestamp = escapeHtml(new Date().toLocaleString());
  const rows = vulnerabilities
    .map((vuln) => {
      const rems = remediationsMap[vuln.id] || [];
      const remediationInfo = includeRemediations
        ? `<td>${escapeHtml(rems.length) || '—'}</td><td>${rems.length > 0 ? escapeHtml(formatDate(rems[0].remediationDate || rems[0].detectedDate)) || '—' : '—'}</td>`
        : '';

      // Note: severity class is safe as it's validated against known values
      const severityClass = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(vuln.severity) ? vuln.severity : 'UNKNOWN';

      return `
        <tr>
          <td>${escapeHtml(vuln.id) || '—'}</td>
          <td>${escapeHtml(vuln.name) || '—'}</td>
          <td class="severity-${severityClass}">${escapeHtml(vuln.severity || 'UNKNOWN')}</td>
          <td>${escapeHtml(vuln.cvss_score) || '—'}</td>
          <td>${escapeHtml(vuln.deactivated_on ? 'Remediated' : 'Active')}</td>
          <td>${escapeHtml(vuln.fixable ? 'Yes' : 'No')}</td>
          <td>${escapeHtml(vuln.integration_id) || '—'}</td>
          <td>${escapeHtml(vuln.target_id) || '—'}</td>
          <td>${escapeHtml(formatDate(vuln.first_detected)) || '—'}</td>
          <td>${escapeHtml(formatDate(vuln.deactivated_on)) || '—'}</td>
          <td>${escapeHtml(vuln.cve) || '—'}</td>
          ${remediationInfo}
        </tr>
      `;
    })
    .join('');

  const remediationColumns = includeRemediations
    ? '<th>Remediations</th><th>Latest Remediation</th>'
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vanta Vulnerability Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      margin: 2rem;
      background: #f8fafc;
      color: #1e293b;
    }
    h1 {
      color: #0f172a;
      margin-bottom: 0.5rem;
    }
    .meta {
      color: #64748b;
      margin-bottom: 2rem;
      font-size: 0.875rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border-radius: 0.5rem;
      overflow: hidden;
    }
    th {
      background: #0f172a;
      color: white;
      padding: 0.75rem;
      text-align: left;
      font-weight: 600;
      font-size: 0.875rem;
    }
    td {
      padding: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
      font-size: 0.875rem;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:hover {
      background: #f8fafc;
    }
    .severity-CRITICAL {
      color: #dc2626;
      font-weight: 600;
    }
    .severity-HIGH {
      color: #ea580c;
      font-weight: 600;
    }
    .severity-MEDIUM {
      color: #d97706;
    }
    .severity-LOW {
      color: #65a30d;
    }
  </style>
</head>
<body>
  <h1>Vanta Vulnerability Report</h1>
  <div class="meta">
    Generated on ${timestamp}<br>
    Total vulnerabilities: ${escapeHtml(vulnerabilities.length)}
  </div>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Severity</th>
        <th>CVSS</th>
        <th>Status</th>
        <th>Fixable</th>
        <th>Integration</th>
        <th>Asset</th>
        <th>Detected</th>
        <th>Deactivated</th>
        <th>CVE</th>
        ${remediationColumns}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
  `;
};

const attachEventListeners = () => {
  // Tab switching
  elements.tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // Explorer tab switching
  elements.explorerTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-explorer-tab');
      switchExplorerTab(tabName);
    });
  });

  // Asset search with debouncing
  const debouncedAssetSearch = debounce((searchTerm) => {
    state.assetSearchTerm = searchTerm;
    renderAssets();
  }, 300);

  elements.assetSearch.addEventListener('input', (event) => {
    debouncedAssetSearch(event.target.value);
  });

  // Asset selection
  elements.assetList.addEventListener('click', (event) => {
    const listItem = event.target.closest('li[data-asset-id]');
    if (!listItem) return;
    const assetId = listItem.getAttribute('data-asset-id');
    selectAsset(assetId);
  });

  // CVE search with debouncing
  const debouncedCVESearch = debounce((searchTerm) => {
    state.cveSearchTerm = searchTerm;
    renderCVEs();
  }, 300);

  elements.cveSearch.addEventListener('input', (event) => {
    debouncedCVESearch(event.target.value);
  });

  // CVE selection
  elements.cveList.addEventListener('click', (event) => {
    const listItem = event.target.closest('li[data-cve-name]');
    if (!listItem) return;
    const cveName = listItem.getAttribute('data-cve-name');
    selectCVE(cveName);
  });

  // Click-through navigation from asset vulnerabilities to vulnerability details
  elements.assetVulnTable.addEventListener('click', async (event) => {
    const row = event.target.closest('tr[data-vuln-id]');
    if (!row) return;
    const vulnId = row.getAttribute('data-vuln-id');

    // Switch to the main list tab
    switchExplorerTab('list');

    // Select the vulnerability to show details
    await selectVulnerability(vulnId);
  });

  // Click-through navigation from CVE assets to vulnerability details
  elements.cveAssetTable.addEventListener('click', async (event) => {
    const row = event.target.closest('tr[data-vuln-id]');
    if (!row) return;
    const vulnId = row.getAttribute('data-vuln-id');

    // Switch to the main list tab
    switchExplorerTab('list');

    // Select the vulnerability to show details
    await selectVulnerability(vulnId);
  });

  // Asset pagination controls
  elements.prevAssetPage.addEventListener('click', () => {
    if (state.assetPage > 1) {
      state.assetPage -= 1;
      renderAssets();
    }
  });

  elements.nextAssetPage.addEventListener('click', () => {
    const searchTerm = state.assetSearchTerm.toLowerCase();
    const filteredAssets = state.assets.filter((asset) =>
      (asset.assetId || '').toLowerCase().includes(searchTerm)
    );
    const maxPage = Math.ceil(filteredAssets.length / state.assetPageSize);
    if (state.assetPage < maxPage) {
      state.assetPage += 1;
      renderAssets();
    }
  });

  elements.assetPageSize.addEventListener('change', (event) => {
    state.assetPageSize = parseInt(event.target.value, 10);
    state.assetPage = 1; // Reset to first page
    renderAssets();
  });

  // CVE pagination controls
  elements.prevCvePage.addEventListener('click', () => {
    if (state.cvePage > 1) {
      state.cvePage -= 1;
      renderCVEs();
    }
  });

  elements.nextCvePage.addEventListener('click', () => {
    const searchTerm = state.cveSearchTerm.toLowerCase();
    const filteredCVEs = state.cves.filter((cve) =>
      cve.cveName?.toLowerCase().includes(searchTerm) || cve.description?.toLowerCase().includes(searchTerm)
    );
    const maxPage = Math.ceil(filteredCVEs.length / state.cvePageSize);
    if (state.cvePage < maxPage) {
      state.cvePage += 1;
      renderCVEs();
    }
  });

  elements.cvePageSize.addEventListener('change', (event) => {
    state.cvePageSize = parseInt(event.target.value, 10);
    state.cvePage = 1; // Reset to first page
    renderCVEs();
  });

  // Report generation
  elements.reportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    elements.reportStatus.textContent = 'Generating report...';

    try {
      const format = elements.reportFormat.value;
      const includeRemediations = elements.includeRemediations.value === 'yes';
      const useFilters = elements.applyFilters.value === 'yes';

      // Get all vulnerabilities (or filtered ones) by fetching all pages
      const filters = useFilters ? state.filters : defaultFilters();
      const vulnerabilities = [];
      const pageSize = 1000; // Fetch in batches of 1000
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        elements.reportStatus.textContent = `Generating report... (fetching vulnerabilities: ${vulnerabilities.length})`;
        const response = await window.vanta.listVulnerabilities({
          filters,
          limit: pageSize,
          offset,
          sortColumn: state.sortColumn,
          sortDirection: state.sortDirection,
        });

        vulnerabilities.push(...response.data);
        offset += pageSize;
        hasMore = response.data.length === pageSize && vulnerabilities.length < response.total;
      }

      // Get remediations if requested, batched to avoid overwhelming IPC
      let remediationsMap = {};
      if (includeRemediations) {
        const batchSize = 50;
        for (let i = 0; i < vulnerabilities.length; i += batchSize) {
          elements.reportStatus.textContent = `Generating report... (fetching remediations: ${i}/${vulnerabilities.length})`;
          const batch = vulnerabilities.slice(i, i + batchSize);
          const remediationPromises = batch.map((vuln) =>
            window.vanta.getRemediations(vuln.id).then((rems) => ({ id: vuln.id, remediations: rems }))
          );
          const remediationResults = await Promise.all(remediationPromises);
          remediationResults.forEach((r) => {
            remediationsMap[r.id] = r.remediations;
          });
        }
      }

      // Generate report based on format
      let content;
      let filename;
      let mimeType;

      if (format === 'csv') {
        content = generateCSVReport(vulnerabilities, remediationsMap, includeRemediations);
        filename = `vanta-vulnerabilities-${Date.now()}.csv`;
        mimeType = 'text/csv';
      } else if (format === 'json') {
        const reportData = includeRemediations
          ? vulnerabilities.map((v) => ({ ...v, remediations: remediationsMap[v.id] || [] }))
          : vulnerabilities;
        content = JSON.stringify(reportData, null, 2);
        filename = `vanta-vulnerabilities-${Date.now()}.json`;
        mimeType = 'application/json';
      } else if (format === 'html') {
        content = generateHTMLReport(vulnerabilities, remediationsMap, includeRemediations);
        filename = `vanta-vulnerabilities-${Date.now()}.html`;
        mimeType = 'text/html';
      }

      // Trigger download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      elements.reportStatus.textContent = `Report generated: ${filename}`;
      setTimeout(() => {
        elements.reportStatus.textContent = '';
      }, 5000);
    } catch (error) {
      elements.reportStatus.textContent = `Failed to generate report: ${error.message}`;
      setTimeout(() => {
        elements.reportStatus.textContent = '';
      }, 5000);
    }
  });

  elements.saveCredentials.addEventListener('click', async () => {
    elements.credentialsStatus.textContent = 'Saving…';
    await window.vanta.updateSettings({
      clientId: elements.clientId.value.trim(),
      clientSecret: elements.clientSecret.value.trim(),
    });
    elements.credentialsStatus.textContent = 'Saved credentials.';
    setTimeout(() => {
      elements.credentialsStatus.textContent = '';
    }, 2500);
  });

  elements.selectDatabaseButton.addEventListener('click', async () => {
    try {
      const selectedPath = await window.vanta.selectDatabaseFile();

      if (!selectedPath) {
        // User cancelled the dialog
        return;
      }

      elements.databaseStatus.textContent = 'Changing database location...';
      elements.databaseStatus.style.display = 'block';
      elements.databaseStatus.className = 'status-message status-info';

      const newPath = await window.vanta.setDatabasePath(selectedPath);
      elements.databasePath.textContent = newPath;

      elements.databaseStatus.textContent = 'Database location updated successfully. Reload the data to see changes.';
      elements.databaseStatus.className = 'status-message status-success';

      // Reload statistics and vulnerabilities with the new database
      await Promise.all([loadStatistics(), loadVulnerabilities(), loadSyncHistory()]);
      state.assetCache = null;
      state.assetCacheFilters = null;
      state.cveCache = null;
      state.cveCacheFilters = null;
      if (state.assetDetails?.clear) {
        state.assetDetails.clear();
      }
      state.selectedAsset = null;
      state.selectedCve = null;
      renderAssetVulnerabilities(null);
      renderCVEAssets(null);

      setTimeout(() => {
        elements.databaseStatus.style.display = 'none';
        elements.databaseStatus.textContent = '';
      }, 5000);
    } catch (error) {
      elements.databaseStatus.textContent = `Failed to change database: ${error.message}`;
      elements.databaseStatus.className = 'status-message status-error';
      elements.databaseStatus.style.display = 'block';
      setTimeout(() => {
        elements.databaseStatus.style.display = 'none';
        elements.databaseStatus.textContent = '';
      }, 5000);
    }
  });

  elements.resetDatabaseButton.addEventListener('click', async () => {
    try {
      elements.databaseStatus.textContent = 'Resetting to default database location...';
      elements.databaseStatus.style.display = 'block';
      elements.databaseStatus.className = 'status-message status-info';

      const newPath = await window.vanta.resetDatabasePath();
      elements.databasePath.textContent = newPath;

      elements.databaseStatus.textContent = 'Database location reset to default. Reload the data to see changes.';
      elements.databaseStatus.className = 'status-message status-success';

      // Reload statistics and vulnerabilities with the default database
      await Promise.all([loadStatistics(), loadVulnerabilities(), loadSyncHistory()]);
      state.assetCache = null;
      state.assetCacheFilters = null;
      state.cveCache = null;
      state.cveCacheFilters = null;
      if (state.assetDetails?.clear) {
        state.assetDetails.clear();
      }
      state.selectedAsset = null;
      state.selectedCve = null;
      renderAssetVulnerabilities(null);
      renderCVEAssets(null);

      setTimeout(() => {
        elements.databaseStatus.style.display = 'none';
        elements.databaseStatus.textContent = '';
      }, 5000);
    } catch (error) {
      elements.databaseStatus.textContent = `Failed to reset database: ${error.message}`;
      elements.databaseStatus.className = 'status-message status-error';
      elements.databaseStatus.style.display = 'block';
      setTimeout(() => {
        elements.databaseStatus.style.display = 'none';
        elements.databaseStatus.textContent = '';
      }, 5000);
    }
  });

  elements.startSyncButton.addEventListener('click', async () => {
    if (state.syncState !== 'idle') {
      return;
    }

    try {
      await window.vanta.runSync();
    } catch (error) {
      updateSyncButtons('idle');
      showToast(error.message || 'Failed to start sync');
    }
  });

  elements.pauseSyncButton.addEventListener('click', async () => {
    if (state.syncState !== 'running') {
      return;
    }
    try {
      await window.vanta.pauseSync();
    } catch (error) {
      showToast(error.message || 'Failed to pause sync');
    }
  });

  elements.resumeSyncButton.addEventListener('click', async () => {
    if (state.syncState !== 'paused') {
      return;
    }
    try {
      await window.vanta.resumeSync();
    } catch (error) {
      showToast(error.message || 'Failed to resume sync');
    }
  });

  elements.stopSyncButton.addEventListener('click', async () => {
    if (state.syncState !== 'running' && state.syncState !== 'paused') {
      return;
    }
    try {
      await window.vanta.stopSync();
    } catch (error) {
      showToast(error.message || 'Failed to stop sync');
    }
  });

  elements.filtersForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.filters = getFiltersFromInputs();
    state.page = 1;

    // Invalidate caches when filters change
    state.assetCache = null;
    state.assetCacheFilters = null;
    state.cveCache = null;
    state.cveCacheFilters = null;
    if (state.assetDetails?.clear) {
      state.assetDetails.clear();
    }
    state.selectedAsset = null;
    state.selectedCve = null;

    await Promise.all([loadStatistics(), loadVulnerabilities()]);
    resetDetails();
    renderAssetVulnerabilities(null);
    renderCVEAssets(null);
  });

  elements.clearFilters.addEventListener('click', async () => {
    state.filters = defaultFilters();
    populateFilterInputs();
    state.page = 1;

    // Invalidate caches when filters change
    state.assetCache = null;
    state.assetCacheFilters = null;
    state.cveCache = null;
    state.cveCacheFilters = null;
    if (state.assetDetails?.clear) {
      state.assetDetails.clear();
    }
    state.selectedAsset = null;
    state.selectedCve = null;

    await Promise.all([loadStatistics(), loadVulnerabilities()]);
    resetDetails();
    renderAssetVulnerabilities(null);
    renderCVEAssets(null);
  });

  elements.prevPage.addEventListener('click', async () => {
    if (state.page === 1) return;
    state.page -= 1;
    await loadVulnerabilities();
  });

  elements.nextPage.addEventListener('click', async () => {
    if (state.page * PAGE_SIZE >= state.total) return;
    state.page += 1;
    await loadVulnerabilities();
  });

  elements.vulnerabilityTable.addEventListener('click', handleTableClick);

  // Attach column sort handlers
  document.querySelectorAll('.data-table thead th.sortable').forEach((th) => {
    th.addEventListener('click', handleColumnSort);
  });

  window.vanta.onSyncState(({ state: newState }) => {
    updateSyncButtons(newState);
  });

  window.vanta.onSyncProgress(({ type, count }) => {
    // Progress is now tracked in sync history
  });

  window.vanta.onSyncIncremental(async () => {
    // Invalidate caches so explorer views refresh with synced data
    state.assetCache = null;
    state.assetCacheFilters = null;
    state.cveCache = null;
    state.cveCacheFilters = null;
    if (state.assetDetails?.clear) {
      state.assetDetails.clear();
    }

    const tasks = [loadStatistics(), loadVulnerabilities(), loadSyncHistory()];
    if (state.explorerTab === 'by-asset') {
      tasks.push(loadAssets());
    }
    if (state.explorerTab === 'by-cve') {
      tasks.push(loadCVEs());
    }

    await Promise.all(tasks);
  });

  window.vanta.onSyncCompleted(async () => {
    updateSyncButtons('idle');
    state.assetCache = null;
    state.assetCacheFilters = null;
    state.cveCache = null;
    state.cveCacheFilters = null;
    if (state.assetDetails?.clear) {
      state.assetDetails.clear();
    }

    const tasks = [loadStatistics(), loadVulnerabilities(), loadSyncHistory()];
    if (state.explorerTab === 'by-asset') {
      tasks.push(loadAssets());
    }
    if (state.explorerTab === 'by-cve') {
      tasks.push(loadCVEs());
    }

    await Promise.all(tasks);
  });

  window.vanta.onSyncError((payload) => {
    updateSyncButtons('idle');
    showToast(payload?.message || 'Sync operation failed');
    loadSyncHistory(); // Reload history to show error
  });
};

const initialize = async () => {
  await Promise.all([loadSettings(), loadStatistics(), loadSyncHistory(), loadDatabasePath()]);
  await loadVulnerabilities();
  populateFilterInputs();
  attachEventListeners();

  // Initialize button state
  const syncState = await window.vanta.getSyncState();
  updateSyncButtons(syncState.state);
};

initialize().catch((error) => {
  console.error('Failed to initialize renderer', error);
  if (elements.syncHistoryEmpty) {
    elements.syncHistoryEmpty.style.display = 'block';
    elements.syncHistoryEmpty.textContent = 'Failed to initialize application. Check console for details.';
  }
});
