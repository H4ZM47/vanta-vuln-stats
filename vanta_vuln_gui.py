#!/usr/bin/env python3
"""
Qt graphical interface for the Vanta Vulnerability Statistics utility.

This GUI wraps the existing API/database/statistics logic provided by
`vanta_vuln_stats.py` and makes it easier to sync data, explore cached
results, and apply filters without using the command line.
"""

import json
import os
import sys
from typing import Dict, List, Optional

from PySide6 import QtCore, QtGui, QtWidgets

from vanta_vuln_stats import (
    VantaAPIClient,
    VulnerabilityDatabase,
    VulnerabilityStats,
    load_credentials,
)


class DataWorker(QtCore.QObject):
    """Background worker that loads data from the cache or syncs from the API."""

    finished = QtCore.Signal(list, dict)
    progress = QtCore.Signal(str)
    error = QtCore.Signal(str)

    def __init__(self, mode: str, database_path: str, credentials_path: str):
        super().__init__()
        self.mode = mode
        self.database_path = database_path
        self.credentials_path = credentials_path

    @QtCore.Slot()
    def run(self) -> None:
        """Execute the selected operation in a background thread."""
        db: Optional[VulnerabilityDatabase] = None
        try:
            db = VulnerabilityDatabase(self.database_path)
            vulnerabilities: List[Dict] = []

            if self.mode == "cache":
                self.progress.emit(f"Loading cached data from {self.database_path}...")
                vulnerabilities = db.get_all_vulnerabilities()
                summary = {"source": "cache", "count": len(vulnerabilities)}
            else:
                self.progress.emit(f"Loading credentials from {self.credentials_path}...")
                client_id, client_secret = load_credentials(self.credentials_path)
                if not client_id or not client_secret:
                    raise RuntimeError("Missing client_id or client_secret in credentials file.")

                self.progress.emit("Authenticating with Vanta API...")
                client = VantaAPIClient(client_id, client_secret)
                client.authenticate()

                self.progress.emit("Fetching active vulnerabilities...")
                active_vulnerabilities = client.get_vulnerabilities()

                self.progress.emit("Fetching deactivated vulnerabilities...")
                deactivated_vulnerabilities = client.get_vulnerabilities(isDeactivated=True)

                vulnerabilities = active_vulnerabilities + deactivated_vulnerabilities

                self.progress.emit("Writing results to the database...")
                sync_stats = db.store_vulnerabilities(vulnerabilities, track_changes=True)
                summary = {
                    "source": "sync",
                    "count": len(vulnerabilities),
                    "sync_stats": sync_stats,
                }

            self.progress.emit(f"Loaded {len(vulnerabilities)} vulnerabilities.")
            self.finished.emit(vulnerabilities, summary)
        except Exception as exc:  # noqa: BLE001
            self.error.emit(str(exc))
        finally:
            if db:
                db.close()


