"""Network connectivity monitoring utilities for the GUI.

This module provides a Qt-based network monitor that periodically
checks whether the application has internet connectivity. The monitor
emits signals when connectivity changes so the UI can update status
indicators (e.g., offline/online icons) and adjust behaviour such as
disabling sync actions while offline.
"""

from __future__ import annotations

from typing import Optional

from PySide6 import QtCore, QtNetwork


class NetworkMonitor(QtCore.QObject):
    """Periodically check for internet connectivity.

    The monitor performs lightweight HEAD requests against a configurable
    URL to determine if the application can reach the internet. Results are
    emitted through the :pyattr:`statusChanged` signal when connectivity
    changes. A small timeout is enforced to avoid hanging requests when
    the network is unreachable.
    """

    statusChanged = QtCore.Signal(bool)
    """Emitted when connectivity changes (``True`` for online)."""

    checkStarted = QtCore.Signal()
    """Emitted whenever a connectivity check begins."""

    checkFinished = QtCore.Signal(bool)
    """Emitted when a check completes with the resulting status."""

    def __init__(
        self,
        test_url: str = "https://api.vanta.com/",
        interval_ms: int = 15_000,
        timeout_ms: int = 5_000,
        parent: Optional[QtCore.QObject] = None,
    ) -> None:
        super().__init__(parent)
        self._test_url = QtCore.QUrl(test_url)
        self._interval_ms = interval_ms
        self._timeout_ms = timeout_ms

        self._network_manager = QtNetwork.QNetworkAccessManager(self)
        self._timer = QtCore.QTimer(self)
        self._timer.setInterval(self._interval_ms)
        self._timer.timeout.connect(self._perform_check)

        self._timeout_timer = QtCore.QTimer(self)
        self._timeout_timer.setSingleShot(True)
        self._timeout_timer.timeout.connect(self._handle_timeout)

        self._current_reply: Optional[QtNetwork.QNetworkReply] = None
        self._is_online: Optional[bool] = None

        self._network_manager.finished.connect(self._handle_reply)

    def start(self) -> None:
        """Start monitoring connectivity."""

        if not self._timer.isActive():
            # Emit an initial status using Qt's network configuration state
            config_manager = QtNetwork.QNetworkConfigurationManager()
            self._apply_status(config_manager.isOnline())

            self._perform_check()
            self._timer.start()

    def stop(self) -> None:
        """Stop monitoring connectivity."""

        self._timer.stop()
        self._timeout_timer.stop()
        if self._current_reply is not None:
            self._current_reply.abort()
            self._current_reply.deleteLater()
            self._current_reply = None

    def is_online(self) -> Optional[bool]:
        """Return the most recently observed connectivity status."""

        return self._is_online

    # Internal helpers -------------------------------------------------

    def _perform_check(self) -> None:
        if self._current_reply is not None:
            # A check is already running; avoid overlapping requests.
            return

        self.checkStarted.emit()

        request = QtNetwork.QNetworkRequest(self._test_url)
        request.setAttribute(
            QtNetwork.QNetworkRequest.FollowRedirectsAttribute,
            True,
        )
        request.setRawHeader(b"User-Agent", b"VantaVulnStatsOfflineMonitor/1.0")

        self._current_reply = self._network_manager.head(request)
        self._timeout_timer.start(self._timeout_ms)

    def _handle_reply(self, reply: QtNetwork.QNetworkReply) -> None:
        if reply is not self._current_reply:
            reply.deleteLater()
            return

        self._timeout_timer.stop()

        status_code = reply.attribute(
            QtNetwork.QNetworkRequest.HttpStatusCodeAttribute
        )
        network_error = reply.error()

        if network_error == QtNetwork.QNetworkReply.NetworkError.NoError:
            online = True
        else:
            # Consider HTTP responses below 500 as proof of connectivity
            # even if Qt surfaces them as errors (e.g., 403/404).
            if status_code is not None:
                try:
                    online = int(status_code) < 500
                except (TypeError, ValueError):
                    online = False
            else:
                online = False

        self._finalize_reply(reply, online)

    def _handle_timeout(self) -> None:
        if self._current_reply is not None:
            self._current_reply.abort()
            self._current_reply.deleteLater()
            self._current_reply = None

        self._apply_status(False)
        self.checkFinished.emit(False)

    def _finalize_reply(
        self, reply: QtNetwork.QNetworkReply, online: bool
    ) -> None:
        self._apply_status(online)
        self.checkFinished.emit(online)

        reply.deleteLater()
        self._current_reply = None

    def _apply_status(self, online: bool) -> None:
        if self._is_online is None or self._is_online != online:
            self._is_online = online
            self.statusChanged.emit(online)

