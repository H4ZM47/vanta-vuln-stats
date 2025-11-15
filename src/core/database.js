const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const dayjs = require('dayjs');

const ensureDirectory = (filePath) => {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

class VulnerabilityDatabase {
  constructor(databasePath) {
    this.databasePath = databasePath;
    ensureDirectory(databasePath);
    this.db = new Database(databasePath);

    // Performance optimizations for faster sync operations
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL'); // Reduce fsync calls for better performance
    this.db.pragma('cache_size = -64000'); // 64MB cache (negative means KB)
    this.db.pragma('temp_store = MEMORY'); // Store temp tables in memory
    this.db.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O

    this._createTables();
    this.statements = {
      selectVulnerabilityRaw: this.db.prepare('SELECT raw_data FROM vulnerabilities WHERE id = ?'),
      upsertVulnerability: this.db.prepare(`
        INSERT INTO vulnerabilities (
          id, name, description, integration_id, package_identifier, vulnerability_type,
          target_id, first_detected, source_detected, last_detected, severity, cvss_score,
          scanner_score, is_fixable, remediate_by, external_url, scan_source,
          deactivated_on, related_vulns, related_urls, updated_at, raw_data
        ) VALUES (
          @id, @name, @description, @integration_id, @package_identifier, @vulnerability_type,
          @target_id, @first_detected, @source_detected, @last_detected, @severity, @cvss_score,
          @scanner_score, @is_fixable, @remediate_by, @external_url, @scan_source,
          @deactivated_on, @related_vulns, @related_urls, @updated_at, @raw_data
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          integration_id = excluded.integration_id,
          package_identifier = excluded.package_identifier,
          vulnerability_type = excluded.vulnerability_type,
          target_id = excluded.target_id,
          first_detected = excluded.first_detected,
          source_detected = excluded.source_detected,
          last_detected = excluded.last_detected,
          severity = excluded.severity,
          cvss_score = excluded.cvss_score,
          scanner_score = excluded.scanner_score,
          is_fixable = excluded.is_fixable,
          remediate_by = excluded.remediate_by,
          external_url = excluded.external_url,
          scan_source = excluded.scan_source,
          deactivated_on = excluded.deactivated_on,
          related_vulns = excluded.related_vulns,
          related_urls = excluded.related_urls,
          updated_at = excluded.updated_at,
          raw_data = excluded.raw_data
      `),
      selectRemediationRaw: this.db.prepare('SELECT raw_data FROM vulnerability_remediations WHERE id = ?'),
      upsertRemediation: this.db.prepare(`
        INSERT INTO vulnerability_remediations (
          id, vulnerability_id, vulnerable_asset_id, severity, detected_date, sla_deadline_date,
          remediation_date, remediated_on_time, integration_id, integration_type, status,
          updated_at, raw_data
        ) VALUES (
          @id, @vulnerability_id, @vulnerable_asset_id, @severity, @detected_date, @sla_deadline_date,
          @remediation_date, @remediated_on_time, @integration_id, @integration_type, @status,
          @updated_at, @raw_data
        )
        ON CONFLICT(id) DO UPDATE SET
          vulnerability_id = excluded.vulnerability_id,
          vulnerable_asset_id = excluded.vulnerable_asset_id,
          severity = excluded.severity,
          detected_date = excluded.detected_date,
          sla_deadline_date = excluded.sla_deadline_date,
          remediation_date = excluded.remediation_date,
          remediated_on_time = excluded.remediated_on_time,
          integration_id = excluded.integration_id,
          integration_type = excluded.integration_type,
          status = excluded.status,
          updated_at = excluded.updated_at,
          raw_data = excluded.raw_data
      `),
      selectAssetRaw: this.db.prepare('SELECT raw_data FROM assets WHERE id = ?'),
      upsertAsset: this.db.prepare(`
        INSERT INTO assets (
          id, name, description, asset_type, asset_subtype, integration_id, integration_type,
          environment, platform, primary_owner, owners, external_identifier, risk_level,
          first_seen, last_seen, tags, created_at, updated_at, raw_data
        ) VALUES (
          @id, @name, @description, @asset_type, @asset_subtype, @integration_id, @integration_type,
          @environment, @platform, @primary_owner, @owners, @external_identifier, @risk_level,
          @first_seen, @last_seen, @tags, @created_at, @updated_at, @raw_data
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          asset_type = excluded.asset_type,
          asset_subtype = excluded.asset_subtype,
          integration_id = excluded.integration_id,
          integration_type = excluded.integration_type,
          environment = excluded.environment,
          platform = excluded.platform,
          primary_owner = excluded.primary_owner,
          owners = excluded.owners,
          external_identifier = excluded.external_identifier,
          risk_level = excluded.risk_level,
          first_seen = excluded.first_seen,
          last_seen = excluded.last_seen,
          tags = excluded.tags,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          raw_data = excluded.raw_data
      `),
      insertSync: this.db.prepare(`
        INSERT INTO sync_history (
          sync_date,
          vulnerabilities_count, vulnerabilities_new, vulnerabilities_updated, vulnerabilities_remediated,
          remediations_count, remediations_new, remediations_updated,
          assets_count, assets_new, assets_updated,
          new_count, updated_count, remediated_count
        )
        VALUES (
          @sync_date,
          @vulnerabilities_count, @vulnerabilities_new, @vulnerabilities_updated, @vulnerabilities_remediated,
          @remediations_count, @remediations_new, @remediations_updated,
          @assets_count, @assets_new, @assets_updated,
          @new_count, @updated_count, @remediated_count
        )
      `),
      insertSyncEvent: this.db.prepare(`
        INSERT INTO sync_history (
          sync_date,
          event_type,
          message,
          details,
          vulnerabilities_count, vulnerabilities_new, vulnerabilities_updated, vulnerabilities_remediated,
          remediations_count, remediations_new, remediations_updated,
          assets_count, assets_new, assets_updated,
          new_count, updated_count, remediated_count
        )
        VALUES (
          @sync_date,
          @event_type,
          @message,
          @details,
          @vulnerabilities_count, @vulnerabilities_new, @vulnerabilities_updated, @vulnerabilities_remediated,
          @remediations_count, @remediations_new, @remediations_updated,
          @assets_count, @assets_new, @assets_updated,
          @new_count, @updated_count, @remediated_count
        )
      `),
      selectVulnerableAssetRaw: this.db.prepare('SELECT raw_data FROM vulnerable_assets WHERE id = ?'),
      upsertVulnerableAsset: this.db.prepare(`
        INSERT INTO vulnerable_assets (
          id, asset_type, display_name, integration_id, integration_type,
          vulnerability_count, critical_count, high_count, medium_count, low_count,
          first_detected, last_detected, updated_at, metadata, raw_data
        ) VALUES (
          @id, @asset_type, @display_name, @integration_id, @integration_type,
          @vulnerability_count, @critical_count, @high_count, @medium_count, @low_count,
          @first_detected, @last_detected, @updated_at, @metadata, @raw_data
        )
        ON CONFLICT(id) DO UPDATE SET
          asset_type = excluded.asset_type,
          display_name = excluded.display_name,
          integration_id = excluded.integration_id,
          integration_type = excluded.integration_type,
          vulnerability_count = excluded.vulnerability_count,
          critical_count = excluded.critical_count,
          high_count = excluded.high_count,
          medium_count = excluded.medium_count,
          low_count = excluded.low_count,
          first_detected = excluded.first_detected,
          last_detected = excluded.last_detected,
          updated_at = excluded.updated_at,
          metadata = excluded.metadata,
          raw_data = excluded.raw_data
      `),
    };
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vulnerabilities (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        integration_id TEXT,
        package_identifier TEXT,
        vulnerability_type TEXT,
        target_id TEXT,
        first_detected TEXT,
        source_detected TEXT,
        last_detected TEXT,
        severity TEXT,
        cvss_score REAL,
        scanner_score REAL,
        is_fixable INTEGER,
        remediate_by TEXT,
        external_url TEXT,
        scan_source TEXT,
        deactivated_on TEXT,
        related_vulns TEXT,
        related_urls TEXT,
        updated_at TEXT NOT NULL,
        raw_data TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vulnerability_remediations (
        id TEXT PRIMARY KEY,
        vulnerability_id TEXT,
        vulnerable_asset_id TEXT,
        severity TEXT,
        detected_date TEXT,
        sla_deadline_date TEXT,
        remediation_date TEXT,
        remediated_on_time INTEGER,
        integration_id TEXT,
        integration_type TEXT,
        status TEXT,
        updated_at TEXT NOT NULL,
        raw_data TEXT NOT NULL
      );
    `);

    this.db.exec(`
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
        owners TEXT,
        external_identifier TEXT,
        risk_level TEXT,
        first_seen TEXT,
        last_seen TEXT,
        tags TEXT,
        created_at TEXT,
        updated_at TEXT NOT NULL,
        raw_data TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vulnerable_assets (
        id TEXT PRIMARY KEY,
        asset_type TEXT,
        display_name TEXT,
        integration_id TEXT,
        integration_type TEXT,
        vulnerability_count INTEGER DEFAULT 0,
        critical_count INTEGER DEFAULT 0,
        high_count INTEGER DEFAULT 0,
        medium_count INTEGER DEFAULT 0,
        low_count INTEGER DEFAULT 0,
        first_detected TEXT,
        last_detected TEXT,
        updated_at TEXT NOT NULL,
        metadata TEXT,
        raw_data TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_date TEXT NOT NULL,
        event_type TEXT,
        message TEXT,
        details TEXT,
        vulnerabilities_count INTEGER,
        vulnerabilities_new INTEGER,
        vulnerabilities_updated INTEGER,
        vulnerabilities_remediated INTEGER,
        remediations_count INTEGER,
        remediations_new INTEGER,
        remediations_updated INTEGER,
        assets_count INTEGER,
        assets_new INTEGER,
        assets_updated INTEGER,
        new_count INTEGER,
        updated_count INTEGER,
        remediated_count INTEGER
      );
    `);

    // Migration: Add missing columns to sync_history if they don't exist
    this._migrateSyncHistoryColumns();

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_severity ON vulnerabilities(severity);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_target ON vulnerabilities(target_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_deactivated ON vulnerabilities(deactivated_on);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_fixable ON vulnerabilities(is_fixable);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_integration ON vulnerabilities(integration_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_remediations_vulnerability ON vulnerability_remediations(vulnerability_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_assets_integration ON assets(integration_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_assets_name ON assets(name);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerable_assets_type ON vulnerable_assets(asset_type);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerable_assets_integration ON vulnerable_assets(integration_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerable_assets_vuln_count ON vulnerable_assets(vulnerability_count);');
  }

  _migrateSyncHistoryColumns() {
    // Get existing columns
    const columns = this.db.pragma('table_info(sync_history)');
    const columnNames = columns.map(col => col.name);

    // Add missing columns if they don't exist
    const requiredColumns = [
      'vulnerabilities_count',
      'vulnerabilities_new',
      'vulnerabilities_updated',
      'vulnerabilities_remediated',
      'remediations_count',
      'remediations_new',
      'remediations_updated',
      'assets_count',
      'assets_new',
      'assets_updated',
      'new_count',
      'updated_count',
      'remediated_count'
    ];

    requiredColumns.forEach(columnName => {
      if (!columnNames.includes(columnName)) {
        this.db.exec(`ALTER TABLE sync_history ADD COLUMN ${columnName} INTEGER`);
      }
    });

    // Add new verbose logging columns
    if (!columnNames.includes('event_type')) {
      this.db.exec(`ALTER TABLE sync_history ADD COLUMN event_type TEXT`);
    }
    if (!columnNames.includes('message')) {
      this.db.exec(`ALTER TABLE sync_history ADD COLUMN message TEXT`);
    }
    if (!columnNames.includes('details')) {
      this.db.exec(`ALTER TABLE sync_history ADD COLUMN details TEXT`);
    }
  }

  close() {
    this.db.close();
  }

  _normaliseVulnerability(vuln) {
    const deactivateMetadata = vuln?.deactivateMetadata ?? {};
    const data = {
      id: vuln.id,
      name: vuln.name || null,
      description: vuln.description || null,
      integration_id: vuln.integrationId || null,
      package_identifier: vuln.packageIdentifier || null,
      vulnerability_type: vuln.vulnerabilityType || null,
      target_id: vuln.targetId || null,
      first_detected: vuln.firstDetectedDate || null,
      source_detected: vuln.sourceDetectedDate || null,
      last_detected: vuln.lastDetectedDate || null,
      severity: vuln.severity || null,
      cvss_score: vuln.cvssSeverityScore ?? null,
      scanner_score: vuln.scannerScore ?? null,
      is_fixable: vuln.isFixable ? 1 : 0,
      remediate_by: vuln.remediateByDate || null,
      external_url: vuln.externalURL || null,
      scan_source: vuln.scanSource || null,
      deactivated_on: deactivateMetadata.deactivatedOnDate || null,
      related_vulns: Array.isArray(vuln.relatedVulns) ? JSON.stringify(vuln.relatedVulns) : null,
      related_urls: Array.isArray(vuln.relatedUrls) ? JSON.stringify(vuln.relatedUrls) : null,
      updated_at: dayjs().toISOString(),
      raw_data: JSON.stringify(vuln),
    };
    return data;
  }

  _normaliseRemediation(remediation) {
    const data = {
      id: remediation.id,
      vulnerability_id: remediation.vulnerabilityId || null,
      vulnerable_asset_id: remediation.vulnerableAssetId || null,
      severity: remediation.severity || null,
      detected_date: remediation.detectedDate || null,
      sla_deadline_date: remediation.slaDeadlineDate || null,
      remediation_date: remediation.remediationDate || null,
      remediated_on_time: remediation.isRemediatedOnTime ? 1 : 0,
      integration_id: remediation.integrationId || null,
      integration_type: remediation.integrationType || null,
      status: remediation.status || null,
      updated_at: dayjs().toISOString(),
      raw_data: JSON.stringify(remediation),
    };
    return data;
  }

  _safeStringify(value) {
    if (value === undefined || value === null) {
      return null;
    }
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.warn('[VulnerabilityDatabase] Failed to stringify asset column', error);
      return null;
    }
  }

  _normalizeOwnerList(ownerValue) {
    if (!ownerValue) {
      return [];
    }

    const normalizeEntry = (entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') return entry;
      if (typeof entry === 'number' || typeof entry === 'boolean') return String(entry);
      if (typeof entry === 'object') {
        return entry.name || entry.email || entry.handle || entry.id || null;
      }
      return null;
    };

    if (Array.isArray(ownerValue)) {
      return ownerValue.map(normalizeEntry).filter(Boolean);
    }
    const normalized = normalizeEntry(ownerValue);
    return normalized ? [normalized] : [];
  }

  _normalizeTags(tagValue) {
    if (!tagValue) {
      return [];
    }

    const flatten = Array.isArray(tagValue) ? tagValue : [tagValue];
    return flatten
      .map((tag) => {
        if (!tag) return null;
        if (typeof tag === 'string') return tag;
        if (typeof tag === 'number' || typeof tag === 'boolean') return String(tag);
        if (Array.isArray(tag)) {
          return tag
            .map((nested) => (typeof nested === 'string' ? nested : this._safeStringify(nested)))
            .join(',');
        }
        if (typeof tag === 'object') {
          return tag.name || tag.label || tag.value || JSON.stringify(tag);
        }
        return null;
      })
      .filter(Boolean);
  }

  /**
   * Normalize asset data from the /vulnerable-assets endpoint into database schema.
   *
   * This method extracts and normalizes asset information from the Vanta API response
   * format into the local database schema. It handles multiple field name variations
   * and supports the /vulnerable-assets endpoint structure with scanner metadata.
   *
   * IMPORTANT: This method processes data from the /vulnerable-assets endpoint, which
   * replaced the deprecated /assets endpoint. The new endpoint includes richer metadata
   * via the scanners[] array containing scanner-specific details like IPs, hostnames,
   * operating systems, and asset tags.
   *
   * Key normalization behaviors:
   * - Extracts asset name from multiple possible field names (displayName, name, assetName, etc.)
   * - Normalizes owner information from arrays or single values into consistent format
   * - Flattens nested integration and scanner objects into top-level fields
   * - Extracts environment from scanner asset tags when not available at top level
   * - Extracts platform/OS from scanner metadata when not available at top level
   * - Converts complex tag structures into JSON arrays
   * - Preserves full raw API response for audit and debugging
   *
   * Scanner metadata extraction (from scanners[0]):
   * - integration_id: Extracted from integrationId field
   * - environment: Extracted from assetTags with key='environment'
   * - platform: Extracted from operatingSystems[0]
   * - external_identifier: Extracted from targetId
   *
   * Field extraction priority (uses first non-null value):
   * - name: displayName > name > assetName > resourceName > title
   * - owners: owners > owner > assignedUsers > ownerList
   * - tags: tags > labels > tagList
   * - type: assetType > resourceType
   * - platform: platform > platformName > operatingSystem > os > scanners[0].operatingSystems[0]
   * - environment: environment > environmentName > environmentType > scanners[0].assetTags['environment']
   * - integration_id: integrationId > integration.id > scanners[0].integrationId
   * - external_identifier: externalIdentifier > resourceIdentifier > uniqueIdentifier > slug > scanners[0].targetId
   *
   * @private
   * @param {Object} asset - Raw asset object from /vulnerable-assets API endpoint
   * @param {string} asset.id - Required unique asset identifier
   * @param {string} [asset.name] - Asset display name (may use various field names)
   * @param {string} [asset.assetType] - Asset type (SERVER, WORKSTATION, CODE_REPOSITORY, etc.)
   * @param {Array|Object} [asset.owners] - Asset owners (supports multiple formats)
   * @param {Array|Object} [asset.tags] - Asset tags or labels
   * @param {Array} [asset.scanners] - Array of scanner metadata objects (new in /vulnerable-assets)
   * @param {string} [asset.scanners[].integrationId] - Scanner integration identifier
   * @param {Array} [asset.scanners[].operatingSystems] - Operating system names
   * @param {Array} [asset.scanners[].assetTags] - Scanner-reported asset tags
   * @param {string} [asset.scanners[].targetId] - Scanner-specific target identifier
   * @param {Object} [asset.integration] - Integration metadata object
   * @param {string} [asset.environment] - Environment name (production, staging, etc.)
   * @param {string} [asset.platform] - Platform or OS information
   * @returns {Object|null} Normalized asset object ready for database insertion, or null if asset.id is missing
   * @returns {string} return.id - Asset unique identifier
   * @returns {string|null} return.name - Normalized display name
   * @returns {string|null} return.asset_type - Asset type
   * @returns {string|null} return.integration_id - Scanner integration ID (from top level or scanners[0])
   * @returns {string|null} return.environment - Environment name (from top level or scanner tags)
   * @returns {string|null} return.platform - Platform/OS (from top level or scanner metadata)
   * @returns {string|null} return.primary_owner - First owner from owners list
   * @returns {string|null} return.owners - JSON stringified array of all owners
   * @returns {string|null} return.tags - JSON stringified array of tags
   * @returns {string|null} return.external_identifier - External identifier (from top level or scanner targetId)
   * @returns {string} return.raw_data - Full JSON of original API response
   * @returns {string} return.updated_at - ISO 8601 timestamp of normalization
   *
   * @example
   * // API response from /vulnerable-assets with scanner metadata
   * const apiAsset = {
   *   id: 'asset-123',
   *   name: 'production-server-01',
   *   assetType: 'SERVER',
   *   owners: ['alice@example.com'],
   *   scanners: [{
   *     integrationId: 'qualys',
   *     operatingSystems: ['Ubuntu 20.04 LTS'],
   *     assetTags: [
   *       { key: 'environment', value: 'production' },
   *       { key: 'team', value: 'platform' }
   *     ],
   *     targetId: 'scanner-target-123',
   *     ipv4s: ['192.168.1.100'],
   *     hostnames: ['web-server']
   *   }]
   * };
   *
   * // Normalized for database
   * const normalized = this._normaliseAsset(apiAsset);
   * // {
   * //   id: 'asset-123',
   * //   name: 'production-server-01',
   * //   asset_type: 'SERVER',
   * //   integration_id: 'qualys',
   * //   environment: 'production',
   * //   platform: 'Ubuntu 20.04 LTS',
   * //   external_identifier: 'scanner-target-123',
   * //   primary_owner: 'alice@example.com',
   * //   owners: '["alice@example.com"]',
   * //   updated_at: '2025-11-14T12:00:00.000Z',
   * //   raw_data: '{"id":"asset-123",...}'
   * // }
   */
  _normaliseAsset(asset) {
    if (!asset?.id) {
      return null;
    }

    // Extract scanner metadata from scanners array (for /vulnerable-assets endpoint)
    // The /vulnerable-assets endpoint includes detailed scanner metadata not present in deprecated /assets
    const scanner = asset.scanners?.[0];

    const owners = this._normalizeOwnerList(asset.owners ?? asset.owner ?? asset.assignedUsers ?? asset.ownerList);
    const tags = this._normalizeTags(asset.tags ?? asset.labels ?? asset.tagList);
    const displayName =
      asset.displayName ??
      asset.name ??
      asset.assetName ??
      asset.resourceName ??
      asset.title ??
      null;
    const description = asset.description ?? asset.summary ?? asset.notes ?? null;
    const assetType = asset.assetType ?? asset.resourceType ?? null;
    const assetSubtype = asset.assetSubtype ?? asset.resourceSubtype ?? null;

    // Extract integration_id from scanners array if not directly available
    const integrationId =
      asset.integrationId ??
      asset.integration?.id ??
      scanner?.integrationId ??
      null;
    const integrationType = asset.integrationType ?? asset.integration?.type ?? null;

    // Extract environment from scanners[0].assetTags (key='environment')
    const environmentFromTags = scanner?.assetTags?.find(t => t.key === 'environment')?.value;
    const environment =
      asset.environment ??
      asset.environmentName ??
      asset.environmentType ??
      environmentFromTags ??
      null;

    // Extract platform from scanners[0].operatingSystems[0]
    const platformFromScanner = scanner?.operatingSystems?.[0];
    const platform =
      asset.platform ??
      asset.platformName ??
      asset.operatingSystem ??
      asset.os ??
      platformFromScanner ??
      null;

    // Extract external_identifier from scanner.targetId if not available
    const externalIdentifier =
      asset.externalIdentifier ??
      asset.resourceIdentifier ??
      asset.uniqueIdentifier ??
      asset.slug ??
      scanner?.targetId ??
      null;

    const riskLevel = asset.riskLevel ?? asset.risk ?? null;
    const firstSeen = asset.firstSeen ?? asset.firstSeenAt ?? asset.firstSeenOn ?? null;
    const lastSeen = asset.lastSeen ?? asset.lastSeenAt ?? asset.lastSeenDate ?? asset.lastSeenOn ?? null;
    const createdAt = asset.createdAt ?? asset.createdDate ?? asset.createdOn ?? null;
    const now = dayjs().toISOString();

    return {
      id: asset.id,
      name: displayName,
      description,
      asset_type: assetType,
      asset_subtype: assetSubtype,
      integration_id: integrationId,
      integration_type: integrationType,
      environment,
      platform,
      primary_owner: owners.length ? owners[0] : null,
      owners: owners.length ? this._safeStringify(owners) : null,
      external_identifier: externalIdentifier,
      risk_level: riskLevel,
      first_seen: firstSeen,
      last_seen: lastSeen,
      tags: tags.length ? this._safeStringify(tags) : null,
      created_at: createdAt,
      updated_at: now,
      raw_data: JSON.stringify(asset),
    };
  }

  /**
   * Normalize vulnerable asset data from the /vulnerable-assets endpoint into database schema.
   *
   * This method transforms asset data and vulnerability count statistics into the format
   * required by the vulnerable_assets table. The vulnerability counts can either be provided
   * as part of the asset object or calculated separately from the vulnerabilities table.
   *
   * @private
   * @param {Object} asset - Raw asset object from /vulnerable-assets API endpoint
   * @param {string} asset.id - Required unique asset identifier
   * @param {string} [asset.name] - Asset display name
   * @param {string} [asset.displayName] - Alternative display name field
   * @param {string} [asset.assetType] - Asset type (SERVER, WORKSTATION, etc.)
   * @param {string} [asset.integrationId] - Scanner integration identifier
   * @param {string} [asset.integrationType] - Integration type
   * @param {Object} [asset.vulnerabilityCounts] - Vulnerability count statistics
   * @param {number} [asset.vulnerabilityCounts.total] - Total vulnerability count
   * @param {number} [asset.vulnerabilityCounts.critical] - Critical severity count
   * @param {number} [asset.vulnerabilityCounts.high] - High severity count
   * @param {number} [asset.vulnerabilityCounts.medium] - Medium severity count
   * @param {number} [asset.vulnerabilityCounts.low] - Low severity count
   * @param {string} [asset.firstDetected] - First detection timestamp
   * @param {string} [asset.lastDetected] - Last detection timestamp
   * @param {Object} [asset.metadata] - Additional metadata
   * @returns {Object|null} Normalized vulnerable asset object ready for database insertion, or null if asset.id is missing
   */
  _normaliseVulnerableAsset(asset) {
    if (!asset?.id) {
      return null;
    }

    // Extract scanner metadata from scanners array (for /vulnerable-assets endpoint)
    // Scanner provides fallback integration_id, integration_type, and external_identifier
    // when not available at top level (consistent with _normaliseAsset)
    const scanner = asset.scanners?.[0];

    // Extract display name with fallback options
    const displayName =
      asset.displayName ??
      asset.name ??
      asset.assetName ??
      asset.resourceName ??
      null;

    // Extract asset type
    const assetType = asset.assetType ?? asset.resourceType ?? null;

    // Extract integration information with scanner fallback
    const integrationId =
      asset.integrationId ??
      asset.integration?.id ??
      scanner?.integrationId ??
      null;
    const integrationType =
      asset.integrationType ??
      asset.integration?.type ??
      scanner?.integrationType ??
      null;

    // Extract external identifier with scanner fallback (targetId from scanner)
    const externalIdentifier =
      asset.externalIdentifier ??
      asset.resourceIdentifier ??
      asset.uniqueIdentifier ??
      scanner?.targetId ??
      null;

    // Extract vulnerability counts (may be provided by caller or from asset object)
    const counts = asset.vulnerabilityCounts ?? {};
    const vulnerabilityCount = counts.total ?? 0;
    const criticalCount = counts.critical ?? 0;
    const highCount = counts.high ?? 0;
    const mediumCount = counts.medium ?? 0;
    const lowCount = counts.low ?? 0;

    // Extract timestamps
    const firstDetected = asset.firstDetected ?? asset.firstDetectedDate ?? null;
    const lastDetected = asset.lastDetected ?? asset.lastDetectedDate ?? null;

    // Extract metadata
    const metadata = asset.metadata ? this._safeStringify(asset.metadata) : null;

    const now = dayjs().toISOString();

    return {
      id: asset.id,
      asset_type: assetType,
      display_name: displayName,
      integration_id: integrationId,
      integration_type: integrationType,
      external_identifier: externalIdentifier,
      vulnerability_count: vulnerabilityCount,
      critical_count: criticalCount,
      high_count: highCount,
      medium_count: mediumCount,
      low_count: lowCount,
      first_detected: firstDetected,
      last_detected: lastDetected,
      updated_at: now,
      metadata,
      raw_data: JSON.stringify(asset),
    };
  }

  storeVulnerabilities(vulnerabilities) {
    const tx = this.db.transaction((rows) => {
      let newCount = 0;
      let updatedCount = 0;
      let remediatedCount = 0;
      const now = dayjs().toISOString();

      rows.forEach((row) => {
        if (!row?.id) {
          return;
        }
        const payload = this._normaliseVulnerability(row);
        payload.updated_at = now;

        const existing = this.statements.selectVulnerabilityRaw.get(row.id);
        if (!existing) {
          newCount += 1;
        } else if (existing.raw_data !== payload.raw_data) {
          updatedCount += 1;
          const existingJson = JSON.parse(existing.raw_data);
          const wasActive = !(existingJson?.deactivateMetadata?.deactivatedOnDate);
          const isNowDeactivated = Boolean(row?.deactivateMetadata?.deactivatedOnDate);
          if (wasActive && isNowDeactivated) {
            remediatedCount += 1;
          }
        }

        if (!existing && row?.deactivateMetadata?.deactivatedOnDate) {
          remediatedCount += 1;
        }

        this.statements.upsertVulnerability.run(payload);
      });

      return { new: newCount, updated: updatedCount, remediated: remediatedCount, total: rows.length };
    });

    return tx(vulnerabilities);
  }

  storeVulnerabilitiesBatch(vulnerabilities) {
    const tx = this.db.transaction((rows) => {
      let newCount = 0;
      let updatedCount = 0;
      let remediatedCount = 0;
      const now = dayjs().toISOString();

      // Batch lookup: Get all existing records in one query
      const ids = rows.filter(row => row?.id).map(row => row.id);
      if (ids.length === 0) {
        return { new: 0, updated: 0, remediated: 0, total: 0 };
      }

      const placeholders = ids.map(() => '?').join(',');
      const existingRecords = this.db.prepare(
        `SELECT id, raw_data FROM vulnerabilities WHERE id IN (${placeholders})`
      ).all(...ids);

      // Build lookup map for O(1) access
      const existingMap = new Map(
        existingRecords.map(rec => [rec.id, rec.raw_data])
      );

      rows.forEach((row) => {
        if (!row?.id) {
          return;
        }
        const payload = this._normaliseVulnerability(row);
        payload.updated_at = now;

        const existingRawData = existingMap.get(row.id);
        if (!existingRawData) {
          newCount += 1;
          if (row?.deactivateMetadata?.deactivatedOnDate) {
            remediatedCount += 1;
          }
        } else if (existingRawData !== payload.raw_data) {
          updatedCount += 1;
          const existingJson = JSON.parse(existingRawData);
          const wasActive = !(existingJson?.deactivateMetadata?.deactivatedOnDate);
          const isNowDeactivated = Boolean(row?.deactivateMetadata?.deactivatedOnDate);
          if (wasActive && isNowDeactivated) {
            remediatedCount += 1;
          }
        }

        this.statements.upsertVulnerability.run(payload);

        // Update map so duplicate IDs within same batch are treated as updates
        existingMap.set(row.id, payload.raw_data);
      });

      return { new: newCount, updated: updatedCount, remediated: remediatedCount, total: rows.length };
    });

    return tx(vulnerabilities);
  }

  storeRemediations(remediations) {
    const tx = this.db.transaction((rows) => {
      let newCount = 0;
      let updatedCount = 0;
      const now = dayjs().toISOString();

      rows.forEach((row) => {
        if (!row?.id) {
          return;
        }
        const payload = this._normaliseRemediation(row);
        payload.updated_at = now;
        const existing = this.statements.selectRemediationRaw.get(row.id);
        if (!existing) {
          newCount += 1;
        } else if (existing.raw_data !== payload.raw_data) {
          updatedCount += 1;
        }
        this.statements.upsertRemediation.run(payload);
      });

      return { new: newCount, updated: updatedCount, total: rows.length };
    });

    return tx(remediations);
  }

  storeRemediationsBatch(remediations) {
    const tx = this.db.transaction((rows) => {
      let newCount = 0;
      let updatedCount = 0;
      const now = dayjs().toISOString();

      // Batch lookup: Get all existing records in one query
      const ids = rows.filter(row => row?.id).map(row => row.id);
      if (ids.length === 0) {
        return { new: 0, updated: 0, total: 0 };
      }

      const placeholders = ids.map(() => '?').join(',');
      const existingRecords = this.db.prepare(
        `SELECT id, raw_data FROM vulnerability_remediations WHERE id IN (${placeholders})`
      ).all(...ids);

      // Build lookup map for O(1) access
      const existingMap = new Map(
        existingRecords.map(rec => [rec.id, rec.raw_data])
      );

      rows.forEach((row) => {
        if (!row?.id) {
          return;
        }
        const payload = this._normaliseRemediation(row);
        payload.updated_at = now;

        const existingRawData = existingMap.get(row.id);
        if (!existingRawData) {
          newCount += 1;
        } else if (existingRawData !== payload.raw_data) {
          updatedCount += 1;
        }
        this.statements.upsertRemediation.run(payload);

        // Update map so duplicate IDs within same batch are treated as updates
        existingMap.set(row.id, payload.raw_data);
      });

      return { new: newCount, updated: updatedCount, total: rows.length };
    });

    return tx(remediations);
  }

  storeAssetsBatch(assets = []) {
    const tx = this.db.transaction((rows) => {
      if (!rows.length) {
        return { new: 0, updated: 0, total: 0 };
      }

      const ids = rows.filter((row) => row?.id).map((row) => row.id);
      if (!ids.length) {
        return { new: 0, updated: 0, total: 0 };
      }

      const placeholders = ids.map(() => '?').join(',');
      const existingRecords = this.db
        .prepare(`SELECT id, raw_data FROM assets WHERE id IN (${placeholders})`)
        .all(...ids);
      const existingMap = new Map(existingRecords.map((record) => [record.id, record.raw_data]));

      let newCount = 0;
      let updatedCount = 0;

      rows.forEach((row) => {
        if (!row?.id) {
          return;
        }

        const payload = this._normaliseAsset(row);
        if (!payload) {
          return;
        }

        const existingRaw = existingMap.get(row.id);
        if (!existingRaw) {
          newCount += 1;
        } else if (existingRaw !== payload.raw_data) {
          updatedCount += 1;
        }

        this.statements.upsertAsset.run(payload);
        existingMap.set(row.id, payload.raw_data);
      });

      return { new: newCount, updated: updatedCount, total: rows.length };
    });

    return tx(assets);
  }

  /**
   * Store vulnerable assets in batch with statistics tracking.
   *
   * This method efficiently stores or updates multiple vulnerable assets in a single transaction.
   * It follows the same optimization pattern as storeVulnerabilitiesBatch(), using batch lookups
   * for existing records and tracking new/updated counts.
   *
   * @param {Array<Object>} assets - Array of vulnerable asset objects from API
   * @returns {Object} Statistics object with new, updated, and total counts
   * @returns {number} return.new - Number of new assets inserted
   * @returns {number} return.updated - Number of existing assets updated
   * @returns {number} return.total - Total number of assets processed
   */
  storeVulnerableAssetsBatch(assets = []) {
    const tx = this.db.transaction((rows) => {
      if (!rows.length) {
        return { new: 0, updated: 0, total: 0 };
      }

      const ids = rows.filter((row) => row?.id).map((row) => row.id);
      if (!ids.length) {
        return { new: 0, updated: 0, total: 0 };
      }

      const now = dayjs().toISOString();

      // Batch lookup: Get all existing records in one query
      const placeholders = ids.map(() => '?').join(',');
      const existingRecords = this.db
        .prepare(`SELECT id, raw_data FROM vulnerable_assets WHERE id IN (${placeholders})`)
        .all(...ids);

      // Build lookup map for O(1) access
      const existingMap = new Map(
        existingRecords.map((record) => [record.id, record.raw_data])
      );

      let newCount = 0;
      let updatedCount = 0;

      rows.forEach((row) => {
        if (!row?.id) {
          return;
        }

        const payload = this._normaliseVulnerableAsset(row);
        if (!payload) {
          return;
        }

        // Ensure timestamp consistency within batch
        payload.updated_at = now;

        const existingRaw = existingMap.get(row.id);
        if (!existingRaw) {
          newCount += 1;
        } else if (existingRaw !== payload.raw_data) {
          updatedCount += 1;
        }

        this.statements.upsertVulnerableAsset.run(payload);

        // Update map so duplicate IDs within same batch are treated as updates
        existingMap.set(row.id, payload.raw_data);
      });

      return { new: newCount, updated: updatedCount, total: rows.length };
    });

    return tx(assets);
  }

  buildFilters(filters = {}, options = {}) {
    const alias = options.alias ?? null;
    const tableRef = alias || options.tableRef || 'vulnerabilities';
    const column = (name) => `${tableRef}.${name}`;
    const clauses = [];
    const params = {};

    if (Array.isArray(filters.severity) && filters.severity.length > 0) {
      const placeholders = filters.severity.map((_, idx) => `@severity${idx}`);
      filters.severity.forEach((value, idx) => {
        params[`severity${idx}`] = value;
      });
      clauses.push(`${column('severity')} IN (${placeholders.join(',')})`);
    }

    if (filters.status === 'active') {
      clauses.push(`NOT EXISTS (
        SELECT 1 FROM vulnerability_remediations vr
        WHERE vr.vulnerability_id = ${tableRef}.id
        AND vr.remediation_date IS NOT NULL
      )`);
    } else if (filters.status === 'deactivated') {
      // "Remediated" means the vulnerability has at least one remediation record with a remediation_date
      clauses.push(`EXISTS (
        SELECT 1 FROM vulnerability_remediations vr
        WHERE vr.vulnerability_id = ${tableRef}.id
        AND vr.remediation_date IS NOT NULL
      )`);
    }

    if (filters.fixable === 'fixable') {
      clauses.push(`${column('is_fixable')} = 1`);
    } else if (filters.fixable === 'not_fixable') {
      clauses.push(`${column('is_fixable')} = 0`);
    }

    if (filters.integration) {
      clauses.push(`${column('integration_id')} LIKE @integration`);
      params.integration = `%${filters.integration}%`;
    }

    if (filters.assetId) {
      clauses.push(`${column('target_id')} = @assetId`);
      params.assetId = filters.assetId;
    }

    if (filters.cve) {
      clauses.push(`(${column('name')} LIKE @cve OR ${column('related_vulns')} LIKE @cve)`);
      params.cve = `%${filters.cve}%`;
    }

    if (filters.search) {
      clauses.push(`(${column('name')} LIKE @search OR ${column('description')} LIKE @search OR ${column('id')} LIKE @search)`);
      params.search = `%${filters.search}%`;
    }

    if (filters.dateIdentifiedStart) {
      clauses.push(`${column('first_detected')} >= @dateIdentifiedStart`);
      params.dateIdentifiedStart = filters.dateIdentifiedStart;
    }

    if (filters.dateIdentifiedEnd) {
      clauses.push(`${column('first_detected')} <= @dateIdentifiedEnd`);
      params.dateIdentifiedEnd = filters.dateIdentifiedEnd;
    }

    if (filters.dateRemediatedStart) {
      clauses.push(`${column('deactivated_on')} >= @dateRemediatedStart`);
      params.dateRemediatedStart = filters.dateRemediatedStart;
    }

    if (filters.dateRemediatedEnd) {
      clauses.push(`${column('deactivated_on')} <= @dateRemediatedEnd`);
      params.dateRemediatedEnd = filters.dateRemediatedEnd;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return { where, params };
  }

  getVulnerabilities({ filters = {}, limit = 100, offset = 0, sortColumn = 'first_detected', sortDirection = 'desc' } = {}) {
    const { where, params } = this.buildFilters(filters, { alias: 'v' });

    // Map of allowed sort columns to prevent SQL injection
    const allowedColumns = {
      id: 'v.id',
      name: 'v.name',
      severity: 'v.severity',
      integration_id: 'v.integration_id',
      target_id: 'v.target_id',
      first_detected: 'v.first_detected',
      last_detected: 'v.last_detected',
      status: 'v.deactivated_on', // Special case: status is based on deactivated_on
    };

    // Validate and sanitize sort column
    const actualColumn = allowedColumns[sortColumn] || 'v.first_detected';

    // Validate sort direction
    const direction = sortDirection.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Build ORDER BY clause
    let orderBy;
    if (sortColumn === 'status') {
      // For status, sort by whether deactivated_on is null (Active vs Remediated)
      // NULL first means Active first when DESC, Remediated first when ASC
      orderBy = `ORDER BY (v.deactivated_on IS NULL) ${direction}, v.name ASC`;
    } else if (sortColumn === 'severity') {
      // For severity, use explicit ordering: CRITICAL→HIGH→MEDIUM→LOW→INFO→UNKNOWN
      orderBy = `ORDER BY
        CASE v.severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          WHEN 'INFO' THEN 5
          ELSE 6
        END ${direction},
        v.name ASC`;
    } else {
      // Handle NULL values properly - put them at the end
      orderBy = `ORDER BY (${actualColumn} IS NULL), ${actualColumn} ${direction}, v.name ASC`;
    }

    const query = `
      SELECT v.id, v.name, v.description, v.integration_id, v.target_id, v.severity, v.first_detected,
             v.last_detected, v.deactivated_on, v.is_fixable, v.cvss_score, v.package_identifier,
             v.vulnerability_type, v.remediate_by, v.external_url, v.scan_source,
             a.name AS asset_name,
             a.asset_type AS asset_type,
             a.asset_subtype AS asset_subtype,
             a.platform AS asset_platform,
             a.environment AS asset_environment,
             a.primary_owner AS asset_owner,
             a.integration_id AS asset_integration_id,
             a.integration_type AS asset_integration_type,
             a.external_identifier AS asset_external_identifier,
             a.last_seen AS asset_last_seen
      FROM vulnerabilities v
      LEFT JOIN assets a ON a.id = v.target_id
      ${where}
      ${orderBy}
      LIMIT @limit OFFSET @offset;
    `;
    const stmt = this.db.prepare(query);
    return stmt.all({ ...params, limit, offset });
  }

  getVulnerabilityCount(filters = {}) {
    const { where, params } = this.buildFilters(filters, { alias: 'v' });
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM vulnerabilities v ${where};`);
    const row = stmt.get(params);
    return row?.count ?? 0;
  }

  getVulnerabilityDetails(id) {
    const stmt = this.db.prepare('SELECT raw_data FROM vulnerabilities WHERE id = ?');
    const row = stmt.get(id);
    return row ? JSON.parse(row.raw_data) : null;
  }

  getRemediationsForVulnerability(vulnerabilityId) {
    const stmt = this.db.prepare(`
      SELECT raw_data FROM vulnerability_remediations WHERE vulnerability_id = ?
      ORDER BY (remediation_date IS NULL), remediation_date DESC, (detected_date IS NULL), detected_date DESC
    `);
    return stmt.all(vulnerabilityId).map((row) => JSON.parse(row.raw_data));
  }

  getStatistics(filters = {}) {
    const { where, params } = this.buildFilters(filters, { alias: 'v' });

    const total = this.db.prepare(`SELECT COUNT(*) as count FROM vulnerabilities v ${where};`).get(params)?.count ?? 0;

    const severityRows = this.db.prepare(`
      SELECT v.severity, COUNT(*) as count
      FROM vulnerabilities v
      ${where}
      GROUP BY v.severity;
    `).all(params);
    const bySeverity = severityRows.reduce((acc, row) => {
      acc[row.severity || 'UNKNOWN'] = row.count;
      return acc;
    }, {});

    const integrationRows = this.db.prepare(`
      SELECT v.integration_id, COUNT(*) as count
      FROM vulnerabilities v
      ${where}
      GROUP BY v.integration_id;
    `).all(params);
    const byIntegration = integrationRows.reduce((acc, row) => {
      acc[row.integration_id || 'UNKNOWN'] = row.count;
      return acc;
    }, {});

    const fixabilityRows = this.db.prepare(`
      SELECT v.is_fixable, COUNT(*) as count
      FROM vulnerabilities v
      ${where}
      GROUP BY v.is_fixable;
    `).all(params);
    const fixable = fixabilityRows.find((row) => row.is_fixable === 1)?.count ?? 0;
    const notFixable = fixabilityRows.find((row) => row.is_fixable === 0)?.count ?? 0;

    // Updated to properly correlate with remediation records
    // A vulnerability is considered "remediated" if it has at least one remediation record with a remediation_date
    const statusRows = this.db.prepare(`
      SELECT
        CASE
          WHEN EXISTS (
            SELECT 1 FROM vulnerability_remediations vr
            WHERE vr.vulnerability_id = v.id
            AND vr.remediation_date IS NOT NULL
          ) THEN 'remediated'
          ELSE 'active'
        END as status,
        COUNT(*) as count
      FROM vulnerabilities v
      ${where}
      GROUP BY status;
    `).all(params);
    const active = statusRows.find((row) => row.status === 'active')?.count ?? 0;
    const remediated = statusRows.find((row) => row.status === 'remediated')?.count ?? 0;

    const uniques = this.db.prepare(`
      SELECT
        COUNT(DISTINCT v.target_id) as assets,
        COUNT(DISTINCT v.name) as cves
      FROM vulnerabilities v
      ${where};
    `).get(params);

    const cvssWhere = where ? `${where} AND v.cvss_score IS NOT NULL` : 'WHERE v.cvss_score IS NOT NULL';
    const averages = this.db.prepare(`
      SELECT v.severity, AVG(v.cvss_score) as average
      FROM vulnerabilities v
      ${cvssWhere}
      GROUP BY v.severity;
    `).all(params);
    const averageCvssBySeverity = averages.reduce((acc, row) => {
      if (row.severity) {
        acc[row.severity.toLowerCase()] = row.average;
      }
      return acc;
    }, {});

    const lastSync = this.db.prepare('SELECT sync_date FROM sync_history ORDER BY id DESC LIMIT 1').get();

    // Get remediation statistics
    const remediationStats = this._getRemediationStatistics(where, params);

    // Get asset statistics from vulnerable_assets table with filters applied
    const assetStats = this._getAssetStatistics(filters);

    // Get vulnerable assets count from the vulnerable_assets table (for backward compatibility)
    const vulnerableAssetsCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM vulnerable_assets'
    ).get()?.count ?? 0;

    return {
      totalCount: total,
      bySeverity,
      byIntegration,
      fixable,
      notFixable,
      active,
      remediated,
      deactivated: remediated, // Keep for backward compatibility
      uniqueAssets: uniques?.assets ?? 0,
      uniqueCves: uniques?.cves ?? 0,
      averageCvssBySeverity,
      lastSync: lastSync?.sync_date ?? null,
      remediations: remediationStats,
      totalVulnerableAssets: vulnerableAssetsCount,
      assets: assetStats,
    };
  }

  /**
   * Get all unique assets with vulnerability counts
   * @param {object} filters - Optional filters to apply
   * @returns {Array} Array of assets with counts
   */
  getAssets(filters = {}) {
    const { where, params } = this.buildFilters(filters, { alias: 'v' });
    const whereClause = where
      ? `${where} AND v.target_id IS NOT NULL`
      : 'WHERE v.target_id IS NOT NULL';

    const query = `
      SELECT
        v.target_id as assetId,
        MAX(a.name) as assetName,
        MAX(a.asset_type) as assetType,
        MAX(a.asset_subtype) as assetSubtype,
        MAX(a.integration_id) as assetIntegrationId,
        MAX(a.integration_type) as assetIntegrationType,
        MAX(a.platform) as assetPlatform,
        MAX(a.environment) as assetEnvironment,
        MAX(a.primary_owner) as primaryOwner,
        MAX(a.external_identifier) as externalIdentifier,
        MAX(a.last_seen) as lastSeen,
        COUNT(*) as vulnerabilityCount,
        SUM(CASE WHEN v.deactivated_on IS NULL THEN 1 ELSE 0 END) as activeCount,
        SUM(CASE WHEN v.deactivated_on IS NOT NULL THEN 1 ELSE 0 END) as remediatedCount
      FROM vulnerabilities v
      LEFT JOIN assets a ON a.id = v.target_id
      ${whereClause}
      GROUP BY v.target_id
      ORDER BY vulnerabilityCount DESC,
               COALESCE(assetName, v.target_id) ASC
    `;
    return this.db.prepare(query).all(params);
  }

  /**
   * Get vulnerabilities for a specific asset
   * @param {string} assetId - The asset identifier
   * @param {object} filters - Optional additional filters
   * @returns {Array} Array of vulnerabilities for the asset
   */
  getVulnerabilitiesByAsset(assetId, filters = {}) {
    const extendedFilters = { ...filters, assetId };
    const { where, params } = this.buildFilters(extendedFilters, { alias: 'v' });
    const query = `
      SELECT v.id, v.name, v.description, v.severity, v.first_detected, v.deactivated_on,
             v.is_fixable, v.cvss_score, v.integration_id
      FROM vulnerabilities v
      ${where}
      ORDER BY
        CASE v.severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END ASC,
        v.first_detected DESC
    `;
    return this.db.prepare(query).all(params);
  }

  /**
   * Get all unique CVEs with vulnerability counts
   * @param {object} filters - Optional filters to apply
   * @returns {Array} Array of CVEs with counts and descriptions
   */
  getCVEs(filters = {}) {
    const { where, params } = this.buildFilters(filters, { alias: 'v' });
    // Add NULL filtering for name (CVE) and fix MAX(severity) to use numeric ordering
    const whereClause = where
      ? `${where} AND v.name IS NOT NULL`
      : 'WHERE v.name IS NOT NULL';

    const query = `
      SELECT
        v.name as cveName,
        MAX(v.description) as description,
        COUNT(*) as vulnerabilityCount,
        SUM(CASE WHEN v.deactivated_on IS NULL THEN 1 ELSE 0 END) as activeCount,
        SUM(CASE WHEN v.deactivated_on IS NOT NULL THEN 1 ELSE 0 END) as remediatedCount,
        MAX(
          CASE v.severity
            WHEN 'CRITICAL' THEN 1
            WHEN 'HIGH' THEN 2
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 4
            WHEN 'INFO' THEN 5
            ELSE 6
          END
        ) as severityOrder,
        CASE MIN(
          CASE v.severity
            WHEN 'CRITICAL' THEN 1
            WHEN 'HIGH' THEN 2
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 4
            WHEN 'INFO' THEN 5
            ELSE 6
          END
        )
          WHEN 1 THEN 'CRITICAL'
          WHEN 2 THEN 'HIGH'
          WHEN 3 THEN 'MEDIUM'
          WHEN 4 THEN 'LOW'
          WHEN 5 THEN 'INFO'
          ELSE 'UNKNOWN'
        END as maxSeverity
      FROM vulnerabilities v
      ${whereClause}
      GROUP BY v.name
      ORDER BY
        severityOrder ASC,
        vulnerabilityCount DESC,
        v.name ASC
    `;
    return this.db.prepare(query).all(params);
  }

  /**
   * Get all assets affected by a specific CVE
   * @param {string} cveName - The CVE name
   * @param {object} filters - Optional additional filters
   * @returns {Array} Array of assets affected by the CVE
   */
  getAssetsByCVE(cveName, filters = {}) {
    const extendedFilters = { ...filters, cve: cveName };
    const { where, params } = this.buildFilters(extendedFilters, { alias: 'v' });
    const query = `
      SELECT v.id, v.target_id as assetId, v.severity, v.first_detected, v.deactivated_on,
             v.integration_id, v.is_fixable, v.cvss_score,
             a.name as assetName,
             a.asset_type as assetType,
             a.platform as assetPlatform,
             a.environment as assetEnvironment,
             a.primary_owner as assetOwner,
             a.last_seen as assetLastSeen
      FROM vulnerabilities v
      LEFT JOIN assets a ON a.id = v.target_id
      ${where}
      ORDER BY
        CASE v.severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END ASC,
        v.first_detected DESC
    `;
    return this.db.prepare(query).all(params);
  }

  getAssetDetails(assetId) {
    if (!assetId) {
      return null;
    }

    const stmt = this.db.prepare(`
      SELECT id, name, description, asset_type, asset_subtype, integration_id, integration_type,
             environment, platform, primary_owner, owners, external_identifier, risk_level,
             first_seen, last_seen, tags, created_at, updated_at, raw_data
      FROM assets
      WHERE id = ?
    `);
    const row = stmt.get(assetId);
    if (!row) {
      return null;
    }

    const safeParse = (value, fallback) => {
      if (!value) return fallback;
      try {
        return JSON.parse(value);
      } catch (error) {
        console.warn('[VulnerabilityDatabase] Failed to parse JSON for asset detail', error);
        return fallback;
      }
    };

    return {
      ...row,
      owners: safeParse(row.owners, []),
      tags: safeParse(row.tags, []),
      raw_data: safeParse(row.raw_data, null),
    };
  }

  /**
   * Build WHERE clause and parameters for vulnerable assets queries.
   *
   * @private
   * @param {Object} filters - Filter options
   * @param {string} [filters.assetType] - Filter by asset type
   * @param {string} [filters.integrationId] - Filter by integration ID
   * @param {number} [filters.minVulnerabilityCount] - Minimum vulnerability count
   * @param {number} [filters.maxVulnerabilityCount] - Maximum vulnerability count
   * @param {string} [filters.search] - Search in display name
   * @param {string} [filters.firstDetectedStart] - Filter by first detected date (start range)
   * @param {string} [filters.firstDetectedEnd] - Filter by first detected date (end range)
   * @param {string} [filters.lastDetectedStart] - Filter by last detected date (start range)
   * @param {string} [filters.lastDetectedEnd] - Filter by last detected date (end range)
   * @returns {Object} Object with where clause and params
   */
  _buildVulnerableAssetFilters(filters = {}) {
    const clauses = [];
    const params = {};

    if (filters.assetType) {
      clauses.push('va.asset_type = @assetType');
      params.assetType = filters.assetType;
    }

    if (filters.integrationId) {
      clauses.push('va.integration_id = @integrationId');
      params.integrationId = filters.integrationId;
    }

    if (filters.minVulnerabilityCount !== undefined) {
      clauses.push('va.vulnerability_count >= @minVulnerabilityCount');
      params.minVulnerabilityCount = filters.minVulnerabilityCount;
    }

    if (filters.maxVulnerabilityCount !== undefined) {
      clauses.push('va.vulnerability_count <= @maxVulnerabilityCount');
      params.maxVulnerabilityCount = filters.maxVulnerabilityCount;
    }

    if (filters.search) {
      clauses.push('(va.display_name LIKE @search OR va.id LIKE @search)');
      params.search = `%${filters.search}%`;
    }

    if (filters.firstDetectedStart) {
      clauses.push('va.first_detected >= @firstDetectedStart');
      params.firstDetectedStart = filters.firstDetectedStart;
    }

    if (filters.firstDetectedEnd) {
      clauses.push('va.first_detected <= @firstDetectedEnd');
      params.firstDetectedEnd = filters.firstDetectedEnd;
    }

    if (filters.lastDetectedStart) {
      clauses.push('va.last_detected >= @lastDetectedStart');
      params.lastDetectedStart = filters.lastDetectedStart;
    }

    if (filters.lastDetectedEnd) {
      clauses.push('va.last_detected <= @lastDetectedEnd');
      params.lastDetectedEnd = filters.lastDetectedEnd;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return { where, params };
  }

  /**
   * Get paginated list of vulnerable assets with filters and sorting.
   *
   * @param {Object} options - Query options
   * @param {Object} [options.filters] - Filter options
   * @param {string} [options.filters.assetType] - Filter by asset type
   * @param {string} [options.filters.integrationId] - Filter by integration ID
   * @param {number} [options.filters.minVulnerabilityCount] - Minimum vulnerability count
   * @param {number} [options.filters.maxVulnerabilityCount] - Maximum vulnerability count
   * @param {string} [options.filters.search] - Search in display name
   * @param {number} [options.limit=100] - Maximum number of results
   * @param {number} [options.offset=0] - Result offset for pagination
   * @param {string} [options.sortColumn='vulnerability_count'] - Column to sort by
   * @param {string} [options.sortDirection='desc'] - Sort direction (asc/desc)
   * @returns {Array} Array of vulnerable asset records
   */
  getVulnerableAssets({ filters = {}, limit = 100, offset = 0, sortColumn = 'vulnerability_count', sortDirection = 'desc' } = {}) {
    const { where, params } = this._buildVulnerableAssetFilters(filters);

    // Map of allowed sort columns to prevent SQL injection
    const allowedColumns = {
      id: 'va.id',
      display_name: 'va.display_name',
      asset_type: 'va.asset_type',
      integration_id: 'va.integration_id',
      vulnerability_count: 'va.vulnerability_count',
      critical_count: 'va.critical_count',
      high_count: 'va.high_count',
      medium_count: 'va.medium_count',
      low_count: 'va.low_count',
      first_detected: 'va.first_detected',
      last_detected: 'va.last_detected',
    };

    // Validate and sanitize sort column
    const actualColumn = allowedColumns[sortColumn] || 'va.vulnerability_count';

    // Validate sort direction
    const direction = sortDirection.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Build ORDER BY clause, handling NULL values
    const orderBy = `ORDER BY (${actualColumn} IS NULL), ${actualColumn} ${direction}, va.display_name ASC`;

    const query = `
      SELECT
        va.id,
        va.asset_type,
        va.display_name,
        va.integration_id,
        va.integration_type,
        va.vulnerability_count,
        va.critical_count,
        va.high_count,
        va.medium_count,
        va.low_count,
        va.first_detected,
        va.last_detected,
        va.updated_at
      FROM vulnerable_assets va
      ${where}
      ${orderBy}
      LIMIT @limit OFFSET @offset
    `;

    const stmt = this.db.prepare(query);
    return stmt.all({ ...params, limit, offset });
  }

  /**
   * Get count of vulnerable assets matching filters.
   *
   * @param {Object} [filters] - Filter options
   * @returns {number} Count of matching assets
   */
  getVulnerableAssetCount(filters = {}) {
    const { where, params } = this._buildVulnerableAssetFilters(filters);
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM vulnerable_assets va ${where}`);
    const row = stmt.get(params);
    return row?.count ?? 0;
  }

  /**
   * Get full details for a specific vulnerable asset.
   *
   * @param {string} id - Asset ID
   * @returns {Object|null} Asset details with parsed raw_data, or null if not found
   */
  getVulnerableAssetDetails(id) {
    if (!id) {
      return null;
    }

    const stmt = this.db.prepare(`
      SELECT
        id,
        asset_type,
        display_name,
        integration_id,
        integration_type,
        vulnerability_count,
        critical_count,
        high_count,
        medium_count,
        low_count,
        first_detected,
        last_detected,
        updated_at,
        metadata,
        raw_data
      FROM vulnerable_assets
      WHERE id = ?
    `);

    const row = stmt.get(id);
    if (!row) {
      return null;
    }

    const safeParse = (value, fallback) => {
      if (!value) return fallback;
      try {
        return JSON.parse(value);
      } catch (error) {
        console.warn('[VulnerabilityDatabase] Failed to parse JSON for vulnerable asset detail', error);
        return fallback;
      }
    };

    return {
      ...row,
      metadata: safeParse(row.metadata, null),
      raw_data: safeParse(row.raw_data, null),
    };
  }

  /**
   * Get all vulnerabilities for a specific asset.
   *
   * This method retrieves vulnerabilities from the vulnerabilities table where
   * the target_id matches the asset ID.
   *
   * @param {string} assetId - Asset ID
   * @returns {Array} Array of vulnerability records for the asset
   */
  getVulnerabilitiesForAsset(assetId) {
    if (!assetId) {
      return [];
    }

    const stmt = this.db.prepare(`
      SELECT
        v.id,
        v.name,
        v.description,
        v.severity,
        v.cvss_score,
        v.scanner_score,
        v.is_fixable,
        v.first_detected,
        v.last_detected,
        v.deactivated_on,
        v.integration_id,
        v.package_identifier,
        v.vulnerability_type,
        v.remediate_by,
        v.external_url
      FROM vulnerabilities v
      WHERE v.target_id = ?
      ORDER BY
        CASE v.severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          WHEN 'INFO' THEN 5
          ELSE 6
        END ASC,
        v.first_detected DESC
    `);

    return stmt.all(assetId);
  }

  /**
   * Get asset statistics from vulnerable_assets table.
   *
   * Returns comprehensive statistics about vulnerable assets including:
   * - Total count of vulnerable assets
   * - Distribution by asset type
   * - Distribution by integration
   * - Top 10 assets by vulnerability count
   * - Average vulnerabilities per asset
   * - Count of assets with critical/high vulnerabilities
   *
   * Supports filtering by:
   * - Asset type
   * - Integration ID
   * - Vulnerability count range
   * - Date range (first_detected, last_detected)
   *
   * @private
   * @param {Object} [filters={}] - Filter options for asset statistics
   * @param {string} [filters.assetType] - Filter by asset type
   * @param {string} [filters.integrationId] - Filter by integration ID
   * @param {number} [filters.minVulnerabilityCount] - Minimum vulnerability count
   * @param {number} [filters.maxVulnerabilityCount] - Maximum vulnerability count
   * @param {string} [filters.firstDetectedStart] - Filter by first detected date (start)
   * @param {string} [filters.firstDetectedEnd] - Filter by first detected date (end)
   * @param {string} [filters.lastDetectedStart] - Filter by last detected date (start)
   * @param {string} [filters.lastDetectedEnd] - Filter by last detected date (end)
   * @returns {Object} Asset statistics object
   */
  _getAssetStatistics(filters = {}) {
    // Build WHERE clause and parameters from filters
    const { where, params } = this._buildVulnerableAssetFilters(filters);

    // Total vulnerable assets count
    const totalAssets = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM vulnerable_assets va
      ${where}
    `).get(params)?.count ?? 0;

    // If no assets, return empty stats
    if (totalAssets === 0) {
      return {
        total: 0,
        byType: {},
        byIntegration: {},
        topVulnerable: [],
        averageVulnerabilitiesPerAsset: 0,
        withCriticalVulnerabilities: 0,
        withHighVulnerabilities: 0,
      };
    }

    // Assets by type distribution
    const assetsByType = this.db.prepare(`
      SELECT asset_type, COUNT(*) as count
      FROM vulnerable_assets va
      ${where}
      GROUP BY asset_type
    `).all(params);

    const byType = assetsByType.reduce((acc, row) => {
      acc[row.asset_type || 'UNKNOWN'] = row.count;
      return acc;
    }, {});

    // Assets by integration distribution
    const assetsByIntegration = this.db.prepare(`
      SELECT integration_id, COUNT(*) as count
      FROM vulnerable_assets va
      ${where}
      GROUP BY integration_id
    `).all(params);

    const byIntegration = assetsByIntegration.reduce((acc, row) => {
      acc[row.integration_id || 'UNKNOWN'] = row.count;
      return acc;
    }, {});

    // Top 10 assets by vulnerability count
    const topAssets = this.db.prepare(`
      SELECT
        id,
        display_name,
        asset_type,
        vulnerability_count,
        critical_count,
        high_count,
        medium_count,
        low_count
      FROM vulnerable_assets va
      ${where}
      ORDER BY vulnerability_count DESC, critical_count DESC, high_count DESC
      LIMIT 10
    `).all(params);

    // Average vulnerabilities per asset
    const avgResult = this.db.prepare(`
      SELECT AVG(vulnerability_count) as average
      FROM vulnerable_assets va
      ${where}
    `).get(params);
    const averageVulnerabilitiesPerAsset = avgResult?.average ?? 0;

    // Assets with critical vulnerabilities
    const criticalWhere = where ? `${where} AND va.critical_count > 0` : 'WHERE va.critical_count > 0';
    const withCritical = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM vulnerable_assets va
      ${criticalWhere}
    `).get(params)?.count ?? 0;

    // Assets with high vulnerabilities
    const highWhere = where ? `${where} AND va.high_count > 0` : 'WHERE va.high_count > 0';
    const withHigh = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM vulnerable_assets va
      ${highWhere}
    `).get(params)?.count ?? 0;

    return {
      total: totalAssets,
      byType,
      byIntegration,
      topVulnerable: topAssets,
      averageVulnerabilitiesPerAsset,
      withCriticalVulnerabilities: withCritical,
      withHighVulnerabilities: withHigh,
    };
  }

  _getRemediationStatistics(where, params) {
    // Build the WHERE clause for remediations that match filtered vulnerabilities
    const remediationWhere = where
      ? `WHERE EXISTS (
          SELECT 1 FROM vulnerabilities v
          ${where.replace(/vulnerabilities\./g, 'v.')}
          AND vr.vulnerability_id = v.id
        )`
      : '';

    // Map params to work with the subquery
    const remediationParams = { ...params };

    // Total remediations for filtered vulnerabilities
    const totalRemediations = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM vulnerability_remediations vr
      ${remediationWhere}
    `).get(remediationParams)?.count ?? 0;

    // Remediations with matching vulnerabilities
    const remediationsWithVulns = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM vulnerability_remediations vr
      INNER JOIN vulnerabilities v ON vr.vulnerability_id = v.id
      ${where ? where.replace(/vulnerabilities\./g, 'v.') : ''}
    `).get(params)?.count ?? 0;

    // Count by remediation status
    const byStatus = this.db.prepare(`
      SELECT
        CASE
          WHEN vr.remediation_date IS NOT NULL THEN 'remediated'
          WHEN vr.status = 'overdue' OR vr.status = 'past_due' THEN 'overdue'
          ELSE 'open'
        END as remediation_status,
        COUNT(*) as count
      FROM vulnerability_remediations vr
      ${remediationWhere}
      GROUP BY remediation_status
    `).all(remediationParams);

    const statusCounts = byStatus.reduce(
      (acc, row) => {
        acc[row.remediation_status] = row.count;
        return acc;
      },
      {
        remediated: 0,
        overdue: 0,
        open: 0,
      },
    );

    // On-time vs late remediations
    const timeliness = this.db.prepare(`
      SELECT
        CASE
          WHEN vr.remediated_on_time = 1 THEN 'on_time'
          WHEN vr.remediated_on_time = 0 AND vr.remediation_date IS NOT NULL THEN 'late'
          ELSE 'pending'
        END as timeliness,
        COUNT(*) as count
      FROM vulnerability_remediations vr
      ${remediationWhere}
      GROUP BY timeliness
    `).all(remediationParams);

    const timelinessCounts = timeliness.reduce(
      (acc, row) => {
        acc[row.timeliness] = row.count;
        return acc;
      },
      {
        on_time: 0,
        late: 0,
        pending: 0,
      },
    );

    const statusSection = {
      remediated: statusCounts.remediated ?? 0,
      overdue: statusCounts.overdue ?? 0,
      open: statusCounts.open ?? 0,
    };

    const timelinessSection = {
      onTime: timelinessCounts.on_time ?? 0,
      late: timelinessCounts.late ?? 0,
      pending: timelinessCounts.pending ?? 0,
    };

    return {
      total: totalRemediations,
      withMatchingVulnerability: remediationsWithVulns,
      withoutMatchingVulnerability: Math.max(totalRemediations - remediationsWithVulns, 0),
      byStatus: statusSection,
      byTimeliness: timelinessSection,
      // Keep flattened fields for backward compatibility
      remediated: statusSection.remediated,
      overdue: statusSection.overdue,
      open: statusSection.open,
      onTime: timelinessSection.onTime,
      late: timelinessSection.late,
      pending: timelinessSection.pending,
    };
  }

  recordSyncHistory(vulnerabilityStats, remediationStats, assetStats = { new: 0, updated: 0, total: 0 }) {
    const now = dayjs().toISOString();
    this.statements.insertSync.run({
      sync_date: now,
      vulnerabilities_count: vulnerabilityStats.total,
      vulnerabilities_new: vulnerabilityStats.new,
      vulnerabilities_updated: vulnerabilityStats.updated,
      vulnerabilities_remediated: vulnerabilityStats.remediated,
      remediations_count: remediationStats.total,
      remediations_new: remediationStats.new,
      remediations_updated: remediationStats.updated,
      assets_count: assetStats.total,
      assets_new: assetStats.new,
      assets_updated: assetStats.updated,
      // Keep legacy columns for backward compatibility
      new_count: vulnerabilityStats.new,
      updated_count: vulnerabilityStats.updated,
      remediated_count: vulnerabilityStats.remediated,
    });
  }

  getSyncHistory(limit = 100000) {
    const MAX_HISTORY = 100000;
    const requested = Number(limit);
    const safeLimit = Number.isFinite(requested) ? requested : MAX_HISTORY;
    const finalLimit = Math.min(Math.max(safeLimit, 1), MAX_HISTORY);

    const stmt = this.db.prepare(`
      SELECT
        sync_date,
        event_type,
        message,
        details,
        vulnerabilities_count, vulnerabilities_new, vulnerabilities_updated, vulnerabilities_remediated,
        remediations_count, remediations_new, remediations_updated,
        assets_count, assets_new, assets_updated,
        new_count, updated_count, remediated_count
      FROM sync_history
      ORDER BY sync_date DESC
      LIMIT ?
    `);
    return stmt.all(finalLimit);
  }

  /**
   * Get the timestamp of the last successful sync
   * @returns {string|null} ISO 8601 timestamp of last successful sync, or null if no syncs found
   */
  getLastSuccessfulSyncDate() {
    const stmt = this.db.prepare(`
      SELECT sync_date
      FROM sync_history
      WHERE event_type = 'complete'
      ORDER BY sync_date DESC
      LIMIT 1
    `);
    const result = stmt.get();
    return result?.sync_date || null;
  }

  /**
   * Log a sync event with detailed information
   * @param {string} eventType - Type of event (start, batch, flush, error, pause, resume, stop, complete)
   * @param {string} message - Human-readable message
   * @param {object} options - Optional stats and details
   */
  logSyncEvent(eventType, message, options = {}) {
    const now = dayjs().toISOString();
    const {
      vulnerabilityStats = {},
      remediationStats = {},
      assetStats = {},
      details = null
    } = options;

    this.statements.insertSyncEvent.run({
      sync_date: now,
      event_type: eventType,
      message: message,
      details: details ? JSON.stringify(details) : null,
      vulnerabilities_count: vulnerabilityStats.total ?? null,
      vulnerabilities_new: vulnerabilityStats.new ?? null,
      vulnerabilities_updated: vulnerabilityStats.updated ?? null,
      vulnerabilities_remediated: vulnerabilityStats.remediated ?? null,
      remediations_count: remediationStats.total ?? null,
      remediations_new: remediationStats.new ?? null,
      remediations_updated: remediationStats.updated ?? null,
      assets_count: assetStats.total ?? null,
      assets_new: assetStats.new ?? null,
      assets_updated: assetStats.updated ?? null,
      new_count: vulnerabilityStats.new ?? null,
      updated_count: vulnerabilityStats.updated ?? null,
      remediated_count: vulnerabilityStats.remediated ?? null,
    });
  }
}

module.exports = { VulnerabilityDatabase };
