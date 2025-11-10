# Lambda Deployment Guide

This guide provides step-by-step instructions for deploying the Vanta Vulnerability Statistics Lambda functions to AWS.

## Prerequisites

### Required Tools

1. **AWS CLI v2** - [Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
   ```bash
   aws --version
   # Expected: aws-cli/2.x.x or higher
   ```

2. **AWS SAM CLI** - [Installation Guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
   ```bash
   sam --version
   # Expected: SAM CLI, version 1.x.x or higher
   ```

3. **Python 3.11**
   ```bash
   python3 --version
   # Expected: Python 3.11.x
   ```

4. **Docker** (optional, for local testing)
   ```bash
   docker --version
   ```

### AWS Configuration

1. **Configure AWS Credentials**
   ```bash
   aws configure
   # Enter your AWS Access Key ID
   # Enter your AWS Secret Access Key
   # Enter your default region (e.g., us-east-1)
   # Enter your default output format (json)
   ```

2. **Verify Access**
   ```bash
   aws sts get-caller-identity
   ```

3. **Required IAM Permissions**
   - Lambda: Create, update, delete functions
   - S3: Create buckets, upload objects
   - CloudFormation: Create, update stacks
   - IAM: Create roles and policies
   - CloudWatch: Create alarms and dashboards
   - Secrets Manager: Read secrets
   - SQS: Create queues

## Deployment Steps

### Step 1: Prepare Vanta API Credentials

Create a secret in AWS Secrets Manager:

```bash
# Method 1: Using AWS CLI
aws secretsmanager create-secret \
  --name vanta-api-credentials \
  --description "Vanta API credentials for vulnerability sync" \
  --secret-string '{
    "client_id": "YOUR_VANTA_CLIENT_ID",
    "client_secret": "YOUR_VANTA_CLIENT_SECRET"
  }' \
  --region us-east-1

# Method 2: Using AWS Console
# 1. Open AWS Secrets Manager console
# 2. Click "Store a new secret"
# 3. Select "Other type of secret"
# 4. Add key/value pairs:
#    - client_id: YOUR_VANTA_CLIENT_ID
#    - client_secret: YOUR_VANTA_CLIENT_SECRET
# 5. Name the secret: vanta-api-credentials
```

Verify the secret:
```bash
aws secretsmanager get-secret-value \
  --secret-id vanta-api-credentials \
  --query 'SecretString' \
  --output text | jq .
```

### Step 2: Build Lambda Deployment Package

```bash
# Navigate to project directory
cd /path/to/vanta-vuln-stats

# Build with SAM
sam build

# Verify build
ls -la .aws-sam/build/
```

**What happens during build:**
- Creates Lambda deployment packages
- Resolves dependencies from requirements-lambda.txt
- Builds Lambda layers
- Prepares CloudFormation templates

### Step 3: Deploy to AWS

#### Option A: Interactive Deployment (Recommended for first deployment)

```bash
sam deploy --guided
```

You'll be prompted for:

```
Setting default arguments for 'sam deploy'
=========================================
Stack Name [vanta-vuln-stats]: vanta-vuln-stats
AWS Region [us-east-1]: us-east-1
Parameter VantaCredentialsSecretName [vanta-api-credentials]: vanta-api-credentials
Parameter S3BucketName [vanta-vuln-data]: my-vanta-vuln-data-UNIQUE_SUFFIX
Parameter AlarmEmail []: ops@mycompany.com
Parameter LambdaInsightsExtensionArn [...]: [Press Enter for default]

#Shows you resources changes to be deployed and require a 'Y' to initiate deploy
Confirm changes before deploy [y/N]: y

#SAM needs permission to be able to create roles to connect to the resources in your template
Allow SAM CLI IAM role creation [Y/n]: Y

#Preserves the state of previously provisioned resources when an operation fails
Disable rollback [y/N]: N

VantaSyncFunction may not have authorization defined, Is this okay? [y/N]: y

Save arguments to configuration file [Y/n]: Y
SAM configuration file [samconfig.toml]: samconfig.toml
SAM configuration environment [default]: default
```

#### Option B: Non-Interactive Deployment

```bash
sam deploy \
  --stack-name vanta-vuln-stats \
  --region us-east-1 \
  --parameter-overrides \
    VantaCredentialsSecretName=vanta-api-credentials \
    S3BucketName=my-vanta-vuln-data-12345 \
    AlarmEmail=ops@mycompany.com \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset
```

### Step 4: Verify Deployment

1. **Check Stack Status**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name vanta-vuln-stats \
     --query 'Stacks[0].StackStatus'
   ```

   Expected output: `"CREATE_COMPLETE"` or `"UPDATE_COMPLETE"`

2. **Get Stack Outputs**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name vanta-vuln-stats \
     --query 'Stacks[0].Outputs'
   ```

3. **List Lambda Functions**
   ```bash
   aws lambda list-functions \
     --query 'Functions[?starts_with(FunctionName, `vanta-vuln`)].FunctionName'
   ```

4. **Verify S3 Bucket**
   ```bash
   aws s3 ls | grep vanta-vuln
   ```

### Step 5: Test Lambda Function

#### Manual Test Invocation

```bash
# Invoke function
aws lambda invoke \
  --function-name vanta-vuln-sync \
  --invocation-type RequestResponse \
  --payload '{}' \
  --log-type Tail \
  response.json

# View response
cat response.json | jq .

# View logs (base64 encoded in response)
aws lambda invoke \
  --function-name vanta-vuln-sync \
  --invocation-type RequestResponse \
  --payload '{}' \
  --log-type Tail \
  response.json \
  --query 'LogResult' \
  --output text | base64 --decode
```

#### Check CloudWatch Logs

```bash
# Tail logs in real-time
aws logs tail /aws/lambda/vanta-vuln-sync --follow

# Filter for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/vanta-vuln-sync \
  --filter-pattern "ERROR" \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

#### Verify S3 Data Storage

```bash
# List objects in S3 bucket
aws s3 ls s3://my-vanta-vuln-data-12345/vulnerabilities/ --recursive

# Download a sample file
aws s3 cp s3://my-vanta-vuln-data-12345/vulnerabilities/year=2024/month=01/day=15/data_2024-01-15T12:00:00.json ./sample.json

# View content
cat sample.json | jq . | head -50
```

### Step 6: Configure Monitoring

#### Subscribe to SNS Alarm Notifications

If you provided an email address during deployment:

1. Check your email for "AWS Notification - Subscription Confirmation"
2. Click "Confirm subscription" link
3. Verify subscription:
   ```bash
   aws sns list-subscriptions-by-topic \
     --topic-arn $(aws sns list-topics --query 'Topics[?contains(TopicArn, `vanta-vuln-alarms`)].TopicArn' --output text)
   ```

#### Access CloudWatch Dashboard

```bash
# Get dashboard URL from stack outputs
aws cloudformation describe-stacks \
  --stack-name vanta-vuln-stats \
  --query 'Stacks[0].Outputs[?OutputKey==`DashboardUrl`].OutputValue' \
  --output text
```

Or manually navigate to:
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=vanta-vuln-performance
```

## Post-Deployment Configuration

### Adjust EventBridge Schedule

The default schedule runs daily at 6 AM UTC. To change:

1. **Using AWS Console:**
   - Open EventBridge console
   - Navigate to Rules
   - Find rule: `vanta-vuln-stats-DailySync-*`
   - Edit schedule expression

2. **Using AWS CLI:**
   ```bash
   # Get rule name
   RULE_NAME=$(aws events list-rules --query 'Rules[?contains(Name, `DailySync`)].Name' --output text)

   # Update schedule (example: every 12 hours)
   aws events put-rule \
     --name $RULE_NAME \
     --schedule-expression "rate(12 hours)"
   ```

3. **Update in template.yaml and redeploy:**
   ```yaml
   Events:
     DailySync:
       Type: Schedule
       Properties:
         Schedule: 'cron(0 */12 * * ? *)'  # Every 12 hours
   ```

   Then redeploy:
   ```bash
   sam build && sam deploy
   ```

### Configure Lambda Reserved Concurrency

Adjust based on API rate limits:

```bash
# Update reserved concurrency
aws lambda put-function-concurrency \
  --function-name vanta-vuln-sync \
  --reserved-concurrent-executions 3

# Remove limit (use account default)
aws lambda delete-function-concurrency \
  --function-name vanta-vuln-sync
```

### Tune Memory and Timeout

After analyzing performance:

```bash
# Update memory (affects CPU allocation)
aws lambda update-function-configuration \
  --function-name vanta-vuln-sync \
  --memory-size 2048

# Update timeout
aws lambda update-function-configuration \
  --function-name vanta-vuln-sync \
  --timeout 900
```

Or update in `template.yaml` and redeploy.

## Updates and Redeployment

### Update Lambda Code

1. **Make code changes**
2. **Build**
   ```bash
   sam build
   ```
3. **Deploy**
   ```bash
   sam deploy
   ```

### Update Dependencies

1. **Update requirements-lambda.txt**
   ```bash
   # Edit requirements-lambda.txt
   # Example: boto3>=1.35.0
   ```

2. **Rebuild and deploy**
   ```bash
   sam build --use-container  # Use container for consistency
   sam deploy
   ```

### Update Configuration

1. **Edit template.yaml**
2. **Validate**
   ```bash
   sam validate
   ```
3. **Deploy**
   ```bash
   sam deploy
   ```

## Rollback

### Rollback Stack

```bash
# Method 1: Rollback to previous version
aws cloudformation cancel-update-stack \
  --stack-name vanta-vuln-stats

# Method 2: Delete and redeploy
aws cloudformation delete-stack \
  --stack-name vanta-vuln-stats

# Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name vanta-vuln-stats

# Redeploy from backup
sam deploy --config-file samconfig.toml.backup
```

### Rollback Lambda Function Only

```bash
# List versions
aws lambda list-versions-by-function \
  --function-name vanta-vuln-sync

# Update alias to previous version
aws lambda update-alias \
  --function-name vanta-vuln-sync \
  --name live \
  --function-version 5  # Replace with desired version
```

## Cleanup and Removal

### Delete Entire Stack

```bash
# Delete CloudFormation stack
aws cloudformation delete-stack \
  --stack-name vanta-vuln-stats

# Wait for deletion to complete
aws cloudformation wait stack-delete-complete \
  --stack-name vanta-vuln-stats
```

### Delete S3 Data

```bash
# Empty S3 bucket first
aws s3 rm s3://my-vanta-vuln-data-12345 --recursive

# Delete bucket
aws s3 rb s3://my-vanta-vuln-data-12345
```

### Delete Secrets Manager Secret

```bash
# Schedule deletion (7-30 day recovery window)
aws secretsmanager delete-secret \
  --secret-id vanta-api-credentials \
  --recovery-window-in-days 7

# Force immediate deletion (no recovery)
aws secretsmanager delete-secret \
  --secret-id vanta-api-credentials \
  --force-delete-without-recovery
```

## Troubleshooting

### Deployment Failures

#### Error: S3 Bucket Already Exists

**Cause**: Bucket names must be globally unique

**Solution**:
```bash
# Use a unique suffix
sam deploy \
  --parameter-overrides S3BucketName=vanta-vuln-data-$(uuidgen | cut -d'-' -f1)
```

#### Error: Insufficient Permissions

**Cause**: IAM user lacks required permissions

**Solution**: Ensure IAM user has these permissions:
- `AWSCloudFormationFullAccess`
- `AWSLambda_FullAccess`
- `IAMFullAccess`
- `AmazonS3FullAccess`
- `CloudWatchFullAccess`

Or use this policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "lambda:*",
        "s3:*",
        "iam:*",
        "cloudwatch:*",
        "logs:*",
        "events:*",
        "sqs:*",
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "*"
    }
  ]
}
```

#### Error: Layer Not Found

**Cause**: Lambda Insights layer ARN incorrect for region

**Solution**: Update `LambdaInsightsExtensionArn` parameter with correct ARN for your region:
- [Lambda Insights Layer ARNs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Lambda-Insights-extension-versions.html)

Example:
```bash
sam deploy \
  --parameter-overrides \
    LambdaInsightsExtensionArn=arn:aws:lambda:us-west-2:580247275435:layer:LambdaInsightsExtension:21
