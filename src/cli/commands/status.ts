import { Command } from "commander";
import { ToolManager } from "../../tools/ToolManager";
import { OutputFormatter } from "../utils/output";
import { Logger } from "../../logging/Logger";
import * as fs from "fs-extra";
import * as path from "path";

export interface ProjectStatus {
  directory: string;
  isGitRepo: boolean;
  hasPackageJson: boolean;
  hasReadme: boolean;
  technologies: string[];
  fileCount: number;
  lastModified: Date;
  projectHealth: "excellent" | "good" | "fair" | "poor";
  issues: string[];
  suggestions: string[];
}

export function createStatusCommand(): Command {
  return new Command("status")
    .description("Check project status and agent session information")
    .option("--directory <dir>", "Directory to analyze", process.cwd())
    .option("--detailed", "Show detailed analysis")
    .option("--health-check", "Perform comprehensive project health check")
    .option("--suggestions", "Show improvement suggestions")
    .option(
      "--format <format>",
      "Output format: table, json, summary",
      "summary"
    )
    .action(
      async (options: {
        directory: string;
        detailed: boolean;
        healthCheck: boolean;
        suggestions: boolean;
        format: string;
      }) => {
        const startTime = Date.now();

        try {
          OutputFormatter.formatHeader("a2s2 Project Status");

          // Analyze project status
          const status = await analyzeProjectStatus(options.directory, {
            detailed: options.detailed,
            healthCheck: options.healthCheck,
            includeSuggestions: options.suggestions,
          });

          // Display results based on format
          switch (options.format.toLowerCase()) {
            case "json":
              console.log(JSON.stringify(status, null, 2));
              break;
            case "table":
              displayTableFormat(status);
              break;
            case "summary":
            default:
              displaySummaryFormat(status, options);
              break;
          }

          // Show agent session information if available
          if (options.detailed) {
            await displayAgentSessionInfo(options.directory);
          }

          OutputFormatter.formatDuration(startTime);
        } catch (error) {
          OutputFormatter.formatError(
            `Status check failed: ${error instanceof Error ? error.message : String(error)}`
          );

          Logger.error("Status command failed", {
            directory: options.directory,
            error: String(error),
          });

          process.exit(1);
        }
      }
    );
}

