"""
Credentials dialog for entering and managing Vanta API credentials.

This dialog provides a user-friendly interface for entering API credentials
that will be securely stored in the system keychain via CredentialsManager.
"""

from PySide6 import QtCore, QtWidgets

from gui.credentials_manager import CredentialsManager


class CredentialsDialog(QtWidgets.QDialog):
    """Dialog for entering Vanta API credentials."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Vanta API Credentials")
        self.setModal(True)
        self.resize(500, 200)

        # Check if we already have stored credentials
        self._has_existing_credentials = CredentialsManager.has_credentials()

        self._build_ui()

    def _build_ui(self) -> None:
        """Build the dialog UI."""
        layout = QtWidgets.QVBoxLayout(self)

        # Info label
        info_label = QtWidgets.QLabel(
            "Enter your Vanta API credentials. They will be stored securely "
            "in your system's keychain (encrypted by your operating system)."
        )
        info_label.setWordWrap(True)
        layout.addWidget(info_label)

        # Backend info
        backend = CredentialsManager.get_backend_info()
        backend_label = QtWidgets.QLabel(f"Keyring backend: {backend}")
        backend_label.setStyleSheet("color: gray; font-size: 10px;")
        layout.addWidget(backend_label)

        layout.addSpacing(10)

        # Form layout for credentials
        form_layout = QtWidgets.QFormLayout()

        self.client_id_edit = QtWidgets.QLineEdit()
        self.client_id_edit.setPlaceholderText("Enter Vanta API Client ID")
        form_layout.addRow("Client ID:", self.client_id_edit)

        self.client_secret_edit = QtWidgets.QLineEdit()
        self.client_secret_edit.setPlaceholderText("Enter Vanta API Client Secret")
        self.client_secret_edit.setEchoMode(QtWidgets.QLineEdit.EchoMode.Password)
        form_layout.addRow("Client Secret:", self.client_secret_edit)

        # Show/hide password checkbox
        self.show_password_checkbox = QtWidgets.QCheckBox("Show client secret")
        self.show_password_checkbox.stateChanged.connect(self._toggle_password_visibility)
        form_layout.addRow("", self.show_password_checkbox)

        layout.addLayout(form_layout)

        # Show existing credentials status
        if self._has_existing_credentials:
            existing_label = QtWidgets.QLabel(
                "✅ Credentials are already stored in keychain. "
                "Enter new values to update them."
            )
            existing_label.setStyleSheet("color: green;")
            existing_label.setWordWrap(True)
            layout.addWidget(existing_label)

        layout.addSpacing(10)

        # Button box
        button_box = QtWidgets.QDialogButtonBox()

        # Save button
        self.save_button = button_box.addButton("Save", QtWidgets.QDialogButtonBox.ButtonRole.AcceptRole)
        self.save_button.clicked.connect(self._save_credentials)

        # Cancel button
        cancel_button = button_box.addButton(QtWidgets.QDialogButtonBox.StandardButton.Cancel)
        cancel_button.clicked.connect(self.reject)

        # Delete button (only if credentials exist)
        if self._has_existing_credentials:
            delete_button = button_box.addButton("Delete Saved", QtWidgets.QDialogButtonBox.ButtonRole.DestructiveRole)
            delete_button.clicked.connect(self._delete_credentials)

        layout.addWidget(button_box)

    def _toggle_password_visibility(self, state: int) -> None:
        """Toggle password visibility."""
        if state == QtCore.Qt.CheckState.Checked.value:
            self.client_secret_edit.setEchoMode(QtWidgets.QLineEdit.EchoMode.Normal)
        else:
            self.client_secret_edit.setEchoMode(QtWidgets.QLineEdit.EchoMode.Password)

    def _save_credentials(self) -> None:
        """Save credentials to keychain."""
        client_id = self.client_id_edit.text().strip()
        client_secret = self.client_secret_edit.text().strip()

        if not client_id or not client_secret:
            QtWidgets.QMessageBox.warning(
                self,
                "Missing Information",
                "Please enter both Client ID and Client Secret.",
            )
            return

        # Store credentials
        success = CredentialsManager.store_credentials(client_id, client_secret)

        if success:
            QtWidgets.QMessageBox.information(
                self,
                "Credentials Saved",
                "Your API credentials have been securely stored in the system keychain.",
            )
            self.accept()
        else:
            QtWidgets.QMessageBox.critical(
                self,
                "Save Failed",
                "Failed to store credentials in the system keychain. "
                "Check the application logs for details.",
            )

    def _delete_credentials(self) -> None:
        """Delete stored credentials from keychain."""
        reply = QtWidgets.QMessageBox.question(
            self,
            "Delete Credentials",
            "Are you sure you want to delete the stored API credentials from your system keychain?",
            QtWidgets.QMessageBox.StandardButton.Yes | QtWidgets.QMessageBox.StandardButton.No,
            QtWidgets.QMessageBox.StandardButton.No,
        )

        if reply == QtWidgets.QMessageBox.StandardButton.Yes:
            success = CredentialsManager.delete_credentials()

            if success:
                QtWidgets.QMessageBox.information(
                    self,
                    "Credentials Deleted",
                    "Your API credentials have been removed from the system keychain.",
                )
                self.reject()
            else:
                QtWidgets.QMessageBox.critical(
                    self,
                    "Delete Failed",
                    "Failed to delete credentials from the system keychain. "
                    "Check the application logs for details.",
                )

    @staticmethod
    def prompt_for_credentials(parent=None) -> bool:
        """
        Show the credentials dialog and return whether credentials are now available.

        Args:
            parent: Parent widget for the dialog

        Returns:
            True if credentials are available after the dialog closes
        """
        dialog = CredentialsDialog(parent)
        dialog.exec()
        return CredentialsManager.has_credentials()
