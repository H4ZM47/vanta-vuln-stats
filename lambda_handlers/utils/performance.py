"""
Lambda performance optimization utilities.

This module provides utilities for optimizing Lambda function performance:
- Lazy imports for heavy libraries
- Connection pooling for AWS services
- Exponential backoff with jitter
- Cold start optimization
"""

import os
import time
import random
from typing import Optional, Any, Callable, TypeVar
from functools import wraps

# Type variable for generic function return types
T = TypeVar('T')


class LazyImport:
    """
    Lazy import wrapper to defer heavy library imports until first use.
    This reduces Lambda cold start time by only loading modules when needed.

    Example:
        boto3 = LazyImport('boto3')
        # boto3 is only imported when first accessed
        s3_client = boto3.client('s3')
    """

    def __init__(self, module_name: str):
        self.module_name = module_name
        self._module = None

    def __getattr__(self, name: str) -> Any:
        if self._module is None:
            import importlib
            self._module = importlib.import_module(self.module_name)
        return getattr(self._module, name)


class ConnectionPool:
    """
    Connection pool for AWS service clients to reuse connections across
    Lambda invocations (warm starts). This reduces latency by avoiding
    repeated client initialization.

    Example:
        pool = ConnectionPool()
        s3_client = pool.get_client('s3')
        # Client is reused on subsequent invocations
    """

    def __init__(self):
        self._clients = {}
        self._resources = {}
        # Use lazy import for boto3
        self._boto3 = LazyImport('boto3')

    def get_client(self, service_name: str, **kwargs) -> Any:
        """
        Get or create a boto3 client for the specified service.

        Args:
            service_name: AWS service name (e.g., 's3', 'secretsmanager')
            **kwargs: Additional client configuration

        Returns:
            Boto3 client instance
        """
        cache_key = f"{service_name}:{str(kwargs)}"

        if cache_key not in self._clients:
            # Configure client with connection pooling
            config_kwargs = {
                'max_pool_connections': int(os.environ.get('MAX_POOL_CONNECTIONS', '50')),
                **kwargs
            }
            self._clients[cache_key] = self._boto3.client(service_name, **config_kwargs)

        return self._clients[cache_key]

    def get_resource(self, service_name: str, **kwargs) -> Any:
        """
        Get or create a boto3 resource for the specified service.

        Args:
            service_name: AWS service name (e.g., 's3', 'dynamodb')
            **kwargs: Additional resource configuration

        Returns:
            Boto3 resource instance
        """
        cache_key = f"{service_name}:{str(kwargs)}"

        if cache_key not in self._resources:
            self._resources[cache_key] = self._boto3.resource(service_name, **kwargs)

        return self._resources[cache_key]

    def clear(self) -> None:
        """Clear all cached clients and resources."""
        self._clients.clear()
        self._resources.clear()


# Global connection pool instance (reused across warm starts)
_global_pool = ConnectionPool()


def get_aws_client(service_name: str, **kwargs) -> Any:
    """
    Get an AWS service client from the global connection pool.

    Args:
        service_name: AWS service name (e.g., 's3', 'secretsmanager')
        **kwargs: Additional client configuration

    Returns:
        Boto3 client instance
    """
    return _global_pool.get_client(service_name, **kwargs)


def get_aws_resource(service_name: str, **kwargs) -> Any:
    """
    Get an AWS service resource from the global connection pool.

    Args:
        service_name: AWS service name (e.g., 's3', 'dynamodb')
        **kwargs: Additional resource configuration

    Returns:
        Boto3 resource instance
    """
    return _global_pool.get_resource(service_name, **kwargs)


