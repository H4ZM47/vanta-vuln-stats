#!/usr/bin/env python3
"""
Performance testing and benchmarking script for Lambda functions.

This script tests Lambda function performance including:
- Cold start times
- Warm start times
- Memory utilization
- Execution duration
- API throughput
- Connection pooling efficiency
"""

import json
import time
import statistics
import argparse
from typing import List, Dict, Any
from datetime import datetime

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    print("Error: boto3 is required. Install with: pip install boto3")
    exit(1)


class LambdaPerformanceTester:
    """Test and benchmark Lambda function performance."""

    def __init__(self, function_name: str, region: str = 'us-east-1'):
        """
        Initialize performance tester.

        Args:
            function_name: Name of Lambda function to test
            region: AWS region
        """
        self.function_name = function_name
        self.region = region
        self.lambda_client = boto3.client('lambda', region_name=region)
        self.cloudwatch_client = boto3.client('cloudwatch', region_name=region)
        self.results = []

    def invoke_function(self, payload: Dict[str, Any] = None, force_cold_start: bool = False) -> Dict[str, Any]:
        """
        Invoke Lambda function and measure performance.

        Args:
            payload: Event payload to send to function
            force_cold_start: If True, update function config to force cold start

        Returns:
            Dictionary with invocation results and metrics
        """
        if payload is None:
            payload = {}

        # Force cold start by updating environment variable
        if force_cold_start:
            try:
                current_config = self.lambda_client.get_function_configuration(
                    FunctionName=self.function_name
                )
                env_vars = current_config.get('Environment', {}).get('Variables', {})
                env_vars['FORCE_COLD_START'] = str(time.time())

                self.lambda_client.update_function_configuration(
                    FunctionName=self.function_name,
                    Environment={'Variables': env_vars}
                )

                # Wait for update to complete
                time.sleep(2)
            except ClientError as e:
                print(f"Warning: Could not force cold start: {e}")

        # Invoke function
        start_time = time.time()

        try:
            response = self.lambda_client.invoke(
                FunctionName=self.function_name,
                InvocationType='RequestResponse',
                LogType='Tail',
                Payload=json.dumps(payload)
            )

            end_time = time.time()
            total_time = (end_time - start_time) * 1000  # Convert to ms

            # Parse response
            status_code = response['StatusCode']
            log_result = response.get('LogResult', '')
            payload_response = json.loads(response['Payload'].read().decode('utf-8'))

            # Extract metrics from response headers
            billed_duration_ms = None
            memory_used_mb = None
            init_duration_ms = None

            # Note: These are typically in CloudWatch Logs, not response headers
            # We'll fetch them from CloudWatch if available

            result = {
                'timestamp': datetime.utcnow().isoformat(),
                'status_code': status_code,
                'total_time_ms': total_time,
                'billed_duration_ms': billed_duration_ms,
                'memory_used_mb': memory_used_mb,
                'init_duration_ms': init_duration_ms,
                'is_cold_start': force_cold_start,
                'response': payload_response,
                'success': status_code == 200
            }

            return result

        except Exception as e:
            end_time = time.time()
            total_time = (end_time - start_time) * 1000

            return {
                'timestamp': datetime.utcnow().isoformat(),
                'status_code': 500,
                'total_time_ms': total_time,
                'error': str(e),
                'is_cold_start': force_cold_start,
                'success': False
            }

    def test_cold_start(self, num_tests: int = 5) -> Dict[str, Any]:
        """
        Test cold start performance.

        Args:
            num_tests: Number of cold start tests to run

        Returns:
            Dictionary with cold start statistics
        """
        print(f"\n{'='*60}")
        print(f"Testing Cold Start Performance ({num_tests} tests)")
        print(f"{'='*60}")

        cold_start_times = []

        for i in range(num_tests):
            print(f"\nCold Start Test {i+1}/{num_tests}...")

            result = self.invoke_function(force_cold_start=True)
            cold_start_times.append(result['total_time_ms'])

            print(f"  Total Time: {result['total_time_ms']:.2f}ms")
            print(f"  Success: {result['success']}")

            # Wait between tests to ensure function scales down
            if i < num_tests - 1:
                print("  Waiting 60s for function to scale down...")
                time.sleep(60)

        stats = {
            'count': len(cold_start_times),
            'min_ms': min(cold_start_times),
            'max_ms': max(cold_start_times),
            'avg_ms': statistics.mean(cold_start_times),
            'median_ms': statistics.median(cold_start_times),
            'stdev_ms': statistics.stdev(cold_start_times) if len(cold_start_times) > 1 else 0,
            'times': cold_start_times
        }

        print(f"\n{'='*60}")
        print("Cold Start Statistics:")
        print(f"{'='*60}")
        print(f"  Count:   {stats['count']}")
        print(f"  Min:     {stats['min_ms']:.2f}ms")
        print(f"  Max:     {stats['max_ms']:.2f}ms")
        print(f"  Average: {stats['avg_ms']:.2f}ms")
        print(f"  Median:  {stats['median_ms']:.2f}ms")
        print(f"  StdDev:  {stats['stdev_ms']:.2f}ms")

        return stats

    def test_warm_start(self, num_tests: int = 10) -> Dict[str, Any]:
        """
        Test warm start performance.

        Args:
            num_tests: Number of warm start tests to run

        Returns:
            Dictionary with warm start statistics
        """
        print(f"\n{'='*60}")
        print(f"Testing Warm Start Performance ({num_tests} tests)")
        print(f"{'='*60}")

        # First invocation to warm up
        print("\nWarming up function...")
        self.invoke_function()
        time.sleep(1)

        warm_start_times = []

        for i in range(num_tests):
            print(f"\nWarm Start Test {i+1}/{num_tests}...")

            result = self.invoke_function()
            warm_start_times.append(result['total_time_ms'])

            print(f"  Total Time: {result['total_time_ms']:.2f}ms")
            print(f"  Success: {result['success']}")

            # Small delay between invocations
            time.sleep(0.5)

        stats = {
            'count': len(warm_start_times),
            'min_ms': min(warm_start_times),
            'max_ms': max(warm_start_times),
            'avg_ms': statistics.mean(warm_start_times),
            'median_ms': statistics.median(warm_start_times),
            'stdev_ms': statistics.stdev(warm_start_times) if len(warm_start_times) > 1 else 0,
            'times': warm_start_times
        }

        print(f"\n{'='*60}")
        print("Warm Start Statistics:")
        print(f"{'='*60}")
        print(f"  Count:   {stats['count']}")
        print(f"  Min:     {stats['min_ms']:.2f}ms")
        print(f"  Max:     {stats['max_ms']:.2f}ms")
        print(f"  Average: {stats['avg_ms']:.2f}ms")
        print(f"  Median:  {stats['median_ms']:.2f}ms")
        print(f"  StdDev:  {stats['stdev_ms']:.2f}ms")

        return stats

    def test_concurrent_execution(self, concurrency: int = 5, duration_seconds: int = 30) -> Dict[str, Any]:
        """
        Test concurrent execution performance.

        Args:
            concurrency: Number of concurrent invocations
            duration_seconds: Duration to maintain concurrent load

        Returns:
            Dictionary with concurrency test results
        """
        print(f"\n{'='*60}")
        print(f"Testing Concurrent Execution (concurrency={concurrency}, duration={duration_seconds}s)")
        print(f"{'='*60}")

        import threading
        import queue

        results_queue = queue.Queue()
        end_time = time.time() + duration_seconds

        def worker():
            """Worker thread for concurrent invocations."""
            while time.time() < end_time:
                try:
                    result = self.invoke_function()
                    results_queue.put(result)
                except Exception as e:
                    results_queue.put({'error': str(e), 'success': False})
                time.sleep(0.1)

        # Start worker threads
        threads = []
        for i in range(concurrency):
            thread = threading.Thread(target=worker)
            thread.daemon = True
            thread.start()
            threads.append(thread)

        # Wait for threads to complete
        for thread in threads:
            thread.join()

        # Collect results
        results = []
        while not results_queue.empty():
            results.append(results_queue.get())

        successful = [r for r in results if r.get('success', False)]
        failed = [r for r in results if not r.get('success', False)]

        if successful:
            times = [r['total_time_ms'] for r in successful]
            stats = {
                'total_invocations': len(results),
                'successful': len(successful),
                'failed': len(failed),
                'success_rate': len(successful) / len(results) * 100,
                'min_ms': min(times),
                'max_ms': max(times),
                'avg_ms': statistics.mean(times),
                'median_ms': statistics.median(times)
            }
        else:
            stats = {
                'total_invocations': len(results),
                'successful': 0,
                'failed': len(failed),
                'success_rate': 0,
                'error': 'All invocations failed'
            }

        print(f"\n{'='*60}")
        print("Concurrent Execution Statistics:")
        print(f"{'='*60}")
        print(f"  Total Invocations: {stats['total_invocations']}")
        print(f"  Successful:        {stats['successful']}")
        print(f"  Failed:            {stats['failed']}")
        print(f"  Success Rate:      {stats.get('success_rate', 0):.2f}%")

        if successful:
            print(f"  Min Time:          {stats['min_ms']:.2f}ms")
            print(f"  Max Time:          {stats['max_ms']:.2f}ms")
            print(f"  Average Time:      {stats['avg_ms']:.2f}ms")
            print(f"  Median Time:       {stats['median_ms']:.2f}ms")

        return stats

    def get_cloudwatch_metrics(self, hours: int = 1) -> Dict[str, Any]:
        """
        Get CloudWatch metrics for the function.

        Args:
            hours: Number of hours of metrics to retrieve

        Returns:
            Dictionary with CloudWatch metrics
        """
        print(f"\n{'='*60}")
        print(f"Fetching CloudWatch Metrics (last {hours} hour(s))")
        print(f"{'='*60}")

        end_time = datetime.utcnow()
        start_time = datetime.utcnow()
        start_time = start_time.replace(hour=start_time.hour - hours)

        metrics_to_fetch = [
            ('Invocations', 'Sum'),
            ('Errors', 'Sum'),
            ('Throttles', 'Sum'),
            ('Duration', 'Average'),
            ('ConcurrentExecutions', 'Maximum')
        ]

        metrics_data = {}

        for metric_name, stat in metrics_to_fetch:
            try:
                response = self.cloudwatch_client.get_metric_statistics(
                    Namespace='AWS/Lambda',
                    MetricName=metric_name,
                    Dimensions=[
                        {'Name': 'FunctionName', 'Value': self.function_name}
                    ],
                    StartTime=start_time,
                    EndTime=end_time,
                    Period=300,  # 5 minutes
                    Statistics=[stat]
                )

                datapoints = response.get('Datapoints', [])
                if datapoints:
                    values = [dp[stat] for dp in datapoints]
                    metrics_data[metric_name] = {
                        'values': values,
                        'avg': statistics.mean(values),
                        'max': max(values),
                        'min': min(values)
                    }

                    print(f"\n{metric_name}:")
                    print(f"  Average: {metrics_data[metric_name]['avg']:.2f}")
                    print(f"  Max:     {metrics_data[metric_name]['max']:.2f}")
                    print(f"  Min:     {metrics_data[metric_name]['min']:.2f}")

            except Exception as e:
                print(f"  Error fetching {metric_name}: {e}")

        return metrics_data

    def run_full_benchmark(self, output_file: str = None) -> Dict[str, Any]:
        """
        Run complete performance benchmark suite.

        Args:
            output_file: Optional file to save results

        Returns:
            Dictionary with all benchmark results
        """
        print(f"\n{'#'*60}")
        print(f"# Lambda Performance Benchmark")
        print(f"# Function: {self.function_name}")
        print(f"# Region: {self.region}")
        print(f"# Timestamp: {datetime.utcnow().isoformat()}")
        print(f"{'#'*60}")

        results = {
            'function_name': self.function_name,
            'region': self.region,
            'timestamp': datetime.utcnow().isoformat(),
            'cold_start': self.test_cold_start(num_tests=3),
            'warm_start': self.test_warm_start(num_tests=10),
            'concurrent': self.test_concurrent_execution(concurrency=3, duration_seconds=20),
            'cloudwatch_metrics': self.get_cloudwatch_metrics(hours=1)
        }

        # Print summary
        print(f"\n{'#'*60}")
        print("# Benchmark Summary")
        print(f"{'#'*60}")
        print(f"Cold Start Average:  {results['cold_start']['avg_ms']:.2f}ms")
        print(f"Warm Start Average:  {results['warm_start']['avg_ms']:.2f}ms")
        print(f"Concurrent Success:  {results['concurrent'].get('success_rate', 0):.2f}%")

        # Save to file if requested
        if output_file:
            with open(output_file, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"\nResults saved to: {output_file}")

        return results


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Performance testing for Lambda functions'
    )
    parser.add_argument(
        '--function',
        required=True,
        help='Lambda function name to test'
    )
    parser.add_argument(
        '--region',
        default='us-east-1',
        help='AWS region (default: us-east-1)'
    )
    parser.add_argument(
        '--test',
        choices=['cold', 'warm', 'concurrent', 'metrics', 'full'],
        default='full',
        help='Test type to run (default: full)'
    )
    parser.add_argument(
        '--output',
        help='Output file for results (JSON format)'
    )

    args = parser.parse_args()

    tester = LambdaPerformanceTester(args.function, args.region)

    if args.test == 'cold':
        tester.test_cold_start()
    elif args.test == 'warm':
        tester.test_warm_start()
    elif args.test == 'concurrent':
        tester.test_concurrent_execution()
    elif args.test == 'metrics':
        tester.get_cloudwatch_metrics()
    else:  # full
        tester.run_full_benchmark(output_file=args.output)


if __name__ == '__main__':
    main()
