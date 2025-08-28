import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export class EnvLoader {
  private static loaded = false;

  static loadEnvironment(): void {
    if (this.loaded) return;

    const possibleEnvPaths = [
      // 1. Current working directory (where user runs the command)
      path.join(process.cwd(), ".env"),

      // 2. a2s2 installation directory (where the tool is installed)
      path.join(__dirname, "../..", ".env"),
      path.join(__dirname, "../../..", ".env"), // In case of different dist structure

      // 3. User's home directory
      path.join(os.homedir(), ".a2s2.env"),
      path.join(os.homedir(), ".env"),

      // 4. Parent directories (for project-based .env files)
      path.join(process.cwd(), "..", ".env"),
      path.join(process.cwd(), "../..", ".env"),
    ];

    let envLoaded = false;

    for (const envPath of possibleEnvPaths) {
      try {
        if (fs.existsSync(envPath)) {
          // Load the .env file
          const envContent = fs.readFileSync(envPath, "utf8");
          this.parseAndSetEnv(envContent);

          console.log(`🔧 Loaded environment from: ${envPath}`);
          envLoaded = true;
          break;
        }
      } catch (error) {
        // Continue to next path
        continue;
      }
    }

    if (!envLoaded) {
      console.log(
        "ℹ️  No .env file found. Using system environment variables only."
      );
    }

    this.loaded = true;
  }

  private static parseAndSetEnv(content: string): void {
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Parse KEY=VALUE format
      const equalIndex = trimmed.indexOf("=");
      if (equalIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, equalIndex).trim();
      let value = trimmed.slice(equalIndex + 1).trim();

      // Remove surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Only set if not already defined (system env takes precedence)
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  static checkRequiredEnvVars(): { missing: string[]; present: string[] } {
    const required = ["ANTHROPIC_API_KEY"];
    const optional = ["TAVILY_API_KEY", "LOG_LEVEL"];

    const missing: string[] = [];
    const present: string[] = [];

    for (const key of required) {
      if (process.env[key]) {
        present.push(key);
      } else {
        missing.push(key);
      }
    }

    return { missing, present };
  }

  static displaySetupInstructions(): void {
    console.log("🔧 a2s2 API Key Setup Instructions\n");

    console.log(
      "📍 You can set your ANTHROPIC_API_KEY in any of these ways:\n"
    );

    console.log("🏠 Option 1: Home directory (recommended for global use)");
    console.log(
      `   echo "ANTHROPIC_API_KEY=your-key-here" > ${path.join(os.homedir(), ".a2s2.env")}`
    );
    console.log("");

    console.log("📂 Option 2: Current project directory");
    console.log(
      `   echo "ANTHROPIC_API_KEY=your-key-here" > ${path.join(process.cwd(), ".env")}`
    );
    console.log("");

    console.log("🛠️  Option 3: a2s2 installation directory");
    console.log(
      `   echo "ANTHROPIC_API_KEY=your-key-here" > ${path.join(__dirname, "../..", ".env")}`
    );
    console.log("");

    console.log("🌐 Option 4: System environment variable");
    console.log('   export ANTHROPIC_API_KEY="your-key-here"');
    console.log(
      "   echo 'export ANTHROPIC_API_KEY=\"your-key-here\"' >> ~/.bashrc"
    );
    console.log("");

    console.log("🔑 Get your API key from: https://console.anthropic.com/");
    console.log("");

    console.log("After setting up, test with: a2s2 status");
  }

  static getCurrentEnvStatus(): void {
    const { missing, present } = this.checkRequiredEnvVars();

    console.log("📊 Current Environment Status:\n");

    if (present.length > 0) {
      console.log("✅ Found:");
      present.forEach((key) => {
        const value = process.env[key] || "";
        const masked = key.includes("KEY")
          ? value.substring(0, 8) + "..." + value.substring(value.length - 4)
          : value;
        console.log(`   ${key}: ${masked}`);
      });
      console.log("");
    }

    if (missing.length > 0) {
      console.log("❌ Missing:");
      missing.forEach((key) => {
        console.log(`   ${key}: Required for autonomous agent features`);
      });
      console.log("");
    }

    console.log(`🔍 Checked paths:`);
    const possibleEnvPaths = [
      path.join(process.cwd(), ".env"),
      path.join(__dirname, "../..", ".env"),
      path.join(os.homedir(), ".a2s2.env"),
      path.join(os.homedir(), ".env"),
    ];

    possibleEnvPaths.forEach((envPath) => {
      const exists = fs.existsSync(envPath);
      console.log(`   ${exists ? "✅" : "⚪"} ${envPath}`);
    });
  }

  // Quick setup helper
  static async quickSetup(): Promise<boolean> {
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question("\n🔑 Enter your ANTHROPIC_API_KEY: ", (apiKey: string) => {
        if (!apiKey.trim()) {
          console.log("❌ No API key provided");
          rl.close();
          resolve(false);
          return;
        }

        if (!apiKey.startsWith("sk-ant-")) {
          console.log('⚠️  Warning: API key should start with "sk-ant-"');
        }

        // Choose best location for .env file
        const envPath = path.join(os.homedir(), ".a2s2.env");
        const envContent = `ANTHROPIC_API_KEY=${apiKey.trim()}\n`;

        try {
          fs.writeFileSync(envPath, envContent);
          console.log(`✅ API key saved to: ${envPath}`);
          console.log("🚀 You can now use a2s2 from any directory!");

          // Reload environment
          process.env.ANTHROPIC_API_KEY = apiKey.trim();

          rl.close();
          resolve(true);
        } catch (error) {
          console.log(`❌ Failed to save API key: ${error}`);
          rl.close();
          resolve(false);
        }
      });
    });
  }
}
