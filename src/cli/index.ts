import { Command } from "commander";
import { createAnalyzeCommand } from "./commands/analyze";
import { createReadCommand } from "./commands/read";
import { createValidateCommand } from "./commands/validate";
import { createBreatheCommand } from "./commands/breathe";
import { createContinueCommand } from "./commands/continue";
import { createStatusCommand } from "./commands/status";
import { createConfigCommand } from "./commands/config";
import { createConverseCommand } from "./commands/converse";
import { ConfigManager } from "../config/ConfigManager";
import { EnvLoader } from "../config/EnvLoader";
import { Logger } from "../logging/Logger";

export function createCLI(): Command {
  // Load environment variables from multiple possible locations
  // FIXED: Changed from loadEnvironment() to load()
  EnvLoader.load();

  // Load configuration from environment
  ConfigManager.loadFromEnv();

  const program = new Command();

  program
    .name("a2s2")
    .description(
      "Autonomous Agent System v2 - Complete autonomous software development"
    )
    .version("0.1.0")
    .configureHelp({
      sortSubcommands: true,
      subcommandTerm: (cmd) => cmd.name(),
      commandUsage: (cmd) => cmd.name() + " " + cmd.usage(),
    });

  // Register commands
  program.addCommand(createAnalyzeCommand());
  program.addCommand(createReadCommand());
  program.addCommand(createValidateCommand());

  // Autonomous agent commands (Phase 1B)
  program.addCommand(createBreatheCommand());
  program.addCommand(createContinueCommand());
  program.addCommand(createStatusCommand());
  
  // Limited conversation mode (NEW: Updated with breathe functionality)
  program.addCommand(createConverseCommand());

  // Configuration command
  program.addCommand(createConfigCommand());

  // Global options
  program.option("--verbose", "Enable verbose logging");
  program.option("--quiet", "Suppress non-essential output");
  program.option("--no-color", "Disable colored output");

  // Pre-command hooks
  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();

    if (opts.verbose) {
      process.env.LOG_LEVEL = "debug";
      ConfigManager.updateConfig({ logLevel: "debug" });
      Logger.info("Verbose logging enabled");
    }

    if (opts.quiet) {
      process.env.LOG_LEVEL = "error";
      ConfigManager.updateConfig({ logLevel: "error" });
    }
  });

  // Custom help sections
  program.addHelpText(
    "after",
    `\nExamples:\n  # Quick setup (first time users)\n  $ a2s2 config --setup\n\n  # Foundation tools (Phase 1A)\n  $ a2s2 analyze ./my-project --foundation\n  $ a2s2 read src/App.jsx src/utils.js\n  $ a2s2 validate --tools\n\n  # Autonomous agent (Phase 1B)\n  $ a2s2 breathe "Create a React todo app with TypeScript"\n  $ a2s2 continue "Add tests and improve error handling"\n  $ a2s2 status --detailed --health-check\n  \n  # NEW: Limited conversation mode with breathe functionality\n  $ a2s2 converse                               # Chat with limited agent\n  $ a2s2 converse --conversation-id <id>        # Resume conversation\n  $ a2s2 converse --list-conversations          # List saved conversations\n  $ a2s2 converse --clean-expired               # Clean up old conversations\n  \n  # During conversation, type 'breathe' to synthesize and execute!\n\nConversation Agent Changes:\n  NEW: Conversation and execution agents are now SEPARATED!\n  \n  • 'a2s2 converse' starts a LIMITED conversation agent\n  • It can ONLY read files and analyze projects (no writing/execution)\n  • Type 'breathe' during conversation to synthesize and execute autonomously\n  • Conversations are automatically saved and can be resumed\n  • No more re-analysis of projects when continuing conversations!\n\nEnvironment Setup:\n  The easiest way to get started is with the interactive setup:\n    $ a2s2 config --setup\n\n  Or manually set your API key in any of these locations:\n    ~/.a2s2.env              # Recommended for global use\n    ./.env                   # Project-specific\n    export ANTHROPIC_API_KEY # System environment\n\n  Get your API key from: https://console.anthropic.com/\n\nDocumentation:\n  Visit https://github.com/your-org/a2s2 for complete documentation\n`
  );

  // Global error handling
  program.exitOverride((err) => {
    if (err.code === "commander.help") {
      process.exit(0);
    } else if (err.code === "commander.version") {
      process.exit(0);
    } else if (err.code === "commander.helpDisplayed") {
      process.exit(0);
    } else {
      Logger.error("CLI error", {
        code: err.code,
        message: err.message,
      });
      process.exit(1);
    }
  });

  // Global error handlers
  process.on("uncaughtException", (error) => {
    Logger.error("Uncaught exception", {
      error: error.message,
      stack: error.stack,
    });
    console.error("💥 Fatal error:", error.message);
    console.error("Please check your configuration and try again.");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    Logger.error("Unhandled promise rejection", {
      reason: String(reason),
      promise: String(promise),
    });
    console.error("💥 Unhandled promise rejection:", reason);
    console.error("Please check your configuration and try again.");
    process.exit(1);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    Logger.info("Received SIGINT, shutting down gracefully");
    console.log("\n👋 Goodbye! Agent execution stopped.");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    Logger.info("Received SIGTERM, shutting down gracefully");
    console.log("\n👋 Goodbye! Agent execution terminated.");
    process.exit(0);
  });

  return program;
}

export function runCLI(args?: string[]): void {
  const program = createCLI();

  try {
    program.parse(args);
  } catch (error) {
    Logger.error("CLI execution failed", {
      error: String(error),
      args: args?.join(" "),
    });

    console.error(
      "CLI Error:",
      error instanceof Error ? error.message : String(error)
    );

    // Provide helpful context
    if (error instanceof Error) {
      if (error.message.includes("ANTHROPIC_API_KEY")) {
        console.error(
          "\n💡 Hint: Set the ANTHROPIC_API_KEY environment variable"
        );
        console.error(
          "   Get your API key from: https://console.anthropic.com/"
        );
        console.error("   Then run: export ANTHROPIC_API_KEY=your_key_here");
      } else if (error.message.includes("command not found")) {
        console.error("\n💡 Hint: Use 'a2s2 --help' to see available commands");
      } else if (error.message.includes("permission denied")) {
        console.error(
          "\n💡 Hint: Check file permissions in your working directory"
        );
      }
    }

    process.exit(1);
  }
}

// Export for testing and module usage
export {
  createAnalyzeCommand,
  createReadCommand,
  createValidateCommand,
  createBreatheCommand,
  createContinueCommand,
  createStatusCommand,
  createConverseCommand,
};