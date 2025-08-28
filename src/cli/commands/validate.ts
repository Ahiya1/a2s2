import { Command } from "commander";
import { ToolManager } from "../../tools/ToolManager";
import { FileValidator } from "../../tools/files/FileValidator";
import {
  validateAndSanitizePaths,
  handleValidationError,
} from "../utils/validation";
import { OutputFormatter } from "../utils/output";
import { Logger } from "../../logging/Logger";

export function createValidateCommand(): Command {
  return new Command("validate")
    .description("Validate tools and file operations")
    .option("--tools", "Validate all registered tools")
    .option("--files <files...>", "Validate specific file paths")
    .action(async (options: { tools?: boolean; files?: string[] }) => {
      const startTime = Date.now();

      try {
        OutputFormatter.formatHeader("Validation");

        if (options.tools) {
          await validateTools();
        }

        if (options.files && options.files.length > 0) {
          await validateFiles(options.files);
        }

        if (!options.tools && !options.files) {
          OutputFormatter.formatInfo(
            "No validation options specified. Use --tools or --files"
          );
          OutputFormatter.formatInfo("Available options:");
          console.log("  --tools          Validate all registered tools");
          console.log("  --files <paths>  Validate specific file paths");
        }

        OutputFormatter.formatDuration(startTime);
      } catch (error) {
        handleValidationError(error);
      }
    });
}

async function validateTools(): Promise<void> {
  OutputFormatter.formatSection("Tool Validation");

  const toolManager = new ToolManager();
  const toolNames = toolManager.getAllToolNames();

  OutputFormatter.formatInfo(`Found ${toolNames.length} registered tools`);
  toolNames.forEach((name) => console.log(`  🔧 ${name}`));

  try {
    const { valid, invalid } = await toolManager.validateTools();

    OutputFormatter.formatSection("Validation Results");

    valid.forEach((toolName) => {
      OutputFormatter.formatValidationResult(toolName, true);
    });

    invalid.forEach((toolName) => {
      OutputFormatter.formatValidationResult(toolName, false);
    });

    if (invalid.length === 0) {
      OutputFormatter.formatSuccess("All tools are valid");
    } else {
      OutputFormatter.formatWarning(
        `${invalid.length} tools failed validation`
      );
    }
  } catch (error) {
    OutputFormatter.formatError(
      `Tool validation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function validateFiles(filePaths: string[]): Promise<void> {
  OutputFormatter.formatSection("File Validation");

  try {
    const sanitizedPaths = validateAndSanitizePaths(filePaths);
    const validator = new FileValidator();

    OutputFormatter.formatInfo(`Validating ${sanitizedPaths.length} files`);
    OutputFormatter.formatFileList(sanitizedPaths);

    const result = await validator.validateMultipleFiles(sanitizedPaths);

    if (result.isValid) {
      OutputFormatter.formatSuccess("All files are valid");
    } else {
      OutputFormatter.formatError("Some files failed validation");
    }

    if (result.errors.length > 0) {
      OutputFormatter.formatSection("Errors");
      result.errors.forEach((error) => console.log(`  ❌ ${error}`));
    }

    if (result.warnings.length > 0) {
      OutputFormatter.formatSection("Warnings");
      result.warnings.forEach((warning) => console.log(`  ⚠️  ${warning}`));
    }
  } catch (error) {
    OutputFormatter.formatError(
      `File validation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
