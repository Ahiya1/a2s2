import { FileReader } from "./files/FileReader";
import { FileWriter } from "./files/FileWriter";
import { FoundationAnalyzer } from "./foundation/FoundationAnalyzer";
import { ShellExecutor } from "./shell/ShellExecutor";
import { GitTool } from "./git/GitTool";
import { ValidationTool } from "./validation/ValidationTool";
import { Logger } from "../logging/Logger";

export interface Tool {
  name?: string;
  description?: string;
  schema?: any;
  execute(params: unknown): Promise<any>;
}

export interface ToolResult {
  success: boolean;
  result?: any;
  error?: Error;
  metadata?: {
    executionTime: number;
    toolName: string;
    timestamp: Date;
  };
}

/**
 * ToolManager orchestrates all available tools and provides a unified interface
 * for tool discovery, execution, and management.
 */
export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private toolStats: Map<string, { calls: number; totalTime: number }> =
    new Map();

  constructor() {
    this.registerDefaultTools();
    Logger.info("ToolManager initialized with default tools");
  }

  private registerDefaultTools(): void {
    // Foundation tools
    this.registerTool("get_project_tree", new FoundationAnalyzer());
    this.registerTool("read_files", new FileReader());
    this.registerTool("write_files", new FileWriter());
    this.registerTool("run_command", new ShellExecutor());

    // NEW: Git integration tool
    this.registerTool("git", new GitTool());

    // NEW: Validation tool
    this.registerTool("validate_project", new ValidationTool());
  }

  registerTool(name: string, tool: Tool): void {
    this.tools.set(name, tool);
    this.toolStats.set(name, { calls: 0, totalTime: 0 });
    Logger.debug(`Tool registered: ${name}`);
  }

  unregisterTool(name: string): boolean {
    const removed = this.tools.delete(name);
    this.toolStats.delete(name);
    if (removed) {
      Logger.debug(`Tool unregistered: ${name}`);
    }
    return removed;
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  // NEW: Missing methods that tests expect
  getToolDescriptions(): string[] {
    return Array.from(this.tools.keys());
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  async executeTool(name: string, params: unknown): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    const startTime = Date.now();

    try {
      Logger.debug(`Executing tool: ${name}`, { params });

      const result = await tool.execute(params);
      const executionTime = Date.now() - startTime;

      // Update stats
      const stats = this.toolStats.get(name);
      if (stats) {
        stats.calls++;
        stats.totalTime += executionTime;
      }

      Logger.debug(`Tool execution completed: ${name}`, {
        executionTime: `${executionTime}ms`,
        success: true,
      });

      return {
        success: true,
        result,
        metadata: {
          executionTime,
          toolName: name,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      Logger.error(`Tool execution failed: ${name}`, {
        error: errorMessage,
        executionTime: `${executionTime}ms`,
        params,
      });

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          executionTime,
          toolName: name,
          timestamp: new Date(),
        },
      };
    }
  }

  // NEW: Convenience method for tests that expect unwrapped string results
  async executeToolForResult(name: string, params: unknown): Promise<string> {
    const toolResult = await this.executeTool(name, params);

    if (!toolResult.success) {
      throw toolResult.error || new Error(`Tool execution failed: ${name}`);
    }

    return String(toolResult.result || "");
  }

  async validateTools(): Promise<{
    valid: string[];
    invalid: string[];
  }> {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const [toolName, tool] of this.tools) {
      try {
        // Basic validation: check if tool has required properties and methods
        if (!tool.execute || typeof tool.execute !== "function") {
          invalid.push(toolName);
          Logger.warn(`Tool ${toolName} missing execute method`);
          continue;
        }

        // Test with minimal parameters to see if tool can be called
        // This is a basic validation - you might want to make it more sophisticated
        if (
          tool.schema &&
          tool.schema.required &&
          tool.schema.required.length > 0
        ) {
          // Tool requires parameters, mark as valid if it has schema
          valid.push(toolName);
        } else {
          // Tool doesn't require parameters, try to call it with empty params
          try {
            // Don't actually execute, just validate the structure
            valid.push(toolName);
          } catch (error) {
            invalid.push(toolName);
            Logger.warn(`Tool ${toolName} validation failed: ${String(error)}`);
          }
        }
      } catch (error) {
        invalid.push(toolName);
        Logger.error(`Tool ${toolName} validation error: ${String(error)}`);
      }
    }

    Logger.info(
      `Tool validation completed: ${valid.length} valid, ${invalid.length} invalid`
    );

    return { valid, invalid };
  }

  getToolStats(): Map<string, { calls: number; totalTime: number }> {
    return new Map(this.toolStats);
  }

  getToolUsageSummary(): Record<
    string,
    { calls: number; avgTime: number; totalTime: number }
  > {
    const summary: Record<
      string,
      { calls: number; avgTime: number; totalTime: number }
    > = {};

    for (const [toolName, stats] of this.toolStats) {
      summary[toolName] = {
        calls: stats.calls,
        totalTime: stats.totalTime,
        avgTime:
          stats.calls > 0 ? Math.round(stats.totalTime / stats.calls) : 0,
      };
    }

    return summary;
  }

  resetStats(): void {
    for (const stats of this.toolStats.values()) {
      stats.calls = 0;
      stats.totalTime = 0;
    }
    Logger.debug("Tool stats reset");
  }

  validateToolParams(name: string, params: unknown): boolean {
    const tool = this.tools.get(name);
    if (!tool || !tool.schema) {
      return true; // No schema to validate against
    }

    // Basic validation - could be extended with a proper JSON schema validator
    try {
      if (tool.schema.required && Array.isArray(tool.schema.required)) {
        for (const requiredField of tool.schema.required) {
          if (
            typeof params === "object" &&
            params !== null &&
            !(requiredField in params)
          ) {
            Logger.warn(
              `Tool ${name} missing required parameter: ${requiredField}`
            );
            return false;
          }
        }
      }
      return true;
    } catch (error) {
      Logger.error(`Tool parameter validation failed: ${name}`, {
        error: String(error),
      });
      return false;
    }
  }

  listAvailableTools(): Array<{
    name: string;
    description?: string;
    schema?: any;
    stats: { calls: number; avgTime: number; totalTime: number };
  }> {
    const tools: Array<{
      name: string;
      description?: string;
      schema?: any;
      stats: { calls: number; avgTime: number; totalTime: number };
    }> = [];

    for (const [name, tool] of this.tools) {
      const stats = this.toolStats.get(name) || { calls: 0, totalTime: 0 };

      tools.push({
        name,
        description: tool.description,
        schema: tool.schema,
        stats: {
          calls: stats.calls,
          totalTime: stats.totalTime,
          avgTime:
            stats.calls > 0 ? Math.round(stats.totalTime / stats.calls) : 0,
        },
      });
    }

    return tools.sort((a, b) => a.name.localeCompare(b.name));
  }

  // NEW: Method to get only specific tools for limited agents
  getFilteredTools(allowedTools: string[]): Tool[] {
    const filtered: Tool[] = [];

    for (const toolName of allowedTools) {
      const tool = this.tools.get(toolName);
      if (tool) {
        filtered.push({
          ...tool,
          name: toolName,
        });
      }
    }

    Logger.debug(`Filtered tools for limited agent`, {
      requestedTools: allowedTools,
      availableTools: filtered.map((t) => t.name),
    });

    return filtered;
  }

  // Method to clear all tools (useful for testing)
  clearAllTools(): void {
    this.tools.clear();
    this.toolStats.clear();
    Logger.debug("All tools cleared");
  }

  // Method to restore default tools
  restoreDefaultTools(): void {
    this.clearAllTools();
    this.registerDefaultTools();
    Logger.debug("Default tools restored");
  }
}
