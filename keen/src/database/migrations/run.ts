/**
 * Migration runner - Execute database schema migrations
 * Handles schema setup and admin user creation
 */

import fs from 'fs';
import path from 'path';
import { DatabaseManager } from '../DatabaseManager.js';
import { config } from '../../config/database.js';

interface Migration {
  filename: string;
  content: string;
}

class MigrationRunner {
  private db: DatabaseManager;

  constructor() {
    this.db = new DatabaseManager();
  }

  /**
   * Load all migration files from schema directory
   */
  private loadMigrations(): Migration[] {
    const schemaDir = path.join(process.cwd(), 'src', 'database', 'schema');
    const files = fs.readdirSync(schemaDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Execute in alphabetical order

    return files.map(filename => ({
      filename,
      content: fs.readFileSync(path.join(schemaDir, filename), 'utf8'),
    }));
  }

  /**
   * Execute all migrations
   */
  async runMigrations(): Promise<void> {
    console.log('🚀 Starting database migrations...');
    
    try {
      // Test database connection
      const connected = await this.db.testConnection();
      if (!connected) {
        throw new Error('Failed to connect to database');
      }

      const migrations = this.loadMigrations();
      console.log(`📁 Found ${migrations.length} migration file(s)`);

      for (const migration of migrations) {
        console.log(`🔧 Executing migration: ${migration.filename}`);
        
        await this.db.transaction(async (transaction) => {
          // Split migration into individual statements
          const statements = migration.content
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt && !stmt.startsWith('--'));

          for (const statement of statements) {
            if (statement.trim()) {
              await transaction.query(statement);
            }
          }
        });

        console.log(`✅ Migration completed: ${migration.filename}`);
      }

      console.log('🎉 All migrations completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Validate database schema
   */
  async validateSchema(): Promise<boolean> {
    try {
      console.log('🔍 Validating database schema...');
      
      // Check that all required tables exist
      const expectedTables = [
        'users',
        'auth_tokens', 
        'credit_accounts',
        'credit_transactions',
        'agent_sessions',
        'websocket_connections',
        'daily_analytics'
      ];

      const [{ count }] = await this.db.query<{ count: number }>(
        `
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name = ANY($1)
        `,
        [expectedTables]
      );

      if (parseInt(count.toString()) !== expectedTables.length) {
        console.error(`❌ Schema validation failed: Expected ${expectedTables.length} tables, found ${count}`);
        return false;
      }

      // Check that admin user exists
      const [adminUser] = await this.db.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM users WHERE email = 'ahiya.butman@gmail.com' AND is_admin = true"
      );

      if (parseInt(adminUser.count.toString()) !== 1) {
        console.error('❌ Admin user not found or not properly configured');
        return false;
      }

      // Check that admin has unlimited credit account
      const [adminCredit] = await this.db.query<{ count: number }>(
        `
        SELECT COUNT(*) as count 
        FROM credit_accounts ca
        JOIN users u ON ca.user_id = u.id
        WHERE u.email = 'ahiya.butman@gmail.com' AND ca.unlimited_credits = true
        `
      );

      if (parseInt(adminCredit.count.toString()) !== 1) {
        console.error('❌ Admin credit account not found or not configured for unlimited credits');
        return false;
      }

      console.log('✅ Database schema validation passed!');
      return true;
    } catch (error) {
      console.error('❌ Schema validation error:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

// Main execution if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new MigrationRunner();
  
  runner.runMigrations()
    .then(() => runner.validateSchema())
    .then((valid) => {
      if (valid) {
        console.log('🎉 Database setup completed successfully!');
        process.exit(0);
      } else {
        console.error('❌ Database setup validation failed!');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ Database setup failed:', error);
      process.exit(1);
    })
    .finally(() => {
      runner.close();
    });
}

export { MigrationRunner };
