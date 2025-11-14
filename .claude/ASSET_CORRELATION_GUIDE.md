# Asset Correlation Implementation Guide

This guide explains how asset correlation works in the Vanta Vulnerability Dashboard and how to leverage the Vanta Assets API.

## Overview

The application now correlates vulnerability data with asset information from the Vanta API, allowing you to see human-readable asset names instead of just IDs.

## Database Schema

### vulnerable_assets Table

```sql
CREATE TABLE vulnerable_assets (
  id TEXT PRIMARY KEY,              -- Asset ID (matches targetId in vulnerabilities)
  name TEXT,                        -- Human-readable asset name
  asset_type TEXT,                  -- SERVER, CODE_REPOSITORY, etc.
  has_been_scanned INTEGER,         -- Boolean: has asset been scanned
  image_scan_tag TEXT,              -- Container image tag (for containers)
  scanners TEXT,                    -- JSON array of scanner metadata
  updated_at TEXT NOT NULL,         -- Last update timestamp
  raw_data TEXT NOT NULL            -- Full JSON payload from API
);
```

### Indexes

- `idx_assets_type` - Fast filtering by asset type
- `idx_assets_name` - Fast searching by asset name

## Data Flow

### Sync Process

1. **Fetch Data in Parallel**
   ```
   ┌──────────────────────────────────────────┐
   │           Sync Operation                 │
   ├──────────────────────────────────────────┤
   │  ┌────────────────┐  ┌────────────────┐  │
   │  │ Vulnerabilities│  │  Remediations  │  │
   │  └────────────────┘  └────────────────┘  │
   │  ┌────────────────┐                      │
   │  │ Vulnerable     │                      │
   │  │ Assets         │                      │
   │  └────────────────┘                      │
   └──────────────────────────────────────────┘
   ```

2. **Batch Processing**
   - Assets fetched in batches of 100
   - Buffered in memory (1000 records)
   - Flushed to database in transactions

3. **Correlation**
   - Vulnerabilities store `target_id` (asset ID)
   - LEFT JOIN with `vulnerable_assets` table
   - Display `assetName` or fall back to `assetId`

### Query Example

```sql
SELECT
  v.target_id as assetId,
  COALESCE(a.name, v.target_id) as assetName,
  a.asset_type as assetType,
  COUNT(*) as vulnerabilityCount
FROM vulnerabilities v
LEFT JOIN vulnerable_assets a ON v.target_id = a.id
GROUP BY v.target_id, a.name, a.asset_type
ORDER BY vulnerabilityCount DESC, assetName ASC
```

## API Integration

### Endpoint Migration Notice

**IMPORTANT:** The application now uses the `/vulnerable-assets` endpoint instead of the deprecated `/assets` endpoint. The `/assets` endpoint was returning 404 errors and has been replaced by Vanta with the `/vulnerable-assets` endpoint, which provides:
- The same asset data with improved structure
- Richer scanner metadata via the `scanners[]` array
- Better support for asset correlation and filtering
- Full backward compatibility with existing data

All asset-related API calls in this application automatically use the correct `/vulnerable-assets` endpoint.

### Fetch Vulnerable Assets

```javascript
// Uses /vulnerable-assets endpoint (correct)
const assets = await apiClient.getVulnerableAssets({
  pageSize: 100,
  filters: {
    assetType: 'SERVER',        // Optional: filter by type
    integrationId: 'qualys',    // Optional: filter by scanner
    q: 'production'             // Optional: search query
  },
  onBatch: (batch) => {
    // Process each batch of assets
    console.log(`Received ${batch.length} assets`);
  },
  signal: abortController.signal  // For cancellation
});
```

### Fetch Single Asset

```javascript
// Uses /vulnerable-assets/{id} endpoint (correct)
const asset = await apiClient.getVulnerableAsset('asset-id-123');
console.log(asset.name);          // "production-server-01"
console.log(asset.assetType);     // "SERVER"
console.log(asset.scanners);      // Array of scanner metadata
```

## Asset Types

| Type | Description | Scanner Fields |
|------|-------------|----------------|
| `SERVER` | Physical/virtual servers | IPs, hostnames, OS, BIOS UUID |
| `WORKSTATION` | End-user workstations | IPs, hostnames, OS, MAC addresses |
| `CODE_REPOSITORY` | Source code repos | Repo URL, branch info |
| `CONTAINER_REPOSITORY` | Container registries | Registry URL, repo name |
| `CONTAINER_REPOSITORY_IMAGE` | Container images | Digest, tags, push date |
| `SERVERLESS_FUNCTION` | Lambda/Cloud Functions | Function name, runtime |
| `MANIFEST_FILE` | Package manifests | File path, package manager |

## Scanner Metadata

Each asset includes detailed scanner metadata:

```json
{
  "resourceId": "scanner-resource-id",
  "integrationId": "qualys",
  "targetId": "scanner-target-id",
  "ipv4s": ["192.168.1.100"],
  "ipv6s": ["fe80::1"],
  "macAddresses": ["00:11:22:33:44:55"],
  "hostnames": ["web-server"],
  "fqdns": ["web-server.example.com"],
  "operatingSystems": ["Ubuntu 20.04 LTS"],
  "assetTags": [
    {"key": "environment", "value": "production"},
    {"key": "team", "value": "platform"}
  ],
  "parentAccountOrOrganization": "aws-account-id",
  "biosUuid": "uuid-string",
  "imageDigest": "sha256:...",
  "imageTags": ["v1.2.3", "latest"],
  "imagePushedAtDate": "2025-01-01T00:00:00.000Z"
}
```

