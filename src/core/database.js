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
    this.db.pragma('journal_mode = WAL');
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
      insertSync: this.db.prepare(`
        INSERT INTO sync_history (sync_date, vulnerabilities_count, new_count, updated_count, remediated_count)
        VALUES (@sync_date, @vulnerabilities_count, @new_count, @updated_count, @remediated_count)
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
        vulnerabilities_count INTEGER,
        new_count INTEGER,
        updated_count INTEGER,
        remediated_count INTEGER
      );
    `);

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_severity ON vulnerabilities(severity);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_target ON vulnerabilities(target_id);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_deactivated ON vulnerabilities(deactivated_on);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_fixable ON vulnerabilities(is_fixable);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vulnerabilities_integration ON vulnerabilities(integration_id);');
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
      external_url: vuln.externalUrl || null,
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

      this.statements.insertSync.run({
        sync_date: now,
        vulnerabilities_count: rows.length,
        new_count: newCount,
        updated_count: updatedCount,
        remediated_count: remediatedCount,
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
      clauses.push('deactivated_on IS NOT NULL');
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

  getVulnerabilities({ filters = {}, limit = 100, offset = 0 } = {}) {
    const { where, params } = this.buildFilters(filters);
    const query = `
      SELECT id, name, description, integration_id, target_id, severity, first_detected,
             last_detected, deactivated_on, is_fixable, cvss_score, package_identifier,
             vulnerability_type, remediate_by, external_url, scan_source
      FROM vulnerabilities
      ${where}
      ORDER BY (first_detected IS NULL), first_detected DESC, name ASC
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

    const statusRows = this.db.prepare(`
      SELECT CASE WHEN deactivated_on IS NULL THEN 'active' ELSE 'deactivated' END as status,
             COUNT(*) as count
      FROM vulnerabilities
      ${where}
      GROUP BY status;
    `).all(params);
    const active = statusRows.find((row) => row.status === 'active')?.count ?? 0;
    const deactivated = statusRows.find((row) => row.status === 'deactivated')?.count ?? 0;

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

    return {
      totalCount: total,
      bySeverity,
      byIntegration,
      fixable,
      notFixable,
      active,
      deactivated,
      uniqueAssets: uniques?.assets ?? 0,
      uniqueCves: uniques?.cves ?? 0,
      averageCvssBySeverity,
      lastSync: lastSync?.sync_date ?? null,
    };
  }

  getSyncHistory(limit = 20) {
    const stmt = this.db.prepare(`
      SELECT sync_date, vulnerabilities_count, new_count, updated_count, remediated_count
      FROM sync_history
      ORDER BY sync_date DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
}

module.exports = { VulnerabilityDatabase };
