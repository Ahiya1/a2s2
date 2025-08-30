import { z } from "zod";

// Existing schemas
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

// NEW: Git tool schema
export const GitToolSchema = z.object({
  operation: z
    .enum([
      "init",
      "status",
      "add",
      "commit",
      "push",
      "pull",
      "branch",
      "checkout",
      "log",
      "diff",
      "clone",
      "remote",
    ])
    .describe("Git operation to perform"),
  options: z
    .object({
      directory: z
        .string()
        .optional()
        .describe("Working directory (defaults to current)"),
      message: z
        .string()
        .optional()
        .describe("Commit message (for commit operation)"),
      files: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Files to add/diff"),
      branch: z.string().optional().describe("Branch name"),
      remote: z
        .string()
        .optional()
        .describe("Remote name (defaults to origin)"),
      url: z
        .string()
        .optional()
        .describe("Repository URL (for clone/remote add)"),
      action: z
        .enum(["list", "create", "delete", "add", "remove"])
        .optional()
        .describe("Sub-action for branch/remote operations"),
      name: z.string().optional().describe("Name for remote operations"),
      force: z.boolean().optional().describe("Force operation"),
      create: z
        .boolean()
        .optional()
        .describe("Create new branch during checkout"),
      shallow: z.boolean().optional().describe("Shallow clone"),
      staged: z.boolean().optional().describe("Show staged changes in diff"),
      limit: z.number().positive().optional().describe("Limit for log entries"),
      oneline: z.boolean().optional().describe("One line per commit in log"),
      bare: z.boolean().optional().describe("Create bare repository"),
      allowEmpty: z.boolean().optional().describe("Allow empty commits"),
      timeout: z
        .number()
        .positive()
        .optional()
        .describe("Command timeout in milliseconds"),
    })
    .optional()
    .default({}),
});

// NEW: Validation tool schema
export const ValidationToolSchema = z.object({
  type: z
    .enum([
      "typescript",
      "javascript",
      "eslint",
      "test",
      "build",
      "format",
      "custom",
    ])
    .describe("Type of validation to perform"),
  options: z
    .object({
      directory: z
        .string()
        .optional()
        .describe("Working directory (defaults to current)"),
      files: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Specific files to validate"),
      command: z.string().optional().describe("Custom validation command"),
      fix: z
        .boolean()
        .optional()
        .describe("Attempt to fix issues automatically"),
      strict: z.boolean().optional().describe("Use strict validation rules"),
      config: z.string().optional().describe("Path to validation config file"),
      timeout: z
        .number()
        .positive()
        .optional()
        .describe("Command timeout in milliseconds"),
      format: z
        .enum(["json", "text", "junit"])
        .optional()
        .describe("Output format"),
      failOnError: z
        .boolean()
        .optional()
        .describe("Fail validation on first error"),
      includeWarnings: z
        .boolean()
        .optional()
        .describe("Include warnings in results"),
    })
    .optional()
    .default({}),
});

// Type exports
export type FoundationAnalyzerParams = z.infer<typeof FoundationAnalyzerSchema>;
export type FileReaderParams = z.infer<typeof FileReaderSchema>;
export type FileWriterParams = z.infer<typeof FileWriterSchema>;
export type ShellExecutorParams = z.infer<typeof ShellExecutorSchema>;
export type GitToolParams = z.infer<typeof GitToolSchema>;
export type ValidationToolParams = z.infer<typeof ValidationToolSchema>;

// Validation result interfaces
export interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  rule?: string;
  severity: "error" | "warning" | "info";
  type: "syntax" | "type" | "lint" | "test" | "build" | "format" | "custom";
  fixable?: boolean;
  suggestion?: string;
}

export interface ValidationResult {
  type: string;
  success: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    totalFiles: number;
    filesWithErrors: number;
    filesWithWarnings: number;
    totalErrors: number;
    totalWarnings: number;
    fixableIssues: number;
  };
  command: string;
  executionTime: number;
  rawOutput: string;
}

// Git operation result interfaces
export interface GitStatusResult {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  clean: boolean;
}

export interface GitCommitResult {
  hash: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitBranchResult {
  current: string;
  branches: string[];
  remote: string[];
}

// Schema validation helpers
export function validateGitParams(params: unknown): GitToolParams {
  return GitToolSchema.parse(params);
}

export function validateValidationParams(
  params: unknown
): ValidationToolParams {
  return ValidationToolSchema.parse(params);
}

// Schema utilities for error messages
export function getGitOperationHelp(operation: string): string {
  const helpMessages: Record<string, string> = {
    init: "Initialize a new git repository. Options: { bare?: boolean, directory?: string }",
    status: "Show repository status. Options: { directory?: string }",
    add: "Add files to staging area. Options: { files?: string|string[], directory?: string }",
    commit:
      "Create a commit. Options: { message: string, allowEmpty?: boolean, directory?: string }",
    push: "Push changes to remote. Options: { remote?: string, branch?: string, force?: boolean, directory?: string }",
    pull: "Pull changes from remote. Options: { remote?: string, branch?: string, directory?: string }",
    branch:
      "Manage branches. Options: { action: 'list'|'create'|'delete', branch?: string, force?: boolean, directory?: string }",
    checkout:
      "Switch branches or restore files. Options: { branch: string, create?: boolean, directory?: string }",
    log: "Show commit history. Options: { limit?: number, oneline?: boolean, directory?: string }",
    diff: "Show differences. Options: { staged?: boolean, files?: string|string[], directory?: string }",
    clone:
      "Clone repository. Options: { url: string, directory?: string, shallow?: boolean }",
    remote:
      "Manage remotes. Options: { action: 'list'|'add'|'remove', name?: string, url?: string, directory?: string }",
  };

  return helpMessages[operation] || `Unknown git operation: ${operation}`;
}

export function getValidationTypeHelp(type: string): string {
  const helpMessages: Record<string, string> = {
    typescript: "TypeScript compilation check. Uses 'tsc --noEmit' by default.",
    javascript: "JavaScript syntax check. Uses Node.js syntax validation.",
    eslint:
      "ESLint code quality check. Options: { fix?: boolean, config?: string }",
    test: "Run test suite. Options: { command?: string, timeout?: number }",
    build: "Build project. Options: { command?: string, timeout?: number }",
    format:
      "Code formatting check. Options: { fix?: boolean, config?: string }",
    custom:
      "Custom validation command. Options: { command: string, timeout?: number }",
  };

  return helpMessages[type] || `Unknown validation type: ${type}`;
}

// Default configurations for common validation types
export const defaultValidationCommands: Record<string, string> = {
  typescript: "npx tsc --noEmit",
  javascript: "node --check",
  eslint: "npx eslint",
  test: "npm test",
  build: "npm run build",
  format: "npx prettier --check",
};

export const fixableValidationCommands: Record<string, string> = {
  eslint: "npx eslint --fix",
  format: "npx prettier --write",
  typescript: "npx tsc --noEmit", // TypeScript errors usually aren't auto-fixable
  javascript: "node --check", // JavaScript syntax errors aren't auto-fixable
};
