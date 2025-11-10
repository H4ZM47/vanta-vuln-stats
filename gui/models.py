"""
Qt Data Models for Vulnerability Data

This module provides Qt model classes for displaying vulnerability data
using the Model-View architecture. These models support efficient display
of large datasets with sorting, filtering, and lazy loading.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from PySide6 import QtCore, QtGui


class VulnerabilityTableModel(QtCore.QAbstractTableModel):
    """
    Table model for displaying vulnerability data.

    This model provides efficient data display with sorting capabilities
    and is designed to handle large datasets without blocking the UI.
    """

    # Column definitions
    COLUMN_HEADERS = [
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

    # Column indices
    COL_ID = 0
    COL_NAME = 1
    COL_SEVERITY = 2
    COL_ASSET = 3
    COL_FIXABLE = 4
    COL_STATUS = 5
    COL_FIRST_DETECTED = 6
    COL_LAST_DETECTED = 7
    COL_SOURCE = 8

    # Severity colors
    SEVERITY_COLORS = {
        "CRITICAL": QtGui.QColor(220, 53, 69),   # Red
        "HIGH": QtGui.QColor(255, 193, 7),        # Amber
        "MEDIUM": QtGui.QColor(255, 152, 0),      # Orange
        "LOW": QtGui.QColor(76, 175, 80),         # Green
    }

    def __init__(self, parent: Optional[QtCore.QObject] = None):
        super().__init__(parent)
        self._data: List[Dict[str, Any]] = []
        self._sort_column: int = self.COL_FIRST_DETECTED
        self._sort_order: QtCore.Qt.SortOrder = QtCore.Qt.SortOrder.DescendingOrder

    def rowCount(self, parent: QtCore.QModelIndex = QtCore.QModelIndex()) -> int:
        """Return the number of rows in the model."""
        if parent.isValid():
            return 0
        return len(self._data)

    def columnCount(self, parent: QtCore.QModelIndex = QtCore.QModelIndex()) -> int:
        """Return the number of columns in the model."""
        if parent.isValid():
            return 0
        return len(self.COLUMN_HEADERS)

    def data(self, index: QtCore.QModelIndex, role: int = QtCore.Qt.ItemDataRole.DisplayRole) -> Any:
        """Return data for the given index and role."""
        if not index.isValid() or not (0 <= index.row() < len(self._data)):
            return None

        row = index.row()
        col = index.column()
        vuln = self._data[row]

        if role == QtCore.Qt.ItemDataRole.DisplayRole:
            return self._get_display_data(vuln, col)

        elif role == QtCore.Qt.ItemDataRole.BackgroundRole:
            if col == self.COL_SEVERITY:
                severity = vuln.get("severity", "")
                return self.SEVERITY_COLORS.get(severity)

        elif role == QtCore.Qt.ItemDataRole.ForegroundRole:
            if col == self.COL_SEVERITY:
                # White text on colored background
                return QtGui.QColor(255, 255, 255)

        elif role == QtCore.Qt.ItemDataRole.FontRole:
            if col == self.COL_SEVERITY:
                font = QtGui.QFont()
                font.setBold(True)
                return font

        elif role == QtCore.Qt.ItemDataRole.TextAlignmentRole:
            if col in (self.COL_SEVERITY, self.COL_FIXABLE, self.COL_STATUS):
                return int(QtCore.Qt.AlignmentFlag.AlignCenter)

        elif role == QtCore.Qt.ItemDataRole.ToolTipRole:
            return self._get_tooltip_data(vuln, col)

        elif role == QtCore.Qt.ItemDataRole.UserRole:
            # Return the full vulnerability dict for user role
            return vuln

        return None

    def _get_display_data(self, vuln: Dict[str, Any], col: int) -> str:
        """Get display data for a specific column."""
        if col == self.COL_ID:
            return vuln.get("id", "")
        elif col == self.COL_NAME:
            name = vuln.get("name", "")
            # Truncate long names
            return name[:50] + "..." if len(name) > 50 else name
        elif col == self.COL_SEVERITY:
            return vuln.get("severity", "")
        elif col == self.COL_ASSET:
            return vuln.get("targetId", "")
        elif col == self.COL_FIXABLE:
            return "Yes" if vuln.get("isFixable") else "No"
        elif col == self.COL_STATUS:
            return "Remediated" if vuln.get("deactivateMetadata") else "Active"
        elif col == self.COL_FIRST_DETECTED:
            date_str = vuln.get("firstDetectedDate", "")
            return self._format_date(date_str)
        elif col == self.COL_LAST_DETECTED:
            date_str = vuln.get("lastDetectedDate", "")
            return self._format_date(date_str)
        elif col == self.COL_SOURCE:
            return vuln.get("scanSource", "")
        return ""

    def _get_tooltip_data(self, vuln: Dict[str, Any], col: int) -> Optional[str]:
        """Get tooltip data for a specific column."""
        if col == self.COL_NAME:
            # Show full name in tooltip
            return vuln.get("name", "")
        elif col == self.COL_ID:
            # Show ID and external URL if available
            vuln_id = vuln.get("id", "")
            external_url = vuln.get("externalUrl", "")
            if external_url:
                return f"{vuln_id}\n\nExternal URL:\n{external_url}"
            return vuln_id
        elif col == self.COL_SEVERITY:
            # Show CVSS score if available
            cvss = vuln.get("cvssSeverityScore")
            scanner = vuln.get("scannerScore")
            parts = [vuln.get("severity", "")]
            if cvss:
                parts.append(f"CVSS: {cvss}")
            if scanner:
                parts.append(f"Scanner: {scanner}")
            return "\n".join(parts)
        return None

    def _format_date(self, date_str: str) -> str:
        """Format ISO date string to readable format."""
        if not date_str:
            return ""
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d %H:%M")
        except (ValueError, AttributeError):
            return date_str

    def headerData(
        self,
        section: int,
        orientation: QtCore.Qt.Orientation,
        role: int = QtCore.Qt.ItemDataRole.DisplayRole
    ) -> Any:
        """Return header data."""
        if role == QtCore.Qt.ItemDataRole.DisplayRole:
            if orientation == QtCore.Qt.Orientation.Horizontal:
                if 0 <= section < len(self.COLUMN_HEADERS):
                    return self.COLUMN_HEADERS[section]
            else:
                return str(section + 1)
        return None

    def sort(self, column: int, order: QtCore.Qt.SortOrder = QtCore.Qt.SortOrder.AscendingOrder) -> None:
        """Sort the model by the given column."""
        self.layoutAboutToBeChanged.emit()

        self._sort_column = column
        self._sort_order = order

        reverse = (order == QtCore.Qt.SortOrder.DescendingOrder)

        # Define sort key function based on column
        if column == self.COL_ID:
            key_func = lambda v: v.get("id", "")
        elif column == self.COL_NAME:
            key_func = lambda v: v.get("name", "").lower()
        elif column == self.COL_SEVERITY:
            # Sort by severity rank
            severity_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
            key_func = lambda v: severity_rank.get(v.get("severity", ""), 999)
        elif column == self.COL_ASSET:
            key_func = lambda v: v.get("targetId", "")
        elif column == self.COL_FIXABLE:
            key_func = lambda v: not v.get("isFixable", False)  # Yes comes before No
        elif column == self.COL_STATUS:
            key_func = lambda v: "Remediated" if v.get("deactivateMetadata") else "Active"
        elif column == self.COL_FIRST_DETECTED:
            key_func = lambda v: v.get("firstDetectedDate", "")
        elif column == self.COL_LAST_DETECTED:
            key_func = lambda v: v.get("lastDetectedDate", "")
        elif column == self.COL_SOURCE:
            key_func = lambda v: v.get("scanSource", "")
        else:
            key_func = lambda v: ""

        self._data.sort(key=key_func, reverse=reverse)

        self.layoutChanged.emit()

    def setData(self, vulnerabilities: List[Dict[str, Any]]) -> None:
        """
        Set the vulnerability data for the model.

        This method efficiently updates the model data and notifies views.
        """
        self.beginResetModel()
        self._data = list(vulnerabilities)  # Make a copy
        # Re-apply current sort
        if self._data:
            self.sort(self._sort_column, self._sort_order)
        self.endResetModel()

    def getData(self) -> List[Dict[str, Any]]:
        """Get the current data."""
        return self._data

    def clear(self) -> None:
        """Clear all data from the model."""
        self.beginResetModel()
        self._data = []
        self.endResetModel()

    def getVulnerability(self, row: int) -> Optional[Dict[str, Any]]:
        """Get vulnerability data for a specific row."""
        if 0 <= row < len(self._data):
            return self._data[row]
        return None

    def flags(self, index: QtCore.QModelIndex) -> QtCore.Qt.ItemFlag:
        """Return item flags."""
        if not index.isValid():
            return QtCore.Qt.ItemFlag.NoItemFlags
        return QtCore.Qt.ItemFlag.ItemIsEnabled | QtCore.Qt.ItemFlag.ItemIsSelectable


class VulnerabilitySortFilterProxyModel(QtCore.QSortFilterProxyModel):
    """
    Proxy model for advanced filtering of vulnerability data.

    This proxy model provides filtering capabilities without modifying
    the source model, allowing for flexible search and filter operations.
    """

    def __init__(self, parent: Optional[QtCore.QObject] = None):
        super().__init__(parent)
        self._search_text: str = ""
        self._severity_filter: List[str] = []
        self._status_filter: Optional[str] = None  # "active", "remediated", or None (all)
        self.setFilterCaseSensitivity(QtCore.Qt.CaseSensitivity.CaseInsensitive)

    def setSearchText(self, text: str) -> None:
        """Set search text for filtering."""
        self._search_text = text.lower()
        self.invalidateFilter()

    def setSeverityFilter(self, severities: List[str]) -> None:
        """Set severity filter."""
        self._severity_filter = severities
        self.invalidateFilter()

    def setStatusFilter(self, status: Optional[str]) -> None:
        """Set status filter (active/remediated/all)."""
        self._status_filter = status
        self.invalidateFilter()

    def filterAcceptsRow(self, source_row: int, source_parent: QtCore.QModelIndex) -> bool:
        """Determine if a row should be included in the filtered results."""
        if not self.sourceModel():
            return False

        source_model = self.sourceModel()

        # Get vulnerability data
        index = source_model.index(source_row, 0, source_parent)
        vuln = source_model.data(index, QtCore.Qt.ItemDataRole.UserRole)

        if not vuln:
            return False

        # Apply severity filter
        if self._severity_filter:
            if vuln.get("severity", "") not in self._severity_filter:
                return False

        # Apply status filter
        if self._status_filter:
            is_remediated = bool(vuln.get("deactivateMetadata"))
            if self._status_filter == "active" and is_remediated:
                return False
            if self._status_filter == "remediated" and not is_remediated:
                return False

        # Apply search text filter
        if self._search_text:
            # Search in multiple fields
            searchable_fields = [
                vuln.get("id", ""),
                vuln.get("name", ""),
                vuln.get("targetId", ""),
                vuln.get("scanSource", ""),
            ]
            searchable_text = " ".join(str(f) for f in searchable_fields).lower()

            if self._search_text not in searchable_text:
                return False

        return True

    def clearFilters(self) -> None:
        """Clear all filters."""
        self._search_text = ""
        self._severity_filter = []
        self._status_filter = None
        self.invalidateFilter()
