import {
  FoundationAnalyzerSchema,
  FoundationAnalyzerParams,
} from "../schemas/ToolSchemas";
import { ShellExecutor } from "../shell/ShellExecutor";
import { Logger } from "../../logging/Logger";

export class FoundationAnalyzer {
  private shellExecutor: ShellExecutor;

  constructor() {
    this.shellExecutor = new ShellExecutor();
  }

  async execute(params: unknown): Promise<string> {
    const validatedParams = this.validateParams(params);
    return this.get_project_tree(validatedParams);
  }

  async get_project_tree(params: FoundationAnalyzerParams): Promise<string> {
    const projectPath = params.path || process.cwd();

    Logger.info(`Analyzing project structure`, { path: projectPath });

    try {
      // Try tree command without --gitignore first, then with basic exclusions
      const command = `tree -a -I "node_modules|.git|dist|build|coverage" -L 3 "${projectPath}"`;

      const result = await this.shellExecutor.run_command({
        command,
        timeout: 10000,
      });

      Logger.info(`Project tree analysis completed`, {
        path: projectPath,
        outputSize: result.length,
      });

      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error(`Failed to analyze project structure`, {
        path: projectPath,
        error: errorMessage,
      });

      // Fallback: if tree command fails, provide basic directory listing
      try {
        const fallbackCommand = `find "${projectPath}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | head -50`;
        const fallbackResult = await this.shellExecutor.run_command({
          command: fallbackCommand,
          timeout: 5000,
        });

        Logger.warn(`Using fallback directory listing`, { path: projectPath });
        return `Project structure (fallback listing):\n${fallbackResult}`;
      } catch (fallbackError) {
        throw new Error(
          `Both tree command and fallback failed: ${errorMessage}`
        );
      }
    }
  }

  private validateParams(params: unknown): FoundationAnalyzerParams {
    try {
      return FoundationAnalyzerSchema.parse(params);
    } catch (error) {
      throw new Error(
        `Invalid foundation analyzer parameters: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
