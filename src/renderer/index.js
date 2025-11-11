const PAGE_SIZE = 25;

const elements = {
  clientId: document.getElementById('clientId'),
  clientSecret: document.getElementById('clientSecret'),
  saveCredentials: document.getElementById('saveCredentials'),
  credentialsStatus: document.getElementById('credentialsStatus'),
  syncButton: document.getElementById('syncButton'),
  syncStatus: document.getElementById('syncStatus'),
  statistics: document.getElementById('statistics'),
  syncHistoryBody: document.getElementById('syncHistoryBody'),
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
  syncing: false,
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
    elements.syncHistoryBody.innerHTML = '<tr><td colspan="5">No syncs have been recorded.</td></tr>';
    return;
  }

  elements.syncHistoryBody.innerHTML = history
    .map((item) => `
      <tr>
        <td>${formatDateTime(item.sync_date)}</td>
        <td>${formatNumber(item.vulnerabilities_count)}</td>
        <td>${formatNumber(item.new_count)}</td>
        <td>${formatNumber(item.updated_count)}</td>
        <td>${formatNumber(item.remediated_count)}</td>
      </tr>
    `)
    .join('');
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
  });
  state.vulnerabilities = response.data;
  state.total = response.total;
  renderVulnerabilities();
  renderPagination();
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

  elements.syncButton.addEventListener('click', async () => {
    if (state.syncing) {
      return;
    }
    state.syncing = true;
    elements.syncButton.disabled = true;
    elements.syncStatus.textContent = 'Syncing…';
    try {
      await window.vanta.runSync();
    } catch (error) {
      elements.syncStatus.textContent = `Sync failed: ${error.message}`;
      state.syncing = false;
      elements.syncButton.disabled = false;
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

  window.vanta.onSyncProgress(({ type, count }) => {
    const label = type === 'vulnerabilities' ? 'Vulnerabilities' : 'Remediations';
    elements.syncStatus.textContent = `Syncing ${label}: ${formatNumber(count)} records processed…`;
  });

  window.vanta.onSyncCompleted(async () => {
    elements.syncStatus.textContent = 'Sync complete! Refreshing data…';
    state.syncing = false;
    elements.syncButton.disabled = false;
    await Promise.all([loadStatistics(), loadVulnerabilities(), loadSyncHistory()]);
    elements.syncStatus.textContent = 'Sync complete.';
    setTimeout(() => {
      elements.syncStatus.textContent = '';
    }, 3000);
  });

  window.vanta.onSyncError((payload) => {
    elements.syncStatus.textContent = `Sync failed: ${payload?.message || 'Unknown error'}`;
    state.syncing = false;
    elements.syncButton.disabled = false;
  });
};

const initialize = async () => {
  await Promise.all([loadSettings(), loadStatistics(), loadSyncHistory(), loadDatabasePath()]);
  await loadVulnerabilities();
  populateFilterInputs();
  attachEventListeners();
};

initialize().catch((error) => {
  console.error('Failed to initialize renderer', error);
  elements.syncStatus.textContent = 'Failed to initialize application. Check console for details.';
});
