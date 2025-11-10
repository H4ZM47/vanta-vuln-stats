"""
Background Worker Threads for GUI Operations

This module provides worker classes for executing long-running operations
in background threads to keep the UI responsive.
"""

import os
from typing import Dict, List, Optional

from PySide6 import QtCore

from core.api_client import VantaAPIClient
from core.database import VulnerabilityDatabase
from gui.credentials_manager import CredentialsManager


class DatabaseWorker(QtCore.QObject):
    """
    Worker for database operations that run in a background thread.

    This worker loads vulnerability data from the local database cache
    without blocking the UI thread.
    """

    finished = QtCore.Signal(list, dict)
    progress = QtCore.Signal(str)
    error = QtCore.Signal(str)

    def __init__(self, database_path: str):
        super().__init__()
        self.database_path = database_path
        self._is_cancelled = False

    @QtCore.Slot()
    def run(self) -> None:
        """Execute database load operation."""
        db: Optional[VulnerabilityDatabase] = None
        try:
            self.progress.emit(f"Opening database: {self.database_path}")

            # Create a new database connection for this thread
            db = VulnerabilityDatabase(self.database_path)

            if self._is_cancelled:
                return

            self.progress.emit("Loading cached vulnerabilities...")
            vulnerabilities = db.get_all_vulnerabilities()

            if self._is_cancelled:
                return

            summary = {
                "source": "cache",
                "count": len(vulnerabilities),
            }

            self.progress.emit(f"Loaded {len(vulnerabilities)} vulnerabilities from cache")
            self.finished.emit(vulnerabilities, summary)

        except Exception as exc:
            if not self._is_cancelled:
                self.error.emit(f"Database error: {str(exc)}")
        finally:
            if db:
                db.close()

    def cancel(self) -> None:
        """Request cancellation of the operation."""
        self._is_cancelled = True


class APISyncWorker(QtCore.QObject):
    """
    Worker for API sync operations that run in a background thread.

    This worker fetches vulnerability data from the Vanta API and stores
    it in the database, with progress updates throughout the operation.
    """

    finished = QtCore.Signal(list, dict)
    progress = QtCore.Signal(str)
    error = QtCore.Signal(str)

    def __init__(self, database_path: str, credentials_path: str = ""):
        super().__init__()
        self.database_path = database_path
        self.credentials_path = credentials_path
        self._is_cancelled = False

    @QtCore.Slot()
    def run(self) -> None:
        """Execute API sync operation."""
        db: Optional[VulnerabilityDatabase] = None
        try:
            # Load credentials
            self.progress.emit("Loading credentials...")
            client_id, client_secret = self._load_credentials()

            if self._is_cancelled:
                return

            if not client_id or not client_secret:
                raise RuntimeError(
                    "No credentials found. Please configure your API credentials via File → Settings."
                )

            # Authenticate with API
            self.progress.emit("Authenticating with Vanta API...")
            client = VantaAPIClient(client_id, client_secret)
            client.authenticate()

            if self._is_cancelled:
                return

            # Fetch active vulnerabilities
            self.progress.emit("Fetching active vulnerabilities from API...")
            active_vulnerabilities = client.get_vulnerabilities()

            if self._is_cancelled:
                return

            self.progress.emit(f"Fetched {len(active_vulnerabilities)} active vulnerabilities")

            # Fetch deactivated vulnerabilities
            self.progress.emit("Fetching remediated vulnerabilities from API...")
            deactivated_vulnerabilities = client.get_vulnerabilities(isDeactivated=True)

            if self._is_cancelled:
                return

            self.progress.emit(f"Fetched {len(deactivated_vulnerabilities)} remediated vulnerabilities")

            # Combine all vulnerabilities
            all_vulnerabilities = active_vulnerabilities + deactivated_vulnerabilities

            # Store in database
            self.progress.emit("Saving to database...")

            # Create a new database connection for this thread
            db = VulnerabilityDatabase(self.database_path)

            sync_stats = db.store_vulnerabilities(all_vulnerabilities, track_changes=True)

            if self._is_cancelled:
                return

            summary = {
                "source": "sync",
                "count": len(all_vulnerabilities),
                "sync_stats": sync_stats,
            }

            self.progress.emit("Sync completed successfully")
            self.finished.emit(all_vulnerabilities, summary)

        except Exception as exc:
            if not self._is_cancelled:
                self.error.emit(f"Sync error: {str(exc)}")
        finally:
            if db:
                db.close()

    def _load_credentials(self) -> tuple[str, str]:
        """Load credentials from keyring or file."""
        # Try keyring first
        client_id, client_secret = CredentialsManager.get_credentials()

        # Fall back to file if keyring credentials not found
        if not client_id or not client_secret:
            if self.credentials_path and os.path.exists(self.credentials_path):
                from vanta_vuln_stats import load_credentials
                client_id, client_secret = load_credentials(self.credentials_path)

        return client_id or "", client_secret or ""

    def cancel(self) -> None:
        """Request cancellation of the operation."""
        self._is_cancelled = True


