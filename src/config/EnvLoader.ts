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
    const timeout = parseInt(process.env.COMMAND_TIMEOUT || "30000", 10);
    return Math.max(timeout, 1000); // Minimum 1 second
  }
}
