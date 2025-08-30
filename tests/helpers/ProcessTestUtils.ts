import {
  ProcessManager,
  ExecutionResult,
  ExecutionOptions,
} from "../../src/utils/ProcessManager";
import { vi } from "vitest";

export class ProcessTestUtils {
  // Create a mock ProcessManager for testing
  static createMockProcessManager(): {
    processManager: ProcessManager;
    mockExecute: ReturnType<typeof vi.fn>;
    mockKillAll: ReturnType<typeof vi.fn>;
    mockGetActiveProcessCount: ReturnType<typeof vi.fn>;
  } {
    const mockExecute = vi.fn();
    const mockKillAll = vi.fn();
    const mockGetActiveProcessCount = vi.fn().mockReturnValue(0);

    const processManager = {
      execute: mockExecute,
      killAll: mockKillAll,
      getActiveProcessCount: mockGetActiveProcessCount,
    } as any;

    return {
      processManager,
      mockExecute,
      mockKillAll,
      mockGetActiveProcessCount,
    };
  }

  // Setup common mock execution results
  static setupSuccessResult(
    mockExecute: ReturnType<typeof vi.fn>,
    command?: string,
    result?: Partial<ExecutionResult>
  ): void {
    const defaultResult: ExecutionResult = {
      stdout: "Command executed successfully",
      stderr: "",
      exitCode: 0,
      success: true,
      ...result,
    };

    if (command) {
      mockExecute.mockImplementation(
        (cmd: string, options: ExecutionOptions) => {
          if (cmd === command || cmd.includes(command)) {
            return Promise.resolve(defaultResult);
          }
          return Promise.resolve(defaultResult);
        }
      );
    } else {
      mockExecute.mockResolvedValue(defaultResult);
    }
  }

  static setupFailureResult(
    mockExecute: ReturnType<typeof vi.fn>,
    command?: string,
    result?: Partial<ExecutionResult>
  ): void {
    const defaultResult: ExecutionResult = {
      stdout: "",
      stderr: "Command failed",
      exitCode: 1,
      success: false,
      ...result,
    };

    if (command) {
      mockExecute.mockImplementation(
        (cmd: string, options: ExecutionOptions) => {
          if (cmd === command || cmd.includes(command)) {
            return Promise.resolve(defaultResult);
          }
          return Promise.resolve({
            stdout: "",
            stderr: "",
            exitCode: 0,
            success: true,
          });
        }
      );
    } else {
      mockExecute.mockResolvedValue(defaultResult);
    }
  }

  static setupTimeoutError(
    mockExecute: ReturnType<typeof vi.fn>,
    command?: string,
    timeoutMs: number = 1000
  ): void {
    const timeoutError = new Error(
      `Command timed out after ${timeoutMs}ms: ${command || "unknown command"}`
    );

    if (command) {
      mockExecute.mockImplementation(
        (cmd: string, options: ExecutionOptions) => {
          if (cmd === command || cmd.includes(command)) {
            return Promise.reject(timeoutError);
          }
          return Promise.resolve({
            stdout: "",
            stderr: "",
            exitCode: 0,
            success: true,
          });
        }
      );
    } else {
      mockExecute.mockRejectedValue(timeoutError);
    }
  }

  static setupCommandNotFoundError(
    mockExecute: ReturnType<typeof vi.fn>,
    command?: string
  ): void {
    const error = new Error(
      `Command not found: ${command || "unknown command"}`
    );

    if (command) {
      mockExecute.mockImplementation(
        (cmd: string, options: ExecutionOptions) => {
          if (cmd === command || cmd.includes(command)) {
            return Promise.reject(error);
          }
          return Promise.resolve({
            stdout: "",
            stderr: "",
            exitCode: 0,
            success: true,
          });
        }
      );
    } else {
      mockExecute.mockRejectedValue(error);
    }
  }

  // Verification helpers
  static expectCommandExecuted(
    mockExecute: ReturnType<typeof vi.fn>,
    command: string,
    times: number = 1
  ): void {
    const calls = mockExecute.mock.calls;
    const matchingCalls = calls.filter(
      (call) => call[0] === command || call[0].includes(command)
    );

    if (matchingCalls.length !== times) {
      throw new Error(
        `Expected command "${command}" to be executed ${times} time(s), but was executed ${matchingCalls.length} time(s)`
      );
    }
  }

  static expectCommandExecutedWith(
    mockExecute: ReturnType<typeof vi.fn>,
    command: string,
    options: Partial<ExecutionOptions>
  ): void {
    const calls = mockExecute.mock.calls;
    const matchingCall = calls.find(
      (call) =>
        (call[0] === command || call[0].includes(command)) &&
        call[1] &&
        Object.entries(options).every(([key, value]) => call[1][key] === value)
    );

    if (!matchingCall) {
      throw new Error(
        `Expected command "${command}" to be executed with options ${JSON.stringify(options)}, but it wasn't found`
      );
    }
  }

  static expectNoCommandsExecuted(mockExecute: ReturnType<typeof vi.fn>): void {
    if (mockExecute.mock.calls.length > 0) {
      throw new Error(
        `Expected no commands to be executed, but ${mockExecute.mock.calls.length} were executed`
      );
    }
  }

  static expectCleanupCalled(mockKillAll: ReturnType<typeof vi.fn>): void {
    if (!mockKillAll.mock.calls.length) {
      throw new Error(
        "Expected killAll to be called for cleanup, but it wasn't"
      );
    }
  }

