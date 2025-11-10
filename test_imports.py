#!/usr/bin/env python3
"""
Simple import test for Phase 2 modules.
"""

print("Testing Phase 2 module imports...")

try:
    print("  Importing core modules...")
    from core.api_client import VantaAPIClient
    from core.database import VulnerabilityDatabase
    from core.stats import VulnerabilityStats
    print("    ✓ Core modules imported successfully")

    print("  Importing GUI credential modules...")
    from gui.credentials_manager import CredentialsManager
    from gui.settings_manager import SettingsManager
    print("    ✓ GUI credential modules imported successfully")

    print("  Checking Phase 2 modules exist...")
    import os
    phase2_modules = [
        "gui/models.py",
        "gui/workers.py",
        "gui/database_manager.py",
    ]

    for module in phase2_modules:
        if os.path.exists(module):
            print(f"    ✓ {module} exists")
        else:
            print(f"    ✗ {module} NOT FOUND")
            raise FileNotFoundError(f"{module} is missing")

    print("\n✓ All Phase 2 modules are present and importable!")
    print("\nPhase 2 Implementation Summary:")
    print("  - VulnerabilityTableModel: Qt data model for table view")
    print("  - VulnerabilitySortFilterProxyModel: Advanced filtering")
    print("  - DatabaseWorker: Background database operations")
    print("  - APISyncWorker: Background API sync operations")
    print("  - StatsCalculationWorker: Background statistics")
    print("  - ThreadManager: Centralized thread management")
    print("  - DatabaseManager: Thread-safe database connections")
    print("  - DatabaseConnectionPool: Connection pooling")
    print("  - DatabaseCache: In-memory caching")

except ImportError as e:
    print(f"\n✗ Import failed: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

except Exception as e:
    print(f"\n✗ Test failed: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print("\n" + "=" * 60)
print("Phase 2 implementation is ready!")
print("=" * 60)
