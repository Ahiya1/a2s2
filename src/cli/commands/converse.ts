import { Command } from "commander";
import { InteractiveConversationManager } from "../../conversation/InteractiveConversationManager";
import { OutputFormatter } from "../utils/output";
import { Logger } from "../../logging/Logger";
import { EnvLoader } from "../../config/EnvLoader";

export function createConverseCommand(): Command {
  return new Command("converse")
    .description(
      "Interactive conversation mode - chat directly with Claude agent with tool access"
    )
    .option(
      "--directory <dir>",
      "Working directory for analysis and execution",
      process.cwd()
    )
    .option("--verbose", "Enable verbose output")
    .option("--no-web-search", "Disable web search capabilities")
    .option(
      "--cost-budget <amount>",
      "Set maximum cost budget for the conversation (in USD)",
      parseFloat
    )
    .action(
      async (options: {
        directory: string;
        verbose: boolean;
        webSearch: boolean;
        costBudget?: number;
      }) => {
        const startTime = Date.now();

        try {
          if (options.verbose) {
            console.log("🔧 Configuration:");
            console.log(`  Directory: ${options.directory}`);
            console.log(`  Verbose: ${options.verbose}`);
            console.log(`  Web Search: ${options.webSearch}`);
            console.log(
              `  Cost Budget: ${options.costBudget ? "$" + options.costBudget.toFixed(2) : "None"}`
            );
            console.log("");
          }

          // Validate environment first
          validateEnvironment();

          // Validate directory exists
          validateDirectory(options.directory);

          // Create interactive conversation manager
          const interactiveManager = new InteractiveConversationManager({
            workingDirectory: options.directory,
            verbose: options.verbose,
            enableWebSearch: options.webSearch,
            costBudget: options.costBudget,
          });

          OutputFormatter.formatHeader("a2s2 Interactive Agent Conversation");

          // Start interactive conversation
          const result =
            await interactiveManager.startInteractiveConversation();

          if (result.success) {
            OutputFormatter.formatSuccess(
              "Conversation completed successfully!"
            );

            console.log("");
            console.log("📊 Session Summary:");
            console.log(`  • Conversation ID: ${result.conversationId}`);
            console.log(`  • Messages exchanged: ${result.messageCount}`);
            console.log(`  • Total cost: $${result.totalCost.toFixed(4)}`);
            console.log(
              `  • Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`
            );

            // Offer next steps
            console.log("");
            console.log("✨ What's next?");
            console.log(
              "  • Run 'a2s2 converse' again to start a new conversation"
            );
            console.log(
              "  • Use 'a2s2 breathe \"<your task>\"' for autonomous execution"
            );
            console.log("  • Check 'a2s2 --help' for other available commands");
          } else {
            OutputFormatter.formatError("Conversation failed or was cancelled");
            if (result.error) {
              console.log(`❌ Error: ${result.error}`);
            }
          }

          OutputFormatter.formatDuration(startTime);
        } catch (error) {
          const errorMessage = `Interactive conversation failed: ${error instanceof Error ? error.message : String(error)}`;

          OutputFormatter.formatError(errorMessage);

          Logger.error("Converse command failed", {
            error: String(error),
            directory: options.directory,
          });

          OutputFormatter.formatDuration(startTime);

          // Only use process.exit in non-test environments
          if (process.env.NODE_ENV !== "test") {
            process.exit(1);
          } else {
            throw new Error("Process exit called");
          }
        }
      }
    );
}

function validateEnvironment(): void {
  // Check for required environment variables
  const { missing } = EnvLoader.checkRequiredEnvVars();
  if (missing.length > 0) {
    console.log("");
    OutputFormatter.formatError(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.log("");
    console.log("🔧 Quick fix options:");
    console.log("");
    console.log("1️⃣  Interactive setup (recommended):");
    console.log("   a2s2 config --setup");
    console.log("");
    console.log("2️⃣  Manual setup:");
    console.log("   a2s2 config --help-env");
    console.log("");
    console.log("3️⃣  Quick command:");
    console.log(`   echo "ANTHROPIC_API_KEY=your-key-here" > ~/.a2s2.env`);
    console.log("");
    console.log("🔑 Get your API key: https://console.anthropic.com/");
    throw new Error(
      `ANTHROPIC_API_KEY environment variable is required. Missing: ${missing.join(", ")}`
    );
  }
}

function validateDirectory(directory: string): void {
  // Validate directory exists
  try {
    const fs = require("fs");
    if (!fs.existsSync(directory)) {
      throw new Error(`Directory does not exist: ${directory}`);
    }
  } catch (error) {
    if ((error as Error).message.includes("Directory does not exist")) {
      throw error; // Re-throw directory-specific error
    }
    throw new Error(`Cannot access directory: ${directory}`);
  }
}
