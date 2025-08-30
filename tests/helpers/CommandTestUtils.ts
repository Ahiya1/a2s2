import { MockCommandExecutor } from "./MockCommandExecutor";
import { ExecutionResult } from "../../src/utils/ProcessManager";

export class CommandTestUtils {
  // TypeScript validation presets
  static setupTypeScriptSuccess(mockExecutor: MockCommandExecutor): void {
    mockExecutor.setCommandResults({
      "npx tsc --noEmit": {
        stdout: "No TypeScript errors found",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "/npx tsc --noEmit/": {
        // Regex pattern
        stdout: "TypeScript compilation successful",
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });
  }

  static setupTypeScriptErrors(
    mockExecutor: MockCommandExecutor,
    errors: string[]
  ): void {
    const errorOutput = errors
      .map(
        (error, index) => `src/test.ts(${10 + index},5): error TS2322: ${error}`
      )
      .join("\n");

    mockExecutor.setCommandResult("npx tsc --noEmit", {
      stdout: `${errorOutput}\nFound ${errors.length} errors in ${errors.length} files.`,
      stderr: "",
      exitCode: 1,
      success: false,
    });
  }

  // ESLint validation presets
  static setupESLintSuccess(mockExecutor: MockCommandExecutor): void {
    mockExecutor.setCommandResults({
      "npx eslint": {
        stdout: "",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "/npx eslint/": {
        // Pattern match
        stdout: "ESLint validation completed successfully",
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });
  }

  static setupESLintErrors(
    mockExecutor: MockCommandExecutor,
    rules: string[]
  ): void {
    const errorOutput = rules
      .map(
        (rule, index) =>
          `src/error.js:${10 + index}:5: error Example error message ${rule}`
      )
      .join("\n");

    mockExecutor.setCommandResult("npx eslint", {
      stdout: `${errorOutput}\n\n${rules.length} problems (${rules.length} errors, 0 warnings)`,
      stderr: "",
      exitCode: 1,
      success: false,
    });
  }

  static setupESLintWarnings(
    mockExecutor: MockCommandExecutor,
    rules: string[]
  ): void {
    const warningOutput = rules
      .map(
        (rule, index) =>
          `src/warning.js:${5 + index}:1: warning Warning message ${rule}`
      )
      .join("\n");

    mockExecutor.setCommandResult("npx eslint", {
      stdout: `${warningOutput}\n\n${rules.length} problems (0 errors, ${rules.length} warnings)`,
      stderr: "",
      exitCode: 0,
      success: true,
    });
  }

  static setupESLintJSON(
    mockExecutor: MockCommandExecutor,
    fileResults: Array<{
      file: string;
      messages: Array<{
        ruleId: string;
        severity: 1 | 2;
        message: string;
        line: number;
        column: number;
        fixable?: boolean;
      }>;
    }>
  ): void {
    const jsonOutput = fileResults.map((fileResult) => ({
      filePath: fileResult.file,
      messages: fileResult.messages.map((msg) => ({
        ruleId: msg.ruleId,
        severity: msg.severity,
        message: msg.message,
        line: msg.line,
        column: msg.column,
        fix: msg.fixable ? { range: [0, 10], text: "fixed" } : undefined,
      })),
    }));

    mockExecutor.setCommandResult("npx eslint --format json", {
      stdout: JSON.stringify(jsonOutput),
      stderr: "",
      exitCode: jsonOutput.some((f) => f.messages.some((m) => m.severity === 2))
        ? 1
        : 0,
      success: !jsonOutput.some((f) =>
        f.messages.some((m) => m.severity === 2)
      ),
    });
  }

  // Test validation presets
  static setupTestSuccess(mockExecutor: MockCommandExecutor): void {
    mockExecutor.setCommandResults({
      "npm test": {
        stdout: `PASS src/test.test.js
✓ should pass test 1 (2 ms)
✓ should pass test 2 (1 ms)

Test Suites: 1 passed, 1 total
Tests: 2 passed, 2 total`,
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });
  }

  static setupTestFailures(
    mockExecutor: MockCommandExecutor,
    failedTests: string[]
  ): void {
    const testOutput = failedTests
      .map((test) => `FAIL src/${test}.test.js\n✕ ${test} failed (5 ms)`)
      .join("\n");

    mockExecutor.setCommandResult("npm test", {
      stdout: `${testOutput}\n\nTest Suites: ${failedTests.length} failed, ${failedTests.length} total\nTests: ${failedTests.length} failed, ${failedTests.length} total`,
      stderr: "",
      exitCode: 1,
      success: false,
    });
  }

  // Build validation presets
  static setupBuildSuccess(mockExecutor: MockCommandExecutor): void {
    mockExecutor.setCommandResults({
      "npm run build": {
        stdout: "Build completed successfully\nGenerated 5 files in dist/",
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });
  }

  static setupBuildFailure(
    mockExecutor: MockCommandExecutor,
    errors: string[]
  ): void {
    const errorOutput = errors.join("\n");

    mockExecutor.setCommandResult("npm run build", {
      stdout: "",
      stderr: `ERROR: Build failed\n${errorOutput}`,
      exitCode: 1,
      success: false,
    });
  }

  // Format validation presets
  static setupFormatSuccess(mockExecutor: MockCommandExecutor): void {
    mockExecutor.setCommandResults({
      "npx prettier --check": {
        stdout: "All files are formatted correctly",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "npx prettier --write": {
        stdout: "Fixed formatting for 0 files",
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });
  }

  static setupFormatIssues(
    mockExecutor: MockCommandExecutor,
    unformattedFiles: string[]
  ): void {
    const fileList = unformattedFiles.join("\n");

    mockExecutor.setCommandResults({
      "npx prettier --check": {
        stdout: `${fileList}\nCode style issues found in the above file(s). Forgot to run Prettier?`,
        stderr: "",
        exitCode: 1,
        success: false,
      },
      "npx prettier --write": {
        stdout: `Fixed formatting for ${unformattedFiles.length} files`,
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });
  }

  // JavaScript validation presets
  static setupJavaScriptSuccess(mockExecutor: MockCommandExecutor): void {
    mockExecutor.setCommandResults({
      "node --check": {
        stdout: "",
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });
  }

  static setupJavaScriptSyntaxError(
    mockExecutor: MockCommandExecutor,
    error: string
  ): void {
    mockExecutor.setCommandResult("node --check", {
      stdout: "",
      stderr: `SyntaxError: ${error}`,
      exitCode: 1,
      success: false,
    });
  }

  // Custom command presets
  static setupCustomCommand(
    mockExecutor: MockCommandExecutor,
    command: string,
    result: Partial<ExecutionResult>
  ): void {
    const fullResult: ExecutionResult = {
      stdout: "",
      stderr: "",
      exitCode: 0,
      success: true,
      ...result,
    };

    mockExecutor.setCommandResult(command, fullResult);
  }

  static setupTimeout(
    mockExecutor: MockCommandExecutor,
    command: string,
    timeoutMs: number
  ): void {
    mockExecutor.setCommandDelay(command, timeoutMs);
    mockExecutor.setCommandResult(command, {
      stdout: "",
      stderr: `Command timed out after ${timeoutMs}ms`,
      exitCode: 124, // Standard timeout exit code
      success: false,
    });
  }

  // Scenario builders
  static createValidationScenario(
    mockExecutor: MockCommandExecutor,
    scenario:
      | "all-pass"
      | "typescript-errors"
      | "eslint-errors"
      | "test-failures"
      | "build-errors"
      | "format-issues"
  ): void {
    switch (scenario) {
      case "all-pass":
        this.setupTypeScriptSuccess(mockExecutor);
        this.setupESLintSuccess(mockExecutor);
        this.setupTestSuccess(mockExecutor);
        this.setupBuildSuccess(mockExecutor);
        this.setupFormatSuccess(mockExecutor);
        this.setupJavaScriptSuccess(mockExecutor);
        break;

      case "typescript-errors":
        this.setupTypeScriptErrors(mockExecutor, [
          "Type 'string' is not assignable to type 'number'",
          "Property 'unknownMethod' does not exist on type 'string'",
        ]);
        break;

      case "eslint-errors":
        this.setupESLintErrors(mockExecutor, ["no-unused-vars", "no-console"]);
        break;

      case "test-failures":
        this.setupTestFailures(mockExecutor, [
          "should pass test 1",
          "should pass test 2",
        ]);
        break;

      case "build-errors":
        this.setupBuildFailure(mockExecutor, [
          'Cannot resolve module "missing-dependency"',
          "Compilation failed",
        ]);
        break;

      case "format-issues":
        this.setupFormatIssues(mockExecutor, [
          "src/unformatted.js",
          "src/messy.ts",
        ]);
        break;
    }
  }

  // Command verification helpers
  static expectCommandExecuted(
    mockExecutor: MockCommandExecutor,
    command: string
  ): void {
    const executed = mockExecutor.getExecutedCommands();
    const found = executed.some(
      (cmd) => cmd.command === command || cmd.command.includes(command)
    );

    if (!found) {
      throw new Error(
        `Expected command to be executed: ${command}\nExecuted: ${executed.map((c) => c.command).join(", ")}`
      );
    }
  }

  static expectCommandNotExecuted(
    mockExecutor: MockCommandExecutor,
    command: string
  ): void {
    const executed = mockExecutor.getExecutedCommands();
    const found = executed.some(
      (cmd) => cmd.command === command || cmd.command.includes(command)
    );

    if (found) {
      throw new Error(
        `Expected command NOT to be executed: ${command}\nBut it was executed`
      );
    }
  }

  static expectCommandCount(
    mockExecutor: MockCommandExecutor,
    expectedCount: number
  ): void {
    const actualCount = mockExecutor.getExecutedCommands().length;

    if (actualCount !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} commands, but ${actualCount} were executed`
      );
    }
  }

  // Output verification helpers
  static expectValidationPassed(result: string): void {
    if (!result.includes("✅ PASSED")) {
      throw new Error(`Expected validation to pass, but got: ${result}`);
    }
  }

  static expectValidationFailed(result: string): void {
    if (!result.includes("❌ FAILED")) {
      throw new Error(`Expected validation to fail, but got: ${result}`);
    }
  }

  static expectErrorCount(result: string, expectedCount: number): void {
    const match = result.match(/Errors: (\d+)/);
    const actualCount = match ? parseInt(match[1], 10) : 0;

    if (actualCount !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} errors, but found ${actualCount}`
      );
    }
  }

  static expectWarningCount(result: string, expectedCount: number): void {
    const match = result.match(/Warnings: (\d+)/);
    const actualCount = match ? parseInt(match[1], 10) : 0;

    if (actualCount !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} warnings, but found ${actualCount}`
      );
    }
  }

  static expectContainsError(result: string, errorText: string): void {
    if (!result.includes("🚨 Errors:") || !result.includes(errorText)) {
      throw new Error(
        `Expected result to contain error: ${errorText}\nBut got: ${result}`
      );
    }
  }

  static expectContainsWarning(result: string, warningText: string): void {
    if (!result.includes("⚠️  Warnings:") || !result.includes(warningText)) {
      throw new Error(
        `Expected result to contain warning: ${warningText}\nBut got: ${result}`
      );
    }
  }

  static expectFixableIssues(result: string, expectedCount: number): void {
    const match = result.match(/Auto-fixable: (\d+) issues/);
    const actualCount = match ? parseInt(match[1], 10) : 0;

    if (actualCount !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} fixable issues, but found ${actualCount}`
      );
    }
  }
}
