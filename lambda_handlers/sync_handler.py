"""
AWS Lambda handler for syncing vulnerability data from Vanta API.

This handler is optimized for Lambda performance with:
- Lazy imports to reduce cold start time
- Connection pooling for AWS services
- Exponential backoff with jitter for API retries
- Structured logging and metrics via Lambda Powertools
"""

import os
import json
import sys
from typing import Dict, Any, Optional

# Lazy imports for heavy libraries (reduces cold start time)
from lambda_handlers.utils.performance import (
    LazyImport,
    get_aws_client,
    retry_with_backoff,
    get_cold_start_optimizer,
    measure_performance,
    is_lambda_environment,
    get_remaining_time_ms
)

# Lazy imports for heavy dependencies
boto3 = LazyImport('boto3')
pandas_module = LazyImport('pandas')

# Import lightweight standard library and local modules immediately
# These have minimal impact on cold start time
import time
from datetime import datetime

# Lambda Powertools imports (conditional - only if available)
try:
    from aws_lambda_powertools import Logger, Tracer, Metrics
    from aws_lambda_powertools.metrics import MetricUnit
    from aws_lambda_powertools.utilities.typing import LambdaContext

    logger = Logger(service="vanta-vuln-sync")
    tracer = Tracer(service="vanta-vuln-sync")
    metrics = Metrics(namespace="VantaVulnStats", service="sync")
    POWERTOOLS_AVAILABLE = True
except ImportError:
    # Fallback to standard logging if Powertools not available
    import logging
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)
    POWERTOOLS_AVAILABLE = False

    # Create dummy decorators for compatibility
    def tracer_decorator(func):
        return func

    class DummyMetrics:
        def log_metrics(self, **kwargs):
            def decorator(func):
                return func
            return decorator

    tracer = type('obj', (object,), {'capture_lambda_handler': tracer_decorator})()
    metrics = DummyMetrics()

# Mark cold start optimizer as initialized after imports
cold_start_optimizer = get_cold_start_optimizer()


