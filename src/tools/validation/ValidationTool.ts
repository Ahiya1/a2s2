import { exec } from "child_process";
import { promisify } from "util";
import {
  ValidationToolSchema,
  ValidationToolParams,
  ValidationResult,
  ValidationError,
  defaultValidationCommands,
  fixableValidationCommands,
} from "../schemas/ToolSchemas";
import { Logger } from "../../logging/Logger";
import { ConfigManager } from "../../config/ConfigManager";
import * as path from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

export class ValidationTool {
  async execute(params: unknown): Promise<string> {
    const validatedParams = this.validateParams(params);
    return this.executeValidation(validatedParams);
  }

  private async executeValidation(
    params: ValidationToolParams
  ): Promise<string> {
    const { type, options = {} } = params;
    const config = ConfigManager.getConfig();
    const timeout = options.timeout || config.commandTimeout;
    const workingDir = options.directory || process.cwd();

    Logger.info(`Executing validation: ${type}`, {
      type,
      options,
      workingDir,
      timeout,
    });

    const startTime = Date.now();

    try {
      // Build validation command
      const command = await this.buildValidationCommand(
        type,
        options,
        workingDir
      );

      Logger.debug(`Running validation command: ${command}`, {
        type,
        workingDir,
      });

      // Execute validation command
      let rawOutput: string;
      let success = true;
      let executionError: Error | null = null;

      try {
        const result = await execAsync(command, {
          timeout,
          encoding: "utf8",
          cwd: workingDir,
        });
        rawOutput = result.stdout + (result.stderr || "");
      } catch (error) {
        executionError = error as Error;
        const execError = error as any;
        rawOutput = (execError.stdout || "") + (execError.stderr || "");
        success = execError.code === 0; // Some tools use non-zero exit codes for warnings
      }

      // Parse validation output
      const validationResult = await this.parseValidationOutput(
        type,
        rawOutput,
        success,
        command,
        Date.now() - startTime,
        workingDir
      );

      // Attempt automatic fixes if requested and possible
      if (options.fix && !validationResult.success && this.canAutoFix(type)) {
        const fixResult = await this.attemptAutoFix(type, options, workingDir);
        validationResult.rawOutput += "\n\nAuto-fix attempt:\n" + fixResult;
      }

      Logger.info(`Validation completed: ${type}`, {
        success: validationResult.success,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length,
        executionTime: validationResult.executionTime,
      });

      return this.formatValidationResult(validationResult);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error(`Validation failed: ${type}`, {
        error: errorMessage,
        workingDir,
      });

      // Return structured error result
      const errorResult: ValidationResult = {
        type,
        success: false,
        errors: [
          {
            message: errorMessage,
            severity: "error" as const,
            type: "custom" as const,
          },
        ],
        warnings: [],
        summary: {
          totalFiles: 0,
          filesWithErrors: 1,
          filesWithWarnings: 0,
          totalErrors: 1,
          totalWarnings: 0,
          fixableIssues: 0,
        },
        command: "failed to execute",
        executionTime: Date.now() - startTime,
        rawOutput: errorMessage,
      };

      return this.formatValidationResult(errorResult);
    }
  }

  private async buildValidationCommand(
    type: string,
    options: any,
    workingDir: string
  ): Promise<string> {
    // Use custom command if provided
    if (options.command) {
      return options.command;
    }

    // Get base command for validation type
    let baseCommand = defaultValidationCommands[type];
    if (!baseCommand) {
      throw new Error(`No default command for validation type: ${type}`);
    }

    // Apply auto-fix if requested and available
    if (options.fix && fixableValidationCommands[type]) {
      baseCommand = fixableValidationCommands[type];
    }

    // Modify command based on options
    let command = baseCommand;

    // Add specific files if provided
    if (options.files) {
      const files = Array.isArray(options.files)
        ? options.files.join(" ")
        : options.files;
      command += ` ${files}`;
    }

    // Add config file if provided
    if (options.config) {
      if (type === "eslint") {
        command += ` -c ${options.config}`;
      } else if (type === "format") {
        command += ` --config ${options.config}`;
      }
    }

    // Add format option if provided
    if (options.format && type === "eslint") {
      command += ` --format ${options.format}`;
    }

    // Add strict mode if requested
    if (options.strict) {
      if (type === "typescript") {
        command += " --strict";
      }
    }

    // Ensure we can find the command in working directory
    return command;
  }

