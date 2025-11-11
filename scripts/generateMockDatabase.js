#!/usr/bin/env node

/**
 * Generate a mock SQLite database with fake vulnerability and remediation data
 * for testing and demonstration purposes.
 *
 * Usage: node scripts/generateMockDatabase.js [output-path] [record-count]
 *
 * Defaults:
 * - output-path: ./data/mock-vanta-vulnerabilities.db
 * - record-count: 500 (vulnerabilities)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Configuration
const outputPath = process.argv[2] || path.join(__dirname, '..', 'data', 'mock-vanta-vulnerabilities.db');
const vulnerabilityCount = parseInt(process.argv[3]) || 500;

// Mock data generators
const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const severityWeights = [0.05, 0.15, 0.35, 0.30, 0.15]; // Distribution weights

const vulnerabilityTypes = [
  'CVE',
  'CWE',
  'Security Advisory',
  'Configuration Issue',
  'Outdated Package',
  'Known Vulnerability',
  'Code Quality Issue'
];

const integrations = [
  { id: 'github-scanner-1', type: 'GitHub' },
  { id: 'snyk-scanner-1', type: 'Snyk' },
  { id: 'tenable-scanner-1', type: 'Tenable' },
  { id: 'qualys-scanner-1', type: 'Qualys' },
  { id: 'crowdstrike-scanner-1', type: 'CrowdStrike' },
  { id: 'wiz-scanner-1', type: 'Wiz' }
];

const packageNames = [
  'lodash', 'express', 'react', 'vue', 'angular', 'webpack', 'axios', 'moment',
  'jquery', 'bootstrap', 'typescript', 'eslint', 'babel', 'passport', 'socket.io',
  'redis', 'mysql', 'postgresql', 'mongodb', 'mongoose', 'sequelize', 'prisma',
  'next.js', 'nuxt.js', 'gatsby', 'electron', 'puppeteer', 'jest', 'mocha', 'chai',
  'django', 'flask', 'fastapi', 'ruby-on-rails', 'spring-boot', 'struts',
  'log4j', 'jackson', 'gson', 'okhttp', 'retrofit'
];

const cvePatterns = [
  'CVE-2023-', 'CVE-2024-', 'CVE-2025-'
];

const scanSources = [
  'Container Image Scan',
  'Repository Scan',
  'Infrastructure Scan',
  'Application Scan',
  'Dependency Scan',
  'SAST',
  'DAST',
  'SCA'
];

// Weighted random selection
function weightedRandom(items, weights) {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }

  return items[items.length - 1];
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateCVEId() {
  const year = randomItem(cvePatterns);
  const number = Math.floor(Math.random() * 50000).toString().padStart(5, '0');
  return `${year}${number}`;
}

function generateVulnerability(id, now) {
  const severity = weightedRandom(severities, severityWeights);
  const integration = randomItem(integrations);
  const packageName = randomItem(packageNames);
  const vulnType = randomItem(vulnerabilityTypes);
  const cveId = vulnType === 'CVE' ? generateCVEId() : null;

  // Date ranges
  const firstDetected = randomDate(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), now); // Within last year
  const lastDetected = randomDate(firstDetected, now);

  // 30% chance of being deactivated (remediated)
  const isDeactivated = Math.random() < 0.30;
  const deactivatedOn = isDeactivated ? randomDate(lastDetected, now).toISOString() : null;

  // CVSS score based on severity
  let cvssScore = 0;
  switch (severity) {
    case 'CRITICAL': cvssScore = 9.0 + Math.random(); break;
    case 'HIGH': cvssScore = 7.0 + Math.random() * 2; break;
    case 'MEDIUM': cvssScore = 4.0 + Math.random() * 3; break;
    case 'LOW': cvssScore = 0.1 + Math.random() * 3.9; break;
    case 'INFO': cvssScore = 0; break;
  }

  const isFixable = Math.random() < 0.75; // 75% fixable
  const scannerScore = cvssScore + (Math.random() - 0.5) * 2;

  // Calculate remediate_by date (SLA: 7d for CRITICAL, 30d for HIGH, 90d for MEDIUM/LOW)
  let remediateDays;
  switch (severity) {
    case 'CRITICAL': remediateDays = 7; break;
    case 'HIGH': remediateDays = 30; break;
    case 'MEDIUM': remediateDays = 90; break;
    default: remediateDays = 180;
  }
  const remediateBy = new Date(firstDetected.getTime() + remediateDays * 24 * 60 * 60 * 1000).toISOString();

  const targetId = `asset-${Math.floor(Math.random() * 200)}`;
  const name = cveId
    ? `${cveId} in ${packageName}`
    : `${vulnType} in ${packageName}`;

  const description = `${vulnType} detected in ${packageName} package. ` +
    `${isFixable ? 'A fix is available.' : 'No fix currently available.'} ` +
    `Severity: ${severity}. ${cveId ? `Related to ${cveId}.` : ''}`;

  const relatedVulns = [];
  if (Math.random() < 0.3) {
    // 30% chance of having related vulnerabilities
    const relatedCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < relatedCount; i++) {
      relatedVulns.push(generateCVEId());
    }
  }

  const relatedUrls = [
    `https://nvd.nist.gov/vuln/detail/${cveId || 'CVE-2024-00000'}`,
    `https://github.com/advisories/${cveId || 'GHSA-xxxx-xxxx-xxxx'}`
  ];
  if (Math.random() < 0.5) {
    relatedUrls.push(`https://snyk.io/vuln/npm:${packageName}`);
  }

  const rawData = {
    id: `vuln-${id}`,
    displayName: name,
    description,
    integrationId: integration.id,
    packageIdentifier: `npm:${packageName}@${Math.floor(Math.random() * 20)}.${Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 100)}`,
    vulnerabilityType: vulnType,
    targetId,
    firstDetectedOnDate: firstDetected.toISOString(),
    sourceDetectedMetadata: {
      source: randomItem(scanSources),
      scanner: integration.type
    },
    lastDetectedOnDate: lastDetected.toISOString(),
    severity,
    cvssScore,
    scannerScore,
    isFixable,
    remediateByDate: remediateBy,
    externalUrl: relatedUrls[0],
    scanSource: randomItem(scanSources),
    deactivateMetadata: isDeactivated ? {
      deactivatedOnDate: deactivatedOn,
      reason: 'Remediated'
    } : null,
    relatedVulnerabilities: relatedVulns,
    relatedUrls
  };

  return {
    id: `vuln-${id}`,
    name,
    description,
    integration_id: integration.id,
    package_identifier: rawData.packageIdentifier,
    vulnerability_type: vulnType,
    target_id: targetId,
    first_detected: firstDetected.toISOString(),
    source_detected: JSON.stringify(rawData.sourceDetectedMetadata),
    last_detected: lastDetected.toISOString(),
    severity,
    cvss_score: Math.round(cvssScore * 10) / 10,
    scanner_score: Math.round(scannerScore * 10) / 10,
    is_fixable: isFixable ? 1 : 0,
    remediate_by: remediateBy,
    external_url: relatedUrls[0],
    scan_source: rawData.scanSource,
    deactivated_on: deactivatedOn,
    related_vulns: JSON.stringify(relatedVulns),
    related_urls: JSON.stringify(relatedUrls),
    updated_at: now.toISOString(),
    raw_data: JSON.stringify(rawData)
  };
}

function generateRemediation(vulnId, vuln, now, index) {
  const remediationId = `rem-${vulnId}-${index}`;
  const integration = randomItem(integrations);

  const detectedDate = new Date(vuln.first_detected);
  const slaDeadline = new Date(vuln.remediate_by);

  let remediationDate = null;
  let remediatedOnTime = null;
  let status = 'open';

  if (vuln.deactivated_on) {
    // If vulnerability is deactivated, it's been remediated
    remediationDate = new Date(vuln.deactivated_on);
    remediatedOnTime = remediationDate <= slaDeadline ? 1 : 0;
    status = 'closed';
  } else if (Math.random() < 0.2) {
    // 20% chance of having a remediation record even if not yet closed
    remediationDate = randomDate(detectedDate, now);
    if (remediationDate <= slaDeadline) {
      remediatedOnTime = 1;
      status = 'closed';
    } else {
      remediatedOnTime = 0;
      status = 'overdue';
    }
  } else if (now > slaDeadline) {
    status = 'overdue';
  }

  const rawData = {
    id: remediationId,
    vulnerabilityId: vuln.id,
    vulnerableAssetId: vuln.target_id,
    severity: vuln.severity,
    detectedDate: detectedDate.toISOString(),
    slaDeadlineDate: slaDeadline.toISOString(),
    remediationDate: remediationDate ? remediationDate.toISOString() : null,
    remediatedOnTime,
    integrationId: integration.id,
    integrationType: integration.type,
    status
  };

  return {
    id: remediationId,
    vulnerability_id: vuln.id,
    vulnerable_asset_id: vuln.target_id,
    severity: vuln.severity,
    detected_date: detectedDate.toISOString(),
    sla_deadline_date: slaDeadline.toISOString(),
    remediation_date: remediationDate ? remediationDate.toISOString() : null,
    remediated_on_time: remediatedOnTime,
    integration_id: integration.id,
    integration_type: integration.type,
    status,
    updated_at: now.toISOString(),
    raw_data: JSON.stringify(rawData)
  };
}

// Main execution
console.log('🔧 Generating mock Vanta vulnerability database...\n');
console.log(`Output path: ${outputPath}`);
console.log(`Generating ${vulnerabilityCount} vulnerabilities\n`);

// Ensure output directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`✓ Created directory: ${outputDir}`);
}

// Remove existing database if present
if (fs.existsSync(outputPath)) {
  fs.unlinkSync(outputPath);
  console.log('✓ Removed existing database');
}

// Create database and tables
const db = new Database(outputPath);

console.log('✓ Creating database schema...');

// Create vulnerabilities table
db.exec(`
  CREATE TABLE vulnerabilities (
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

  CREATE INDEX idx_vulnerabilities_severity ON vulnerabilities(severity);
  CREATE INDEX idx_vulnerabilities_target ON vulnerabilities(target_id);
  CREATE INDEX idx_vulnerabilities_deactivated ON vulnerabilities(deactivated_on);
  CREATE INDEX idx_vulnerabilities_fixable ON vulnerabilities(is_fixable);
  CREATE INDEX idx_vulnerabilities_integration ON vulnerabilities(integration_id);
`);

// Create remediations table
db.exec(`
  CREATE TABLE vulnerability_remediations (
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

// Create sync history table
db.exec(`
  CREATE TABLE sync_history (
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

console.log('✓ Schema created');

// Prepare statements
const insertVuln = db.prepare(`
  INSERT INTO vulnerabilities (
    id, name, description, integration_id, package_identifier,
    vulnerability_type, target_id, first_detected, source_detected,
    last_detected, severity, cvss_score, scanner_score, is_fixable,
    remediate_by, external_url, scan_source, deactivated_on,
    related_vulns, related_urls, updated_at, raw_data
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);

const insertRem = db.prepare(`
  INSERT INTO vulnerability_remediations (
    id, vulnerability_id, vulnerable_asset_id, severity,
    detected_date, sla_deadline_date, remediation_date,
    remediated_on_time, integration_id, integration_type,
    status, updated_at, raw_data
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);

const insertSync = db.prepare(`
  INSERT INTO sync_history (
    sync_date, event_type, message, details,
    vulnerabilities_count, vulnerabilities_new, vulnerabilities_updated,
    vulnerabilities_remediated, remediations_count, remediations_new,
    remediations_updated
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Generate data
console.log('✓ Generating vulnerabilities...');
const now = new Date();
const vulnerabilities = [];

const insertVulns = db.transaction((vulns) => {
  for (const vuln of vulns) {
    insertVuln.run(
      vuln.id, vuln.name, vuln.description, vuln.integration_id,
      vuln.package_identifier, vuln.vulnerability_type, vuln.target_id,
      vuln.first_detected, vuln.source_detected, vuln.last_detected,
      vuln.severity, vuln.cvss_score, vuln.scanner_score, vuln.is_fixable,
      vuln.remediate_by, vuln.external_url, vuln.scan_source,
      vuln.deactivated_on, vuln.related_vulns, vuln.related_urls,
      vuln.updated_at, vuln.raw_data
    );
  }
});

for (let i = 1; i <= vulnerabilityCount; i++) {
  const vuln = generateVulnerability(i, now);
  vulnerabilities.push(vuln);

  if (i % 100 === 0) {
    process.stdout.write(`  Generated ${i}/${vulnerabilityCount} vulnerabilities\r`);
  }
}

insertVulns(vulnerabilities);
console.log(`✓ Inserted ${vulnerabilityCount} vulnerabilities     `);

// Generate remediations (1-3 per vulnerability)
console.log('✓ Generating remediations...');
const remediations = [];

for (const vuln of vulnerabilities) {
  const remCount = Math.floor(Math.random() * 3) + 1; // 1-3 remediations per vuln
  for (let i = 0; i < remCount; i++) {
    const rem = generateRemediation(vuln.id, vuln, now, i);
    remediations.push(rem);
  }
}

const insertRems = db.transaction((rems) => {
  for (const rem of rems) {
    insertRem.run(
      rem.id, rem.vulnerability_id, rem.vulnerable_asset_id,
      rem.severity, rem.detected_date, rem.sla_deadline_date,
      rem.remediation_date, rem.remediated_on_time, rem.integration_id,
      rem.integration_type, rem.status, rem.updated_at, rem.raw_data
    );
  }
});

insertRems(remediations);
console.log(`✓ Inserted ${remediations.length} remediations`);

// Generate sync history (last 10 syncs)
console.log('✓ Generating sync history...');
const syncHistory = [];

for (let i = 10; i >= 1; i--) {
  const syncDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000); // Daily syncs

  // Start event
  syncHistory.push({
    sync_date: syncDate.toISOString(),
    event_type: 'start',
    message: 'Sync started',
    details: JSON.stringify({ timestamp: syncDate.toISOString() }),
    vulnerabilities_count: 0,
    vulnerabilities_new: 0,
    vulnerabilities_updated: 0,
    vulnerabilities_remediated: 0,
    remediations_count: 0,
    remediations_new: 0,
    remediations_updated: 0
  });

  // Complete event with stats
  const vulnsNew = Math.floor(Math.random() * 20);
  const vulnsUpdated = Math.floor(Math.random() * 50);
  const vulnsRemediated = Math.floor(Math.random() * 15);
  const remsNew = Math.floor(Math.random() * 30);
  const remsUpdated = Math.floor(Math.random() * 40);

  syncHistory.push({
    sync_date: new Date(syncDate.getTime() + 120000).toISOString(), // 2 min later
    event_type: 'complete',
    message: `Sync completed: ${vulnsNew} new, ${vulnsUpdated} updated, ${vulnsRemediated} remediated vulnerabilities`,
    details: JSON.stringify({
      duration: 120,
      totalVulnerabilities: vulnerabilityCount,
      totalRemediations: remediations.length
    }),
    vulnerabilities_count: vulnerabilityCount,
    vulnerabilities_new: vulnsNew,
    vulnerabilities_updated: vulnsUpdated,
    vulnerabilities_remediated: vulnsRemediated,
    remediations_count: remediations.length,
    remediations_new: remsNew,
    remediations_updated: remsUpdated
  });
}

const insertSyncHistory = db.transaction((syncs) => {
  for (const sync of syncs) {
    insertSync.run(
      sync.sync_date, sync.event_type, sync.message, sync.details,
      sync.vulnerabilities_count, sync.vulnerabilities_new,
      sync.vulnerabilities_updated, sync.vulnerabilities_remediated,
      sync.remediations_count, sync.remediations_new,
      sync.remediations_updated
    );
  }
});

insertSyncHistory(syncHistory);
console.log(`✓ Inserted ${syncHistory.length} sync history records`);

// Optimize database
console.log('✓ Optimizing database...');
db.pragma('optimize');
db.pragma('vacuum');

db.close();

// Get file size
const stats = fs.statSync(outputPath);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log('\n✅ Mock database generated successfully!');
console.log(`\nDatabase Statistics:`);
console.log(`  File: ${outputPath}`);
console.log(`  Size: ${fileSizeMB} MB`);
console.log(`  Vulnerabilities: ${vulnerabilityCount}`);
console.log(`  Remediations: ${remediations.length}`);
console.log(`  Sync History: ${syncHistory.length} events`);
console.log(`\nSeverity Distribution:`);

const severityCounts = vulnerabilities.reduce((acc, v) => {
  acc[v.severity] = (acc[v.severity] || 0) + 1;
  return acc;
}, {});

for (const severity of severities) {
  const count = severityCounts[severity] || 0;
  const pct = ((count / vulnerabilityCount) * 100).toFixed(1);
  console.log(`  ${severity}: ${count} (${pct}%)`);
}

console.log(`\nActive vs Remediated:`);
const activeCount = vulnerabilities.filter(v => !v.deactivated_on).length;
const remediatedCount = vulnerabilities.filter(v => v.deactivated_on).length;
console.log(`  Active: ${activeCount} (${((activeCount / vulnerabilityCount) * 100).toFixed(1)}%)`);
console.log(`  Remediated: ${remediatedCount} (${((remediatedCount / vulnerabilityCount) * 100).toFixed(1)}%)`);

if (fileSizeMB > 50) {
  console.log(`\n⚠️  Warning: File size (${fileSizeMB} MB) exceeds recommended GitHub limit (50 MB)`);
  console.log('   Consider reducing the vulnerability count to stay under 50 MB.');
}
