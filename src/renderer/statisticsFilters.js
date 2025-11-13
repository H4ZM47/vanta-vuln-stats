(function (globalScope) {
  /**
   * Builds the filter payload used when requesting statistics for the summary card.
   * Currently always returns an empty object so the summary reflects the full dataset,
   * regardless of the table filters applied in the UI.
   *
   * @param {object} _currentFilters - The active table filters (unused for now).
   * @returns {object} Filter payload for the statistics request.
   */
  const buildStatisticsFilters = (_currentFilters) => {
    return {};
  };

  const api = { buildStatisticsFilters };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (globalScope) {
    globalScope.VantaStatisticsFilters = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
