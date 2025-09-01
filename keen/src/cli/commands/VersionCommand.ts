/**
 * keen version and info commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

export class VersionCommand {
  constructor(program: Command) {
    // Version command (already handled by commander, but we can add info)
    program
      .command('info')
      .description('Show detailed keen platform information')
      .action(async () => {
        await this.showDetailedInfo();
      });
  }
  
  private async showDetailedInfo(): Promise<void> {
    console.log(chalk.blue('🤖 keen - Autonomous Development Platform'));
    console.log(chalk.gray('==========================================\n'));
    
    // Read package.json for version info
    try {
      const packageJsonPath = path.join(__dirname, '../../../package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      console.log(chalk.cyan('📦 Package Information:'));
      console.log(`   Version: ${packageJson.version}`);
      console.log(`   Name: ${packageJson.name}`);
      console.log(`   Description: ${packageJson.description}`);
      console.log('');
      
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not read package information'));
    }
    
    console.log(chalk.cyan('🚀 Current Phase:'));
    console.log('   Phase 3.1 - Agent Core Implementation');
    console.log('   Status: Active Development');
    console.log('');
    
    console.log(chalk.cyan('⚡ Available Commands:'));
    console.log('   keen breathe "<vision>"   Execute autonomous agent with vision');
    console.log('   keen breath -f <file>    Execute from vision file');
    console.log('   keen converse           Interactive conversation mode');
    console.log('   keen info              Show this information');
    console.log('   keen --help            Show detailed help');
    console.log('');
    
    console.log(chalk.cyan('🔧 Features:'));
    console.log('   • Autonomous development with 1M context window');
    console.log('   • Multi-tenant architecture with PostgreSQL');
    console.log('   • Credit-based usage system (5x Claude API markup)');
    console.log('   • Real-time streaming and progress indicators');
    console.log('   • Complete tool ecosystem for development');
    console.log('   • Git-based workspace management');
    console.log('');
    
    console.log(chalk.cyan('🌐 Environment:'));
    console.log(`   Node.js: ${process.version}`);
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Working Directory: ${process.cwd()}`);
    
    // Check environment variables
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasDbConfig = !!(process.env.DB_HOST && process.env.DB_NAME);
    
    console.log(`   Anthropic API Key: ${hasAnthropicKey ? chalk.green('✅ Configured') : chalk.red('❌ Missing')}`);
    console.log(`   Database Config: ${hasDbConfig ? chalk.green('✅ Configured') : chalk.red('❌ Missing')}`);
    console.log('');
    
    console.log(chalk.cyan('📚 Documentation:'));
    console.log('   GitHub: https://github.com/ahiya/keen-platform');
    console.log('   Docs: https://docs.keen.dev');
    console.log('   API: https://api.keen.dev');
    console.log('');
    
    console.log(chalk.cyan('👤 Admin User:'));
    console.log('   Email: ahiya.butman@gmail.com');
    console.log('   Role: Super Administrator');
    console.log('   Credits: Unlimited (bypass enabled)');
    console.log('');
    
    console.log(chalk.gray('💡 Use keen --help for detailed command information'));
  }
}
