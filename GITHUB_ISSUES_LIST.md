# GitHub Issues for S3/Athena/Lambda Integration

This document contains all the GitHub issues to be created for the S3/Athena/Lambda integration project.

You can either:
1. Run `scripts/create_github_issues.sh` locally (requires `gh` CLI)
2. Create these issues manually through the GitHub web interface
3. Use the GitHub API to batch-create them

---

## Labels to Create First

| Label | Color | Description |
|-------|-------|-------------|
| epic | 8B4513 | Epic/parent issue tracking major features |
| s3 | FF9900 | S3 storage related |
| athena | 232F3E | Athena query integration |
| lambda | FF9900 | AWS Lambda deployment |
| infrastructure | 0052CC | Infrastructure as Code |
| enhancement | a2eeef | New feature or request |
| documentation | 0075ca | Documentation improvements |

---

## Epic Issues (13 total)

### Epic 1: Foundation & Configuration
**Labels**: epic, enhancement, infrastructure
**Estimated Effort**: 3-4 days

Establish the foundational infrastructure and configuration management for S3 storage, Athena queries, and Lambda deployment.

**Goals**:
- Add AWS dependencies (boto3, pyarrow, pandas, aws-lambda-powertools)
- Implement environment-aware configuration (local vs Lambda)
- Support multiple credential sources (env vars, Secrets Manager, Parameter Store)
- Create configuration file structure

**Sub-tasks**:
- Add AWS dependencies to requirements
- Create configuration management system
- Implement credentials manager for multi-source loading
- Add environment detection (local vs Lambda)

---

### Epic 2: Code Refactoring for Lambda Compatibility
**Labels**: epic, enhancement, lambda
**Estimated Effort**: 3-4 days

Refactor existing codebase to support both local CLI execution and AWS Lambda deployment.

**Goals**:
- Separate business logic from CLI logic
- Create abstract storage backend interface
- Implement modular, testable components
- Organize code into proper package structure

**Sub-tasks**:
- Create storage backend abstract base class
- Refactor VantaAPIClient into src/api/
- Implement SQLiteStorage backend
- Refactor VulnerabilityStats into src/processors/
- Create proper package structure
- Add unit tests for refactored components

---

### Epic 3: S3 Storage Backend Implementation
**Labels**: epic, enhancement, s3
**Estimated Effort**: 2-3 days

Implement S3 as a storage backend with Parquet format support, partitioning, and efficient data operations.

**Goals**:
- Create S3Storage backend implementing StorageBackend interface
- Support Parquet format for Athena compatibility
- Implement date-based partitioning (year/month/day)
- Add concurrent upload support
- Implement streaming for large datasets

**Sub-tasks**:
- Create S3Storage class
- Implement data conversion (JSON → Parquet)
- Add partition management
- Implement store_vulnerabilities() for S3
- Implement store_vulnerability_remediations() for S3
- Add concurrent upload with retry logic
- Create migration utility (SQLite → S3)
- Add integration tests

---

### Epic 4: AWS Athena Query Integration
**Labels**: epic, enhancement, athena
**Estimated Effort**: 2-3 days

Implement AWS Athena integration for querying vulnerability data stored in S3.

**Goals**:
- Create Athena query client
- Implement Glue Catalog management
- Support async query execution
- Create predefined query templates
- Handle partition discovery

**Sub-tasks**:
- Create AthenaQueryClient class
- Implement GlueCatalogManager
- Create database and table schemas
- Add partition discovery/management
- Create query templates (critical vulns, remediation SLA, trends)
- Implement query result caching
- Add query execution and result fetching
- Create Athena integration tests

---

### Epic 5: AWS Lambda Handler Implementation
**Labels**: epic, enhancement, lambda
**Estimated Effort**: 3-4 days

Implement Lambda handlers for serverless execution of vulnerability syncs and queries.

**Goals**:
- Create sync handler for scheduled data fetching
- Create query handler for on-demand analysis
- Create catalog handler for partition management
- Implement proper error handling and logging
- Add CloudWatch metrics integration

**Sub-tasks**:
- Create sync_handler.py for scheduled syncs
- Create query_handler.py for API Gateway
- Create catalog_handler.py for S3 events
- Implement Lambda Powertools integration
- Add structured logging
- Add custom CloudWatch metrics
- Implement error handling and DLQ
- Add Lambda function tests

---

### Epic 6: Infrastructure as Code (SAM/CloudFormation/Terraform)
**Labels**: epic, infrastructure
**Estimated Effort**: 2-3 days

Create Infrastructure as Code templates for deploying all AWS resources.

