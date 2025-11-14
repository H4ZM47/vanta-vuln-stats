# Mock Vulnerability Database

This directory contains a mock SQLite database with fake vulnerability and remediation records for testing and demonstration purposes.

## Mock Database

**File**: `mock-vanta-vulnerabilities.db`
**Size**: ~1.6 MB
**Records**:
- 500 vulnerabilities
- 1000+ remediations
- 20 sync history events

### Data Distribution

The mock database contains realistic-looking fake data with the following characteristics:

**Severity Distribution**:
- CRITICAL: ~5%
- HIGH: ~15%
- MEDIUM: ~35%
- LOW: ~30%
- INFO: ~15%

**Status**:
- Active vulnerabilities: ~70%
- Remediated vulnerabilities: ~30%

**Features**:
- Realistic CVE IDs (CVE-2023-XXXXX, CVE-2024-XXXXX, CVE-2025-XXXXX)
- Common package names (lodash, express, react, django, spring-boot, etc.)
- Multiple integrations (GitHub, Snyk, Tenable, Qualys, CrowdStrike, Wiz)
- Proper CVSS scoring based on severity levels
- Related vulnerabilities and URLs
- Sync history with timestamps

## Using the Mock Database

### Option 1: Using the GUI (Recommended)

1. Launch the application
2. Navigate to the **Settings & Sync** tab
3. Scroll to the **Database Configuration** section
4. Click **Choose Database File...**
5. Navigate to this directory and select `mock-vanta-vulnerabilities.db`
6. Click **Select**

The application will reload data from the mock database automatically.

### Option 2: Command Line

You can set the mock database as default by copying it to the application's storage directory:

```bash
# On macOS
cp data/mock-vanta-vulnerabilities.db ~/Library/Application\ Support/vanta-vuln-stats-electron/storage/vanta_vulnerabilities.db

# On Linux
cp data/mock-vanta-vulnerabilities.db ~/.config/vanta-vuln-stats-electron/storage/vanta_vulnerabilities.db

# On Windows
copy data\mock-vanta-vulnerabilities.db %APPDATA%\vanta-vuln-stats-electron\storage\vanta_vulnerabilities.db
```

## Regenerating the Mock Database

To regenerate the mock database with different parameters:

```bash
# Generate with default settings (500 vulnerabilities)
node scripts/generateMockDatabase.js

# Generate with custom path
node scripts/generateMockDatabase.js ./custom-path.db

# Generate with custom record count (e.g., 1000 vulnerabilities)
node scripts/generateMockDatabase.js ./data/mock-vanta-vulnerabilities.db 1000
```

**Note**: Keep the record count reasonable to stay under GitHub's file size limits (50 MB recommended).

## Resetting to Default Database

To switch back to the default database location:

1. Navigate to **Settings & Sync** tab
2. Scroll to **Database Configuration**
3. Click **Use Default Location**

This will reset the database path to the application's default storage location.

## Schema

The mock database includes the following tables:

### `vulnerabilities`
- id, name, description
- integration_id, package_identifier
- vulnerability_type, target_id
- first_detected, last_detected, deactivated_on
- severity, cvss_score, scanner_score
- is_fixable, remediate_by
- external_url, scan_source
- related_vulns (JSON), related_urls (JSON)
- raw_data (complete JSON payload)

### `vulnerability_remediations`
- id, vulnerability_id, vulnerable_asset_id
- severity, detected_date, sla_deadline_date
- remediation_date, remediated_on_time
- integration_id, integration_type
- status
- raw_data (complete JSON payload)

### `sync_history`
- id, sync_date, event_type
- message, details
- vulnerabilities_count, vulnerabilities_new, vulnerabilities_updated
- remediations_count, remediations_new, remediations_updated

## Important Notes

- This is **mock data** for testing and demonstration only
- Do NOT use this for production vulnerability tracking
- The data is randomly generated and does not represent real vulnerabilities
- CVE IDs in the mock data are fabricated and not real CVE identifiers
