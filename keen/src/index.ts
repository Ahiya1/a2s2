/**
 * keen Database Layer - Main Entry Point
 * Production-grade multi-tenant PostgreSQL foundation
 */

import { DatabaseService } from './database/index.js';
import { adminConfig } from './config/database.js';

/**
 * Main database service instance
 */
export const keen = new DatabaseService();

/**
 * Initialize the keen database layer
 */
export async function initializeKeenDatabase(): Promise<void> {
  console.log('🚀 Initializing keen database layer...');
  
  try {
    // Test connectivity
    const connected = await keen.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }
    
    // Run migrations and seeds
    await keen.initialize();
    
    // Verify admin user is properly configured
    const adminUser = await keen.users.getUserByEmail(adminConfig.email);
    if (!adminUser || !adminUser.is_admin) {
      throw new Error('Admin user not properly configured');
    }
    
    console.log('✅ keen database layer initialized successfully!');
    console.log(`✅ Admin user: ${adminUser.email} (${adminUser.username})`);
    console.log(`✅ Admin privileges: ${JSON.stringify(adminUser.admin_privileges, null, 2)}`);
    
    // Get database health status
    const health = await keen.getHealthStatus();
    console.log(`✅ Database health: Connected=${health.connected}, Latency=${health.latency}ms`);
    console.log(`✅ Connection pool: Total=${health.poolStats.totalCount}, Idle=${health.poolStats.idleCount}`);
    
  } catch (error) {
    console.error('❌ Failed to initialize keen database layer:', error);
    throw error;
  }
}

/**
 * Gracefully shutdown the database layer
 */
export async function shutdownKeenDatabase(): Promise<void> {
  console.log('🛑 Shutting down keen database layer...');
  await keen.close();
  console.log('✅ keen database layer shutdown completed');
}

// Export all database components
export * from './database/index.js';
export * from './config/database.js';

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  switch (command) {
    case 'init':
      initializeKeenDatabase()
        .then(() => {
          console.log('🎉 Database initialization completed!');
          process.exit(0);
        })
        .catch((error) => {
          console.error('❌ Database initialization failed:', error);
          process.exit(1);
        });
      break;
      
    case 'test':
      initializeKeenDatabase()
        .then(async () => {
          console.log('🧪 Testing database connectivity...');
          const health = await keen.getHealthStatus();
          console.log('Database health:', health);
          await shutdownKeenDatabase();
          process.exit(0);
        })
        .catch((error) => {
          console.error('❌ Database test failed:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log('Usage: node dist/index.js [init|test]');
      console.log('  init - Initialize database with migrations and seeds');
      console.log('  test - Test database connectivity and health');
      process.exit(1);
  }
}
