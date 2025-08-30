import {
  ProcessManager,
  ExecutionOptions,
  ExecutionResult,
} from "../../utils/ProcessManager";

/**
 * Abstract interface for command execution
 * Allows dependency injection for testing and different execution strategies
 */
export interface CommandExecutor {
  execute(
    command: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult>;
  getActiveProcessCount?(): number;
  cleanup?(): void;
}

/**
 * Production command executor using ProcessManager
 */
export class RealCommandExecutor implements CommandExecutor {
  constructor(private processManager: ProcessManager = new ProcessManager()) {}

  async execute(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return this.processManager.execute(command, options);
  }

  getActiveProcessCount(): number {
    return this.processManager.getActiveProcessCount();
  }

  cleanup(): void {
    this.processManager.killAll();
  }
}

/**
 * Mock command executor for testing
 * Provides controlled, predictable command execution without spawning processes
 */
export class MockCommandExecutor implements CommandExecutor {
  private commandResults = new Map<string, ExecutionResult>();
  private commandDelays = new Map<string, number>();
  private executedCommands: Array<{
    command: string;
    options: ExecutionOptions;
    timestamp: Date;
  }> = [];
  private activeProcessCount = 0;

  async execute(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const timestamp = new Date();
    this.executedCommands.push({ command, options, timestamp });

    // Simulate delay if configured
    const delay = this.getCommandDelay(command);
    if (delay > 0) {
      // Check if timeout would occur
      const timeout = options.timeout || 30000;
      if (delay > timeout) {
        throw new Error(`Command timed out after ${timeout}ms: ${command}`);
      }
      await this.sleep(delay);
    }

    // Find matching result
    const result = this.findCommandResult(command);

    // Clone result to prevent mutations
    return { ...result };
  }

  private findCommandResult(command: string): ExecutionResult {
    // Exact match first
    if (this.commandResults.has(command)) {
      return this.commandResults.get(command)!;
    }

    // Pattern matching
    for (const [pattern, result] of this.commandResults.entries()) {
      if (this.matchesPattern(command, pattern)) {
        return result;
      }
    }

    // Default success result
    return {
      stdout: `Mock execution of: ${command}`,
      stderr: "",
      exitCode: 0,
      success: true,
    };
  }

  private matchesPattern(command: string, pattern: string): boolean {
    // Regex pattern (enclosed in forward slashes)
    if (pattern.startsWith("/") && pattern.endsWith("/")) {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(command);
    }

    // Contains pattern
    if (pattern.includes("*") || pattern.includes("?")) {
      const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(command);
    }

    // Simple substring match
    return command.includes(pattern);
  }

