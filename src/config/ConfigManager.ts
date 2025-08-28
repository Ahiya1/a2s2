import { DefaultConfig, Config } from "./DefaultConfig";

export class ConfigManager {
  private static config: Config = { ...DefaultConfig };

  static getConfig(): Config {
    return { ...this.config };
  }

  static updateConfig(updates: Partial<Config>): void {
    this.config = { ...this.config, ...updates };
  }

  static reset(): void {
    this.config = { ...DefaultConfig };
  }

  static loadFromEnv(): void {
    if (process.env.LOG_LEVEL) {
      this.config.logLevel = process.env.LOG_LEVEL;
    }
    if (process.env.MAX_FILE_SIZE) {
      this.config.maxFileSize = parseInt(process.env.MAX_FILE_SIZE, 10);
    }
    if (process.env.COMMAND_TIMEOUT) {
      this.config.commandTimeout = parseInt(process.env.COMMAND_TIMEOUT, 10);
    }
  }
}
