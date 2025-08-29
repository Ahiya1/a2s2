import * as fs from "fs";
import * as path from "path";
import { Logger } from "../logging/Logger";

export interface EnvCheckResult {
  missing: string[];
  present: string[];
  optional: string[];
}

export class EnvLoader {
  private static readonly REQUIRED_ENV_VARS = ["ANTHROPIC_API_KEY"];

  private static readonly OPTIONAL_ENV_VARS = [
    "LOG_LEVEL",
    "MAX_FILE_SIZE",
    "COMMAND_TIMEOUT",
    "NODE_ENV",
  ];

  static load(): void {
    // Try loading from .env files in various locations
    const possibleEnvFiles = [
      ".env",
      ".env.local",
      path.join(process.env.HOME || "~", ".a2s2.env"),
    ];

    for (const envFile of possibleEnvFiles) {
      try {
        if (fs.existsSync(envFile)) {
          this.loadFromFile(envFile);
          Logger.debug(`Loaded environment variables from ${envFile}`);
        }
      } catch (error) {
        Logger.warn(`Failed to load ${envFile}`, {
          error: (error as Error).message,
        });
      }
    }

    // Load from process.env as fallback
    this.loadFromProcessEnv();
  }

  // FIXED: Add missing getCurrentEnvStatus method
  static getCurrentEnvStatus(): void {
    console.log("🔧 Current Environment Status:");
    console.log("");

    const { missing, present, optional } = this.checkRequiredEnvVars();

    // Required variables
    console.log("📋 Required Variables:");
    for (const varName of this.REQUIRED_ENV_VARS) {
      if (present.includes(varName)) {
        console.log(`  ✅ ${varName}: Set`);
      } else {
        console.log(`  ❌ ${varName}: Missing`);
      }
    }

    // Optional variables
    console.log("");
    console.log("⚙️  Optional Variables:");
    for (const varName of this.OPTIONAL_ENV_VARS) {
      if (process.env[varName]) {
        console.log(`  ✅ ${varName}: ${process.env[varName]}`);
      } else {
        console.log(`  ⚪ ${varName}: Not set (using defaults)`);
      }
    }

    // API Key validation
    console.log("");
    const apiKeyValid = this.validateApiKey();
    console.log(
      `🔑 API Key Validation: ${apiKeyValid ? "✅ Valid" : "❌ Invalid"}`
    );

    // Environment files check
    console.log("");
    console.log("📁 Environment Files:");
    const envFiles = [
      ".env",
      ".env.local",
      path.join(process.env.HOME || "~", ".a2s2.env"),
    ];
    for (const file of envFiles) {
      if (fs.existsSync(file)) {
        console.log(`  ✅ ${file}: Found`);
      } else {
        console.log(`  ⚪ ${file}: Not found`);
      }
    }
  }

  // FIXED: Add missing quickSetup method
  static async quickSetup(): Promise<boolean> {
    try {
      // Check if we're in a test environment
      if (process.env.NODE_ENV === "test") {
        console.log("Test environment detected - skipping interactive setup");
        return true;
      }

      const readline = require("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const question = (prompt: string): Promise<string> => {
        return new Promise((resolve) => {
          rl.question(prompt, resolve);
        });
      };

      try {
        console.log("🔑 Interactive API Key Setup");
        console.log("");
        console.log("To use a2s2, you need an Anthropic API key.");
        console.log("Get your API key from: https://console.anthropic.com/");
        console.log("");

        const apiKey = await question(
          "Please enter your Anthropic API key (starts with 'sk-ant-'): "
        );

        if (!apiKey || !apiKey.startsWith("sk-ant-")) {
          console.log(
            "❌ Invalid API key format. API keys should start with 'sk-ant-'"
          );
          return false;
        }

        // Save to ~/.a2s2.env file
        const envFile = path.join(process.env.HOME || "~", ".a2s2.env");
        const envContent = `ANTHROPIC_API_KEY=${apiKey}\n`;

        try {
          fs.writeFileSync(envFile, envContent);
          console.log(`✅ API key saved to ${envFile}`);

          // Set in current process
          process.env.ANTHROPIC_API_KEY = apiKey;

          console.log("✅ Environment configured successfully!");
          return true;
        } catch (error) {
          console.log(`❌ Failed to save API key: ${(error as Error).message}`);
          console.log("You can manually create ~/.a2s2.env with:");
          console.log(`ANTHROPIC_API_KEY=${apiKey}`);
          return false;
        }
      } finally {
        rl.close();
      }
    } catch (error) {
      Logger.error("Quick setup failed", { error: (error as Error).message });
      console.log(`❌ Setup failed: ${(error as Error).message}`);
      return false;
    }
  }