class VantaSyncHandler:
    """
    Handler class for Vanta vulnerability sync Lambda function.

    This class encapsulates the sync logic and is optimized for Lambda
    with lazy initialization and connection reuse.
    """

    def __init__(self):
        """Initialize handler with lazy-loaded dependencies."""
        self._vanta_client = None
        self._s3_client = None
        self._secrets_client = None
        self._credentials = None

    @retry_with_backoff(max_retries=3, base_delay=1.0, exceptions=(Exception,))
    def _get_credentials(self) -> Dict[str, str]:
        """
        Get Vanta API credentials from AWS Secrets Manager with retry logic.

        Returns:
            Dictionary with client_id and client_secret

        Raises:
            Exception: If credentials cannot be retrieved
        """
        if self._credentials:
            return self._credentials

        # Try environment variables first (fastest)
        client_id = os.environ.get('VANTA_CLIENT_ID')
        client_secret = os.environ.get('VANTA_CLIENT_SECRET')

        if client_id and client_secret:
            logger.info("Using credentials from environment variables")
            self._credentials = {
                'client_id': client_id,
                'client_secret': client_secret
            }
            return self._credentials

        # Try AWS Secrets Manager
        secret_name = os.environ.get('VANTA_CREDENTIALS_SECRET', 'vanta-api-credentials')

        if not self._secrets_client:
            self._secrets_client = get_aws_client('secretsmanager')

        logger.info(f"Fetching credentials from Secrets Manager: {secret_name}")
        response = self._secrets_client.get_secret_value(SecretId=secret_name)

        secret_data = json.loads(response['SecretString'])
        self._credentials = {
            'client_id': secret_data['client_id'],
            'client_secret': secret_data['client_secret']
        }

        return self._credentials

    @measure_performance
    def _init_vanta_client(self) -> Any:
        """
        Initialize Vanta API client with lazy loading.

        Returns:
            VantaAPIClient instance
        """
        if self._vanta_client:
            return self._vanta_client

        # Lazy import core modules only when needed
        sys.path.insert(0, '/opt/python')  # Lambda layer path
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

        from core.api_client import VantaAPIClient

        credentials = self._get_credentials()
        self._vanta_client = VantaAPIClient(
            client_id=credentials['client_id'],
            client_secret=credentials['client_secret']
        )

        logger.info("Vanta API client initialized")
        return self._vanta_client

    @retry_with_backoff(max_retries=3, base_delay=2.0)
    @measure_performance
    def _fetch_vulnerabilities(self, context: Optional[Any] = None) -> list:
        """
        Fetch vulnerabilities from Vanta API with retry logic.

        Args:
            context: Lambda context for timeout management

        Returns:
            List of vulnerabilities
        """
        vanta_client = self._init_vanta_client()

        logger.info("Fetching vulnerabilities from Vanta API")

        # Check remaining time if in Lambda environment
        if context and is_lambda_environment():
            remaining_ms = get_remaining_time_ms(context)
            if remaining_ms < 30000:  # Less than 30 seconds remaining
                logger.warning(f"Low remaining time: {remaining_ms}ms. May need to handle partial fetch.")

        vulnerabilities = vanta_client.get_vulnerabilities(page_size=100)

        logger.info(f"Fetched {len(vulnerabilities)} vulnerabilities")

        if POWERTOOLS_AVAILABLE:
            metrics.add_metric(name="VulnerabilitiesFetched", unit=MetricUnit.Count, value=len(vulnerabilities))

        return vulnerabilities

    @retry_with_backoff(max_retries=3, base_delay=2.0)
    @measure_performance
    def _fetch_remediations(self, context: Optional[Any] = None) -> list:
        """
        Fetch vulnerability remediations from Vanta API with retry logic.

        Args:
            context: Lambda context for timeout management

        Returns:
            List of remediations
        """
        vanta_client = self._init_vanta_client()

        logger.info("Fetching remediations from Vanta API")

        remediations = vanta_client.get_vulnerability_remediations(page_size=100)

        logger.info(f"Fetched {len(remediations)} remediations")

        if POWERTOOLS_AVAILABLE:
            metrics.add_metric(name="RemediationsFetched", unit=MetricUnit.Count, value=len(remediations))

        return remediations

    @measure_performance
    def _store_to_s3(self, data: list, data_type: str, timestamp: str) -> str:
        """
        Store data to S3 with optimized uploads.

        Args:
            data: List of vulnerability or remediation records
            data_type: Type of data ('vulnerabilities' or 'remediations')
            timestamp: Timestamp for partitioning

        Returns:
            S3 URI of stored data
        """
        if not self._s3_client:
            self._s3_client = get_aws_client('s3')

        bucket = os.environ.get('S3_BUCKET', 'vanta-vuln-data')
        date_parts = timestamp.split('T')[0].split('-')
        year, month, day = date_parts[0], date_parts[1], date_parts[2]

        # Create partitioned path
        s3_key = f"{data_type}/year={year}/month={month}/day={day}/data_{timestamp}.json"

        logger.info(f"Storing {len(data)} records to s3://{bucket}/{s3_key}")

        # Convert to JSON and upload
        json_data = json.dumps(data, indent=2)

        self._s3_client.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=json_data,
            ContentType='application/json'
        )

        s3_uri = f"s3://{bucket}/{s3_key}"
        logger.info(f"Data stored successfully: {s3_uri}")

        if POWERTOOLS_AVAILABLE:
            metrics.add_metric(name="RecordsStored", unit=MetricUnit.Count, value=len(data))

        return s3_uri

    @measure_performance
    def sync_vulnerabilities(self, context: Optional[Any] = None) -> Dict[str, Any]:
        """
        Main sync logic for vulnerabilities.

        Args:
            context: Lambda context object

        Returns:
            Dictionary with sync results
        """
        timestamp = datetime.utcnow().isoformat()

        try:
            # Fetch data from Vanta API
            vulnerabilities = self._fetch_vulnerabilities(context)
            remediations = self._fetch_remediations(context)

            # Store to S3
            vuln_uri = self._store_to_s3(vulnerabilities, 'vulnerabilities', timestamp)
            remediation_uri = self._store_to_s3(remediations, 'remediations', timestamp)

            result = {
                'status': 'success',
                'timestamp': timestamp,
                'vulnerabilities': {
                    'count': len(vulnerabilities),
                    's3_uri': vuln_uri
                },
                'remediations': {
                    'count': len(remediations),
                    's3_uri': remediation_uri
                }
            }

            logger.info("Sync completed successfully", extra=result)

            if POWERTOOLS_AVAILABLE:
                metrics.add_metric(name="SyncSuccess", unit=MetricUnit.Count, value=1)

            return result

        except Exception as e:
            logger.error(f"Sync failed: {str(e)}", exc_info=True)

            if POWERTOOLS_AVAILABLE:
                metrics.add_metric(name="SyncFailure", unit=MetricUnit.Count, value=1)

            raise


# Global handler instance (reused across warm starts)
_handler_instance = None


def get_handler() -> VantaSyncHandler:
    """Get or create the global handler instance."""
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = VantaSyncHandler()
        cold_start_optimizer.mark_initialized()
    return _handler_instance


@tracer.capture_lambda_handler if POWERTOOLS_AVAILABLE else lambda x: x
@metrics.log_metrics(capture_cold_start_metric=True) if POWERTOOLS_AVAILABLE else lambda x: x
def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda function entry point for Vanta vulnerability sync.

    This handler is optimized for performance with:
    - Lazy imports to reduce cold start time
    - Connection pooling for AWS services
    - Exponential backoff with jitter for retries
    - CloudWatch metrics and structured logging

    Args:
        event: Lambda event object
        context: Lambda context object

    Returns:
        Dictionary with sync results

    Environment Variables:
        VANTA_CLIENT_ID: Vanta API client ID (optional if using Secrets Manager)
        VANTA_CLIENT_SECRET: Vanta API client secret (optional if using Secrets Manager)
        VANTA_CREDENTIALS_SECRET: Secrets Manager secret name (default: 'vanta-api-credentials')
        S3_BUCKET: S3 bucket for storing data (default: 'vanta-vuln-data')
        MAX_POOL_CONNECTIONS: Max connections in pool (default: '50')
    """
    # Log cold start metrics
    cold_start_metrics = cold_start_optimizer.get_metrics()
    logger.info("Lambda invocation", extra={
        'cold_start': cold_start_metrics['is_cold_start'],
        'init_duration_ms': cold_start_metrics['init_duration_ms'],
        'event': event
    })

    # Get handler instance (reuses across warm starts)
    handler = get_handler()

    # Execute sync
    result = handler.sync_vulnerabilities(context)

    return {
        'statusCode': 200,
        'body': json.dumps(result),
        'headers': {
            'Content-Type': 'application/json'
        }
    }
