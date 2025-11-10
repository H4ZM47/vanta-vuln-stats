# Lambda Performance Optimization Guide

This guide covers the performance optimizations implemented for AWS Lambda functions in the Vanta Vulnerability Statistics project.

## Table of Contents

- [Overview](#overview)
- [Performance Optimizations](#performance-optimizations)
- [Architecture](#architecture)
- [Deployment](#deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview

The Lambda functions in this project are optimized for:

- **Reduced Cold Start Time**: Lazy imports and optimized initialization
- **Efficient Resource Usage**: Connection pooling and memory optimization
- **Reliability**: Exponential backoff with jitter, Dead Letter Queues
- **Observability**: CloudWatch metrics, alarms, and dashboards
- **Cost Optimization**: Right-sized memory allocation and timeout settings

## Performance Optimizations

### 1. Lazy Imports

**Problem**: Loading heavy libraries like boto3, pandas, and pyarrow during import increases cold start time.

**Solution**: Use lazy import pattern to defer loading until first use.

```python
from lambda_handlers.utils.performance import LazyImport

# Heavy libraries are only imported when first accessed
boto3 = LazyImport('boto3')
pandas = LazyImport('pandas')

# First access triggers import
s3_client = boto3.client('s3')  # boto3 imported here
```

**Benefits**:
- Reduces cold start time by 200-500ms
- Only loads dependencies that are actually used
- No code changes needed in business logic

### 2. Connection Pooling

**Problem**: Creating new AWS service clients on each invocation wastes time and resources.

**Solution**: Reuse connections across Lambda invocations (warm starts).

```python
from lambda_handlers.utils.performance import get_aws_client

# Get pooled client (reused across invocations)
s3_client = get_aws_client('s3')
secrets_client = get_aws_client('secretsmanager')
```

**Configuration**:
```python
# Environment variable controls pool size
MAX_POOL_CONNECTIONS=50  # Default in template.yaml
```

**Benefits**:
- Reduces warm start latency by 50-100ms
- Avoids connection establishment overhead
- Supports high concurrency with connection reuse

### 3. Exponential Backoff with Jitter

**Problem**: API rate limits and transient failures cause function failures.

**Solution**: Retry with exponential backoff and jitter to avoid thundering herd.

```python
from lambda_handlers.utils.performance import retry_with_backoff

@retry_with_backoff(max_retries=3, base_delay=1.0)
def fetch_vulnerabilities():
    return api_client.get_vulnerabilities()
```

**Algorithm**:
- Base delay: 1 second
- Exponential multiplier: 2x per retry
- Full jitter: Random delay between 0 and calculated delay
- Max delay: 60 seconds

**Benefits**:
- Handles transient API failures gracefully
- Prevents thundering herd when multiple functions retry
- Configurable per function

### 4. Memory Optimization

**Strategy**: Higher memory allocation = more CPU = faster execution.

**Configuration** (in `template.yaml`):
```yaml
VantaSyncFunction:
  MemorySize: 1536  # MB
  # More memory = proportionally more CPU
  # 1536 MB = ~1 vCPU
  # Optimal for API-heavy workloads
```

**Tuning Process**:
1. Start with 1024 MB (default)
2. Run performance tests
3. Check execution time vs cost
4. Adjust based on workload

**Cost vs Performance**:
- 512 MB: Lowest cost, slower execution
- 1024 MB: Balanced
- 1536 MB: **Recommended** - Faster API calls
- 3008 MB: Maximum, diminishing returns

### 5. Timeout Configuration

**Configuration** (in `template.yaml`):
```yaml
VantaSyncFunction:
  Timeout: 900  # 15 minutes
  # Large datasets require longer timeout
```

**Guidelines**:
- Sync function: 15 minutes (900s)
- Query function: 5 minutes (300s)
- Monitor actual duration and adjust

### 6. Dead Letter Queue (DLQ)

**Purpose**: Capture failed invocations for debugging and replay.

**Configuration** (in `template.yaml`):
```yaml
VantaSyncFunction:
  DeadLetterQueue:
    Type: SQS
    TargetArn: !GetAtt SyncFunctionDLQ.Arn
```

**Message Retention**: 14 days

**Monitoring**:
- CloudWatch alarm triggers when messages appear in DLQ
- Investigate failed invocations
- Replay messages after fixing issues

### 7. CloudWatch Alarms

**Alarms Configured**:

1. **Error Alarm**: Triggers when function has errors
   - Threshold: ≥1 error in 5 minutes
   - Action: SNS notification

2. **Throttle Alarm**: Triggers when function is throttled
   - Threshold: ≥5 throttles in 5 minutes
   - Action: SNS notification

3. **Duration Alarm**: Triggers when execution time is high
   - Threshold: Average ≥10 minutes
   - Action: SNS notification

4. **Concurrent Execution Alarm**: Triggers when approaching limit
   - Threshold: ≥4 concurrent executions
   - Limit: 5 reserved executions
   - Action: SNS notification

5. **DLQ Depth Alarm**: Triggers when messages in DLQ
   - Threshold: ≥1 message
   - Action: SNS notification

### 8. Reserved Concurrency

**Configuration** (in `template.yaml`):
```yaml
VantaSyncFunction:
  ReservedConcurrentExecutions: 5
  # Limits concurrent executions to prevent:
  # - API rate limiting
  # - Cost overruns
  # - Account-level throttling
```

**Benefits**:
- Prevents API rate limit issues
- Controls costs
- Ensures predictable performance

### 9. Lambda Insights

**Purpose**: Enhanced monitoring with detailed performance metrics.

**Configuration** (in `template.yaml`):
```yaml
Layers:
  - !Ref LambdaInsightsExtension  # ARN specified in parameters
```

**Metrics Provided**:
- CPU usage
- Memory usage
- Network I/O
- Cold start frequency
- Duration breakdown

**Cost**: ~$0.20 per 1M requests (in addition to Lambda costs)

## Architecture

### Lambda Handler Structure

```
lambda_handlers/
├── __init__.py
├── sync_handler.py          # Main sync handler
├── utils/
│   ├── __init__.py
│   └── performance.py       # Performance utilities
└── config/
    └── __init__.py
```

### Execution Flow

```
┌─────────────────┐
│  EventBridge    │  Daily schedule (6 AM UTC)
│  Schedule       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Lambda         │  VantaSyncFunction
│  Invocation     │
└────────┬────────┘
         │
         ├──▶ Cold Start Detection
         │    └──▶ Lazy Imports (if cold start)
         │
         ├──▶ Get Credentials (Secrets Manager)
         │    └──▶ Connection Pool (reuse if warm)
         │
         ├──▶ Fetch Vulnerabilities (Vanta API)
         │    └──▶ Exponential Backoff (on errors)
         │
         ├──▶ Fetch Remediations (Vanta API)
         │    └──▶ Exponential Backoff (on errors)
         │
         ├──▶ Store to S3 (partitioned by date)
         │    └──▶ Connection Pool (reuse client)
         │
         ├──▶ Emit CloudWatch Metrics
         │    └──▶ Lambda Powertools
         │
         └──▶ Return Success/Failure
              ├──▶ Success: Return 200
              └──▶ Failure: Send to DLQ
```

## Deployment

### Prerequisites

1. **AWS CLI** configured with credentials
2. **AWS SAM CLI** installed
3. **Python 3.11** installed
4. **Vanta API credentials** in AWS Secrets Manager

### Step 1: Install Dependencies

```bash
# Install Lambda-specific dependencies
pip install -r requirements-lambda.txt -t layer/python

# Or create Lambda layer
mkdir -p layer/python
pip install -r requirements-lambda.txt -t layer/python
```

### Step 2: Build SAM Application

```bash
# Build Lambda functions and layers
sam build

# Validate template
sam validate
```

### Step 3: Deploy

```bash
# Deploy with guided prompts
sam deploy --guided

# Or deploy with parameters
sam deploy \
  --parameter-overrides \
    VantaCredentialsSecretName=vanta-api-credentials \
    S3BucketName=my-vanta-vuln-data \
    AlarmEmail=ops@example.com
```

### Step 4: Verify Deployment

```bash
# Check function status
aws lambda get-function --function-name vanta-vuln-sync

# Invoke manually
aws lambda invoke \
  --function-name vanta-vuln-sync \
  --payload '{}' \
  response.json

# View logs
aws logs tail /aws/lambda/vanta-vuln-sync --follow
```

### Step 5: Create Credentials in Secrets Manager

```bash
# Create secret
aws secretsmanager create-secret \
  --name vanta-api-credentials \
  --secret-string '{"client_id":"YOUR_ID","client_secret":"YOUR_SECRET"}'

# Verify secret
aws secretsmanager get-secret-value \
  --secret-id vanta-api-credentials
```

## Monitoring

### CloudWatch Dashboard

Access the dashboard:
```
https://console.aws.amazon.com/cloudwatch/home?region=REGION#dashboards:name=vanta-vuln-performance
```

**Widgets**:
1. Invocations, Errors, Throttles (time series)
2. Duration (min/max/avg)
3. Custom Metrics (vulnerabilities fetched, stored)
4. Concurrent Executions

### CloudWatch Logs

**Log Groups**:
- `/aws/lambda/vanta-vuln-sync`

**Structured Logging**:
```json
{
  "level": "INFO",
  "message": "Sync completed successfully",
  "timestamp": "2024-01-15T12:00:00Z",
  "cold_start": false,
  "vulnerabilities_count": 1247,
  "remediations_count": 523,
  "duration_ms": 12345
}
```

**Query Examples**:

```bash
# Find errors in last hour
aws logs filter-log-events \
  --log-group-name /aws/lambda/vanta-vuln-sync \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR"

# Find cold starts
aws logs filter-log-events \
  --log-group-name /aws/lambda/vanta-vuln-sync \
  --filter-pattern '"cold_start": true'
```

### Performance Testing

Use the provided performance testing script:

```bash
# Run full benchmark
python scripts/performance_test.py \
  --function vanta-vuln-sync \
  --test full \
  --output benchmark_results.json

# Test cold starts only
python scripts/performance_test.py \
  --function vanta-vuln-sync \
  --test cold

# Test warm starts only
python scripts/performance_test.py \
  --function vanta-vuln-sync \
  --test warm

# Test concurrent execution
python scripts/performance_test.py \
  --function vanta-vuln-sync \
  --test concurrent
```

**Benchmark Output**:
```
============================================================
Testing Cold Start Performance (3 tests)
============================================================
Cold Start Test 1/3...
  Total Time: 2345.67ms
  Success: True

Cold Start Statistics:
============================================================
  Count:   3
  Min:     2234.12ms
  Max:     2456.34ms
  Average: 2345.67ms
  Median:  2345.67ms
  StdDev:  111.11ms
```

### X-Ray Tracing

**Enable**: Already configured in `template.yaml`

```yaml
Tracing: Active
```

**View Traces**:
1. Open AWS X-Ray console
2. Select service map
3. View traces for `vanta-vuln-sync`

**Insights**:
- Service dependencies
- Latency breakdown
- Error analysis
- Cold vs warm start comparison

## Troubleshooting

### High Cold Start Time

**Symptoms**: Cold starts >3 seconds

**Solutions**:
1. Check Lambda Insights for initialization time
2. Review lazy imports - ensure heavy libraries are lazily loaded
3. Consider Provisioned Concurrency (costs more)
4. Reduce deployment package size

**Diagnostic Commands**:
```bash
# Check deployment package size
aws lambda get-function --function-name vanta-vuln-sync | jq '.Configuration.CodeSize'

# View cold start metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=vanta-vuln-sync \
  --start-time $(date -u -d '1 day ago' --iso-8601=seconds) \
  --end-time $(date -u --iso-8601=seconds) \
  --period 3600 \
  --statistics Average
```

### API Rate Limiting

**Symptoms**: Many retries, throttle errors

**Solutions**:
1. Increase retry delay: `base_delay=2.0`
2. Reduce page size: `page_size=50`
3. Lower reserved concurrency
4. Add delays between API calls

**Code Changes**:
```python
@retry_with_backoff(max_retries=5, base_delay=2.0, max_delay=120.0)
def fetch_vulnerabilities():
    return api_client.get_vulnerabilities(page_size=50)
```

### Memory Issues

**Symptoms**: Out of memory errors

**Solutions**:
1. Increase MemorySize in template.yaml
2. Process data in smaller batches
3. Use streaming for large datasets

**Update Memory**:
```yaml
MemorySize: 2048  # Increase from 1536
```

### Timeout Issues

**Symptoms**: Function times out

**Solutions**:
1. Increase Timeout in template.yaml
2. Implement checkpoint/resume logic
3. Split into smaller functions

**Update Timeout**:
```yaml
Timeout: 900  # 15 minutes
```

### DLQ Messages

**Symptoms**: Messages appearing in DLQ

**Investigation**:
```bash
# List messages in DLQ
aws sqs receive-message \
  --queue-url $(aws sqs get-queue-url --queue-name vanta-vuln-sync-dlq --query 'QueueUrl' --output text) \
  --max-number-of-messages 10

# Check error in message body
aws sqs receive-message \
  --queue-url QUEUE_URL \
  --attribute-names All \
  --message-attribute-names All
```

**Resolution**:
1. Fix underlying issue (check CloudWatch Logs)
2. Test fix with manual invocation
3. Replay messages from DLQ

**Replay Script**:
```python
import boto3

sqs = boto3.client('sqs')
lambda_client = boto3.client('lambda')

queue_url = 'YOUR_DLQ_URL'
function_name = 'vanta-vuln-sync'

# Receive messages from DLQ
messages = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10)

for message in messages.get('Messages', []):
    # Replay to Lambda
    lambda_client.invoke(
        FunctionName=function_name,
        InvocationType='Event',
        Payload=message['Body']
    )

    # Delete from DLQ
    sqs.delete_message(
        QueueUrl=queue_url,
        ReceiptHandle=message['ReceiptHandle']
    )
```

## Best Practices

### 1. Right-Size Memory

**Methodology**:
1. Start with 1024 MB
2. Run performance tests
3. Calculate cost vs duration
4. Adjust based on workload

**Formula**:
```
Cost = (Duration in GB-seconds) × Price per GB-second
Price per GB-second = $0.0000166667

Example:
- 1024 MB (1 GB), 10s duration: $0.000166667
- 1536 MB (1.5 GB), 6s duration: $0.00015
```

**Recommendation**: Choose memory that minimizes total cost (duration × GB-seconds).

### 2. Monitor Cold Starts

**Target**: <5% cold start rate

**Strategies**:
- Keep functions warm with scheduled pings (if needed)
- Use Provisioned Concurrency for critical functions
- Optimize initialization code

**Monitor**:
```bash
# Cold start rate query
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ColdStart \
  --dimensions Name=FunctionName,Value=vanta-vuln-sync \
  --start-time $(date -u -d '1 week ago' --iso-8601=seconds) \
  --end-time $(date -u --iso-8601=seconds) \
  --period 86400 \
  --statistics Average
```

### 3. Use Structured Logging

**Example**:
```python
logger.info("Sync completed", extra={
    'vulnerabilities_count': len(vulnerabilities),
    'duration_ms': duration,
    'cold_start': is_cold_start
})
```

**Benefits**:
- Easy querying in CloudWatch Logs Insights
- Better observability
- Structured data for analysis

### 4. Implement Circuit Breaker

**Pattern**: Fail fast when downstream service is down

```python
class CircuitBreaker:
    def __init__(self, failure_threshold=5, timeout=60):
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.last_failure_time = None
        self.state = 'closed'  # closed, open, half-open

    def call(self, func):
        if self.state == 'open':
            if time.time() - self.last_failure_time > self.timeout:
                self.state = 'half-open'
            else:
                raise Exception("Circuit breaker is open")

        try:
            result = func()
            if self.state == 'half-open':
                self.state = 'closed'
                self.failure_count = 0
            return result
        except Exception as e:
            self.failure_count += 1
            self.last_failure_time = time.time()

            if self.failure_count >= self.failure_threshold:
                self.state = 'open'
            raise
```

### 5. Cache External Data

**Pattern**: Cache credentials, configuration, and frequently accessed data

```python
# Cache credentials (reused across warm starts)
_credentials_cache = None

def get_credentials():
    global _credentials_cache
    if _credentials_cache is None:
        _credentials_cache = fetch_from_secrets_manager()
    return _credentials_cache
```

**Benefits**:
- Reduces API calls
- Faster warm starts
- Lower costs

### 6. Set Alarms Proactively

**Recommended Alarms**:
- Errors (threshold: ≥1)
- Throttles (threshold: ≥5)
- Duration (threshold: >80% of timeout)
- DLQ depth (threshold: ≥1)
- Cost (threshold: based on budget)

### 7. Use Lambda Insights

**Benefits**:
- Detailed performance metrics
- Memory usage tracking
- Network I/O monitoring
- Cold start analysis

**Cost**: ~$0.20 per 1M requests

**ROI**: Worth it for production workloads

### 8. Test Performance Regularly

**Schedule**: Weekly or after major changes

```bash
# Run weekly performance test
0 0 * * 0 /usr/bin/python3 /path/to/scripts/performance_test.py \
  --function vanta-vuln-sync \
  --test full \
  --output /var/log/perf-test-$(date +\%Y\%m\%d).json
```

## Additional Resources

- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [AWS Lambda Powertools Documentation](https://awslabs.github.io/aws-lambda-powertools-python/)
- [AWS Lambda Performance Optimization](https://docs.aws.amazon.com/lambda/latest/operatorguide/perf-optimize.html)
- [AWS Lambda Cold Start Analysis](https://aws.amazon.com/blogs/compute/operating-lambda-performance-optimization-part-1/)

## Support

For issues or questions:
1. Check CloudWatch Logs
2. Review CloudWatch Alarms
3. Run performance tests
4. Open GitHub issue with:
   - Function logs
   - CloudWatch metrics
   - Performance test results
