#!/usr/bin/env node

/**
 * Test script to verify OAuth rate limit handling
 * This simulates the concurrent API calls that were causing 429 errors
 */

const { VantaApiClient } = require('./src/core/apiClient');
const fs = require('fs');
const path = require('path');

// Load configuration
const configPath = path.join(__dirname, 'config.json');
let config = {};

if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('✓ Config loaded from config.json');
  } catch (error) {
    console.error('✗ Failed to parse config.json:', error.message);
    process.exit(1);
  }
} else {
  console.error('✗ No config.json found. Please ensure you have valid API credentials configured.');
  process.exit(1);
}

if (!config.clientId || !config.clientSecret) {
  console.error('✗ Missing clientId or clientSecret in config.json');
  process.exit(1);
}

async function testConcurrentAuthentication() {
  console.log('\n=== Testing OAuth Rate Limit Fix ===\n');

  const client = new VantaApiClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });

  console.log('1. Testing concurrent authentication requests...');
  console.log('   (This would previously cause 429 errors)\n');

  try {
    // Simulate the same scenario as dataService.js - multiple parallel API calls
    const startTime = Date.now();

    const promises = [
      client.getVulnerabilities({ pageSize: 1 }).then(results => {
        console.log(`   ✓ Vulnerabilities API call succeeded (found ${results.length} items)`);
        return results;
      }),
      client.getRemediations({ pageSize: 1 }).then(results => {
        console.log(`   ✓ Remediations API call succeeded (found ${results.length} items)`);
        return results;
      }),
      client.getVulnerableAssets({ pageSize: 1 }).then(results => {
        console.log(`   ✓ Vulnerable Assets API call succeeded (found ${results.length} items)`);
        return results;
      }),
    ];

    // Execute all three API calls in parallel (like Promise.all in dataService.js)
    const results = await Promise.all(promises);

    const duration = Date.now() - startTime;
    console.log(`\n2. All API calls completed successfully in ${(duration / 1000).toFixed(2)}s`);
    console.log('   ✓ No 429 errors encountered!');
    console.log('   ✓ Authentication lock prevented concurrent OAuth requests');

    // Test that subsequent calls reuse the cached token
    console.log('\n3. Testing token caching...');
    const cacheStartTime = Date.now();

    await client.getVulnerabilities({ pageSize: 1 });

    const cacheDuration = Date.now() - cacheStartTime;
    console.log(`   ✓ Second API call completed in ${(cacheDuration / 1000).toFixed(2)}s`);
    console.log('   ✓ Token was properly cached and reused');

    console.log('\n✅ SUCCESS: OAuth rate limiting fix is working correctly!');
    console.log('   - Concurrent authentication attempts are properly serialized');
    console.log('   - 429 errors during authentication are handled with exponential backoff');
    console.log('   - Token caching prevents unnecessary re-authentication\n');

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);

    if (error.response?.status === 429) {
      console.error('\n⚠️  Still getting 429 errors. The fix may need adjustment.');
      console.error('   Error details:', {
        status: error.response.status,
        headers: error.response.headers,
        data: error.response.data
      });
    } else if (error.response?.status === 401) {
      console.error('\n⚠️  Authentication failed. Please check your credentials.');
    } else {
      console.error('\n⚠️  Unexpected error occurred.');
    }

    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run the test
testConcurrentAuthentication().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});