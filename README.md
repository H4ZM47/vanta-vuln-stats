# Vanta Vulnerability Statistics Utility

A comprehensive Python utility for fetching and analyzing vulnerability data from the Vanta API with local SQLite database caching and change tracking.

## Features

- **Data Fetching & Caching:**
  - Fetches all vulnerabilities from your Vanta account
  - Captures vulnerability remediation records for every asset and integration
  - Local SQLite database for caching vulnerability data
  - Automatic rate limit handling with retry logic
  - Reduces API calls by using cached data

- **Change Tracking & Versioning:**
  - Tracks when vulnerabilities are discovered
  - Tracks when vulnerabilities are remediated
  - Historical snapshots of vulnerability changes
  - Sync history with statistics on new, updated, and remediated vulnerabilities
  - Stores every element from the Vanta vulnerabilities and vulnerability remediations APIs for downstream analytics

- **Comprehensive Statistics:**
  - Total vulnerability counts
  - Breakdown by severity (CRITICAL, HIGH, MEDIUM, LOW)
  - Breakdown by integration source
  - Fixability status
  - Active vs. deactivated vulnerabilities
  - Unique CVE and asset counts
  - Average CVSS scores by severity

- **Flexible Filtering:**
  - Date identified (first detected date)
  - Date remediated (deactivation date)
  - Severity levels
  - CVE identifier
  - Asset ID

- **Export Options:**
  - Print statistics to console
  - Export statistics to JSON
  - Export filtered vulnerability list to JSON

## Project Structure

The project is organized into modular components for maintainability and extensibility:

```
vanta-vuln-stats/
├── core/                  # Core business logic
│   ├── __init__.py
│   ├── api_client.py     # Vanta API client
│   ├── database.py       # SQLite database manager
│   └── stats.py          # Statistics processor
├── gui/                   # GUI components (Qt-based)
│   └── __init__.py
├── tests/                 # Unit and integration tests
├── docs/                  # Documentation
├── vanta_vuln_stats.py   # CLI script
├── vanta_vuln_gui.py     # GUI application
├── main.py               # Main entry point (CLI/GUI selector)
├── requirements.txt      # Core dependencies
└── requirements-gui.txt  # GUI dependencies
```

## Installation

### Core Installation (CLI Only)

1. Install core dependencies:
```bash
pip install -r requirements.txt
# or using uv:
uv pip install -r requirements.txt
```

2. Ensure your credentials are in `VANTA_API_CREDENTIALS.env` file in the following format:
```json
{
  "client_id": "your_client_id",
  "client_secret": "your_client_secret"
}
```

### GUI Installation (Optional)

To use the graphical user interface, install the additional GUI dependencies:

```bash
pip install -r requirements-gui.txt
```

This includes:
- PySide6 (Qt framework)
- matplotlib (plotting)
- pyqtgraph (real-time plots)
- keyring (secure credential storage)
- openpyxl (Excel export)
- reportlab (PDF reports)
- pytest-qt (GUI testing)

## Usage

The utility can be run in two modes: **CLI** (command-line interface) or **GUI** (graphical interface).

### Quick Start

**Using main.py (Recommended):**
```bash
# CLI mode (default)
python main.py

# GUI mode
python main.py --gui

# CLI with options
python main.py --sync --verbose
```

**Direct script usage:**
```bash
# CLI
python vanta_vuln_stats.py

# GUI
python vanta_vuln_gui.py
```

### Basic CLI Usage

Get all vulnerability statistics (uses cached data if available):
```bash
python vanta_vuln_stats.py
# or
python main.py
```

### Database & Caching

**Sync data from Vanta API:**
```bash
python vanta_vuln_stats.py --sync
```

This will fetch fresh data from the API, update the database, and show a sync summary with:
- Number of newly discovered vulnerabilities
- Number of updated vulnerabilities
- Number of remediated vulnerabilities

**Use cached data explicitly:**
```bash
python vanta_vuln_stats.py --use-cache
```

**Specify custom database path:**
```bash
python vanta_vuln_stats.py --database /path/to/custom.db
```

The utility automatically:
- Creates a local SQLite database (`vanta_vulnerabilities.db`) on first run
- Uses cached data by default if available
- Tracks changes between syncs (new vulnerabilities, remediated ones, etc.)
- Stores historical snapshots for trend analysis
- Persists vulnerability remediations and a flattened catalog of every API field for advanced querying

### Filtering Examples

Filter by severity:
```bash
python vanta_vuln_stats.py --severity CRITICAL HIGH
```

Filter by date identified:
```bash
python vanta_vuln_stats.py --date-identified-start 2024-01-01T00:00:00Z --date-identified-end 2024-12-31T23:59:59Z
```

Filter by CVE:
```bash
python vanta_vuln_stats.py --cve CVE-2024-1234
```

Filter by asset ID:
```bash
python vanta_vuln_stats.py --asset-id your-asset-id
```

Combine multiple filters:
```bash
python vanta_vuln_stats.py --severity CRITICAL --date-identified-start 2024-01-01T00:00:00Z
```

### Export Options

Export statistics to JSON file:
```bash
python vanta_vuln_stats.py --output stats.json
```

Export filtered vulnerabilities to JSON:
```bash
python vanta_vuln_stats.py --severity CRITICAL --export-vulnerabilities critical_vulns.json
```

### Verbose Mode

Show detailed progress:
```bash
python vanta_vuln_stats.py --verbose
```

## Graphical Interface

A cross-platform Qt GUI is available if you prefer a visual workflow:

```bash
python vanta_vuln_gui.py
```

