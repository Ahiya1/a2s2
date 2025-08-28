export interface Config {
  logLevel: string;
  maxFileSize: number;
  commandTimeout: number;
  maxConcurrentOperations: number;
  enablePromptCaching: boolean;
  defaultPhase: "EXPLORE" | "SUMMON" | "COMPLETE";
  debugMode: boolean;
}

export const DefaultConfig: Config = {
  logLevel: process.env.LOG_LEVEL || "info",
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "10485760", 10), // 10MB default
  commandTimeout: parseInt(process.env.COMMAND_TIMEOUT || "30000", 10), // 30 seconds default
  maxConcurrentOperations: 5,
  enablePromptCaching: true,
  defaultPhase: "EXPLORE",
  debugMode: process.env.NODE_ENV === "development",
};