  static expectActiveProcessCount(
    mockGetActiveProcessCount: ReturnType<typeof vi.fn>,
    expectedCount: number
  ): void {
    mockGetActiveProcessCount.mockReturnValue(expectedCount);
    const actualCount = mockGetActiveProcessCount();

    if (actualCount !== expectedCount) {
      throw new Error(
        `Expected active process count to be ${expectedCount}, but got ${actualCount}`
      );
    }
  }

  // Test scenario builders
  static createTimeoutScenario(timeoutMs: number = 1000): {
    processManager: ProcessManager;
    expectTimeout: () => Promise<void>;
  } {
    const { processManager, mockExecute } = this.createMockProcessManager();

    this.setupTimeoutError(mockExecute, undefined, timeoutMs);

    return {
      processManager,
      expectTimeout: async () => {
        try {
          await processManager.execute("slow-command", { timeout: timeoutMs });
          throw new Error("Expected command to timeout, but it succeeded");
        } catch (error) {
          if (!error.message.includes("timed out")) {
            throw new Error(
              `Expected timeout error, but got: ${error.message}`
            );
          }
        }
      },
    };
  }

  static createResourceLeakScenario(processCount: number = 5): {
    processManager: ProcessManager;
    mockGetActiveProcessCount: ReturnType<typeof vi.fn>;
    simulateProcessLeak: () => void;
  } {
    const { processManager, mockGetActiveProcessCount } =
      this.createMockProcessManager();

    return {
      processManager,
      mockGetActiveProcessCount,
      simulateProcessLeak: () => {
        mockGetActiveProcessCount.mockReturnValue(processCount);
      },
    };
  }

  static createStressTestScenario(commandCount: number = 10): {
    processManager: ProcessManager;
    executeMultipleCommands: () => Promise<ExecutionResult[]>;
    mockExecute: ReturnType<typeof vi.fn>;
  } {
    const { processManager, mockExecute } = this.createMockProcessManager();

    this.setupSuccessResult(mockExecute);

    return {
      processManager,
      mockExecute,
      executeMultipleCommands: async () => {
        const commands = Array.from(
          { length: commandCount },
          (_, i) => `command-${i}`
        );
        const promises = commands.map((cmd) =>
          processManager.execute(cmd, { timeout: 5000 })
        );
        return Promise.all(promises);
      },
    };
  }

  // Real process testing utilities (for integration tests)
  static async testRealCommand(
    command: string,
    expectedExitCode: number = 0,
    timeout: number = 5000
  ): Promise<ExecutionResult> {
    const processManager = new ProcessManager();

    try {
      const result = await processManager.execute(command, { timeout });

      if (result.exitCode !== expectedExitCode) {
        throw new Error(
          `Expected exit code ${expectedExitCode}, but got ${result.exitCode}`
        );
      }

      return result;
    } finally {
      processManager.killAll();
    }
  }

  static async testCommandTimeout(
    command: string,
    timeoutMs: number = 1000
  ): Promise<void> {
    const processManager = new ProcessManager();

    try {
      await processManager.execute(command, { timeout: timeoutMs });
      throw new Error("Expected command to timeout, but it completed");
    } catch (error) {
      if (!error.message.includes("timed out")) {
        throw new Error(`Expected timeout error, but got: ${error.message}`);
      }
    } finally {
      processManager.killAll();
    }
  }

  static async testProcessCleanup(): Promise<void> {
    const processManager = new ProcessManager();

    // Start some long-running processes
    const promises = [
      processManager.execute("sleep 5", { timeout: 10000 }).catch(() => {}),
      processManager.execute("sleep 5", { timeout: 10000 }).catch(() => {}),
      processManager.execute("sleep 5", { timeout: 10000 }).catch(() => {}),
    ];

    // Give processes time to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should have active processes
    const activeCount = processManager.getActiveProcessCount();
    if (activeCount === 0) {
      throw new Error("Expected active processes, but none were found");
    }

    // Cleanup should kill all processes
    processManager.killAll();

    // Wait a bit for cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    // All promises should have been rejected due to process termination
    await Promise.allSettled(promises);

    // Process count should be 0
    const finalCount = processManager.getActiveProcessCount();
    if (finalCount !== 0) {
      throw new Error(
        `Expected 0 active processes after cleanup, but got ${finalCount}`
      );
    }
  }

  // Performance testing utilities
  static async measureExecutionTime(
    processManager: ProcessManager,
    command: string,
    iterations: number = 10
  ): Promise<{ average: number; min: number; max: number; total: number }> {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      await processManager.execute(command, { timeout: 10000 });
      const endTime = Date.now();
      times.push(endTime - startTime);
    }

    return {
      average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      min: Math.min(...times),
      max: Math.max(...times),
      total: times.reduce((a, b) => a + b, 0),
    };
  }

  // Debugging utilities
  static logMockCalls(mockExecute: ReturnType<typeof vi.fn>): void {
    console.log("Mock execute calls:");
    mockExecute.mock.calls.forEach((call, index) => {
      console.log(`  ${index + 1}: ${call[0]} with options:`, call[1]);
    });
  }

  static createDebugProcessManager(): ProcessManager {
    const realProcessManager = new ProcessManager();

    // Wrap execute to add logging
    const originalExecute = realProcessManager.execute.bind(realProcessManager);
    realProcessManager.execute = async (
      command: string,
      options: ExecutionOptions
    ) => {
      console.log(`[DEBUG] Executing: ${command}`, options);
      const startTime = Date.now();
      try {
        const result = await originalExecute(command, options);
        const duration = Date.now() - startTime;
        console.log(`[DEBUG] Completed in ${duration}ms:`, {
          exitCode: result.exitCode,
          success: result.success,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length,
        });
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`[DEBUG] Failed after ${duration}ms:`, error.message);
        throw error;
      }
    };

    return realProcessManager;
  }
}
