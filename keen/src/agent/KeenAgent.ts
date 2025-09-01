/**
 * keen Agent Core - Main Agent Implementation
 * Phase 3.1: All tools except validation, no recursive spawning
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { CLIOptions, AgentResult } from '../cli/types.js';
import { ToolManager } from './tools/ToolManager.js';
import { AgentSession } from './AgentSession.js';
import { AnthropicConfigManager, KEEN_DEFAULT_CONFIG } from '../config/AnthropicConfig.js';
import { AgentPhase, AgentExecutionContext } from './types.js';
import chalk from 'chalk';

export class KeenAgent {
  private options: CLIOptions;
  private anthropic: Anthropic;
  private configManager: AnthropicConfigManager;
  private toolManager: ToolManager;
  private session: AgentSession;
  private currentPhase: AgentPhase = 'EXPLORE';
  
  constructor(options: CLIOptions) {
    this.options = options;
    
    // Initialize Anthropic with keen configuration
    this.configManager = new AnthropicConfigManager({
      ...KEEN_DEFAULT_CONFIG,
      enableExtendedContext: options.extendedContext || true,
      enableInterleaved: true,
      enableWebSearch: options.webSearch !== false,
      enableStreaming: options.stream !== false
    });
    
    // Validate API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    
    this.anthropic = new Anthropic({
      apiKey,
      maxRetries: 3,
      timeout: 60000 // 60 second timeout
    });
    
    // Initialize tool manager
    this.toolManager = new ToolManager({
      workingDirectory: options.directory || process.cwd(),
      enableWebSearch: options.webSearch !== false,
      debug: options.debug || false
    });
    
    // Initialize session
    this.session = new AgentSession({
      sessionId: this.generateSessionId(),
      vision: options.vision,
      workingDirectory: options.directory || process.cwd(),
      visionFile: options.visionFile,
      anthropicConfig: this.configManager.getConfig(),
      dryRun: options.dryRun || false,
      verbose: options.verbose || false,
      debug: options.debug || false
    });
  }
  
  /**
   * Execute the autonomous agent
   */
  async execute(): Promise<AgentResult> {
    const startTime = Date.now();
    
    try {
      if (this.options.verbose) {
        console.log(chalk.blue('\n🚀 Starting keen agent execution...'));
        console.log(chalk.gray(`Session ID: ${this.session.getSessionId()}`));
        console.log(chalk.gray(`Vision: ${this.options.vision.substring(0, 100)}...`));
        console.log(chalk.gray(`Working Directory: ${this.options.directory}`));
        console.log(chalk.gray(`Max Iterations: ${this.options.maxIterations}`));
      }
      
      // Start session
      await this.session.start();
      
      // Build initial system prompt
      const systemPrompt = this.buildSystemPrompt();
      
      // Build initial message with vision
      const visionMessage = this.buildVisionMessage();
      
      let messages: any[] = [
        {
          role: 'user',
          content: visionMessage
        }
      ];
      
      let iterationCount = 0;
      const maxIterations = this.options.maxIterations || 100;
      
      // Main execution loop
      while (iterationCount < maxIterations) {
        iterationCount++;
        
        if (this.options.verbose) {
          console.log(chalk.cyan(`\n--- Iteration ${iterationCount} (Phase: ${this.currentPhase}) ---`));
        }
        
        try {
          // Call Claude with current context
          const response = await this.callClaude(systemPrompt, messages);
          
          // Add assistant's response to message history
          messages.push({
            role: 'assistant',
            content: response.content
          });
          
          // Process the response and execute any tools
          const result = await this.processResponse(response);
          
          // Check if agent is done
          if (result.completed) {
            if (this.options.verbose) {
              console.log(chalk.green('✅ Agent reported completion'));
            }
            
            return await this.buildFinalResult(startTime, result.result);
          }
          
          // Add tool results to messages if any were executed
          if (result.toolResults && result.toolResults.length > 0) {
            const toolResultContent = result.toolResults.map(toolResult => {
              if (toolResult.error) {
                return {
                  type: 'tool_result',
                  tool_use_id: toolResult.tool_use_id,
                  is_error: true,
                  content: `Error: ${toolResult.error}`
                };
              } else {
                return {
                  type: 'tool_result',
                  tool_use_id: toolResult.tool_use_id,
                  content: JSON.stringify(toolResult.result, null, 2)
                };
              }
            });
            
            // Add user message with tool results
            messages.push({
              role: 'user',
              content: toolResultContent
            });
          }
          
        } catch (error: any) {
          console.error(chalk.red(`Error in iteration ${iterationCount}: ${error.message}`));
          
          if (this.options.debug) {
            console.error(error.stack);
          }
          
          // Add error to context and continue
          messages.push({
            role: 'user',
            content: `Error occurred: ${error.message}. Please adjust your approach and continue.`
          });
        }
      }
      
      // If we reach here, max iterations exceeded
      console.log(chalk.yellow(`⚠️  Maximum iterations (${maxIterations}) reached`));
      
      return await this.buildFinalResult(startTime, {
        success: false,
        summary: `Agent execution stopped after ${maxIterations} iterations without completion`,
        error: 'Maximum iterations exceeded'
      });
      
    } catch (error: any) {
      console.error(chalk.red('❌ Fatal error during agent execution:'));
      console.error(error.message);
      
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }
  
  /**
   * Build the system prompt for the agent
   */
  private buildSystemPrompt(): string {
    const tools = this.toolManager.getToolDescriptions();
    
    return `You are a keen autonomous development agent with complete control over this development session.

TASK: ${this.options.vision}
WORKING DIRECTORY: ${this.options.directory}
CURRENT PHASE: ${this.currentPhase}

AUTONOMOUS OPERATION PROTOCOL:
1. You drive this conversation completely - no external prompts will be provided
2. Continue working until the task is fully completed
3. Use tools to understand your environment and implement solutions
4. Signal completion when finished using the report_complete tool
5. Request help if stuck using appropriate tools

THREE-PHASE LIFECYCLE:
- EXPLORE: Understand the current project state and requirements
  • Use get_project_tree to analyze structure
  • Use read_files to examine key files
  • Use web_search for current best practices
  • Plan your implementation approach

- SUMMON: Create specialists for complex tasks (Phase 2 feature - skip for now)
  • Assess if task requires specialist coordination
  • For Phase 1B, work independently

- COMPLETE: Implement, test, and finalize the solution
  • Use write_files to implement changes
  • Use run_command to test your work
  • Validate requirements are met
  • Call report_complete when finished

AVAILABLE TOOLS:
${tools.map(tool => `${tool.name}: ${tool.description}`).join('\n')}

REMEMBER:
- You are completely autonomous - drive the conversation forward
- Use tools actively to understand and modify the environment
- Progress through phases systematically
- Signal completion with report_complete when the task is done
- All file operations are relative to the working directory
- You have access to 1M context window - use it effectively

Begin autonomous execution now. Start by exploring the project structure and understanding your task.`;
  }
  
  /**
   * Build the vision message
   */
  private buildVisionMessage(): string {
    let message = `I need you to autonomously complete this development task:\n\n${this.options.vision}`;
    
    if (this.options.visionFile) {
      message += `\n\nThis vision was loaded from: ${this.options.visionFile}`;
    }
    
    message += `\n\nPlease start by exploring the current project structure and then proceed with implementation.`;
    
    return message;
  }
  
  /**
   * Call Claude API
   */
  private async callClaude(systemPrompt: string, messages: any[]): Promise<any> {
    const config = this.configManager.getConfig();
    
    try {
      const response = await this.anthropic.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        messages,
        system: systemPrompt,
        tools: this.toolManager.getToolSchemas()
      });
      
      return response;
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY environment variable.');
      }
      
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }
      
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }
  
  /**
   * Process Claude's response and handle tool calls
   */
  private async processResponse(response: any): Promise<{
    completed: boolean;
    result?: any;
    toolResults?: any[];
  }> {
    const toolResults: any[] = [];
    
    // Check for tool use in response
    if (response.content && Array.isArray(response.content)) {
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          try {
            const toolResult = await this.toolManager.executeTool(
              block.name,
              block.input,
              {
                sessionId: this.session.getSessionId(),
                workingDirectory: this.options.directory!,
                dryRun: this.options.dryRun || false,
                verbose: this.options.verbose || false
              }
            );
            
            toolResults.push({
              tool_use_id: block.id,
              result: toolResult
            });
            
            // Check if this was a completion signal
            if (block.name === 'report_complete') {
              return {
                completed: true,
                result: toolResult,
                toolResults
              };
            }
            
            // Check for phase transitions
            if (block.name === 'report_phase') {
              this.currentPhase = toolResult.phase || this.currentPhase;
            }
            
          } catch (error: any) {
            console.error(chalk.red(`Tool execution error (${block.name}): ${error.message}`));
            
            toolResults.push({
              tool_use_id: block.id,
              error: error.message
            });
          }
        }
      }
    }
    
    return {
      completed: false,
      toolResults
    };
  }
  
  /**
   * Build final result
   */
  private async buildFinalResult(startTime: number, result?: any): Promise<AgentResult> {
    const duration = Date.now() - startTime;
    
    return {
      success: result?.success !== false,
      summary: result?.summary,
      filesCreated: result?.filesCreated || [],
      filesModified: result?.filesModified || [],
      nextSteps: result?.nextSteps || [],
      testsRun: result?.testsRun || [],
      validationResults: result?.validationResults || [],
      duration,
      totalCost: 0, // TODO: Calculate actual cost
      error: result?.error
    };
  }
  
  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `session_${timestamp}_${random}`;
  }
}
