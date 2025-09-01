/**
 * keen Agent Tools - Tool Manager
 * Manages all available tools for Phase 3.1 (all except validation)
 */

import { ToolManagerOptions, ToolSchema, ToolResult, AgentExecutionContext } from '../types.js';
import { GetProjectTreeTool } from './GetProjectTreeTool.js';
import { ReadFilesTool } from './ReadFilesTool.js';
import { WriteFilesTool } from './WriteFilesTool.js';
import { RunCommandTool } from './RunCommandTool.js';
import { WebSearchTool } from './WebSearchTool.js';
import { GitTool } from './GitTool.js';
import { ReportPhaseTool } from './ReportPhaseTool.js';
import { ContinueWorkTool } from './ContinueWorkTool.js';
import { ReportCompleteTool } from './ReportCompleteTool.js';
import chalk from 'chalk';

export class ToolManager {
  private tools: Map<string, any> = new Map();
  private options: ToolManagerOptions;
  
  constructor(options: ToolManagerOptions) {
    this.options = options;
    this.initializeTools();
  }
  
  /**
   * Initialize all available tools for Phase 3.1
   */
  private initializeTools(): void {
    // Foundation Tools
    this.tools.set('get_project_tree', new GetProjectTreeTool());
    this.tools.set('read_files', new ReadFilesTool());
    this.tools.set('write_files', new WriteFilesTool());
    this.tools.set('run_command', new RunCommandTool());
    
    // Web & Information Tools
    if (this.options.enableWebSearch) {
      this.tools.set('web_search', new WebSearchTool());
    }
    
    // Git Tools
    this.tools.set('git', new GitTool());
    
    // Autonomy Tools
    this.tools.set('report_phase', new ReportPhaseTool());
    this.tools.set('continue_work', new ContinueWorkTool());
    this.tools.set('report_complete', new ReportCompleteTool());
    
    // Phase 3.1 exclusions - these tools are NOT available:
    // - validate_project (available in Phase 3.2)
    // - summon_agent (no recursive spawning in Phase 3.1)
    
    if (this.options.debug) {
      console.log(chalk.gray(`Initialized ${this.tools.size} tools for Phase 3.1`));
    }
  }
  
  /**
   * Get all tool schemas for Claude
   */
  getToolSchemas(): ToolSchema[] {
    const schemas: ToolSchema[] = [];
    
    for (const [name, tool] of this.tools) {
      schemas.push({
        name,
        description: tool.getDescription(),
        input_schema: tool.getInputSchema()
      });
    }
    
    return schemas;
  }
  
  /**
   * Get tool descriptions for system prompt
   */
  getToolDescriptions(): { name: string; description: string }[] {
    const descriptions: { name: string; description: string }[] = [];
    
    for (const [name, tool] of this.tools) {
      descriptions.push({
        name,
        description: tool.getDescription()
      });
    }
    
    return descriptions;
  }
  
  /**
   * Execute a tool
   */
  async executeTool(
    toolName: string, 
    parameters: any, 
    context: AgentExecutionContext
  ): Promise<any> {
    const tool = this.tools.get(toolName);
    
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    
    if (this.options.debug) {
      console.log(chalk.blue(`🔧 Executing tool: ${toolName}`));
      console.log(chalk.gray(`Parameters: ${JSON.stringify(parameters, null, 2)}`));
    }
    
    try {
      const startTime = Date.now();
      const result = await tool.execute(parameters, {
        ...context,
        toolManagerOptions: this.options
      });
      const duration = Date.now() - startTime;
      
      if (this.options.debug) {
        console.log(chalk.green(`✅ Tool ${toolName} completed in ${duration}ms`));
      }
      
      return result;
    } catch (error: any) {
      console.error(chalk.red(`❌ Tool ${toolName} failed: ${error.message}`));
      throw error;
    }
  }
  
  /**
   * Check if a tool is available
   */
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }
  
  /**
   * Get list of available tool names
   */
  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }
  
  /**
   * Validate tool parameters against schema
   */
  validateToolParameters(toolName: string, parameters: any): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(toolName);
    
    if (!tool) {
      return { valid: false, errors: [`Unknown tool: ${toolName}`] };
    }
    
    // Basic validation - in a full implementation, this would use JSON schema validation
    const schema = tool.getInputSchema();
    const errors: string[] = [];
    
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (!(requiredField in parameters)) {
          errors.push(`Missing required parameter: ${requiredField}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
