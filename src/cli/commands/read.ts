import { Command } from "commander";
import { ToolManager } from "../../tools/ToolManager";
import {
  validateAndSanitizePaths,
  handleValidationError,
  handleToolError,
} from "../utils/validation";
import { OutputFormatter } from "../utils/output";
import { Logger } from "../../logging/Logger";

export function createReadCommand(): Command {
  return new Command("read")
    .description("Read multiple files and display their contents")
    .argument("<paths...>", "File paths to read")
    .option(
      "--incremental",
      "Read files incrementally (placeholder for future use)"
    )
    .action(async (paths: string[], options: { incremental?: boolean }) => {
      const startTime = Date.now();

      try {
        OutputFormatter.formatHeader("File Reader");

        const sanitizedPaths = validateAndSanitizePaths(paths);
        const toolManager = new ToolManager();

        OutputFormatter.formatSection(`Reading ${sanitizedPaths.length} files`);
        OutputFormatter.formatFileList(sanitizedPaths);

        if (options.incremental) {
          OutputFormatter.formatWarning(
            "Incremental reading not yet implemented, reading all files"
          );
        }

        try {
          const result = await toolManager.executeTool("read_files", {
            paths: sanitizedPaths,
          });
          OutputFormatter.formatToolResult("File Contents", result);
        } catch (error) {
          handleToolError("read_files", error);
        }

        OutputFormatter.formatSuccess("File reading completed successfully");
        OutputFormatter.formatDuration(startTime);
      } catch (error) {
        handleValidationError(error);
      }
    });
}
