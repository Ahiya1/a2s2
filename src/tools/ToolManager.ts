import { FoundationAnalyzer } from "./foundation/FoundationAnalyzer";
import { FileReader } from "./files/FileReader";
import { FileWriter } from "./files/FileWriter";
import { FileValidator } from "./files/FileValidator";
import { ShellExecutor } from "./shell/ShellExecutor";
import { Logger } from "../logging/Logger";

export interface Tool {
  execute(params: unknown): Promise<string>;
}

export class ToolManager {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    this.registerTool("get_project_tree", new FoundationAnalyzer());
    this.registerTool("read_files", new FileReader());
    this.registerTool("write_files", new FileWriter());
    this.registerTool("run_command", new ShellExecutor());
  }

  registerTool(name: string, tool: Tool): void {
    Logger.info(`Registering tool: ${name}`);
    this.tools.set(name, tool);
  }

  async executeTool(name: string, params: unknown): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      const availableTools = Array.from(this.tools.keys()).join(", ");
      throw new Error(
        `Tool '${name}' not found. Available tools: ${availableTools}`
      );
    }

    Logger.info(`Executing tool: ${name}`, { params });

    try {
      const result = await tool.execute(params);
      Logger.info(`Tool execution completed: ${name}`);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error(`Tool execution failed: ${name}`, { error: errorMessage });
      throw new Error(`Tool '${name}' execution failed: ${errorMessage}`);
    }
  }

  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getToolDescriptions(): string {
    const descriptions = [
      "get_project_tree: Analyze project structure using tree command",
      "read_files: Read multiple files and return their contents",
      "write_files: Write multiple files atomically with rollback support",
      "run_command: Execute shell commands with timeout protection",
    ];

    return descriptions.join("\n");
  }

  async validateTools(): Promise<{ valid: string[]; invalid: string[] }> {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const [name, tool] of this.tools) {
      try {
        // Basic validation - try to execute with minimal params
        if (name === "get_project_tree") {
          await tool.execute({ path: "." });
          valid.push(name);
        } else if (name === "read_files") {
          // Skip actual execution for read_files in validation
          valid.push(name);
        } else if (name === "write_files") {
          // Skip actual execution for write_files in validation
          valid.push(name);
        } else if (name === "run_command") {
          await tool.execute({ command: 'echo "validation test"' });
          valid.push(name);
        } else {
          valid.push(name); // Assume valid if we don't know how to test
        }
      } catch (error) {
        Logger.warn(`Tool validation failed: ${name}`, {
          error: String(error),
        });
        invalid.push(name);
      }
    }

    return { valid, invalid };
  }
}
