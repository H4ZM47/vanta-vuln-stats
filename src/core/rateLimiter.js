/**
 * RateLimiter - Token Bucket Algorithm Implementation
 *
 * Implements proactive rate limiting to prevent hitting API rate limits.
 * Uses a token bucket algorithm that allows bursts while maintaining average rate.
 */
class RateLimiter {
  /**
   * @param {Object} options - Configuration options
   * @param {number} options.maxRequests - Maximum requests allowed per window
   * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
   * @param {number} options.safetyMargin - Percentage of limit to use (0-1, default: 0.85 = 85%)
   * @param {string} options.name - Name for logging purposes
   */
  constructor(options) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs || 60000; // Default: 1 minute
    this.safetyMargin = options.safetyMargin || 0.85; // Use 85% of limit by default
    this.name = options.name || 'RateLimiter';

    // Calculate effective limit with safety margin
    this.effectiveLimit = Math.floor(this.maxRequests * this.safetyMargin);

    // Token bucket state
    this.tokens = this.effectiveLimit;
    this.lastRefillTime = Date.now();

    // Calculate refill rate (tokens per millisecond)
    this.refillRate = this.effectiveLimit / this.windowMs;

    // Queue for pending requests
    this.queue = [];
    this.processing = false;

    // Statistics
    this.stats = {
      totalRequests: 0,
      queuedRequests: 0,
      maxQueueSize: 0,
      totalWaitTime: 0
    };

    console.log(`[${this.name}] Initialized with ${this.effectiveLimit}/${this.maxRequests} req/${this.windowMs}ms (${Math.round(this.safetyMargin * 100)}% safety margin)`);
  }

  /**
   * Refill tokens based on time elapsed
   */
  _refillTokens() {
    const now = Date.now();
    const timeSinceLastRefill = now - this.lastRefillTime;
    const tokensToAdd = timeSinceLastRefill * this.refillRate;

    this.tokens = Math.min(this.effectiveLimit, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  /**
   * Acquire a token (wait if necessary)
   * @returns {Promise<void>}
   */
  async acquire() {
    return new Promise((resolve, reject) => {
      const requestTime = Date.now();
      this.stats.totalRequests++;

      const tryAcquire = () => {
        this._refillTokens();

        if (this.tokens >= 1) {
          // Token available, consume it
          this.tokens -= 1;
          const waitTime = Date.now() - requestTime;

          if (waitTime > 0) {
            this.stats.totalWaitTime += waitTime;
            console.log(`[${this.name}] Request released after ${waitTime}ms wait (${this.tokens.toFixed(2)} tokens remaining)`);
          }

          resolve();
        } else {
          // No tokens available, calculate wait time
          const tokensNeeded = 1 - this.tokens;
          const waitTime = Math.ceil(tokensNeeded / this.refillRate);

          console.log(`[${this.name}] Rate limit approaching. Waiting ${waitTime}ms (${this.tokens.toFixed(2)} tokens available)`);

          setTimeout(tryAcquire, waitTime);
        }
      };

      // Add to queue
      this.queue.push({ tryAcquire, requestTime });
      this.stats.queuedRequests++;
      this.stats.maxQueueSize = Math.max(this.stats.maxQueueSize, this.queue.length);

      // Process queue
      this._processQueue();
    });
  }

  /**
   * Process queued requests
   */
  _processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    const request = this.queue.shift();
    request.tryAcquire();

    this.processing = false;

    // Continue processing if queue has more items
    if (this.queue.length > 0) {
      setImmediate(() => this._processQueue());
    }
  }

  /**
   * Get current statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      currentTokens: this.tokens,
      queueSize: this.queue.length,
      averageWaitTime: this.stats.queuedRequests > 0
        ? Math.round(this.stats.totalWaitTime / this.stats.queuedRequests)
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      queuedRequests: 0,
      maxQueueSize: 0,
      totalWaitTime: 0
    };
  }

  /**
   * Reset the rate limiter (for testing)
   */
  reset() {
    this.tokens = this.effectiveLimit;
    this.lastRefillTime = Date.now();
    this.queue = [];
    this.processing = false;
    this.resetStats();
  }
}

/**
 * Create pre-configured rate limiters for Vanta API endpoints
 */
class VantaRateLimiters {
  constructor(options = {}) {
    const safetyMargin = options.safetyMargin || 0.85;

    // OAuth Authentication endpoints: 5 requests per minute
    this.oauth = new RateLimiter({
      maxRequests: 5,
      windowMs: 60000,
      safetyMargin,
      name: 'OAuth'
    });

    // Private and Public Integration endpoints: 20 requests per minute
    this.api = new RateLimiter({
      maxRequests: 20,
      windowMs: 60000,
      safetyMargin,
      name: 'API'
    });

    // Management endpoints: 50 requests per minute
    this.management = new RateLimiter({
      maxRequests: 50,
      windowMs: 60000,
      safetyMargin,
      name: 'Management'
    });

    // Auditor API: 250 requests per minute (default)
    this.auditor = new RateLimiter({
      maxRequests: 250,
      windowMs: 60000,
      safetyMargin,
      name: 'Auditor'
    });

    // Auditor API POST/PATCH: 10 requests per minute
    this.auditorWrite = new RateLimiter({
      maxRequests: 10,
      windowMs: 60000,
      safetyMargin,
      name: 'Auditor-Write'
    });

    // List audit evidence URLs: 600 requests per minute
    this.auditorEvidence = new RateLimiter({
      maxRequests: 600,
      windowMs: 60000,
      safetyMargin,
      name: 'Auditor-Evidence'
    });
  }

  /**
   * Get all statistics
   */
  getAllStats() {
    return {
      oauth: this.oauth.getStats(),
      api: this.api.getStats(),
      management: this.management.getStats(),
      auditor: this.auditor.getStats(),
      auditorWrite: this.auditorWrite.getStats(),
      auditorEvidence: this.auditorEvidence.getStats()
    };
  }

  /**
   * Reset all rate limiters
   */
  resetAll() {
    this.oauth.reset();
    this.api.reset();
    this.management.reset();
    this.auditor.reset();
    this.auditorWrite.reset();
    this.auditorEvidence.reset();
  }
}

module.exports = {
  RateLimiter,
  VantaRateLimiters
};
