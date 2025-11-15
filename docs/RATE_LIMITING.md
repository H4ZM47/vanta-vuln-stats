# Vanta API Rate Limiting

This document describes the rate limiting safeguards implemented to prevent exceeding Vanta API rate limits.

## Overview

The Vanta API enforces the following rate limits:

| Endpoint Type | Rate Limit | Window |
|--------------|------------|--------|
| OAuth Authentication | 5 requests | 1 minute |
| Public/Private Integration APIs | 20 requests | 1 minute |
| Management APIs | 50 requests | 1 minute |
| Auditor API (default) | 250 requests | 1 minute |
| Auditor API (POST/PATCH) | 10 requests | 1 minute |
| Auditor API (Evidence URLs) | 600 requests | 1 minute |

When these limits are exceeded, the API returns a `429 Too Many Requests` error.

## Rate Limiting Strategy

The application implements a **multi-layered defense** against rate limit violations:

### Layer 1: Proactive Rate Limiting (New)

**Token Bucket Algorithm** - Prevents requests from being sent when the rate limit would be exceeded:

- **How it works**: Each endpoint type has a virtual "bucket" of tokens
- **Token consumption**: Each API request consumes one token before being sent
- **Token refill**: Tokens refill continuously at a steady rate
- **Request queueing**: When tokens are exhausted, requests wait in a queue
- **Safety margin**: By default, uses only 85% of the actual limit for extra safety

**Benefits**:
- Prevents 429 errors before they happen
- Smooths out traffic to avoid bursts
- Provides predictable performance
- No wasted retry attempts

### Layer 2: Reactive Error Handling (Existing)

**Exponential Backoff with Retry** - Handles 429 errors if they still occur:

- **OAuth endpoints**: Waits for Retry-After header value (default: 60s) plus exponential backoff
- **API endpoints**: Waits for Retry-After header value (default: 60s) before retry
- **Server errors (500+)**: Exponential backoff with max 30s delay
- **Network errors**: Simple exponential backoff with max 10s delay

## Implementation Details

### RateLimiter Class

Located in: `src/core/rateLimiter.js`

The `RateLimiter` class implements a token bucket algorithm:

```javascript
const limiter = new RateLimiter({
  maxRequests: 20,           // Maximum requests allowed
  windowMs: 60000,           // Time window (1 minute)
  safetyMargin: 0.85,        // Use 85% of limit
  name: 'API'                // Name for logging
});

// Acquire a token (waits if necessary)
await limiter.acquire();

// Get statistics
const stats = limiter.getStats();
console.log(stats);
// {
//   totalRequests: 150,
//   queuedRequests: 12,
//   maxQueueSize: 5,
//   totalWaitTime: 3500,
//   currentTokens: 8.2,
//   queueSize: 0,
//   averageWaitTime: 291
// }
```

### VantaRateLimiters Class

Pre-configured rate limiters for all Vanta API endpoint types:

```javascript
const limiters = new VantaRateLimiters({
  safetyMargin: 0.85  // Optional, defaults to 85%
});

// Access specific limiters
await limiters.oauth.acquire();        // 5 req/min → 4 req/min (85%)
await limiters.api.acquire();          // 20 req/min → 17 req/min (85%)
await limiters.management.acquire();   // 50 req/min → 42 req/min (85%)
await limiters.auditor.acquire();      // 250 req/min → 212 req/min (85%)
await limiters.auditorWrite.acquire(); // 10 req/min → 8 req/min (85%)
await limiters.auditorEvidence.acquire(); // 600 req/min → 510 req/min (85%)

// Get all statistics
const allStats = limiters.getAllStats();
```

### Integration with VantaApiClient

The rate limiters are automatically integrated into the `VantaApiClient`:

```javascript
const client = new VantaApiClient({
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  rateLimitSafetyMargin: 0.85  // Optional, defaults to 85%
});

// Rate limiting is automatic - no changes needed
const vulnerabilities = await client.getVulnerabilities();
const assets = await client.getVulnerableAssets();

// Access statistics
const stats = client.getRateLimiterStats();
console.log(`OAuth: ${stats.oauth.totalRequests} requests`);
console.log(`API: ${stats.api.totalRequests} requests`);
```

## Configuration

### Safety Margin

The **safety margin** determines what percentage of the rate limit to use:

- **Default**: `0.85` (85% of the limit)
- **Purpose**: Provides a buffer for network delays, clock skew, and concurrent requests
- **Example**: For a 20 req/min limit, 85% = 17 req/min effective limit