async function analyzeProjectStatus(
  directory: string,
  options: {
    detailed: boolean;
    healthCheck: boolean;
    includeSuggestions: boolean;
  }
): Promise<ProjectStatus> {
  const toolManager = new ToolManager();

  // Get project structure
  let projectTree = "";
  try {
    projectTree = await toolManager.executeTool("get_project_tree", {
      path: directory,
    });
  } catch (error) {
    projectTree = `Failed to analyze structure: ${error}`;
  }

  // Check for key files
  const hasPackageJson = await fileExists(path.join(directory, "package.json"));
  const hasReadme =
    (await fileExists(path.join(directory, "README.md"))) ||
    (await fileExists(path.join(directory, "readme.md")));
  const isGitRepo = await fileExists(path.join(directory, ".git"));

  // Count files
  const fileCount = await countProjectFiles(directory);

  // Get last modified time
  const lastModified = await getLastModifiedTime(directory);

  // Detect technologies
  const technologies = await detectTechnologies(directory, projectTree);

  // Perform health check if requested
  const { issues, suggestions, healthScore } = options.healthCheck
    ? await performHealthCheck(directory, {
        hasPackageJson,
        hasReadme,
        isGitRepo,
        technologies,
      })
    : { issues: [], suggestions: [], healthScore: 0.8 };

  const projectHealth: ProjectStatus["projectHealth"] =
    healthScore >= 0.9
      ? "excellent"
      : healthScore >= 0.7
        ? "good"
        : healthScore >= 0.5
          ? "fair"
          : "poor";

  return {
    directory,
    isGitRepo,
    hasPackageJson,
    hasReadme,
    technologies,
    fileCount,
    lastModified,
    projectHealth,
    issues,
    suggestions: options.includeSuggestions ? suggestions : [],
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function countProjectFiles(directory: string): Promise<number> {
  try {
    let count = 0;
    const items = await fs.readdir(directory, { withFileTypes: true });

    for (const item of items) {
      if (item.name.startsWith(".") && item.name !== ".gitignore") continue;
      if (item.name === "node_modules") continue;

      if (item.isFile()) {
        count++;
      } else if (item.isDirectory()) {
        count += await countProjectFiles(path.join(directory, item.name));
      }
    }

    return count;
  } catch {
    return 0;
  }
}

async function getLastModifiedTime(directory: string): Promise<Date> {
  try {
    const stats = await fs.stat(directory);
    return stats.mtime;
  } catch {
    return new Date();
  }
}

async function detectTechnologies(
  directory: string,
  projectTree: string
): Promise<string[]> {
  const technologies = new Set<string>();

  // Read package.json if it exists
  try {
    const packageJsonPath = path.join(directory, "package.json");
    if (await fileExists(packageJsonPath)) {
      const packageContent = await fs.readFile(packageJsonPath, "utf8");
      const pkg = JSON.parse(packageContent);

      // Detect from dependencies
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      Object.keys(allDeps).forEach((dep) => {
        if (dep.includes("react")) technologies.add("React");
        if (dep.includes("vue")) technologies.add("Vue.js");
        if (dep.includes("angular")) technologies.add("Angular");
        if (dep.includes("express")) technologies.add("Express.js");
        if (dep.includes("typescript")) technologies.add("TypeScript");
        if (dep.includes("webpack")) technologies.add("Webpack");
        if (dep.includes("vite")) technologies.add("Vite");
        if (dep.includes("jest")) technologies.add("Jest");
        if (dep.includes("eslint")) technologies.add("ESLint");
      });
    }
  } catch {
    // Ignore package.json read errors
  }

  // Detect from file extensions in project tree
  const filePatterns = {
    JavaScript: [".js", ".mjs"],
    TypeScript: [".ts", ".tsx"],
    React: [".jsx", ".tsx"],
    Python: [".py"],
    Java: [".java"],
    "C#": [".cs"],
    Go: [".go"],
    Rust: [".rs"],
    HTML: [".html"],
    CSS: [".css", ".scss", ".sass"],
    Docker: ["Dockerfile", "docker-compose"],
  };

  Object.entries(filePatterns).forEach(([tech, patterns]) => {
    if (patterns.some((pattern) => projectTree.includes(pattern))) {
      technologies.add(tech);
    }
  });

  return Array.from(technologies);
}

async function performHealthCheck(
  directory: string,
  context: {
    hasPackageJson: boolean;
    hasReadme: boolean;
    isGitRepo: boolean;
    technologies: string[];
  }
): Promise<{ issues: string[]; suggestions: string[]; healthScore: number }> {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let healthScore = 1.0;

  // Essential file checks
  if (!context.hasReadme) {
    issues.push("Missing README.md documentation");
    suggestions.push(
      "Add a comprehensive README.md with project description and setup instructions"
    );
    healthScore -= 0.2;
  }

  if (!context.isGitRepo) {
    issues.push("Not a Git repository");
    suggestions.push("Initialize Git repository: git init");
    healthScore -= 0.1;
  }

  // Node.js specific checks
  if (context.hasPackageJson) {
    try {
      const packagePath = path.join(directory, "package.json");
      const pkg = JSON.parse(await fs.readFile(packagePath, "utf8"));

      if (!pkg.description) {
        issues.push("package.json missing description");
        healthScore -= 0.05;
      }

      if (!pkg.scripts || Object.keys(pkg.scripts).length === 0) {
        issues.push("No npm scripts defined");
        suggestions.push(
          "Add npm scripts for common tasks (start, test, build)"
        );
        healthScore -= 0.1;
      }

      if (!pkg.dependencies && !pkg.devDependencies) {
        issues.push("No dependencies defined");
        healthScore -= 0.05;
      }
    } catch (error) {
      issues.push("Invalid package.json format");
      healthScore -= 0.2;
    }

    // Check for .gitignore
    if (!(await fileExists(path.join(directory, ".gitignore")))) {
      issues.push("Missing .gitignore file");
      suggestions.push(
        "Add .gitignore to exclude node_modules and build artifacts"
      );
      healthScore -= 0.1;
    }
  }

  // Security checks
  const securityFiles = ["package-lock.json", "yarn.lock"];
  const hasLockFile = await Promise.all(
    securityFiles.map((file) => fileExists(path.join(directory, file)))
  );

  if (context.hasPackageJson && !hasLockFile.some(Boolean)) {
    issues.push("No lock file found (package-lock.json or yarn.lock)");
    suggestions.push("Use npm install or yarn install to generate a lock file");
    healthScore -= 0.1;
  }

  // Testing checks
  const hasTests =
    (await fileExists(path.join(directory, "test"))) ||
    (await fileExists(path.join(directory, "tests"))) ||
    (await fileExists(path.join(directory, "__tests__")));

  if (!hasTests && context.technologies.length > 0) {
    issues.push("No test directory found");
    suggestions.push("Add unit tests to improve code reliability");
    healthScore -= 0.1;
  }

  return { issues, suggestions, healthScore: Math.max(0, healthScore) };
}

function displaySummaryFormat(status: ProjectStatus, options: any): void {
  OutputFormatter.formatSection("Project Overview");
  console.log(`📂 Directory: ${status.directory}`);
  console.log(
    `📊 Health: ${getHealthEmoji(status.projectHealth)} ${status.projectHealth.toUpperCase()}`
  );
  console.log(`📁 Files: ${status.fileCount}`);
  console.log(`🕐 Last Modified: ${status.lastModified.toLocaleString()}`);
  console.log(
    `🔧 Technologies: ${status.technologies.join(", ") || "None detected"}`
  );

  console.log("");
  console.log("✅ Features:");
  console.log(`  • Git Repository: ${status.isGitRepo ? "Yes" : "No"}`);
  console.log(`  • Package.json: ${status.hasPackageJson ? "Yes" : "No"}`);
  console.log(`  • README.md: ${status.hasReadme ? "Yes" : "No"}`);

  if (options.healthCheck && status.issues.length > 0) {
    console.log("");
    OutputFormatter.formatSection("Issues Found");
    status.issues.forEach((issue) => {
      console.log(`  ❌ ${issue}`);
    });
  }

  if (options.suggestions && status.suggestions.length > 0) {
    console.log("");
    OutputFormatter.formatSection("Suggestions");
    status.suggestions.forEach((suggestion) => {
      console.log(`  💡 ${suggestion}`);
    });
  }

  console.log("");
  console.log("🚀 Quick Actions:");
  console.log(
    '  • a2s2 breathe "improve this project" - Let agent enhance the project'
  );
  console.log('  • a2s2 continue "add tests" - Add specific improvements');
  console.log("  • a2s2 analyze . - Analyze project structure in detail");
}

function displayTableFormat(status: ProjectStatus): void {
  console.log(
    "┌─────────────────────┬──────────────────────────────────────────────────┐"
  );
  console.log(
    "│ Property            │ Value                                            │"
  );
  console.log(
    "├─────────────────────┼──────────────────────────────────────────────────┤"
  );
  console.log(`│ Directory           │ ${status.directory.padEnd(48)} │`);
  console.log(
    `│ Health              │ ${(getHealthEmoji(status.projectHealth) + " " + status.projectHealth).padEnd(48)} │`
  );
  console.log(
    `│ File Count          │ ${status.fileCount.toString().padEnd(48)} │`
  );
  console.log(
    `│ Last Modified       │ ${status.lastModified.toLocaleString().padEnd(48)} │`
  );
  console.log(
    `│ Git Repository      │ ${(status.isGitRepo ? "Yes" : "No").padEnd(48)} │`
  );
  console.log(
    `│ Package.json        │ ${(status.hasPackageJson ? "Yes" : "No").padEnd(48)} │`
  );
  console.log(
    `│ README.md           │ ${(status.hasReadme ? "Yes" : "No").padEnd(48)} │`
  );
  console.log(
    `│ Technologies        │ ${status.technologies.join(", ").substring(0, 48).padEnd(48)} │`
  );
  console.log(
    "└─────────────────────┴──────────────────────────────────────────────────┘"
  );

  if (status.issues.length > 0) {
    console.log("\nIssues:");
    status.issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. ❌ ${issue}`);
    });
  }
}

async function displayAgentSessionInfo(directory: string): Promise<void> {
  OutputFormatter.formatSection("Agent Session Information");

  // Look for a2s2 session files or logs
  const sessionFiles = [".a2s2-session", ".a2s2-backup"];

  let hasSessionData = false;
  for (const sessionFile of sessionFiles) {
    const sessionPath = path.join(directory, sessionFile);
    if (await fileExists(sessionPath)) {
      hasSessionData = true;
      console.log(`📋 Found session data: ${sessionFile}`);

      try {
        const stats = await fs.stat(sessionPath);
        console.log(`   Last modified: ${stats.mtime.toLocaleString()}`);
      } catch {
        console.log("   Unable to read session metadata");
      }
    }
  }

  if (!hasSessionData) {
    console.log("ℹ️  No previous agent sessions found in this directory");
    console.log("   Use 'a2s2 breathe \"your vision\"' to start a new session");
  }

  // Check for recent a2s2 modifications
  try {
    const backupDir = path.join(directory, ".a2s2-backup");
    if (await fileExists(backupDir)) {
      const backupItems = await fs.readdir(backupDir);
      if (backupItems.length > 0) {
        console.log(`🗂️  Found ${backupItems.length} backup entries`);
        console.log(
          "   Recent agent modifications can be rolled back if needed"
        );
      }
    }
  } catch {
    // Ignore backup directory read errors
  }
}

function getHealthEmoji(health: ProjectStatus["projectHealth"]): string {
  switch (health) {
    case "excellent":
      return "🟢";
    case "good":
      return "🟡";
    case "fair":
      return "🟠";
    case "poor":
      return "🔴";
    default:
      return "⚪";
  }
}
