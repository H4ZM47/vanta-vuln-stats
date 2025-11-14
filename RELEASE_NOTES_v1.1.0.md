# Release Notes: Version 1.1.0

**Release Date:** 2025-11-14
**Status:** Ready for Release

---

## Critical Bug Fix: Asset Sync Restored

This release fixes a critical issue where asset synchronization was completely broken due to the Vanta API deprecating the `/assets` endpoint. **If you're experiencing asset sync failures with 404 errors, this update resolves the issue.**

---

## What's Fixed

### Asset Sync 404 Errors

**Problem:** The Vanta API deprecated the `/assets` endpoint in November 2025, causing it to return 404 errors. This resulted in:
- Complete asset sync failures
- Missing asset names in the UI (only IDs visible)
- Incomplete vulnerability-to-asset correlation
- Frustrating user experience

**Solution:** We've migrated to the official `/vulnerable-assets` endpoint, which is the correct and supported API endpoint. Asset sync now works perfectly and includes even richer metadata than before.

**Impact:**
- ✅ Asset sync succeeds instead of failing
- ✅ Human-readable asset names displayed throughout the UI
- ✅ Enhanced asset metadata (environment, platform, owner info)
- ✅ Better asset correlation accuracy

---

## What's Improved

### Enhanced Asset Metadata

The new `/vulnerable-assets` endpoint provides richer information about your assets:

**New metadata extracted:**
- Environment information from scanner asset tags
- Operating system details from scanner metadata
- Network information (IPs, hostnames, MAC addresses)
- Scanner-specific identifiers and integration details
- Asset tags with key-value pairs

**Example:**
```
Before: Asset ID "abc123"
After:  "production-server-01" (SERVER)
        Environment: production
        Platform: Ubuntu 20.04 LTS
        Owner: alice@example.com
```

### Better Documentation

- Comprehensive API method documentation with examples
- Detailed migration guide with rollback procedures
- Updated API reference with deprecation warnings
- Enhanced troubleshooting guides

---

## Breaking Changes

**None.** This is a fully backward-compatible update.

- ✅ Existing asset data remains valid
- ✅ No database migration required
- ✅ No user action needed beyond installing the update
- ✅ Rollback supported if needed

---

## Upgrade Instructions

### For Users

**Recommended:** Update to 1.1.0 immediately to restore asset sync functionality.

**Steps:**
1. Download version 1.1.0 from the releases page
2. Install the update (replaces version 1.0.0)
3. Launch the application
4. Click "Sync Data" to fetch assets using the new endpoint
5. Verify asset names appear in the vulnerability list and asset explorer

**Time required:** 5-10 minutes
**Downtime:** None (stop and restart only)

### For Developers

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Run tests
npm test

# Start application
npm start
```

---

## Technical Details

### API Endpoint Migration

**Changed endpoints:**
- ~~`GET /assets`~~ → `GET /vulnerable-assets` ✅
- ~~`GET /assets/{id}`~~ → `GET /vulnerable-assets/{id}` ✅

**Response structure:** Fully compatible with enhanced scanner metadata

### Files Modified

| File | Changes | Impact |
|------|---------|--------|
| `src/core/apiClient.js` | Endpoint URLs + documentation | Critical fix |
| `src/core/database.js` | Enhanced metadata extraction | Enhancement |
| `src/main/dataService.js` | Inline comments | Documentation |
| `.claude/*.md` | Migration guides | Documentation |

**Total lines changed:** ~150 (mostly documentation)
**Critical code changes:** 2 lines (endpoint URLs)

### Testing Coverage

- ✅ All unit tests passing
- ✅ Integration tests completed
- ✅ Fresh install tested
- ✅ Upgrade from 1.0.0 tested
- ✅ Backward compatibility verified
- ✅ Error handling validated
- ✅ Edge cases covered

---

## Known Issues

### None

This release has been thoroughly tested and no known issues exist.

### Future Considerations

- Monitor for rate limiting on the new `/vulnerable-assets` endpoint
- Track any variations in response size due to enhanced metadata
- Continue to improve scanner metadata extraction logic

---

## Rollback

If you need to rollback for any reason:

**Option 1: Version Rollback (Recommended)**
```bash
git checkout v1.0.0
npm install
npm start
```
Note: Asset sync will fail in 1.0.0, but existing data remains accessible.

**Option 2: Emergency Disable**
Comment out asset sync in `src/main/dataService.js` (lines 365-395). Vulnerabilities and remediations will continue to sync normally.

**Full details:** See `MIGRATION_NOTES.md`

---

## What's Next

### Version 1.2.0 (Planned)

- Enhanced asset filtering by tags and environment
- Asset change tracking over time
- Network visualization for asset relationships
- Export capabilities for asset-specific reports

### Feedback Welcome

We'd love to hear from you:
- Report issues: [GitHub Issues](https://github.com/H4ZM47/vanta-vuln-stats/issues)
- Feature requests: [GitHub Discussions](https://github.com/H4ZM47/vanta-vuln-stats/discussions)
- Documentation feedback: Open a PR

---

## Support

### Getting Help

If you experience issues after upgrading:

1. **Verify version:** Check that package.json shows `"version": "1.1.0"`
2. **Check endpoint:** Verify `src/core/apiClient.js` uses `/vulnerable-assets`
3. **Test credentials:** Ensure API credentials have proper permissions
4. **Review logs:** Check sync history for error messages
5. **Contact support:** Open a GitHub issue with error details

### Documentation

- **Migration Guide:** See `MIGRATION_NOTES.md` for complete details
- **Asset Correlation:** See `.claude/ASSET_CORRELATION_GUIDE.md`
- **API Reference:** See `.claude/VANTA_API_REFERENCE.md`
- **Main README:** See `README.md` for general information

---

## Contributors

Thank you to everyone who reported the asset sync issue and helped test the fix:
- Issue reported by: [Community feedback]
- Testing and validation: [Internal team]
- Documentation: [Documentation engineering]

---

## Download

**Recommended:** [Download v1.1.0](https://github.com/H4ZM47/vanta-vuln-stats/releases/tag/v1.1.0)

**Platform-specific builds:**
- macOS: `Vanta-Vulnerability-Stats-1.1.0.dmg`
- Windows: `Vanta-Vulnerability-Stats-Setup-1.1.0.exe`
- Linux: `Vanta-Vulnerability-Stats-1.1.0.AppImage`

**Checksums:** See release assets for SHA256 checksums

---

## Full Changelog

See [CHANGELOG.md](CHANGELOG.md) for complete version history.

---

**Happy vulnerability hunting! 🔒**

Questions? Open an issue or discussion on GitHub.