```

### Runtime Errors

#### Error: Unable to Import Module

**Cause**: Missing dependencies in Lambda layer

**Solution**:
```bash
# Rebuild Lambda layer
mkdir -p layer/python
pip install -r requirements-lambda.txt -t layer/python

# Redeploy
sam build && sam deploy
```

#### Error: Access Denied to Secrets Manager

**Cause**: Lambda execution role lacks permissions

**Solution**: Verify IAM policy in CloudFormation template or add manually:
```bash
aws iam attach-role-policy \
  --role-name vanta-vuln-stats-VantaSyncFunction-Role-XXXXX \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

#### Error: S3 Access Denied

**Cause**: Lambda role lacks S3 permissions

**Solution**: Verify S3 bucket policy and Lambda execution role permissions

### Performance Issues

#### Cold Starts Too High

See [LAMBDA_PERFORMANCE_OPTIMIZATION.md](LAMBDA_PERFORMANCE_OPTIMIZATION.md#high-cold-start-time)

#### Function Timeout

See [LAMBDA_PERFORMANCE_OPTIMIZATION.md](LAMBDA_PERFORMANCE_OPTIMIZATION.md#timeout-issues)

#### Memory Issues

See [LAMBDA_PERFORMANCE_OPTIMIZATION.md](LAMBDA_PERFORMANCE_OPTIMIZATION.md#memory-issues)

## Best Practices

### Security

1. **Use Secrets Manager** for credentials (never hardcode)
2. **Enable encryption** for S3 buckets and DLQ
3. **Use least privilege** IAM roles
4. **Enable AWS CloudTrail** for audit logging
5. **Rotate credentials** regularly

### Cost Optimization

1. **Right-size memory** allocation (see performance testing)
2. **Set appropriate timeouts** (avoid paying for hung functions)
3. **Use reserved concurrency** to control costs
4. **Enable S3 lifecycle policies** to archive old data
5. **Monitor costs** with AWS Cost Explorer

### Reliability

1. **Enable DLQ** for failed invocations
2. **Set up CloudWatch alarms**
3. **Monitor cold start rates**
4. **Test deployments** in staging environment first
5. **Have rollback plan** ready

### Monitoring

1. **Use Lambda Insights** for detailed metrics
2. **Enable X-Ray tracing** for performance analysis
3. **Set up CloudWatch dashboard**
4. **Configure SNS notifications**
5. **Review logs regularly**

## Multi-Environment Deployment

### Development Environment

```bash
sam deploy \
  --stack-name vanta-vuln-stats-dev \
  --parameter-overrides \
    Environment=dev \
    S3BucketName=vanta-vuln-data-dev \
    AlarmEmail=dev@mycompany.com
```

### Staging Environment

```bash
sam deploy \
  --stack-name vanta-vuln-stats-staging \
  --parameter-overrides \
    Environment=staging \
    S3BucketName=vanta-vuln-data-staging \
    AlarmEmail=staging@mycompany.com
```

### Production Environment

```bash
sam deploy \
  --stack-name vanta-vuln-stats-prod \
  --parameter-overrides \
    Environment=prod \
    S3BucketName=vanta-vuln-data-prod \
    AlarmEmail=ops@mycompany.com \
  --no-confirm-changeset \
  --fail-on-empty-changeset
```

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/deploy-lambda.yml
name: Deploy Lambda Functions

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Setup SAM CLI
        uses: aws-actions/setup-sam@v2

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: SAM Build
        run: sam build

      - name: SAM Deploy
        run: |
          sam deploy \
            --stack-name vanta-vuln-stats \
            --no-confirm-changeset \
            --no-fail-on-empty-changeset \
            --capabilities CAPABILITY_IAM
```

## Additional Resources

- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/latest/dg/)
- [AWS CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)
- [Performance Optimization Guide](LAMBDA_PERFORMANCE_OPTIMIZATION.md)

## Support

For deployment issues:
1. Check CloudFormation stack events
2. Review CloudWatch logs
3. Verify IAM permissions
4. Consult [AWS Support](https://console.aws.amazon.com/support/)
