#!/usr/bin/env python3
"""
Vanta Vulnerability Statistics Utility

This utility fetches vulnerability data from Vanta API and provides comprehensive
statistics with filtering capabilities.
"""

import argparse
import json
import os
import sys
import sqlite3
import time
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

import requests


class VantaAPIClient:
    """Client for interacting with Vanta API"""

    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.auth_url = "https://api.vanta.com"
        self.base_url = "https://api.vanta.com/v1"
        self.access_token = None

    def authenticate(self) -> None:
        """Authenticate and get access token"""
        url = f"{self.auth_url}/oauth/token"
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "vanta-api.all:read",
            "grant_type": "client_credentials"
        }
        headers = {"Content-Type": "application/json"}

        try:
            response = requests.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            self.access_token = data.get("access_token")
            if not self.access_token:
                raise Exception("No access token in response")
        except requests.exceptions.RequestException as e:
            raise Exception(f"Authentication failed: {str(e)}")

    def get_vulnerabilities(self, page_size: int = 100, batch_callback: Optional[Callable[[List[Dict]], None]] = None, **filters) -> List[Dict]:
        """
        Fetch all vulnerabilities with optional filters

        Args:
            page_size: Number of vulnerabilities per page
            batch_callback: Optional callback function called with each batch of vulnerabilities
            **filters: Additional API filters (severity, isDeactivated, etc.)

        Returns:
            List of all vulnerabilities
        """
        if not self.access_token:
            self.authenticate()

        all_vulnerabilities = []
        page_cursor = None

        while True:
            url = f"{self.base_url}/vulnerabilities"
            params = {"pageSize": page_size}

            # Add filters
            for key, value in filters.items():
                if value is not None:
                    params[key] = value

            if page_cursor:
                params["pageCursor"] = page_cursor

            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json"
            }

            try:
                response = requests.get(url, params=params, headers=headers)

                # Handle rate limiting with exponential backoff
                if response.status_code == 429:
                    retry_after = int(response.headers.get('Retry-After', 60))
                    print(f"Rate limit hit. Waiting {retry_after} seconds...", file=sys.stderr)
                    time.sleep(retry_after)
                    continue  # Retry this request

                response.raise_for_status()
                data = response.json()

                # The API returns a "results" object containing "data" and "pageInfo"
                results_obj = data.get("results", {})
                vulnerabilities_list = results_obj.get("data", [])
                all_vulnerabilities.extend(vulnerabilities_list)

                # Call batch callback if provided
                if batch_callback and vulnerabilities_list:
                    batch_callback(vulnerabilities_list)

                # Check for next page in pageInfo
                page_info = results_obj.get("pageInfo", {})
                has_next_page = page_info.get("hasNextPage", False)
                page_cursor = page_info.get("endCursor") if has_next_page else None

                # Add small delay between requests to avoid rate limiting
                time.sleep(0.5)

                if not has_next_page:
                    break

            except requests.exceptions.RequestException as e:
                if '429' in str(e):
                    # Rate limit error - wait and retry
                    print(f"Rate limit hit. Waiting 60 seconds...", file=sys.stderr)
                    time.sleep(60)
                    continue
                raise Exception(f"Failed to fetch vulnerabilities: {str(e)}")

        return all_vulnerabilities


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

    def get_all_vulnerabilities(self) -> List[Dict]:
        """Retrieve all vulnerabilities from the database"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT raw_data FROM vulnerabilities")
        rows = cursor.fetchall()
        return [json.loads(row['raw_data']) for row in rows]

    def get_last_update_time(self) -> Optional[str]:
        """Get the timestamp of the last database update"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT MAX(last_updated) as last_update FROM vulnerabilities")
        row = cursor.fetchone()
        return row['last_update'] if row else None

    def close(self) -> None:
        """Close database connection"""
        self.conn.close()