class StatsCalculationWorker(QtCore.QObject):
    """
    Worker for calculating statistics in a background thread.

    This worker performs statistics calculations on large datasets
    without blocking the UI thread.
    """

    finished = QtCore.Signal(dict)
    progress = QtCore.Signal(str)
    error = QtCore.Signal(str)

    def __init__(self, vulnerabilities: List[Dict], filters: Dict):
        super().__init__()
        self.vulnerabilities = vulnerabilities
        self.filters = filters
        self._is_cancelled = False

    @QtCore.Slot()
    def run(self) -> None:
        """Execute statistics calculation."""
        try:
            self.progress.emit("Calculating statistics...")

            from core.stats import VulnerabilityStats

            stats_processor = VulnerabilityStats(self.vulnerabilities)

            if self._is_cancelled:
                return

            # Apply filters
            filtered_vulnerabilities = stats_processor.filter_vulnerabilities(**self.filters)

            if self._is_cancelled:
                return

            # Generate statistics
            stats = stats_processor.generate_statistics(filtered_vulnerabilities)
            stats["filtered_vulnerabilities"] = filtered_vulnerabilities

            self.progress.emit("Statistics calculation complete")
            self.finished.emit(stats)

        except Exception as exc:
            if not self._is_cancelled:
                self.error.emit(f"Statistics error: {str(exc)}")

    def cancel(self) -> None:
        """Request cancellation of the operation."""
        self._is_cancelled = True


class ThreadManager(QtCore.QObject):
    """
    Manager for coordinating multiple worker threads.

    This class provides a centralized way to manage worker threads,
    ensuring proper cleanup and preventing thread leaks.
    """

    def __init__(self):
        super().__init__()
        self._active_threads: List[tuple[QtCore.QThread, QtCore.QObject]] = []

    def start_worker(
        self,
        worker: QtCore.QObject,
        on_finished: Optional[callable] = None,
        on_error: Optional[callable] = None,
        on_progress: Optional[callable] = None,
    ) -> QtCore.QThread:
        """
        Start a worker in a new thread.

        Args:
            worker: The worker object to run
            on_finished: Optional callback for finished signal
            on_error: Optional callback for error signal
            on_progress: Optional callback for progress signal

        Returns:
            The thread object
        """
        thread = QtCore.QThread()
        worker.moveToThread(thread)

        # Connect signals
        thread.started.connect(worker.run)

        if on_finished and hasattr(worker, "finished"):
            worker.finished.connect(on_finished)

        if on_error and hasattr(worker, "error"):
            worker.error.connect(on_error)

        if on_progress and hasattr(worker, "progress"):
            worker.progress.connect(on_progress)

        # Cleanup when done
        if hasattr(worker, "finished"):
            worker.finished.connect(thread.quit)

        if hasattr(worker, "error"):
            worker.error.connect(thread.quit)

        thread.finished.connect(lambda: self._cleanup_thread(thread, worker))

        # Track the thread
        self._active_threads.append((thread, worker))

        # Start the thread
        thread.start()

        return thread

    def _cleanup_thread(self, thread: QtCore.QThread, worker: QtCore.QObject) -> None:
        """Clean up a finished thread."""
        # Remove from active threads
        self._active_threads = [(t, w) for t, w in self._active_threads if t != thread]

        # Schedule deletion
        worker.deleteLater()
        thread.deleteLater()

    def cancel_all(self) -> None:
        """Cancel all active workers."""
        for thread, worker in self._active_threads:
            if hasattr(worker, "cancel"):
                worker.cancel()
            thread.quit()

    def wait_for_all(self, timeout_ms: int = 5000) -> bool:
        """
        Wait for all threads to finish.

        Args:
            timeout_ms: Maximum time to wait in milliseconds

        Returns:
            True if all threads finished, False if timeout occurred
        """
        all_finished = True
        for thread, _ in self._active_threads:
            if not thread.wait(timeout_ms):
                all_finished = False
                thread.terminate()

        return all_finished

    def has_active_threads(self) -> bool:
        """Check if there are any active threads."""
        return len(self._active_threads) > 0

    def get_active_thread_count(self) -> int:
        """Get the number of active threads."""
        return len(self._active_threads)
