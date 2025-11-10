"""
Settings persistence using QSettings for non-sensitive data.

This module provides a wrapper around Qt's QSettings for storing application
preferences and UI state. This is separate from CredentialsManager and is used
for NON-SENSITIVE data only.

Security Level: ✅ Plaintext OK
Storage: Platform-specific configuration files:
  - macOS: ~/Library/Preferences/com.VantaVulnStats.VantaVulnStatsTool.plist
  - Windows: Registry (HKEY_CURRENT_USER)
  - Linux: ~/.config/VantaVulnStats/VantaVulnStatsTool.conf

IMPORTANT: Never store API credentials or secrets in QSettings.
Use CredentialsManager for sensitive data.
"""

import logging
from typing import Any, Optional

from PySide6 import QtCore

logger = logging.getLogger(__name__)

# Organization and application names for QSettings
ORGANIZATION_NAME = "VantaVulnStats"
APPLICATION_NAME = "VantaVulnStatsTool"


class SettingsManager:
    """Manages application settings persistence for non-sensitive data."""

    def __init__(self):
        """Initialize settings manager."""
        self.settings = QtCore.QSettings(ORGANIZATION_NAME, APPLICATION_NAME)
        logger.debug(f"Settings file: {self.settings.fileName()}")

    # Window State
    def save_window_geometry(self, geometry: QtCore.QByteArray) -> None:
        """Save main window geometry."""
        self.settings.setValue("window/geometry", geometry)
        logger.debug("Window geometry saved")

    def get_window_geometry(self) -> Optional[QtCore.QByteArray]:
        """Get saved window geometry."""
        geometry = self.settings.value("window/geometry")
        if geometry:
            logger.debug("Window geometry restored")
        return geometry

    def save_window_state(self, state: QtCore.QByteArray) -> None:
        """Save main window state (splitters, toolbars, etc.)."""
        self.settings.setValue("window/state", state)
        logger.debug("Window state saved")

    def get_window_state(self) -> Optional[QtCore.QByteArray]:
        """Get saved window state."""
        state = self.settings.value("window/state")
        if state:
            logger.debug("Window state restored")
        return state

    # File Paths
    def save_database_path(self, path: str) -> None:
        """Save last used database path."""
        self.settings.setValue("paths/last_database", path)
        logger.debug(f"Database path saved: {path}")

    def get_database_path(self) -> Optional[str]:
        """Get last used database path."""
        path = self.settings.value("paths/last_database")
        if path:
            logger.debug(f"Database path restored: {path}")
        return path

    def save_export_directory(self, path: str) -> None:
        """Save last used export directory."""
        self.settings.setValue("paths/last_export_dir", path)
        logger.debug(f"Export directory saved: {path}")

    def get_export_directory(self) -> Optional[str]:
        """Get last used export directory."""
        return self.settings.value("paths/last_export_dir")

    # UI Preferences
    def save_dark_mode(self, enabled: bool) -> None:
        """Save dark mode preference."""
        self.settings.setValue("ui/dark_mode", enabled)
        logger.debug(f"Dark mode preference saved: {enabled}")

    def get_dark_mode(self) -> bool:
        """Get dark mode preference."""
        return self.settings.value("ui/dark_mode", False, type=bool)

    def save_column_widths(self, widths: list) -> None:
        """Save table column widths."""
        self.settings.setValue("ui/column_widths", widths)
        logger.debug("Column widths saved")

    def get_column_widths(self) -> Optional[list]:
        """Get saved column widths."""
        return self.settings.value("ui/column_widths")

    def save_visible_columns(self, columns: list) -> None:
        """Save visible column configuration."""
        self.settings.setValue("ui/visible_columns", columns)
        logger.debug("Visible columns saved")

    def get_visible_columns(self) -> Optional[list]:
        """Get visible column configuration."""
        return self.settings.value("ui/visible_columns")

    def save_statistics_visible(self, visible: bool) -> None:
        """Save statistics panel visibility."""
        self.settings.setValue("ui/statistics_visible", visible)
        logger.debug(f"Statistics visibility saved: {visible}")

    def get_statistics_visible(self) -> bool:
        """Get statistics panel visibility."""
        return self.settings.value("ui/statistics_visible", True, type=bool)

    # Filter Presets (Phase 2 feature placeholder)
    def save_filter_preset(self, name: str, filters: dict) -> None:
        """Save a filter preset."""
        self.settings.setValue(f"filters/{name}", filters)
        logger.debug(f"Filter preset saved: {name}")

    def get_filter_preset(self, name: str) -> Optional[dict]:
        """Get a filter preset."""
        return self.settings.value(f"filters/{name}")

    def get_all_filter_presets(self) -> list:
        """Get list of all filter preset names."""
        self.settings.beginGroup("filters")
        presets = self.settings.childKeys()
        self.settings.endGroup()
        return presets

    def delete_filter_preset(self, name: str) -> None:
        """Delete a filter preset."""
        self.settings.remove(f"filters/{name}")
        logger.debug(f"Filter preset deleted: {name}")

    # Sync Settings
    def save_last_sync_time(self, timestamp: str) -> None:
        """Save timestamp of last successful sync."""
        self.settings.setValue("sync/last_sync_time", timestamp)
        logger.debug(f"Last sync time saved: {timestamp}")

    def get_last_sync_time(self) -> Optional[str]:
        """Get timestamp of last successful sync."""
        return self.settings.value("sync/last_sync_time")

    def save_auto_sync_enabled(self, enabled: bool) -> None:
        """Save auto-sync preference."""
        self.settings.setValue("sync/auto_sync_enabled", enabled)
        logger.debug(f"Auto-sync preference saved: {enabled}")

    def get_auto_sync_enabled(self) -> bool:
        """Get auto-sync preference."""
        return self.settings.value("sync/auto_sync_enabled", False, type=bool)

    # General settings management
    def get(self, key: str, default: Any = None) -> Any:
        """Get a setting value by key."""
        return self.settings.value(key, default)

    def set(self, key: str, value: Any) -> None:
        """Set a setting value by key."""
        self.settings.setValue(key, value)
        logger.debug(f"Setting saved: {key}")

    def remove(self, key: str) -> None:
        """Remove a setting by key."""
        self.settings.remove(key)
        logger.debug(f"Setting removed: {key}")

    def clear_all(self) -> None:
        """Clear all settings (use with caution)."""
        reply = QtCore.QMessageBox.question(
            None,
            "Clear All Settings",
            "Are you sure you want to clear all application settings?",
            QtCore.QMessageBox.StandardButton.Yes | QtCore.QMessageBox.StandardButton.No,
            QtCore.QMessageBox.StandardButton.No,
        )

        if reply == QtCore.QMessageBox.StandardButton.Yes:
            self.settings.clear()
            logger.warning("All settings cleared")

    def sync(self) -> None:
        """Force settings to be written to disk."""
        self.settings.sync()
        logger.debug("Settings synced to disk")
