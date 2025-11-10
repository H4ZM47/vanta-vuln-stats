"""
Vulnerability Database

This module provides SQLite database functionality for storing and retrieving
vulnerability data with change tracking and historical snapshots.
"""

import json
import sqlite3
from datetime import datetime
from threading import Lock
from typing import Dict, List, Optional, Any


class VulnerabilityDatabase:
    """SQLite database for storing and retrieving vulnerability data"""

    def __init__(self, db_path: str = "vanta_vulnerabilities.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._write_lock = Lock()
        self._create_tables()

    def _create_tables(self) -> None:
        """Create database tables if they don't exist"""
        cursor = self.conn.cursor()

        # Main table for current vulnerability state
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vulnerabilities (
                id TEXT PRIMARY KEY,
                name TEXT,
                description TEXT,
                integration_id TEXT,
                package_identifier TEXT,
                vulnerability_type TEXT,
                target_id TEXT,
                first_detected_date TEXT,
                source_detected_date TEXT,
                last_detected_date TEXT,
                severity TEXT,
                cvss_severity_score REAL,
                scanner_score REAL,
                is_fixable BOOLEAN,
                remediate_by_date TEXT,
                external_url TEXT,
                scan_source TEXT,
                deactivate_metadata TEXT,
                related_vulns TEXT,
                related_urls TEXT,
                last_updated TEXT,
                raw_data TEXT
            )
        """)

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS vulnerability_remediations (
                id TEXT PRIMARY KEY,
                vulnerability_id TEXT,
                vulnerable_asset_id TEXT,
                severity TEXT,
                detected_date TEXT,
                sla_deadline_date TEXT,
                remediation_date TEXT,
                is_remediated_on_time BOOLEAN,
                integration_id TEXT,
                integration_type TEXT,
                status TEXT,
                last_updated TEXT,
                raw_data TEXT
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS data_elements (
                record_type TEXT NOT NULL,
                record_id TEXT NOT NULL,
                element_path TEXT NOT NULL,
                element_value TEXT,
                last_updated TEXT NOT NULL,
                PRIMARY KEY (record_type, record_id, element_path)
            )
            """
        )

        # History table to track changes over time
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vulnerability_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vuln_id TEXT NOT NULL,
                name TEXT,
                severity TEXT,
                is_deactivated BOOLEAN,
                deactivation_date TEXT,
                snapshot_date TEXT NOT NULL,
                change_type TEXT,
                raw_data TEXT,
                FOREIGN KEY (vuln_id) REFERENCES vulnerabilities(id)
            )
        """)

        # Table to track sync operations
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sync_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sync_date TEXT NOT NULL,
                vulnerabilities_count INTEGER,
                new_count INTEGER,
                updated_count INTEGER,
                remediated_count INTEGER
            )
        """)

        # Indexes
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_severity ON vulnerabilities(severity)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_target_id ON vulnerabilities(target_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_first_detected ON vulnerabilities(first_detected_date)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_name ON vulnerabilities(name)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_history_vuln_id ON vulnerability_history(vuln_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_history_snapshot_date ON vulnerability_history(snapshot_date)
        """)
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_data_elements_record
            ON data_elements(record_type, record_id)
            """
        )

        self.conn.commit()
        self._backfill_data_elements()

    def _normalize_for_storage(self, value: Any) -> str:
        """Normalize Python values into JSON strings for storage."""

        return json.dumps(value, sort_keys=True)

    def _flatten_data(self, data: Any, parent_key: str = "") -> List[tuple]:
        """Flatten nested data structures to key paths and values."""

        items: List[tuple] = []

        if isinstance(data, dict):
            if parent_key:
                items.append((parent_key, data))
            for key, value in data.items():
                new_key = f"{parent_key}.{key}" if parent_key else key
                items.extend(self._flatten_data(value, new_key))
        elif isinstance(data, list):
            if parent_key:
                items.append((parent_key, data))
            for index, value in enumerate(data):
                new_key = f"{parent_key}[{index}]" if parent_key else f"[{index}]"
                items.extend(self._flatten_data(value, new_key))
        else:
            items.append((parent_key, data))

        return items

    def _store_data_elements(
        self,
        cursor: sqlite3.Cursor,
        record_type: str,
        record_id: str,
        data: Dict[str, Any],
        timestamp: str,
    ) -> None:
        """Store flattened data elements for a record."""

        cursor.execute(
            "DELETE FROM data_elements WHERE record_type = ? AND record_id = ?",
            (record_type, record_id),
        )

        elements = [("__root__", data)] + self._flatten_data(data)

        for path, value in elements:
            cursor.execute(
                """
                INSERT OR REPLACE INTO data_elements (
                    record_type,
                    record_id,
                    element_path,
                    element_value,
                    last_updated
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    record_type,
                    record_id,
                    path,
                    self._normalize_for_storage(value),
                    timestamp,
                ),
            )

    def _backfill_data_elements(self) -> None:
        """Ensure data elements exist for previously stored records."""

        cursor = self.conn.cursor()

        cursor.execute("SELECT COUNT(*) AS count FROM data_elements")
        count = cursor.fetchone()["count"]
        if count:
            return

        now = datetime.utcnow().isoformat()

        cursor.execute("SELECT id, raw_data FROM vulnerabilities")
        for row in cursor.fetchall():
            data = json.loads(row["raw_data"]) if row["raw_data"] else {}
            self._store_data_elements(cursor, "vulnerability", row["id"], data, now)

        cursor.execute("SELECT id, raw_data FROM vulnerability_remediations")
        for row in cursor.fetchall():
            data = json.loads(row["raw_data"]) if row["raw_data"] else {}
            self._store_data_elements(
                cursor, "vulnerability_remediation", row["id"], data, now
            )

        self.conn.commit()

    def store_vulnerabilities(self, vulnerabilities: List[Dict], track_changes: bool = True) -> Dict[str, int]:
        """
        Store or update vulnerabilities in the database with change tracking

        Returns:
            Dictionary with counts of new, updated, and remediated vulnerabilities
        """
        with self._write_lock:
            cursor = self.conn.cursor()
            current_time = datetime.utcnow().isoformat()

            new_count = 0
            updated_count = 0
            remediated_count = 0

            # Get current vulnerability IDs to detect remediated ones
            cursor.execute("SELECT id FROM vulnerabilities")
            existing_ids = set(row['id'] for row in cursor.fetchall())
            incoming_ids = set(vuln.get('id') for vuln in vulnerabilities if vuln.get('id'))

            # Process each vulnerability
            for vuln in vulnerabilities:
                vuln_id = vuln.get('id')
                if not vuln_id:
                    continue

                # Check if this is a new or existing vulnerability
                cursor.execute("SELECT raw_data, deactivate_metadata FROM vulnerabilities WHERE id = ?", (vuln_id,))
                existing = cursor.fetchone()

                is_new = existing is None
                deactivate_metadata = json.dumps(vuln.get('deactivateMetadata')) if vuln.get('deactivateMetadata') else None

                # Determine change type
                change_type = None
                if is_new:
                    change_type = "discovered"
                    new_count += 1
                elif existing:
                    old_data = json.loads(existing['raw_data'])
                    old_deactivated = existing['deactivate_metadata'] is not None
                    new_deactivated = vuln.get('deactivateMetadata') is not None

                    if not old_deactivated and new_deactivated:
                        change_type = "remediated"
                        remediated_count += 1
                    elif old_deactivated and not new_deactivated:
                        change_type = "reactivated"
                    elif json.dumps(old_data, sort_keys=True) != json.dumps(vuln, sort_keys=True):
                        change_type = "updated"
                        updated_count += 1

                # Update main table
                cursor.execute("""
                    INSERT OR REPLACE INTO vulnerabilities (
                        id, name, description, integration_id, package_identifier,
                        vulnerability_type, target_id, first_detected_date, source_detected_date,
                        last_detected_date, severity, cvss_severity_score, scanner_score,
                        is_fixable, remediate_by_date, external_url, scan_source,
                        deactivate_metadata, related_vulns, related_urls, last_updated, raw_data
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    vuln_id,
                    vuln.get('name'),
                    vuln.get('description'),
                    vuln.get('integrationId'),
                    vuln.get('packageIdentifier'),
                    vuln.get('vulnerabilityType'),
                    vuln.get('targetId'),
                    vuln.get('firstDetectedDate'),
                    vuln.get('sourceDetectedDate'),
                    vuln.get('lastDetectedDate'),
                    vuln.get('severity'),
                    vuln.get('cvssSeverityScore'),
                    vuln.get('scannerScore'),
                    vuln.get('isFixable'),
                    vuln.get('remediateByDate'),
                    vuln.get('externalURL'),
                    vuln.get('scanSource'),
                    deactivate_metadata,
                    json.dumps(vuln.get('relatedVulns', [])),
                    json.dumps(vuln.get('relatedUrls', [])),
                    current_time,
                    json.dumps(vuln)
                ))

                self._store_data_elements(
                    cursor, "vulnerability", vuln_id, vuln, current_time
                )

                # Add to history if there was a change
                if track_changes and change_type:
                    is_deactivated = vuln.get('deactivateMetadata') is not None
                    deactivation_date = vuln.get('deactivateMetadata', {}).get('deactivatedOnDate') if is_deactivated else None

                    cursor.execute("""
                        INSERT INTO vulnerability_history (
                            vuln_id, name, severity, is_deactivated, deactivation_date,
                            snapshot_date, change_type, raw_data
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        vuln_id,
                        vuln.get('name'),
                        vuln.get('severity'),
                        is_deactivated,
                        deactivation_date,
                        current_time,
                        change_type,
                        json.dumps(vuln)
                    ))

            # Record sync operation
            cursor.execute("""
                INSERT INTO sync_history (
                    sync_date, vulnerabilities_count, new_count, updated_count, remediated_count
                ) VALUES (?, ?, ?, ?, ?)
            """, (current_time, len(vulnerabilities), new_count, updated_count, remediated_count))

            self.conn.commit()

            return {
                'new': new_count,
                'updated': updated_count,
                'remediated': remediated_count,
                'total': len(vulnerabilities)
            }

    def store_vulnerability_remediations(self, remediations: List[Dict]) -> Dict[str, int]:
        """Store vulnerability remediation records in the database."""

        with self._write_lock:
            cursor = self.conn.cursor()
            current_time = datetime.utcnow().isoformat()

            new_count = 0
            updated_count = 0

            for remediation in remediations:
                remediation_id = remediation.get("id")
                if not remediation_id:
                    continue

                cursor.execute(
                    "SELECT raw_data FROM vulnerability_remediations WHERE id = ?",
                    (remediation_id,),
                )
                existing = cursor.fetchone()

                if existing is None:
                    new_count += 1
                else:
                    old_data = json.loads(existing["raw_data"]) if existing["raw_data"] else {}
                    if json.dumps(old_data, sort_keys=True) != json.dumps(
                        remediation, sort_keys=True
                    ):
                        updated_count += 1

                cursor.execute(
                    """
                    INSERT OR REPLACE INTO vulnerability_remediations (
                        id,
                        vulnerability_id,
                        vulnerable_asset_id,
                        severity,
                        detected_date,
                        sla_deadline_date,
                        remediation_date,
                        is_remediated_on_time,
                        integration_id,
                        integration_type,
                        status,
                        last_updated,
                        raw_data
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        remediation_id,
                        remediation.get("vulnerabilityId"),
                        remediation.get("vulnerableAssetId"),
                        remediation.get("severity"),
                        remediation.get("detectedDate"),
                        remediation.get("slaDeadlineDate"),
                        remediation.get("remediationDate"),
                        remediation.get("isRemediatedOnTime"),
                        remediation.get("integrationId"),
                        remediation.get("integrationType"),
                        remediation.get("status"),
                        current_time,
                        json.dumps(remediation),
                    ),
                )

                self._store_data_elements(
                    cursor,
                    "vulnerability_remediation",
                    remediation_id,
                    remediation,
                    current_time,
                )

            self.conn.commit()

            return {
                "new": new_count,
                "updated": updated_count,
                "total": len(remediations),
            }

    def get_all_vulnerabilities(self) -> List[Dict]:
        """Retrieve all vulnerabilities from the database"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT raw_data FROM vulnerabilities")
        rows = cursor.fetchall()
        return [json.loads(row['raw_data']) for row in rows]

    def get_all_vulnerability_remediations(self) -> List[Dict]:
        """Retrieve all vulnerability remediations from the database."""

        cursor = self.conn.cursor()
        cursor.execute("SELECT raw_data FROM vulnerability_remediations")
        rows = cursor.fetchall()
        return [json.loads(row["raw_data"]) for row in rows if row["raw_data"]]

    def get_last_update_time(self) -> Optional[str]:
        """Get the timestamp of the last database update"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT MAX(last_updated) as last_update FROM vulnerabilities")
        row = cursor.fetchone()
        return row['last_update'] if row else None

    def close(self) -> None:
        """Close database connection"""
        self.conn.close()