**Goals**:
- Create AWS SAM template for Lambda functions
- Define S3 buckets with proper lifecycle policies
- Configure Glue database and tables
- Set up EventBridge schedules
- Configure API Gateway (optional)
- Create Terraform alternative for multi-cloud

**Sub-tasks**:
- Create SAM template (template.yaml)
- Define Lambda functions in SAM
- Configure S3 buckets and lifecycle policies
- Define Glue database in SAM
- Add EventBridge schedule for daily sync
- Configure IAM roles and policies
- Create Terraform templates (alternative)
- Add CloudFormation stack for Athena
- Create parameter configuration

---

### Epic 7: Step Functions Orchestration (Optional)
**Labels**: epic, enhancement, infrastructure
**Estimated Effort**: 1-2 days

Implement AWS Step Functions for orchestrating complex sync workflows with multiple Lambda functions.

**Goals**:
- Create state machine definition
- Implement parallel processing
- Add error handling and retries
- Configure SNS notifications
- Support workflow visualization

**Sub-tasks**:
- Design state machine workflow
- Create Step Functions definition JSON
- Implement parallel branch processing
- Add error handling states
- Configure SNS notifications
- Add to SAM/CloudFormation template
- Create workflow tests

**Note**: This is optional but recommended for complex workflows.

---

### Epic 8: Deployment Automation and CI/CD
**Labels**: epic, infrastructure
**Estimated Effort**: 1-2 days

Create automated deployment scripts and CI/CD pipeline for Lambda deployment.

**Goals**:
- Create deployment scripts for Lambda
- Build Lambda layer creation automation
- Implement SAM build/deploy pipeline
- Add GitHub Actions workflow (optional)
- Create rollback procedures

**Sub-tasks**:
- Create deploy_lambda.sh script
- Create create_layer.sh for Lambda layers
- Implement SAM build automation
- Add GitHub Actions workflow (optional)
- Create rollback script
- Add deployment validation tests
- Create deployment documentation

---

### Epic 9: Lambda Performance Optimizations
**Labels**: epic, enhancement, lambda
**Estimated Effort**: 1-2 days

Optimize Lambda functions for cold start time, memory usage, and execution cost.

**Goals**:
- Reduce cold start times
- Optimize memory allocation
- Implement connection pooling
- Add provisioned concurrency where needed
- Implement error handling and retries

**Sub-tasks**:
- Implement lazy import for heavy libraries
- Add connection pooling for AWS services
- Configure memory/timeout tuning
- Enable Lambda SnapStart (Python 3.11+)
- Implement exponential backoff with jitter
- Configure Dead Letter Queue (DLQ)
- Add CloudWatch alarms for errors
- Performance testing and benchmarking

---

### Epic 10: Monitoring and Observability
**Labels**: epic, enhancement, infrastructure
**Estimated Effort**: 1-2 days

Implement comprehensive monitoring, logging, and observability for Lambda functions and data pipeline.

**Goals**:
- Integrate CloudWatch custom metrics
- Implement structured logging
- Add X-Ray tracing
- Create CloudWatch dashboards
- Configure alarms and notifications

**Sub-tasks**:
- Implement Lambda Powertools metrics
- Add structured logging with correlation IDs
- Enable X-Ray tracing
- Create CloudWatch dashboard
- Configure CloudWatch alarms
- Set up SNS notifications
- Add cost tracking metrics
- Create runbook for common issues

---

### Epic 11: Enhanced CLI for Lambda Management
**Labels**: epic, enhancement
**Estimated Effort**: 1-2 days

Enhance the CLI to support Lambda deployment, management, and hybrid local/Lambda execution.

**Goals**:
- Add Lambda deployment commands
- Support triggering Lambda functions from CLI
- View Lambda execution status and logs
- Maintain backward compatibility with existing CLI

**Sub-tasks**:
- Add --deploy-lambda command
- Add --trigger-lambda-sync command
- Add --lambda-status command
- Add --lambda-logs command with streaming
- Add --storage-backend flag (sqlite|s3|hybrid)
- Update help documentation
- Add CLI tests
- Update README with new commands

---

### Epic 12: API Gateway Integration (Optional)
**Labels**: epic, enhancement, infrastructure
**Estimated Effort**: 2-3 days

Create REST API using API Gateway for querying vulnerability data via HTTP endpoints.

**Goals**:
- Create REST API for queries
- Implement authentication
- Add rate limiting
- Support multiple response formats
- Document API endpoints

**Sub-tasks**:
- Design REST API endpoints
- Configure API Gateway
- Implement API Key authentication
- Add Cognito authentication (optional)
- Implement rate limiting
- Add CORS configuration
- Create API documentation
- Add API integration tests

**Note**: This is optional for external API access.

---

### Epic 13: Documentation and Guides
**Labels**: epic, documentation
**Estimated Effort**: 2-3 days

