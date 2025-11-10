# Lambda Handlers

AWS Lambda handlers for Vanta Vulnerability Statistics, optimized for performance and reliability.

## Overview

This directory contains Lambda function handlers and utilities that implement Issue #9 (Epic 9: Lambda Performance Optimizations).

## Structure

```
lambda_handlers/
├── __init__.py
├── README.md                    # This file
├── sync_handler.py              # Main sync handler with optimizations
├── utils/
│   ├── __init__.py
│   └── performance.py           # Performance optimization utilities
└── config/
    └── __init__.py
```

## Performance Optimizations

### 1. Lazy Imports (`utils/performance.py`)

Heavy libraries (boto3, pandas, pyarrow) are loaded only when first accessed, reducing cold start time by 200-500ms.

**Usage:**
```python
from lambda_handlers.utils.performance import LazyImport

boto3 = LazyImport('boto3')
s3_client = boto3.client('s3')  # boto3 imported here
```

### 2. Connection Pooling

AWS service clients are reused across Lambda invocations (warm starts), reducing latency by 50-100ms.

**Usage:**
```python
from lambda_handlers.utils.performance import get_aws_client

s3_client = get_aws_client('s3')  # Reused on warm starts
```

### 3. Exponential Backoff with Jitter

API calls retry with exponential backoff and full jitter to handle transient failures and avoid thundering herd.

**Usage:**
```python
from lambda_handlers.utils.performance import retry_with_backoff

@retry_with_backoff(max_retries=3, base_delay=1.0)
def fetch_vulnerabilities():
    return api_client.get_vulnerabilities()
```

### 4. Cold Start Optimization

Track and measure cold vs warm starts for monitoring and optimization.

**Usage:**
```python
from lambda_handlers.utils.performance import get_cold_start_optimizer

optimizer = get_cold_start_optimizer()
optimizer.mark_initialized()
metrics = optimizer.get_metrics()
```

### 5. Performance Measurement

Decorator for measuring and logging function execution time.

**Usage:**
```python
from lambda_handlers.utils.performance import measure_performance

@measure_performance
def process_data():
    # Processing logic
    pass
```

## Lambda Handlers

### Sync Handler (`sync_handler.py`)

**Function**: `vanta-vuln-sync`

**Purpose**: Syncs vulnerability data from Vanta API to S3

**Optimizations Applied**:
- ✅ Lazy imports for boto3, pandas
- ✅ Connection pooling for S3, Secrets Manager
- ✅ Exponential backoff for API calls
- ✅ Lambda Powertools integration
- ✅ Cold start tracking
- ✅ Performance measurements

**Environment Variables**:
- `VANTA_CLIENT_ID` - Vanta API client ID (optional)
- `VANTA_CLIENT_SECRET` - Vanta API client secret (optional)
- `VANTA_CREDENTIALS_SECRET` - Secrets Manager secret name (default: vanta-api-credentials)
- `S3_BUCKET` - S3 bucket for storing data (default: vanta-vuln-data)
- `MAX_POOL_CONNECTIONS` - Max connections in pool (default: 50)

**Invocation**:
```bash
aws lambda invoke \
  --function-name vanta-vuln-sync \
  --payload '{}' \
  response.json
```

**Scheduled Execution**:
- EventBridge rule triggers daily at 6 AM UTC
- Configurable in `template.yaml`

## Deployment

See [LAMBDA_DEPLOYMENT.md](../docs/LAMBDA_DEPLOYMENT.md) for detailed deployment instructions.

**Quick Deploy**:
```bash
# Build
sam build

# Deploy
sam deploy --guided
```

## Testing

### Unit Tests

```bash
# Run tests
pytest tests/test_lambda_handlers.py

# With coverage
pytest tests/test_lambda_handlers.py --cov=lambda_handlers
```

### Performance Tests

```bash
# Full benchmark
python scripts/performance_test.py \
  --function vanta-vuln-sync \
  --test full

# Cold start tests
python scripts/performance_test.py \
  --function vanta-vuln-sync \
  --test cold

# Warm start tests
python scripts/performance_test.py \
  --function vanta-vuln-sync \
  --test warm
```

### Local Testing

```bash
# Test locally with SAM
sam local invoke VantaSyncFunction \
  --event events/sync_event.json

# Test with Docker
sam local start-api
```

## Monitoring

### CloudWatch Metrics

**AWS Lambda Metrics**:
- Invocations
- Errors
- Throttles
- Duration
- ConcurrentExecutions

**Custom Metrics** (via Lambda Powertools):
- VulnerabilitiesFetched
- RemediationsFetched
- RecordsStored
- SyncSuccess/Failure

### CloudWatch Alarms

Configured alarms:
- Error rate ≥1 in 5 minutes
- Throttle rate ≥5 in 5 minutes
- Duration >10 minutes (avg)
- Concurrent executions ≥4
- DLQ depth ≥1 message

### CloudWatch Dashboard

View metrics at:
```
https://console.aws.amazon.com/cloudwatch/home?region=REGION#dashboards:name=vanta-vuln-performance
```

### X-Ray Tracing

Enabled by default in `template.yaml`:
```yaml
Tracing: Active
```

View traces in AWS X-Ray console.

## Performance Benchmarks

Expected performance (based on 1536 MB memory allocation):

| Metric | Cold Start | Warm Start |
|--------|-----------|------------|
| Duration | 2-3 seconds | 5-10 seconds |
| Memory Used | 200-400 MB | 200-400 MB |
| API Calls | 10-50 | 10-50 |

**Notes**:
- Cold start includes lazy import overhead
- Warm start reuses connections and cached data
- Duration varies based on data volume

## Troubleshooting

### High Cold Start Time

**Symptoms**: Cold starts >3 seconds

**Solutions**:
1. Verify lazy imports are working
2. Check Lambda Insights for init duration
3. Consider Provisioned Concurrency

### API Rate Limiting

**Symptoms**: Many retries, errors

**Solutions**:
1. Increase retry delay: `base_delay=2.0`
2. Reduce page size in API calls
3. Lower reserved concurrency

### Memory Issues

**Symptoms**: Out of memory errors

**Solutions**:
1. Increase MemorySize in template.yaml
2. Process data in batches
3. Check for memory leaks

See [LAMBDA_PERFORMANCE_OPTIMIZATION.md](../docs/LAMBDA_PERFORMANCE_OPTIMIZATION.md) for detailed troubleshooting.

## Best Practices

1. **Always use lazy imports** for heavy libraries
2. **Use connection pooling** for AWS services
3. **Implement retry logic** with exponential backoff
4. **Monitor cold start rate** - target <5%
5. **Right-size memory** allocation based on profiling
6. **Enable Lambda Insights** for production workloads
7. **Set up CloudWatch alarms** proactively
8. **Test performance regularly** with benchmarking script

## Additional Resources

- [Performance Optimization Guide](../docs/LAMBDA_PERFORMANCE_OPTIMIZATION.md)
- [Deployment Guide](../docs/LAMBDA_DEPLOYMENT.md)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Lambda Powertools Documentation](https://awslabs.github.io/aws-lambda-powertools-python/)

## Support

For issues or questions:
1. Check CloudWatch Logs: `/aws/lambda/vanta-vuln-sync`
2. Review CloudWatch Alarms
3. Run performance tests
4. Consult documentation guides
5. Open GitHub issue with logs and metrics