  private getCommandDelay(command: string): number {
    // Exact match first
    if (this.commandDelays.has(command)) {
      return this.commandDelays.get(command)!;
    }

    // Pattern matching
    for (const [pattern, delay] of this.commandDelays.entries()) {
      if (this.matchesPattern(command, pattern)) {
        return delay;
      }
    }

    return 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Configuration methods
  setCommandResult(command: string, result: ExecutionResult): void {
    this.commandResults.set(command, result);
  }

  setCommandResults(results: Record<string, ExecutionResult>): void {
    Object.entries(results).forEach(([command, result]) => {
      this.setCommandResult(command, result);
    });
  }

  setCommandDelay(command: string, delayMs: number): void {
    this.commandDelays.set(command, delayMs);
  }

  // Inspection methods
  getExecutedCommands(): Array<{
    command: string;
    options: ExecutionOptions;
    timestamp: Date;
  }> {
    return [...this.executedCommands];
  }

  getLastCommand(): {
    command: string;
    options: ExecutionOptions;
    timestamp: Date;
  } | null {
    return this.executedCommands.length > 0
      ? this.executedCommands[this.executedCommands.length - 1]
      : null;
  }

  getCommandCount(): number {
    return this.executedCommands.length;
  }

  wasCommandExecuted(command: string): boolean {
    return this.executedCommands.some(
      (exec) =>
        exec.command === command || this.matchesPattern(exec.command, command)
    );
  }

  getCommandExecutionCount(command: string): number {
    return this.executedCommands.filter(
      (exec) =>
        exec.command === command || this.matchesPattern(exec.command, command)
    ).length;
  }

  // State management
  reset(): void {
    this.commandResults.clear();
    this.commandDelays.clear();
    this.executedCommands = [];
    this.activeProcessCount = 0;
  }

  getActiveProcessCount(): number {
    return this.activeProcessCount;
  }

  setActiveProcessCount(count: number): void {
    this.activeProcessCount = count;
  }

  cleanup(): void {
    // Mock cleanup - just reset state
    this.activeProcessCount = 0;
  }

  // Preset configurations for common scenarios
  static createForValidationTesting(): MockCommandExecutor {
    const mock = new MockCommandExecutor();

    // TypeScript presets
    mock.setCommandResults({
      "npx tsc --noEmit": {
        stdout: "Found 0 errors.",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "/npx tsc --noEmit.*--strict/": {
        stdout: "TypeScript strict mode validation passed",
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });

    // ESLint presets
    mock.setCommandResults({
      "npx eslint": {
        stdout: "",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "npx eslint --fix": {
        stdout: "Fixed 0 problems",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "/npx eslint.*--format json/": {
        stdout: "[]",
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });

    // Other validation tools
    mock.setCommandResults({
      "npm test": {
        stdout: "All tests passed",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "npm run build": {
        stdout: "Build completed successfully",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "npx prettier --check": {
        stdout: "All files formatted correctly",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "npx prettier --write": {
        stdout: "Formatted 0 files",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "node --check": {
        stdout: "",
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });

    return mock;
  }

  static createForErrorTesting(): MockCommandExecutor {
    const mock = new MockCommandExecutor();

    mock.setCommandResults({
      "npx tsc --noEmit": {
        stdout: `src/test.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
Found 1 error in 1 file.`,
        stderr: "",
        exitCode: 1,
        success: false,
      },
      "npx eslint": {
        stdout: `src/test.js:1:1: error 'unused' is defined but never used. no-unused-vars

1 problem (1 error, 0 warnings)`,
        stderr: "",
        exitCode: 1,
        success: false,
      },
      "npm test": {
        stdout: `FAIL src/test.test.js
✕ should pass (5 ms)

Test Suites: 1 failed, 1 total`,
        stderr: "",
        exitCode: 1,
        success: false,
      },
    });

    return mock;
  }

  static createForTimeoutTesting(): MockCommandExecutor {
    const mock = new MockCommandExecutor();

    // Set up commands that will timeout
    mock.setCommandDelay("sleep 10", 10000);
    mock.setCommandDelay("npm test", 5000);
    mock.setCommandDelay("/long.*command/", 8000);

    return mock;
  }

  static createForPerformanceTesting(): MockCommandExecutor {
    const mock = new MockCommandExecutor();

    // Simulate various execution times
    mock.setCommandDelay("fast-command", 100);
    mock.setCommandDelay("medium-command", 1000);
    mock.setCommandDelay("slow-command", 3000);

    mock.setCommandResults({
      "fast-command": {
        stdout: "Fast",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "medium-command": {
        stdout: "Medium",
        stderr: "",
        exitCode: 0,
        success: true,
      },
      "slow-command": {
        stdout: "Slow",
        stderr: "",
        exitCode: 0,
        success: true,
      },
    });

    return mock;
  }
}

// Type guard to check if an executor is a mock
export function isMockCommandExecutor(
  executor: CommandExecutor
): executor is MockCommandExecutor {
  return "setCommandResult" in executor;
}

// Factory function for creating appropriate executor based on environment
export function createCommandExecutor(
  testing: boolean = false
): CommandExecutor {
  if (testing || process.env.NODE_ENV === "test") {
    return MockCommandExecutor.createForValidationTesting();
  }
  return new RealCommandExecutor();
}
