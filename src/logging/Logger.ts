export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

export class Logger {
  private static logLevel: LogLevel = "info";
  private static logs: LogEntry[] = [];
  private static maxLogs: number = 1000;

  static setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  static getLogLevel(): LogLevel {
    return this.logLevel;
  }

  static debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, metadata);
  }

  static info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  static warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }

  static error(message: string, metadata?: Record<string, unknown>): void {
    this.log("error", message, metadata);
  }

  private static log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
    };

    // Store log entry
    this.logs.push(logEntry);

    // Trim logs if too many
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Output to console in non-test environments
    if (process.env.NODE_ENV !== "test") {
      this.outputToConsole(logEntry);
    }
  }

  private static shouldLog(level: LogLevel): boolean {
    const levelPriority = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    return levelPriority[level] >= levelPriority[this.logLevel];
  }

  private static outputToConsole(entry: LogEntry): void {
    const { timestamp, level, message, metadata } = entry;
    const timeStr = timestamp.substring(11, 19); // HH:MM:SS

    let prefix = "";
    switch (level) {
      case "debug":
        prefix = "🔍";
        break;
      case "info":
        prefix = "ℹ️ ";
        break;
      case "warn":
        prefix = "⚠️ ";
        break;
      case "error":
        prefix = "❌";
        break;
    }

    let output = `${timeStr} ${prefix} ${message}`;

    if (metadata && Object.keys(metadata).length > 0) {
      output += ` ${JSON.stringify(metadata)}`;
    }

    // Use appropriate console method
    switch (level) {
      case "debug":
        console.debug(output);
        break;
      case "info":
        console.info(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
  }

  // Utility methods for testing and debugging
  static getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter((log) => log.level === level);
    }
    return [...this.logs];
  }

  static getLastLog(): LogEntry | null {
    return this.logs.length > 0 ? this.logs[this.logs.length - 1] : null;
  }

  static clearLogs(): void {
    this.logs = [];
  }

  static getLogCount(level?: LogLevel): number {
    if (level) {
      return this.logs.filter((log) => log.level === level).length;
    }
    return this.logs.length;
  }

  // Initialize logger based on environment
  static initialize(): void {
    // Set log level from environment or default
    const envLogLevel = process.env.LOG_LEVEL as LogLevel;
    if (
      envLogLevel &&
      ["debug", "info", "warn", "error"].includes(envLogLevel)
    ) {
      this.setLogLevel(envLogLevel);
    } else {
      // Default log levels based on environment
      if (process.env.NODE_ENV === "development") {
        this.setLogLevel("debug");
      } else if (process.env.NODE_ENV === "test") {
        this.setLogLevel("warn"); // Reduce noise in tests
      } else {
        this.setLogLevel("info");
      }
    }
  }

  // Create scoped loggers for modules
  static createScoped(scope: string): {
    debug: (message: string, metadata?: Record<string, unknown>) => void;
    info: (message: string, metadata?: Record<string, unknown>) => void;
    warn: (message: string, metadata?: Record<string, unknown>) => void;
    error: (message: string, metadata?: Record<string, unknown>) => void;
  } {
    return {
      debug: (message: string, metadata?: Record<string, unknown>) =>
        this.debug(`[${scope}] ${message}`, metadata),
      info: (message: string, metadata?: Record<string, unknown>) =>
        this.info(`[${scope}] ${message}`, metadata),
      warn: (message: string, metadata?: Record<string, unknown>) =>
        this.warn(`[${scope}] ${message}`, metadata),
      error: (message: string, metadata?: Record<string, unknown>) =>
        this.error(`[${scope}] ${message}`, metadata),
    };
  }
}

// Initialize logger when module loads
Logger.initialize();