class VulnerabilityStats:
    """Process and generate statistics for vulnerabilities"""

    def __init__(self, vulnerabilities: List[Dict]):
        self.vulnerabilities = vulnerabilities

    def filter_vulnerabilities(
        self,
        date_identified_start: Optional[str] = None,
        date_identified_end: Optional[str] = None,
        date_remediated_start: Optional[str] = None,
        date_remediated_end: Optional[str] = None,
        severity: Optional[List[str]] = None,
        cve: Optional[str] = None,
        asset_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Filter vulnerabilities based on criteria

        Args:
            date_identified_start: Start date for firstDetectedDate (ISO format)
            date_identified_end: End date for firstDetectedDate (ISO format)
            date_remediated_start: Start date for remediation
            date_remediated_end: End date for remediation
            severity: List of severity levels (CRITICAL, HIGH, MEDIUM, LOW)
            cve: CVE identifier to filter by
            asset_id: Asset ID to filter by

        Returns:
            Filtered list of vulnerabilities
        """
        filtered = self.vulnerabilities

        # Filter by date identified
        if date_identified_start:
            start_dt = datetime.fromisoformat(date_identified_start.replace('Z', '+00:00'))
            filtered = [
                v for v in filtered
                if v.get('firstDetectedDate') and
                datetime.fromisoformat(v['firstDetectedDate'].replace('Z', '+00:00')) >= start_dt
            ]

        if date_identified_end:
            end_dt = datetime.fromisoformat(date_identified_end.replace('Z', '+00:00'))
            filtered = [
                v for v in filtered
                if v.get('firstDetectedDate') and
                datetime.fromisoformat(v['firstDetectedDate'].replace('Z', '+00:00')) <= end_dt
            ]

        # Filter by date remediated (using remediateByDate or deactivation date)
        if date_remediated_start or date_remediated_end:
            def get_remediation_date(vuln):
                # Check if deactivated (considered remediated)
                if vuln.get('deactivateMetadata', {}).get('deactivatedOnDate'):
                    return vuln['deactivateMetadata']['deactivatedOnDate']
                return None

            if date_remediated_start:
                start_dt = datetime.fromisoformat(date_remediated_start.replace('Z', '+00:00'))
                filtered = [
                    v for v in filtered
                    if get_remediation_date(v) and
                    datetime.fromisoformat(get_remediation_date(v).replace('Z', '+00:00')) >= start_dt
                ]

            if date_remediated_end:
                end_dt = datetime.fromisoformat(date_remediated_end.replace('Z', '+00:00'))
                filtered = [
                    v for v in filtered
                    if get_remediation_date(v) and
                    datetime.fromisoformat(get_remediation_date(v).replace('Z', '+00:00')) <= end_dt
                ]

        # Filter by severity
        if severity:
            severity_upper = [s.upper() for s in severity]
            filtered = [v for v in filtered if v.get('severity') in severity_upper]

        # Filter by CVE
        if cve:
            cve_upper = cve.upper()
            filtered = [
                v for v in filtered
                if cve_upper in v.get('name', '').upper() or
                cve_upper in str(v.get('relatedVulns', [])).upper()
            ]

        # Filter by asset ID
        if asset_id:
            filtered = [v for v in filtered if v.get('targetId') == asset_id]

        return filtered

    def generate_statistics(self, vulnerabilities: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """
        Generate comprehensive statistics for vulnerabilities

        Args:
            vulnerabilities: Optional filtered list, uses all if not provided

        Returns:
            Dictionary containing various statistics
        """
        if vulnerabilities is None:
            vulnerabilities = self.vulnerabilities

        stats = {
            'total_count': len(vulnerabilities),
            'by_severity': defaultdict(int),
            'by_integration': defaultdict(int),
            'fixable': 0,
            'not_fixable': 0,
            'deactivated': 0,
            'active': 0,
            'unique_assets': set(),
            'unique_cves': set(),
            'severity_scores': {
                'critical': [],
                'high': [],
                'medium': [],
                'low': []
            }
        }

        for vuln in vulnerabilities:
            # Count by severity
            severity = vuln.get('severity', 'UNKNOWN')
            stats['by_severity'][severity] += 1

            # Count by integration source
            integration = vuln.get('integrationId', 'UNKNOWN')
            stats['by_integration'][integration] += 1

            # Count fixable
            if vuln.get('isFixable'):
                stats['fixable'] += 1
            else:
                stats['not_fixable'] += 1

            # Count deactivated
            if vuln.get('deactivateMetadata'):
                stats['deactivated'] += 1
            else:
                stats['active'] += 1

            # Track unique assets
            if vuln.get('targetId'):
                stats['unique_assets'].add(vuln['targetId'])

            # Track unique CVEs
            if vuln.get('name'):
                stats['unique_cves'].add(vuln['name'])

            # Collect CVSS scores by severity
            cvss_score = vuln.get('cvssSeverityScore')
            if cvss_score and severity:
                stats['severity_scores'][severity.lower()].append(cvss_score)

        # Convert sets to counts
        stats['unique_assets_count'] = len(stats['unique_assets'])
        stats['unique_cves_count'] = len(stats['unique_cves'])
        del stats['unique_assets']  # Remove set (not JSON serializable)
        del stats['unique_cves']  # Remove set (not JSON serializable)

        # Calculate average CVSS scores
        stats['average_cvss_by_severity'] = {}
        for severity, scores in stats['severity_scores'].items():
            if scores:
                stats['average_cvss_by_severity'][severity] = sum(scores) / len(scores)
        del stats['severity_scores']  # Remove raw scores

        # Convert defaultdicts to regular dicts
        stats['by_severity'] = dict(stats['by_severity'])
        stats['by_integration'] = dict(stats['by_integration'])

        return stats

    def print_statistics(self, stats: Dict[str, Any]) -> None:
        """Print statistics in a human-readable format"""
        print("\n" + "="*60)
        print("VANTA VULNERABILITY STATISTICS")
        print("="*60)

        print(f"\nTotal Vulnerabilities: {stats['total_count']}")
        print(f"  Active: {stats['active']}")
        print(f"  Deactivated: {stats['deactivated']}")

        print(f"\nUnique CVEs: {stats['unique_cves_count']}")
        print(f"Unique Affected Assets: {stats['unique_assets_count']}")

        print(f"\nFixability:")
        print(f"  Fixable: {stats['fixable']}")
        print(f"  Not Fixable: {stats['not_fixable']}")

        print(f"\nBy Severity:")
        for severity in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']:
            count = stats['by_severity'].get(severity, 0)
            if count > 0:
                avg_cvss = stats['average_cvss_by_severity'].get(severity.lower(), 0)
                print(f"  {severity}: {count} (avg CVSS: {avg_cvss:.2f})")

        if stats['by_integration']:
            print(f"\nBy Integration Source:")
            for integration, count in sorted(stats['by_integration'].items(), key=lambda x: x[1], reverse=True):
                print(f"  {integration}: {count}")

        print("\n" + "="*60 + "\n")


def load_credentials(env_file: str) -> tuple:
    """Load credentials from .env file"""
    if not os.path.exists(env_file):
        raise Exception(f"Credentials file not found: {env_file}")

    with open(env_file, 'r') as f:
        content = f.read()
        data = json.loads(content)
        return data.get('client_id'), data.get('client_secret')


def main():
    parser = argparse.ArgumentParser(
        description='Vanta Vulnerability Statistics Utility',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Get all vulnerability statistics
  python vanta_vuln_stats.py

  # Filter by severity
  python vanta_vuln_stats.py --severity CRITICAL HIGH

  # Filter by date identified
  python vanta_vuln_stats.py --date-identified-start 2024-01-01T00:00:00Z

  # Filter by CVE
  python vanta_vuln_stats.py --cve CVE-2024-1234

  # Multiple filters
  python vanta_vuln_stats.py --severity CRITICAL --date-identified-start 2024-01-01T00:00:00Z

  # Export to JSON
  python vanta_vuln_stats.py --output stats.json
        """
    )

    parser.add_argument(
        '--credentials',
        default='VANTA_API_CREDENTIALS.env',
        help='Path to credentials file (default: VANTA_API_CREDENTIALS.env)'
    )
    parser.add_argument(
        '--database',
        default='vanta_vulnerabilities.db',
        help='Path to SQLite database file (default: vanta_vulnerabilities.db)'
    )
    parser.add_argument(
        '--sync',
        action='store_true',
        help='Sync data from Vanta API (fetch fresh data)'
    )
    parser.add_argument(
        '--use-cache',
        action='store_true',
        help='Use cached data from database instead of fetching from API'
    )

    # Filter arguments
    parser.add_argument(
        '--date-identified-start',
        help='Filter vulnerabilities identified after this date (ISO format: 2024-01-01T00:00:00Z)'
    )
    parser.add_argument(
        '--date-identified-end',
        help='Filter vulnerabilities identified before this date (ISO format: 2024-01-01T00:00:00Z)'
    )
    parser.add_argument(
        '--date-remediated-start',
        help='Filter vulnerabilities remediated after this date (ISO format: 2024-01-01T00:00:00Z)'
    )
    parser.add_argument(
        '--date-remediated-end',
        help='Filter vulnerabilities remediated before this date (ISO format: 2024-01-01T00:00:00Z)'
    )
    parser.add_argument(
        '--severity',
        nargs='+',
        choices=['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
        help='Filter by severity level(s)'
    )
    parser.add_argument(
        '--cve',
        help='Filter by CVE identifier (e.g., CVE-2024-1234)'
    )
    parser.add_argument(
        '--asset-id',
        help='Filter by asset ID'
    )

    # Output options
    parser.add_argument(
        '--output',
        help='Output file for JSON statistics (default: print to console)'
    )
    parser.add_argument(
        '--export-vulnerabilities',
        help='Export filtered vulnerabilities to JSON file'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Show detailed progress information'
    )

    args = parser.parse_args()

    try:
        # Initialize database
        db = VulnerabilityDatabase(args.database)

        # Determine if we need to fetch from API or use cache
        use_cache = args.use_cache
        needs_sync = args.sync

        if not use_cache and not needs_sync:
            # Check if we have cached data
            last_update = db.get_last_update_time()
            if last_update:
                if args.verbose:
                    print(f"Database last updated: {last_update}")
                    print("Using cached data. Use --sync to fetch fresh data from API.")
                use_cache = True
            else:
                if args.verbose:
                    print("No cached data found. Fetching from API...")
                needs_sync = True

        vulnerabilities = []

        if needs_sync:
            # Load credentials and fetch from API
            if args.verbose:
                print(f"Loading credentials from {args.credentials}...")
            client_id, client_secret = load_credentials(args.credentials)

            if not client_id or not client_secret:
                raise Exception("Missing client_id or client_secret in credentials file")

            # Initialize API client
            if args.verbose:
                print("Authenticating with Vanta API...")
            client = VantaAPIClient(client_id, client_secret)
            client.authenticate()

            # Setup concurrent batch writing
            batch_buffer = []
            batch_lock = Lock()
            total_written = 0
            executor = ThreadPoolExecutor(max_workers=4)
            futures = []

            def write_batch(batch: List[Dict]) -> Dict[str, int]:
                """Write a batch of vulnerabilities to database"""
                return db.store_vulnerabilities(batch, track_changes=True)

            def batch_callback(vulnerabilities_batch: List[Dict]):
                """Called when a batch of vulnerabilities is fetched"""
                nonlocal batch_buffer, total_written

                with batch_lock:
                    batch_buffer.extend(vulnerabilities_batch)

                    # If we have 100 or more, submit a write task
                    if len(batch_buffer) >= 100:
                        batch_to_write = batch_buffer[:100]
                        batch_buffer = batch_buffer[100:]

                        future = executor.submit(write_batch, batch_to_write)
                        futures.append(future)
                        total_written += len(batch_to_write)

                        if args.verbose:
                            print(f"Queued batch for writing ({total_written} vulnerabilities queued so far)...")

            # Fetch active vulnerabilities with concurrent batch writing
            if args.verbose:
                print("Fetching active vulnerabilities from API with concurrent batch writes...")
            active_vulnerabilities = client.get_vulnerabilities(batch_callback=batch_callback)

            # Fetch deactivated vulnerabilities
            if args.verbose:
                print("Fetching deactivated vulnerabilities from API...")
            deactivated_vulnerabilities = client.get_vulnerabilities(batch_callback=batch_callback, isDeactivated=True)

            # Write any remaining vulnerabilities in the buffer
            if batch_buffer:
                future = executor.submit(write_batch, batch_buffer)
                futures.append(future)
                if args.verbose:
                    print(f"Queued final batch ({len(batch_buffer)} vulnerabilities)...")

            # Combine for total count
            vulnerabilities = active_vulnerabilities + deactivated_vulnerabilities

            # Wait for all writes to complete and aggregate stats
            if args.verbose:
                print("Waiting for all database writes to complete...")

            executor.shutdown(wait=True)

            total_stats = {'new': 0, 'updated': 0, 'remediated': 0, 'total': 0}
            for future in futures:
                batch_stats = future.result()
                total_stats['new'] += batch_stats.get('new', 0)
                total_stats['updated'] += batch_stats.get('updated', 0)
                total_stats['remediated'] += batch_stats.get('remediated', 0)
                total_stats['total'] += batch_stats.get('total', 0)

            if args.verbose or args.sync:
                print(f"\nSync Summary:")
                print(f"  Total: {total_stats['total']}")
                print(f"  New: {total_stats['new']}")
                print(f"  Updated: {total_stats['updated']}")
                print(f"  Remediated: {total_stats['remediated']}")
                print()
        else:
            # Use cached data
            if args.verbose:
                print("Loading vulnerabilities from database...")
            vulnerabilities = db.get_all_vulnerabilities()

            if args.verbose:
                print(f"Loaded {len(vulnerabilities)} vulnerabilities from cache")

        # Create stats processor
        stats_processor = VulnerabilityStats(vulnerabilities)

        # Apply filters
        filtered_vulnerabilities = stats_processor.filter_vulnerabilities(
            date_identified_start=args.date_identified_start,
            date_identified_end=args.date_identified_end,
            date_remediated_start=args.date_remediated_start,
            date_remediated_end=args.date_remediated_end,
            severity=args.severity,
            cve=args.cve,
            asset_id=args.asset_id
        )

        if args.verbose and len(filtered_vulnerabilities) != len(vulnerabilities):
            print(f"Filtered to {len(filtered_vulnerabilities)} vulnerabilities")

        # Generate statistics
        stats = stats_processor.generate_statistics(filtered_vulnerabilities)

        # Output results
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(stats, f, indent=2)
            print(f"Statistics exported to {args.output}")
        else:
            stats_processor.print_statistics(stats)

        # Export filtered vulnerabilities if requested
        if args.export_vulnerabilities:
            with open(args.export_vulnerabilities, 'w') as f:
                json.dump(filtered_vulnerabilities, f, indent=2)
            print(f"Vulnerabilities exported to {args.export_vulnerabilities}")

        # Close database connection
        db.close()

    except Exception as e:
        import traceback
        print(f"Error: {str(e)}", file=sys.stderr)
        if args.verbose:
            traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
