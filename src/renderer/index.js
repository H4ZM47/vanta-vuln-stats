const PAGE_SIZE = 25;

const elements = {
  clientId: document.getElementById('clientId'),
  clientSecret: document.getElementById('clientSecret'),
  saveCredentials: document.getElementById('saveCredentials'),
  credentialsStatus: document.getElementById('credentialsStatus'),
  startSyncButton: document.getElementById('startSyncButton'),
  pauseSyncButton: document.getElementById('pauseSyncButton'),
  resumeSyncButton: document.getElementById('resumeSyncButton'),
  stopSyncButton: document.getElementById('stopSyncButton'),
  syncStatusVulnerabilities: document.getElementById('syncStatusVulnerabilities'),
  syncStatusRemediations: document.getElementById('syncStatusRemediations'),
  syncStatusGeneral: document.getElementById('syncStatusGeneral'),
  statistics: document.getElementById('statistics'),
  syncHistoryLog: document.getElementById('syncHistoryLog'),
  syncHistoryEmpty: document.getElementById('syncHistoryEmpty'),
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
  vulnerabilityTable: document.getElementById('vulnerabilityTable'),
  paginationStatus: document.getElementById('paginationStatus'),
  prevPage: document.getElementById('prevPage'),
  nextPage: document.getElementById('nextPage'),
  vulnerabilityDetails: document.getElementById('vulnerabilityDetails'),
  remediationDetails: document.getElementById('remediationDetails'),
  detailsSubtitle: document.getElementById('detailsSubtitle'),
  databasePath: document.getElementById('databasePath'),
};

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
  currentSync: {
    vulnerabilities: { count: 0, status: 'idle' }, // idle, syncing, completed
    remediations: { count: 0, status: 'idle' },
  },
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
  if (!history?.length) {
    elements.syncHistoryLog.style.display = 'none';
    elements.syncHistoryEmpty.style.display = 'block';
    return;
  }

  elements.syncHistoryLog.style.display = 'flex';
  elements.syncHistoryEmpty.style.display = 'none';

  elements.syncHistoryLog.innerHTML = history
    .map((item) => {
      const hasVulnData = item.vulnerabilities_count !== undefined && item.vulnerabilities_count !== null;
      const hasRemData = item.remediations_count !== undefined && item.remediations_count !== null;

      const vulnStats = hasVulnData ? `
        <div class="sync-history-stat">
          <span class="sync-history-stat-label">Total:</span>
          <span class="sync-history-stat-value">${formatNumber(item.vulnerabilities_count)}</span>
        </div>
        <div class="sync-history-stat">
          <span class="sync-history-stat-label">New:</span>
          <span class="sync-history-stat-value">${formatNumber(item.vulnerabilities_new || 0)}</span>
        </div>
        <div class="sync-history-stat">
          <span class="sync-history-stat-label">Updated:</span>
          <span class="sync-history-stat-value">${formatNumber(item.vulnerabilities_updated || 0)}</span>
        </div>
        <div class="sync-history-stat">
          <span class="sync-history-stat-label">Remediated:</span>
          <span class="sync-history-stat-value">${formatNumber(item.vulnerabilities_remediated || 0)}</span>
        </div>
      ` : '';

      const remStats = hasRemData ? `
        <div class="sync-history-stat">
          <span class="sync-history-stat-label">Total:</span>
          <span class="sync-history-stat-value">${formatNumber(item.remediations_count)}</span>
        </div>
        <div class="sync-history-stat">
          <span class="sync-history-stat-label">New:</span>
          <span class="sync-history-stat-value">${formatNumber(item.remediations_new || 0)}</span>
        </div>
        <div class="sync-history-stat">
          <span class="sync-history-stat-label">Updated:</span>
          <span class="sync-history-stat-value">${formatNumber(item.remediations_updated || 0)}</span>
        </div>
      ` : '';

      return `
        <div class="sync-history-item completed">
          <div class="sync-history-header">
            <div class="sync-history-title">Sync Completed</div>
            <div class="sync-history-time">${formatDateTime(item.sync_date)}</div>
          </div>
          ${hasVulnData ? `
            <div style="margin-bottom: 0.5rem; font-weight: 600; color: rgba(148, 163, 184, 0.9); font-size: 0.85rem;">
              Vulnerabilities
            </div>
            <div class="sync-history-stats">
              ${vulnStats}
            </div>
          ` : ''}
          ${hasRemData ? `
            <div style="margin-top: 0.75rem; margin-bottom: 0.5rem; font-weight: 600; color: rgba(148, 163, 184, 0.9); font-size: 0.85rem;">
              Remediations
            </div>
            <div class="sync-history-stats">
              ${remStats}
            </div>
          ` : ''}
        </div>
      `;
    })
    .join('');
};

