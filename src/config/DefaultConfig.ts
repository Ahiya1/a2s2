export interface Config {
  logLevel: string;
  maxFileSize: number;
  commandTimeout: number;
}

export const DefaultConfig: Config = {
  logLevel: "info",
  maxFileSize: 10 * 1024 * 1024, // 10MB
  commandTimeout: 300000, // 300 seconds
};