def exponential_backoff_with_jitter(
    func: Callable[..., T],
    max_retries: int = 5,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter: bool = True,
    exceptions: tuple = (Exception,)
) -> Callable[..., T]:
    """
    Decorator that implements exponential backoff with optional jitter for retries.

    This implements the AWS recommended retry strategy with full jitter to avoid
    thundering herd problems when multiple Lambda functions retry simultaneously.

    Args:
        func: Function to wrap with retry logic
        max_retries: Maximum number of retry attempts (default: 5)
        base_delay: Base delay in seconds (default: 1.0)
        max_delay: Maximum delay in seconds (default: 60.0)
        jitter: Whether to add random jitter (default: True)
        exceptions: Tuple of exception types to catch and retry (default: (Exception,))

    Returns:
        Wrapped function with retry logic

    Example:
        @exponential_backoff_with_jitter(max_retries=3, base_delay=0.5)
        def fetch_data():
            return api_client.get_vulnerabilities()
    """
    @wraps(func)
    def wrapper(*args, **kwargs) -> T:
        retries = 0

        while retries <= max_retries:
            try:
                return func(*args, **kwargs)
            except exceptions as e:
                if retries >= max_retries:
                    raise

                # Calculate exponential backoff delay
                delay = min(base_delay * (2 ** retries), max_delay)

                # Add full jitter if enabled (AWS recommended approach)
                if jitter:
                    delay = random.uniform(0, delay)

                print(f"Retry {retries + 1}/{max_retries} for {func.__name__} after {delay:.2f}s due to: {str(e)}")
                time.sleep(delay)
                retries += 1

        # This should never be reached, but satisfy type checker
        raise RuntimeError(f"Failed after {max_retries} retries")

    return wrapper


def retry_with_backoff(
    max_retries: int = 5,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter: bool = True,
    exceptions: tuple = (Exception,)
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """
    Parametrized decorator version of exponential_backoff_with_jitter.

    Example:
        @retry_with_backoff(max_retries=3)
        def fetch_data():
            return api_client.get_vulnerabilities()
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        return exponential_backoff_with_jitter(
            func,
            max_retries=max_retries,
            base_delay=base_delay,
            max_delay=max_delay,
            jitter=jitter,
            exceptions=exceptions
        )
    return decorator


class ColdStartOptimizer:
    """
    Utilities for optimizing Lambda cold starts.

    This class provides methods to measure and optimize cold start performance:
    - Track cold vs warm starts
    - Measure initialization time
    - Provide cold start metrics for CloudWatch
    """

    def __init__(self):
        self.is_cold_start = True
        self.init_start_time = time.time()
        self.init_duration = 0.0

    def mark_initialized(self) -> None:
        """Mark initialization as complete and record duration."""
        if self.is_cold_start:
            self.init_duration = time.time() - self.init_start_time
            self.is_cold_start = False

    def get_metrics(self) -> dict:
        """
        Get cold start metrics for logging/monitoring.

        Returns:
            Dictionary with cold start metrics
        """
        return {
            'is_cold_start': self.is_cold_start,
            'init_duration_ms': self.init_duration * 1000,
        }

    def reset(self) -> None:
        """Reset cold start tracking (mainly for testing)."""
        self.is_cold_start = True
        self.init_start_time = time.time()
        self.init_duration = 0.0


# Global cold start optimizer instance
_cold_start_optimizer = ColdStartOptimizer()


def get_cold_start_optimizer() -> ColdStartOptimizer:
    """Get the global cold start optimizer instance."""
    return _cold_start_optimizer


def measure_performance(func: Callable[..., T]) -> Callable[..., T]:
    """
    Decorator to measure and log function execution time.

    Example:
        @measure_performance
        def process_vulnerabilities(data):
            # Process data
            pass
    """
    @wraps(func)
    def wrapper(*args, **kwargs) -> T:
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            duration = (time.time() - start_time) * 1000
            print(f"[PERFORMANCE] {func.__name__} completed in {duration:.2f}ms")
            return result
        except Exception as e:
            duration = (time.time() - start_time) * 1000
            print(f"[PERFORMANCE] {func.__name__} failed after {duration:.2f}ms: {str(e)}")
            raise

    return wrapper


# Environment detection
def is_lambda_environment() -> bool:
    """Check if code is running in AWS Lambda environment."""
    return os.environ.get('AWS_LAMBDA_FUNCTION_NAME') is not None


def is_local_environment() -> bool:
    """Check if code is running in local environment."""
    return not is_lambda_environment()


def get_memory_limit_mb() -> int:
    """Get Lambda function memory limit in MB."""
    return int(os.environ.get('AWS_LAMBDA_FUNCTION_MEMORY_SIZE', '128'))


def get_remaining_time_ms(context: Any) -> int:
    """
    Get remaining execution time in milliseconds.

    Args:
        context: Lambda context object

    Returns:
        Remaining time in milliseconds
    """
    if hasattr(context, 'get_remaining_time_in_millis'):
        return context.get_remaining_time_in_millis()
    return 0