Create comprehensive documentation for S3/Athena/Lambda integration.

**Goals**:
- Document local setup
- Document Lambda deployment
- Create S3/Athena guide
- Document API reference
- Create troubleshooting guide

**Sub-tasks**:
- Create LOCAL_SETUP.md
- Create LAMBDA_DEPLOYMENT.md
- Create S3_ATHENA_GUIDE.md
- Create API_REFERENCE.md
- Create MIGRATION.md (SQLite to S3)
- Create TROUBLESHOOTING.md
- Update main README.md
- Add architecture diagrams

---

## Detailed Sub-Task Issues (50+ total)

### Epic 1 Sub-Tasks

#### Issue: Add AWS dependencies to requirements
**Labels**: enhancement, infrastructure
**Epic**: Foundation & Configuration

Add AWS SDK and data processing dependencies to support S3, Athena, and Lambda functionality.

**Tasks**:
- Add boto3 to requirements.txt and requirements-lambda.txt
- Add pyarrow for Parquet support
- Add pandas for data transformation
- Add aws-lambda-powertools for Lambda logging/metrics
- Pin versions for reproducibility
- Test installation locally
- Document version requirements

**Dependencies Required**:
```
boto3>=1.34.0
pyarrow>=14.0.0
pandas>=2.1.0
aws-lambda-powertools>=2.30.0
```

---

#### Issue: Create configuration management system
**Labels**: enhancement
**Epic**: Foundation & Configuration

Implement flexible configuration management that works in both local and Lambda environments.

**Tasks**:
- Create src/config/settings.py module
- Support config file loading (JSON/YAML)
- Support environment variables
- Support AWS Systems Manager Parameter Store
- Add configuration validation
- Add default values
- Create config.json template
- Add unit tests

---

#### Issue: Implement credentials manager for multi-source loading
**Labels**: enhancement
**Epic**: Foundation & Configuration

Create CredentialsManager to load Vanta API credentials from multiple sources.

**Tasks**:
- Create src/config/credentials.py
- Support loading from environment variables
- Support loading from file (.env)
- Support AWS Secrets Manager
- Support AWS Systems Manager Parameter Store
- Add credential validation
- Implement caching for AWS-sourced credentials
- Add error handling for missing credentials
- Add unit tests

**Credential Sources (priority order)**:
1. Environment variables (VANTA_CLIENT_ID, VANTA_CLIENT_SECRET)
2. AWS Secrets Manager
3. AWS Systems Manager Parameter Store
4. File (VANTA_API_CREDENTIALS.env)

---

#### Issue: Add environment detection (local vs Lambda)
**Labels**: enhancement, lambda
**Epic**: Foundation & Configuration

Implement automatic detection of execution environment to enable environment-specific behavior.

**Tasks**:
- Detect Lambda environment (AWS_LAMBDA_FUNCTION_NAME env var)
- Detect local environment
- Create environment context class
- Set appropriate defaults per environment
- Add logging configuration per environment
- Add unit tests

---

### Epic 2 Sub-Tasks

#### Issue: Create storage backend abstract base class
**Labels**: enhancement
**Epic**: Code Refactoring

Create abstract base class (ABC) for storage backends to enable pluggable storage implementations.

**Tasks**:
- Create src/storage/base.py
- Define StorageBackend ABC
- Define abstract methods (store_vulnerabilities, get_all_vulnerabilities, etc.)
- Add docstrings with parameter/return type documentation
- Create type hints
- Add abstract properties if needed

---

#### Issue: Refactor VantaAPIClient into src/api/
**Labels**: enhancement, refactoring
**Epic**: Code Refactoring

Move VantaAPIClient class into proper package structure while maintaining all functionality.

**Tasks**:
- Create src/api/vanta_client.py
- Move VantaAPIClient class
- Update imports in main script
- Ensure backward compatibility
- Add any missing type hints
- Update docstrings
- Add unit tests
- Test with existing credentials

---

#### Issue: Implement SQLiteStorage backend
**Labels**: enhancement
**Epic**: Code Refactoring

Refactor existing SQLite database code into SQLiteStorage class implementing StorageBackend interface.

**Tasks**:
- Create src/storage/sqlite_storage.py
- Move VulnerabilityDatabase code into SQLiteStorage
- Implement StorageBackend interface
- Maintain all existing functionality
- Update database schema if needed
- Keep concurrent batch writing support
- Update imports in main script
- Add unit tests
- Test migration doesn't break existing databases

---

#### Issue: Refactor VulnerabilityStats into src/processors/
**Labels**: enhancement, refactoring
**Epic**: Code Refactoring

Move VulnerabilityStats class into processors package and separate statistics logic from presentation.