  private async parseValidationOutput(
    type: string,
    output: string,
    success: boolean,
    command: string,
    executionTime: number,
    workingDir: string
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    try {
      switch (type) {
        case "typescript":
          this.parseTypeScriptOutput(output, errors, warnings);
          break;
        case "eslint":
          this.parseESLintOutput(output, errors, warnings);
          break;
        case "test":
          this.parseTestOutput(output, errors, warnings);
          break;
        case "build":
          this.parseBuildOutput(output, errors, warnings);
          break;
        case "format":
          this.parseFormatterOutput(output, errors, warnings);
          break;
        default:
          this.parseGenericOutput(output, errors, warnings);
          break;
      }
    } catch (parseError) {
      // If parsing fails, create a generic error
      errors.push({
        message: `Failed to parse ${type} output: ${String(parseError)}`,
        severity: "error",
        type: "custom",
      });
    }

    // Count files
    const filesWithErrors = new Set(
      errors.filter((e) => e.file).map((e) => e.file)
    ).size;
    const filesWithWarnings = new Set(
      warnings.filter((w) => w.file).map((w) => w.file)
    ).size;
    const allFiles = new Set([
      ...errors.filter((e) => e.file).map((e) => e.file!),
      ...warnings.filter((w) => w.file).map((w) => w.file!),
    ]).size;

    return {
      type,
      success: success && errors.length === 0,
      errors,
      warnings,
      summary: {
        totalFiles: allFiles,
        filesWithErrors,
        filesWithWarnings,
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        fixableIssues: [...errors, ...warnings].filter((e) => e.fixable).length,
      },
      command,
      executionTime,
      rawOutput: output,
    };
  }

  private parseTypeScriptOutput(
    output: string,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    const lines = output.split("\n");

    for (const line of lines) {
      // TypeScript error format: filename(line,column): error TS#### message
      const match = line.match(
        /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/
      );
      if (match) {
        const [, file, lineNum, column, severity, message] = match;

        const error: ValidationError = {
          file: path.relative(process.cwd(), file),
          line: parseInt(lineNum, 10),
          column: parseInt(column, 10),
          message: message.trim(),
          rule: "typescript",
          severity: severity as "error" | "warning",
          type: "type",
          fixable: false, // TypeScript errors are usually not auto-fixable
        };

        if (severity === "error") {
          errors.push(error);
        } else {
          warnings.push(error);
        }
      }
    }
  }

