#!/usr/bin/env python3
"""
Qt graphical interface for the Vanta Vulnerability Statistics utility.

This GUI wraps the existing API/database/statistics logic provided by
`vanta_vuln_stats.py` and makes it easier to sync data, explore cached
results, and apply filters without using the command line.

Phase 2: Enhanced with Model-View architecture, improved threading,
and optimized performance for large datasets.
"""

import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional

from PySide6 import QtCore, QtGui, QtWidgets

from core.stats import VulnerabilityStats
from gui.credentials_dialog import CredentialsDialog
from gui.credentials_manager import CredentialsManager
from gui.models import VulnerabilitySortFilterProxyModel, VulnerabilityTableModel
from gui.settings_manager import SettingsManager
from gui.workers import APISyncWorker, DatabaseWorker, ThreadManager


# Legacy DataWorker for backwards compatibility
class DataWorker(QtCore.QObject):
    """Background worker that loads data from the cache or syncs from the API (Legacy)."""

    finished = QtCore.Signal(list, dict)
    progress = QtCore.Signal(str)
    error = QtCore.Signal(str)

    def __init__(self, mode: str, database_path: str, credentials_path: str = ""):
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
                # Try to get credentials from keyring first
                self.progress.emit("Loading credentials from secure keychain...")
                client_id, client_secret = CredentialsManager.get_credentials()

                # Fall back to file if keyring credentials not found
                if not client_id or not client_secret:
                    if self.credentials_path and os.path.exists(self.credentials_path):
                        self.progress.emit(f"Loading credentials from file: {self.credentials_path}...")
                        client_id, client_secret = load_credentials(self.credentials_path)

                if not client_id or not client_secret:
                    raise RuntimeError(
                        "No credentials found. Please configure your API credentials via File → Settings."
                    )

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

        # Thread management
        self.thread_manager = ThreadManager()
        self.worker_thread: Optional[QtCore.QThread] = None
        self.worker: Optional[DataWorker] = None

        # Data storage
        self.all_vulnerabilities: List[Dict] = []
        self.filtered_vulnerabilities: List[Dict] = []
        self.last_sync_time: Optional[datetime] = None
        self.active_filter_count: int = 0
        self._current_filter_name: Optional[str] = None

        # Data models (Phase 2: Model-View architecture)
        self.vuln_model = VulnerabilityTableModel()
        self.proxy_model = VulnerabilitySortFilterProxyModel()
        self.proxy_model.setSourceModel(self.vuln_model)

        # Initialize settings manager
        self.settings_manager = SettingsManager()

        # Restore window geometry if saved
        saved_geometry = self.settings_manager.get_window_geometry()
        if saved_geometry:
            self.restoreGeometry(saved_geometry)

        # Restore window state if saved
        saved_state = self.settings_manager.get_window_state()
        if saved_state:
            self.restoreState(saved_state)

        self._build_ui()
        self._create_menu_bar()
        self._create_status_bar()
        self._setup_shortcuts()

        # Restore last database path
        saved_db_path = self.settings_manager.get_database_path()
        if saved_db_path:
            self.database_path_edit.setText(saved_db_path)

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

    def _build_table(self) -> QtWidgets.QTableView:
        """Build the vulnerability table view with Model-View architecture."""
        self.table = QtWidgets.QTableView()

        # Set the model
        self.table.setModel(self.proxy_model)

        # Enable sorting
        self.table.setSortingEnabled(True)

        # Configure view behavior
        self.table.setSelectionBehavior(QtWidgets.QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QtWidgets.QAbstractItemView.SelectionMode.ExtendedSelection)
        self.table.setEditTriggers(QtWidgets.QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setAlternatingRowColors(True)

        # Configure header
        header = self.table.horizontalHeader()
        header.setStretchLastSection(True)
        header.setSectionResizeMode(QtWidgets.QHeaderView.ResizeMode.Interactive)

        # Set reasonable column widths
        header.resizeSection(0, 150)  # ID
        header.resizeSection(1, 250)  # Name
        header.resizeSection(2, 100)  # Severity
        header.resizeSection(3, 150)  # Asset
        header.resizeSection(4, 80)   # Fixable
        header.resizeSection(5, 100)  # Status
        header.resizeSection(6, 140)  # First Detected
        header.resizeSection(7, 140)  # Last Detected

        # Enable context menu
        self.table.setContextMenuPolicy(QtCore.Qt.ContextMenuPolicy.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self._show_table_context_menu)

        # Connect selection changed signal
        self.table.selectionModel().selectionChanged.connect(self._on_selection_changed)

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
        """Start a background worker for loading or syncing data (Phase 2 enhanced)."""
        if self.thread_manager.has_active_threads():
            self.append_log("A task is already running. Please wait...")
            return

        if not self._validate_inputs(mode):
            return

        database_path = self.database_path_edit.text().strip()
        credentials_path = self.credentials_path_edit.text().strip()

        # Disable buttons while working
        self.load_button.setEnabled(False)
        self.sync_button.setEnabled(False)

        # Create appropriate worker based on mode
        if mode == "cache":
            worker = DatabaseWorker(database_path)
            self.append_log(f"Loading cached data from {database_path}...")
        else:  # sync
            worker = APISyncWorker(database_path, credentials_path)
            self.append_log("Starting API sync operation...")

        # Start the worker using ThreadManager
        self.thread_manager.start_worker(
            worker,
            on_finished=self._handle_worker_finished,
            on_error=self._handle_worker_error,
            on_progress=self.append_log,
        )

    def _cleanup_buttons(self) -> None:
        """Re-enable buttons after worker completes."""
        self.load_button.setEnabled(True)
        self.sync_button.setEnabled(True)

    def _cleanup_worker_thread(self) -> None:
        """Legacy cleanup method for backwards compatibility."""
        if self.worker_thread:
            self.worker_thread.deleteLater()
            self.worker_thread = None
        self.worker = None
        self._cleanup_buttons()
        self.append_log("Background task finished.")

    def _handle_worker_error(self, message: str) -> None:
        """Handle worker error."""
        QtWidgets.QMessageBox.critical(self, "Error", message)
        self.append_log(f"Error: {message}")
        self._cleanup_buttons()

    def _handle_worker_finished(self, vulnerabilities: List[Dict], summary: Dict) -> None:
        """Handle worker completion and update UI with results."""
        self.all_vulnerabilities = vulnerabilities

        # Update sync time if this was a sync operation
        if summary.get("source") == "sync":
            self.last_sync_time = datetime.now()

        # Apply filters and update display
        self.apply_filters()

        # Log completion message
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

        # Re-enable buttons
        self._cleanup_buttons()

    def _validate_inputs(self, mode: str) -> bool:
        database_path = self.database_path_edit.text().strip()
        credentials_path = self.credentials_path_edit.text().strip()

        if not database_path:
            QtWidgets.QMessageBox.warning(self, "Missing Database", "Please provide a database path.")
            return False

        if mode == "sync":
            # Check if we have credentials in keyring or file
            has_keyring_creds = CredentialsManager.has_credentials()
            has_file_creds = credentials_path and os.path.exists(credentials_path)

            if not has_keyring_creds and not has_file_creds:
                reply = QtWidgets.QMessageBox.question(
                    self,
                    "No Credentials Found",
                    "No API credentials found in keychain or credentials file.\n\n"
                    "Would you like to configure credentials now?",
                    QtWidgets.QMessageBox.StandardButton.Yes | QtWidgets.QMessageBox.StandardButton.No,
                    QtWidgets.QMessageBox.StandardButton.Yes,
                )

                if reply == QtWidgets.QMessageBox.StandardButton.Yes:
                    dialog = CredentialsDialog(self)
                    dialog.exec()
                    # Check again if credentials are now available
                    if not CredentialsManager.has_credentials():
                        return False
                else:
                    return False

        return True

    def apply_filters(self) -> None:
        if not self.all_vulnerabilities:
            self.append_log("No data loaded yet.")
            return

        filters = self._collect_filter_values()

        # Count active filters
        self.active_filter_count = 0
        if filters.get("date_identified_start"):
            self.active_filter_count += 1
        if filters.get("date_identified_end"):
            self.active_filter_count += 1
        if filters.get("date_remediated_start"):
            self.active_filter_count += 1
        if filters.get("date_remediated_end"):
            self.active_filter_count += 1
        if filters.get("severity"):
            self.active_filter_count += 1
        if filters.get("cve"):
            self.active_filter_count += 1
        if filters.get("asset_id"):
            self.active_filter_count += 1

        stats_processor = VulnerabilityStats(self.all_vulnerabilities)
        self.filtered_vulnerabilities = stats_processor.filter_vulnerabilities(**filters)
        stats = stats_processor.generate_statistics(self.filtered_vulnerabilities)
        self._update_stats(stats)
        self._populate_table()
        self._update_status_bar()

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
        """Populate the table with filtered vulnerability data using the model."""
        # Update the model with filtered data
        self.vuln_model.setData(self.filtered_vulnerabilities)

        # Update the status bar
        self._update_status_bar()

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

    def _create_menu_bar(self) -> None:
        """Create the application menu bar with File, Edit, View, and Help menus."""
        menu_bar = self.menuBar()

        # File Menu (6 items)
        file_menu = menu_bar.addMenu("&File")

        new_filter_action = file_menu.addAction("&New Filter...")
        new_filter_action.setShortcut(QtGui.QKeySequence.StandardKey.New)
        new_filter_action.triggered.connect(self._new_filter)

        open_filter_action = file_menu.addAction("&Open Saved Filter...")
        open_filter_action.setShortcut(QtGui.QKeySequence.StandardKey.Open)
        open_filter_action.triggered.connect(self._open_filter)

        file_menu.addSeparator()

        save_filter_action = file_menu.addAction("&Save Filter")
        save_filter_action.setShortcut(QtGui.QKeySequence.StandardKey.Save)
        save_filter_action.triggered.connect(self._save_filter)

        save_filter_as_action = file_menu.addAction("Save Filter &As...")
        save_filter_as_action.setShortcut(QtGui.QKeySequence.StandardKey.SaveAs)
        save_filter_as_action.triggered.connect(self._save_filter_as)

        file_menu.addSeparator()

        export_action = file_menu.addAction("&Export...")
        export_action.setShortcut(QtGui.QKeySequence("Ctrl+E"))
        export_action.triggered.connect(self._export_menu)

        file_menu.addSeparator()

        settings_action = file_menu.addAction("Se&ttings...")
        settings_action.setShortcut(QtGui.QKeySequence.StandardKey.Preferences)
        settings_action.triggered.connect(self._show_settings)

        file_menu.addSeparator()

        exit_action = file_menu.addAction("E&xit")
        exit_action.setShortcut(QtGui.QKeySequence.StandardKey.Quit)
        exit_action.triggered.connect(self.close)

        # Edit Menu (4 items)
        edit_menu = menu_bar.addMenu("&Edit")

        select_all_action = edit_menu.addAction("Select &All")
        select_all_action.setShortcut(QtGui.QKeySequence.StandardKey.SelectAll)
        select_all_action.triggered.connect(self._select_all_rows)

        deselect_all_action = edit_menu.addAction("&Deselect All")
        deselect_all_action.setShortcut(QtGui.QKeySequence("Ctrl+Shift+A"))
        deselect_all_action.triggered.connect(self._deselect_all_rows)

        edit_menu.addSeparator()

        find_action = edit_menu.addAction("&Find...")
        find_action.setShortcut(QtGui.QKeySequence.StandardKey.Find)
        find_action.triggered.connect(self._focus_search)

        find_next_action = edit_menu.addAction("Find &Next")
        find_next_action.setShortcut(QtGui.QKeySequence("F3"))
        find_next_action.triggered.connect(self._find_next)

        # View Menu (6 items)
        view_menu = menu_bar.addMenu("&View")

        refresh_action = view_menu.addAction("&Refresh Data")
        refresh_action.setShortcut(QtGui.QKeySequence.StandardKey.Refresh)
        refresh_action.triggered.connect(lambda: self._start_worker("sync"))

        view_menu.addSeparator()

        self.show_stats_action = view_menu.addAction("Show &Statistics Panel")
        self.show_stats_action.setShortcut(QtGui.QKeySequence("Ctrl+Shift+S"))
        self.show_stats_action.setCheckable(True)
        self.show_stats_action.setChecked(True)
        self.show_stats_action.triggered.connect(self._toggle_statistics_panel)

        view_menu.addSeparator()

        self.dark_mode_action = view_menu.addAction("&Dark Mode")
        self.dark_mode_action.setShortcut(QtGui.QKeySequence("Ctrl+Shift+D"))
        self.dark_mode_action.setCheckable(True)
        self.dark_mode_action.setChecked(self.settings_manager.get_dark_mode())
        self.dark_mode_action.triggered.connect(self._toggle_dark_mode)

        view_menu.addSeparator()

        fullscreen_action = view_menu.addAction("&Full Screen")
        fullscreen_action.setShortcut(QtGui.QKeySequence("F11"))
        fullscreen_action.triggered.connect(self._toggle_fullscreen)

        # Help Menu (3 items)
        help_menu = menu_bar.addMenu("&Help")

        user_guide_action = help_menu.addAction("&User Guide")
        user_guide_action.setShortcut(QtGui.QKeySequence.StandardKey.HelpContents)
        user_guide_action.triggered.connect(self._show_user_guide)

        shortcuts_action = help_menu.addAction("&Keyboard Shortcuts")
        shortcuts_action.setShortcut(QtGui.QKeySequence("?"))
        shortcuts_action.triggered.connect(self._show_keyboard_shortcuts)

        help_menu.addSeparator()

        about_action = help_menu.addAction("&About Vanta Vuln Stats")
        about_action.triggered.connect(self._show_about)

    def _create_status_bar(self) -> None:
        """Create the status bar with sync status and context info."""
        self.status_bar = self.statusBar()

        # Left section: Sync status
        self.sync_status_label = QtWidgets.QLabel("🔴 No data loaded")
        self.sync_status_label.setToolTip("Click 'Sync From API' or 'Load From Cache' to load data")
        self.status_bar.addWidget(self.sync_status_label)

        # Add stretch to push right section to the right
        self.status_bar.addWidget(QtWidgets.QLabel(), 1)

        # Right section: Context info
        self.context_info_label = QtWidgets.QLabel("Showing 0 of 0 vulnerabilities")
        self.status_bar.addPermanentWidget(self.context_info_label)

    def _setup_shortcuts(self) -> None:
        """Setup keyboard shortcuts."""
        # Quick search with '/' key (Gmail-style)
        slash_shortcut = QtWidgets.QShortcut(QtGui.QKeySequence("/"), self)
        slash_shortcut.activated.connect(self._focus_search)

        # j/k navigation (Gmail/Vim-style)
        j_shortcut = QtWidgets.QShortcut(QtGui.QKeySequence("j"), self)
        j_shortcut.activated.connect(self._select_next_row)

        k_shortcut = QtWidgets.QShortcut(QtGui.QKeySequence("k"), self)
        k_shortcut.activated.connect(self._select_previous_row)

        # Enter to open/activate
        enter_shortcut = QtWidgets.QShortcut(QtGui.QKeySequence(QtCore.Qt.Key.Key_Return), self)
        enter_shortcut.activated.connect(self._activate_selected_row)

        # Escape to cancel/close
        esc_shortcut = QtWidgets.QShortcut(QtGui.QKeySequence(QtCore.Qt.Key.Key_Escape), self)
        esc_shortcut.activated.connect(self._handle_escape)

    def _update_status_bar(self) -> None:
        """Update status bar with current state."""
        # Update sync status
        if self.last_sync_time:
            elapsed = datetime.now() - self.last_sync_time
            if elapsed.seconds < 60:
                time_str = "just now"
            elif elapsed.seconds < 3600:
                time_str = f"{elapsed.seconds // 60} minutes ago"
            elif elapsed.seconds < 86400:
                time_str = f"{elapsed.seconds // 3600} hours ago"
            else:
                time_str = f"{elapsed.days} days ago"

            self.sync_status_label.setText(f"🟢 Last synced: {time_str}")
            self.sync_status_label.setToolTip(
                f"Last sync: {self.last_sync_time.strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"Database: {self.database_path_edit.text()}"
            )
        elif self.all_vulnerabilities:
            self.sync_status_label.setText("🟢 Data loaded from cache")
            self.sync_status_label.setToolTip("Data loaded from cache")
        else:
            self.sync_status_label.setText("🔴 No data loaded")
            self.sync_status_label.setToolTip("Click 'Sync From API' or 'Load From Cache' to load data")

        # Update context info
        total_count = len(self.all_vulnerabilities)
        filtered_count = len(self.filtered_vulnerabilities)

        # Get selected count (handle case where selection model might not be initialized)
        selected_count = 0
        if self.table.selectionModel():
            selected_count = len(self.table.selectionModel().selectedRows())

        if selected_count > 0:
            self.context_info_label.setText(f"{selected_count} items selected")
        elif self.active_filter_count > 0:
            self.context_info_label.setText(
                f"Showing {filtered_count} of {total_count} vulnerabilities ({self.active_filter_count} filters active)"
            )
        else:
            self.context_info_label.setText(f"Showing {filtered_count} of {total_count} vulnerabilities")

    # Menu action handlers - File Menu
    def _new_filter(self) -> None:
        """Clear all filters."""
        self.date_identified_start_edit.clear()
        self.date_identified_end_edit.clear()
        self.date_remediated_start_edit.clear()
        self.date_remediated_end_edit.clear()
        self.cve_edit.clear()
        self.asset_edit.clear()
        for checkbox in self.severity_checkboxes.values():
            checkbox.setChecked(False)
        self.apply_filters()
        self.append_log("Filters cleared")

    def _open_filter(self) -> None:
        """Open a saved filter preset."""
        presets = self.settings_manager.get_all_filter_presets()
        if not presets:
            QtWidgets.QMessageBox.information(
                self, "No Saved Filters", "You haven't saved any filter presets yet."
            )
            return

        preset_name, ok = QtWidgets.QInputDialog.getItem(
            self, "Open Filter", "Select a filter preset:", presets, 0, False
        )
        if ok and preset_name:
            filters = self.settings_manager.get_filter_preset(preset_name)
            if filters:
                self._apply_filter_preset(filters)
                self.append_log(f"Loaded filter preset: {preset_name}")

    def _save_filter(self) -> None:
        """Save current filter as a preset."""
        if not hasattr(self, "_current_filter_name") or not self._current_filter_name:
            self._save_filter_as()
        else:
            filters = self._collect_filter_values()
            self.settings_manager.save_filter_preset(self._current_filter_name, filters)
            self.append_log(f"Filter preset saved: {self._current_filter_name}")

    def _save_filter_as(self) -> None:
        """Save current filter as a new preset."""
        name, ok = QtWidgets.QInputDialog.getText(
            self, "Save Filter As", "Enter a name for this filter preset:"
        )
        if ok and name:
            filters = self._collect_filter_values()
            self.settings_manager.save_filter_preset(name, filters)
            self._current_filter_name = name
            self.append_log(f"Filter preset saved as: {name}")

    def _export_menu(self) -> None:
        """Show export format selection dialog."""
        if not self.filtered_vulnerabilities:
            QtWidgets.QMessageBox.information(
                self, "Nothing to export", "Apply filters after loading data first."
            )
            return

        formats = ["JSON", "CSV", "Excel"]
        format_choice, ok = QtWidgets.QInputDialog.getItem(
            self, "Export Format", "Select export format:", formats, 0, False
        )

        if ok and format_choice:
            if format_choice == "JSON":
                self._export_filtered()
            elif format_choice == "CSV":
                self._export_csv()
            elif format_choice == "Excel":
                self._export_excel()

    def _show_settings(self) -> None:
        """Show settings dialog."""
        dialog = CredentialsDialog(self)
        dialog.exec()

    # Menu action handlers - Edit Menu
    def _select_all_rows(self) -> None:
        """Select all rows in the table."""
        self.table.selectAll()
        self._update_status_bar()

    def _deselect_all_rows(self) -> None:
        """Deselect all rows in the table."""
        self.table.clearSelection()
        self._update_status_bar()

    def _focus_search(self) -> None:
        """Focus the CVE search field."""
        self.cve_edit.setFocus()
        self.cve_edit.selectAll()

    def _find_next(self) -> None:
        """Find next matching item (placeholder for future implementation)."""
        QtWidgets.QMessageBox.information(
            self, "Find Next", "Find Next functionality will be implemented in a future update."
        )

    # Menu action handlers - View Menu
    def _toggle_statistics_panel(self, checked: bool) -> None:
        """Toggle statistics panel visibility."""
        # For now, we'll save the preference but not hide the panel
        # (requires UI refactoring to support collapsible panels)
        self.settings_manager.save_statistics_visible(checked)
        if not checked:
            QtWidgets.QMessageBox.information(
                self,
                "Statistics Panel",
                "Statistics panel visibility toggling will be fully implemented in a future update.",
            )

    def _toggle_dark_mode(self, checked: bool) -> None:
        """Toggle dark mode."""
        self.settings_manager.save_dark_mode(checked)
        if checked:
            # Apply dark palette
            dark_palette = QtGui.QPalette()
            dark_palette.setColor(QtGui.QPalette.ColorRole.Window, QtGui.QColor(53, 53, 53))
            dark_palette.setColor(QtGui.QPalette.ColorRole.WindowText, QtCore.Qt.GlobalColor.white)
            dark_palette.setColor(QtGui.QPalette.ColorRole.Base, QtGui.QColor(35, 35, 35))
            dark_palette.setColor(QtGui.QPalette.ColorRole.AlternateBase, QtGui.QColor(53, 53, 53))
            dark_palette.setColor(QtGui.QPalette.ColorRole.ToolTipBase, QtCore.Qt.GlobalColor.white)
            dark_palette.setColor(QtGui.QPalette.ColorRole.ToolTipText, QtCore.Qt.GlobalColor.white)
            dark_palette.setColor(QtGui.QPalette.ColorRole.Text, QtCore.Qt.GlobalColor.white)
            dark_palette.setColor(QtGui.QPalette.ColorRole.Button, QtGui.QColor(53, 53, 53))
            dark_palette.setColor(QtGui.QPalette.ColorRole.ButtonText, QtCore.Qt.GlobalColor.white)
            dark_palette.setColor(QtGui.QPalette.ColorRole.Link, QtGui.QColor(42, 130, 218))
            dark_palette.setColor(QtGui.QPalette.ColorRole.Highlight, QtGui.QColor(42, 130, 218))
            dark_palette.setColor(QtGui.QPalette.ColorRole.HighlightedText, QtCore.Qt.GlobalColor.black)
            QtWidgets.QApplication.instance().setPalette(dark_palette)
        else:
            # Restore default palette
            QtWidgets.QApplication.instance().setPalette(QtWidgets.QApplication.style().standardPalette())
        self.append_log(f"Dark mode: {'enabled' if checked else 'disabled'}")

    def _toggle_fullscreen(self) -> None:
        """Toggle fullscreen mode."""
        if self.isFullScreen():
            self.showNormal()
        else:
            self.showFullScreen()

    # Menu action handlers - Help Menu
    def _show_user_guide(self) -> None:
        """Show user guide."""
        guide_text = """
<h2>Vanta Vulnerability Stats - User Guide</h2>

<h3>Getting Started</h3>
<ol>
<li><b>Configure Credentials:</b> Go to File → Settings to enter your Vanta API credentials.</li>
<li><b>Sync Data:</b> Click "Sync From API" or press F5 to fetch vulnerability data.</li>
<li><b>Apply Filters:</b> Use the filter controls to narrow down results.</li>
<li><b>Export Data:</b> Use File → Export to save filtered results.</li>
</ol>

<h3>Keyboard Shortcuts</h3>
<ul>
<li><b>F5:</b> Refresh/Sync data</li>
<li><b>Ctrl+F or /:</b> Focus search</li>
<li><b>Ctrl+E:</b> Export data</li>
<li><b>Ctrl+A:</b> Select all rows</li>
<li><b>j/k:</b> Navigate rows (Vim-style)</li>
<li><b>?:</b> Show all shortcuts</li>
</ul>

<h3>Filters</h3>
<p>Apply filters to narrow down vulnerabilities by date, severity, CVE, or asset ID.
Save commonly-used filter combinations with File → Save Filter.</p>

<h3>Security</h3>
<p>Your API credentials are stored securely in your system's keychain and never saved in plaintext.</p>
"""
        msg_box = QtWidgets.QMessageBox(self)
        msg_box.setWindowTitle("User Guide")
        msg_box.setTextFormat(QtCore.Qt.TextFormat.RichText)
        msg_box.setText(guide_text)
        msg_box.exec()

    def _show_keyboard_shortcuts(self) -> None:
        """Show keyboard shortcuts reference."""
        shortcuts_text = """
<h2>Keyboard Shortcuts</h2>

<h3>Core Navigation</h3>
<table>
<tr><td><b>F5</b></td><td>Sync/Refresh data</td></tr>
<tr><td><b>Ctrl+F or /</b></td><td>Focus search</td></tr>
<tr><td><b>j / k</b></td><td>Next/Previous row</td></tr>
<tr><td><b>Enter</b></td><td>Open/Activate</td></tr>
<tr><td><b>Esc</b></td><td>Cancel/Close</td></tr>
<tr><td><b>Ctrl+E</b></td><td>Export</td></tr>
</table>

<h3>Productivity</h3>
<table>
<tr><td><b>Ctrl+A</b></td><td>Select All</td></tr>
<tr><td><b>Ctrl+Shift+A</b></td><td>Deselect All</td></tr>
<tr><td><b>Ctrl+Tab</b></td><td>Switch Views</td></tr>
<tr><td><b>?</b></td><td>Show this help</td></tr>
</table>

<h3>File Menu</h3>
<table>
<tr><td><b>Ctrl+N</b></td><td>New Filter</td></tr>
<tr><td><b>Ctrl+O</b></td><td>Open Saved Filter</td></tr>
<tr><td><b>Ctrl+S</b></td><td>Save Filter</td></tr>
<tr><td><b>Ctrl+Shift+S</b></td><td>Save Filter As</td></tr>
<tr><td><b>Ctrl+,</b></td><td>Settings</td></tr>
<tr><td><b>Ctrl+Q</b></td><td>Quit</td></tr>
</table>

<h3>View Menu</h3>
<table>
<tr><td><b>Ctrl+Shift+D</b></td><td>Toggle Dark Mode</td></tr>
<tr><td><b>F11</b></td><td>Toggle Full Screen</td></tr>
</table>
"""
        msg_box = QtWidgets.QMessageBox(self)
        msg_box.setWindowTitle("Keyboard Shortcuts")
        msg_box.setTextFormat(QtCore.Qt.TextFormat.RichText)
        msg_box.setText(shortcuts_text)
        msg_box.exec()

    def _show_about(self) -> None:
        """Show about dialog."""
        about_text = """
<h2>Vanta Vulnerability Stats</h2>
<p><b>Version:</b> 1.0.0</p>
<p><b>Description:</b> A tool for tracking and analyzing vulnerability data from Vanta.</p>
<p><b>Security:</b> Credentials are stored securely in your system's keychain.</p>
<p><b>License:</b> MIT</p>
<hr>
<p>Built with PySide6 and Python</p>
"""
        QtWidgets.QMessageBox.about(self, "About Vanta Vuln Stats", about_text)

    # Keyboard shortcut handlers
    def _select_next_row(self) -> None:
        """Select next row (j key)."""
        current_index = self.table.currentIndex()
        if current_index.isValid():
            next_row = current_index.row() + 1
            if next_row < self.proxy_model.rowCount():
                next_index = self.proxy_model.index(next_row, 0)
                self.table.setCurrentIndex(next_index)
                self.table.selectRow(next_row)

    def _select_previous_row(self) -> None:
        """Select previous row (k key)."""
        current_index = self.table.currentIndex()
        if current_index.isValid():
            prev_row = current_index.row() - 1
            if prev_row >= 0:
                prev_index = self.proxy_model.index(prev_row, 0)
                self.table.setCurrentIndex(prev_index)
                self.table.selectRow(prev_row)

    def _activate_selected_row(self) -> None:
        """Activate selected row (Enter key)."""
        current_index = self.table.currentIndex()
        if current_index.isValid():
            # Map proxy index to source model
            source_index = self.proxy_model.mapToSource(current_index)
            vuln = self.vuln_model.getVulnerability(source_index.row())
            if vuln:
                self._show_vuln_details(vuln)

    def _handle_escape(self) -> None:
        """Handle escape key."""
        # Clear selection or close current dialog
        if self.table.selectionModel().hasSelection():
            self.table.clearSelection()
        else:
            # Clear filters
            self._new_filter()

    # Helper methods
    def _apply_filter_preset(self, filters: dict) -> None:
        """Apply a filter preset to the UI."""
        self.date_identified_start_edit.setText(filters.get("date_identified_start", "") or "")
        self.date_identified_end_edit.setText(filters.get("date_identified_end", "") or "")
        self.date_remediated_start_edit.setText(filters.get("date_remediated_start", "") or "")
        self.date_remediated_end_edit.setText(filters.get("date_remediated_end", "") or "")
        self.cve_edit.setText(filters.get("cve", "") or "")
        self.asset_edit.setText(filters.get("asset_id", "") or "")

        # Handle severity checkboxes
        severity_list = filters.get("severity", [])
        for severity, checkbox in self.severity_checkboxes.items():
            checkbox.setChecked(severity in severity_list)

        self.apply_filters()

    def _export_csv(self) -> None:
        """Export filtered vulnerabilities to CSV."""
        import csv

        path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Export to CSV", "vulnerabilities.csv", "CSV (*.csv);;All Files (*)"
        )
        if not path:
            return

        with open(path, "w", encoding="utf-8", newline="") as handle:
            if not self.filtered_vulnerabilities:
                return

            writer = csv.DictWriter(handle, fieldnames=self.filtered_vulnerabilities[0].keys())
            writer.writeheader()
            writer.writerows(self.filtered_vulnerabilities)

        self.append_log(f"Exported {len(self.filtered_vulnerabilities)} vulnerabilities to {path}")

    def _export_excel(self) -> None:
        """Export filtered vulnerabilities to Excel."""
        try:
            import openpyxl
        except ImportError:
            QtWidgets.QMessageBox.warning(
                self,
                "Missing Dependency",
                "Excel export requires openpyxl. Install it with: pip install openpyxl",
            )
            return

        path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Export to Excel", "vulnerabilities.xlsx", "Excel (*.xlsx);;All Files (*)"
        )
        if not path:
            return

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Vulnerabilities"

        if self.filtered_vulnerabilities:
            # Write headers
            headers = list(self.filtered_vulnerabilities[0].keys())
            ws.append(headers)

            # Write data
            for vuln in self.filtered_vulnerabilities:
                ws.append([vuln.get(h) for h in headers])

        wb.save(path)
        self.append_log(f"Exported {len(self.filtered_vulnerabilities)} vulnerabilities to {path}")

    def _show_table_context_menu(self, position: QtCore.QPoint) -> None:
        """Show context menu for table rows."""
        index = self.table.indexAt(position)
        if not index.isValid():
            return

        menu = QtWidgets.QMenu()

        # Get the vulnerability data for this row
        source_index = self.proxy_model.mapToSource(index)
        vuln = self.vuln_model.getVulnerability(source_index.row())

        if vuln:
            view_details_action = menu.addAction("View Details")
            view_details_action.triggered.connect(lambda: self._show_vuln_details(vuln))

            menu.addSeparator()

            copy_id_action = menu.addAction("Copy ID")
            copy_id_action.triggered.connect(
                lambda: QtWidgets.QApplication.clipboard().setText(vuln.get("id", ""))
            )

            if vuln.get("externalUrl"):
                copy_url_action = menu.addAction("Copy External URL")
                copy_url_action.triggered.connect(
                    lambda: QtWidgets.QApplication.clipboard().setText(vuln.get("externalUrl", ""))
                )

        menu.exec(self.table.viewport().mapToGlobal(position))

    def _show_vuln_details(self, vuln: Dict) -> None:
        """Show detailed information about a vulnerability."""
        details = json.dumps(vuln, indent=2)
        msg_box = QtWidgets.QMessageBox(self)
        msg_box.setWindowTitle("Vulnerability Details")
        msg_box.setText(f"<h3>{vuln.get('name', 'Unknown')}</h3>")
        msg_box.setInformativeText(
            f"<b>ID:</b> {vuln.get('id', 'N/A')}<br>"
            f"<b>Severity:</b> {vuln.get('severity', 'N/A')}<br>"
            f"<b>Asset:</b> {vuln.get('targetId', 'N/A')}<br>"
            f"<b>Status:</b> {'Remediated' if vuln.get('deactivateMetadata') else 'Active'}"
        )
        msg_box.setDetailedText(details)
        msg_box.exec()

    def _on_selection_changed(self) -> None:
        """Handle table selection changes."""
        self._update_status_bar()

    def closeEvent(self, event: QtGui.QCloseEvent) -> None:
        """Handle window close event to save settings."""
        # Save window geometry and state
        self.settings_manager.save_window_geometry(self.saveGeometry())
        self.settings_manager.save_window_state(self.saveState())

        # Save database path
        db_path = self.database_path_edit.text().strip()
        if db_path:
            self.settings_manager.save_database_path(db_path)

        # Cancel all active threads
        self.thread_manager.cancel_all()
        self.thread_manager.wait_for_all(timeout_ms=3000)

        # Clean up legacy worker thread if running
        if self.worker_thread is not None:
            self.worker_thread.quit()
            self.worker_thread.wait()

        event.accept()


def main() -> None:
    app = QtWidgets.QApplication(sys.argv)
    QtGui.QGuiApplication.setApplicationDisplayName("Vanta Vulnerability Stats")
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
