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
from typing import Dict, List, Optional, Any
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

# Import core business logic from the core module
from core import VantaAPIClient, VulnerabilityDatabase, VulnerabilityStats


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

            # Fetch vulnerability remediations
            if args.verbose:
                print("Fetching vulnerability remediations from API...")

            remediation_buffer: List[Dict] = []
            remediation_lock = Lock()
            remediation_futures: List[Any] = []

            def remediation_write_batch(batch: List[Dict]) -> Dict[str, int]:
                return db.store_vulnerability_remediations(batch)

            def remediation_batch_callback(batch: List[Dict]) -> None:
                nonlocal remediation_buffer
                with remediation_lock:
                    remediation_buffer.extend(batch)
                    if len(remediation_buffer) >= 100:
                        batch_to_write = remediation_buffer[:100]
                        remediation_buffer = remediation_buffer[100:]
                        remediation_future = executor.submit(
                            remediation_write_batch, batch_to_write
                        )
                        remediation_futures.append(remediation_future)

            # Need a fresh executor because the previous one has been shut down
            executor = ThreadPoolExecutor(max_workers=4)

            remediations = client.get_vulnerability_remediations(
                batch_callback=remediation_batch_callback
            )

            if remediation_buffer:
                remediation_future = executor.submit(
                    remediation_write_batch, remediation_buffer
                )
                remediation_futures.append(remediation_future)

            executor.shutdown(wait=True)

            remediation_stats = {"new": 0, "updated": 0, "total": 0}
            for remediation_future in remediation_futures:
                batch_stats = remediation_future.result()
                remediation_stats["new"] += batch_stats.get("new", 0)
                remediation_stats["updated"] += batch_stats.get("updated", 0)
                remediation_stats["total"] += batch_stats.get("total", 0)

            if args.verbose or args.sync:
                print(f"\nSync Summary:")
                print(f"  Total: {total_stats['total']}")
                print(f"  New: {total_stats['new']}")
                print(f"  Updated: {total_stats['updated']}")
                print(f"  Remediated: {total_stats['remediated']}")
                print(f"  Remediation Records Synced: {remediation_stats['total']}")
                print(f"    New Remediations: {remediation_stats['new']}")
                print(f"    Updated Remediations: {remediation_stats['updated']}")
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
