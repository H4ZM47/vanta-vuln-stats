#!/usr/bin/env python3
"""
Utility script that opens the Qt GUI, injects sample data, and captures
screenshots so they can be shared without running the full workflow.
"""

import os
from pathlib import Path

from PySide6 import QtCore, QtWidgets

from vanta_vuln_gui import MainWindow

WORKSPACE = Path(__file__).parent
SCREENSHOT_DIR = WORKSPACE / "screenshots"

SAMPLE_VULNS = [
    {
        "id": "VULN-001",
        "name": "CVE-2024-1111 (openssl)",
        "severity": "CRITICAL",
        "targetId": "asset-prod-web-1",
        "isFixable": True,
        "deactivateMetadata": None,
        "firstDetectedDate": "2024-05-12T09:15:00Z",
        "lastDetectedDate": "2024-05-17T11:42:00Z",
        "scanSource": "Prisma Cloud",
    },
    {
        "id": "VULN-002",
        "name": "CVE-2023-2222 (linux-kernel)",
        "severity": "HIGH",
        "targetId": "asset-prod-api-1",
        "isFixable": False,
        "deactivateMetadata": None,
        "firstDetectedDate": "2024-04-02T15:33:00Z",
        "lastDetectedDate": "2024-05-09T16:21:00Z",
        "scanSource": "CrowdStrike",
    },
    {
        "id": "VULN-003",
        "name": "CVE-2022-3333 (nodejs)",
        "severity": "MEDIUM",
        "targetId": "asset-staging-web-3",
        "isFixable": True,
        "deactivateMetadata": {
            "deactivatedOnDate": "2024-05-10T08:00:00Z",
        },
        "firstDetectedDate": "2023-12-09T07:00:00Z",
        "lastDetectedDate": "2024-02-11T07:00:00Z",
        "scanSource": "Snyk",
    },
    {
        "id": "VULN-004",
        "name": "CVE-2021-4444 (log4j)",
        "severity": "LOW",
        "targetId": "asset-internal-build",
        "isFixable": False,
        "deactivateMetadata": None,
        "firstDetectedDate": "2022-01-04T10:10:00Z",
        "lastDetectedDate": "2024-05-01T08:18:00Z",
        "scanSource": "Nessus",
    },
]


def capture(window: MainWindow, filename: str) -> None:
    SCREENSHOT_DIR.mkdir(exist_ok=True)
    path = SCREENSHOT_DIR / filename
    pixmap = window.grab()
    pixmap.save(os.fspath(path))


def reset_severity_filters(window: MainWindow) -> None:
    for checkbox in window.severity_checkboxes.values():
        checkbox.setChecked(False)


def populate_sample_data(window: MainWindow) -> None:
    window.all_vulnerabilities = SAMPLE_VULNS
    window.append_log("Loaded sample data for preview.")
    window.apply_filters()


def main() -> None:
    app = QtWidgets.QApplication([])
    window = MainWindow()
    window.show()
    app.processEvents()

    capture(window, "gui_default.png")

    populate_sample_data(window)
    app.processEvents()
    capture(window, "gui_data.png")

    reset_severity_filters(window)
    window.severity_checkboxes["CRITICAL"].setChecked(True)
    window.severity_checkboxes["HIGH"].setChecked(True)
    window.append_log("Applied severity filter: CRITICAL + HIGH.")
    window.apply_filters()
    app.processEvents()
    capture(window, "gui_filtered.png")

    QtCore.QTimer.singleShot(0, app.quit)
    app.exec()


if __name__ == "__main__":
    main()
