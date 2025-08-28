import { z } from "zod";
import {
  AnalyzeCommandSchema,
  ReadCommandSchema,
  ValidateCommandSchema,
  AnalyzeCommandInput,
  ReadCommandInput,
  ValidateCommandInput,
} from "./schemas/InputSchemas";

export class InputValidator {
  static validateAnalyzeCommand(input: unknown): AnalyzeCommandInput {
    try {
      return AnalyzeCommandSchema.parse(input);
    } catch (error) {
      throw new Error(
        `Invalid analyze command input: ${error instanceof z.ZodError ? error.issues.map((i) => i.message).join(", ") : String(error)}`
      );
    }
  }

  static validateReadCommand(input: unknown): ReadCommandInput {
    try {
      return ReadCommandSchema.parse(input);
    } catch (error) {
      throw new Error(
        `Invalid read command input: ${error instanceof z.ZodError ? error.issues.map((i) => i.message).join(", ") : String(error)}`
      );
    }
  }

  static validateValidateCommand(input: unknown): ValidateCommandInput {
    try {
      return ValidateCommandSchema.parse(input);
    } catch (error) {
      throw new Error(
        `Invalid validate command input: ${error instanceof z.ZodError ? error.issues.map((i) => i.message).join(", ") : String(error)}`
      );
    }
  }

  static validateFilePath(filePath: string): string {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("File path must be a non-empty string");
    }

    if (filePath.trim().length === 0) {
      throw new Error("File path cannot be empty or whitespace only");
    }

    // Basic security check
    if (filePath.includes("../") || filePath.includes("..\\")) {
      throw new Error("File path cannot contain directory traversal patterns");
    }

    return filePath.trim();
  }

  static validateFilePaths(filePaths: string[]): string[] {
    if (!Array.isArray(filePaths)) {
      throw new Error("File paths must be an array");
    }

    if (filePaths.length === 0) {
      throw new Error("At least one file path is required");
    }

    return filePaths.map((path) => this.validateFilePath(path));
  }
}
