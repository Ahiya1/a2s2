import { z } from "zod";

export const AnalyzeCommandSchema = z.object({
  path: z.string().min(1, "Path cannot be empty"),
  foundation: z.boolean().optional(),
});

export const ReadCommandSchema = z.object({
  paths: z
    .array(z.string().min(1, "File path cannot be empty"))
    .min(1, "At least one file path is required"),
  incremental: z.boolean().optional(),
});

export const ValidateCommandSchema = z.object({
  tools: z.boolean().optional(),
  files: z.array(z.string()).optional(),
});

export const GeneralPathSchema = z
  .string()
  .min(1, "Path cannot be empty")
  .refine((path) => {
    // Basic path validation - no dangerous patterns
    const dangerousPatterns = ["../", "..\\"];
    return !dangerousPatterns.some((pattern) => path.includes(pattern));
  }, "Path contains potentially unsafe patterns");

export type AnalyzeCommandInput = z.infer<typeof AnalyzeCommandSchema>;
export type ReadCommandInput = z.infer<typeof ReadCommandSchema>;
export type ValidateCommandInput = z.infer<typeof ValidateCommandSchema>;