The GUI lets you:
- Sync directly from the Vanta API (using the same credential file as the CLI)
- Load previously cached data from the SQLite database
- Apply the same filters (date ranges, severity, CVE, asset) via form controls
- View summary statistics and the filtered vulnerability table
- Export the filtered vulnerability list to JSON

Make sure the credentials and database paths at the top of the window match your environment. Once you load data, click **Apply Filters** to refresh the table and stats, or **Export Filtered JSON** to save the current results.

## Command-Line Arguments

### Database & Sync Options
- `--database PATH` - Path to SQLite database file (default: `vanta_vulnerabilities.db`)
- `--sync` - Fetch fresh data from Vanta API and update database
- `--use-cache` - Use cached data from database (skip API fetch)

### Credentials
- `--credentials PATH` - Path to credentials file (default: `VANTA_API_CREDENTIALS.env`)

### Filters
- `--date-identified-start DATE` - Filter vulnerabilities identified after this date (ISO format)
- `--date-identified-end DATE` - Filter vulnerabilities identified before this date (ISO format)
- `--date-remediated-start DATE` - Filter vulnerabilities remediated after this date (ISO format)
- `--date-remediated-end DATE` - Filter vulnerabilities remediated before this date (ISO format)
- `--severity [CRITICAL|HIGH|MEDIUM|LOW ...]` - Filter by one or more severity levels
- `--cve CVE_ID` - Filter by CVE identifier
- `--asset-id ID` - Filter by asset ID

### Output Options
- `--output FILE` - Export statistics to JSON file
- `--export-vulnerabilities FILE` - Export filtered vulnerabilities to JSON file
- `--verbose` - Show detailed progress information

## Examples

### Example 1: Initial sync from API
```bash
python vanta_vuln_stats.py --sync --verbose
```
Output:
```
Sync Summary:
  Total: 1247
  New: 1247
  Updated: 0
  Remediated: 0
```

### Example 2: Daily update to check for new vulnerabilities
```bash
python vanta_vuln_stats.py --sync --verbose
```
Output:
```
Sync Summary:
  Total: 1253
  New: 12
  Updated: 8
  Remediated: 6
```

### Example 3: Critical vulnerabilities from 2024 (using cache)
```bash
python vanta_vuln_stats.py \
  --use-cache \
  --severity CRITICAL \
  --date-identified-start 2024-01-01T00:00:00Z \
  --date-identified-end 2024-12-31T23:59:59Z \
  --output critical_2024_stats.json \
  --export-vulnerabilities critical_2024_vulns.json
```

### Example 4: High and Critical vulnerabilities that are fixable
```bash
python vanta_vuln_stats.py --severity CRITICAL HIGH
```

### Example 5: All vulnerabilities for a specific asset
```bash
python vanta_vuln_stats.py --asset-id your-asset-id --verbose
```

### Example 6: Search for specific CVE
```bash
python vanta_vuln_stats.py --cve CVE-2024-1234 --export-vulnerabilities cve_details.json
```

## Output Format

The console output provides a comprehensive overview:

```
============================================================
VANTA VULNERABILITY STATISTICS
============================================================

Total Vulnerabilities: 150
  Active: 120
  Deactivated: 30

Unique CVEs: 85
Unique Affected Assets: 45

Fixability:
  Fixable: 100
  Not Fixable: 50

By Severity:
  CRITICAL: 25 (avg CVSS: 9.20)
  HIGH: 45 (avg CVSS: 7.80)
  MEDIUM: 50 (avg CVSS: 5.50)
  LOW: 30 (avg CVSS: 2.30)

By Integration Source:
  Inspector: 80
  Wiz: 40
  Snyk: 30

============================================================
```

## API Reference

The utility uses the Vanta API v1 with the following endpoints:

- `POST /oauth/token` - Authentication
- `GET /v1/vulnerabilities` - Fetch vulnerabilities with pagination

## Database Schema

The SQLite database contains three main tables:

1. **vulnerabilities** - Current state of all vulnerabilities
2. **vulnerability_history** - Historical snapshots tracking changes
   - Tracks when vulnerabilities are discovered
   - Tracks when vulnerabilities are remediated
   - Tracks when vulnerability details are updated
3. **sync_history** - Audit log of sync operations

This allows for:
- Tracking vulnerability trends over time
- Identifying when vulnerabilities were first discovered
- Identifying when vulnerabilities were remediated
- Analyzing the rate of new vulnerabilities vs. remediation

## Notes

- The utility automatically handles pagination to fetch all vulnerabilities
- Rate limiting is handled automatically with retries and delays
- Date remediation is determined by the deactivation date in the vulnerability metadata
- All dates should be in ISO 8601 format (e.g., `2024-01-01T00:00:00Z`)
- First run will automatically fetch data from API and create the database
- Subsequent runs use cached data by default (use `--sync` to refresh)

## Best Practices

1. **Initial Setup:** Run with `--sync` to populate the database
2. **Daily Updates:** Run `--sync` once per day to track changes
3. **Analysis:** Use `--use-cache` for fast queries without API calls
4. **Trend Analysis:** Query the `vulnerability_history` table directly for historical data

## Troubleshooting

### Authentication Errors
Ensure your credentials file is properly formatted and contains valid `client_id` and `client_secret`.

### No Vulnerabilities Returned
Check that your API credentials have the correct permissions (`vanta-api.all:read` scope) and that there are vulnerabilities in your Vanta account.

### Rate Limiting
The utility automatically handles rate limiting with:
- Exponential backoff on 429 errors
- Small delays (0.5s) between pagination requests
- Automatic retries with waiting periods

If you still encounter rate limiting, the utility will wait and retry automatically.
