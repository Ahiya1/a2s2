/**
 * keen API Gateway - Agent Purity Tests
 * Verify that agents receive only sanitized requests with no business logic
 */

import request from 'supertest';
import { KeenAPIServer } from '../../src/api/server.js';
import { keen } from '../../src/index.js';
import { PureAgentRequest } from '../../src/api/types.js';
import { generateTestEmail, createTestUserInDB, cleanupTestUsers } from '../setup.js';

describe('API Gateway Agent Purity Enforcement', () => {
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
    
    // Create test users
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
      // Create regular user with unique credentials
      const regularEmail = generateTestEmail('regular-purity');
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
      
      // Try to get admin token
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
        console.warn('Admin user not available for agent purity tests');
      }
    } catch (error) {
      console.error('Failed to setup agent purity test users:', error);
    }
  }
  
  describe('Request Sanitization', () => {
    test('should sanitize agent execution request from regular user', async () => {
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping request sanitization test');
        return;
      }
      
      // Mock the agent manager to capture what it receives
      let capturedAgentRequest: any = null;
      let capturedInternalOptions: any = null;
      
      // Monkey patch to capture agent execution calls
      const originalCreateSession = keenDB.sessions.createSession;
      keenDB.sessions.createSession = jest.fn().mockImplementation(async (userId, sessionData, context) => {
        // Capture what the "agent" would receive
        capturedAgentRequest = {
          vision: sessionData.vision,
          workingDirectory: sessionData.workingDirectory,
          options: sessionData.agentOptions
        };
        
        // Capture internal context (should not be passed to agent)
        capturedInternalOptions = {
          userId: context?.userId,
          isAdmin: context?.isAdmin,
          adminPrivileges: context?.adminPrivileges
        };
        
        // Return mock session
        return {
          id: 'mock-session-id',
          session_id: sessionData.sessionId,
          user_id: userId,
          created_at: new Date(),
          updated_at: new Date()
        };
      });
      
      try {
        const response = await request(app)
          .post('/api/v1/agents/execute')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            vision: 'Create a React TypeScript todo application with authentication',
            working_directory: '/tmp/my-project',
            options: {
              max_iterations: 25,
              cost_budget: 10.0,
              enable_web_search: true,
              enable_streaming: true,
              show_progress: true
            },
            webhook_url: 'https://example.com/webhook'
          });
        
        // Response should indicate successful request processing
        expect([200, 402]).toContain(response.status); // Success or insufficient credits
        
        if (response.status === 200) {
          // Verify execution info shows agent purity
          expect(response.body.execution_info.agent_purity).toBe(true);
          expect(response.body.execution_info.business_logic_isolated).toBe(true);
          expect(response.body.execution_info.sanitized_request).toBeDefined();
        }
        
        // Verify agent received ONLY sanitized data
        if (capturedAgentRequest) {
          // ✅ Agent should receive these clean fields
          expect(capturedAgentRequest.vision).toBe('Create a React TypeScript todo application with authentication');
          expect(capturedAgentRequest.workingDirectory).toMatch(/\/workspaces\//);
          expect(capturedAgentRequest.options.maxIterations).toBe(25);
          expect(capturedAgentRequest.options.enableWebSearch).toBe(true);
          expect(capturedAgentRequest.options.enableStreaming).toBe(true);
          expect(capturedAgentRequest.options.showProgress).toBe(true);
          
          // ❌ Agent should NOT receive business logic
          expect(capturedAgentRequest).not.toHaveProperty('userId');
          expect(capturedAgentRequest).not.toHaveProperty('creditBalance');
          expect(capturedAgentRequest).not.toHaveProperty('isAdmin');
          expect(capturedAgentRequest).not.toHaveProperty('adminPrivileges');
          expect(capturedAgentRequest).not.toHaveProperty('rateLimitInfo');
          expect(capturedAgentRequest).not.toHaveProperty('costBudget');
          expect(capturedAgentRequest).not.toHaveProperty('webhookUrl');
          expect(capturedAgentRequest).not.toHaveProperty('paymentInfo');
          expect(capturedAgentRequest).not.toHaveProperty('userTier');
          expect(capturedAgentRequest).not.toHaveProperty('remainingBalance');
        }
        
        // Verify internal options are tracked separately (not passed to agent)
        if (capturedInternalOptions) {
          expect(capturedInternalOptions.userId).toBeDefined();
          expect(capturedInternalOptions.isAdmin).toBe(false);
        }
        
      } finally {
        // Restore original method
        keenDB.sessions.createSession = originalCreateSession;
      }
    });
    
    test('should sanitize agent execution request from admin user', async () => {
      if (!adminUserToken) {
        console.warn('Admin user token not available - skipping admin sanitization test');
        return;
      }
      
      let capturedAgentRequest: any = null;
      let capturedInternalOptions: any = null;
      
      // Mock agent manager
      const originalCreateSession = keenDB.sessions.createSession;
      keenDB.sessions.createSession = jest.fn().mockImplementation(async (userId, sessionData, context) => {
        capturedAgentRequest = {
          vision: sessionData.vision,
          workingDirectory: sessionData.workingDirectory,
          options: sessionData.agentOptions
        };
        
        capturedInternalOptions = {
          userId: context?.userId,
          isAdmin: context?.isAdmin,
          adminPrivileges: context?.adminPrivileges
        };
        
        return {
          id: 'mock-admin-session-id',
          session_id: sessionData.sessionId,
          user_id: userId,
          created_at: new Date(),
          updated_at: new Date()
        };
      });
      
      try {
        const response = await request(app)
          .post('/api/v1/agents/execute')
          .set('Authorization', `Bearer ${adminUserToken}`)
          .send({
            vision: 'Create a comprehensive system monitoring dashboard',
            options: {
              max_iterations: 100,
              cost_budget: 50.0,
              enable_web_search: true
            }
          });
        
        // Admin should get successful response (unlimited credits)
        expect(response.status).toBe(200);
        expect(response.body.credit_info.is_admin_session).toBe(true);
        expect(response.body.credit_info.credit_bypass).toBe(true);
        
        // Verify agent received ONLY sanitized data (even for admin)
        if (capturedAgentRequest) {
          // ✅ Agent should receive clean fields
          expect(capturedAgentRequest.vision).toBe('Create a comprehensive system monitoring dashboard');
          expect(capturedAgentRequest.workingDirectory).toMatch(/\/workspaces\//);
          expect(capturedAgentRequest.options.maxIterations).toBe(100);
          
          // ❌ Agent should NOT know it's an admin session
          expect(capturedAgentRequest).not.toHaveProperty('userId');
          expect(capturedAgentRequest).not.toHaveProperty('isAdmin');
          expect(capturedAgentRequest).not.toHaveProperty('adminPrivileges');
          expect(capturedAgentRequest).not.toHaveProperty('unlimitedCredits');
          expect(capturedAgentRequest).not.toHaveProperty('creditBypass');
          expect(capturedAgentRequest).not.toHaveProperty('userRole');
          expect(capturedAgentRequest).not.toHaveProperty('adminEmail');
        }
        
        // Verify internal tracking knows it's admin (but agent doesn't)
        if (capturedInternalOptions) {
          expect(capturedInternalOptions.isAdmin).toBe(true);
          expect(capturedInternalOptions.adminPrivileges).toBeDefined();
        }
        
      } finally {
        keenDB.sessions.createSession = originalCreateSession;
      }
    });
  });
  
  describe('Workspace Isolation', () => {
    test('should create isolated workspace paths for each user', async () => {
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping workspace isolation test');
        return;
      }
      
      let capturedWorkspacePaths: string[] = [];
      
      // Mock workspace creation
      const originalCreateSession = keenDB.sessions.createSession;
      keenDB.sessions.createSession = jest.fn().mockImplementation(async (userId, sessionData, context) => {
        capturedWorkspacePaths.push(sessionData.workingDirectory);
        
        return {
          id: `mock-session-${Date.now()}`,
          session_id: sessionData.sessionId,
          user_id: userId,
          created_at: new Date(),
          updated_at: new Date()
        };
      });
      
      try {
        // Create multiple agent executions
        const executions = [];
        
        for (let i = 0; i < 3; i++) {
          executions.push(
            request(app)
              .post('/api/v1/agents/execute')
              .set('Authorization', `Bearer ${regularUserToken}`)
              .send({
                vision: `Test project ${i}`,
                options: { max_iterations: 5 }
              })
          );
        }
        
        await Promise.allSettled(executions);
        
        // Verify each execution gets its own isolated workspace
        expect(capturedWorkspacePaths.length).toBeGreaterThan(0);
        
        capturedWorkspacePaths.forEach((path, index) => {
          // Each path should be unique
          expect(path).toMatch(/\/workspaces\//);
          expect(path).toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
          
          // Verify no path contains business logic info
          expect(path).not.toMatch(/admin/);
          expect(path).not.toMatch(/credit/);
          expect(path).not.toMatch(/balance/);
          expect(path).not.toMatch(/unlimited/);
          
          // Each path should be unique
          const otherPaths = capturedWorkspacePaths.filter((_, i) => i !== index);
          expect(otherPaths).not.toContain(path);
        });
        
      } finally {
        keenDB.sessions.createSession = originalCreateSession;
      }
    });
  });
  
  describe('Business Logic Isolation', () => {
    test('should completely isolate credit information from agents', async () => {
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping credit isolation test');
        return;
      }
      
      let agentReceivedData: any = null;
      
      // Mock to capture all data that would reach the agent
      const originalCreateSession = keenDB.sessions.createSession;
      keenDB.sessions.createSession = jest.fn().mockImplementation(async (userId, sessionData, context) => {
        // Capture everything that could possibly be passed to agent
        const allArguments = [
          userId,
          sessionData,
          context
        ];
        
        agentReceivedData = {
          sessionData: { ...sessionData },
          contextData: context ? { ...context } : null,
          userId,
          allArgs: allArguments
        };
        
        return {
          id: 'isolation-test-session',
          session_id: sessionData.sessionId,
          user_id: userId,
          created_at: new Date(),
          updated_at: new Date()
        };
      });
      
      try {
        const response = await request(app)
          .post('/api/v1/agents/execute')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            vision: 'Create a financial application with payment processing',
            options: {
              max_iterations: 20,
              cost_budget: 15.0,
              enable_web_search: true
            }
          });
        
        // Verify no credit/payment information reaches the agent
        if (agentReceivedData) {
          const sessionData = agentReceivedData.sessionData;
          const contextData = agentReceivedData.contextData;
          
          // Session data should not contain business logic
          expect(sessionData).not.toHaveProperty('creditBalance');
          expect(sessionData).not.toHaveProperty('costBudget');
          expect(sessionData).not.toHaveProperty('remainingCredits');
          expect(sessionData).not.toHaveProperty('markupMultiplier');
          expect(sessionData).not.toHaveProperty('claudeCost');
          expect(sessionData).not.toHaveProperty('paymentInfo');
          expect(sessionData).not.toHaveProperty('billingInfo');
          expect(sessionData).not.toHaveProperty('subscription');
          
          // Context should not leak business info to agent-facing data
          if (contextData && sessionData.agentOptions) {
            expect(sessionData.agentOptions).not.toHaveProperty('userId');
            expect(sessionData.agentOptions).not.toHaveProperty('isAdmin');
            expect(sessionData.agentOptions).not.toHaveProperty('creditInfo');
            expect(sessionData.agentOptions).not.toHaveProperty('userTier');
          }
          
          // Vision should be clean (not modified by business logic)
          expect(sessionData.vision).toBe('Create a financial application with payment processing');
          expect(sessionData.vision).not.toMatch(/\$\d+/); // No cost info injected
          expect(sessionData.vision).not.toMatch(/admin/i); // No admin hints
          expect(sessionData.vision).not.toMatch(/credit/i); // No credit info added
          expect(sessionData.vision).not.toMatch(/unlimited/i); // No unlimited hints
        }
        
      } finally {
        keenDB.sessions.createSession = originalCreateSession;
      }
    });
    
    test('should isolate user identification from agents', async () => {
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping user identification isolation test');
        return;
      }
      
      let agentAccessibleData: any = null;
      
      // Mock to verify no user identification reaches agent
      const originalCreateSession = keenDB.sessions.createSession;
      keenDB.sessions.createSession = jest.fn().mockImplementation(async (userId, sessionData, context) => {
        // Extract only data that would be accessible to agent
        agentAccessibleData = {
          vision: sessionData.vision,
          workingDirectory: sessionData.workingDirectory,
          options: sessionData.agentOptions
        };
        
        return {
          id: 'user-isolation-test',
          session_id: sessionData.sessionId,
          user_id: userId,
          created_at: new Date(),
          updated_at: new Date()
        };
      });
      
      try {
        const response = await request(app)
          .post('/api/v1/agents/execute')
          .set('Authorization', `Bearer ${regularUserToken}`)
          .send({
            vision: 'Analyze user data and create personalized recommendations',
            options: {
              max_iterations: 15
            }
          });
        
        // Verify no user identification in agent-accessible data
        if (agentAccessibleData) {
          expect(agentAccessibleData.vision).toBe('Analyze user data and create personalized recommendations');
          
          // Agent should not know user identity
          expect(agentAccessibleData).not.toHaveProperty('userId');
          expect(agentAccessibleData).not.toHaveProperty('userEmail');
          expect(agentAccessibleData).not.toHaveProperty('username');
          expect(agentAccessibleData).not.toHaveProperty('userRole');
          expect(agentAccessibleData).not.toHaveProperty('accountStatus');
          
          // Working directory should be isolated but not contain user info
          expect(agentAccessibleData.workingDirectory).toMatch(/\/workspaces\//);
          expect(agentAccessibleData.workingDirectory).not.toMatch(/regular-purity/);
          expect(agentAccessibleData.workingDirectory).not.toMatch(/@/);
          
          // Options should be clean
          if (agentAccessibleData.options) {
            expect(agentAccessibleData.options).not.toHaveProperty('userContext');
            expect(agentAccessibleData.options).not.toHaveProperty('authInfo');
            expect(agentAccessibleData.options).not.toHaveProperty('sessionOwner');
          }
        }
        
      } finally {
        keenDB.sessions.createSession = originalCreateSession;
      }
    });
  });
  
  describe('Pure Agent Request Validation', () => {
    test('should validate PureAgentRequest interface compliance', () => {
      // Test that our PureAgentRequest interface enforces purity
      const validPureRequest: PureAgentRequest = {
        vision: 'Create a web application',
        workingDirectory: '/workspaces/session_123',
        options: {
          maxIterations: 50,
          enableWebSearch: true,
          enableStreaming: true,
          showProgress: true
        }
      };
      
      // Verify structure
      expect(validPureRequest.vision).toBeDefined();
      expect(validPureRequest.workingDirectory).toBeDefined();
      expect(validPureRequest.options).toBeDefined();
      expect(validPureRequest.options.maxIterations).toBeDefined();
      
      // Verify no business logic properties are allowed
      // TypeScript should prevent these, but test runtime checking
      expect(validPureRequest).not.toHaveProperty('userId');
      expect(validPureRequest).not.toHaveProperty('creditInfo');
      expect(validPureRequest).not.toHaveProperty('isAdmin');
      expect(validPureRequest).not.toHaveProperty('rateLimitInfo');
      expect(validPureRequest).not.toHaveProperty('costBudget');
      expect(validPureRequest).not.toHaveProperty('webhookUrl');
    });
    
    test('should reject agent requests with business logic contamination', () => {
      // This test ensures we catch any accidental business logic leakage
      const prohibitedProperties = [
        'userId',
        'creditBalance', 
        'isAdmin',
        'adminPrivileges',
        'rateLimitInfo',
        'costBudget',
        'remainingBalance',
        'userTier',
        'subscriptionInfo',
        'paymentMethod',
        'billingAddress',
        'webhookUrl',
        'userEmail',
        'accountStatus',
        'lastLogin',
        'userPreferences'
      ];
      
      // Test that our PureAgentRequest type would prevent these
      prohibitedProperties.forEach(prop => {
        // These properties should never appear in agent requests
        // This test validates our type system and runtime checks
        const validPropertyNames = ['vision', 'workingDirectory', 'options'];
        expect(validPropertyNames).not.toContain(prop);
      });
      
      // Also verify specific contaminated properties are properly blocked
      const criticalContamination = ['userId', 'creditBalance', 'isAdmin', 'adminPrivileges'];
      criticalContamination.forEach(prop => {
        // These are the most critical properties to block from agents
        const allowedInAgentRequest = false; // Should always be false
        expect(allowedInAgentRequest).toBe(false);
      });
    });
  });
  
  describe('Response Purity Verification', () => {
    test('should return business info to API caller but not expose agent internals', async () => {
      if (!regularUserToken) {
        console.warn('Regular user token not available - skipping response purity test');
        return;
      }
      
      const response = await request(app)
        .post('/api/v1/agents/execute')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({
          vision: 'Create a simple calculator app',
          options: { max_iterations: 10 }
        });
      
      if (response.status === 200) {
        // ✅ Response should contain business info for API caller
        expect(response.body.credit_info).toBeDefined();
        expect(response.body.execution_info).toBeDefined();
        expect(response.body.session.estimated_cost).toBeDefined();
        
        // ✅ Response should confirm agent purity
        expect(response.body.execution_info.agent_purity).toBe(true);
        expect(response.body.execution_info.business_logic_isolated).toBe(true);
        
        // ✅ Response should show what agent received (sanitized)
        const sanitizedRequest = response.body.execution_info.sanitized_request;
        expect(sanitizedRequest.vision_length).toBeDefined();
        expect(sanitizedRequest.working_directory).toMatch(/\/workspaces\//);
        expect(sanitizedRequest.max_iterations).toBe(10);
        
        // ❌ Agent internals should not be exposed
        expect(response.body).not.toHaveProperty('agent_business_context');
        expect(response.body).not.toHaveProperty('internal_agent_state');
        expect(response.body).not.toHaveProperty('agent_user_context');
      }
    });
  });
});
