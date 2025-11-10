"""
Thread-Safe Database Connection Manager

This module provides a connection pool and manager for thread-safe
database access in multi-threaded Qt applications.
"""

import sqlite3
import threading
from contextlib import contextmanager
from typing import Optional

from PySide6 import QtCore

from core.database import VulnerabilityDatabase


class DatabaseConnectionPool:
    """
    Thread-safe connection pool for SQLite databases.

    SQLite connections should not be shared across threads. This pool
    creates a separate connection for each thread that requests one.
    """

    def __init__(self, database_path: str, max_connections: int = 10):
        """
        Initialize the connection pool.

        Args:
            database_path: Path to the SQLite database
            max_connections: Maximum number of concurrent connections
        """
        self.database_path = database_path
        self.max_connections = max_connections
        self._lock = threading.Lock()
        self._connections: dict[int, VulnerabilityDatabase] = {}
        self._connection_count = 0

    def get_connection(self) -> VulnerabilityDatabase:
        """
        Get a database connection for the current thread.

        Returns:
            A VulnerabilityDatabase instance for this thread
        """
        thread_id = threading.get_ident()

        with self._lock:
            # Return existing connection for this thread
            if thread_id in self._connections:
                return self._connections[thread_id]

            # Check connection limit
            if self._connection_count >= self.max_connections:
                raise RuntimeError(
                    f"Maximum number of database connections ({self.max_connections}) reached"
                )

            # Create new connection for this thread
            db = VulnerabilityDatabase(self.database_path)
            self._connections[thread_id] = db
            self._connection_count += 1

            return db

    def release_connection(self, thread_id: Optional[int] = None) -> None:
        """
        Release the database connection for a thread.

        Args:
            thread_id: Thread ID to release, or None for current thread
        """
        if thread_id is None:
            thread_id = threading.get_ident()

        with self._lock:
            if thread_id in self._connections:
                db = self._connections[thread_id]
                db.close()
                del self._connections[thread_id]
                self._connection_count -= 1

    def close_all(self) -> None:
        """Close all connections in the pool."""
        with self._lock:
            for db in self._connections.values():
                db.close()
            self._connections.clear()
            self._connection_count = 0

    def get_active_connection_count(self) -> int:
        """Get the number of active connections."""
        with self._lock:
            return self._connection_count

    @contextmanager
    def connection(self):
        """
        Context manager for getting and releasing connections.

        Usage:
            with pool.connection() as db:
                vulnerabilities = db.get_all_vulnerabilities()
        """
        conn = self.get_connection()
        try:
            yield conn
        finally:
            # Note: We don't auto-release here because the same thread
            # might want to use the connection again. Call release_connection()
            # explicitly when the thread is done.
            pass


class DatabaseManager(QtCore.QObject):
    """
    Qt-aware database manager for GUI applications.

    This manager provides thread-safe database access with Qt signal
    integration for monitoring connection status and errors.
    """

    connectionOpened = QtCore.Signal(int)  # Emits thread ID
    connectionClosed = QtCore.Signal(int)  # Emits thread ID
    error = QtCore.Signal(str)

    def __init__(self, database_path: str, parent: Optional[QtCore.QObject] = None):
        super().__init__(parent)
        self.database_path = database_path
        self._pool = DatabaseConnectionPool(database_path)
        self._lock = QtCore.QMutex()

    def get_connection(self) -> VulnerabilityDatabase:
        """
        Get a database connection for the current thread.

        Returns:
            A VulnerabilityDatabase instance
        """
        try:
            locker = QtCore.QMutexLocker(self._lock)
            db = self._pool.get_connection()
            locker.unlock()

            thread_id = threading.get_ident()
            self.connectionOpened.emit(thread_id)

            return db

        except Exception as exc:
            self.error.emit(f"Failed to get database connection: {str(exc)}")
            raise

    def release_connection(self, thread_id: Optional[int] = None) -> None:
        """
        Release a database connection.

        Args:
            thread_id: Thread ID to release, or None for current thread
        """
        try:
            locker = QtCore.QMutexLocker(self._lock)

            if thread_id is None:
                thread_id = threading.get_ident()

            self._pool.release_connection(thread_id)
            locker.unlock()

            self.connectionClosed.emit(thread_id)

        except Exception as exc:
            self.error.emit(f"Failed to release database connection: {str(exc)}")

    def close_all(self) -> None:
        """Close all database connections."""
        locker = QtCore.QMutexLocker(self._lock)
        self._pool.close_all()
        locker.unlock()

    def get_active_connection_count(self) -> int:
        """Get the number of active connections."""
        locker = QtCore.QMutexLocker(self._lock)
        count = self._pool.get_active_connection_count()
        locker.unlock()
        return count

    @contextmanager
    def connection(self):
        """
        Context manager for database connections.

        Usage:
            with db_manager.connection() as db:
                vulnerabilities = db.get_all_vulnerabilities()
        """
        conn = self.get_connection()
        try:
            yield conn
        except Exception as exc:
            self.error.emit(f"Database operation error: {str(exc)}")
            raise


class DatabaseCache(QtCore.QObject):
    """
    In-memory cache for frequently accessed database queries.

    This cache reduces database load for repeated queries and provides
    faster access to commonly used data.
    """

    cacheUpdated = QtCore.Signal()
    cacheCleared = QtCore.Signal()

    def __init__(self, parent: Optional[QtCore.QObject] = None):
        super().__init__(parent)
        self._cache: dict[str, any] = {}
        self._lock = QtCore.QReadWriteLock()

    def get(self, key: str) -> Optional[any]:
        """
        Get a value from the cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found
        """
        locker = QtCore.QReadLocker(self._lock)
        return self._cache.get(key)

    def set(self, key: str, value: any) -> None:
        """
        Set a value in the cache.

        Args:
            key: Cache key
            value: Value to cache
        """
        locker = QtCore.QWriteLocker(self._lock)
        self._cache[key] = value
        locker.unlock()
        self.cacheUpdated.emit()

    def invalidate(self, key: str) -> None:
        """
        Invalidate a specific cache entry.

        Args:
            key: Cache key to invalidate
        """
        locker = QtCore.QWriteLocker(self._lock)
        if key in self._cache:
            del self._cache[key]

    def clear(self) -> None:
        """Clear all cache entries."""
        locker = QtCore.QWriteLocker(self._lock)
        self._cache.clear()
        locker.unlock()
        self.cacheCleared.emit()

    def has(self, key: str) -> bool:
        """Check if a key exists in the cache."""
        locker = QtCore.QReadLocker(self._lock)
        return key in self._cache

    def size(self) -> int:
        """Get the number of items in the cache."""
        locker = QtCore.QReadLocker(self._lock)
        return len(self._cache)