class MainWindow(QtWidgets.QMainWindow):
    """Main GUI window."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Vanta Vulnerability Stats")
        self.resize(1200, 800)

        self.worker_thread: Optional[QtCore.QThread] = None
        self.worker: Optional[DataWorker] = None
        self.all_vulnerabilities: List[Dict] = []
        self.filtered_vulnerabilities: List[Dict] = []

        self._build_ui()

    def _build_ui(self) -> None:
        central_widget = QtWidgets.QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QtWidgets.QVBoxLayout(central_widget)

        main_layout.addWidget(self._build_path_controls())
        main_layout.addWidget(self._build_filter_group())
        main_layout.addWidget(self._build_stats_group())
        main_layout.addWidget(self._build_table())
        main_layout.addWidget(self._build_log_view())

    def _build_path_controls(self) -> QtWidgets.QGroupBox:
        group = QtWidgets.QGroupBox("Data Sources")
        layout = QtWidgets.QGridLayout(group)

        self.database_path_edit = QtWidgets.QLineEdit("vanta_vulnerabilities.db")
        self.credentials_path_edit = QtWidgets.QLineEdit("VANTA_API_CREDENTIALS.env")

        db_browse = QtWidgets.QPushButton("Browse…")
        db_browse.clicked.connect(self._select_database_file)
        cred_browse = QtWidgets.QPushButton("Browse…")
        cred_browse.clicked.connect(self._select_credentials_file)

        self.load_button = QtWidgets.QPushButton("Load From Cache")
        self.load_button.clicked.connect(lambda: self._start_worker("cache"))
        self.sync_button = QtWidgets.QPushButton("Sync From API")
        self.sync_button.clicked.connect(lambda: self._start_worker("sync"))
        self.apply_filters_button = QtWidgets.QPushButton("Apply Filters")
        self.apply_filters_button.clicked.connect(self.apply_filters)
        self.export_button = QtWidgets.QPushButton("Export Filtered JSON")
        self.export_button.clicked.connect(self._export_filtered)

        layout.addWidget(QtWidgets.QLabel("Database"), 0, 0)
        layout.addWidget(self.database_path_edit, 0, 1)
        layout.addWidget(db_browse, 0, 2)

        layout.addWidget(QtWidgets.QLabel("Credentials"), 1, 0)
        layout.addWidget(self.credentials_path_edit, 1, 1)
        layout.addWidget(cred_browse, 1, 2)

        button_layout = QtWidgets.QHBoxLayout()
        button_layout.addWidget(self.load_button)
        button_layout.addWidget(self.sync_button)
        button_layout.addStretch()
        button_layout.addWidget(self.apply_filters_button)
        button_layout.addWidget(self.export_button)

        layout.addLayout(button_layout, 2, 0, 1, 3)
        return group

    def _build_filter_group(self) -> QtWidgets.QGroupBox:
        group = QtWidgets.QGroupBox("Filters")
        layout = QtWidgets.QGridLayout(group)

        self.date_identified_start_edit = QtWidgets.QLineEdit()
        self.date_identified_start_edit.setPlaceholderText("YYYY-MM-DDTHH:MM:SSZ")
        self.date_identified_end_edit = QtWidgets.QLineEdit()
        self.date_identified_end_edit.setPlaceholderText("YYYY-MM-DDTHH:MM:SSZ")
        self.date_remediated_start_edit = QtWidgets.QLineEdit()
        self.date_remediated_start_edit.setPlaceholderText("YYYY-MM-DDTHH:MM:SSZ")
        self.date_remediated_end_edit = QtWidgets.QLineEdit()
        self.date_remediated_end_edit.setPlaceholderText("YYYY-MM-DDTHH:MM:SSZ")

        self.cve_edit = QtWidgets.QLineEdit()
        self.cve_edit.setPlaceholderText("CVE-YYYY-XXXX")
        self.asset_edit = QtWidgets.QLineEdit()
        self.asset_edit.setPlaceholderText("Asset or target ID")

        self.severity_checkboxes: Dict[str, QtWidgets.QCheckBox] = {}
        severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
        for idx, severity in enumerate(severities):
            checkbox = QtWidgets.QCheckBox(severity.title())
            self.severity_checkboxes[severity] = checkbox
            layout.addWidget(checkbox, 0, 3 + idx)

        layout.addWidget(QtWidgets.QLabel("Date Identified Start"), 1, 0)
        layout.addWidget(self.date_identified_start_edit, 1, 1, 1, 2)
        layout.addWidget(QtWidgets.QLabel("Date Identified End"), 2, 0)
        layout.addWidget(self.date_identified_end_edit, 2, 1, 1, 2)

        layout.addWidget(QtWidgets.QLabel("Date Remediated Start"), 3, 0)
        layout.addWidget(self.date_remediated_start_edit, 3, 1, 1, 2)
        layout.addWidget(QtWidgets.QLabel("Date Remediated End"), 4, 0)
        layout.addWidget(self.date_remediated_end_edit, 4, 1, 1, 2)

        layout.addWidget(QtWidgets.QLabel("CVE"), 5, 0)
        layout.addWidget(self.cve_edit, 5, 1, 1, 2)

        layout.addWidget(QtWidgets.QLabel("Asset ID"), 6, 0)
        layout.addWidget(self.asset_edit, 6, 1, 1, 2)

        return group

    def _build_stats_group(self) -> QtWidgets.QGroupBox:
        group = QtWidgets.QGroupBox("Statistics")
        layout = QtWidgets.QGridLayout(group)

        self.stats_labels: Dict[str, QtWidgets.QLabel] = {}
        stat_fields = [
            ("total", "Total"),
            ("active", "Active"),
            ("deactivated", "Remediated"),
            ("fixable", "Fixable"),
            ("not_fixable", "Not Fixable"),
            ("unique_assets", "Unique Assets"),
            ("unique_cves", "Unique CVEs"),
        ]

        for row, (key, label) in enumerate(stat_fields):
            widget = QtWidgets.QLabel("0")
            widget.setObjectName(key)
            layout.addWidget(QtWidgets.QLabel(label), row, 0)
            layout.addWidget(widget, row, 1)
            self.stats_labels[key] = widget

        self.severity_stats: Dict[str, QtWidgets.QLabel] = {}
        severity_names = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
        for idx, severity in enumerate(severity_names):
            label = QtWidgets.QLabel("0")
            layout.addWidget(QtWidgets.QLabel(severity.title()), idx, 2)
            layout.addWidget(label, idx, 3)
            self.severity_stats[severity] = label

        return group

    def _build_table(self) -> QtWidgets.QTableWidget:
        self.table = QtWidgets.QTableWidget()
        headers = [
            "ID",
            "Name",
            "Severity",
            "Asset",
            "Fixable",
            "Status",
            "First Detected",
            "Last Detected",
            "Source",
        ]
        self.table.setColumnCount(len(headers))
        self.table.setHorizontalHeaderLabels(headers)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setSelectionBehavior(QtWidgets.QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QtWidgets.QAbstractItemView.EditTrigger.NoEditTriggers)
        return self.table

    def _build_log_view(self) -> QtWidgets.QGroupBox:
        group = QtWidgets.QGroupBox("Activity Log")
        layout = QtWidgets.QVBoxLayout(group)
        self.log_output = QtWidgets.QPlainTextEdit()
        self.log_output.setReadOnly(True)
        layout.addWidget(self.log_output)
        return group

    def _select_database_file(self) -> None:
        path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "Select Database", self.database_path_edit.text() or os.getcwd(), "Database (*.db);;All Files (*)"
        )
        if path:
            self.database_path_edit.setText(path)

    def _select_credentials_file(self) -> None:
        path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self,
            "Select Credentials File",
            self.credentials_path_edit.text() or os.getcwd(),
            "JSON (*.json *.env);;All Files (*)",
        )
        if path:
            self.credentials_path_edit.setText(path)

    def _start_worker(self, mode: str) -> None:
        if self.worker_thread is not None:
            return

        if not self._validate_inputs(mode):
            return

        database_path = self.database_path_edit.text().strip()
        credentials_path = self.credentials_path_edit.text().strip()

        self.worker = DataWorker(mode, database_path, credentials_path)
        self.worker_thread = QtCore.QThread()
        self.worker.moveToThread(self.worker_thread)

        self.worker_thread.started.connect(self.worker.run)
        self.worker.progress.connect(self.append_log)
        self.worker.error.connect(self._handle_worker_error)
        self.worker.finished.connect(self._handle_worker_finished)
        self.worker.finished.connect(self.worker_thread.quit)
        self.worker.error.connect(self.worker_thread.quit)
        self.worker.finished.connect(self.worker.deleteLater)
        self.worker.error.connect(self.worker.deleteLater)
        self.worker_thread.finished.connect(self._cleanup_worker_thread)
        self.worker_thread.start()

        self.load_button.setEnabled(False)
        self.sync_button.setEnabled(False)
        self.append_log("Started background task…")

    def _cleanup_worker_thread(self) -> None:
        self.worker_thread.deleteLater()
        self.worker_thread = None
        self.worker = None
        self.load_button.setEnabled(True)
        self.sync_button.setEnabled(True)
        self.append_log("Background task finished.")

    def _handle_worker_error(self, message: str) -> None:
        QtWidgets.QMessageBox.critical(self, "Error", message)
        self.append_log(f"Error: {message}")

    def _handle_worker_finished(self, vulnerabilities: List[Dict], summary: Dict) -> None:
        self.all_vulnerabilities = vulnerabilities
        self.apply_filters()

        if summary.get("source") == "sync" and summary.get("sync_stats"):
            stats = summary["sync_stats"]
            sync_msg = (
                f"Sync complete. Total: {stats.get('total', 0)}, "
                f"New: {stats.get('new', 0)}, Updated: {stats.get('updated', 0)}, "
                f"Remediated: {stats.get('remediated', 0)}"
            )
            self.append_log(sync_msg)
        else:
            self.append_log(f"Loaded {summary.get('count', 0)} vulnerabilities from cache.")

    def _validate_inputs(self, mode: str) -> bool:
        database_path = self.database_path_edit.text().strip()
        credentials_path = self.credentials_path_edit.text().strip()

        if not database_path:
            QtWidgets.QMessageBox.warning(self, "Missing Database", "Please provide a database path.")
            return False

        if mode == "sync":
            if not credentials_path:
                QtWidgets.QMessageBox.warning(self, "Missing Credentials", "Please provide a credentials file path.")
                return False
            if not os.path.exists(credentials_path):
                QtWidgets.QMessageBox.warning(
                    self, "Missing Credentials", f"Credentials file not found:\n{credentials_path}"
                )
                return False

        return True

    def apply_filters(self) -> None:
        if not self.all_vulnerabilities:
            self.append_log("No data loaded yet.")
            return

        filters = self._collect_filter_values()
        stats_processor = VulnerabilityStats(self.all_vulnerabilities)
        self.filtered_vulnerabilities = stats_processor.filter_vulnerabilities(**filters)
        stats = stats_processor.generate_statistics(self.filtered_vulnerabilities)
        self._update_stats(stats)
        self._populate_table()

    def _collect_filter_values(self) -> Dict:
        def normalize(text: str) -> Optional[str]:
            text = text.strip()
            return text or None

        severity = [key for key, cb in self.severity_checkboxes.items() if cb.isChecked()]
        return {
            "date_identified_start": normalize(self.date_identified_start_edit.text()),
            "date_identified_end": normalize(self.date_identified_end_edit.text()),
            "date_remediated_start": normalize(self.date_remediated_start_edit.text()),
            "date_remediated_end": normalize(self.date_remediated_end_edit.text()),
            "severity": severity or None,
            "cve": normalize(self.cve_edit.text()),
            "asset_id": normalize(self.asset_edit.text()),
        }

    def _update_stats(self, stats: Dict) -> None:
        self.stats_labels["total"].setText(str(stats.get("total_count", 0)))
        self.stats_labels["active"].setText(str(stats.get("active", 0)))
        self.stats_labels["deactivated"].setText(str(stats.get("deactivated", 0)))
        self.stats_labels["fixable"].setText(str(stats.get("fixable", 0)))
        self.stats_labels["not_fixable"].setText(str(stats.get("not_fixable", 0)))
        self.stats_labels["unique_assets"].setText(str(stats.get("unique_assets_count", 0)))
        self.stats_labels["unique_cves"].setText(str(stats.get("unique_cves_count", 0)))

        for severity, label in self.severity_stats.items():
            label.setText(str(stats.get("by_severity", {}).get(severity, 0)))

    def _populate_table(self) -> None:
        self.table.setRowCount(len(self.filtered_vulnerabilities))
        for row, vuln in enumerate(self.filtered_vulnerabilities):
            values = [
                vuln.get("id", ""),
                vuln.get("name", ""),
                vuln.get("severity", ""),
                vuln.get("targetId", ""),
                "Yes" if vuln.get("isFixable") else "No",
                "Remediated" if vuln.get("deactivateMetadata") else "Active",
                vuln.get("firstDetectedDate", "") or "",
                vuln.get("lastDetectedDate", "") or "",
                vuln.get("scanSource", "") or "",
            ]
            for col, value in enumerate(values):
                item = QtWidgets.QTableWidgetItem(value if value is not None else "")
                if col == 2:
                    # Bold severity for quick scanning
                    font = item.font()
                    font.setBold(True)
                    item.setFont(font)
                self.table.setItem(row, col, item)

        self.table.resizeColumnsToContents()

    def _export_filtered(self) -> None:
        if not self.filtered_vulnerabilities:
            QtWidgets.QMessageBox.information(self, "Nothing to export", "Apply filters after loading data first.")
            return

        path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Export Vulnerabilities", "vulnerabilities.json", "JSON (*.json);;All Files (*)"
        )
        if not path:
            return

        with open(path, "w", encoding="utf-8") as handle:
            json.dump(self.filtered_vulnerabilities, handle, indent=2)
        self.append_log(f"Exported {len(self.filtered_vulnerabilities)} vulnerabilities to {path}.")

    def append_log(self, message: str) -> None:
        self.log_output.appendPlainText(message)
        self.log_output.verticalScrollBar().setValue(self.log_output.verticalScrollBar().maximum())


def main() -> None:
    app = QtWidgets.QApplication(sys.argv)
    QtGui.QGuiApplication.setApplicationDisplayName("Vanta Vulnerability Stats")
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
