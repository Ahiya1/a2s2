import { FoundationAnalyzer } from "./foundation/FoundationAnalyzer";
import { FileReader } from "./files/FileReader";
import { FileWriter } from "./files/FileWriter";
import { FileValidator } from "./files/FileValidator";
import { ShellExecutor } from "./shell/ShellExecutor";
import { Logger } from "../logging/Logger";

export interface Tool {
  name?: string;
  description?: string;
  schema?: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
  execute(params: unknown): Promise<string>;
}

export interface EnhancedTool extends Tool {
  name: string;
  description: string;
  schema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
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

    // Enhance the tool with name and description if not present
    if (!tool.name) {
      tool.name = name;
    }

    if (!tool.description) {
      tool.description = this.getDefaultDescription(name);
    }

    if (!tool.schema) {
      tool.schema = this.getDefaultSchema(name);
    }

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

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
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

  private getDefaultDescription(name: string): string {
    const descriptions: Record<string, string> = {
      get_project_tree:
        "Analyze project structure using tree command with intelligent exclusions",
      read_files:
        "Read multiple files and return their contents with error handling",
      write_files: "Write multiple files atomically with rollback protection",
      run_command: "Execute shell commands with timeout and error handling",
      web_search:
        "Search the web for current information, documentation, and best practices",
      report_phase:
        "Report current phase of execution and provide status updates",
      report_complete:
        "Signal task completion with comprehensive summary report",
      continue_work: "Indicate continuation of work with detailed next steps",
    };

    return descriptions[name] || `Execute ${name} tool`;
  }

  private getDefaultSchema(name: string): any {
    const schemas: Record<string, any> = {
      get_project_tree: {
        type: "object",
        properties: {
          path: { type: "string", description: "Project path to analyze" },
        },
        required: [],
      },
      read_files: {
        type: "object",
        properties: {
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Array of file paths to read",
          },
        },
        required: ["paths"],
      },
      write_files: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "File path" },
                content: { type: "string", description: "File content" },
              },
              required: ["path", "content"],
            },
            description: "Array of files to write",
          },
        },
        required: ["files"],
      },
      run_command: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          timeout: { type: "number", description: "Timeout in milliseconds" },
        },
        required: ["command"],
      },
    };

    return (
      schemas[name] || {
        type: "object",
        properties: {},
        required: [],
      }
    );
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
