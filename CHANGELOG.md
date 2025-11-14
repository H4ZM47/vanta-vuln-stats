# Changelog

All notable changes to the Vanta Vulnerability Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-11-14

### Fixed

- **CRITICAL: Fixed asset sync failures caused by deprecated /assets endpoint** ([#76](https://github.com/H4ZM47/vanta-vuln-stats/issues/76))
  - Migrated from deprecated `/assets` endpoint to `/vulnerable-assets` endpoint
  - The Vanta API deprecated `/assets` in November 2025, causing 404 errors and complete asset sync failures
  - All asset-related API calls now use the correct `/vulnerable-assets` endpoint
  - Existing asset data remains fully compatible - no data migration required
  - Asset sync now succeeds and displays human-readable asset names in the UI

### Changed

- Enhanced asset metadata extraction to leverage richer scanner data from `/vulnerable-assets` endpoint
  - Environment information now extracted from scanner asset tags when available
  - Platform/OS information extracted from scanner operating system metadata
  - Integration IDs extracted from scanner metadata with improved fallback logic
  - External identifiers extracted from scanner target IDs when not available at top level

### Added

- Comprehensive JSDoc documentation for asset-related API methods (`getVulnerableAssets()`, `getVulnerableAsset()`)
- Detailed inline documentation for `_normaliseAsset()` database normalization method
- Migration documentation in `MIGRATION_NOTES.md` with complete upgrade and rollback procedures
- Known limitations section in Asset Correlation Guide
- Deprecation warning for `/assets` endpoint in Vanta API Reference
- Code comments explaining endpoint change rationale in data service

### Documentation

- Updated `.claude/ASSET_CORRELATION_GUIDE.md` with endpoint migration notice and known limitations
- Updated `.claude/VANTA_API_REFERENCE.md` with deprecation warning for `/assets` endpoint
- Created `MIGRATION_NOTES.md` with comprehensive migration details, rollback procedures, and technical reference
- Enhanced code documentation with 150+ lines of JSDoc comments and inline explanations

### Technical Details

**Files Modified:**
- `src/core/apiClient.js` - Changed endpoint URLs and added comprehensive documentation
- `src/core/database.js` - Enhanced scanner metadata extraction and added detailed method documentation
- `src/main/dataService.js` - Added inline comments explaining endpoint usage
- `.claude/ASSET_CORRELATION_GUIDE.md` - Added migration notice and limitations
- `.claude/VANTA_API_REFERENCE.md` - Added deprecation warning
- `MIGRATION_NOTES.md` - Created comprehensive migration documentation
- `CHANGELOG.md` - Created changelog (this file)

**Impact:**
- High - Asset sync was completely broken without this fix
- No breaking changes - Fully backward compatible
- No data migration required
- Rollback supported if needed

**Upgrade Path:**
Update to version 1.1.0 or later. No user action required beyond installing the update. Run a sync to fetch assets using the new endpoint.

---

## [1.0.0] - 2025-11-01

### Initial Release

- Electron desktop application for Vanta vulnerability management
- One-click data synchronization from Vanta API
- Local SQLite database for offline access
- Rich dashboard with severity distribution and statistics
- Three-view explorer: vulnerabilities, assets, CVEs
- Asset correlation with human-readable names
- Vulnerability filtering by severity, status, integration, and date ranges
- Detailed vulnerability inspection with full JSON payload
- Sync history tracking with statistics
- Secure credential storage using electron-store
- Pagination and rate limiting support
- Automatic retry logic for API failures
- Cross-platform support (macOS, Windows, Linux)

### Features

**Data Synchronization:**
- OAuth 2.0 client credentials flow for authentication
- Automatic token refresh
- Parallel fetching of vulnerabilities, remediations, and assets
- Batch processing with configurable buffer sizes (1000 records)
- Progress tracking with real-time updates
- Incremental sync support for remediations
- Pause/resume/stop sync controls

**Database & Storage:**
- SQLite database with better-sqlite3
- WAL mode for improved concurrency
- Optimized indexes for fast queries
- Full API response preservation in raw_data fields
- Transaction-based writes for data integrity
- Configurable database location

**UI & Visualization:**
- Aurora-inspired clean interface
- Dashboard with key metrics and statistics
- Filterable vulnerability list with sorting
- Asset-based vulnerability grouping
- CVE-based vulnerability grouping
- Detailed vulnerability inspection modal
- Remediation history display
- Search across multiple fields
- Responsive design

**Performance:**
- Memory-mapped I/O for database
- Batch database operations
- Cached statistics
- Efficient pagination
- Background sync operations
- Non-blocking UI updates

---

## Version History Summary

| Version | Release Date | Key Changes |
|---------|--------------|-------------|
| 1.1.0   | 2025-11-14  | Fixed asset sync 404 errors via /vulnerable-assets migration |
| 1.0.0   | 2025-11-01  | Initial release with full feature set |

---

## Upgrade Guide

### From 1.0.0 to 1.1.0

**Required:** Yes - Asset sync is broken in 1.0.0 due to deprecated endpoint

**Steps:**
1. Download version 1.1.0
2. Install the update (replaces 1.0.0)
3. Launch the application
4. Run a sync to fetch assets using the new endpoint
5. Verify asset names appear in the UI

**Time Required:** 5-10 minutes
**Downtime:** None (stop and restart only)
**Data Migration:** Not required
**Rollback:** Supported (see MIGRATION_NOTES.md)

---

## Support

For issues, questions, or feature requests:
- GitHub Issues: [H4ZM47/vanta-vuln-stats/issues](https://github.com/H4ZM47/vanta-vuln-stats/issues)
- Documentation: See `.claude/` directory for guides

---

[1.1.0]: https://github.com/H4ZM47/vanta-vuln-stats/releases/tag/v1.1.0
[1.0.0]: https://github.com/H4ZM47/vanta-vuln-stats/releases/tag/v1.0.0