## UI Integration

### Asset Explorer View

The "By Asset" tab now displays:
- **Asset Name** - Human-readable name from API
- **Asset Type** - Displayed in parentheses
- **Vulnerability Counts** - Total, active, remediated

### Search Enhancement

Asset search now includes:
- Asset ID (original behavior)
- Asset name (new)
- Asset type (new)

```javascript
const filteredAssets = assets.filter((asset) =>
  asset.assetId?.toLowerCase().includes(searchTerm) ||
  asset.assetName?.toLowerCase().includes(searchTerm) ||
  asset.assetType?.toLowerCase().includes(searchTerm)
);
```

### Display Logic

```javascript
// Show name if different from ID, otherwise show ID
const displayName = asset.assetName !== asset.assetId
  ? asset.assetName
  : asset.assetId;

// Add type label if available
const typeLabel = asset.assetType
  ? `(${asset.assetType})`
  : '';
```

## Performance Considerations

### Caching Strategy

1. **Asset List Cache**
   - Cached per filter combination
   - Invalidated when filters change
   - Reduces redundant database queries

2. **Database Indexes**
   - `idx_assets_type` for type filtering
   - `idx_assets_name` for name searches
   - `idx_vulnerabilities_target` for joins

### Sync Optimization

1. **Parallel Fetching**
   - Assets fetched alongside vulnerabilities
   - No blocking dependencies
   - Maximizes API throughput

2. **Batch Processing**
   - 100 items per API request
   - 1000 items per database transaction
   - Balances memory and performance

## Known Limitations

### API Endpoint Compatibility

**Deprecated /assets endpoint:** The original `/assets` endpoint is no longer available and returns 404 errors. This application has been updated to use the correct `/vulnerable-assets` endpoint.

**Impact:** Users on older versions (< 1.1.0) will experience sync failures when attempting to fetch asset data. Update to version 1.1.0 or later to resolve this issue.

**Data compatibility:** Asset data synced from the deprecated `/assets` endpoint is fully compatible with data from the `/vulnerable-assets` endpoint. No data migration is required when upgrading.

### Scanner Metadata Availability

Some asset fields depend on scanner metadata which may not be present for all asset types:
- **Operating system information:** Only available for SERVER and WORKSTATION assets
- **Network details (IPs, hostnames):** Only available for network-connected assets
- **Image metadata:** Only available for CONTAINER_REPOSITORY_IMAGE assets
- **Environment tags:** May not be present if not configured in the scanner

## Troubleshooting

### Asset Names Not Showing

**Symptoms:** Assets still displayed as IDs

**Solutions:**
1. Run a sync to fetch asset data
2. Check sync logs for asset fetch errors
3. Verify API credentials have access to `/vulnerable-assets` endpoint
4. Check for API rate limiting
5. Ensure you're running version 1.1.0 or later (older versions use deprecated `/assets` endpoint)

### Missing Asset Types

**Symptoms:** Some assets show type, others don't

**Reason:** Asset type is optional in API response

**Solution:** Normal behavior - some assets may not have types

### Slow Asset Queries

**Symptoms:** Asset view takes long to load

**Solutions:**
1. Ensure database indexes exist:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_assets_type ON vulnerable_assets(asset_type);
   CREATE INDEX IF NOT EXISTS idx_assets_name ON vulnerable_assets(name);
   ```
2. Check database file isn't locked by another process
3. Consider reducing page size in UI

## Migration Notes

### Existing Installations

The application automatically:
1. Creates `vulnerable_assets` table on first run
2. Adds necessary indexes
3. Backward compatible with old data

### Manual Migration

If needed, manually create the table:

```sql
CREATE TABLE IF NOT EXISTS vulnerable_assets (
  id TEXT PRIMARY KEY,
  name TEXT,
  asset_type TEXT,
  has_been_scanned INTEGER,
  image_scan_tag TEXT,
  scanners TEXT,
  updated_at TEXT NOT NULL,
  raw_data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_type ON vulnerable_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_name ON vulnerable_assets(name);
```

## Future Enhancements

### Potential Improvements

1. **Asset Details View**
   - Click asset to see full scanner metadata
   - View all vulnerabilities across time
   - Export asset-specific reports

2. **Advanced Filtering**
   - Filter by asset tags
   - Filter by IP ranges
   - Filter by operating system

3. **Asset Tracking**
   - Track asset changes over time
   - Alert on new assets
   - Identify orphaned assets

4. **Network Visualization**
   - Graph asset relationships
   - Visualize network topology
   - Show vulnerability propagation paths

---

**Document Version:** 1.0
**Last Updated:** 2025-11-14
**Related Files:**
- `src/core/database.js` - Database schema and queries
- `src/core/apiClient.js` - API integration
- `src/main/dataService.js` - Sync orchestration
- `src/renderer/index.js` - UI rendering
