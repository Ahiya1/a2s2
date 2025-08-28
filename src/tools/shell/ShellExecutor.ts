import { exec } from "child_process";
import { promisify } from "util";
import {
  ShellExecutorSchema,
  ShellExecutorParams,
} from "../schemas/ToolSchemas";
import { Logger } from "../../logging/Logger";
import { ConfigManager } from "../../config/ConfigManager";

const execAsync = promisify(exec);

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
      const result = await execAsync(command, {
        timeout: commandTimeout,
        encoding: "utf8",
      });

      Logger.info(`Command completed successfully`, {
        command,
        stdout: result.stdout.length,
        stderr: result.stderr.length,
      });

      if (result.stderr) {
        Logger.warn(`Command produced stderr output`, {
          stderr: result.stderr,
        });
        return `STDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`;
      }

      return result.stdout;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error(`Shell command failed`, { command, error: errorMessage });
      throw new Error(`Command failed: ${errorMessage}`);
    }
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
