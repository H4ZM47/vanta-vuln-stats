const test = require('node:test');
const assert = require('node:assert');
const { RateLimiter, VantaRateLimiters } = require('../src/core/rateLimiter');

// Helper function to silence console logs during tests
const silenceConsole = () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  return () => {
    console.log = originalLog;
    console.warn = originalWarn;
  };
};

test('RateLimiter - should allow requests up to the limit', async () => {
  const restore = silenceConsole();
  const limiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 1000,
    safetyMargin: 1.0,
    name: 'TestLimiter'
  });

  const startTime = Date.now();

  // Should be able to make 10 requests immediately
  for (let i = 0; i < 10; i++) {
    await limiter.acquire();
  }

  const duration = Date.now() - startTime;

  // All requests should complete very quickly (< 100ms)
  assert.ok(duration < 100, `Duration ${duration}ms should be less than 100ms`);
  assert.strictEqual(limiter.getStats().totalRequests, 10);

  restore();
});

test('RateLimiter - should throttle requests when limit is exceeded', async () => {
  const restore = silenceConsole();
  const limiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 1000,
    safetyMargin: 1.0,
    name: 'TestLimiter'
  });

  const startTime = Date.now();

  // First 10 requests should be instant
  for (let i = 0; i < 10; i++) {
    await limiter.acquire();
  }

  // 11th request should wait
  await limiter.acquire();

  const duration = Date.now() - startTime;

  // Should have waited for tokens to refill
  assert.ok(duration > 50, `Duration ${duration}ms should be greater than 50ms`);
  assert.strictEqual(limiter.getStats().totalRequests, 11);

  restore();
});

test('RateLimiter - should refill tokens over time', async () => {
  const restore = silenceConsole();
  const limiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 1000,
    safetyMargin: 1.0,
    name: 'TestLimiter'
  });

  // Use all tokens
  for (let i = 0; i < 10; i++) {
    await limiter.acquire();
  }

  // Wait for refill (500ms should refill 5 tokens)
  await new Promise(resolve => setTimeout(resolve, 500));

  const startTime = Date.now();

  // Should be able to make ~5 more requests quickly
  for (let i = 0; i < 5; i++) {
    await limiter.acquire();
  }

  const duration = Date.now() - startTime;

  // Should complete quickly since tokens refilled
  assert.ok(duration < 100, `Duration ${duration}ms should be less than 100ms`);

  restore();
});

test('RateLimiter - should not accumulate tokens beyond the limit', async () => {
  const restore = silenceConsole();
  const limiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 1000,
    safetyMargin: 1.0,
    name: 'TestLimiter'
  });

  // Wait for potential token accumulation
  await new Promise(resolve => setTimeout(resolve, 2000));

  const startTime = Date.now();

  // Should only be able to make 10 requests quickly
  for (let i = 0; i < 10; i++) {
    await limiter.acquire();
  }

  const duration = Date.now() - startTime;
  assert.ok(duration < 100, `Duration ${duration}ms should be less than 100ms`);

  // Next request should wait
  const waitStart = Date.now();
  await limiter.acquire();
  const waitDuration = Date.now() - waitStart;

  assert.ok(waitDuration > 50, `Wait duration ${waitDuration}ms should be greater than 50ms`);

  restore();
});

test('RateLimiter - should respect safety margin configuration', () => {
  const restore = silenceConsole();
  const limiterWithMargin = new RateLimiter({
    maxRequests: 20,
    windowMs: 60000,
    safetyMargin: 0.85,
    name: 'SafetyLimiter'
  });

  // Effective limit should be 20 * 0.85 = 17
  assert.strictEqual(limiterWithMargin.effectiveLimit, 17);
  assert.strictEqual(limiterWithMargin.tokens, 17);

  restore();
});

test('RateLimiter - should use default safety margin of 85%', () => {
  const restore = silenceConsole();
  const defaultLimiter = new RateLimiter({
    maxRequests: 20,
    windowMs: 60000,
    name: 'DefaultLimiter'
  });

  assert.strictEqual(defaultLimiter.safetyMargin, 0.85);
  assert.strictEqual(defaultLimiter.effectiveLimit, 17);

  restore();
});

