"""
Secure credentials storage using system keychain.

This module provides a secure wrapper around the keyring library for storing
and retrieving Vanta API credentials. Credentials are never stored in plaintext
and are encrypted by the operating system's native credential storage:

- macOS: Keychain Access (encrypted)
- Windows: Credential Manager (encrypted)
- Linux: Secret Service API / gnome-keyring (encrypted)

Security Level: 🔒 Encrypted
Storage: System Keychain (OS-managed)
"""

import logging
from typing import Optional, Tuple

import keyring
from keyring.errors import KeyringError

logger = logging.getLogger(__name__)

# Application identifier for keychain entries
SERVICE_NAME = "VantaVulnStats"
CLIENT_ID_KEY = "client_id"
CLIENT_SECRET_KEY = "client_secret"


class CredentialsManager:
    """Manages secure storage and retrieval of API credentials."""

    @staticmethod
    def store_credentials(client_id: str, client_secret: str) -> bool:
        """
        Store credentials securely in the system keychain.

        Args:
            client_id: Vanta API client ID
            client_secret: Vanta API client secret

        Returns:
            True if credentials were stored successfully, False otherwise
        """
        try:
            keyring.set_password(SERVICE_NAME, CLIENT_ID_KEY, client_id)
            keyring.set_password(SERVICE_NAME, CLIENT_SECRET_KEY, client_secret)
            logger.info("Credentials stored securely in system keychain")
            return True
        except KeyringError as exc:
            logger.error(f"Failed to store credentials: {exc}")
            return False
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Unexpected error storing credentials: {exc}")
            return False

    @staticmethod
    def get_credentials() -> Tuple[Optional[str], Optional[str]]:
        """
        Retrieve credentials from the system keychain.

        Returns:
            Tuple of (client_id, client_secret), or (None, None) if not found
        """
        try:
            client_id = keyring.get_password(SERVICE_NAME, CLIENT_ID_KEY)
            client_secret = keyring.get_password(SERVICE_NAME, CLIENT_SECRET_KEY)

            if client_id and client_secret:
                logger.info("Credentials retrieved from system keychain")
                return (client_id, client_secret)
            else:
                logger.info("No credentials found in system keychain")
                return (None, None)
        except KeyringError as exc:
            logger.error(f"Failed to retrieve credentials: {exc}")
            return (None, None)
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Unexpected error retrieving credentials: {exc}")
            return (None, None)

    @staticmethod
    def has_credentials() -> bool:
        """
        Check if credentials are stored in the keychain.

        Returns:
            True if both client_id and client_secret are present
        """
        client_id, client_secret = CredentialsManager.get_credentials()
        return client_id is not None and client_secret is not None

    @staticmethod
    def delete_credentials() -> bool:
        """
        Remove credentials from the system keychain.

        Returns:
            True if credentials were deleted successfully, False otherwise
        """
        try:
            keyring.delete_password(SERVICE_NAME, CLIENT_ID_KEY)
            keyring.delete_password(SERVICE_NAME, CLIENT_SECRET_KEY)
            logger.info("Credentials deleted from system keychain")
            return True
        except keyring.errors.PasswordDeleteError:
            logger.warning("Credentials not found when attempting to delete")
            return True  # Not an error if they don't exist
        except KeyringError as exc:
            logger.error(f"Failed to delete credentials: {exc}")
            return False
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Unexpected error deleting credentials: {exc}")
            return False

    @staticmethod
    def get_backend_info() -> str:
        """
        Get information about the keyring backend being used.

        Returns:
            String describing the active keyring backend
        """
        try:
            backend = keyring.get_keyring()
            return f"{backend.__class__.__module__}.{backend.__class__.__name__}"
        except Exception as exc:  # noqa: BLE001
            return f"Unknown backend: {exc}"
