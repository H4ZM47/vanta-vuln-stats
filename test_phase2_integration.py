#!/usr/bin/env python3
"""
Test script for Phase 2 integration features.

This script tests the new Model-View architecture, workers, and threading
without requiring the full GUI to be displayed.
"""

import sys
from datetime import datetime

from PySide6 import QtCore, QtWidgets

from gui.models import VulnerabilityTableModel, VulnerabilitySortFilterProxyModel
from gui.workers import ThreadManager


def test_vulnerability_model():
    """Test the VulnerabilityTableModel with sample data."""
    print("Testing VulnerabilityTableModel...")

    # Create sample data
    sample_vulnerabilities = [
        {
            "id": "vuln-001",
            "name": "Critical SQL Injection",
            "severity": "CRITICAL",
            "targetId": "server-001",
            "isFixable": True,
            "deactivateMetadata": None,
            "firstDetectedDate": "2025-01-01T10:00:00Z",
            "lastDetectedDate": "2025-01-10T15:30:00Z",
            "scanSource": "Tenable",
            "cvssSeverityScore": 9.8,
        },
        {
            "id": "vuln-002",
            "name": "High XSS Vulnerability",
            "severity": "HIGH",
            "targetId": "web-app-01",
            "isFixable": True,
            "deactivateMetadata": None,
            "firstDetectedDate": "2025-01-05T08:00:00Z",
            "lastDetectedDate": "2025-01-10T12:00:00Z",
            "scanSource": "OWASP ZAP",
            "cvssSeverityScore": 7.5,
        },
        {
            "id": "vuln-003",
            "name": "Medium Outdated Library",
            "severity": "MEDIUM",
            "targetId": "app-backend",
            "isFixable": True,
            "deactivateMetadata": {"deactivatedAt": "2025-01-09T14:00:00Z"},
            "firstDetectedDate": "2024-12-15T10:00:00Z",
            "lastDetectedDate": "2025-01-08T10:00:00Z",
            "scanSource": "Snyk",
            "cvssSeverityScore": 5.3,
        },
    ]

    # Create model
    model = VulnerabilityTableModel()

    # Test initial state
    assert model.rowCount() == 0, "Model should start empty"
    assert model.columnCount() == 9, "Model should have 9 columns"

    # Set data
    model.setData(sample_vulnerabilities)

    # Test data loading
    assert model.rowCount() == 3, f"Model should have 3 rows, got {model.rowCount()}"

    # Test data retrieval
    index = model.index(0, 0)
    id_value = model.data(index, QtCore.Qt.ItemDataRole.DisplayRole)
    assert id_value == "vuln-001", f"Expected 'vuln-001', got '{id_value}'"

    # Test severity column
    severity_index = model.index(0, 2)
    severity = model.data(severity_index, QtCore.Qt.ItemDataRole.DisplayRole)
    assert severity == "CRITICAL", f"Expected 'CRITICAL', got '{severity}'"

    # Test background color for severity
    bg_color = model.data(severity_index, QtCore.Qt.ItemDataRole.BackgroundRole)
    assert bg_color is not None, "Severity should have background color"

    # Test sorting
    print("  Testing sorting by severity...")
    model.sort(2, QtCore.Qt.SortOrder.AscendingOrder)
    first_severity = model.data(model.index(0, 2), QtCore.Qt.ItemDataRole.DisplayRole)
    assert first_severity == "CRITICAL", f"First item should be CRITICAL after sort, got {first_severity}"

    print("  ✓ VulnerabilityTableModel tests passed!")


def test_proxy_model():
    """Test the VulnerabilitySortFilterProxyModel."""
    print("\nTesting VulnerabilitySortFilterProxyModel...")

    # Create sample data
    sample_vulnerabilities = [
        {
            "id": "vuln-001",
            "name": "Critical SQL Injection",
            "severity": "CRITICAL",
            "targetId": "server-001",
            "deactivateMetadata": None,
        },
        {
            "id": "vuln-002",
            "name": "High XSS Vulnerability",
            "severity": "HIGH",
            "targetId": "web-app-01",
            "deactivateMetadata": None,
        },
        {
            "id": "vuln-003",
            "name": "Medium Outdated Library",
            "severity": "MEDIUM",
            "targetId": "app-backend",
            "deactivateMetadata": {"deactivatedAt": "2025-01-09T14:00:00Z"},
        },
    ]

    # Create models
    source_model = VulnerabilityTableModel()
    proxy_model = VulnerabilitySortFilterProxyModel()
    proxy_model.setSourceModel(source_model)

    # Load data
    source_model.setData(sample_vulnerabilities)

    # Test initial state
    assert proxy_model.rowCount() == 3, f"Proxy should show all 3 rows initially, got {proxy_model.rowCount()}"

    # Test severity filtering
    print("  Testing severity filtering...")
    proxy_model.setSeverityFilter(["CRITICAL"])
    assert proxy_model.rowCount() == 1, f"Should show 1 CRITICAL vulnerability, got {proxy_model.rowCount()}"

    # Test status filtering
    print("  Testing status filtering...")
    proxy_model.clearFilters()
    proxy_model.setStatusFilter("active")
    assert proxy_model.rowCount() == 2, f"Should show 2 active vulnerabilities, got {proxy_model.rowCount()}"

    # Test search text filtering
    print("  Testing search text filtering...")
    proxy_model.clearFilters()
    proxy_model.setSearchText("SQL")
    assert proxy_model.rowCount() == 1, f"Should find 1 vulnerability with 'SQL', got {proxy_model.rowCount()}"

    # Clear filters
    proxy_model.clearFilters()
    assert proxy_model.rowCount() == 3, f"Should show all 3 rows after clearing filters, got {proxy_model.rowCount()}"

    print("  ✓ VulnerabilitySortFilterProxyModel tests passed!")


def test_thread_manager():
    """Test the ThreadManager."""
    print("\nTesting ThreadManager...")

    manager = ThreadManager()

    # Test initial state
    assert not manager.has_active_threads(), "Should have no active threads initially"
    assert manager.get_active_thread_count() == 0, "Thread count should be 0"

    print("  ✓ ThreadManager tests passed!")


def main():
    """Run all tests."""
    print("=" * 60)
    print("Phase 2 Integration Tests")
    print("=" * 60)

    # Create QApplication (required for Qt models)
    app = QtWidgets.QApplication(sys.argv)

    try:
        test_vulnerability_model()
        test_proxy_model()
        test_thread_manager()

        print("\n" + "=" * 60)
        print("✓ All Phase 2 integration tests passed!")
        print("=" * 60)

        return 0

    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        return 1

    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
