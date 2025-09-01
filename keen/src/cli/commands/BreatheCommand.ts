/**
 * keen breathe '<vision>' Command
 * Autonomous agent execution with vision-driven task completion
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { KeenAgent } from '../../agent/KeenAgent.js';
import { CLIOptions } from '../types.js';
import { validateVision, validateDirectory } from '../utils/validation.js';
import { startProgressIndicator, stopProgressIndicator } from '../utils/progress.js';

/**
 * Expand short commands to meaningful visions
 */
function expandShortCommand(vision: string): string {
  const shortCommands: Record<string, string> = {
    'create': 'Create a new project with modern development setup including TypeScript, testing framework, linting, and proper project structure',
    'init': 'Initialize a new development project with essential files and configuration',
    'setup': 'Set up a development environment with all necessary tools and dependencies',
    'scaffold': 'Generate project scaffolding with best practices and modern tooling',
    'bootstrap': 'Bootstrap a new application with complete development setup',
    'new': 'Create a new project from scratch with modern development standards'
  };
  
  const normalizedVision = vision.trim().toLowerCase();
  
  if (shortCommands[normalizedVision]) {
    return shortCommands[normalizedVision];
  }
  
  return vision;
}

export class BreatheCommand {
  constructor(program: Command) {
    program
      .command('breathe')
      .argument('<vision>', 'Vision statement for autonomous task execution')
      .description('Execute autonomous agent with vision-driven task completion')
      .option('--directory <dir>', 'Working directory for the agent', process.cwd())
      .option('--phase <phase>', 'Starting phase: EXPLORE, SUMMON, or COMPLETE', 'EXPLORE')
      .option('--max-iterations <num>', 'Maximum conversation iterations', '100')
      .option('--cost-budget <amount>', 'Maximum cost budget in USD', '50.00')
      .option('--no-web-search', 'Disable web search capability')
      .option('--extended-context', 'Enable 1M token context window')
      .option('--dry-run', 'Plan execution without making changes')
      .option('--stream', 'Enable real-time streaming output')
      .action(async (vision: string, options: any, command: Command) => {
        const startTime = Date.now();
        let cliOptions: CLIOptions;
        
        try {
          // Expand short commands to meaningful visions
          const expandedVision = expandShortCommand(vision);
          const wasExpanded = expandedVision !== vision;
          
          // Parse and validate options
          cliOptions = {
            vision: expandedVision,
            directory: options.directory,
            phase: options.phase,
            maxIterations: parseInt(options.maxIterations),
            costBudget: parseFloat(options.costBudget),
            webSearch: !options.noWebSearch,
            extendedContext: options.extendedContext || true, // Default true for keen
            dryRun: options.dryRun,
            verbose: command.parent?.opts().verbose || false,
            debug: command.parent?.opts().debug || false,
            stream: options.stream !== false, // Default true
            visionFile: undefined
          };
          
          // Validate inputs
          validateVision(expandedVision, 'command argument');
          validateDirectory(cliOptions.directory!);
          
          console.log(chalk.blue('🤖 keen breathe - Autonomous Agent Execution'));
          console.log(chalk.gray(`📍 Working Directory: ${cliOptions.directory}`));
          
          if (wasExpanded) {
            console.log(chalk.yellow(`🔄 Expanded '${vision}' to:`));
            console.log(chalk.gray(`🎯 Vision: ${expandedVision}`));
          } else {
            console.log(chalk.gray(`🎯 Vision: ${expandedVision.substring(0, 100)}${expandedVision.length > 100 ? '...' : ''}`));
          }
          
          console.log(chalk.gray(`⚙️  Phase: ${cliOptions.phase}`));
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
      .addHelpText('after', `\nExamples:\n  keen breathe "Create a React todo app with TypeScript"\n  keen breathe "Fix the database connection issues" --directory ./backend\n  keen breathe "Add authentication system" --max-iterations 150\n  keen breathe "Optimize API performance" --cost-budget 75.00\n\nShort Commands:\n  keen breathe create      # Creates a new project with modern setup\n  keen breathe init        # Initializes a development project\n  keen breathe setup       # Sets up development environment\n  keen breathe scaffold    # Generates project scaffolding`);
  }
}
