import { Command } from "commander";
import { EnvLoader } from "../../config/EnvLoader";
import { OutputFormatter } from "../utils/output";
import { Logger } from "../../logging/Logger";

export function createConfigCommand(): Command {
  return new Command("config")
    .description("Configure a2s2 settings and API keys")
    .option("--setup", "Interactive API key setup")
    .option("--status", "Show current configuration status")
    .option("--help-env", "Show detailed environment setup instructions")
    .action(
      async (options: {
        setup?: boolean;
        status?: boolean;
        helpEnv?: boolean;
      }) => {
        try {
          if (options.setup) {
            await handleInteractiveSetup();
          } else if (options.status) {
            handleStatusCheck();
          } else if (options.helpEnv) {
            handleEnvHelp();
          } else {
            // Default: show current status
            handleDefaultConfig();
          }
        } catch (error) {
          OutputFormatter.formatError(
            `Configuration failed: ${error instanceof Error ? error.message : String(error)}`
          );

          Logger.error("Config command failed", {
            error: String(error),
          });

          process.exit(1);
        }
      }
    );
}

async function handleInteractiveSetup(): Promise<void> {
  OutputFormatter.formatHeader("a2s2 Interactive Setup");

  const { missing, present } = EnvLoader.checkRequiredEnvVars();

  if (missing.length === 0) {
    OutputFormatter.formatSuccess(
      "All required environment variables are already set!"
    );
    EnvLoader.getCurrentEnvStatus();
    return;
  }

  console.log("🚀 Let's get you set up with a2s2!\n");
  console.log(
    "This will help you configure your Anthropic API key for autonomous agent features.\n"
  );

  const success = await EnvLoader.quickSetup();

  if (success) {
    console.log(
      "\n🎉 Setup complete! You can now use a2s2 from any directory."
    );
    console.log("\n💡 Try these commands:");
    console.log("   a2s2 status --detailed");
    console.log('   a2s2 breathe "Create a README.md file" --dry-run');
    console.log("   a2s2 continue --help");
  } else {
    console.log(
      "\n❌ Setup failed. Please check the manual setup instructions:"
    );
    console.log("   a2s2 config --help-env");
  }
}

function handleStatusCheck(): void {
  OutputFormatter.formatHeader("a2s2 Configuration Status");
  EnvLoader.getCurrentEnvStatus();

  const { missing } = EnvLoader.checkRequiredEnvVars();

  if (missing.length === 0) {
    OutputFormatter.formatSuccess("✅ All required configuration is present!");
    console.log("\n🚀 Ready to use autonomous agent features:");
    console.log("   • Autonomous project creation with 'breathe' command");
    console.log("   • Continue and enhance existing work");
    console.log("   • Web search integration for current best practices");
    console.log("   • Advanced cost management and monitoring");
  } else {
    OutputFormatter.formatWarning("⚠️  Missing required configuration");
    console.log("\n🔧 To complete setup, run: a2s2 config --setup");
  }
}

function handleEnvHelp(): void {
  OutputFormatter.formatHeader("Environment Setup Instructions");
  EnvLoader.displaySetupInstructions();

  console.log("🔍 Troubleshooting:");
  console.log("• Run 'a2s2 config --status' to check current configuration");
  console.log("• Make sure your API key starts with 'sk-ant-'");
  console.log("• Verify your Anthropic account has API access");
  console.log("• Check https://console.anthropic.com/ for your API keys");
  console.log("");
  console.log("🆘 Still having issues?");
  console.log("• Try the interactive setup: a2s2 config --setup");
  console.log("• Check the logs with --verbose flag");
  console.log("• Verify file permissions in your home directory");
}

function handleDefaultConfig(): void {
  OutputFormatter.formatHeader("a2s2 Configuration");

  const { missing, present } = EnvLoader.checkRequiredEnvVars();

  console.log("📊 Quick Status:");
  if (present.length > 0) {
    present.forEach((key) => {
      console.log(`   ✅ ${key}: Configured`);
    });
  }

  if (missing.length > 0) {
    missing.forEach((key) => {
      console.log(`   ❌ ${key}: Missing`);
    });
  }

  console.log("");
  console.log("📋 Available Commands:");
  console.log("   a2s2 config --setup      Interactive API key setup");
  console.log("   a2s2 config --status     Detailed configuration status");
  console.log("   a2s2 config --help-env   Complete setup instructions");

  if (missing.length > 0) {
    console.log("");
    OutputFormatter.formatInfo("💡 Quick start: a2s2 config --setup");
  } else {
    console.log("");
    OutputFormatter.formatSuccess(
      '🚀 Ready to use! Try: a2s2 breathe "your vision here"'
    );
  }
}
