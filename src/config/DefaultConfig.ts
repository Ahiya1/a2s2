export interface Config {
  logLevel: string;
  maxFileSize: number;
  commandTimeout: number;
  maxConcurrentOperations: number;
  enablePromptCaching: boolean;
  defaultPhase: "EXPLORE" | "SUMMON" | "COMPLETE";
  debugMode: boolean;
  // NEW: Streaming configuration options
  enableStreaming: boolean;
  showProgressIndicators: boolean;
  typewriterEffect: boolean;
  streamingBufferSize: number;
  streamingTimeout: number;
  enableCancellation: boolean;
}

export const DefaultConfig: Config = {
  logLevel: process.env.LOG_LEVEL || "info",
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "10485760", 10), // 10MB default
  commandTimeout: parseInt(process.env.COMMAND_TIMEOUT || "3000000", 10), // 300 seconds default
  maxConcurrentOperations: 5,
  enablePromptCaching: true,
  defaultPhase: "EXPLORE",
  debugMode: process.env.NODE_ENV === "development",
  // NEW: Streaming defaults
  enableStreaming: process.env.DISABLE_STREAMING !== "true",
  showProgressIndicators: process.env.HIDE_PROGRESS !== "true",
  typewriterEffect: process.env.ENABLE_TYPEWRITER === "true",
  streamingBufferSize: parseInt(process.env.STREAMING_BUFFER_SIZE || "64", 10),
  streamingTimeout: parseInt(process.env.STREAMING_TIMEOUT || "3000000", 10),
  enableCancellation: process.env.DISABLE_CANCELLATION !== "true",
};
