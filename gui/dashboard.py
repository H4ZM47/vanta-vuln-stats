"""Dashboard widgets displaying vulnerability summary visuals."""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Dict, Iterable, Optional

from PySide6 import QtCore, QtWidgets
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure


class DashboardWidget(QtWidgets.QWidget):
    """Composite widget that renders KPI cards and charts."""

    SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

    def __init__(self, parent: Optional[QtWidgets.QWidget] = None) -> None:
        super().__init__(parent)

        self._kpi_labels: Dict[str, QtWidgets.QLabel] = {}

        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        layout.addLayout(self._build_kpi_row())
        layout.addLayout(self._build_charts())


    def _build_kpi_row(self) -> QtWidgets.QLayout:
        row_layout = QtWidgets.QHBoxLayout()
        row_layout.setSpacing(12)

        kpi_definitions = [
            ("total", "Total Vulnerabilities"),
            ("active", "Active"),
            ("fixable", "Fixable"),
            ("avg_cvss", "Avg. CVSS"),
        ]

        for key, label in kpi_definitions:
            frame = QtWidgets.QFrame()
            frame.setObjectName(f"kpi_{key}")
            frame.setFrameShape(QtWidgets.QFrame.Shape.StyledPanel)
            frame.setStyleSheet(
                "QFrame {"
                "  border-radius: 8px;"
                "  border: 1px solid palette(midlight);"
                "  background: palette(base);"
                "}"
            )

            frame_layout = QtWidgets.QVBoxLayout(frame)
            frame_layout.setContentsMargins(12, 8, 12, 8)

            title = QtWidgets.QLabel(label)
            title.setObjectName(f"kpi_title_{key}")
            title.setStyleSheet("font-size: 11pt; color: palette(mid);")

            value_label = QtWidgets.QLabel("0")
            value_label.setObjectName(f"kpi_value_{key}")
            value_label.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
            value_label.setStyleSheet("font-size: 20pt; font-weight: 600;")

            frame_layout.addWidget(title)
            frame_layout.addWidget(value_label)
            frame_layout.addStretch()

            self._kpi_labels[key] = value_label
            row_layout.addWidget(frame)

        row_layout.addStretch()
        return row_layout

    def _build_charts(self) -> QtWidgets.QLayout:
        grid = QtWidgets.QGridLayout()
        grid.setSpacing(12)

        self._severity_canvas = FigureCanvas(Figure(figsize=(4, 3)))
        self._severity_ax = self._severity_canvas.figure.add_subplot(111)
        self._severity_canvas.figure.tight_layout()

        self._integration_canvas = FigureCanvas(Figure(figsize=(4, 3)))
        self._integration_ax = self._integration_canvas.figure.add_subplot(111)
        self._integration_canvas.figure.tight_layout()

        self._trend_canvas = FigureCanvas(Figure(figsize=(8, 3)))
        self._trend_ax = self._trend_canvas.figure.add_subplot(111)
        self._trend_canvas.figure.tight_layout()

        self._severity_canvas.setSizePolicy(
            QtWidgets.QSizePolicy.Policy.Expanding, QtWidgets.QSizePolicy.Policy.Expanding
        )
        self._integration_canvas.setSizePolicy(
            QtWidgets.QSizePolicy.Policy.Expanding, QtWidgets.QSizePolicy.Policy.Expanding
        )
        self._trend_canvas.setSizePolicy(
            QtWidgets.QSizePolicy.Policy.Expanding, QtWidgets.QSizePolicy.Policy.Expanding
        )

        grid.addWidget(self._severity_canvas, 0, 0)
        grid.addWidget(self._integration_canvas, 0, 1)
        grid.addWidget(self._trend_canvas, 1, 0, 1, 2)

        return grid

    # Public API ---------------------------------------------------------

    def clear(self) -> None:
        """Reset all dashboard visuals."""
        for label in self._kpi_labels.values():
            label.setText("0")

        for axis in (self._severity_ax, self._integration_ax, self._trend_ax):
            axis.clear()
            axis.text(0.5, 0.5, "No data", ha="center", va="center")
        self._severity_canvas.draw_idle()
        self._integration_canvas.draw_idle()
        self._trend_canvas.draw_idle()

    def update_data(self, stats: Dict, vulnerabilities: Iterable[Dict]) -> None:
        """Update the dashboard with new statistics."""
        if not stats:
            self.clear()
            return

        self._update_kpis(stats, vulnerabilities)
        self._update_severity_chart(stats.get("by_severity", {}))
        self._update_integration_chart(stats.get("by_integration", {}))
        self._update_trend_chart(vulnerabilities)

    # Internal helpers ---------------------------------------------------

    def _update_kpis(self, stats: Dict, vulnerabilities: Iterable[Dict]) -> None:
        total = stats.get("total_count", 0)
        active = stats.get("active", 0)
        fixable = stats.get("fixable", 0)

        self._kpi_labels["total"].setText(str(total))
        self._kpi_labels["active"].setText(str(active))
        self._kpi_labels["fixable"].setText(str(fixable))

        cvss_scores = [
            vuln.get("cvssSeverityScore")
            for vuln in vulnerabilities
            if vuln.get("cvssSeverityScore") is not None
        ]
        if cvss_scores:
            avg_cvss = sum(cvss_scores) / len(cvss_scores)
            self._kpi_labels["avg_cvss"].setText(f"{avg_cvss:.1f}")
        else:
            self._kpi_labels["avg_cvss"].setText("–")

    def _update_severity_chart(self, severity_counts: Dict[str, int]) -> None:
        self._severity_ax.clear()
        values = []
        labels = []
        colors = []

        severity_palette = {
            "CRITICAL": "#dc3545",
            "HIGH": "#ffc107",
            "MEDIUM": "#ff9800",
            "LOW": "#4caf50",
        }

        for severity in self.SEVERITY_ORDER:
            count = severity_counts.get(severity, 0)
            if count:
                labels.append(severity.title())
                values.append(count)
                colors.append(severity_palette.get(severity, "#6c757d"))

        if values:
            wedges, texts, autotexts = self._severity_ax.pie(
                values,
                labels=labels,
                colors=colors,
                autopct="%1.0f%%",
                startangle=140,
                textprops={"color": "white", "weight": "bold"},
            )
            for text in texts:
                text.set_color("black")
            self._severity_ax.set_title("By Severity")
        else:
            self._severity_ax.text(0.5, 0.5, "No severity data", ha="center", va="center")
        self._severity_canvas.draw_idle()

    def _update_integration_chart(self, integration_counts: Dict[str, int]) -> None:
        self._integration_ax.clear()

        if not integration_counts:
            self._integration_ax.text(0.5, 0.5, "No integration data", ha="center", va="center")
            self._integration_canvas.draw_idle()
            return

        items = sorted(integration_counts.items(), key=lambda item: item[1], reverse=True)
        labels = [label or "Unknown" for label, _ in items]
        values = [value for _, value in items]

        bars = self._integration_ax.bar(labels, values, color="#007bff")
        self._integration_ax.set_title("By Integration Source")
        self._integration_ax.set_ylabel("Count")
        self._integration_ax.tick_params(axis="x", rotation=30, labelsize=8)
        self._integration_ax.set_ylim(0, max(values) * 1.2 if values else 1)

        for bar, value in zip(bars, values):
            self._integration_ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 0.1,
                str(value),
                ha="center",
                va="bottom",
                fontsize=8,
            )

        self._integration_canvas.draw_idle()

    def _update_trend_chart(self, vulnerabilities: Iterable[Dict]) -> None:
        self._trend_ax.clear()

        new_counter: Counter[str] = Counter()
        remediated_counter: Counter[str] = Counter()

        for vuln in vulnerabilities:
            first_detected = vuln.get("firstDetectedDate")
            if first_detected:
                month = self._month_bucket(first_detected)
                if month:
                    new_counter[month] += 1

            deactivated = (
                vuln.get("deactivateMetadata", {}) or {}
            ).get("deactivatedOnDate")
            if deactivated:
                month = self._month_bucket(deactivated)
                if month:
                    remediated_counter[month] += 1

        all_months = sorted(set(new_counter) | set(remediated_counter))

        if not all_months:
            self._trend_ax.text(0.5, 0.5, "No trend data", ha="center", va="center")
            self._trend_canvas.draw_idle()
            return

        new_values = [new_counter.get(month, 0) for month in all_months]
        rem_values = [remediated_counter.get(month, 0) for month in all_months]

        self._trend_ax.plot(all_months, new_values, marker="o", label="New")
        self._trend_ax.plot(all_months, rem_values, marker="o", label="Remediated")
        self._trend_ax.fill_between(all_months, new_values, alpha=0.1)
        self._trend_ax.fill_between(all_months, rem_values, alpha=0.1)
        self._trend_ax.set_title("Trend Over Time")
        self._trend_ax.set_ylabel("Count")
        self._trend_ax.set_xlabel("Month")
        self._trend_ax.legend()
        self._trend_ax.set_ylim(bottom=0)
        self._trend_ax.tick_params(axis="x", rotation=30, labelsize=8)

        self._trend_canvas.draw_idle()

    @staticmethod
    def _month_bucket(date_str: str) -> Optional[str]:
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None
        return dt.strftime("%Y-%m")
