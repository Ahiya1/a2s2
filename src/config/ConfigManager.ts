import { Config, DefaultConfig } from "./DefaultConfig";
import { Logger } from "../logging/Logger";

export class ConfigManager {
  private static config: Config = { ...DefaultConfig };

  static loadFromEnv(): void {
    try {
      // Load existing environment configurations
      if (process.env.LOG_LEVEL) {
        ConfigManager.config.logLevel = process.env.LOG_LEVEL;
      }

      if (process.env.MAX_FILE_SIZE) {
        ConfigManager.config.maxFileSize = parseInt(
          process.env.MAX_FILE_SIZE,
          10
        );
      }

      if (process.env.COMMAND_TIMEOUT) {
        ConfigManager.config.commandTimeout = parseInt(
          process.env.COMMAND_TIMEOUT,
          10
        );
      }

      if (process.env.ENABLE_PROMPT_CACHING) {
        ConfigManager.config.enablePromptCaching =
          process.env.ENABLE_PROMPT_CACHING === "true";
      }

      if (process.env.DEBUG_MODE) {
        ConfigManager.config.debugMode = process.env.DEBUG_MODE === "true";
      }

      // NEW: Load streaming configuration from environment
      if (process.env.DISABLE_STREAMING) {
        ConfigManager.config.enableStreaming =
          process.env.DISABLE_STREAMING !== "true";
      }

      if (process.env.HIDE_PROGRESS) {
        ConfigManager.config.showProgressIndicators =
          process.env.HIDE_PROGRESS !== "true";
      }

      if (process.env.ENABLE_TYPEWRITER) {
        ConfigManager.config.typewriterEffect =
          process.env.ENABLE_TYPEWRITER === "true";
      }

      if (process.env.STREAMING_BUFFER_SIZE) {
        const bufferSize = parseInt(process.env.STREAMING_BUFFER_SIZE, 10);
        if (!isNaN(bufferSize) && bufferSize > 0) {
          ConfigManager.config.streamingBufferSize = bufferSize;
        }
      }

      if (process.env.STREAMING_TIMEOUT) {
        const timeout = parseInt(process.env.STREAMING_TIMEOUT, 10);
        if (!isNaN(timeout) && timeout > 0) {
          ConfigManager.config.streamingTimeout = timeout;
        }
      }

      if (process.env.DISABLE_CANCELLATION) {
        ConfigManager.config.enableCancellation =
          process.env.DISABLE_CANCELLATION !== "true";
      }

      // Disable streaming and progress in non-interactive environments
      if (!process.stdout.isTTY || process.env.NODE_ENV === "test") {
        ConfigManager.config.showProgressIndicators = false;
        ConfigManager.config.typewriterEffect = false;
      }

      Logger.debug("Configuration loaded from environment", {
        config: ConfigManager.config,
        streamingEnabled: ConfigManager.config.enableStreaming,
        progressEnabled: ConfigManager.config.showProgressIndicators,
      });
    } catch (error) {
      Logger.error("Error loading configuration from environment", {
        error: (error as Error).message,
      });
      // Keep default configuration if environment loading fails
    }
  }

  static getConfig(): Config {
    return { ...ConfigManager.config };
  }

  static updateConfig(updates: Partial<Config>): void {
    ConfigManager.config = { ...ConfigManager.config, ...updates };

    Logger.debug("Configuration updated", {
      updates,
      newConfig: ConfigManager.config,
    });
  }

  static resetToDefaults(): void {
    ConfigManager.config = { ...DefaultConfig };
    Logger.info("Configuration reset to defaults");
  }

  // NEW: Streaming-specific utilities
  static isStreamingEnabled(): boolean {
    return (
      ConfigManager.config.enableStreaming &&
      process.env.NODE_ENV !== "test" &&
      process.stdout.isTTY
    );
  }

  static shouldShowProgress(): boolean {
    return (
      ConfigManager.config.showProgressIndicators &&
      process.env.NODE_ENV !== "test" &&
      process.stdout.isTTY
    );
  }

  static getStreamingConfig(): {
    enabled: boolean;
    showProgress: boolean;
    typewriter: boolean;
    bufferSize: number;
    timeout: number;
    cancellation: boolean;
  } {
    return {
      enabled: ConfigManager.isStreamingEnabled(),
      showProgress: ConfigManager.shouldShowProgress(),
      typewriter: ConfigManager.config.typewriterEffect,
      bufferSize: ConfigManager.config.streamingBufferSize,
      timeout: ConfigManager.config.streamingTimeout,
      cancellation: ConfigManager.config.enableCancellation,
    };
  }

  // Validation utilities
  static validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (ConfigManager.config.maxFileSize < 1024) {
      errors.push("maxFileSize must be at least 1KB");
    }

    if (ConfigManager.config.commandTimeout < 1000) {
      errors.push("commandTimeout must be at least 1 second");
    }

    if (ConfigManager.config.maxConcurrentOperations < 1) {
      errors.push("maxConcurrentOperations must be at least 1");
    }

    // NEW: Validate streaming configuration
    if (
      ConfigManager.config.streamingBufferSize < 1 ||
      ConfigManager.config.streamingBufferSize > 1000
    ) {
      errors.push("streamingBufferSize must be between 1 and 1000");
    }

    if (
      ConfigManager.config.streamingTimeout < 1000 ||
      ConfigManager.config.streamingTimeout > 3000000
    ) {
      errors.push("streamingTimeout must be between 1 second and 5 minutes");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static getConfigSummary(): {
    logLevel: string;
    streaming: boolean;
    progress: boolean;
    typewriter: boolean;
    caching: boolean;
    environment: string;
  } {
    return {
      logLevel: ConfigManager.config.logLevel,
      streaming: ConfigManager.isStreamingEnabled(),
      progress: ConfigManager.shouldShowProgress(),
      typewriter: ConfigManager.config.typewriterEffect,
      caching: ConfigManager.config.enablePromptCaching,
      environment: process.env.NODE_ENV || "development",
    };
  }

  // Debug utilities
  static dumpConfig(): void {
    console.log("Current Configuration:");
    console.log(JSON.stringify(ConfigManager.config, null, 2));
  }

  static getEnvironmentOverrides(): Record<string, string> {
    const overrides: Record<string, string> = {};

    const envVars = [
      "LOG_LEVEL",
      "MAX_FILE_SIZE",
      "COMMAND_TIMEOUT",
      "ENABLE_PROMPT_CACHING",
      "DEBUG_MODE",
      "DISABLE_STREAMING",
      "HIDE_PROGRESS",
      "ENABLE_TYPEWRITER",
      "STREAMING_BUFFER_SIZE",
      "STREAMING_TIMEOUT",
      "DISABLE_CANCELLATION",
    ];

    envVars.forEach((envVar) => {
      if (process.env[envVar]) {
        overrides[envVar] = process.env[envVar]!;
      }
    });

    return overrides;
  }
}
