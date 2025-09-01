/**
 * Seed runner - Execute database seed data
 * Handles admin user and initial data setup
 */

import fs from 'fs';
import path from 'path';
import { DatabaseManager } from '../DatabaseManager.js';
import { adminConfig, testConfig, config } from '../../config/database.js';

interface SeedFile {
  filename: string;
  content: string;
}

class SeedRunner {
  private db: DatabaseManager;

  constructor() {
    // Configure database connection based on environment
    const dbConfig = process.env.NODE_ENV === 'test' ? testConfig : config;
    this.db = new DatabaseManager();
  }

  /**
   * Load all seed files
   */
  private loadSeeds(): SeedFile[] {
    const seedsDir = path.join(process.cwd(), 'src', 'database', 'seeds');
    const files = fs.readdirSync(seedsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Execute in alphabetical order

    return files.map(filename => ({
      filename,
      content: fs.readFileSync(path.join(seedsDir, filename), 'utf8'),
    }));
  }

  /**
   * Split SQL content into executable statements, handling DO blocks correctly
   */
  private splitSqlStatements(content: string): string[] {
    const statements: string[] = [];
    let currentStatement = '';
    let inDoBlock = false;
    let dollarTag = '';
    
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments when not in DO block
      if (!inDoBlock && (!trimmedLine || trimmedLine.startsWith('--'))) {
        continue;
      }
      
      currentStatement += line + '\n';
      
      // Check for DO block start
      const doMatch = trimmedLine.match(/^DO\s+(\$[^$]*\$)/i);
      if (doMatch && !inDoBlock) {
        inDoBlock = true;
        dollarTag = doMatch[1];
      }
      
      // Check for DO block end
      if (inDoBlock && trimmedLine.includes(dollarTag) && trimmedLine.endsWith(';')) {
        inDoBlock = false;
        statements.push(currentStatement.trim());
        currentStatement = '';
        dollarTag = '';
      }
      // Check for regular statement end (not in DO block)
      else if (!inDoBlock && trimmedLine.endsWith(';')) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }
    
    return statements.filter(stmt => stmt.length > 0);
  }

  /**
   * Execute all seed files
   */
  async runSeeds(): Promise<void> {
    console.log('🌱 Starting database seeding...');
    
    try {
      // Test database connection
      const connected = await this.db.testConnection();
      if (!connected) {
        throw new Error('Failed to connect to database');
      }

      const seeds = this.loadSeeds();
      console.log(`📁 Found ${seeds.length} seed file(s)`);

      for (const seed of seeds) {
        console.log(`🌱 Executing seed: ${seed.filename}`);
        
        await this.db.transaction(async (transaction) => {
          // Split seed file into individual statements with proper DO block handling
          const statements = this.splitSqlStatements(seed.content);
          
          console.log(`📝 Found ${statements.length} statement(s) in ${seed.filename}`);

          for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.trim()) {
              console.log(`⚡ Executing statement ${i+1}/${statements.length}: ${statement.substring(0, 50).replace(/\n/g, ' ')}...`);
              await transaction.query(statement);
            }
          }
        });

        console.log(`✅ Seed completed: ${seed.filename}`);
      }

      console.log('🎉 All seeds completed successfully!');
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      throw error;
    }
  }

  /**
   * Validate seed data
   */
  async validateSeeds(): Promise<boolean> {
    try {
      console.log('🔍 Validating seed data...');
      
      // Verify admin user exists with correct configuration
      const [adminUser] = await this.db.query<{
        email: string;
        username: string;
        is_admin: boolean;
        role: string;
        admin_privileges: any;
      }>(
        `
        SELECT email, username, is_admin, role, admin_privileges
        FROM users 
        WHERE email = $1
        `,
        [adminConfig.email]
      );

      if (!adminUser) {
        console.error('❌ Admin user not found');
        return false;
      }

      if (!adminUser.is_admin) {
        console.error('❌ Admin user does not have admin privileges');
        return false;
      }

      if (adminUser.role !== 'super_admin') {
        console.error('❌ Admin user does not have super_admin role');
        return false;
      }

      if (!adminUser.admin_privileges?.unlimited_credits) {
        console.error('❌ Admin user does not have unlimited_credits privilege');
        return false;
      }

      // Verify admin credit account
      const [adminCreditAccount] = await this.db.query<{
        unlimited_credits: boolean;
        current_balance: string;
      }>(
        `
        SELECT unlimited_credits, current_balance
        FROM credit_accounts ca
        JOIN users u ON ca.user_id = u.id
        WHERE u.email = $1
        `,
        [adminConfig.email]
      );

      if (!adminCreditAccount) {
        console.error('❌ Admin credit account not found');
        return false;
      }

      if (!adminCreditAccount.unlimited_credits) {
        console.error('❌ Admin credit account does not have unlimited credits');
        return false;
      }

      // Verify admin bypass transaction exists
      const [adminTransaction] = await this.db.query<{ count: number }>(
        `
        SELECT COUNT(*) as count
        FROM credit_transactions ct
        JOIN users u ON ct.user_id = u.id
        WHERE u.email = $1 AND ct.is_admin_bypass = true
        `,
        [adminConfig.email]
      );

      if (parseInt(adminTransaction.count.toString()) === 0) {
        console.error('❌ Admin bypass transaction not found');
        return false;
      }

      // Verify daily analytics entry exists
      const [adminAnalytics] = await this.db.query<{ count: number }>(
        `
        SELECT COUNT(*) as count
        FROM daily_analytics da
        JOIN users u ON da.user_id = u.id
        WHERE u.email = $1
        `,
        [adminConfig.email]
      );

      if (parseInt(adminAnalytics.count.toString()) === 0) {
        console.error('❌ Admin analytics entry not found');
        return false;
      }

      console.log('✅ Seed data validation passed!');
      console.log(`✅ Admin user: ${adminUser.email} (${adminUser.username})`);
      console.log(`✅ Admin role: ${adminUser.role}`);
      console.log(`✅ Admin privileges: ${JSON.stringify(adminUser.admin_privileges, null, 2)}`);
      console.log(`✅ Unlimited credits: ${adminCreditAccount.unlimited_credits}`);
      console.log(`✅ Credit balance: ${adminCreditAccount.current_balance}`);
      
      return true;
    } catch (error) {
      console.error('❌ Seed validation error:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

// CLI execution - check if this file is being executed directly
// Using process.argv check instead of import.meta for compatibility
const isMainModule = process.argv[1] && (process.argv[1].endsWith('run.ts') || process.argv[1].endsWith('run.js'));

if (isMainModule && typeof require !== 'undefined') {
  const runner = new SeedRunner();
  
  runner.runSeeds()
    .then(() => runner.validateSeeds())
    .then((valid) => {
      if (valid) {
        console.log('🎉 Database seeding completed successfully!');
        process.exit(0);
      } else {
        console.error('❌ Database seeding validation failed!');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ Database seeding failed:', error);
      process.exit(1);
    })
    .finally(() => {
      runner.close();
    });
}

export { SeedRunner };
