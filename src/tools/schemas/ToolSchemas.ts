import { z } from "zod";

export const FoundationAnalyzerSchema = z.object({
  path: z.string().optional().default("."), // Default to current directory
});

export const FileReaderSchema = z.object({
  paths: z.array(z.string()).min(1, "At least one file path is required"),
});

export const FileWriterSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1, "File path cannot be empty"),
        content: z.string(),
      })
    )
    .min(1, "At least one file is required"),
});

export const ShellExecutorSchema = z.object({
  command: z.string().min(1, "Command cannot be empty"),
  timeout: z.number().positive().optional(),
});

export type FoundationAnalyzerParams = z.infer<typeof FoundationAnalyzerSchema>;
export type FileReaderParams = z.infer<typeof FileReaderSchema>;
export type FileWriterParams = z.infer<typeof FileWriterSchema>;
export type ShellExecutorParams = z.infer<typeof ShellExecutorSchema>;
