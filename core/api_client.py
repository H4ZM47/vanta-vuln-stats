"""
Vanta API Client

This module provides a client for interacting with the Vanta API to fetch
vulnerability data and remediation records.
"""

import sys
import time
from typing import Dict, List, Optional, Any, Callable

import requests


class VantaAPIClient:
    """Client for interacting with Vanta API"""

    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.auth_url = "https://api.vanta.com"
        self.base_url = "https://api.vanta.com/v1"
        self.access_token = None

    def authenticate(self) -> None:
        """Authenticate and get access token"""
        url = f"{self.auth_url}/oauth/token"
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "vanta-api.all:read",
            "grant_type": "client_credentials"
        }
        headers = {"Content-Type": "application/json"}

        try:
            response = requests.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            self.access_token = data.get("access_token")
            if not self.access_token:
                raise Exception("No access token in response")
        except requests.exceptions.RequestException as e:
            raise Exception(f"Authentication failed: {str(e)}")

    def get_vulnerabilities(
        self,
        page_size: int = 100,
        batch_callback: Optional[Callable[[List[Dict]], None]] = None,
        **filters
    ) -> List[Dict]:
        """
        Fetch all vulnerabilities with optional filters

        Args:
            page_size: Number of vulnerabilities per page
            batch_callback: Optional callback function called with each batch of vulnerabilities
            **filters: Additional API filters (severity, isDeactivated, etc.)

        Returns:
            List of all vulnerabilities
        """
        if not self.access_token:
            self.authenticate()

        all_vulnerabilities = []
        page_cursor = None

        while True:
            url = f"{self.base_url}/vulnerabilities"
            params = {"pageSize": page_size}

            # Add filters
            for key, value in filters.items():
                if value is not None:
                    params[key] = value

            if page_cursor:
                params["pageCursor"] = page_cursor

            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json"
            }

            try:
                response = requests.get(url, params=params, headers=headers)

                # Handle rate limiting with exponential backoff
                if response.status_code == 429:
                    retry_after = int(response.headers.get('Retry-After', 60))
                    print(f"Rate limit hit. Waiting {retry_after} seconds...", file=sys.stderr)
                    time.sleep(retry_after)
                    continue  # Retry this request

                response.raise_for_status()
                data = response.json()

                # The API returns a "results" object containing "data" and "pageInfo"
                results_obj = data.get("results", {})
                vulnerabilities_list = results_obj.get("data", [])
                all_vulnerabilities.extend(vulnerabilities_list)

                # Call batch callback if provided
                if batch_callback and vulnerabilities_list:
                    batch_callback(vulnerabilities_list)

                # Check for next page in pageInfo
                page_info = results_obj.get("pageInfo", {})
                has_next_page = page_info.get("hasNextPage", False)
                page_cursor = page_info.get("endCursor") if has_next_page else None

                # Add small delay between requests to avoid rate limiting
                time.sleep(0.5)

                if not has_next_page:
                    break

            except requests.exceptions.RequestException as e:
                if '429' in str(e):
                    # Rate limit error - wait and retry
                    print(f"Rate limit hit. Waiting 60 seconds...", file=sys.stderr)
                    time.sleep(60)
                    continue
                raise Exception(f"Failed to fetch vulnerabilities: {str(e)}")

        return all_vulnerabilities

    def get_vulnerability_remediations(
        self,
        page_size: int = 100,
        batch_callback: Optional[Callable[[List[Dict]], None]] = None,
        **filters
    ) -> List[Dict]:
        """Fetch all vulnerability remediation records with optional filters."""

        if not self.access_token:
            self.authenticate()

        all_remediations: List[Dict] = []
        page_cursor = None

        while True:
            url = f"{self.base_url}/vulnerability-remediations"
            params: Dict[str, Any] = {"pageSize": page_size}

            for key, value in filters.items():
                if value is not None:
                    params[key] = value

            if page_cursor:
                params["pageCursor"] = page_cursor

            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            }

            try:
                response = requests.get(url, params=params, headers=headers)

                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    print(
                        f"Rate limit hit. Waiting {retry_after} seconds...",
                        file=sys.stderr,
                    )
                    time.sleep(retry_after)
                    continue

                response.raise_for_status()
                data = response.json()

                results_obj = data.get("results", {})
                remediations_list = results_obj.get("data", [])
                all_remediations.extend(remediations_list)

                if batch_callback and remediations_list:
                    batch_callback(remediations_list)

                page_info = results_obj.get("pageInfo", {})
                has_next_page = page_info.get("hasNextPage", False)
                page_cursor = page_info.get("endCursor") if has_next_page else None

                time.sleep(0.5)

                if not has_next_page:
                    break

            except requests.exceptions.RequestException as e:
                if "429" in str(e):
                    print("Rate limit hit. Waiting 60 seconds...", file=sys.stderr)
                    time.sleep(60)
                    continue
                raise Exception(
                    f"Failed to fetch vulnerability remediations: {str(e)}"
                )

        return all_remediations
