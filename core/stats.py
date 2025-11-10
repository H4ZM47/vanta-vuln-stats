"""
Vulnerability Statistics

This module provides functionality for filtering and generating statistics
from vulnerability data.
"""

from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Any


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
            severity_value = vuln.get('severity') or 'UNKNOWN'
            stats['by_severity'][severity_value] += 1

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
            severity_key = severity_value.lower()
            if cvss_score is not None:
                stats['severity_scores'].setdefault(severity_key, []).append(cvss_score)

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
