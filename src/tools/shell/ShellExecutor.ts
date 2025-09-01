import { exec } from "child_process";
import { promisify } from "util";
import {
  ShellExecutorSchema,
  ShellExecutorParams,
} from "../schemas/ToolSchemas";
import { Logger } from "../../logging/Logger";
import { ConfigManager } from "../../config/ConfigManager";
import { access, constants } from "fs/promises";

const execAsync = promisify(exec);

// Interface for exec errors that include stdout/stderr
interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
  code?: number;
  signal?: string;
}

export class ShellExecutor {
  async execute(params: unknown): Promise<string> {
    const validatedParams = this.validateParams(params);
    return this.run_command(validatedParams);
  }

  async run_command(params: ShellExecutorParams): Promise<string> {
    const { command, timeout } = params;
    const config = ConfigManager.getConfig();
    const commandTimeout = timeout || config.commandTimeout;

    Logger.info(`Executing shell command: ${command}`, {
      timeout: commandTimeout,
    });

    try {
      // FIXED: Handle shell script execution issues
      let processedCommand = await this.preprocessCommand(command);

      // FIXED: Handle directory permission issues when running as different users
      const execOptions: any = {
        timeout: commandTimeout,
        encoding: "utf8",
        // Prevent scripts from hanging on interactive prompts
        env: {
          ...process.env,
          DEBIAN_FRONTEND: "noninteractive",
          TERM: "dumb", // Prevents interactive prompts in many tools
        },
      };

      // If running command as different user (sudo -u), use /tmp as working directory
      // to avoid permission denied errors on user home directories
      if (command.includes("sudo -u") || command.includes("su -")) {
        execOptions.cwd = "/tmp";
        Logger.debug(`Using /tmp as working directory for user-switch command`);
      }

      const result = await execAsync(processedCommand, execOptions);

      // Ensure stdout and stderr are strings
      const stdout = String(result.stdout);
      const stderr = String(result.stderr);

      Logger.info(`Command completed successfully`, {
        command,
        stdout: stdout.length,
        stderr: stderr.length,
      });

      if (stderr) {
        Logger.warn(`Command produced stderr output`, {
          stderr: stderr,
        });
        return `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;
      }

      return stdout;
    } catch (error: unknown) {
      // FIXED: Extract stdout/stderr from exec errors
      if (this.isExecError(error)) {
        const { stdout = "", stderr = "", message } = error;

        Logger.error(`Shell command failed`, {
          command,
          error: message,
          hasStdout: stdout.length > 0,
          hasStderr: stderr.length > 0,
        });

        // Return the actual error output so the agent can see what went wrong
        let errorOutput = `Command failed: ${command}\n`;

        if (stdout) {
          errorOutput += `\nSTDOUT:\n${stdout}`;
        }

        if (stderr) {
          errorOutput += `\nSTDERR:\n${stderr}`;
        }

        if (!stdout && !stderr) {
          errorOutput += `\nError: ${message}`;
        }

        // Don't throw - return the error details so the agent can read them
        return errorOutput;
      } else {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        Logger.error(`Shell command failed`, { command, error: errorMessage });

        // For non-exec errors, still return instead of throwing
        return `Command failed: ${command}\nError: ${errorMessage}`;
      }
    }
  }

  /**
   * Preprocesses commands to handle common shell script issues
   */
  private async preprocessCommand(command: string): Promise<string> {
    let processedCommand = command.trim();

    // Handle .sh files specifically
    if (this.isShellScriptCommand(processedCommand)) {
      processedCommand = await this.handleShellScript(processedCommand);
    }

    // Add timeout wrapper for potentially hanging commands
    if (this.mightHang(processedCommand)) {
      // Use timeout command as fallback safety net
      processedCommand = `timeout 300s ${processedCommand}`;
    }

    Logger.debug(`Preprocessed command`, {
      original: command,
      processed: processedCommand,
    });

    return processedCommand;
  }

  /**
   * Checks if command is running a shell script
   */
  private isShellScriptCommand(command: string): boolean {
    return (
      command.includes(".sh") ||
      command.startsWith("bash ") ||
      command.startsWith("sh ") ||
      (command.startsWith("./") && command.includes(".sh"))
    );
  }

  /**
   * Handles shell script execution issues
   */
  private async handleShellScript(command: string): Promise<string> {
    // Extract script path
    const scriptMatch = command.match(/(?:bash\s+|sh\s+|\.\/)?([^\s]+\.sh)/);
    if (!scriptMatch) return command;

    const scriptPath = scriptMatch[1];

    try {
      // Check if script exists and is readable
      await access(scriptPath, constants.R_OK);

      // Try to make it executable (ignore errors if we can't)
      try {
        await execAsync(`chmod +x ${scriptPath}`);
        Logger.debug(`Made script executable: ${scriptPath}`);
      } catch (chmodError) {
        Logger.debug(
          `Could not chmod script (continuing anyway): ${scriptPath}`
        );
      }

      // Ensure we run with bash for better compatibility
      if (!command.startsWith("bash ") && !command.startsWith("sh ")) {
        return `bash ${command}`;
      }

      return command;
    } catch (error) {
      Logger.warn(`Script file not accessible: ${scriptPath}`, { error });
      return command;
    }
  }

  /**
   * Checks if command might hang waiting for input
   */
  private mightHang(command: string): boolean {
    const hangingPatterns = [
      /\bsudo\b(?!\s+\-n)/, // sudo without -n flag
      /\bapt\s+install\b(?![^|]*\-y)/, // apt install without -y
      /\bsystemctl\s+(enable|disable|start|stop)\b/,
      /\bservice\s+\w+\s+(start|stop|restart)\b/,
      /\bread\s+/, // bash read command
      /\bselect\s+/, // bash select
      /\.sh\b/, // shell scripts (might have interactive parts)
    ];

    return hangingPatterns.some((pattern) => pattern.test(command));
  }

  private isExecError(error: unknown): error is ExecError {
    return (
      error instanceof Error &&
      ("stdout" in error || "stderr" in error || "code" in error)
    );
  }

  private validateParams(params: unknown): ShellExecutorParams {
    try {
      return ShellExecutorSchema.parse(params);
    } catch (error) {
      throw new Error(
        `Invalid shell executor parameters: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