test('RateLimiter - should track total requests', async () => {
  const restore = silenceConsole();
  const limiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 1000,
    safetyMargin: 1.0,
    name: 'TestLimiter'
  });

  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire();

  const stats = limiter.getStats();
  assert.strictEqual(stats.totalRequests, 3);

  restore();
});

test('RateLimiter - should track queued requests', async () => {
  const restore = silenceConsole();
  const limiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 1000,
    safetyMargin: 1.0,
    name: 'TestLimiter'
  });

  // Fill the bucket
  for (let i = 0; i < 10; i++) {
    await limiter.acquire();
  }

  // Make requests that will be queued
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(limiter.acquire());
  }

  // Give queue time to build up
  await new Promise(resolve => setTimeout(resolve, 10));

  const stats = limiter.getStats();
  assert.ok(stats.queuedRequests > 0);

  await Promise.all(promises);

  restore();
});

test('RateLimiter - should reset statistics', async () => {
  const restore = silenceConsole();
  const limiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 1000,
    safetyMargin: 1.0,
    name: 'TestLimiter'
  });

  await limiter.acquire();
  await limiter.acquire();

  limiter.resetStats();

  const stats = limiter.getStats();
  assert.strictEqual(stats.totalRequests, 0);
  assert.strictEqual(stats.queuedRequests, 0);
  assert.strictEqual(stats.maxQueueSize, 0);
  assert.strictEqual(stats.totalWaitTime, 0);

  restore();
});

test('RateLimiter - should handle concurrent requests correctly', async () => {
  const restore = silenceConsole();
  const limiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 1000,
    safetyMargin: 1.0,
    name: 'TestLimiter'
  });

  const promises = [];

  // Make 15 concurrent requests (5 more than limit)
  for (let i = 0; i < 15; i++) {
    promises.push(limiter.acquire());
  }

  await Promise.all(promises);

  const stats = limiter.getStats();
  assert.strictEqual(stats.totalRequests, 15);

  restore();
});

test('VantaRateLimiters - should create OAuth limiter with 5 req/min', () => {
  const restore = silenceConsole();
  const limiters = new VantaRateLimiters({ safetyMargin: 1.0 });

  assert.strictEqual(limiters.oauth.maxRequests, 5);
  assert.strictEqual(limiters.oauth.windowMs, 60000);
  assert.strictEqual(limiters.oauth.effectiveLimit, 5);

  restore();
});

test('VantaRateLimiters - should create API limiter with 20 req/min', () => {
  const restore = silenceConsole();
  const limiters = new VantaRateLimiters({ safetyMargin: 1.0 });

  assert.strictEqual(limiters.api.maxRequests, 20);
  assert.strictEqual(limiters.api.windowMs, 60000);
  assert.strictEqual(limiters.api.effectiveLimit, 20);

  restore();
});

test('VantaRateLimiters - should create Management limiter with 50 req/min', () => {
  const restore = silenceConsole();
  const limiters = new VantaRateLimiters({ safetyMargin: 1.0 });

  assert.strictEqual(limiters.management.maxRequests, 50);
  assert.strictEqual(limiters.management.windowMs, 60000);
  assert.strictEqual(limiters.management.effectiveLimit, 50);

  restore();
});

test('VantaRateLimiters - should create Auditor limiter with 250 req/min', () => {
  const restore = silenceConsole();
  const limiters = new VantaRateLimiters({ safetyMargin: 1.0 });

  assert.strictEqual(limiters.auditor.maxRequests, 250);
  assert.strictEqual(limiters.auditor.windowMs, 60000);
  assert.strictEqual(limiters.auditor.effectiveLimit, 250);

  restore();
});

test('VantaRateLimiters - should create Auditor Write limiter with 10 req/min', () => {
  const restore = silenceConsole();
  const limiters = new VantaRateLimiters({ safetyMargin: 1.0 });

  assert.strictEqual(limiters.auditorWrite.maxRequests, 10);
  assert.strictEqual(limiters.auditorWrite.windowMs, 60000);
  assert.strictEqual(limiters.auditorWrite.effectiveLimit, 10);

  restore();
});

