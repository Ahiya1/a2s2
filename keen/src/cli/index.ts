/**
 * keen CLI - Main CLI Interface
 * Implements: keen breathe '<vision>', keen breath -f vision.md, keen converse
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { BreatheCommand } from './commands/BreatheCommand.js';
import { BreathCommand } from './commands/BreathCommand.js';
import { ConverseCommand } from './commands/ConverseCommand.js';
import { VersionCommand } from './commands/VersionCommand.js';

export class KeenCLI {
  private program: Command;
  
  constructor() {
    this.program = new Command();
    this.setupCLI();
  }
  
  private setupCLI(): void {
    this.program
      .name('keen')
      .description('Autonomous Development Platform - Execute AI-driven development tasks')
      .version('2.0.0')
      .helpOption('-h, --help', 'Display help for command')
      .configureHelp({
        sortSubcommands: true,
        subcommandTerm: (cmd) => cmd.name() + ' ' + cmd.usage(),
      });
    
    // Add global options
    this.program
      .option('-v, --verbose', 'Enable verbose output')
      .option('--debug', 'Enable debug mode')
      .option('--no-color', 'Disable colored output')
      .option('--directory <dir>', 'Working directory (default: current directory)')
      .option('--config <file>', 'Configuration file path');
    
    // Register commands
    new BreatheCommand(this.program);
    new BreathCommand(this.program);
    new ConverseCommand(this.program);
    new VersionCommand(this.program);
    
    // Handle unknown commands
    this.program.on('command:*', () => {
      console.error(chalk.red(`❌ Unknown command: ${this.program.args.join(' ')}`));
      console.log(chalk.yellow('\n💡 Available commands:'));
      console.log('   keen breathe "<vision>"     Execute autonomous agent with vision');
      console.log('   keen breath -f <file>     Execute from vision file');
      console.log('   keen converse             Interactive conversation mode');
      console.log('   keen --help               Show detailed help');
      process.exit(1);
    });
  }
  
  async run(args: string[]): Promise<void> {
    // Handle no arguments case
    if (args.length === 0) {
      console.log(chalk.blue('🤖 keen - Autonomous Development Platform'));
      console.log(chalk.gray('Version 2.0.0 - Phase 3.1 Agent Core\n'));
      console.log(chalk.yellow('💡 Quick start:'));
      console.log('   keen breathe "Create a React todo app with TypeScript"');
      console.log('   keen breath -f vision.md');
      console.log('   keen converse');
      console.log('\n📚 For more information: keen --help');
      return;
    }
    
    await this.program.parseAsync(args, { from: 'user' });
  }
}
