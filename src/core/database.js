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
      selectAssetRaw: this.db.prepare('SELECT raw_data FROM vulnerable_assets WHERE id = ?'),
      upsertAsset: this.db.prepare(`
        INSERT INTO vulnerable_assets (
          id, name, asset_type, has_been_scanned, image_scan_tag, scanners,
          updated_at, raw_data
        ) VALUES (
          @id, @name, @asset_type, @has_been_scanned, @image_scan_tag, @scanners,
          @updated_at, @raw_data
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          asset_type = excluded.asset_type,
          has_been_scanned = excluded.has_been_scanned,
          image_scan_tag = excluded.image_scan_tag,
          scanners = excluded.scanners,
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
      insertSync: this.db.prepare(`
        INSERT INTO sync_history (
          sync_date,
          vulnerabilities_count, vulnerabilities_new, vulnerabilities_updated, vulnerabilities_remediated,
          remediations_count, remediations_new, remediations_updated,
          new_count, updated_count, remediated_count
        )
        VALUES (
          @sync_date,
          @vulnerabilities_count, @vulnerabilities_new, @vulnerabilities_updated, @vulnerabilities_remediated,
          @remediations_count, @remediations_new, @remediations_updated,
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
          new_count, updated_count, remediated_count
        )
        VALUES (
          @sync_date,
          @event_type,
          @message,
          @details,
          @vulnerabilities_count, @vulnerabilities_new, @vulnerabilities_updated, @vulnerabilities_remediated,
          @remediations_count, @remediations_new, @remediations_updated,
          @new_count, @updated_count, @remediated_count
        )
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
        new_count INTEGER,
        updated_count INTEGER,
        remediated_count INTEGER
      );
    `);

    this.db.exec(`
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
    `);

    // Migration: Add missing columns to sync_history if they don't exist
    this._migrateSyncHistoryColumns();

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_severity ON vulnerabilities(severity);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_target ON vulnerabilities(target_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_deactivated ON vulnerabilities(deactivated_on);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_fixable ON vulnerabilities(is_fixable);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_integration ON vulnerabilities(integration_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_remediations_vulnerability ON vulnerability_remediations(vulnerability_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_assets_type ON vulnerable_assets(asset_type);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_assets_name ON vulnerable_assets(name);');
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

  _normaliseAsset(asset) {
    const data = {
      id: asset.id,
      name: asset.name || null,
      asset_type: asset.assetType || null,
      has_been_scanned: asset.hasBeenScanned ? 1 : 0,
      image_scan_tag: asset.imageScanTag || null,
      scanners: Array.isArray(asset.scanners) ? JSON.stringify(asset.scanners) : null,
      updated_at: dayjs().toISOString(),
      raw_data: JSON.stringify(asset),
    };
    return data;
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

  storeAssetsBatch(assets) {
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
        `SELECT id, raw_data FROM vulnerable_assets WHERE id IN (${placeholders})`
      ).all(...ids);

      // Build lookup map for O(1) access
      const existingMap = new Map(
        existingRecords.map(rec => [rec.id, rec.raw_data])
      );

      rows.forEach((row) => {
        if (!row?.id) {
          return;
        }
        const payload = this._normaliseAsset(row);
        payload.updated_at = now;

        const existingRawData = existingMap.get(row.id);
        if (!existingRawData) {
          newCount += 1;
        } else if (existingRawData !== payload.raw_data) {
          updatedCount += 1;
        }
        this.statements.upsertAsset.run(payload);

        // Update map so duplicate IDs within same batch are treated as updates
        existingMap.set(row.id, payload.raw_data);
      });

      return { new: newCount, updated: updatedCount, total: rows.length };
    });

    return tx(assets);
  }

  buildFilters(filters = {}) {
    const clauses = [];
    const params = {};

    if (Array.isArray(filters.severity) && filters.severity.length > 0) {
      const placeholders = filters.severity.map((_, idx) => `@severity${idx}`);
      filters.severity.forEach((value, idx) => {
        params[`severity${idx}`] = value;
      });
      clauses.push(`severity IN (${placeholders.join(',')})`);
    }

    if (filters.status === 'active') {
      clauses.push('deactivated_on IS NULL');
    } else if (filters.status === 'deactivated') {
      // "Remediated" means the vulnerability has at least one remediation record with a remediation_date
      clauses.push(`EXISTS (
        SELECT 1 FROM vulnerability_remediations vr
        WHERE vr.vulnerability_id = vulnerabilities.id
        AND vr.remediation_date IS NOT NULL
      )`);
    }

    if (filters.fixable === 'fixable') {
      clauses.push('is_fixable = 1');
    } else if (filters.fixable === 'not_fixable') {
      clauses.push('is_fixable = 0');
    }

    if (filters.integration) {
      clauses.push('integration_id LIKE @integration');
      params.integration = `%${filters.integration}%`;
    }

    if (filters.assetId) {
      clauses.push('target_id = @assetId');
      params.assetId = filters.assetId;
    }

    if (filters.cve) {
      clauses.push('(name LIKE @cve OR related_vulns LIKE @cve)');
      params.cve = `%${filters.cve}%`;
    }

    if (filters.search) {
      clauses.push('(name LIKE @search OR description LIKE @search OR id LIKE @search)');
      params.search = `%${filters.search}%`;
    }

    if (filters.dateIdentifiedStart) {
      clauses.push('first_detected >= @dateIdentifiedStart');
      params.dateIdentifiedStart = filters.dateIdentifiedStart;
    }

    if (filters.dateIdentifiedEnd) {
      clauses.push('first_detected <= @dateIdentifiedEnd');
      params.dateIdentifiedEnd = filters.dateIdentifiedEnd;
    }

    if (filters.dateRemediatedStart) {
      clauses.push('deactivated_on >= @dateRemediatedStart');
      params.dateRemediatedStart = filters.dateRemediatedStart;
    }

    if (filters.dateRemediatedEnd) {
      clauses.push('deactivated_on <= @dateRemediatedEnd');
      params.dateRemediatedEnd = filters.dateRemediatedEnd;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return { where, params };
  }

  getVulnerabilities({ filters = {}, limit = 100, offset = 0, sortColumn = 'first_detected', sortDirection = 'desc' } = {}) {
    const { where, params } = this.buildFilters(filters);

    // Map of allowed sort columns to prevent SQL injection
    const allowedColumns = {
      id: 'id',
      name: 'name',
      severity: 'severity',
      integration_id: 'integration_id',
      target_id: 'target_id',
      first_detected: 'first_detected',
      status: 'deactivated_on', // Special case: status is based on deactivated_on
    };

    // Validate and sanitize sort column
    const actualColumn = allowedColumns[sortColumn] || 'first_detected';

    // Validate sort direction
    const direction = sortDirection.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Build ORDER BY clause
    let orderBy;
    if (sortColumn === 'status') {
      // For status, sort by whether deactivated_on is null (Active vs Remediated)
      // NULL first means Active first when DESC, Remediated first when ASC
      orderBy = `ORDER BY (deactivated_on IS NULL) ${direction}, name ASC`;
    } else if (sortColumn === 'severity') {
      // For severity, use explicit ordering: CRITICAL→HIGH→MEDIUM→LOW→INFO→UNKNOWN
      orderBy = `ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          WHEN 'INFO' THEN 5
          ELSE 6
        END ${direction},
        name ASC`;
    } else {
      // Handle NULL values properly - put them at the end
      orderBy = `ORDER BY (${actualColumn} IS NULL), ${actualColumn} ${direction}, name ASC`;
    }

    const query = `
      SELECT id, name, description, integration_id, target_id, severity, first_detected,
             last_detected, deactivated_on, is_fixable, cvss_score, package_identifier,
             vulnerability_type, remediate_by, external_url, scan_source
      FROM vulnerabilities
      ${where}
      ${orderBy}
      LIMIT @limit OFFSET @offset;
    `;
    const stmt = this.db.prepare(query);
    return stmt.all({ ...params, limit, offset });
  }

  getVulnerabilityCount(filters = {}) {
    const { where, params } = this.buildFilters(filters);
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM vulnerabilities ${where};`);
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
    const { where, params } = this.buildFilters(filters);

    const total = this.db.prepare(`SELECT COUNT(*) as count FROM vulnerabilities ${where};`).get(params)?.count ?? 0;

    const severityRows = this.db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM vulnerabilities
      ${where}
      GROUP BY severity;
    `).all(params);
    const bySeverity = severityRows.reduce((acc, row) => {
      acc[row.severity || 'UNKNOWN'] = row.count;
      return acc;
    }, {});

    const integrationRows = this.db.prepare(`
      SELECT integration_id, COUNT(*) as count
      FROM vulnerabilities
      ${where}
      GROUP BY integration_id;
    `).all(params);
    const byIntegration = integrationRows.reduce((acc, row) => {
      acc[row.integration_id || 'UNKNOWN'] = row.count;
      return acc;
    }, {});

    const fixabilityRows = this.db.prepare(`
      SELECT is_fixable, COUNT(*) as count
      FROM vulnerabilities
      ${where}
      GROUP BY is_fixable;
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
            WHERE vr.vulnerability_id = vulnerabilities.id
            AND vr.remediation_date IS NOT NULL
          ) THEN 'remediated'
          ELSE 'active'
        END as status,
        COUNT(*) as count
      FROM vulnerabilities
      ${where}
      GROUP BY status;
    `).all(params);
    const active = statusRows.find((row) => row.status === 'active')?.count ?? 0;
    const remediated = statusRows.find((row) => row.status === 'remediated')?.count ?? 0;

    const uniques = this.db.prepare(`
      SELECT
        COUNT(DISTINCT target_id) as assets,
        COUNT(DISTINCT name) as cves
      FROM vulnerabilities
      ${where};
    `).get(params);

    const cvssWhere = where ? `${where} AND cvss_score IS NOT NULL` : 'WHERE cvss_score IS NOT NULL';
    const averages = this.db.prepare(`
      SELECT severity, AVG(cvss_score) as average
      FROM vulnerabilities
      ${cvssWhere}
      GROUP BY severity;
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
    };
  }

  /**
   * Get all unique assets with vulnerability counts
   * @param {object} filters - Optional filters to apply
   * @returns {Array} Array of assets with counts
   */
  getAssets(filters = {}) {
    const { where, params } = this.buildFilters(filters);
    // Add NULL filtering for target_id
    const whereClause = where
      ? `${where} AND v.target_id IS NOT NULL`
      : 'WHERE v.target_id IS NOT NULL';

    const query = `
      SELECT
        v.target_id as assetId,
        COALESCE(a.name, v.target_id) as assetName,
        a.asset_type as assetType,
        COUNT(*) as vulnerabilityCount,
        SUM(CASE WHEN v.deactivated_on IS NULL THEN 1 ELSE 0 END) as activeCount,
        SUM(CASE WHEN v.deactivated_on IS NOT NULL THEN 1 ELSE 0 END) as remediatedCount
      FROM vulnerabilities v
      LEFT JOIN vulnerable_assets a ON v.target_id = a.id
      ${whereClause}
      GROUP BY v.target_id, a.name, a.asset_type
      ORDER BY vulnerabilityCount DESC, assetName ASC
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
    const { where, params } = this.buildFilters(extendedFilters);
    const query = `
      SELECT id, name, description, severity, first_detected, deactivated_on,
             is_fixable, cvss_score, integration_id
      FROM vulnerabilities
      ${where}
      ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END ASC,
        first_detected DESC
    `;
    return this.db.prepare(query).all(params);
  }

  /**
   * Get all unique CVEs with vulnerability counts
   * @param {object} filters - Optional filters to apply
   * @returns {Array} Array of CVEs with counts and descriptions
   */
  getCVEs(filters = {}) {
    const { where, params } = this.buildFilters(filters);
    // Add NULL filtering for name (CVE) and fix MAX(severity) to use numeric ordering
    const whereClause = where
      ? `${where} AND name IS NOT NULL`
      : 'WHERE name IS NOT NULL';

    const query = `
      SELECT
        name as cveName,
        MAX(description) as description,
        COUNT(*) as vulnerabilityCount,
        SUM(CASE WHEN deactivated_on IS NULL THEN 1 ELSE 0 END) as activeCount,
        SUM(CASE WHEN deactivated_on IS NOT NULL THEN 1 ELSE 0 END) as remediatedCount,
        MAX(
          CASE severity
            WHEN 'CRITICAL' THEN 1
            WHEN 'HIGH' THEN 2
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 4
            WHEN 'INFO' THEN 5
            ELSE 6
          END
        ) as severityOrder,
        CASE MIN(
          CASE severity
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
      FROM vulnerabilities
      ${whereClause}
      GROUP BY name
      ORDER BY
        severityOrder ASC,
        vulnerabilityCount DESC,
        name ASC
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
    const { where, params } = this.buildFilters(extendedFilters);
    const query = `
      SELECT id, target_id as assetId, severity, first_detected, deactivated_on,
             integration_id, is_fixable, cvss_score
      FROM vulnerabilities
      ${where}
      ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END ASC,
        first_detected DESC
    `;
    return this.db.prepare(query).all(params);
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

    const statusCounts = byStatus.reduce((acc, row) => {
      acc[row.remediation_status] = row.count;
      return acc;
    }, {});

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

    const timelinessCounts = timeliness.reduce((acc, row) => {
      acc[row.timeliness] = row.count;
      return acc;
    }, {});

    return {
      total: totalRemediations,
      withMatchingVulnerability: remediationsWithVulns,
      withoutMatchingVulnerability: totalRemediations - remediationsWithVulns,
      remediated: statusCounts.remediated ?? 0,
      overdue: statusCounts.overdue ?? 0,
      open: statusCounts.open ?? 0,
      onTime: timelinessCounts.on_time ?? 0,
      late: timelinessCounts.late ?? 0,
      pending: timelinessCounts.pending ?? 0,
    };
  }

  recordSyncHistory(vulnerabilityStats, remediationStats) {
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
      new_count: vulnerabilityStats.new ?? null,
      updated_count: vulnerabilityStats.updated ?? null,
      remediated_count: vulnerabilityStats.remediated ?? null,
    });
  }
}

module.exports = { VulnerabilityDatabase };
