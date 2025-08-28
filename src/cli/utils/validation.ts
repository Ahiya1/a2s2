import { InputValidator } from "../../validation/InputValidator";
import { Logger } from "../../logging/Logger";

export function validateAndSanitizePath(path: string): string {
  try {
    return InputValidator.validateFilePath(path);
  } catch (error) {
    Logger.error(`Path validation failed`, { path, error: String(error) });
    throw error;
  }
}

export function validateAndSanitizePaths(paths: string[]): string[] {
  try {
    return InputValidator.validateFilePaths(paths);
  } catch (error) {
    Logger.error(`Paths validation failed`, { paths, error: String(error) });
    throw error;
  }
}

export function handleValidationError(error: unknown): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  Logger.error(`Validation error: ${errorMessage}`);
  console.error(`Error: ${errorMessage}`);
  process.exit(1);
}

export function handleToolError(toolName: string, error: unknown): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  Logger.error(`Tool execution failed`, {
    tool: toolName,
    error: errorMessage,
  });
  console.error(`Tool '${toolName}' failed: ${errorMessage}`);
  process.exit(1);
}
