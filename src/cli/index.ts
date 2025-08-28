import { Command } from "commander";
import { createAnalyzeCommand } from "./commands/analyze";
import { createReadCommand } from "./commands/read";
import { createValidateCommand } from "./commands/validate";
import { ConfigManager } from "../config/ConfigManager";
import { Logger } from "../logging/Logger";

export function createCLI(): Command {
  // Load configuration from environment
  ConfigManager.loadFromEnv();

  const program = new Command();

  program
    .name("a2s2")
    .description("Autonomous Agent System v2 - Phase 1A Foundation Tools")
    .version("0.1.0");

  // Global error handler
  program.configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => cmd.name(),
  });

  // Register commands
  program.addCommand(createAnalyzeCommand());
  program.addCommand(createReadCommand());
  program.addCommand(createValidateCommand());

  // Global error handling
  program.exitOverride();

  process.on("uncaughtException", (error) => {
    Logger.error("Uncaught exception", {
      error: error.message,
      stack: error.stack,
    });
    console.error("Fatal error:", error.message);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    Logger.error("Unhandled promise rejection", { reason: String(reason) });
    console.error("Fatal error: Unhandled promise rejection:", reason);
    process.exit(1);
  });

  return program;
}

export function runCLI(args?: string[]): void {
  const program = createCLI();

  try {
    program.parse(args);
  } catch (error) {
    Logger.error("CLI execution failed", { error: String(error) });
    console.error(
      "CLI Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
