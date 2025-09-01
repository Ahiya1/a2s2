/**
 * report_complete Tool
 * Signal that the agent has completed its assigned task with a comprehensive report
 */

import chalk from 'chalk';

export class ReportCompleteTool {
  getDescription(): string {
    return 'Signal that the agent has completed its assigned task with a comprehensive report';
  }
  
  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'A clear summary of what was accomplished'
        },
        success: {
          type: 'boolean',
          description: 'Whether the task was completed successfully'
        },
        filesCreated: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of files that were created during the task'
        },
        filesModified: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of files that were modified during the task'
        },
        testsRun: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of tests or validation steps that were executed'
        },
        validationResults: {
          type: 'array',
          items: { type: 'string' },
          description: 'Results of validation steps performed'
        },
        nextSteps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional suggestions for follow-up work'
        }
      },
      required: ['summary']
    };
  }
  
  async execute(parameters: any, context: any): Promise<any> {
    const {
      summary,
      success = true,
      filesCreated = [],
      filesModified = [],
      testsRun = [],
      validationResults = [],
      nextSteps = []
    } = parameters;
    
    if (!summary || typeof summary !== 'string') {
      throw new Error('summary parameter must be a non-empty string');
    }
    
    // Display completion report to user
    if (!context.dryRun) {
      this.displayCompletionReport({
        summary,
        success,
        filesCreated,
        filesModified,
        testsRun,
        validationResults,
        nextSteps
      });
    }
    
    return {
      success,
      completed: true,
      summary,
      filesCreated,
      filesModified,
      testsRun,
      validationResults,
      nextSteps,
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId
    };
  }
  
  /**
   * Display formatted completion report
   */
  private displayCompletionReport(report: any): void {
    const successColor = report.success ? chalk.green : chalk.red;
    const successEmoji = report.success ? '✅' : '❌';
    const statusText = report.success ? 'COMPLETED SUCCESSFULLY' : 'COMPLETED WITH ISSUES';
    
    console.log('\n' + successColor('='.repeat(60)));
    console.log(successColor(`${successEmoji} TASK ${statusText}`));
    console.log(successColor('='.repeat(60)));
    
    console.log('\n' + chalk.white('📋 Summary: ') + report.summary);
    
    // Files created
    if (report.filesCreated.length > 0) {
      console.log('\n' + chalk.green('🆕 Files Created:'));
      report.filesCreated.forEach((file: string) => 
        console.log(chalk.gray(`  • ${file}`))
      );
    }
    
    // Files modified
    if (report.filesModified.length > 0) {
      console.log('\n' + chalk.yellow('📝 Files Modified:'));
      report.filesModified.forEach((file: string) => 
        console.log(chalk.gray(`  • ${file}`))
      );
    }
    
    // Tests run
    if (report.testsRun.length > 0) {
      console.log('\n' + chalk.blue('🧪 Tests Run:'));
      report.testsRun.forEach((test: string) => 
        console.log(chalk.gray(`  • ${test}`))
      );
    }
    
    // Validation results
    if (report.validationResults.length > 0) {
      console.log('\n' + chalk.cyan('📊 Validation Results:'));
      report.validationResults.forEach((result: string) => 
        console.log(chalk.gray(`  • ${result}`))
      );
    }
    
    // Next steps
    if (report.nextSteps.length > 0) {
      console.log('\n' + chalk.magenta('🔄 Suggested Next Steps:'));
      report.nextSteps.forEach((step: string, index: number) => 
        console.log(chalk.gray(`  ${index + 1}. ${step}`))
      );
    }
    
    // Summary statistics
    console.log('\n' + chalk.white('📊 Summary Statistics:'));
    console.log(chalk.gray(`  • Files Created: ${report.filesCreated.length}`));
    console.log(chalk.gray(`  • Files Modified: ${report.filesModified.length}`));
    console.log(chalk.gray(`  • Tests Run: ${report.testsRun.length}`));
    console.log(chalk.gray(`  • Validation Checks: ${report.validationResults.length}`));
    
    console.log('\n' + successColor('='.repeat(60)));
    
    if (report.success) {
      console.log(successColor('🎉 Task completed successfully! The agent has finished its work.'));
    } else {
      console.log(chalk.red('⚠️  Task completed with issues. Please review the results above.'));
    }
    
    console.log(successColor('='.repeat(60)));
  }
}
