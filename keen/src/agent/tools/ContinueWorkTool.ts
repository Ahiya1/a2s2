/**
 * continue_work Tool
 * Indicate that the agent will continue working on the current task with details about the next steps
 */

import chalk from 'chalk';

export class ContinueWorkTool {
  getDescription(): string {
    return 'Indicate that the agent will continue working on the current task with details about the next steps';
  }
  
  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        nextAction: {
          type: 'string',
          description: 'Clear description of what the agent will do next'
        },
        reasoning: {
          type: 'string',
          description: 'Optional reasoning behind the chosen next action'
        },
        estimatedDuration: {
          type: 'string',
          description: 'Estimated time to complete the next action (e.g., \'5 minutes\', \'2 steps\')'
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dependencies that must be met before proceeding'
        },
        risks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Potential risks or issues with the planned action'
        },
        requiresUserInput: {
          type: 'boolean',
          description: 'Whether the next action requires user input or intervention'
        }
      },
      required: ['nextAction']
    };
  }
  
  async execute(parameters: any, context: any): Promise<any> {
    const {
      nextAction,
      reasoning,
      estimatedDuration,
      dependencies = [],
      risks = [],
      requiresUserInput = false
    } = parameters;
    
    if (!nextAction || typeof nextAction !== 'string') {
      throw new Error('nextAction parameter must be a non-empty string');
    }
    
    // Display continuation plan to user
    if (!context.dryRun) {
      this.displayContinuationPlan({
        nextAction,
        reasoning,
        estimatedDuration,
        dependencies,
        risks,
        requiresUserInput
      });
    }
    
    return {
      success: true,
      continuing: true,
      nextAction,
      reasoning,
      estimatedDuration,
      dependencies,
      risks,
      requiresUserInput,
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId
    };
  }
  
  /**
   * Display formatted continuation plan
   */
  private displayContinuationPlan(plan: any): void {
    console.log('\n' + chalk.blue('🔄 CONTINUING WORK'));
    console.log(chalk.blue('='.repeat(50)));
    
    console.log('\n' + chalk.white('🎯 Next Action: ') + plan.nextAction);
    
    if (plan.reasoning) {
      console.log(chalk.gray('🧠 Reasoning: ') + plan.reasoning);
    }
    
    if (plan.estimatedDuration) {
      console.log(chalk.yellow('⏱️  Estimated Duration: ') + plan.estimatedDuration);
    }
    
    if (plan.dependencies && plan.dependencies.length > 0) {
      console.log('\n' + chalk.cyan('🔗 Dependencies:'));
      plan.dependencies.forEach((dep: string) => 
        console.log(chalk.gray(`  • ${dep}`))
      );
    }
    
    if (plan.risks && plan.risks.length > 0) {
      console.log('\n' + chalk.red('⚠️  Potential Risks:'));
      plan.risks.forEach((risk: string) => 
        console.log(chalk.gray(`  • ${risk}`))
      );
    }
    
    if (plan.requiresUserInput) {
      console.log('\n' + chalk.magenta('💬 User Input Required: ') + 'Yes');
      console.log(chalk.gray('The agent will pause and wait for user input before proceeding.'));
    }
    
    console.log('\n' + chalk.gray('🤖 The agent will continue working autonomously...'));
    console.log(chalk.blue('='.repeat(50)));
  }
}