const addLiveSyncItem = () => {
  elements.syncHistoryLog.style.display = 'flex';
  elements.syncHistoryEmpty.style.display = 'none';

  const liveItem = document.createElement('div');
  liveItem.className = 'sync-history-item in-progress';
  liveItem.id = 'live-sync-item';
  liveItem.innerHTML = `
    <div class="sync-history-header">
      <div class="sync-history-title">Sync In Progress</div>
      <div class="sync-history-time">Now</div>
    </div>
    <div style="margin-bottom: 0.5rem; font-weight: 600; color: rgba(148, 163, 184, 0.9); font-size: 0.85rem;">
      Vulnerabilities
    </div>
    <div class="sync-history-stats" id="live-vuln-stats">
      <div class="sync-history-stat">
        <span class="sync-history-stat-label">Processing:</span>
        <span class="sync-history-stat-value" id="live-vuln-count">0</span>
      </div>
    </div>
    <div style="margin-top: 0.75rem; margin-bottom: 0.5rem; font-weight: 600; color: rgba(148, 163, 184, 0.9); font-size: 0.85rem;">
      Remediations
    </div>
    <div class="sync-history-stats" id="live-rem-stats">
      <div class="sync-history-stat">
        <span class="sync-history-stat-label">Processing:</span>
        <span class="sync-history-stat-value" id="live-rem-count">0</span>
      </div>
    </div>
  `;

  elements.syncHistoryLog.insertBefore(liveItem, elements.syncHistoryLog.firstChild);
};

const updateLiveSyncItem = (type, count) => {
  const countElement = document.getElementById(type === 'vulnerabilities' ? 'live-vuln-count' : 'live-rem-count');
  if (countElement) {
    countElement.textContent = formatNumber(count);
  }
};

const removeLiveSyncItem = () => {
  const liveItem = document.getElementById('live-sync-item');
  if (liveItem) {
    liveItem.remove();
  }
};