  // FIXED: Add missing displaySetupInstructions method
  static displaySetupInstructions(): void {
    console.log("🔧 Complete a2s2 Environment Setup Instructions");
    console.log("");
    console.log(
      "┌─────────────────────────────────────────────────────────────────────┐"
    );
    console.log(
      "│                     ANTHROPIC API KEY SETUP                        │"
    );
    console.log(
      "└─────────────────────────────────────────────────────────────────────┘"
    );
    console.log("");
    console.log("Step 1: Get your API key");
    console.log("  • Visit: https://console.anthropic.com/");
    console.log("  • Sign in or create an account");
    console.log("  • Navigate to API Keys section");
    console.log("  • Create a new API key");
    console.log("  • Copy the key (starts with 'sk-ant-')");
    console.log("");
    console.log("Step 2: Set your API key (choose one method)");
    console.log("");
    console.log("  Method 1: Interactive Setup (Recommended)");
    console.log("  $ a2s2 config --setup");
    console.log("");
    console.log("  Method 2: Create ~/.a2s2.env file");
    console.log("  $ echo 'ANTHROPIC_API_KEY=your-key-here' > ~/.a2s2.env");
    console.log("");
    console.log("  Method 3: Create local .env file");
    console.log("  $ echo 'ANTHROPIC_API_KEY=your-key-here' > .env");
    console.log("");
    console.log("  Method 4: Export environment variable");
    console.log("  $ export ANTHROPIC_API_KEY=your-key-here");
    console.log("");
    console.log(
      "┌─────────────────────────────────────────────────────────────────────┐"
    );
    console.log(
      "│                      OPTIONAL CONFIGURATION                        │"
    );
    console.log(
      "└─────────────────────────────────────────────────────────────────────┘"
    );
    console.log("");
    console.log("Optional environment variables:");
    console.log("  LOG_LEVEL=debug          # Enable debug logging");
    console.log("  MAX_FILE_SIZE=20971520   # Max file size (20MB)");
    console.log("  COMMAND_TIMEOUT=60000    # Command timeout (60s)");
    console.log("");
    console.log("Example ~/.a2s2.env file:");
    console.log("  ANTHROPIC_API_KEY=sk-ant-your-key-here");
    console.log("  LOG_LEVEL=info");
    console.log("  MAX_FILE_SIZE=10485760");
    console.log("  COMMAND_TIMEOUT=3000000");
    console.log("");
    console.log(
      "┌─────────────────────────────────────────────────────────────────────┐"
    );
    console.log(
      "│                         VERIFICATION                               │"
    );
    console.log(
      "└─────────────────────────────────────────────────────────────────────┘"
    );
    console.log("");
    console.log("Verify your setup:");
    console.log("  $ a2s2 config --status");
    console.log("");
    console.log("Test basic functionality:");
    console.log("  $ a2s2 analyze .");
    console.log("  $ a2s2 read package.json");
    console.log("");
    console.log("Start autonomous agent:");
    console.log('  $ a2s2 breathe "Create a README.md file" --dry-run');
    console.log("");
    console.log("📚 Documentation: https://github.com/your-org/a2s2");
    console.log("🆘 Support: https://github.com/your-org/a2s2/issues");
  }

  static checkRequiredEnvVars(): EnvCheckResult {
    const missing: string[] = [];
    const present: string[] = [];
    const optional: string[] = [];

    // Check required variables
    for (const varName of this.REQUIRED_ENV_VARS) {
      if (process.env[varName]) {
        present.push(varName);
      } else {
        missing.push(varName);
      }
    }

    // Check optional variables
    for (const varName of this.OPTIONAL_ENV_VARS) {
      if (process.env[varName]) {
        optional.push(varName);
      }
    }

    return { missing, present, optional };
  }

  static validateApiKey(apiKey?: string): boolean {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    return !!(key && key.startsWith("sk-ant-") && key.length > 20);
  }

  static getEnvSummary(): {
    hasRequiredVars: boolean;
    apiKeyValid: boolean;
    optionalVarsSet: number;
    suggestions: string[];
  } {
    const { missing } = this.checkRequiredEnvVars();
    const apiKeyValid = this.validateApiKey();
    const optionalVarsSet = this.OPTIONAL_ENV_VARS.filter(
      (varName) => process.env[varName]
    ).length;

    const suggestions: string[] = [];

    if (missing.length > 0) {
      suggestions.push(`Set missing required variables: ${missing.join(", ")}`);
    }

    if (!apiKeyValid) {
      suggestions.push(
        "Verify ANTHROPIC_API_KEY format (should start with 'sk-ant-')"
      );
    }

    if (optionalVarsSet < 2) {
      suggestions.push(
        "Consider setting LOG_LEVEL and other optional configuration"
      );
    }

    return {
      hasRequiredVars: missing.length === 0,
      apiKeyValid,
      optionalVarsSet,
      suggestions,
    };
  }

  private static loadFromFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key && valueParts.length > 0) {
            const value = valueParts.join("=").replace(/^['"]|['"]$/g, ""); // Remove quotes
            process.env[key] = value;
          }
        }
      }
    } catch (error) {
      Logger.warn(`Failed to parse env file ${filePath}`, {
        error: (error as Error).message,
      });
    }
  }

  private static loadFromProcessEnv(): void {
    // Ensure required variables are available
    const { missing } = this.checkRequiredEnvVars();

    if (missing.length > 0 && process.env.NODE_ENV !== "test") {
      Logger.warn("Missing required environment variables", {
        missing,
        suggestions: [
          "Create ~/.a2s2.env file",
          "Set ANTHROPIC_API_KEY environment variable",
          "Run 'a2s2 config --setup'",
        ],
      });
    }
  }

  // Helper methods for specific environment configurations
  static isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  }

  static isDevelopment(): boolean {
    return process.env.NODE_ENV === "development";
  }

  static isTest(): boolean {
    return process.env.NODE_ENV === "test";
  }

  static getLogLevel(): string {
    return process.env.LOG_LEVEL || (this.isDevelopment() ? "debug" : "info");
  }

  static getMaxFileSize(): number {
    const size = parseInt(process.env.MAX_FILE_SIZE || "10485760", 10);
    return Math.max(size, 1024); // Minimum 1KB
  }

  static getCommandTimeout(): number {
    const timeout = parseInt(process.env.COMMAND_TIMEOUT || "3000000", 10);
    return Math.max(timeout, 1000); // Minimum 1 second
  }
}
