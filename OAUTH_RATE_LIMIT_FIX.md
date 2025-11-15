# OAuth Rate Limit Fix

## Problem

The application was encountering HTTP 429 (Too Many Requests) errors when attempting to authenticate with the Vanta API. This occurred because:

1. Multiple API endpoints were being called in parallel using `Promise.all` in `dataService.js:308`
2. Each API call triggered its own authentication attempt
3. Even with token caching, concurrent requests all tried to authenticate simultaneously
4. This resulted in multiple OAuth token requests hitting the Vanta API at the same time, triggering rate limits

Error example:
```
Error: Failed to paginate Vanta API: Request failed with status code 429
```

## Solution

The fix implements three key improvements to handle OAuth rate limiting:

### 1. Authentication Lock (Prevents Concurrent Auth Attempts)

Added an `authenticationPromise` property to the `VantaApiClient` class that acts as a lock:
- When authentication starts, it creates a promise that other concurrent requests wait on
- If authentication is already in progress, new requests wait for it to complete
- This ensures only one OAuth request is made at a time, even with parallel API calls

### 2. Exponential Backoff for 429 Errors

The new `_performAuthentication` method implements:
- Automatic retry logic specifically for the OAuth endpoint
- Exponential backoff with jitter when encountering 429 errors
- Respects the `Retry-After` header from the API
- Maximum of 5 retries before failing

### 3. Improved Error Handling

Enhanced error handling for different scenarios:
- **429 errors**: Exponential backoff with jitter
- **401 errors**: Immediate failure (invalid credentials)
- **500+ errors**: Server errors with exponential backoff
- **Network errors**: Retry with backoff

## Changes Made

### File: `src/core/apiClient.js`

1. **Added authentication lock**:
   - New property: `this.authenticationPromise = null`
   - Prevents concurrent authentication attempts

2. **Refactored `authenticate` method**:
   - Checks for in-progress authentication
   - Waits for concurrent auth to complete
   - Creates lock for new authentication attempts

3. **New `_performAuthentication` method**:
   - Handles retry logic with exponential backoff
   - Proper 429 error handling with configurable delays
   - Better logging for debugging

4. **Improved `requestWithRetry` method**:
   - Better handling of authentication failures
   - Limits authentication retries to prevent infinite loops
   - Improved logging for debugging

## Testing

Created `test-oauth-fix.js` to verify the fix:
- Simulates the exact scenario that was causing issues (parallel API calls)
- Verifies that concurrent requests don't cause 429 errors
- Confirms token caching works correctly

## How to Verify the Fix Works

1. **Run the application normally**: The sync process should no longer fail with 429 errors during authentication

2. **Check the console output**: You should see proper handling of rate limits:
   ```
   [VantaApiClient] OAuth rate limited (429). Waiting 60s before retry 1/6
   [VantaApiClient] Successfully authenticated after 1 retries
   ```

3. **Monitor parallel API calls**: When multiple endpoints are called simultaneously, only one authentication request should be made

## Benefits

1. **Resilience**: The application now handles OAuth rate limits gracefully
2. **Performance**: Token caching and authentication lock reduce unnecessary API calls
3. **Reliability**: Exponential backoff prevents aggressive retrying that could worsen rate limiting
4. **Debugging**: Improved logging helps diagnose authentication issues

## Note on Credentials

The application uses Electron Store to manage API credentials. Ensure you have valid `clientId` and `clientSecret` configured in the application settings before testing.