**Tasks**:
- Create src/processors/stats_generator.py
- Move VulnerabilityStats class
- Separate statistics calculation from printing
- Create separate formatter for output
- Update imports
- Maintain all existing functionality
- Add unit tests
- Test with existing data

---

#### Issue: Create proper package structure
**Labels**: enhancement, refactoring
**Epic**: Code Refactoring

Organize code into proper Python package structure with src/ directory and proper __init__.py files.

**Tasks**:
- Create src/ directory structure
- Create __init__.py files for all packages
- Update import statements
- Create setup.py or pyproject.toml
- Update entry points
- Test package installation
- Update documentation
- Ensure backward compatibility with existing scripts

---

### Epic 3 Sub-Tasks

#### Issue: Create S3Storage class implementing StorageBackend
**Labels**: enhancement, s3
**Epic**: S3 Storage Implementation

Implement S3Storage class that stores vulnerability data in S3 using Parquet format.

**Tasks**:
- Create src/storage/s3_storage.py
- Implement StorageBackend interface
- Add S3 client initialization with boto3
- Implement connection pooling
- Add retry logic with exponential backoff
- Handle S3 errors gracefully
- Add logging for S3 operations
- Add unit tests with mocked S3
- Add integration tests with real S3 (optional)

---

#### Issue: Implement data conversion (JSON → Parquet)
**Labels**: enhancement, s3
**Epic**: S3 Storage Implementation

Implement conversion pipeline from JSON API responses to Parquet format for S3 storage.

**Tasks**:
- Create conversion utilities in S3Storage
- Convert JSON to pandas DataFrame
- Handle nested JSON structures
- Flatten data appropriately for Parquet
- Configure Parquet compression (snappy/gzip)
- Handle schema evolution
- Add data validation
- Test with real Vanta data
- Benchmark compression ratios

---

#### Issue: Add partition management for S3 data
**Labels**: enhancement, s3
**Epic**: S3 Storage Implementation

Implement date-based partitioning (year/month/day) for S3 data to optimize Athena queries.

**Tasks**:
- Design partition structure (year/month/day)
- Implement partition path generation
- Add partition metadata tracking
- Create partition discovery logic
- Add partition pruning support
- Handle partition updates
- Add partition listing functionality
- Test partition creation
- Document partition scheme

**Partition Structure**:
```
s3://bucket/vulnerabilities/year=2024/month=01/day=15/data.parquet
```

---

#### Issue: Implement concurrent uploads with retry logic
**Labels**: enhancement, s3
**Epic**: S3 Storage Implementation

Add support for concurrent uploads to S3 with proper error handling and retry logic.

**Tasks**:
- Implement ThreadPoolExecutor for concurrent uploads
- Add S3 multipart upload for large files
- Implement exponential backoff retry logic
- Handle network errors gracefully
- Add progress tracking
- Implement upload validation
- Add cleanup for failed uploads
- Test with various failure scenarios
- Benchmark upload performance

---

#### Issue: Create migration utility (SQLite → S3)
**Labels**: enhancement, s3
**Epic**: S3 Storage Implementation

Create utility script to migrate existing SQLite database data to S3.

**Tasks**:
- Create scripts/migrate_sqlite_to_s3.py
- Read all data from SQLite
- Convert to Parquet format
- Upload to S3 with partitioning
- Validate data integrity
- Add progress bar
- Support incremental migration
- Add dry-run mode
- Create migration documentation
- Test with real database

---

## Issue Creation Instructions

### Using the Script (Recommended)

```bash
# Make the script executable
chmod +x scripts/create_github_issues.sh

# Run the script (requires gh CLI authenticated)
cd /home/user/vanta-vuln-stats
./scripts/create_github_issues.sh
```

### Manual Creation via GitHub Web Interface

1. Go to https://github.com/H4ZM47/vanta-vuln-stats/issues
2. Click "New Issue"
3. Copy the title and body from each issue above
4. Add the appropriate labels
5. Submit the issue
6. Repeat for all 50+ issues

### Using GitHub API

You can also use the GitHub REST API to batch-create issues:

```bash
# Example using curl
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.github.com/repos/H4ZM47/vanta-vuln-stats/issues \
  -d '{"title":"Epic: Foundation & Configuration","body":"...","labels":["epic","enhancement"]}'
```

---

## Summary

- **Total Epic Issues**: 13
- **Total Sub-Task Issues**: 50+
- **Total Labels**: 7
- **Estimated Total Effort**: 17-23 days (including optional features)

## Next Steps

1. Create all GitHub issues using preferred method
2. Review and prioritize issues
3. Assign team members (if applicable)
4. Create milestones for each epic
5. Start implementation with Epic 1
