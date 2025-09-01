/**
 * keen API Gateway - Integration Tests
 * End-to-end testing of complete API Gateway functionality
 */

import request from 'supertest';
import { KeenAPIServer } from '../../src/api/server.js';
import { keen } from '../../src/index.js';

describe('API Gateway Integration', () => {
  let server: KeenAPIServer;
  let app: any;
  let keenDB: keen;
  
  beforeAll(async () => {
    // Initialize test database
    keenDB = keen.getInstance();
    await keenDB.initialize();
    
    // Initialize server with the same keen instance
    server = new KeenAPIServer(keenDB);
    await server.initialize();
    app = server.getApp();
  });
  
  afterAll(async () => {
    await server?.stop();
    await keenDB?.close();
  });
  
  describe('Complete User Journey', () => {
    test('should handle complete user registration to agent execution flow', async () => {
      const timestamp = Date.now();
      const testEmail = `integration${timestamp}@test.com`;
      const testUsername = `integration${timestamp}`;
      
      // Step 1: User Registration
      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: testEmail,
          username: testUsername,
          password: 'SecurePassword123!',
          display_name: 'Integration Test User'
        });
      
      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.success).toBe(true);
      expect(registerResponse.body.user.email).toBe(testEmail);
      expect(registerResponse.body.tokens.access_token).toBeDefined();
      expect(registerResponse.body.admin_access).toBe(false);
      
      const accessToken = registerResponse.body.tokens.access_token;
      
      // Step 2: Check Initial Credit Balance
      const balanceResponse = await request(app)
        .get('/api/v1/credits/balance')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(balanceResponse.status).toBe(200);
      expect(balanceResponse.body.success).toBe(true);
      expect(balanceResponse.body.balance.current_balance).toBeDefined();
      expect(balanceResponse.body.balance.unlimited_credits).toBe(false);
      expect(balanceResponse.body.credit_system.markup_multiplier).toBe(5.0);
      expect(balanceResponse.body.credit_system.no_packages).toBe(true);
      
      // Step 3: Purchase Credits (if balance is low)
      const currentBalance = parseFloat(balanceResponse.body.balance.available_balance);
      
      if (currentBalance < 10) {
        const purchaseResponse = await request(app)
          .post('/api/v1/credits/purchase')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            amount: 25.00,
            payment_method_id: 'pm_test_card_4242424242424242',
            description: 'Integration test credit purchase'
          });
        
        expect(purchaseResponse.status).toBe(200);
        expect(purchaseResponse.body.success).toBe(true);
        expect(purchaseResponse.body.transaction.amount).toBe(25.00);
        expect(purchaseResponse.body.purchase_info.markup_info).toBe('5x markup over Claude API costs');
      }
      
      // Step 4: Get Cost Estimate
      const estimateResponse = await request(app)
        .post('/api/v1/credits/estimate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          vision: 'Create a simple React todo application with TypeScript and tests',
          max_iterations: 20,
          enable_web_search: true,
          complexity: 'medium'
        });
      
      expect(estimateResponse.status).toBe(200);
      expect(estimateResponse.body.success).toBe(true);
      expect(estimateResponse.body.estimation.cost_breakdown.claude_api_cost).toBeGreaterThan(0);
      expect(estimateResponse.body.estimation.cost_breakdown.keen_credit_cost).toBeGreaterThan(0);
      expect(estimateResponse.body.estimation.cost_breakdown.markup_multiplier).toBe(5.0);
      expect(estimateResponse.body.estimation.affordability.can_afford).toBeDefined();
      expect(estimateResponse.body.user_context.tier).toBe('individual');
      
      // Step 5: Execute Agent (if can afford)
      if (estimateResponse.body.estimation.affordability.can_afford) {
        const executeResponse = await request(app)
          .post('/api/v1/agents/execute')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            vision: 'Create a simple React todo application with TypeScript and tests',
            options: {
              max_iterations: 20,
              cost_budget: 15.0,
              enable_web_search: true,
              enable_streaming: true,
              show_progress: true
            }
          });
        
        expect(executeResponse.status).toBe(200);
        expect(executeResponse.body.success).toBe(true);
        expect(executeResponse.body.session.id).toBeDefined();
        expect(executeResponse.body.session.status).toBe('running');
        expect(executeResponse.body.session.streaming_url).toMatch(/^wss:\/\//);
        
        // Verify agent purity
        expect(executeResponse.body.execution_info.agent_purity).toBe(true);
        expect(executeResponse.body.execution_info.business_logic_isolated).toBe(true);
        
        // Verify credit reservation
        expect(executeResponse.body.credit_info.reserved).toBeGreaterThan(0);
        expect(executeResponse.body.credit_info.is_admin_session).toBe(false);
        expect(executeResponse.body.credit_info.credit_bypass).toBe(false);
        
        const sessionId = executeResponse.body.session.session_id;
        
        // Step 6: Check Session Status
        const statusResponse = await request(app)
          .get(`/api/v1/agents/sessions/${sessionId}`)
          .set('Authorization', `Bearer ${accessToken}`);
        
        expect(statusResponse.status).toBe(200);
        expect(statusResponse.body.success).toBe(true);
        expect(statusResponse.body.session.session_id).toBe(sessionId);
        expect(statusResponse.body.session.status).toBe('running');
        
        // Step 7: List User Sessions
        const sessionsResponse = await request(app)
          .get('/api/v1/agents/sessions')
          .set('Authorization', `Bearer ${accessToken}`);
        
        expect(sessionsResponse.status).toBe(200);
        expect(sessionsResponse.body.success).toBe(true);
        expect(sessionsResponse.body.sessions).toBeInstanceOf(Array);
        expect(sessionsResponse.body.sessions.length).toBeGreaterThan(0);
      }
      
      // Step 8: Check Transaction History
      const transactionsResponse = await request(app)
        .get('/api/v1/credits/transactions')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(transactionsResponse.status).toBe(200);
      expect(transactionsResponse.body.success).toBe(true);
      expect(transactionsResponse.body.transactions).toBeInstanceOf(Array);
      expect(transactionsResponse.body.summary).toBeDefined();
      
      // Step 9: Get User Analytics
      const analyticsResponse = await request(app)
        .get('/api/v1/credits/analytics')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(analyticsResponse.status).toBe(200);
      expect(analyticsResponse.body.success).toBe(true);
      expect(analyticsResponse.body.analytics.usage).toBeDefined();
      expect(analyticsResponse.body.credit_system.markup_multiplier).toBe(5.0);
      expect(analyticsResponse.body.credit_system.individual_tier).toBe(true);
    });
  });
  
  describe('Admin User Journey', () => {
    test('should handle admin user with unlimited privileges', async () => {
      // Try to login as admin
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: process.env.ADMIN_EMAIL || 'ahiya.butman@gmail.com',
          password: process.env.ADMIN_PASSWORD || '2con-creator'
        });
      
      if (adminLogin.status !== 200) {
        console.warn('Admin user not available for admin journey test');
        return;
      }
      
      expect(adminLogin.body.success).toBe(true);
      expect(adminLogin.body.admin_access).toBe(true);
      expect(adminLogin.body.user.is_admin).toBe(true);
      expect(adminLogin.body.tokens.expires_in).toBe(3600); // 1 hour for admin
      
      const adminToken = adminLogin.body.tokens.access_token;
      
      // Admin Credit Balance (Unlimited)
      const adminBalanceResponse = await request(app)
        .get('/api/v1/credits/balance')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(adminBalanceResponse.status).toBe(200);
      expect(adminBalanceResponse.body.balance.unlimited_credits).toBe(true);
      expect(adminBalanceResponse.body.user_info.is_admin).toBe(true);
      expect(adminBalanceResponse.body.user_info.credit_bypass).toBe(true);
      
      // Admin Agent Execution (No Credit Deduction)
      const adminExecuteResponse = await request(app)
        .post('/api/v1/agents/execute')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vision: 'Create a comprehensive system monitoring and alerting platform with real-time dashboards',
          options: {
            max_iterations: 100,
            cost_budget: 100.0,
            enable_web_search: true
          }
        });
      
      expect(adminExecuteResponse.status).toBe(200);
      expect(adminExecuteResponse.body.success).toBe(true);
      expect(adminExecuteResponse.body.credit_info.is_admin_session).toBe(true);
      expect(adminExecuteResponse.body.credit_info.credit_bypass).toBe(true);
      expect(adminExecuteResponse.body.credit_info.reserved).toBe(0); // No credits reserved for admin
      
      // Verify agent still receives sanitized request (no admin info)
      expect(adminExecuteResponse.body.execution_info.agent_purity).toBe(true);
      expect(adminExecuteResponse.body.execution_info.business_logic_isolated).toBe(true);
      
      // Admin System Analytics
      const systemAnalyticsResponse = await request(app)
        .get('/api/v1/admin/analytics?range=day&include_users=true&include_costs=true')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(systemAnalyticsResponse.status).toBe(200);
      expect(systemAnalyticsResponse.body.success).toBe(true);
      expect(systemAnalyticsResponse.body.system).toBeDefined();
      expect(systemAnalyticsResponse.body.credits.system.markup_multiplier).toBe(5.0);
      expect(systemAnalyticsResponse.body.credits.system.no_packages).toBe(true);
      expect(systemAnalyticsResponse.body.credits.system.admin_bypass_enabled).toBe(true);
      
      // Admin System Health Check
      const healthResponse = await request(app)
        .get('/api/v1/admin/system/health')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(healthResponse.status).toBeOneOf([200, 503]);
      expect(healthResponse.body.components).toBeDefined();
      expect(healthResponse.body.checked_by).toBeDefined();
      
      // Admin User List
      const usersResponse = await request(app)
        .get('/api/v1/admin/users?limit=10')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(usersResponse.status).toBe(200);
      expect(usersResponse.body.success).toBe(true);
      expect(usersResponse.body.users).toBeInstanceOf(Array);
      expect(usersResponse.body.summary.admin_users).toBeGreaterThanOrEqual(1);
      
      // Admin Audit Logs
      const auditResponse = await request(app)
        .get('/api/v1/admin/audit-logs?limit=20&event_type=admin_action')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(auditResponse.status).toBe(200);
      expect(auditResponse.body.success).toBe(true);
      expect(auditResponse.body.audit_logs).toBeInstanceOf(Array);
    });
  });
  
  describe('API Endpoint Coverage', () => {
    test('should have all required endpoints accessible', async () => {
      // Health endpoints (no auth required)
      const healthResponse = await request(app).get('/health');
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.body.status).toBe('healthy');
      expect(healthResponse.body.features.agent_purity).toBe(true);
      
      const detailedHealthResponse = await request(app).get('/health/detailed');
      expect(detailedHealthResponse.status).toBe(200);
      expect(detailedHealthResponse.body.phase).toBe('Phase 2 - API Gateway Complete');
      expect(detailedHealthResponse.body.api_gateway).toBeDefined();
      
      // API root endpoint
      const apiResponse = await request(app).get('/api');
      expect(apiResponse.status).toBe(200);
      expect(apiResponse.body.name).toBe('keen API Gateway');
      expect(apiResponse.body.version).toBe('2.0.0');
      expect(apiResponse.body.features.agentPurity).toBe('Complete business logic isolation');
      expect(apiResponse.body.features.creditSystem).toBe('5x markup with admin bypass');
    });
    
    test('should return 404 for non-existent endpoints', async () => {
      const response = await request(app).get('/api/v1/nonexistent');
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.type).toBe('NOT_FOUND');
      expect(response.body.error.available_endpoints).toBeDefined();
    });
  });
  
  describe('Error Handling', () => {
    test('should handle various error scenarios gracefully', async () => {
      // Invalid JSON
      const invalidJsonResponse = await request(app)
        .post('/api/v1/auth/login')
        .send('invalid json');
      
      expect(invalidJsonResponse.status).toBe(400);
      
      // Missing required fields
      const missingFieldsResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({});
      
      expect(missingFieldsResponse.status).toBe(400);
      expect(missingFieldsResponse.body.success).toBe(false);
      
      // Invalid credentials
      const invalidCredentialsResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid@example.com',
          password: 'wrongpassword'
        });
      
      expect(invalidCredentialsResponse.status).toBe(401);
      expect(invalidCredentialsResponse.body.error.type).toBe('AUTHENTICATION_ERROR');
    });
  });
  
  describe('Security Validation', () => {
    test('should enforce proper security headers', async () => {
      const response = await request(app).get('/health');
      
      // Check for security headers (Helmet)
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      
      // Check for CORS headers
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
    
    test('should include request ID in all responses', async () => {
      const response = await request(app).get('/health');
      
      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toMatch(/^req_\d+_[a-z0-9]+/);
    });
  });
  
  describe('Performance Validation', () => {
    test('should respond to health checks quickly', async () => {
      const startTime = Date.now();
      
      const response = await request(app).get('/health');
      
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
      expect(response.body.performance.response_time_ms).toBeLessThan(1000);
    });
  });
});

// Custom Jest matcher for integration tests
expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    return {
      message: () => pass 
        ? `expected ${received} not to be one of ${expected.join(', ')}`
        : `expected ${received} to be one of ${expected.join(', ')}`,
      pass
    };
  }
});

// TypeScript declaration
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}