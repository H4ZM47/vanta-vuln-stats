"""Detailed vulnerability inspector widget for the Vanta GUI."""

from __future__ import annotations

import html
import json
from datetime import datetime
from typing import Dict, Iterable, Optional, Union

from PySide6 import QtCore, QtGui, QtWidgets


class VulnerabilityDetailWidget(QtWidgets.QWidget):
    """Display detailed information about a selected vulnerability."""

    SEVERITY_COLORS = {
        "CRITICAL": "#dc3545",
        "HIGH": "#ffc107",
        "MEDIUM": "#ff9800",
        "LOW": "#4caf50",
    }

    def __init__(self, parent: Optional[QtWidgets.QWidget] = None) -> None:
        super().__init__(parent)
        self._build_ui()
        self._show_message("Select a vulnerability to view its details.")

    def _build_ui(self) -> None:
        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        self.stack = QtWidgets.QStackedWidget()
        layout.addWidget(self.stack)

        # Message/placeholder widget
        self.message_widget = QtWidgets.QWidget()
        message_layout = QtWidgets.QVBoxLayout(self.message_widget)
        message_layout.addStretch()
        self.message_label = QtWidgets.QLabel()
        self.message_label.setWordWrap(True)
        self.message_label.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        self.message_label.setStyleSheet("color: palette(mid);")
        message_layout.addWidget(self.message_label)
        message_layout.addStretch()
        self.stack.addWidget(self.message_widget)

        # Detailed content widget
        self.content_widget = QtWidgets.QWidget()
        content_layout = QtWidgets.QVBoxLayout(self.content_widget)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(12)

        # Header information
        header_layout = QtWidgets.QVBoxLayout()
        header_layout.setSpacing(4)

        title_row = QtWidgets.QHBoxLayout()
        title_row.setContentsMargins(0, 0, 0, 0)
        title_row.setSpacing(8)

        self.title_label = QtWidgets.QLabel()
        title_font = self.title_label.font()
        title_font.setPointSize(title_font.pointSize() + 2)
        title_font.setBold(True)
        self.title_label.setFont(title_font)
        self.title_label.setWordWrap(True)
        self.title_label.setTextInteractionFlags(QtCore.Qt.TextInteractionFlag.TextSelectableByMouse)
        title_row.addWidget(self.title_label, 1)

        self.severity_badge = QtWidgets.QLabel()
        self.severity_badge.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        self.severity_badge.setMinimumWidth(110)
        self.severity_badge.setStyleSheet("border-radius: 12px; padding: 4px 12px; font-weight: bold;")
        title_row.addWidget(self.severity_badge, 0)

        header_layout.addLayout(title_row)

        self.subtitle_label = QtWidgets.QLabel()
        subtitle_font = self.subtitle_label.font()
        subtitle_font.setPointSize(max(subtitle_font.pointSize() - 1, 8))
        self.subtitle_label.setFont(subtitle_font)
        self.subtitle_label.setStyleSheet("color: palette(mid);")
        self.subtitle_label.setWordWrap(True)
        self.subtitle_label.setTextInteractionFlags(QtCore.Qt.TextInteractionFlag.TextSelectableByMouse)
        self.subtitle_label.hide()
        header_layout.addWidget(self.subtitle_label)

        content_layout.addLayout(header_layout)

        self.tab_widget = QtWidgets.QTabWidget()
        content_layout.addWidget(self.tab_widget)

        # Summary tab
        self.summary_scroll = QtWidgets.QScrollArea()
        self.summary_scroll.setWidgetResizable(True)
        summary_container = QtWidgets.QWidget()
        summary_layout = QtWidgets.QVBoxLayout(summary_container)
        summary_layout.setSpacing(12)

        # Overview section
        overview_group = QtWidgets.QGroupBox("Overview")
        overview_layout = QtWidgets.QFormLayout(overview_group)
        overview_layout.setLabelAlignment(QtCore.Qt.AlignmentFlag.AlignRight)
        self.overview_labels: Dict[str, QtWidgets.QLabel] = {}
        overview_fields = [
            ("status", "Status"),
            ("fixable", "Fixable"),
            ("asset", "Asset"),
            ("integration", "Integration"),
            ("package", "Package"),
            ("source", "Source"),
            ("cvss", "CVSS Score"),
            ("scanner", "Scanner Score"),
        ]
        for key, label in overview_fields:
            value_label = QtWidgets.QLabel("—")
            value_label.setWordWrap(True)
            value_label.setTextInteractionFlags(QtCore.Qt.TextInteractionFlag.TextSelectableByMouse)
            overview_layout.addRow(f"{label}:", value_label)
            self.overview_labels[key] = value_label
        summary_layout.addWidget(overview_group)

        # Timeline section
        timeline_group = QtWidgets.QGroupBox("Timeline")
        timeline_layout = QtWidgets.QFormLayout(timeline_group)
        timeline_layout.setLabelAlignment(QtCore.Qt.AlignmentFlag.AlignRight)
        self.timeline_labels: Dict[str, QtWidgets.QLabel] = {}
        timeline_fields = [
            ("first_detected", "First Detected"),
            ("last_detected", "Last Detected"),
            ("source_detected", "Source Detected"),
            ("remediate_by", "Remediation Due"),
            ("deactivated_on", "Deactivated On"),
        ]
        for key, label in timeline_fields:
            value_label = QtWidgets.QLabel("—")
            value_label.setWordWrap(True)
            value_label.setTextInteractionFlags(QtCore.Qt.TextInteractionFlag.TextSelectableByMouse)
            timeline_layout.addRow(f"{label}:", value_label)
            self.timeline_labels[key] = value_label
        summary_layout.addWidget(timeline_group)

        # Description section
        description_group = QtWidgets.QGroupBox("Description")
        description_layout = QtWidgets.QVBoxLayout(description_group)
        self.description_browser = QtWidgets.QTextBrowser()
        self.description_browser.setOpenExternalLinks(True)
        self.description_browser.setMinimumHeight(120)
        description_layout.addWidget(self.description_browser)
        summary_layout.addWidget(description_group)

        # Remediation section
        remediation_group = QtWidgets.QGroupBox("Remediation Guidance")
        remediation_layout = QtWidgets.QVBoxLayout(remediation_group)
        self.remediation_browser = QtWidgets.QTextBrowser()
        self.remediation_browser.setOpenExternalLinks(True)
        self.remediation_browser.setMinimumHeight(100)
        remediation_layout.addWidget(self.remediation_browser)
        summary_layout.addWidget(remediation_group)

        # Related information
        related_group = QtWidgets.QGroupBox("Related Information")
        related_layout = QtWidgets.QVBoxLayout(related_group)
        self.related_vulns_label = QtWidgets.QLabel("No related vulnerabilities.")
        self.related_vulns_label.setWordWrap(True)
        self.related_vulns_label.setTextInteractionFlags(QtCore.Qt.TextInteractionFlag.TextSelectableByMouse)
        related_layout.addWidget(self.related_vulns_label)

        self.references_browser = QtWidgets.QTextBrowser()
        self.references_browser.setOpenExternalLinks(True)
        self.references_browser.setMinimumHeight(80)
        related_layout.addWidget(self.references_browser)
        summary_layout.addWidget(related_group)

        summary_layout.addStretch()
        self.summary_scroll.setWidget(summary_container)
        self.tab_widget.addTab(self.summary_scroll, "Summary")

        # Raw JSON tab
        self.json_edit = QtWidgets.QPlainTextEdit()
        self.json_edit.setReadOnly(True)
        font = QtGui.QFontDatabase.systemFont(QtGui.QFontDatabase.SystemFont.FixedFont)
        self.json_edit.setFont(font)
        self.tab_widget.addTab(self.json_edit, "Raw JSON")

        self.stack.addWidget(self.content_widget)

    # Public API ---------------------------------------------------------
    def show_vulnerability(self, vulnerability: Optional[Dict]) -> None:
        """Display the provided vulnerability details."""
        if not vulnerability:
            self._show_message("Select a vulnerability to view its details.")
            return

        self.stack.setCurrentWidget(self.content_widget)

        name = vulnerability.get("name") or vulnerability.get("id") or "Unknown vulnerability"
        self.title_label.setText(name)

        subtitle_parts = [vulnerability.get("id"), vulnerability.get("packageIdentifier")]
        subtitle_parts = [part for part in subtitle_parts if part]
        if subtitle_parts:
            self.subtitle_label.setText(" • ".join(subtitle_parts))
            self.subtitle_label.show()
        else:
            self.subtitle_label.clear()
            self.subtitle_label.hide()

        severity = (vulnerability.get("severity") or "UNKNOWN").upper()
        self._update_severity_badge(severity)

        self._set_overview_value("status", self._format_status(vulnerability))
        self._set_overview_value("fixable", "Yes" if vulnerability.get("isFixable") else "No")
        self._set_overview_value("asset", vulnerability.get("targetId"))
        integration = vulnerability.get("integrationId") or vulnerability.get("integration_id")
        self._set_overview_value("integration", integration)
        self._set_overview_value("package", vulnerability.get("packageIdentifier"))
        self._set_overview_value("source", vulnerability.get("scanSource"))
        self._set_overview_value("cvss", self._format_score(vulnerability.get("cvssSeverityScore")))
        self._set_overview_value("scanner", self._format_score(vulnerability.get("scannerScore")))

        self._set_timeline_value("first_detected", vulnerability.get("firstDetectedDate"))
        self._set_timeline_value("last_detected", vulnerability.get("lastDetectedDate"))
        self._set_timeline_value("source_detected", vulnerability.get("sourceDetectedDate"))
        self._set_timeline_value("remediate_by", vulnerability.get("remediateByDate"))
        deactivated_on = None
        deactivate_metadata = vulnerability.get("deactivateMetadata") or {}
        if isinstance(deactivate_metadata, dict):
            deactivated_on = deactivate_metadata.get("deactivatedOnDate")
        self._set_timeline_value("deactivated_on", deactivated_on)

        description = (
            vulnerability.get("description")
            or vulnerability.get("details")
            or vulnerability.get("summary")
            or ""
        )
        self._set_rich_text(self.description_browser, description, "No description available.")

        remediation = (
            vulnerability.get("recommendation")
            or vulnerability.get("remediation")
            or vulnerability.get("remediationSteps")
            or vulnerability.get("solution")
            or ""
        )
        self._set_rich_text(
            self.remediation_browser,
            remediation,
            "No remediation guidance available.",
        )

        related_vulns = vulnerability.get("relatedVulns") or vulnerability.get("related_vulns")
        self.related_vulns_label.setText(self._format_related_vulns(related_vulns))

        related_urls = vulnerability.get("relatedUrls") or vulnerability.get("related_urls")
        self._set_related_urls(related_urls)

        self.json_edit.setPlainText(json.dumps(vulnerability, indent=2, sort_keys=True))

    def show_selection_message(self, count: int) -> None:
        """Display a helper message when multiple rows are selected."""
        if count <= 0:
            self.show_vulnerability(None)
        else:
            self._show_message(
                f"{count} vulnerabilities selected. Select a single row to view details.",
            )

    # Internal helpers ---------------------------------------------------
    def _show_message(self, text: str) -> None:
        self.message_label.setText(text)
        self.stack.setCurrentWidget(self.message_widget)
        self.json_edit.clear()

    def _update_severity_badge(self, severity: str) -> None:
        color = self.SEVERITY_COLORS.get(severity, "#6c757d")
        self.severity_badge.setText(severity.title() if severity else "Unknown")
        self.severity_badge.setStyleSheet(
            "background-color: {color}; color: white; border-radius: 12px; padding: 4px 12px; font-weight: bold;".format(
                color=color
            )
        )

    def _set_overview_value(self, key: str, value: Optional[Union[str, float]]) -> None:
        label = self.overview_labels.get(key)
        if not label:
            return
        text = self._stringify(value)
        label.setText(text if text else "—")

    def _set_timeline_value(self, key: str, value: Optional[str]) -> None:
        label = self.timeline_labels.get(key)
        if not label:
            return
        label.setText(self._format_datetime(value))

    def _set_rich_text(self, widget: QtWidgets.QTextBrowser, value: Union[str, Iterable[str], Dict, None], fallback: str) -> None:
        text = self._stringify(value)
        if text:
            widget.setPlainText(text)
        else:
            widget.setPlainText(fallback)

    def _set_related_urls(self, value: Optional[Union[Iterable, Dict]]) -> None:
        if not value:
            self.references_browser.setHtml("<p>No related references.</p>")
            return

        html_parts = []
        items: Iterable
        if isinstance(value, dict):
            items = value.values()
        elif isinstance(value, (str, bytes)):
            items = [value]
        else:
            items = value

        for item in items:
            url = None
            label = None
            if isinstance(item, dict):
                url = item.get("url") or item.get("href") or item.get("link")
                label = item.get("label") or item.get("title")
            else:
                url = str(item)
            if not url:
                continue
            qt_url = QtCore.QUrl(url)
            if not qt_url.isValid():
                qt_url = QtCore.QUrl.fromUserInput(url)
            href = qt_url.toString()
            display = label or qt_url.toDisplayString()
            html_parts.append(f'<a href="{html.escape(href)}">{html.escape(display)}</a>')

        if html_parts:
            self.references_browser.setHtml("<br>".join(html_parts))
        else:
            self.references_browser.setHtml("<p>No related references.</p>")

    def _format_related_vulns(self, value: Optional[Union[Iterable, Dict]]) -> str:
        if not value:
            return "No related vulnerabilities."

        if isinstance(value, dict):
            items = list(value.values())
        elif isinstance(value, (str, bytes)):
            items = [value]
        else:
            items = list(value)
        items = [self._stringify(item) for item in items if self._stringify(item)]
        if not items:
            return "No related vulnerabilities."
        bullet_list = "\n".join(f"• {item}" for item in items)
        return bullet_list

    @staticmethod
    def _stringify(value: Optional[Union[str, float, int, Iterable, Dict]]) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
        if isinstance(value, dict):
            parts = [f"{k}: {v}" for k, v in value.items() if v]
            return "\n".join(parts)
        if isinstance(value, Iterable):
            items = [str(item).strip() for item in value if item]
            return "\n".join(items)
        return str(value)

    @staticmethod
    def _format_score(value: Optional[Union[str, float, int]]) -> str:
        if value is None:
            return "—"
        if isinstance(value, (int, float)):
            return f"{value:.1f}"
        return str(value)

    @staticmethod
    def _format_status(vulnerability: Dict) -> str:
        is_remediated = bool(vulnerability.get("deactivateMetadata"))
        status = "Remediated" if is_remediated else "Active"
        reason = None
        metadata = vulnerability.get("deactivateMetadata")
        if isinstance(metadata, dict):
            reason = metadata.get("reason")
        if reason:
            status = f"{status} ({reason})"
        return status

    @staticmethod
    def _format_datetime(value: Optional[str]) -> str:
        if not value:
            return "—"
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return value
        return dt.strftime("%Y-%m-%d %H:%M UTC")