  private parseESLintOutput(
    output: string,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    // Try to parse as JSON first
    try {
      const jsonOutput = JSON.parse(output);
      if (Array.isArray(jsonOutput)) {
        for (const fileResult of jsonOutput) {
          for (const message of fileResult.messages) {
            const error: ValidationError = {
              file: path.relative(process.cwd(), fileResult.filePath),
              line: message.line,
              column: message.column,
              message: message.message,
              rule: message.ruleId,
              severity: message.severity === 2 ? "error" : "warning",
              type: "lint",
              fixable: message.fix !== undefined,
            };

            if (error.severity === "error") {
              errors.push(error);
            } else {
              warnings.push(error);
            }
          }
        }
        return;
      }
    } catch {
      // Fall through to text parsing
    }

    // Parse text output
    const lines = output.split("\n");
    for (const line of lines) {
      // ESLint text format: filepath:line:column: severity message (rule)
      const match = line.match(
        /^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+?)\s+(.+)$/
      );
      if (match) {
        const [, file, lineNum, column, severity, message, rule] = match;

        const error: ValidationError = {
          file: path.relative(process.cwd(), file),
          line: parseInt(lineNum, 10),
          column: parseInt(column, 10),
          message: message.trim(),
          rule: rule.replace(/[()]/g, ""),
          severity: severity as "error" | "warning",
          type: "lint",
          fixable: true, // Most ESLint rules are fixable
        };

        if (severity === "error") {
          errors.push(error);
        } else {
          warnings.push(error);
        }
      }
    }
  }

  private parseTestOutput(
    output: string,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    const lines = output.split("\n");

    for (const line of lines) {
      // Look for common test failure patterns
      if (
        line.includes("FAIL") ||
        line.includes("✕") ||
        line.includes("Failed")
      ) {
        // Extract test file and error
        const testFileMatch = line.match(/FAIL\s+(.+\.(?:test|spec)\.[jt]s)/);
        if (testFileMatch) {
          errors.push({
            file: testFileMatch[1],
            message: "Test suite failed",
            severity: "error",
            type: "test",
            fixable: false,
          });
        } else {
          errors.push({
            message: line.trim(),
            severity: "error",
            type: "test",
            fixable: false,
          });
        }
      } else if (line.includes("PASS") && line.includes("warning")) {
        warnings.push({
          message: line.trim(),
          severity: "warning",
          type: "test",
          fixable: false,
        });
      }
    }
  }

  private parseBuildOutput(
    output: string,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    const lines = output.split("\n");

    for (const line of lines) {
      // Look for build errors and warnings
      if (line.toLowerCase().includes("error")) {
        errors.push({
          message: line.trim(),
          severity: "error",
          type: "build",
          fixable: false,
        });
      } else if (line.toLowerCase().includes("warning")) {
        warnings.push({
          message: line.trim(),
          severity: "warning",
          type: "build",
          fixable: false,
        });
      }
    }
  }

  private parseFormatterOutput(
    output: string,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    const lines = output.split("\n");

    for (const line of lines) {
      // Prettier and other formatters typically list files that need formatting
      if (line.trim() && !line.includes("Code style issues")) {
        const filePath = line.trim();
        if (
          filePath.endsWith(".js") ||
          filePath.endsWith(".ts") ||
          filePath.endsWith(".json")
        ) {
          errors.push({
            file: filePath,
            message: "File needs formatting",
            severity: "error",
            type: "format",
            fixable: true,
          });
        }
      }
    }
  }

  private parseGenericOutput(
    output: string,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    const lines = output.split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Simple heuristic: lines with "error", "failed", etc. are errors
      if (
        trimmedLine.toLowerCase().includes("error") ||
        trimmedLine.toLowerCase().includes("failed") ||
        trimmedLine.toLowerCase().includes("exception")
      ) {
        errors.push({
          message: trimmedLine,
          severity: "error",
          type: "custom",
          fixable: false,
        });
      } else if (
        trimmedLine.toLowerCase().includes("warning") ||
        trimmedLine.toLowerCase().includes("warn")
      ) {
        warnings.push({
          message: trimmedLine,
          severity: "warning",
          type: "custom",
          fixable: false,
        });
      }
    }
  }

  private canAutoFix(type: string): boolean {
    return Object.hasOwnProperty.call(fixableValidationCommands, type);
  }

  private async attemptAutoFix(
    type: string,
    options: any,
    workingDir: string
  ): Promise<string> {
    try {
      const fixCommand = fixableValidationCommands[type];
      if (!fixCommand) {
        return "No auto-fix available for this validation type.";
      }

      // Add files if specified
      let command = fixCommand;
      if (options.files) {
        const files = Array.isArray(options.files)
          ? options.files.join(" ")
          : options.files;
        command += ` ${files}`;
      }

      const result = await execAsync(command, {
        timeout: options.timeout || 30000,
        cwd: workingDir,
      });

      return `Auto-fix completed successfully:\n${result.stdout}`;
    } catch (error) {
      return `Auto-fix failed: ${String(error)}`;
    }
  }

  private formatValidationResult(result: ValidationResult): string {
    const lines: string[] = [];

    // Header
    lines.push(`VALIDATION: ${result.type.toUpperCase()}`);
    lines.push(`Status: ${result.success ? "✅ PASSED" : "❌ FAILED"}`);
    lines.push(`Execution time: ${result.executionTime}ms`);
    lines.push("");

    // Summary
    lines.push("📊 Summary:");
    lines.push(`  • Files analyzed: ${result.summary.totalFiles}`);
    lines.push(
      `  • Errors: ${result.summary.totalErrors} (in ${result.summary.filesWithErrors} files)`
    );
    lines.push(
      `  • Warnings: ${result.summary.totalWarnings} (in ${result.summary.filesWithWarnings} files)`
    );
    if (result.summary.fixableIssues > 0) {
      lines.push(`  • Auto-fixable: ${result.summary.fixableIssues} issues`);
    }
    lines.push("");

    // Errors
    if (result.errors.length > 0) {
      lines.push("🚨 Errors:");
      for (const error of result.errors) {
        let errorLine = "  ";
        if (error.file) {
          errorLine += `${error.file}`;
          if (error.line) {
            errorLine += `:${error.line}`;
            if (error.column) {
              errorLine += `:${error.column}`;
            }
          }
          errorLine += " - ";
        }
        errorLine += error.message;
        if (error.rule) {
          errorLine += ` (${error.rule})`;
        }
        if (error.fixable) {
          errorLine += " [fixable]";
        }
        lines.push(errorLine);
      }
      lines.push("");
    }

    // Warnings
    if (result.warnings.length > 0) {
      lines.push("⚠️  Warnings:");
      for (const warning of result.warnings) {
        let warningLine = "  ";
        if (warning.file) {
          warningLine += `${warning.file}`;
          if (warning.line) {
            warningLine += `:${warning.line}`;
            if (warning.column) {
              warningLine += `:${warning.column}`;
            }
          }
          warningLine += " - ";
        }
        warningLine += warning.message;
        if (warning.rule) {
          warningLine += ` (${warning.rule})`;
        }
        if (warning.fixable) {
          warningLine += " [fixable]";
        }
        lines.push(warningLine);
      }
      lines.push("");
    }

    // Suggestions
    if (!result.success) {
      lines.push("💡 Suggestions:");
      if (result.summary.fixableIssues > 0) {
        lines.push(
          "  • Run validation with 'fix: true' to attempt automatic fixes"
        );
      }
      if (result.errors.some((e) => e.type === "type")) {
        lines.push("  • Review TypeScript configuration and type definitions");
      }
      if (result.errors.some((e) => e.type === "lint")) {
        lines.push(
          "  • Consider adjusting ESLint rules or fixing code style issues"
        );
      }
      if (result.errors.some((e) => e.type === "test")) {
        lines.push("  • Review failing tests and update implementation");
      }
      lines.push("");
    }

    // Command used
    lines.push(`Command: ${result.command}`);

    return lines.join("\n");
  }

  private validateParams(params: unknown): ValidationToolParams {
    try {
      return ValidationToolSchema.parse(params);
    } catch (error) {
      throw new Error(
        `Invalid validation tool parameters: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
