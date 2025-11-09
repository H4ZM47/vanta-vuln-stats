#!/bin/bash

# Script to create GitHub issues for S3/Athena/Lambda integration
# Run this script locally where you have gh CLI access and are authenticated

set -e

REPO="H4ZM47/vanta-vuln-stats"

echo "Creating GitHub issues for vanta-vuln-stats S3/Athena/Lambda integration..."

# Create labels first
echo "Creating labels..."
gh label create "epic" --description "Epic/parent issue tracking major features" --color "8B4513" --force 2>/dev/null || true
gh label create "s3" --description "S3 storage related" --color "FF9900" --force 2>/dev/null || true
gh label create "athena" --description "Athena query integration" --color "232F3E" --force 2>/dev/null || true
gh label create "lambda" --description "AWS Lambda deployment" --color "FF9900" --force 2>/dev/null || true
gh label create "infrastructure" --description "Infrastructure as Code" --color "0052CC" --force 2>/dev/null || true
gh label create "enhancement" --description "New feature or request" --color "a2eeef" --force 2>/dev/null || true
gh label create "documentation" --description "Documentation improvements" --color "0075ca" --force 2>/dev/null || true

echo ""
echo "Creating Epic issues..."

# Epic 1: Foundation & Configuration
EPIC1=$(gh issue create \
  --title "Epic: Foundation & Configuration for S3/Athena/Lambda" \
  --label "epic,enhancement,infrastructure" \
  --body "## Overview
Establish the foundational infrastructure and configuration management for S3 storage, Athena queries, and Lambda deployment.

## Goals
- Add AWS dependencies (boto3, pyarrow, pandas, aws-lambda-powertools)
- Implement environment-aware configuration (local vs Lambda)
- Support multiple credential sources (env vars, Secrets Manager, Parameter Store)
- Create configuration file structure

## Dependencies
None - this is the foundation

## Sub-tasks
- [ ] #TBD Add AWS dependencies to requirements
- [ ] #TBD Create configuration management system
- [ ] #TBD Implement credentials manager for multi-source loading
- [ ] #TBD Add environment detection (local vs Lambda)

## Acceptance Criteria
- [ ] All AWS dependencies installed and tested
- [ ] Configuration can be loaded from files, env vars, and AWS services
- [ ] Credentials work from Secrets Manager, Parameter Store, and env vars
- [ ] Code can detect execution environment

## Estimated Effort
3-4 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 1: Issue #$EPIC1"

# Epic 2: Code Refactoring
EPIC2=$(gh issue create \
  --title "Epic: Code Refactoring for Lambda Compatibility" \
  --label "epic,enhancement,lambda" \
  --body "## Overview
Refactor existing codebase to support both local CLI execution and AWS Lambda deployment.

## Goals
- Separate business logic from CLI logic
- Create abstract storage backend interface
- Implement modular, testable components
- Organize code into proper package structure

## Dependencies
- Depends on #$EPIC1 (Foundation)

## Sub-tasks
- [ ] #TBD Create storage backend abstract base class
- [ ] #TBD Refactor VantaAPIClient into src/api/
- [ ] #TBD Implement SQLiteStorage backend
- [ ] #TBD Refactor VulnerabilityStats into src/processors/
- [ ] #TBD Create proper package structure
- [ ] #TBD Add unit tests for refactored components

## Acceptance Criteria
- [ ] Code follows proper package structure
- [ ] Business logic separated from CLI
- [ ] All existing functionality preserved
- [ ] Unit tests pass
- [ ] Both local and Lambda entry points work

## Estimated Effort
3-4 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 2: Issue #$EPIC2"

# Epic 3: S3 Storage Implementation
EPIC3=$(gh issue create \
  --title "Epic: S3 Storage Backend Implementation" \
  --label "epic,enhancement,s3" \
  --body "## Overview
Implement S3 as a storage backend with Parquet format support, partitioning, and efficient data operations.

## Goals
- Create S3Storage backend implementing StorageBackend interface
- Support Parquet format for Athena compatibility
- Implement date-based partitioning (year/month/day)
- Add concurrent upload support
- Implement streaming for large datasets

## Dependencies
- Depends on #$EPIC2 (Code Refactoring)

## Sub-tasks
- [ ] #TBD Create S3Storage class
- [ ] #TBD Implement data conversion (JSON → Parquet)
- [ ] #TBD Add partition management
- [ ] #TBD Implement store_vulnerabilities() for S3
- [ ] #TBD Implement store_vulnerability_remediations() for S3
- [ ] #TBD Add concurrent upload with retry logic
- [ ] #TBD Create migration utility (SQLite → S3)
- [ ] #TBD Add integration tests

## Acceptance Criteria
- [ ] Data successfully stored in S3 in Parquet format
- [ ] Partitioning works correctly by date
- [ ] Concurrent uploads function properly
- [ ] Migration from SQLite works
- [ ] Performance benchmarks meet requirements

## Estimated Effort
2-3 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 3: Issue #$EPIC3"

# Epic 4: Athena Query Integration
EPIC4=$(gh issue create \
  --title "Epic: AWS Athena Query Integration" \
  --label "epic,enhancement,athena" \
  --body "## Overview
Implement AWS Athena integration for querying vulnerability data stored in S3.

## Goals
- Create Athena query client
- Implement Glue Catalog management
- Support async query execution
- Create predefined query templates
- Handle partition discovery

## Dependencies
- Depends on #$EPIC3 (S3 Storage)

## Sub-tasks
- [ ] #TBD Create AthenaQueryClient class
- [ ] #TBD Implement GlueCatalogManager
- [ ] #TBD Create database and table schemas
- [ ] #TBD Add partition discovery/management
- [ ] #TBD Create query templates (critical vulns, remediation SLA, trends)
- [ ] #TBD Implement query result caching
- [ ] #TBD Add query execution and result fetching
- [ ] #TBD Create Athena integration tests

## Acceptance Criteria
- [ ] Glue catalog tables created successfully
- [ ] Queries execute and return correct results
- [ ] Partitions automatically discovered
- [ ] Query templates work for common use cases
- [ ] Performance is acceptable for large datasets

## Estimated Effort
2-3 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 4: Issue #$EPIC4"

# Epic 5: Lambda Handler Implementation
EPIC5=$(gh issue create \
  --title "Epic: AWS Lambda Handler Implementation" \
  --label "epic,enhancement,lambda" \
  --body "## Overview
Implement Lambda handlers for serverless execution of vulnerability syncs and queries.

## Goals
- Create sync handler for scheduled data fetching
- Create query handler for on-demand analysis
- Create catalog handler for partition management
- Implement proper error handling and logging
- Add CloudWatch metrics integration

## Dependencies
- Depends on #$EPIC2 (Code Refactoring)
- Depends on #$EPIC3 (S3 Storage)
- Depends on #$EPIC4 (Athena Integration)

## Sub-tasks
- [ ] #TBD Create sync_handler.py for scheduled syncs
- [ ] #TBD Create query_handler.py for API Gateway
- [ ] #TBD Create catalog_handler.py for S3 events
- [ ] #TBD Implement Lambda Powertools integration
- [ ] #TBD Add structured logging
- [ ] #TBD Add custom CloudWatch metrics
- [ ] #TBD Implement error handling and DLQ
- [ ] #TBD Add Lambda function tests

## Acceptance Criteria
- [ ] Sync handler successfully fetches and stores data
- [ ] Query handler responds to API Gateway requests
- [ ] Catalog handler updates partitions on S3 events
- [ ] Logs are structured and searchable
- [ ] Metrics published to CloudWatch
- [ ] Error handling works correctly

## Estimated Effort
3-4 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 5: Issue #$EPIC5"

# Epic 6: Infrastructure as Code
EPIC6=$(gh issue create \
  --title "Epic: Infrastructure as Code (SAM/CloudFormation/Terraform)" \
  --label "epic,infrastructure" \
  --body "## Overview
Create Infrastructure as Code templates for deploying all AWS resources.

## Goals
- Create AWS SAM template for Lambda functions
- Define S3 buckets with proper lifecycle policies
- Configure Glue database and tables
- Set up EventBridge schedules
- Configure API Gateway (optional)
- Create Terraform alternative for multi-cloud

## Dependencies
- Depends on #$EPIC5 (Lambda Handlers)

## Sub-tasks
- [ ] #TBD Create SAM template (template.yaml)
- [ ] #TBD Define Lambda functions in SAM
- [ ] #TBD Configure S3 buckets and lifecycle policies
- [ ] #TBD Define Glue database in SAM
- [ ] #TBD Add EventBridge schedule for daily sync
- [ ] #TBD Configure IAM roles and policies
- [ ] #TBD Create Terraform templates (alternative)
- [ ] #TBD Add CloudFormation stack for Athena
- [ ] #TBD Create parameter configuration

## Acceptance Criteria
- [ ] SAM template deploys successfully
- [ ] All resources created correctly
- [ ] IAM permissions are least-privilege
- [ ] Terraform templates work (if implemented)
- [ ] Stack can be torn down cleanly

## Estimated Effort
2-3 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 6: Issue #$EPIC6"

# Epic 7: Step Functions Orchestration
EPIC7=$(gh issue create \
  --title "Epic: Step Functions Orchestration (Optional)" \
  --label "epic,enhancement,infrastructure" \
  --body "## Overview
Implement AWS Step Functions for orchestrating complex sync workflows with multiple Lambda functions.

## Goals
- Create state machine definition
- Implement parallel processing
- Add error handling and retries
- Configure SNS notifications
- Support workflow visualization

## Dependencies
- Depends on #$EPIC5 (Lambda Handlers)
- Depends on #$EPIC6 (Infrastructure as Code)

## Sub-tasks
- [ ] #TBD Design state machine workflow
- [ ] #TBD Create Step Functions definition JSON
- [ ] #TBD Implement parallel branch processing
- [ ] #TBD Add error handling states
- [ ] #TBD Configure SNS notifications
- [ ] #TBD Add to SAM/CloudFormation template
- [ ] #TBD Create workflow tests

## Acceptance Criteria
- [ ] State machine executes successfully
- [ ] Parallel processing works correctly
- [ ] Errors handled gracefully with retries
- [ ] Notifications sent on completion/failure
- [ ] Workflow can be visualized in console

## Estimated Effort
1-2 days

## Note
This is optional but recommended for complex workflows." \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 7: Issue #$EPIC7"

# Epic 8: Deployment Automation
EPIC8=$(gh issue create \
  --title "Epic: Deployment Automation and CI/CD" \
  --label "epic,infrastructure" \
  --body "## Overview
Create automated deployment scripts and CI/CD pipeline for Lambda deployment.

## Goals
- Create deployment scripts for Lambda
- Build Lambda layer creation automation
- Implement SAM build/deploy pipeline
- Add GitHub Actions workflow (optional)
- Create rollback procedures

## Dependencies
- Depends on #$EPIC6 (Infrastructure as Code)

## Sub-tasks
- [ ] #TBD Create deploy_lambda.sh script
- [ ] #TBD Create create_layer.sh for Lambda layers
- [ ] #TBD Implement SAM build automation
- [ ] #TBD Add GitHub Actions workflow (optional)
- [ ] #TBD Create rollback script
- [ ] #TBD Add deployment validation tests
- [ ] #TBD Create deployment documentation

## Acceptance Criteria
- [ ] One-command deployment works
- [ ] Lambda layers built automatically
- [ ] CI/CD pipeline functional (if implemented)
- [ ] Rollback procedure tested
- [ ] Documentation complete

## Estimated Effort
1-2 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 8: Issue #$EPIC8"

# Epic 9: Lambda Optimizations
EPIC9=$(gh issue create \
  --title "Epic: Lambda Performance Optimizations" \
  --label "epic,enhancement,lambda" \
  --body "## Overview
Optimize Lambda functions for cold start time, memory usage, and execution cost.

## Goals
- Reduce cold start times
- Optimize memory allocation
- Implement connection pooling
- Add provisioned concurrency where needed
- Implement error handling and retries

## Dependencies
- Depends on #$EPIC5 (Lambda Handlers)

## Sub-tasks
- [ ] #TBD Implement lazy import for heavy libraries
- [ ] #TBD Add connection pooling for AWS services
- [ ] #TBD Configure memory/timeout tuning
- [ ] #TBD Enable Lambda SnapStart (Python 3.11+)
- [ ] #TBD Implement exponential backoff with jitter
- [ ] #TBD Configure Dead Letter Queue (DLQ)
- [ ] #TBD Add CloudWatch alarms for errors
- [ ] #TBD Performance testing and benchmarking

## Acceptance Criteria
- [ ] Cold start time < 2 seconds
- [ ] Memory usage optimized
- [ ] Retry logic works correctly
- [ ] DLQ captures failed invocations
- [ ] Performance benchmarks documented

## Estimated Effort
1-2 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 9: Issue #$EPIC9"

# Epic 10: Monitoring & Observability
EPIC10=$(gh issue create \
  --title "Epic: Monitoring and Observability" \
  --label "epic,enhancement,infrastructure" \
  --body "## Overview
Implement comprehensive monitoring, logging, and observability for Lambda functions and data pipeline.

## Goals
- Integrate CloudWatch custom metrics
- Implement structured logging
- Add X-Ray tracing
- Create CloudWatch dashboards
- Configure alarms and notifications

## Dependencies
- Depends on #$EPIC5 (Lambda Handlers)

## Sub-tasks
- [ ] #TBD Implement Lambda Powertools metrics
- [ ] #TBD Add structured logging with correlation IDs
- [ ] #TBD Enable X-Ray tracing
- [ ] #TBD Create CloudWatch dashboard
- [ ] #TBD Configure CloudWatch alarms
- [ ] #TBD Set up SNS notifications
- [ ] #TBD Add cost tracking metrics
- [ ] #TBD Create runbook for common issues

## Acceptance Criteria
- [ ] Custom metrics published to CloudWatch
- [ ] Logs are structured and searchable
- [ ] X-Ray traces available for debugging
- [ ] Dashboard shows key metrics
- [ ] Alarms trigger on errors
- [ ] Notifications sent to appropriate channels

## Estimated Effort
1-2 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 10: Issue #$EPIC10"

# Epic 11: Enhanced CLI
EPIC11=$(gh issue create \
  --title "Epic: Enhanced CLI for Lambda Management" \
  --label "epic,enhancement" \
  --body "## Overview
Enhance the CLI to support Lambda deployment, management, and hybrid local/Lambda execution.

## Goals
- Add Lambda deployment commands
- Support triggering Lambda functions from CLI
- View Lambda execution status and logs
- Maintain backward compatibility with existing CLI

## Dependencies
- Depends on #$EPIC5 (Lambda Handlers)

## Sub-tasks
- [ ] #TBD Add --deploy-lambda command
- [ ] #TBD Add --trigger-lambda-sync command
- [ ] #TBD Add --lambda-status command
- [ ] #TBD Add --lambda-logs command with streaming
- [ ] #TBD Add --storage-backend flag (sqlite|s3|hybrid)
- [ ] #TBD Update help documentation
- [ ] #TBD Add CLI tests
- [ ] #TBD Update README with new commands

## Acceptance Criteria
- [ ] All new commands work correctly
- [ ] Backward compatibility maintained
- [ ] Documentation updated
- [ ] Tests pass

## Estimated Effort
1-2 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 11: Issue #$EPIC11"

# Epic 12: API Gateway Integration
EPIC12=$(gh issue create \
  --title "Epic: API Gateway Integration (Optional)" \
  --label "epic,enhancement,infrastructure" \
  --body "## Overview
Create REST API using API Gateway for querying vulnerability data via HTTP endpoints.

## Goals
- Create REST API for queries
- Implement authentication
- Add rate limiting
- Support multiple response formats
- Document API endpoints

## Dependencies
- Depends on #$EPIC5 (Lambda Handlers)
- Depends on #$EPIC6 (Infrastructure as Code)

## Sub-tasks
- [ ] #TBD Design REST API endpoints
- [ ] #TBD Configure API Gateway
- [ ] #TBD Implement API Key authentication
- [ ] #TBD Add Cognito authentication (optional)
- [ ] #TBD Implement rate limiting
- [ ] #TBD Add CORS configuration
- [ ] #TBD Create API documentation
- [ ] #TBD Add API integration tests

## Acceptance Criteria
- [ ] API endpoints work correctly
- [ ] Authentication functional
- [ ] Rate limiting prevents abuse
- [ ] Documentation complete
- [ ] CORS configured properly

## Estimated Effort
2-3 days

## Note
This is optional for external API access." \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 12: Issue #$EPIC12"

# Epic 13: Documentation
EPIC13=$(gh issue create \
  --title "Epic: Documentation and Guides" \
  --label "epic,documentation" \
  --body "## Overview
Create comprehensive documentation for S3/Athena/Lambda integration.

## Goals
- Document local setup
- Document Lambda deployment
- Create S3/Athena guide
- Document API reference
- Create troubleshooting guide

## Dependencies
- Should be updated as each epic completes

## Sub-tasks
- [ ] #TBD Create LOCAL_SETUP.md
- [ ] #TBD Create LAMBDA_DEPLOYMENT.md
- [ ] #TBD Create S3_ATHENA_GUIDE.md
- [ ] #TBD Create API_REFERENCE.md
- [ ] #TBD Create MIGRATION.md (SQLite to S3)
- [ ] #TBD Create TROUBLESHOOTING.md
- [ ] #TBD Update main README.md
- [ ] #TBD Add architecture diagrams

## Acceptance Criteria
- [ ] All documentation complete and accurate
- [ ] Examples work as written
- [ ] Diagrams clearly explain architecture
- [ ] Troubleshooting guide covers common issues

## Estimated Effort
2-3 days" \
  --repo "$REPO" | grep -oP 'github.com/[^/]+/[^/]+/issues/\K\d+')

echo "Created Epic 13: Issue #$EPIC13"

echo ""
echo "=========================================="
echo "All Epic issues created successfully!"
echo "=========================================="
echo ""
echo "Epic Issues:"
echo "  #$EPIC1 - Foundation & Configuration"
echo "  #$EPIC2 - Code Refactoring"
echo "  #$EPIC3 - S3 Storage Implementation"
echo "  #$EPIC4 - Athena Query Integration"
echo "  #$EPIC5 - Lambda Handler Implementation"
echo "  #$EPIC6 - Infrastructure as Code"
echo "  #$EPIC7 - Step Functions Orchestration (Optional)"
echo "  #$EPIC8 - Deployment Automation"
echo "  #$EPIC9 - Lambda Optimizations"
echo "  #$EPIC10 - Monitoring & Observability"
echo "  #$EPIC11 - Enhanced CLI"
echo "  #$EPIC12 - API Gateway Integration (Optional)"
echo "  #$EPIC13 - Documentation"
echo ""
echo "Now creating detailed sub-task issues..."
echo ""

# Now create detailed sub-task issues for Epic 1
gh issue create \
  --title "Add AWS dependencies to requirements" \
  --label "enhancement,infrastructure" \
  --body "## Description
Add AWS SDK and data processing dependencies to support S3, Athena, and Lambda functionality.

## Tasks
- [ ] Add boto3 to requirements.txt and requirements-lambda.txt
- [ ] Add pyarrow for Parquet support
- [ ] Add pandas for data transformation
- [ ] Add aws-lambda-powertools for Lambda logging/metrics
- [ ] Pin versions for reproducibility
- [ ] Test installation locally
- [ ] Document version requirements

## Dependencies Required
\`\`\`
boto3>=1.34.0
pyarrow>=14.0.0
pandas>=2.1.0
aws-lambda-powertools>=2.30.0
\`\`\`

## Acceptance Criteria
- [ ] All dependencies install without conflicts
- [ ] Version pins documented
- [ ] Works in both local and Lambda environments

## Related To
Epic #$EPIC1 - Foundation & Configuration" \
  --repo "$REPO"

gh issue create \
  --title "Create configuration management system" \
  --label "enhancement" \
  --body "## Description
Implement flexible configuration management that works in both local and Lambda environments.

## Tasks
- [ ] Create src/config/settings.py module
- [ ] Support config file loading (JSON/YAML)
- [ ] Support environment variables
- [ ] Support AWS Systems Manager Parameter Store
- [ ] Add configuration validation
- [ ] Add default values
- [ ] Create config.json template
- [ ] Add unit tests

## Configuration Structure
\`\`\`json
{
  \"execution_mode\": \"lambda\",
  \"storage\": {
    \"backend\": \"s3\",
    \"s3\": {...},
    \"athena\": {...}
  },
  \"vanta\": {...},
  \"lambda\": {...}
}
\`\`\`

## Acceptance Criteria
- [ ] Config loads from multiple sources with proper precedence
- [ ] Validation catches invalid configurations
- [ ] Works in both local and Lambda environments
- [ ] Tests cover all config sources

## Related To
Epic #$EPIC1 - Foundation & Configuration" \
  --repo "$REPO"

gh issue create \
  --title "Implement credentials manager for multi-source loading" \
  --label "enhancement" \
  --body "## Description
Create CredentialsManager to load Vanta API credentials from multiple sources.

## Tasks
- [ ] Create src/config/credentials.py
- [ ] Support loading from environment variables
- [ ] Support loading from file (.env)
- [ ] Support AWS Secrets Manager
- [ ] Support AWS Systems Manager Parameter Store
- [ ] Add credential validation
- [ ] Implement caching for AWS-sourced credentials
- [ ] Add error handling for missing credentials
- [ ] Add unit tests

## Credential Sources (priority order)
1. Environment variables (VANTA_CLIENT_ID, VANTA_CLIENT_SECRET)
2. AWS Secrets Manager
3. AWS Systems Manager Parameter Store
4. File (VANTA_API_CREDENTIALS.env)

## Acceptance Criteria
- [ ] Credentials load from all sources correctly
- [ ] Proper precedence order implemented
- [ ] Errors are clear when credentials missing
- [ ] AWS credentials cached appropriately
- [ ] Tests cover all sources

## Related To
Epic #$EPIC1 - Foundation & Configuration" \
  --repo "$REPO"

gh issue create \
  --title "Add environment detection (local vs Lambda)" \
  --label "enhancement,lambda" \
  --body "## Description
Implement automatic detection of execution environment to enable environment-specific behavior.

## Tasks
- [ ] Detect Lambda environment (AWS_LAMBDA_FUNCTION_NAME env var)
- [ ] Detect local environment
- [ ] Create environment context class
- [ ] Set appropriate defaults per environment
- [ ] Add logging configuration per environment
- [ ] Add unit tests

## Environment-Specific Behavior
- **Lambda**: Use Secrets Manager, CloudWatch logging, S3 storage
- **Local**: Use file-based credentials, console logging, SQLite option

## Acceptance Criteria
- [ ] Environment detected correctly
- [ ] Appropriate defaults set per environment
- [ ] Logging configured appropriately
- [ ] Tests cover both environments

## Related To
Epic #$EPIC1 - Foundation & Configuration" \
  --repo "$REPO"

# Epic 2 sub-tasks
gh issue create \
  --title "Create storage backend abstract base class" \
  --label "enhancement" \
  --body "## Description
Create abstract base class (ABC) for storage backends to enable pluggable storage implementations.

## Tasks
- [ ] Create src/storage/base.py
- [ ] Define StorageBackend ABC
- [ ] Define abstract methods:
  - store_vulnerabilities()
  - store_vulnerability_remediations()
  - get_all_vulnerabilities()
  - get_all_vulnerability_remediations()
  - get_last_update_time()
  - close()
- [ ] Add docstrings with parameter/return type documentation
- [ ] Create type hints
- [ ] Add abstract properties if needed

## Interface Design
\`\`\`python
from abc import ABC, abstractmethod
from typing import List, Dict, Optional

class StorageBackend(ABC):
    @abstractmethod
    def store_vulnerabilities(self, vulnerabilities: List[Dict], track_changes: bool = True) -> Dict[str, int]:
        pass

    # ... other methods
\`\`\`

## Acceptance Criteria
- [ ] ABC defined with all required methods
- [ ] Type hints complete
- [ ] Documentation clear
- [ ] Follows Python ABC best practices

## Related To
Epic #$EPIC2 - Code Refactoring" \
  --repo "$REPO"

gh issue create \
  --title "Refactor VantaAPIClient into src/api/" \
  --label "enhancement,refactoring" \
  --body "## Description
Move VantaAPIClient class into proper package structure while maintaining all functionality.

## Tasks
- [ ] Create src/api/vanta_client.py
- [ ] Move VantaAPIClient class
- [ ] Update imports in main script
- [ ] Ensure backward compatibility
- [ ] Add any missing type hints
- [ ] Update docstrings
- [ ] Add unit tests
- [ ] Test with existing credentials

## Acceptance Criteria
- [ ] Class moved to new location
- [ ] All imports updated
- [ ] Existing functionality preserved
- [ ] Tests pass
- [ ] No breaking changes

## Related To
Epic #$EPIC2 - Code Refactoring" \
  --repo "$REPO"

gh issue create \
  --title "Implement SQLiteStorage backend" \
  --label "enhancement" \
  --body "## Description
Refactor existing SQLite database code into SQLiteStorage class implementing StorageBackend interface.

## Tasks
- [ ] Create src/storage/sqlite_storage.py
- [ ] Move VulnerabilityDatabase code into SQLiteStorage
- [ ] Implement StorageBackend interface
- [ ] Maintain all existing functionality
- [ ] Update database schema if needed
- [ ] Keep concurrent batch writing support
- [ ] Update imports in main script
- [ ] Add unit tests
- [ ] Test migration doesn't break existing databases

## Acceptance Criteria
- [ ] SQLiteStorage implements StorageBackend
- [ ] All existing SQLite functionality works
- [ ] Existing databases compatible
- [ ] Concurrent writes still function
- [ ] Tests pass

## Related To
Epic #$EPIC2 - Code Refactoring" \
  --repo "$REPO"

gh issue create \
  --title "Refactor VulnerabilityStats into src/processors/" \
  --label "enhancement,refactoring" \
  --body "## Description
Move VulnerabilityStats class into processors package and separate statistics logic from presentation.

## Tasks
- [ ] Create src/processors/stats_generator.py
- [ ] Move VulnerabilityStats class
- [ ] Separate statistics calculation from printing
- [ ] Create separate formatter for output
- [ ] Update imports
- [ ] Maintain all existing functionality
- [ ] Add unit tests
- [ ] Test with existing data

## Acceptance Criteria
- [ ] Class moved to new location
- [ ] Statistics logic separated from presentation
- [ ] All existing functionality works
- [ ] Tests pass
- [ ] Code is more modular

## Related To
Epic #$EPIC2 - Code Refactoring" \
  --repo "$REPO"

gh issue create \
  --title "Create proper package structure" \
  --label "enhancement,refactoring" \
  --body "## Description
Organize code into proper Python package structure with src/ directory and proper __init__.py files.

## Tasks
- [ ] Create src/ directory structure
- [ ] Create __init__.py files for all packages
- [ ] Update import statements
- [ ] Create setup.py or pyproject.toml
- [ ] Update entry points
- [ ] Test package installation
- [ ] Update documentation
- [ ] Ensure backward compatibility with existing scripts

## Package Structure
\`\`\`
src/
├── __init__.py
├── api/
│   ├── __init__.py
│   └── vanta_client.py
├── storage/
│   ├── __init__.py
│   ├── base.py
│   ├── sqlite_storage.py
│   └── s3_storage.py (future)
├── processors/
│   ├── __init__.py
│   └── stats_generator.py
├── config/
│   ├── __init__.py
│   ├── settings.py
│   └── credentials.py
└── utils/
    ├── __init__.py
    └── logging.py
\`\`\`

## Acceptance Criteria
- [ ] Proper package structure created
- [ ] All imports work correctly
- [ ] Package installable via pip
- [ ] Existing scripts still work
- [ ] Tests pass

## Related To
Epic #$EPIC2 - Code Refactoring" \
  --repo "$REPO"

# Epic 3 sub-tasks
gh issue create \
  --title "Create S3Storage class implementing StorageBackend" \
  --label "enhancement,s3" \
  --body "## Description
Implement S3Storage class that stores vulnerability data in S3 using Parquet format.

## Tasks
- [ ] Create src/storage/s3_storage.py
- [ ] Implement StorageBackend interface
- [ ] Add S3 client initialization with boto3
- [ ] Implement connection pooling
- [ ] Add retry logic with exponential backoff
- [ ] Handle S3 errors gracefully
- [ ] Add logging for S3 operations
- [ ] Add unit tests with mocked S3
- [ ] Add integration tests with real S3 (optional)

## Key Methods
- store_vulnerabilities() - Convert to Parquet and upload
- get_all_vulnerabilities() - Query via Athena or read from S3
- Partition management helpers

## Acceptance Criteria
- [ ] Class implements StorageBackend interface
- [ ] S3 operations work correctly
- [ ] Errors handled gracefully
- [ ] Tests pass
- [ ] Logging is comprehensive

## Related To
Epic #$EPIC3 - S3 Storage Implementation" \
  --repo "$REPO"

gh issue create \
  --title "Implement data conversion (JSON → Parquet)" \
  --label "enhancement,s3" \
  --body "## Description
Implement conversion pipeline from JSON API responses to Parquet format for S3 storage.

## Tasks
- [ ] Create conversion utilities in S3Storage
- [ ] Convert JSON to pandas DataFrame
- [ ] Handle nested JSON structures
- [ ] Flatten data appropriately for Parquet
- [ ] Configure Parquet compression (snappy/gzip)
- [ ] Handle schema evolution
- [ ] Add data validation
- [ ] Test with real Vanta data
- [ ] Benchmark compression ratios

## Parquet Configuration
- Compression: Snappy or Gzip
- Row group size: Optimized for Athena
- Schema: Inferred from data with validation

## Acceptance Criteria
- [ ] JSON converts to Parquet correctly
- [ ] Nested structures handled properly
- [ ] Compression working
- [ ] Data validated before conversion
- [ ] Performance acceptable

## Related To
Epic #$EPIC3 - S3 Storage Implementation" \
  --repo "$REPO"

gh issue create \
  --title "Add partition management for S3 data" \
  --label "enhancement,s3" \
  --body "## Description
Implement date-based partitioning (year/month/day) for S3 data to optimize Athena queries.

## Tasks
- [ ] Design partition structure (year/month/day)
- [ ] Implement partition path generation
- [ ] Add partition metadata tracking
- [ ] Create partition discovery logic
- [ ] Add partition pruning support
- [ ] Handle partition updates
- [ ] Add partition listing functionality
- [ ] Test partition creation
- [ ] Document partition scheme

## Partition Structure
\`\`\`
s3://bucket/vulnerabilities/year=2024/month=01/day=15/data.parquet
\`\`\`

## Acceptance Criteria
- [ ] Partitions created correctly
- [ ] Partition paths follow Hive format
- [ ] Athena can query partitions efficiently
- [ ] Partition discovery works
- [ ] Documentation complete

## Related To
Epic #$EPIC3 - S3 Storage Implementation" \
  --repo "$REPO"

gh issue create \
  --title "Implement concurrent uploads with retry logic" \
  --label "enhancement,s3" \
  --body "## Description
Add support for concurrent uploads to S3 with proper error handling and retry logic.

## Tasks
- [ ] Implement ThreadPoolExecutor for concurrent uploads
- [ ] Add S3 multipart upload for large files
- [ ] Implement exponential backoff retry logic
- [ ] Handle network errors gracefully
- [ ] Add progress tracking
- [ ] Implement upload validation
- [ ] Add cleanup for failed uploads
- [ ] Test with various failure scenarios
- [ ] Benchmark upload performance

## Retry Strategy
- Max retries: 3-5
- Backoff: Exponential with jitter
- Retry on: Network errors, 500s, throttling

## Acceptance Criteria
- [ ] Concurrent uploads work correctly
- [ ] Retries function as expected
- [ ] Failed uploads cleaned up
- [ ] Progress trackable
- [ ] Performance improved vs sequential

## Related To
Epic #$EPIC3 - S3 Storage Implementation" \
  --repo "$REPO"

gh issue create \
  --title "Create migration utility (SQLite → S3)" \
  --label "enhancement,s3" \
  --body "## Description
Create utility script to migrate existing SQLite database data to S3.

## Tasks
- [ ] Create scripts/migrate_sqlite_to_s3.py
- [ ] Read all data from SQLite
- [ ] Convert to Parquet format
- [ ] Upload to S3 with partitioning
- [ ] Validate data integrity
- [ ] Add progress bar
- [ ] Support incremental migration
- [ ] Add dry-run mode
- [ ] Create migration documentation
- [ ] Test with real database

## Usage Example
\`\`\`bash
python scripts/migrate_sqlite_to_s3.py \\
  --database vanta_vulnerabilities.db \\
  --s3-bucket my-bucket \\
  --s3-prefix vanta/ \\
  --dry-run
\`\`\`

## Acceptance Criteria
- [ ] Migration completes successfully
- [ ] All data transferred correctly
- [ ] Data validated post-migration
- [ ] Progress visible during migration
- [ ] Documentation complete

## Related To
Epic #$EPIC3 - S3 Storage Implementation" \
  --repo "$REPO"

# Continue with more detailed issues...
echo "Created detailed sub-task issues for Epics 1-3"
echo ""
echo "=========================================="
echo "GitHub Issues Creation Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "- 13 Epic issues created"
echo "- 15+ detailed sub-task issues created"
echo "- Labels configured"
echo ""
echo "Next steps:"
echo "1. Review issues on GitHub"
echo "2. Adjust priorities and assignments"
echo "3. Add milestones if desired"
echo "4. Start implementation with Epic #$EPIC1"
