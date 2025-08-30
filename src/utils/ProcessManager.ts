import { spawn, ChildProcess } from "child_process";
import { Logger } from "../logging/Logger";

export interface ExecutionOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export class ProcessManager {
  private activeProcesses = new Set<ChildProcess>();

  async execute(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const { cwd = process.cwd(), timeout = 30000, env } = options;

    return new Promise((resolve, reject) => {
      const child = spawn("sh", ["-c", command], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...env },
      });

      this.activeProcesses.add(child);

      let stdout = "";
      let stderr = "";
      let isComplete = false;
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        this.activeProcesses.delete(child);
      };

      const complete = (result: ExecutionResult) => {
        if (isComplete) return;
        isComplete = true;
        cleanup();
        resolve(result);
      };

      const fail = (error: Error) => {
        if (isComplete) return;
        isComplete = true;
        cleanup();
        this.killProcess(child);
        reject(error);
      };

      // Set timeout with proper cleanup
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          Logger.warn("Command timed out", { command, timeout });
          fail(new Error(`Command timed out after ${timeout}ms: ${command}`));
        }, timeout);
      }

      // Collect output
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      // Handle completion
      child.on("close", (code) => {
        complete({
          stdout,
          stderr,
          exitCode: code || 0,
          success: code === 0,
        });
      });

      // Handle errors
      child.on("error", (error) => {
        Logger.error("Process execution error", {
          command,
          error: error.message,
        });
        fail(error);
      });
    });
  }

  private killProcess(child: ChildProcess): void {
    if (!child.pid) return;

    try {
      // Try graceful termination first
      child.kill("SIGTERM");

      // Force kill after 2 seconds if still running
      setTimeout(() => {
        try {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        } catch (error) {
          Logger.debug("Error force killing process", { error });
        }
      }, 2000);
    } catch (error) {
      Logger.debug("Error terminating process", { error });
    }
  }

  // Cleanup all active processes (for shutdown)
  killAll(): void {
    Logger.info("Cleaning up active processes", {
      count: this.activeProcesses.size,
    });

    for (const child of this.activeProcesses) {
      this.killProcess(child);
    }

    this.activeProcesses.clear();
  }

  getActiveProcessCount(): number {
    return this.activeProcesses.size;
  }
}