test('VantaRateLimiters - should create Auditor Evidence limiter with 600 req/min', () => {
  const restore = silenceConsole();
  const limiters = new VantaRateLimiters({ safetyMargin: 1.0 });

  assert.strictEqual(limiters.auditorEvidence.maxRequests, 600);
  assert.strictEqual(limiters.auditorEvidence.windowMs, 60000);
  assert.strictEqual(limiters.auditorEvidence.effectiveLimit, 600);

  restore();
});

test('VantaRateLimiters - should apply safety margin to all limiters', () => {
  const restore = silenceConsole();
  const safeLimiters = new VantaRateLimiters({ safetyMargin: 0.85 });

  assert.strictEqual(safeLimiters.oauth.effectiveLimit, 4); // 5 * 0.85 = 4.25 -> 4
  assert.strictEqual(safeLimiters.api.effectiveLimit, 17); // 20 * 0.85 = 17
  assert.strictEqual(safeLimiters.management.effectiveLimit, 42); // 50 * 0.85 = 42.5 -> 42
  assert.strictEqual(safeLimiters.auditor.effectiveLimit, 212); // 250 * 0.85 = 212.5 -> 212
  assert.strictEqual(safeLimiters.auditorWrite.effectiveLimit, 8); // 10 * 0.85 = 8.5 -> 8
  assert.strictEqual(safeLimiters.auditorEvidence.effectiveLimit, 510); // 600 * 0.85 = 510

  restore();
});

test('VantaRateLimiters - should return stats for all limiters', async () => {
  const restore = silenceConsole();
  const limiters = new VantaRateLimiters({ safetyMargin: 1.0 });

  await limiters.oauth.acquire();
  await limiters.api.acquire();
  await limiters.management.acquire();

  const stats = limiters.getAllStats();

  assert.strictEqual(stats.oauth.totalRequests, 1);
  assert.strictEqual(stats.api.totalRequests, 1);
  assert.strictEqual(stats.management.totalRequests, 1);
  assert.strictEqual(stats.auditor.totalRequests, 0);
  assert.strictEqual(stats.auditorWrite.totalRequests, 0);
  assert.strictEqual(stats.auditorEvidence.totalRequests, 0);

  restore();
});

test('VantaRateLimiters - should reset all limiters', async () => {
  const restore = silenceConsole();
  const limiters = new VantaRateLimiters({ safetyMargin: 1.0 });

  // Make some requests
  await limiters.oauth.acquire();
  await limiters.api.acquire();

  // Reset all
  limiters.resetAll();

  const stats = limiters.getAllStats();

  assert.strictEqual(stats.oauth.totalRequests, 0);
  assert.strictEqual(stats.api.totalRequests, 0);

  restore();
});

test('VantaApiClient - should accept custom safety margin', () => {
  const restore = silenceConsole();
  const { VantaApiClient } = require('../src/core/apiClient');

  const client = new VantaApiClient({
    clientId: 'test-id',
    clientSecret: 'test-secret',
    rateLimitSafetyMargin: 0.75
  });

  // OAuth limiter should use 75% of 5 = 3 requests
  assert.strictEqual(client.rateLimiters.oauth.effectiveLimit, 3);

  // API limiter should use 75% of 20 = 15 requests
  assert.strictEqual(client.rateLimiters.api.effectiveLimit, 15);

  restore();
});

test('VantaApiClient - should use default 85% safety margin', () => {
  const restore = silenceConsole();
  const { VantaApiClient } = require('../src/core/apiClient');

  const client = new VantaApiClient({
    clientId: 'test-id',
    clientSecret: 'test-secret'
  });

  // OAuth limiter should use 85% of 5 = 4 requests
  assert.strictEqual(client.rateLimiters.oauth.effectiveLimit, 4);

  // API limiter should use 85% of 20 = 17 requests
  assert.strictEqual(client.rateLimiters.api.effectiveLimit, 17);

  restore();
});

test('VantaApiClient - should expose rate limiter statistics', () => {
  const restore = silenceConsole();
  const { VantaApiClient } = require('../src/core/apiClient');

  const client = new VantaApiClient({
    clientId: 'test-id',
    clientSecret: 'test-secret'
  });

  const stats = client.getRateLimiterStats();

  assert.ok(stats.oauth);
  assert.ok(stats.api);
  assert.ok(stats.management);
  assert.ok(stats.auditor);
  assert.ok(stats.auditorWrite);
  assert.ok(stats.auditorEvidence);

  restore();
});
