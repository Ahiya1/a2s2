/**
 * keen breath -f vision.md Command
 * Execute autonomous agent using vision from a file
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import { KeenAgent } from '../../agent/KeenAgent.js';
import { CLIOptions } from '../types.js';
import { validateDirectory, validateFile } from '../utils/validation.js';
import { startProgressIndicator, stopProgressIndicator } from '../utils/progress.js';

export class BreathCommand {
  constructor(program: Command) {
    program
      .command('breath')
      .description('Execute autonomous agent using vision from a file')
      .option('-f, --file <file>', 'Vision file to execute (e.g., vision.md, requirements.txt)')
      .option('--directory <dir>', 'Working directory for the agent', process.cwd())
      .option('--phase <phase>', 'Starting phase: EXPLORE, SUMMON, or COMPLETE', 'EXPLORE')
      .option('--max-iterations <num>', 'Maximum conversation iterations', '100')
      .option('--cost-budget <amount>', 'Maximum cost budget in USD', '50.00')
      .option('--no-web-search', 'Disable web search capability')
      .option('--extended-context', 'Enable 1M token context window')
      .option('--dry-run', 'Plan execution without making changes')
      .option('--stream', 'Enable real-time streaming output')
      .action(async (options: any, command: Command) => {
        const startTime = Date.now();
        let cliOptions: CLIOptions;
        
        try {
          // Validate file option
          if (!options.file) {
            console.error(chalk.red('❌ Error: Vision file is required'));
            console.log(chalk.yellow('\n💡 Usage: keen breath -f <vision-file>'));
            console.log('Examples:');
            console.log('  keen breath -f vision.md');
            console.log('  keen breath -f project-requirements.txt');
            console.log('  keen breath -f ./docs/sprint-goals.md');
            process.exit(1);
          }
          
          // Resolve and validate file path
          const visionFile = path.resolve(options.file);
          validateFile(visionFile);
          
          // Read vision content from file
          let visionContent: string;
          try {
            visionContent = await fs.readFile(visionFile, 'utf-8');
          } catch (error: any) {
            if (error.code === 'ENOENT') {
              console.error(chalk.red(`❌ Vision file not found: ${visionFile}`));
            } else {
              console.error(chalk.red(`❌ Error reading vision file: ${error.message}`));
            }
            process.exit(1);
          }
          
          if (!visionContent.trim()) {
            console.error(chalk.red('❌ Vision file is empty'));
            process.exit(1);
          }
          
          // Parse and validate options
          cliOptions = {
            vision: visionContent.trim(),
            visionFile,
            directory: options.directory,
            phase: options.phase,
            maxIterations: parseInt(options.maxIterations),
            costBudget: parseFloat(options.costBudget),
            webSearch: !options.noWebSearch,
            extendedContext: options.extendedContext || true, // Default true for keen
            dryRun: options.dryRun,
            verbose: command.parent?.opts().verbose || false,
            debug: command.parent?.opts().debug || false,
            stream: options.stream !== false // Default true
          };
          
          // Validate directory
          validateDirectory(cliOptions.directory!);
          
          console.log(chalk.blue('🤖 keen breath - File-based Agent Execution'));
          console.log(chalk.gray(`📁 Vision File: ${path.basename(visionFile)}`));
          console.log(chalk.gray(`📍 Working Directory: ${cliOptions.directory}`));
          console.log(chalk.gray(`📝 Vision Length: ${visionContent.length} characters`));
          console.log(chalk.gray(`⚙️  Phase: ${cliOptions.phase}`));
          console.log('');
          
          // Show vision preview
          console.log(chalk.cyan('🔍 Vision Preview:'));
          const preview = visionContent.substring(0, 300);
          console.log(chalk.white(preview + (visionContent.length > 300 ? '...' : '')));
          console.log('');
          
          // Start progress indicator
          const progressStop = startProgressIndicator('Initializing agent...');
          
          // Create and execute agent
          const agent = new KeenAgent(cliOptions);
          
          const result = await agent.execute();
          
          // Stop progress indicator
          stopProgressIndicator(progressStop);
          
          // Display results
          const duration = Date.now() - startTime;
          console.log(chalk.green('\n✅ Agent execution completed successfully!'));
          console.log(chalk.gray(`⏱️  Duration: ${Math.round(duration / 1000)}s`));
          
          if (result.filesCreated && result.filesCreated.length > 0) {
            console.log(chalk.yellow(`📄 Files created: ${result.filesCreated.length}`));
            result.filesCreated.forEach(file => console.log(chalk.gray(`   - ${file}`)));
          }
          
          if (result.filesModified && result.filesModified.length > 0) {
            console.log(chalk.yellow(`📝 Files modified: ${result.filesModified.length}`));
            result.filesModified.forEach(file => console.log(chalk.gray(`   - ${file}`)));
          }
          
          if (result.summary) {
            console.log(chalk.cyan('\n📋 Summary:'));
            console.log(chalk.white(result.summary));
          }
          
          if (result.nextSteps && result.nextSteps.length > 0) {
            console.log(chalk.magenta('\n🔄 Suggested next steps:'));
            result.nextSteps.forEach((step, i) => 
              console.log(chalk.gray(`   ${i + 1}. ${step}`))
            );
          }
          
        } catch (error: any) {
          console.error(chalk.red('\n❌ Agent execution failed:'));
          console.error(chalk.red(error.message));
          
          if (cliOptions?.debug) {
            console.error(chalk.gray('\nDebug information:'));
            console.error(error.stack);
          }
          
          process.exit(1);
        }
      })
      .addHelpText('after', `\nExamples:\n  keen breath -f vision.md\n  keen breath -f project-requirements.txt\n  keen breath -f ./docs/sprint-goals.md --directory ./backend\n  keen breath -f requirements.txt --max-iterations 150`);
  }
}
