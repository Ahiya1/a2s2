import winston from "winston";

export class Logger {
  private static instance: winston.Logger;

  static getInstance(): winston.Logger {
    if (!this.instance) {
      this.instance = winston.createLogger({
        level: process.env.LOG_LEVEL || "info",
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            ),
          }),
        ],
      });
    }
    return this.instance;
  }

  static info(message: string, meta?: Record<string, unknown>): void {
    this.getInstance().info(message, meta);
  }

  static error(message: string, meta?: Record<string, unknown>): void {
    this.getInstance().error(message, meta);
  }

  static warn(message: string, meta?: Record<string, unknown>): void {
    this.getInstance().warn(message, meta);
  }

  static debug(message: string, meta?: Record<string, unknown>): void {
    this.getInstance().debug(message, meta);
  }
}
