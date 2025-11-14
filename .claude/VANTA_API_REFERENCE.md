# Vanta API - Comprehensive Reference

This document provides a complete reference for the Vanta API endpoints related to vulnerability management, based on analysis of the official Postman collection and production implementation.

**Base URL:** `https://api.vanta.com/v1`
**Authentication:** Bearer token via OAuth 2.0 client credentials flow

## Table of Contents

1. [Authentication](#authentication)
2. [Vulnerabilities API](#vulnerabilities-api)
3. [Vulnerable Assets API](#vulnerable-assets-api)
4. [Vulnerability Remediations API](#vulnerability-remediations-api)
5. [Pagination & Rate Limiting](#pagination--rate-limiting)
6. [Data Relationships](#data-relationships)

---

## Authentication

### OAuth 2.0 Token Endpoint

**Endpoint:** `POST https://api.vanta.com/oauth/token`

**Request Body:**
```json
{
  "client_id": "your_client_id",
  "client_secret": "your_client_secret",
  "scope": "vanta-api.all:read",
  "grant_type": "client_credentials"
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

**Notes:**
- Tokens expire after `expires_in` seconds (typically 3600)
- Refresh tokens 60 seconds before expiration
- Use `Authorization: Bearer <access_token>` header for all API calls

---

## Vulnerabilities API

### List Vulnerabilities

**Endpoint:** `GET /vulnerabilities`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `pageSize` | integer | Items per page (1-100, default: 100) |
| `pageCursor` | string | Pagination cursor |
| `q` | string | Search query |
| `isDeactivated` | boolean | Filter by deactivation status |
| `externalVulnerabilityId` | string | Filter by CVE ID |
| `isFixAvailable` | boolean | Filter by fix availability |
| `packageIdentifier` | string | Filter by package name |
| `slaDeadlineAfterDate` | string (ISO 8601) | SLA due after date |
| `slaDeadlineBeforeDate` | string (ISO 8601) | SLA due before date |
| `severity` | string | CRITICAL, HIGH, MEDIUM, LOW |
| `integrationId` | string | Filter by scanner |
| `vulnerableAssetId` | string | Filter by asset ID |

**Response Structure:**
```json
{
  "results": {
    "pageInfo": {
      "hasNextPage": true,
      "endCursor": "YXJyYXljb25uZWN0aW9uOjE="
    },
    "data": [
      {
        "id": "a2f7e1b9d0c3f4e5a6c7b8d9",
        "name": "CVE-2021-12345",
        "description": "Vulnerability description...",
        "integrationId": "Inspector",
        "packageIdentifier": "package-name",
        "vulnerabilityType": "COMMON",
        "targetId": "asset-id",
        "firstDetectedDate": "2021-01-01T00:00:00.000Z",
        "lastDetectedDate": "2021-01-01T00:00:00.000Z",
        "severity": "CRITICAL",
        "cvssSeverityScore": 9.8,
        "scannerScore": 100,
        "isFixable": true,
        "remediateByDate": "2021-01-01T00:00:00.000Z",
        "relatedVulns": ["CVE-2021-12345"],
        "relatedUrls": ["https://cve.mitre.org/..."],
        "externalURL": "https://cve.mitre.org/...",
        "scanSource": "Scanner source",
        "deactivateMetadata": {
          "deactivatedBy": "user-id",
          "deactivatedOnDate": "2021-01-01T00:00:00.000Z",
          "deactivationReason": "reason text",
          "isVulnDeactivatedIndefinitely": true
        }
      }
    ]
  }
}
```

### Get Vulnerability by ID

**Endpoint:** `GET /vulnerabilities/{vulnerabilityId}`

Returns detailed information for a specific vulnerability.

---

## Vulnerable Assets API

### List Vulnerable Assets

**Endpoint:** `GET /vulnerable-assets`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `pageSize` | integer | Items per page (1-100, default: 100) |
| `pageCursor` | string | Pagination cursor |
| `q` | string | Search query |
| `integrationId` | string | Filter by scanner |
| `assetType` | string | See Asset Types below |
| `assetExternalAccountId` | string | Filter by external account |

**Asset Types:**
- `CODE_REPOSITORY` - Source code repositories
- `CONTAINER_REPOSITORY` - Container image repositories
- `CONTAINER_REPOSITORY_IMAGE` - Individual container images
- `MANIFEST_FILE` - Configuration/manifest files
- `SERVER` - Virtual or physical servers
- `SERVERLESS_FUNCTION` - Lambda/Cloud Functions
- `WORKSTATION` - End-user workstations

**Response Structure:**
```json
{
  "results": {
    "pageInfo": {
      "hasNextPage": true,
      "endCursor": "YXJyYXljb25uZWN0aW9uOjE="
    },
    "data": [
      {
        "id": "a2f7e1b9d0c3f4e5a6c7b8d9",
        "name": "production-server-01",
        "assetType": "SERVER",
        "hasBeenScanned": true,
        "imageScanTag": "latest",
        "scanners": [
          {
            "resourceId": "6733c25f852819d3b8d97a86",
            "integrationId": "qualys",
            "imageDigest": "sha256:123456",
            "imagePushedAtDate": "2021-01-01T00:00:00.000Z",
            "imageTags": ["v1.0.0"],
            "assetTags": [
              {
                "key": "environment",
                "value": "production"
              }
            ],
            "parentAccountOrOrganization": "account-id",
            "biosUuid": "123456",
            "ipv4s": ["192.168.1.1"],
            "ipv6s": null,
            "macAddresses": ["00:00:00:00:00:00"],
            "hostnames": ["server-01"],
            "fqdns": ["server-01.example.com"],
            "operatingSystems": ["Ubuntu 20.04"],
            "targetId": "scanner-target-id"
          }
        ]
      }
    ]
  }
}
```

### Get Vulnerable Asset by ID

**Endpoint:** `GET /vulnerable-assets/{vulnerableAssetId}`

Returns detailed information for a specific asset.

---

## Vulnerability Remediations API

### List Vulnerability Remediations

**Endpoint:** `GET /vulnerability-remediations`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `pageSize` | integer | Items per page (1-100, default: 100) |
| `pageCursor` | string | Pagination cursor |
| `integrationId` | string | Filter by scanner |
| `severity` | string | CRITICAL, HIGH, MEDIUM, LOW |
| `isRemediatedOnTime` | boolean | Filter by SLA compliance |
| `remediatedAfterDate` | string (ISO 8601) | After date |
| `remediatedBeforeDate` | string (ISO 8601) | Before date |

**Response Structure:**
```json
{
  "results": {
    "pageInfo": {
      "hasNextPage": true,
      "endCursor": "YXJyYXljb25uZWN0aW9uOjE="
    },
    "data": [
      {
        "id": "a2f7e1b9d0c3f4e5a6c7b8d9",
        "vulnerabilityId": "vuln-id",
        "vulnerableAssetId": "asset-id",
        "severity": "critical",
        "detectedDate": "2021-01-01T00:00:00.000Z",
        "slaDeadlineDate": "2021-03-01T00:00:00.000Z",
        "remediationDate": "2021-02-01T00:00:00.000Z",
        "isRemediatedOnTime": true,
        "integrationId": "scanner-id",
        "integrationType": "VULNERABILITY_SCANNER",
        "status": "remediated"
      }
    ]
  }
}
```

**Use Cases:**
- Track remediation history and trends
- Measure SLA compliance rates
- Support incremental sync using `remediatedAfterDate`

---

## Pagination & Rate Limiting

### Pagination

All list endpoints use **cursor-based pagination**:

```javascript
let pageCursor;
do {
  const response = await api.get('/vulnerabilities', {
    params: { pageSize: 100, pageCursor }
  });

  const data = response.data.results.data;
  const pageInfo = response.data.results.pageInfo;

  // Process data...

  pageCursor = pageInfo.hasNextPage ? pageInfo.endCursor : undefined;
} while (pageCursor);
```

### Rate Limiting

**Handling:**
- API returns HTTP 429 when rate limited
- Response includes `Retry-After` header (seconds)
- Implement exponential backoff for 5xx errors

**Retry Strategy:**
```javascript
// Handle 429 with retry-after
if (status === 429) {
  const retryAfter = Number(error.response.headers['retry-after'] || 60);
  await sleep((retryAfter + 1) * 1000);
  // Retry request
}

// Handle 5xx with exponential backoff
if (status >= 500) {
  await sleep(1000 * Math.pow(2, attempt));
  // Retry request
}
```

---

## Data Relationships

### Entity Relationship Diagram

```
┌─────────────────────┐
│  Vulnerabilities    │
│  ─────────────────  │
│  id (PK)           │
│  name              │
│  targetId          │◄────┐
└────────┬────────────┘     │
         │                  │
         │ 1:N              │ N:1
         │                  │
         ▼                  │
┌─────────────────────────┐ │    ┌──────────────────────┐
│ VulnerabilityRemediations│ │    │  VulnerableAssets    │
│ ──────────────────────  │ │    │  ─────────────────   │
│ id (PK)                 │ │    │  id (PK)             │
│ vulnerabilityId (FK)    │─┘    │  name                │
│ vulnerableAssetId (FK)  │──────►  assetType           │
└─────────────────────────┘  N:1 │  scanners[]          │
                                  └──────────────────────┘
```

### Common Query Patterns

**Get all vulnerabilities for an asset:**
```
GET /vulnerabilities?vulnerableAssetId={assetId}
```

**Get remediation history for a vulnerability:**
```
GET /vulnerability-remediations?vulnerabilityId={vulnId}
```

**Incremental sync (fetch only new remediations):**
```
GET /vulnerability-remediations?remediatedAfterDate={lastSync}
```

---

## Best Practices

### 1. Data Synchronization
- Use incremental sync when possible
- Store `lastSync` timestamps
- Batch database writes (recommend 1000 records)
- Use transactions for data consistency

### 2. Performance Optimization
- Request maximum page size (100)
- Parallelize independent API requests
- Implement client-side caching
- Index frequently queried database fields

### 3. Error Handling
- Implement retry logic with exponential backoff
- Log failed requests with request IDs
- Handle partial failures in batch operations
- Monitor and alert on sustained error rates

### 4. Security
- Store credentials securely
- Rotate API credentials regularly
- Use minimum required OAuth scopes
- Never commit credentials to version control

---

## Implementation Example

```javascript
const { VantaApiClient } = require('./apiClient');

// Initialize client
const client = new VantaApiClient({
  clientId: process.env.VANTA_CLIENT_ID,
  clientSecret: process.env.VANTA_CLIENT_SECRET
});

// Fetch all vulnerabilities with progress tracking
const vulnerabilities = await client.getVulnerabilities({
  pageSize: 100,
  filters: {
    severity: 'CRITICAL',
    isDeactivated: false
  },
  onBatch: (batch) => {
    console.log(`Fetched ${batch.length} vulnerabilities`);
    // Process batch...
  }
});

// Fetch vulnerable assets
const assets = await client.getVulnerableAssets({
  pageSize: 100,
  filters: {
    assetType: 'SERVER'
  }
});

// Incremental remediation sync
const lastSync = '2025-01-01T00:00:00.000Z';
const newRemediations = await client.getRemediations({
  pageSize: 100,
  filters: {
    remediatedAfterDate: lastSync
  }
});
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-14
**Source:** Vanta API Postman Collection & Production Implementation