**When to adjust**:

| Scenario | Recommended Margin | Reason |
|----------|-------------------|---------|
| Production (default) | 0.85 (85%) | Safe balance between throughput and safety |
| High concurrency | 0.75 (75%) | More buffer for concurrent requests |
| Development/Testing | 0.90-1.0 (90-100%) | Maximize throughput for faster tests |
| Conservative | 0.70 (70%) | Maximum safety, lower throughput |

**Configure globally**:

```javascript
const client = new VantaApiClient({
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  rateLimitSafetyMargin: 0.75  // Use 75% of limits
});
```

**Configure per-limiter** (advanced):

```javascript
const limiters = new VantaRateLimiters({ safetyMargin: 0.80 });

// Override for specific limiter
limiters.oauth = new RateLimiter({
  maxRequests: 5,
  windowMs: 60000,
  safetyMargin: 0.60,  // Very conservative for OAuth
  name: 'OAuth'
});
```

## Monitoring and Observability

### Console Logging

Rate limiting events are logged automatically:

```
[OAuth] Initialized with 4/5 req/60000ms (85% safety margin)
[API] Initialized with 17/20 req/60000ms (85% safety margin)
[API] Rate limit approaching. Waiting 2500ms (0.23 tokens available)
[API] Request released after 2500ms wait (1.45 tokens remaining)
```

### Statistics Collection

Comprehensive statistics are available:

```javascript
const stats = client.getRateLimiterStats();

// Per-limiter stats
console.log(stats.api);
// {
//   totalRequests: 245,        // Total requests made
//   queuedRequests: 18,        // Requests that had to wait
//   maxQueueSize: 3,           // Peak queue depth
//   totalWaitTime: 12500,      // Total ms spent waiting
//   currentTokens: 14.2,       // Tokens available now
//   queueSize: 0,              // Current queue size
//   averageWaitTime: 694       // Average wait per queued request
// }
```

### Performance Impact

The rate limiter adds minimal overhead:

- **No waiting**: <1ms overhead (token check only)
- **With waiting**: Waits only as long as necessary to respect rate limits
- **Memory**: ~1KB per limiter (6 limiters total)
- **CPU**: Negligible (simple math operations)

## Best Practices

### 1. Trust the Rate Limiter

The rate limiter is designed to be transparent - just make API calls normally:

```javascript
// ✅ Good - let the rate limiter handle it
const results = await Promise.all([
  client.getVulnerabilities(),
  client.getRemediations(),
  client.getVulnerableAssets()
]);

// ❌ Bad - don't add artificial delays
for (const endpoint of endpoints) {
  await client.fetch(endpoint);
  await sleep(3000);  // Unnecessary!
}
```

### 2. Monitor Statistics in Production

Periodically check rate limiter stats to identify bottlenecks:

```javascript
// Log stats every 5 minutes
setInterval(() => {
  const stats = client.getRateLimiterStats();

  if (stats.api.queuedRequests > stats.api.totalRequests * 0.5) {
    console.warn('High API rate limit pressure:', stats.api);
  }
}, 5 * 60 * 1000);
```

### 3. Adjust Safety Margin Based on Patterns

If you see frequent queuing but no 429 errors, you can increase the safety margin:

```javascript
// Start conservative
const client = new VantaApiClient({
  clientId: 'id',
  clientSecret: 'secret',
  rateLimitSafetyMargin: 0.75
});

// After monitoring: if no 429s and low queue times
// → Increase to 0.85 or 0.90 for better throughput

// If seeing 429s despite rate limiting
// → Decrease to 0.70 or 0.65 for more safety
```

### 4. Handle Parallel Sync Operations

The rate limiter automatically handles concurrent operations:

```javascript
// The rate limiter will queue these intelligently
await Promise.all([
  syncVulnerabilities(),  // Makes ~10 API calls
  syncRemediations(),     // Makes ~15 API calls
  syncAssets()            // Makes ~8 API calls
]);
// Total: ~33 calls, limited to 17/min (85% of 20/min)
// Calls will be automatically queued and released at a safe rate
```

### 5. Testing Rate Limiting

Reset statistics between tests:

```javascript
// In test setup
beforeEach(() => {
  client.resetRateLimiters();
});

// Or reset specific limiter
client.rateLimiters.api.reset();
```

## Troubleshooting

### Still Getting 429 Errors

If you see 429 errors despite rate limiting:

1. **Check safety margin**: Decrease from 0.85 to 0.70
2. **Check concurrent processes**: Multiple app instances share the same API limit
3. **Check clock skew**: Ensure system clock is accurate
4. **Check Vanta API status**: Limits may be temporarily reduced during maintenance

### Requests Are Too Slow

If requests seem slower than expected:

1. **Check statistics**: See if requests are being queued
2. **Check safety margin**: Increase from 0.85 to 0.90-0.95 if no 429s
3. **Optimize pagination**: Use larger page sizes (up to 100) to reduce request count
4. **Check concurrent operations**: Ensure you're using `Promise.all()` for parallel fetches

### High Memory Usage

If memory usage is high:

1. **Check queue size**: `stats.queueSize` and `stats.maxQueueSize`
2. **Reduce concurrency**: Limit parallel operations
3. **Increase delay between batches**: Add small delays in data processing

## Migration Guide

If you have existing code that handles rate limiting manually, you can remove it:

### Before (Manual Rate Limiting)

```javascript
// ❌ No longer needed
async function fetchWithRateLimit(endpoint) {
  await sleep(3000);  // Manual delay
  return await client.fetch(endpoint);
}

// ❌ No longer needed
let requestCount = 0;
setInterval(() => { requestCount = 0; }, 60000);

async function rateLimitedFetch(endpoint) {
  if (requestCount >= 15) {
    await sleep(60000);
    requestCount = 0;
  }
  requestCount++;
  return await client.fetch(endpoint);
}
```

### After (Automatic Rate Limiting)

```javascript
// ✅ Just make the call - rate limiting is automatic
const results = await client.getVulnerabilities();

// ✅ Parallel requests are automatically queued
const allData = await Promise.all([
  client.getVulnerabilities(),
  client.getRemediations(),
  client.getVulnerableAssets()
]);
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  getVulnerabilities() | getAssets() | authenticate()        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    VantaApiClient                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  requestWithRetry()                                  │   │
│  │    1. Authenticate                                   │   │
│  │    2. Acquire rate limiter token ◄──┐              │   │
│  │    3. Make HTTP request              │              │   │
│  │    4. Handle 429/401/500 errors      │              │   │
│  └──────────────────────────────────────┼──────────────┘   │
└───────────────────────────────────────┼──┼──────────────────┘
                                        │  │
                ┌───────────────────────┘  └──────────────────┐
                │                                              │
                ▼                                              ▼
┌────────────────────────────┐              ┌──────────────────────────┐
│   OAuth Rate Limiter       │              │   API Rate Limiter       │
│   5 req/min → 4 req/min    │              │   20 req/min → 17 req/min│
│                            │              │                          │
│  Token Bucket:             │              │  Token Bucket:           │
│  ┌──────────────────────┐ │              │  ┌────────────────────┐ │
│  │ Tokens: ▓▓▓▓░░░░░░   │ │              │  │ Tokens: ▓▓▓▓▓▓░░░░ │ │
│  │ Max: 4               │ │              │  │ Max: 17            │ │
│  │ Refill: 0.067/sec    │ │              │  │ Refill: 0.283/sec  │ │
│  └──────────────────────┘ │              │  └────────────────────┘ │
│                            │              │                          │
│  Queue: [req1, req2, ...] │              │  Queue: [req1, ...]      │
└────────────────────────────┘              └──────────────────────────┘
                │                                              │
                ▼                                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Vanta API                               │
│  OAuth: 5/min | API: 20/min | Management: 50/min           │
└─────────────────────────────────────────────────────────────┘
```

## Testing

Comprehensive tests are available in `test/rateLimiter.test.js`:

```bash
# Run rate limiter tests
npm test -- test/rateLimiter.test.js

# Run all tests
npm test
```

Test coverage includes:
- Token bucket algorithm correctness
- Safety margin application
- Request queueing behavior
- Statistics tracking
- Concurrent request handling
- Integration with VantaApiClient

## Summary

The rate limiting implementation provides:

✅ **Proactive prevention** - Stops 429 errors before they happen
✅ **Automatic integration** - No code changes required
✅ **Configurable safety** - Adjustable safety margin
✅ **Full observability** - Comprehensive statistics
✅ **Production-ready** - Thoroughly tested
✅ **Zero overhead** - Minimal performance impact

The combination of proactive rate limiting and reactive error handling ensures reliable, efficient API usage while staying well within Vanta's documented limits.
