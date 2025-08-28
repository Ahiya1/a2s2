import { Command } from "commander";
import { ToolManager } from "../../tools/ToolManager";
import {
  validateAndSanitizePath,
  handleValidationError,
  handleToolError,
} from "../utils/validation";
import { OutputFormatter } from "../utils/output";
import { Logger } from "../../logging/Logger";

export function createAnalyzeCommand(): Command {
  return new Command("analyze")
    .description("Analyze project foundation and structure")
    .argument("<path>", "Project path to analyze")
    .option("--foundation", "Run foundation analysis using tree command")
    .action(async (path: string, options: { foundation?: boolean }) => {
      const startTime = Date.now();

      try {
        OutputFormatter.formatHeader("Project Analysis");

        const sanitizedPath = validateAndSanitizePath(path);
        const toolManager = new ToolManager();

        if (options.foundation) {
          OutputFormatter.formatSection("Foundation Analysis");

          try {
            const result = await toolManager.executeTool("get_project_tree", {
              path: sanitizedPath,
            });
            OutputFormatter.formatToolResult("Foundation Analyzer", result);
          } catch (error) {
            handleToolError("get_project_tree", error);
          }
        } else {
          // Default: run foundation analysis
          OutputFormatter.formatInfo("Running default foundation analysis");

          try {
            const result = await toolManager.executeTool("get_project_tree", {
              path: sanitizedPath,
            });
            OutputFormatter.formatToolResult("Project Structure", result);
          } catch (error) {
            handleToolError("get_project_tree", error);
          }
        }

        OutputFormatter.formatSuccess("Analysis completed successfully");
        OutputFormatter.formatDuration(startTime);
      } catch (error) {
        handleValidationError(error);
      }
    });
}
