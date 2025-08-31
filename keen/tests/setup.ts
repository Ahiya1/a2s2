/**
 * Test Setup Configuration
 * Global test configuration and database setup
 */

import { DatabaseService } from '../src/database/index.js';
import { testConfig } from '../src/config/database.js';

// Configure test environment
process.env.NODE_ENV = 'test';
process.env.DB_NAME = testConfig.database;
process.env.DB_USER = testConfig.user;
process.env.DB_PASSWORD = testConfig.password;
process.env.DB_MAX_CONNECTIONS = '5'; // Smaller pool for tests

// Global test database service
let globalDbService: DatabaseService;

/**
 * Setup test database before all tests
 */
export async function setupTestDatabase(): Promise<DatabaseService> {
  if (!globalDbService) {
    globalDbService = new DatabaseService();
    
    try {
      // Test connection first
      const connected = await globalDbService.testConnection();
      if (!connected) {
        throw new Error('Failed to connect to test database');
      }
      
      console.log('📋 Setting up test database...');
      await globalDbService.initialize();
      console.log('✅ Test database setup completed');
    } catch (error) {
      console.warn('Test database may already be initialized:', error);
    }
  }
  
  return globalDbService;
}

/**
 * Cleanup test database after all tests
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (globalDbService) {
    await globalDbService.close();
    console.log('🧹 Test database cleanup completed');
  }
}

/**
 * Create test user for testing
 */
export async function createTestUser(
  email: string,
  username: string,
  isAdmin: boolean = false
): Promise<{ id: string; context: UserContext }> {
  const dbService = await setupTestDatabase();
  
  const user = await dbService.users.createUser({
    email,
    username,
    password: 'test-password-123',
    display_name: `Test User ${username}`
  });

  const context: UserContext = {
    userId: user.id,
    isAdmin,
    adminPrivileges: isAdmin ? {
      unlimited_credits: true,
      bypass_rate_limits: true,
      view_all_analytics: true
    } : undefined
  };

  return { id: user.id, context };
}

/**
 * Clean up test data
 */
export async function cleanupTestData(userIds: string[]): Promise<void> {
  const dbService = await setupTestDatabase();
  
  // Note: In a real implementation, you might want to clean up test data
  // For now, we'll rely on the test database being separate
  console.log(`🧹 Would cleanup ${userIds.length} test users`);
}

// Jest global setup
beforeAll(async () => {
  await setupTestDatabase();
});

afterAll(async () => {
  await cleanupTestDatabase();
});