const renderVulnerabilities = () => {
  if (!state.vulnerabilities.length) {
    elements.vulnerabilityTable.innerHTML = '<tr><td colspan="7">No vulnerabilities match your filters.</td></tr>';
    return;
  }

  elements.vulnerabilityTable.innerHTML = state.vulnerabilities
    .map((item) => {
      const statusLabel = item.deactivated_on ? 'Remediated' : 'Active';
      const severityClass = item.severity ? `severity-chip ${item.severity}` : '';
      const isSelected = state.selectedId === item.id ? 'selected' : '';
      return `
        <tr data-id="${item.id}" class="${isSelected}">
          <td>${item.id}</td>
          <td>${item.name || '—'}</td>
          <td><span class="${severityClass}">${item.severity || 'UNKNOWN'}</span></td>
          <td>${item.integration_id || '—'}</td>
          <td>${item.target_id || '—'}</td>
          <td>${formatDate(item.first_detected)}</td>
          <td>${statusLabel}</td>
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
  const stats = await window.vanta.getStatistics(state.filters);
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

const attachEventListeners = () => {
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

  elements.startSyncButton.addEventListener('click', async () => {
    if (state.syncState !== 'idle') {
      return;
    }
    state.currentSync = {
      vulnerabilities: { count: 0, status: 'syncing' },
      remediations: { count: 0, status: 'syncing' },
    };
    elements.syncStatusGeneral.textContent = 'Starting sync…';
    elements.syncStatusVulnerabilities.textContent = '';
    elements.syncStatusRemediations.textContent = '';

    addLiveSyncItem();

    try {
      await window.vanta.runSync();
    } catch (error) {
      elements.syncStatusGeneral.textContent = `Sync failed: ${error.message}`;
      updateSyncButtons('idle');
      removeLiveSyncItem();
    }
  });

  elements.pauseSyncButton.addEventListener('click', async () => {
    if (state.syncState !== 'running') {
      return;
    }
    try {
      await window.vanta.pauseSync();
      elements.syncStatusGeneral.textContent = 'Sync paused.';
    } catch (error) {
      elements.syncStatusGeneral.textContent = `Failed to pause: ${error.message}`;
    }
  });

  elements.resumeSyncButton.addEventListener('click', async () => {
    if (state.syncState !== 'paused') {
      return;
    }
    try {
      await window.vanta.resumeSync();
      elements.syncStatusGeneral.textContent = 'Sync resumed…';
    } catch (error) {
      elements.syncStatusGeneral.textContent = `Failed to resume: ${error.message}`;
    }
  });

  elements.stopSyncButton.addEventListener('click', async () => {
    if (state.syncState !== 'running' && state.syncState !== 'paused') {
      return;
    }
    try {
      await window.vanta.stopSync();
      elements.syncStatusGeneral.textContent = 'Stopping sync…';
    } catch (error) {
      elements.syncStatusGeneral.textContent = `Failed to stop: ${error.message}`;
    }
  });

  elements.filtersForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.filters = getFiltersFromInputs();
    state.page = 1;
    await Promise.all([loadStatistics(), loadVulnerabilities()]);
    resetDetails();
  });

  elements.clearFilters.addEventListener('click', async () => {
    state.filters = defaultFilters();
    populateFilterInputs();
    state.page = 1;
    await Promise.all([loadStatistics(), loadVulnerabilities()]);
    resetDetails();
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
    state.currentSync[type].count = count;
    state.currentSync[type].status = 'syncing';

    // Update header status
    if (type === 'vulnerabilities') {
      elements.syncStatusVulnerabilities.textContent = `Vulnerabilities: ${formatNumber(count)} processed`;
    } else if (type === 'remediations') {
      elements.syncStatusRemediations.textContent = `Remediations: ${formatNumber(count)} processed`;
    }

    // Update live sync item in history log
    updateLiveSyncItem(type, count);
  });

  window.vanta.onSyncIncremental(async ({ type, stats, flushed }) => {
    const label = type === 'vulnerabilities' ? 'Vulnerabilities' : 'Remediations';
    elements.syncStatusGeneral.textContent = `Syncing ${label}: ${formatNumber(stats.total)} saved (${formatNumber(flushed)} flushed). Refreshing UI…`;

    // Refresh statistics and vulnerability list to show updated data
    await Promise.all([loadStatistics(), loadVulnerabilities()]);

    // Update status to show refresh is complete
    elements.syncStatusGeneral.textContent = `Syncing ${label}: ${formatNumber(stats.total)} saved. UI refreshed.`;
  });

  window.vanta.onSyncCompleted(async () => {
    elements.syncStatusGeneral.textContent = 'Sync complete! Refreshing data…';
    state.currentSync.vulnerabilities.status = 'completed';
    state.currentSync.remediations.status = 'completed';
    updateSyncButtons('idle');

    removeLiveSyncItem();

    await Promise.all([loadStatistics(), loadVulnerabilities(), loadSyncHistory()]);

    elements.syncStatusGeneral.textContent = 'Sync complete.';
    setTimeout(() => {
      elements.syncStatusGeneral.textContent = '';
      elements.syncStatusVulnerabilities.textContent = '';
      elements.syncStatusRemediations.textContent = '';
    }, 3000);
  });

  window.vanta.onSyncError((payload) => {
    elements.syncStatusGeneral.textContent = `Sync failed: ${payload?.message || 'Unknown error'}`;
    elements.syncStatusVulnerabilities.textContent = '';
    elements.syncStatusRemediations.textContent = '';
    updateSyncButtons('idle');
    removeLiveSyncItem();
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
  elements.syncStatusGeneral.textContent = 'Failed to initialize application. Check console for details.';
});
