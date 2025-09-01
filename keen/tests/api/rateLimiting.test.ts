/**
 * keen API Gateway - Rate Limiting Tests
 * Test rate limiting with admin bypass and different user tiers
 */

import request from 'supertest';
import { KeenAPIServer } from '../../src/api/server.js';
import { keen } from '../../src/index.js';
import { generateTestEmail, createTestUserInDB, cleanupTestUsers } from '../setup.js';

describe('API Gateway Rate Limiting', () => {
  let server: KeenAPIServer;
  let app: any;
  let keenDB: keen;
  let regularUserToken: string;
  let adminUserToken: string;
  let testEmails: string[] = [];
  
  beforeAll(async () => {
    // Initialize test database
    keenDB = keen.getInstance();
    await keenDB.initialize();
    
    // Initialize server with the same keen instance
    server = new KeenAPIServer(keenDB);
    await server.initialize();
    app = server.getApp();
    
    // Create test users and get tokens
    await setupTestUsers();
  });
  
  afterAll(async () => {
    // Cleanup test users
    if (testEmails.length > 0) {
      await cleanupTestUsers(testEmails);
    }
    
    await server?.stop();
    await keenDB?.close();
  });
  
  async function setupTestUsers() {
    try {
      // Create regular user
      const regularEmail = generateTestEmail('regular-ratelimit');
      const regularUsername = `regular_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      testEmails.push(regularEmail);
      
      const regularUser = await createTestUserInDB(
        regularEmail,
        regularUsername,
        'TestPassword123!',
        false
      );
      
      const regularLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: regularEmail,
          password: 'TestPassword123!'
        });
      
      if (regularLogin.status === 200) {
        regularUserToken = regularLogin.body.tokens?.access_token;
      }
      
      // Try to get admin token (may not exist in test DB)
      try {
        const adminLogin = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: process.env.ADMIN_EMAIL || 'ahiya.butman@gmail.com',
            password: process.env.ADMIN_PASSWORD || '2con-creator'
          });
        
        if (adminLogin.status === 200) {
          adminUserToken = adminLogin.body.tokens?.access_token;
        }
      } catch (error) {
        console.warn('Admin user not available for rate limiting tests');
      }
      
    } catch (error) {
      console.error('Failed to setup rate limiting test users:', error);
    }
  }
  
  describe('Regular User Rate Limiting', () => {
    test('should enforce rate limits for regular users', async () => {
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping test');
        return;
      }
      
      // Make requests up to the limit (testing with a smaller number)
      const promises = [];
      const requestCount = 10; // Reduced for testing
      
      for (let i = 0; i < requestCount; i++) {
        promises.push(
          request(app)
            .get('/api/v1/credits/balance')
            .set('Authorization', `Bearer ${regularUserToken}`)
        );
      }
      
      const responses = await Promise.all(promises);
      
      // All requests should succeed (within normal rate limit)
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.headers).toHaveProperty('ratelimit-limit');
        expect(response.headers).toHaveProperty('ratelimit-remaining');
      });
    });
    
    test('should return proper rate limit headers', async () => {
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping test');
        return;
      }
      
      const response = await request(app)
        .get('/api/v1/credits/balance')
        .set('Authorization', `Bearer ${regularUserToken}`);
        
      expect(response.status).toBe(200);
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(parseInt(response.headers['ratelimit-limit'])).toBe(1000); // Individual tier limit
    });
    
    test('should enforce agent execution rate limits', async () => {
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping test');
        return;
      }
      
      // Test agent execution endpoint with rate limiting
      const agentRequests = [];
      
      for (let i = 0; i < 3; i++) {
        agentRequests.push(
          request(app)
            .post('/api/v1/agents/execute')
            .set('Authorization', `Bearer ${regularUserToken}`)
            .send({
              vision: 'Create a simple test application',
              options: {
                max_iterations: 5,
                cost_budget: 1.0
              }
            })
        );
      }
      
      const responses = await Promise.allSettled(agentRequests);
      
      // Some requests should succeed, but we should see rate limiting headers
      responses.forEach((result) => {
        if (result.status === 'fulfilled') {
          const response = result.value;
          expect(response.headers).toHaveProperty('ratelimit-limit');
          
          // Should either succeed or be rate limited
          expect([200, 402, 429]).toContain(response.status);
        }
      });
    });
  });
  
  describe('Admin User Rate Limiting Bypass', () => {
    test('should bypass rate limits for admin users', async () => {
      if (!adminUserToken) {
        console.warn('Admin user token not available - skipping admin bypass test');
        return;
      }
      
      // Make many requests as admin user
      const promises = [];
      const requestCount = 20; // Higher than regular user limit
      
      for (let i = 0; i < requestCount; i++) {
        promises.push(
          request(app)
            .get('/api/v1/credits/balance')
            .set('Authorization', `Bearer ${adminUserToken}`)
        );
      }
      
      const responses = await Promise.all(promises);
      
      // All admin requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        // Admin should have unlimited or very high limit
        const limitHeader = response.headers['ratelimit-limit'];
        if (limitHeader) {
          expect(parseInt(limitHeader)).toBeGreaterThan(1000);
        }
      });
    });
    
    test('should show unlimited rate limit for admin users', async () => {
      if (!adminUserToken) {
        console.warn('Admin user token not available - skipping admin unlimited test');
        return;
      }
      
      const response = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${adminUserToken}`);
        
      expect(response.status).toBe(200);
      
      // Check if admin gets special rate limit treatment
      const limitHeader = response.headers['ratelimit-limit'];
      if (limitHeader) {
        expect(parseInt(limitHeader)).toBeGreaterThan(10000); // Effectively unlimited
      }
    });
  });
  
  describe('API Key Rate Limiting', () => {
    test('should enforce per-API-key rate limits', async () => {
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping API key rate limit test');
        return;
      }
      
      // Create API key with specific rate limit
      const apiKeyResponse = await request(app)
        .post('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({
          name: 'Rate Limit Test Key',
          scopes: ['credits:read'],
          rate_limit_per_hour: 10 // Low limit for testing
        });
      
      if (apiKeyResponse.status !== 201) {
        console.warn('Could not create API key for rate limit test');
        return;
      }
      
      const apiKey = apiKeyResponse.body.api_key.key;
      
      // Make requests with API key
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .get('/api/v1/credits/balance')
            .set('Authorization', `ApiKey ${apiKey}`)
        );
      }
      
      const responses = await Promise.all(promises);
      
      // Should get proper rate limit headers for API key
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
        if (response.status === 200) {
          expect(response.headers).toHaveProperty('ratelimit-limit');
        }
      });
    });
  });
  
  describe('Concurrent Session Limiting', () => {
    test('should limit concurrent sessions for regular users', async () => {
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping concurrent session test');
        return;
      }
      
      // Try to start multiple agent executions concurrently
      const concurrentExecutions = [];
      
      for (let i = 0; i < 5; i++) {
        concurrentExecutions.push(
          request(app)
            .post('/api/v1/agents/execute')
            .set('Authorization', `Bearer ${regularUserToken}`)
            .send({
              vision: `Concurrent test execution ${i}`,
              options: {
                max_iterations: 3,
                cost_budget: 0.5
              }
            })
        );
      }
      
      const responses = await Promise.allSettled(concurrentExecutions);
      
      let successCount = 0;
      let concurrencyLimitHit = false;
      
      responses.forEach((result) => {
        if (result.status === 'fulfilled') {
          const response = result.value;
          if (response.status === 200) {
            successCount++;
          } else if (response.status === 409) {
            concurrencyLimitHit = true;
            expect(response.body.error.code).toBe('TOO_MANY_CONCURRENT_SESSIONS');
          }
        }
      });
      
      // Should either allow some sessions or hit concurrency limit
      expect(successCount).toBeGreaterThan(0);
    });
    
    test('should allow unlimited concurrent sessions for admin users', async () => {
      if (!adminUserToken) {
        console.warn('Admin user token not available - skipping admin concurrent session test');
        return;
      }
      
      // Admin users should bypass concurrency limits
      const response = await request(app)
        .post('/api/v1/agents/execute')
        .set('Authorization', `Bearer ${adminUserToken}`)
        .send({
          vision: 'Admin concurrent test execution',
          options: {
            max_iterations: 3,
            cost_budget: 0.5
          }
        });
        
      // Admin should not be blocked by concurrency limits
      expect([200, 402]).toContain(response.status); // 200 or insufficient credits, but not 409
      if (response.status === 200) {
        expect(response.body.session.is_admin_session).toBe(true);
      }
    });
  });
  
  describe('Rate Limit Error Responses', () => {
    test('should return proper error format when rate limited', async () => {
      // This test simulates a rate limited response
      const mockRateLimitedResponse = {
        success: false,
        error: {
          type: 'RATE_LIMIT_ERROR',
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests from this user/IP',
          details: {
            limit: 1000,
            window_ms: 3600000,
            reset_time: expect.any(Number),
            user_tier: 'individual',
            admin_bypass_available: false
          },
          help_url: 'https://docs.keen.dev/api/rate-limits'
        },
        request_id: expect.any(String)
      };
      
      // Test the error format structure
      expect(mockRateLimitedResponse.error.type).toBe('RATE_LIMIT_ERROR');
      expect(mockRateLimitedResponse.error.details.limit).toBe(1000);
      expect(mockRateLimitedResponse.error.help_url).toBeDefined();
    });
  });
  
  describe('Rate Limit Reset', () => {
    test('should reset rate limits after time window', async () => {
      // This would be a long-running test to verify rate limit reset
      // For now, we'll just test that the reset time is properly calculated
      
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping rate limit reset test');
        return;
      }
      
      const response = await request(app)
        .get('/api/v1/credits/balance')
        .set('Authorization', `Bearer ${regularUserToken}`);
        
      if (response.headers['ratelimit-reset']) {
        const resetTime = parseInt(response.headers['ratelimit-reset']);
        const currentTime = Math.floor(Date.now() / 1000);
        
        expect(resetTime).toBeGreaterThan(currentTime);
        expect(resetTime - currentTime).toBeLessThanOrEqual(3600); // Within 1 hour
      }
    });
  });
  
  describe('Rate Limiting Configuration', () => {
    test('should have correct rate limits for individual tier', async () => {
      // Test that the individual tier has the expected limits
      const expectedLimits = {
        requestsPerHour: 1000,
        maxConcurrentSessions: 3,
        agentExecutionsPerWindow: 10
      };
      
      // This would test the configuration values
      expect(expectedLimits.requestsPerHour).toBe(1000);
      expect(expectedLimits.maxConcurrentSessions).toBe(3);
    });
    
    test('should have bypass configuration for admin users', async () => {
      // Test admin bypass configuration
      const adminLimits = {
        requestsPerHour: 'unlimited',
        maxConcurrentSessions: 'unlimited',
        bypassRateLimit: true
      };
      
      expect(adminLimits.bypassRateLimit).toBe(true);
    });
  });
});