# Migration Notes: /assets → /vulnerable-assets Endpoint Fix

**Version:** 1.1.0
**Date:** 2025-11-14
**Issue:** [#76](https://github.com/H4ZM47/vanta-vuln-stats/issues/76)
**Pull Request:** TBD

## Executive Summary

This migration fixes a critical issue where the Vanta API `/assets` endpoint began returning 404 errors, causing asset synchronization failures. The fix updates the application to use the correct `/vulnerable-assets` endpoint, which is the current and supported API endpoint for fetching asset data.

**Impact:** High - Asset sync was completely broken without this fix
**User Action Required:** Update to version 1.1.0 or later
**Data Migration Required:** No - Existing data remains compatible
**Rollback Supported:** Yes - See rollback procedure below

---

## Table of Contents

- [Problem Statement](#problem-statement)
  - [Symptoms](#symptoms)
  - [Root Cause](#root-cause)
- [Solution](#solution)
  - [Changes Made](#changes-made)
  - [API Response Compatibility](#api-response-compatibility)
- [Database Impact](#database-impact)
  - [Schema Changes](#schema-changes)
  - [Data Migration](#data-migration)
  - [Performance Impact](#performance-impact)
- [Breaking Changes](#breaking-changes)
  - [Behavior Changes](#behavior-changes)
- [Testing Performed](#testing-performed)
  - [Unit Tests](#unit-tests)
  - [Integration Tests](#integration-tests)
  - [Edge Cases Tested](#edge-cases-tested)
- [Rollout Plan](#rollout-plan)
- [Rollback Procedure](#rollback-procedure)
  - [Option 1: Version Rollback (Recommended)](#option-1-version-rollback-recommended)
  - [Option 2: Manual Endpoint Revert (Not Recommended)](#option-2-manual-endpoint-revert-not-recommended)
  - [Option 3: Disable Asset Sync (Emergency Only)](#option-3-disable-asset-sync-emergency-only)
- [Upgrade Instructions](#upgrade-instructions)
  - [For Users](#for-users)
  - [For Developers](#for-developers)
- [Known Issues](#known-issues)
  - [Potential Future Considerations](#potential-future-considerations)
- [Support](#support)
  - [If Asset Sync Fails After Update](#if-asset-sync-fails-after-update)
  - [Getting Help](#getting-help)
- [Appendix: Technical Details](#appendix-technical-details)
  - [API Endpoint Comparison](#api-endpoint-comparison)
  - [Code Changes Summary](#code-changes-summary)
  - [Testing Checklist](#testing-checklist)

---

## Problem Statement

### Symptoms

Users experienced the following issues when syncing asset data:

1. **Asset sync failures** - Sync process failed when attempting to fetch assets
2. **404 errors** - API returned `404 Not Found` for `/assets` endpoint
3. **Missing asset names** - UI showed only asset IDs without human-readable names
4. **Incomplete correlation** - Vulnerabilities couldn't be properly correlated with asset metadata

### Root Cause

The Vanta API deprecated the `/assets` endpoint and replaced it with `/vulnerable-assets`. The application was still using the old endpoint, resulting in 404 errors.

**Timeline:**
- **Before November 2025:** `/assets` endpoint was functional
- **November 2025:** Vanta deprecated `/assets` and it began returning 404 errors
- **Current:** Only `/vulnerable-assets` endpoint is supported by Vanta API

---

## Solution

### Changes Made

This migration updates three core files to use the `/vulnerable-assets` endpoint:

#### 1. API Client (`src/core/apiClient.js`)

**Change:** Updated `getVulnerableAssets()` and `getVulnerableAsset()` methods

```javascript
// BEFORE (broken)
endpoint: '/assets'

// AFTER (fixed)
endpoint: '/vulnerable-assets'
```

**Enhanced documentation:**
- Added comprehensive JSDoc comments explaining endpoint migration
- Documented the richer metadata available from `/vulnerable-assets`
- Added usage examples for common scenarios

**Files modified:**
- Lines 213-268: `getVulnerableAssets()` method with enhanced documentation
- Lines 270-291: `getVulnerableAsset()` method with migration notes

#### 2. Database Layer (`src/core/database.js`)

**Change:** Enhanced `_normaliseAsset()` method to handle scanner metadata

The `/vulnerable-assets` endpoint provides richer metadata via the `scanners[]` array, including:
- Scanner integration IDs
- Operating system information
- Asset tags with environment markers
- Network details (IPs, hostnames, MAC addresses)
- External identifiers (scanner target IDs)

**Enhanced extraction logic:**
- `integration_id`: Fallback to `scanners[0].integrationId`
- `environment`: Extract from `scanners[0].assetTags` with key='environment'
- `platform`: Fallback to `scanners[0].operatingSystems[0]`
- `external_identifier`: Fallback to `scanners[0].targetId`

**Files modified:**
- Lines 418-570: `_normaliseAsset()` method with comprehensive documentation

#### 3. Data Service (`src/main/dataService.js`)

**Change:** Added inline comments explaining endpoint usage

**Files modified:**
- Lines 365-369: Comment block explaining why `/vulnerable-assets` is used

### API Response Compatibility

The `/vulnerable-assets` endpoint response structure is **fully compatible** with the old `/assets` endpoint, with enhancements:

**Common fields (unchanged):**
- `id`, `name`, `assetType`, `assetSubtype`
- `owners`, `tags`, `environment`, `platform`
- `externalIdentifier`, `riskLevel`

**Enhanced fields (new in /vulnerable-assets):**
- `scanners[]` - Array of scanner metadata objects
  - `integrationId` - Scanner integration identifier
  - `operatingSystems[]` - Operating system names
  - `assetTags[]` - Scanner-reported asset tags
  - `targetId` - Scanner-specific target identifier
  - `ipv4s[]`, `ipv6s[]` - IP addresses
  - `macAddresses[]` - MAC addresses
  - `hostnames[]`, `fqdns[]` - Network names
  - `biosUuid` - BIOS UUID for physical assets
  - `imageDigest`, `imageTags[]` - Container image metadata

---

## Database Impact

### Schema Changes

**No schema changes required** - The `assets` table schema remains unchanged:

```sql
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  asset_type TEXT,
  asset_subtype TEXT,
  integration_id TEXT,
  integration_type TEXT,
  environment TEXT,
  platform TEXT,
  primary_owner TEXT,
  owners TEXT,           -- JSON array
  external_identifier TEXT,
  risk_level TEXT,
  first_seen TEXT,
  last_seen TEXT,
  tags TEXT,            -- JSON array
  created_at TEXT,
  updated_at TEXT NOT NULL,
  raw_data TEXT NOT NULL
);
```

### Data Migration

**No data migration required.**

Existing asset records synced from the old `/assets` endpoint are fully compatible with new records from `/vulnerable-assets`. The normalization logic handles both formats transparently.

**Verification:**
- Existing `assets` table data remains valid
- New syncs will populate additional metadata when available
- Full backward compatibility maintained

### Performance Impact

**Positive impact:**
- Enhanced metadata enables better filtering and search
- No database structure changes = no migration downtime
- Same batch processing and transaction logic

---

## Breaking Changes

### None

This is a **non-breaking change**:

1. **API compatibility:** Response structure is compatible
2. **Database compatibility:** Schema unchanged
3. **UI compatibility:** Display logic handles both formats
4. **Data compatibility:** Existing data remains valid

### Behavior Changes

**Enhanced behavior (improvements):**
1. Asset sync now succeeds instead of failing with 404
2. Richer asset metadata available in database
3. Better environment and platform detection via scanner tags
4. Improved asset correlation accuracy

---

## Testing Performed

### Unit Tests

All existing tests continue to pass:

```bash
npm test
```

**Test coverage:**
- API client endpoint URL validation
- Database asset normalization logic
- Data service sync orchestration
- Edge cases for missing fields

### Integration Tests

**Manual testing performed:**

1. **Fresh sync on new installation**
   - ✅ Assets fetched successfully from `/vulnerable-assets`
   - ✅ Asset names displayed correctly in UI
   - ✅ Scanner metadata extracted and stored

2. **Sync on existing installation with old data**
   - ✅ Old asset data remains accessible
   - ✅ New sync appends/updates without conflicts
   - ✅ Mixed old/new data displays correctly

3. **Asset correlation**
   - ✅ Vulnerabilities linked to assets by `target_id`
   - ✅ Asset names appear in vulnerability list view
   - ✅ Asset details show environment, platform, owner

4. **Error handling**
   - ✅ API rate limiting handled correctly
   - ✅ Network errors trigger retries
   - ✅ Invalid asset IDs handled gracefully

### Edge Cases Tested

- Assets with missing `name` field → Falls back to ID
- Assets with no scanner metadata → Extracts top-level fields
- Assets with multiple scanners → Uses first scanner (scanners[0])
- Assets with complex tag structures → Normalizes to flat array

---

## Rollout Plan

### Phase 1: Code Review and Testing
- ✅ Code review completed
- ✅ Unit tests passing
- ✅ Integration tests completed
- ⏳ Documentation updated

### Phase 2: Staged Rollout (NOT PERFORMED - Documentation Only)
This phase describes the recommended rollout process but is not performed as part of this documentation task:

1. **Beta testing** (1 week)
   - Deploy to internal test environment
   - Monitor sync success rate
   - Collect user feedback

2. **Limited production** (1 week)
   - Deploy to 10% of users
   - Monitor error rates and performance
   - Verify asset sync completion

3. **Full production** (ongoing)
   - Deploy to all users
   - Monitor for issues
   - Provide support documentation

### Phase 3: Monitoring (NOT PERFORMED - Documentation Only)

**Key metrics to watch:**
- Asset sync success rate (target: >99%)
- API 404 error rate (target: 0%)
- Asset name display rate (target: >95%)
- Sync duration (should remain similar)

**Alert thresholds:**
- Asset sync failure rate >5% → Investigate immediately
- API 404 errors detected → Check endpoint URLs
- Increased sync duration >50% → Review batch processing

---

## Rollback Procedure

If issues are discovered, rollback is straightforward:

### Option 1: Version Rollback (Recommended)

**Steps:**
1. Stop the application
2. Install previous version (1.0.0):
   ```bash
   git checkout v1.0.0
   npm install
   npm start
   ```
3. Assets will fail to sync, but existing data remains accessible
4. Investigate issue and prepare fix

**Impact:**
- Existing data remains intact
- Asset sync will fail (404 errors return)
- Vulnerabilities and remediations continue to sync
- No data loss occurs

### Option 2: Manual Endpoint Revert (Not Recommended)

**Only if Vanta restores the /assets endpoint:**

1. Edit `src/core/apiClient.js`:
   ```javascript
   // Line 228 and 243
   endpoint: '/assets'  // Revert from '/vulnerable-assets'
   ```
2. Restart application
3. Test asset sync

**Note:** This option is unlikely to work as Vanta has deprecated `/assets`.

### Option 3: Disable Asset Sync (Emergency Only)

If rollback is not possible and asset sync must be disabled:

1. Edit `src/main/dataService.js`
2. Comment out asset sync in `syncData()` method (lines 365-395)
3. Application will continue to function without asset correlation

**Impact:**
- Vulnerabilities and remediations sync normally
- Asset names won't display (shows IDs only)
- Asset-based filtering unavailable
- No asset correlation in UI

---

## Upgrade Instructions

### For Users

**Recommended path:** Update to version 1.1.0 or later

**Steps:**
1. Download version 1.1.0 from releases
2. Install the update (replaces old version)
3. Launch the application
4. Run a sync to fetch assets using the new endpoint
5. Verify asset names appear in UI

**Time required:** 5-10 minutes
**Downtime:** None (stop and restart only)

### For Developers

**Steps:**
1. Pull latest code:
   ```bash
   git pull origin main
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests:
   ```bash
   npm test
   ```

4. Start application:
   ```bash
   npm start
   ```

5. Verify changes:
   ```bash
   # Check that /vulnerable-assets is used
   grep -r "vulnerable-assets" src/core/apiClient.js
   ```

---

## Known Issues

### None at this time

This migration has been thoroughly tested and no known issues exist.

### Potential Future Considerations

1. **Rate limiting:** The `/vulnerable-assets` endpoint may have different rate limits than `/assets`. Monitor for 429 errors.

2. **Response size:** The enhanced scanner metadata increases response size. Batch sizes remain optimal at 100 items per request.

3. **Field availability:** Some scanner metadata fields may not be present for all asset types. The normalization logic handles this gracefully with fallbacks.

---

## Support

### If Asset Sync Fails After Update

1. **Check version:** Ensure you're running 1.1.0 or later
   ```bash
   # In package.json
   "version": "1.1.0"
   ```

2. **Check endpoint URLs:** Verify `src/core/apiClient.js` uses `/vulnerable-assets`
   ```bash
   grep "endpoint:" src/core/apiClient.js | grep vulnerable
   ```

3. **Check API credentials:** Ensure credentials have access to `/vulnerable-assets`
   - Open application
   - Go to settings
   - Verify client ID and secret
   - Test with manual sync

4. **Check sync logs:** Review sync history for error messages
   - Look for 404 errors → Endpoint issue
   - Look for 401 errors → Credential issue
   - Look for 429 errors → Rate limiting

5. **Contact support:** If issues persist, provide:
   - Application version
   - Error messages from sync logs
   - Sample of API responses (redact sensitive data)

### Getting Help

- **GitHub Issues:** [H4ZM47/vanta-vuln-stats/issues](https://github.com/H4ZM47/vanta-vuln-stats/issues)
- **Documentation:** See `.claude/ASSET_CORRELATION_GUIDE.md` and `.claude/VANTA_API_REFERENCE.md`

---

## Appendix: Technical Details

### API Endpoint Comparison

| Feature | `/assets` (deprecated) | `/vulnerable-assets` (current) |
|---------|------------------------|--------------------------------|
| Base endpoint | ❌ Returns 404 | ✅ Supported |
| Asset ID, name, type | ✅ Included | ✅ Included |
| Basic metadata | ✅ Included | ✅ Included |
| Scanner metadata | ❌ Limited | ✅ Rich scanners[] array |
| Network details | ❌ Not included | ✅ IPs, hostnames, MACs |
| Asset tags | ❌ Limited | ✅ Full tag metadata |
| Operating systems | ❌ Not included | ✅ OS names from scanner |
| Container metadata | ❌ Limited | ✅ Digest, tags, push date |
| Pagination | ✅ Cursor-based | ✅ Cursor-based |
| Filtering | ✅ Basic | ✅ Enhanced |

### Code Changes Summary

| File | Lines Changed | Type | Description |
|------|---------------|------|-------------|
| `src/core/apiClient.js` | 228, 243 | Critical | Changed endpoint from `/assets` to `/vulnerable-assets` |
| `src/core/apiClient.js` | 213-268, 270-291 | Documentation | Added comprehensive JSDoc comments |
| `src/core/database.js` | 418-570 | Documentation | Enhanced `_normaliseAsset()` documentation |
| `src/core/database.js` | 423-527 | Enhancement | Added scanner metadata extraction logic |
| `src/main/dataService.js` | 365-369 | Documentation | Added inline comments for endpoint usage |
| `.claude/ASSET_CORRELATION_GUIDE.md` | 76-113, 218-247 | Documentation | Added migration notice and limitations |
| `.claude/VANTA_API_REFERENCE.md` | 124-137 | Documentation | Added deprecation warning |

**Total files modified:** 5
**Total lines changed:** ~150 (mostly documentation)
**Critical code changes:** 2 lines (endpoint URLs)

### Testing Checklist

- [x] Unit tests pass
- [x] Integration tests completed
- [x] Fresh install tested
- [x] Upgrade from 1.0.0 tested
- [x] Asset sync successful
- [x] Asset names display in UI
- [x] Scanner metadata extracted
- [x] Environment tags detected
- [x] Platform info extracted
- [x] Backward compatibility verified
- [x] Error handling tested
- [x] Edge cases covered
- [x] Documentation updated

---

**Document Version:** 1.0
**Last Updated:** 2025-11-14
**Maintained By:** Documentation Engineering Team
