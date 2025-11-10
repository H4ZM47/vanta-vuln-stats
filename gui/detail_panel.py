"""Detail panel for displaying vulnerability metadata."""

from __future__ import annotations

import html
from datetime import datetime
from typing import Dict, Optional

from PySide6 import QtWidgets


class VulnerabilityDetailPanel(QtWidgets.QTextBrowser):
    """Rich-text panel that renders vulnerability details."""

    def __init__(self, parent: Optional[QtWidgets.QWidget] = None) -> None:
        super().__init__(parent)
        self.setOpenExternalLinks(True)
        self.setReadOnly(True)
        self.setFrameShape(QtWidgets.QFrame.Shape.StyledPanel)
        self.setObjectName("vulnerabilityDetailPanel")
        self.setStyleSheet("QTextBrowser { padding: 12px; }")
        self._show_placeholder()

    def display_vulnerability(self, vulnerability: Optional[Dict]) -> None:
        """Render the given vulnerability in the panel."""
        if not vulnerability:
            self._show_placeholder()
            return

        severity = vulnerability.get("severity", "Unknown")
        severity_badge = self._severity_badge(severity)
        status = "Remediated" if vulnerability.get("deactivateMetadata") else "Active"
        fixable = "Yes" if vulnerability.get("isFixable") else "No"

        fields = {
            "ID": vulnerability.get("id", "N/A"),
            "Asset": vulnerability.get("targetId", "N/A"),
            "Integration": vulnerability.get("integrationId", "Unknown"),
            "Source": vulnerability.get("scanSource", "Unknown"),
            "Status": status,
            "Fixable": fixable,
            "CVSS": self._format_score(vulnerability.get("cvssSeverityScore")),
            "Scanner Score": self._format_score(vulnerability.get("scannerScore")),
        }

        dates = {
            "Created": self._format_datetime(vulnerability.get("createdAt")),
            "First Detected": self._format_datetime(vulnerability.get("firstDetectedDate")),
            "Last Detected": self._format_datetime(vulnerability.get("lastDetectedDate")),
            "Remediated": self._format_datetime(
                (vulnerability.get("deactivateMetadata") or {}).get("deactivatedOnDate")
            ),
        }

        related_vulns = vulnerability.get("relatedVulns")
        related_section = ""
        if related_vulns:
            related_items = "".join(
                f"<li>{html.escape(str(item))}</li>" for item in related_vulns
            )
            related_section = f"<h4>Related Vulnerabilities</h4><ul>{related_items}</ul>"

        external_url = vulnerability.get("externalUrl")
        link_section = ""
        if external_url:
            safe_url = html.escape(external_url)
            link_section = f'<p><a href="{safe_url}">Open in Vanta ↗</a></p>'

        description = vulnerability.get("description") or vulnerability.get("details")
        description_html = (
            f"<h4>Description</h4><p>{html.escape(description)}</p>"
            if description
            else ""
        )

        html_content = f"""
            <h2>{html.escape(vulnerability.get('name', 'Unnamed Vulnerability'))}</h2>
            <p>{severity_badge}</p>
            <table cellspacing="0" cellpadding="4">
                {''.join(f'<tr><th align="left">{html.escape(label)}</th><td>{html.escape(str(value))}</td></tr>' for label, value in fields.items())}
            </table>
            <h4>Key Dates</h4>
            <table cellspacing="0" cellpadding="4">
                {''.join(f'<tr><th align="left">{html.escape(label)}</th><td>{html.escape(value)}</td></tr>' for label, value in dates.items())}
            </table>
            {description_html}
            {related_section}
            {link_section}
        """

        self.setHtml(html_content)

    def display_selection_summary(self, count: int) -> None:
        """Show message when multiple vulnerabilities are selected."""
        self.setHtml(
            f"<h3>{count} vulnerabilities selected</h3>"
            "<p>Use the context menu for bulk operations.</p>"
        )

    # Helpers -------------------------------------------------------------

    def _show_placeholder(self) -> None:
        self.setHtml(
            "<h3>No vulnerability selected</h3>"
            "<p>Select a vulnerability from the table to view its details.</p>"
        )

    @staticmethod
    def _format_datetime(value: Optional[str]) -> str:
        if not value:
            return "—"
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
        return dt.strftime("%Y-%m-%d %H:%M")

    @staticmethod
    def _format_score(value: Optional[float]) -> str:
        if value is None:
            return "—"
        try:
            return f"{float(value):.1f}"
        except (TypeError, ValueError):
            return str(value)

    @staticmethod
    def _severity_badge(severity: str) -> str:
        colors = {
            "CRITICAL": "#dc3545",
            "HIGH": "#ffc107",
            "MEDIUM": "#ff9800",
            "LOW": "#4caf50",
        }
        color = colors.get(severity.upper(), "#6c757d")
        return (
            f'<span style="display:inline-block;padding:4px 8px;'
            f'border-radius:12px;background:{color};color:#fff;font-weight:600;">{html.escape(severity.title())}</span>'
        )
