import { FileReader } from "../tools/files/FileReader";
import { FoundationAnalyzer } from "../tools/foundation/FoundationAnalyzer";
import { ProjectContext } from "./ConversationAgent";
import { Logger } from "../logging/Logger";

/**
 * ProjectAnalyzer uses FileReader and FoundationAnalyzer tools to understand
 * the existing codebase and provide context for intelligent conversation.
 */
export class ProjectAnalyzer {
  private workingDirectory: string;
  private fileReader: FileReader;
  private foundationAnalyzer: FoundationAnalyzer;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
    this.fileReader = new FileReader();
    this.foundationAnalyzer = new FoundationAnalyzer();

    Logger.info("ProjectAnalyzer initialized", {
      workingDirectory,
    });
  }

  async analyzeProject(): Promise<ProjectContext> {
    Logger.info("Starting project analysis");

    // Get project structure
    const structure = await this.foundationAnalyzer.execute({
      path: this.workingDirectory,
    });

    // Identify key files to read
    const keyFiles = this.identifyKeyFiles(structure);

    // Read key files for content analysis (FIXED: handle empty directories)
    let fileContents = "";
    if (keyFiles.length > 0) {
      Logger.debug("Reading key files for analysis", {
        keyFilesCount: keyFiles.length,
        keyFiles: keyFiles.slice(0, 5), // Log first 5 files
      });

      fileContents = await this.fileReader.execute({
        paths: keyFiles,
      });
    } else {
      Logger.debug("No key files found - analyzing empty or minimal directory");
      fileContents =
        "No files found to analyze - this appears to be an empty or minimal directory.";
    }

    // Analyze tech stack, patterns, and project type
    const analysis = this.analyzeProjectContent(structure, fileContents);

    const context: ProjectContext = {
      directory: this.workingDirectory,
      structure,
      keyFiles,
      techStack: analysis.techStack,
      patterns: analysis.patterns,
    };

    Logger.info("Project analysis completed", {
      keyFilesCount: keyFiles.length,
      techStackCount: analysis.techStack.length,
      patternsCount: analysis.patterns.length,
      isEmpty: keyFiles.length === 0,
    });

    return context;
  }

  private identifyKeyFiles(structure: string): string[] {
    const keyFiles: string[] = [];

    // Early exit for completely empty directories
    if (!structure || structure.trim().length === 0) {
      Logger.debug("Structure is empty - no files to identify");
      return keyFiles;
    }

    // Common configuration files
    const configFiles = [
      "package.json",
      "package-lock.json",
      "yarn.lock",
      "tsconfig.json",
      "vite.config.js",
      "vite.config.ts",
      "webpack.config.js",
      "next.config.js",
      "nuxt.config.js",
      ".env",
      "docker-compose.yml",
      "Dockerfile",
      "README.md",
      "requirements.txt",
      "setup.py",
      "Cargo.toml",
      "go.mod",
      "pom.xml",
      "build.gradle",
    ];

    // Check which config files exist in the structure
    configFiles.forEach((file) => {
      if (structure.includes(file)) {
        keyFiles.push(file);
      }
    });

    // Add main application files based on common patterns
    const appFiles = this.identifyMainAppFiles(structure);
    keyFiles.push(...appFiles);

    // Remove duplicates and filter out files that don't actually exist in structure
    const uniqueKeyFiles = [...new Set(keyFiles)].filter((file) =>
      structure.includes(file)
    );

    Logger.debug("Key files identified", {
      totalFound: uniqueKeyFiles.length,
      configFiles: uniqueKeyFiles.filter((f) => configFiles.includes(f)),
      appFiles: uniqueKeyFiles.filter((f) => !configFiles.includes(f)),
    });

    return uniqueKeyFiles.slice(0, 15); // Limit to prevent overwhelming the context
  }

  private identifyMainAppFiles(structure: string): string[] {
    const appFiles: string[] = [];

    // Early exit for empty structure
    if (!structure || structure.trim().length === 0) {
      return appFiles;
    }

    // React patterns
    if (structure.includes("src/App.js") || structure.includes("src/App.jsx")) {
      appFiles.push("src/App.js", "src/App.jsx");
    }
    if (structure.includes("src/App.ts") || structure.includes("src/App.tsx")) {
      appFiles.push("src/App.ts", "src/App.tsx");
    }
    if (
      structure.includes("src/index.js") ||
      structure.includes("src/index.jsx")
    ) {
      appFiles.push("src/index.js", "src/index.jsx");
    }
    if (
      structure.includes("src/index.ts") ||
      structure.includes("src/index.tsx")
    ) {
      appFiles.push("src/index.ts", "src/index.tsx");
    }

    // Node.js/Express patterns
    if (structure.includes("server.js")) appFiles.push("server.js");
    if (structure.includes("app.js")) appFiles.push("app.js");
    if (structure.includes("index.js") && !appFiles.includes("src/index.js")) {
      appFiles.push("index.js");
    }
    if (structure.includes("src/server.js")) appFiles.push("src/server.js");
    if (structure.includes("src/app.js")) appFiles.push("src/app.js");

    // Next.js patterns
    if (structure.includes("pages/_app.js")) appFiles.push("pages/_app.js");
    if (structure.includes("pages/_app.tsx")) appFiles.push("pages/_app.tsx");
    if (structure.includes("pages/index.js")) appFiles.push("pages/index.js");
    if (structure.includes("pages/index.tsx")) appFiles.push("pages/index.tsx");

    // Vue patterns
    if (structure.includes("src/main.js")) appFiles.push("src/main.js");
    if (structure.includes("src/main.ts")) appFiles.push("src/main.ts");
    if (structure.includes("src/App.vue")) appFiles.push("src/App.vue");

    // Angular patterns
    if (structure.includes("src/main.ts")) appFiles.push("src/main.ts");
    if (structure.includes("src/app/app.module.ts"))
      appFiles.push("src/app/app.module.ts");
    if (structure.includes("src/app/app.component.ts"))
      appFiles.push("src/app/app.component.ts");

    // Python patterns
    if (structure.includes("main.py")) appFiles.push("main.py");
    if (structure.includes("app.py")) appFiles.push("app.py");
    if (structure.includes("server.py")) appFiles.push("server.py");
    if (structure.includes("manage.py")) appFiles.push("manage.py");

    return appFiles.filter((file) => structure.includes(file));
  }

  private analyzeProjectContent(
    structure: string,
    fileContents: string
  ): {
    techStack: string[];
    patterns: string[];
  } {
    const techStack = new Set<string>();
    const patterns = new Set<string>();

    // Handle empty directories gracefully
    if (!structure || structure.trim().length === 0) {
      Logger.debug("Empty structure detected - minimal analysis");
      patterns.add("Empty Directory");
      return {
        techStack: Array.from(techStack),
        patterns: Array.from(patterns),
      };
    }

    // Analyze structure for tech stack indicators
    this.detectTechStackFromStructure(structure, techStack, patterns);

    // Analyze file contents for more specific patterns (if we have content)
    if (fileContents && !fileContents.includes("No files found to analyze")) {
      this.detectTechStackFromContent(fileContents, techStack, patterns);
    } else {
      // For empty directories, add a helpful pattern
      if (patterns.size === 0) {
        patterns.add("New Project Directory");
      }
    }

    return {
      techStack: Array.from(techStack),
      patterns: Array.from(patterns),
    };
  }

  private detectTechStackFromStructure(
    structure: string,
    techStack: Set<string>,
    patterns: Set<string>
  ): void {
    // Frontend frameworks
    if (structure.includes("package.json")) {
      techStack.add("Node.js");
      if (
        structure.includes("src/App.jsx") ||
        structure.includes("src/App.tsx")
      ) {
        techStack.add("React");
        patterns.add("React Application");
      }
      if (
        structure.includes("pages/") ||
        structure.includes("next.config.js")
      ) {
        techStack.add("Next.js");
        patterns.add("Next.js Application");
      }
      if (structure.includes("src/App.vue")) {
        techStack.add("Vue.js");
        patterns.add("Vue.js Application");
      }
      if (structure.includes("nuxt.config.js")) {
        techStack.add("Nuxt.js");
        patterns.add("Nuxt.js Application");
      }
      if (structure.includes("src/app/app.module.ts")) {
        techStack.add("Angular");
        patterns.add("Angular Application");
      }
    }

    // Backend indicators
    if (structure.includes("server.js") || structure.includes("app.js")) {
      patterns.add("Express Server");
    }
    if (
      structure.includes("requirements.txt") ||
      structure.includes("setup.py")
    ) {
      techStack.add("Python");
      if (structure.includes("manage.py")) {
        techStack.add("Django");
        patterns.add("Django Application");
      }
      if (structure.includes("app.py")) {
        techStack.add("Flask");
        patterns.add("Flask Application");
      }
    }

    // Database indicators
    if (structure.includes("schema.sql") || structure.includes("migrations/")) {
      patterns.add("Database Schema");
    }
    if (structure.includes("prisma/")) {
      techStack.add("Prisma");
      patterns.add("Prisma ORM");
    }
    if (structure.includes("models/") && techStack.has("Node.js")) {
      patterns.add("Database Models");
    }

    // Build tools
    if (structure.includes("webpack.config.js")) {
      techStack.add("Webpack");
    }
    if (
      structure.includes("vite.config.js") ||
      structure.includes("vite.config.ts")
    ) {
      techStack.add("Vite");
    }
    if (structure.includes("tsconfig.json")) {
      techStack.add("TypeScript");
    }

    // Containerization
    if (structure.includes("Dockerfile")) {
      techStack.add("Docker");
      patterns.add("Containerized Application");
    }
    if (structure.includes("docker-compose.yml")) {
      techStack.add("Docker Compose");
      patterns.add("Multi-container Application");
    }

    // Testing
    if (
      structure.includes("jest.config.js") ||
      structure.includes("__tests__/")
    ) {
      techStack.add("Jest");
      patterns.add("Unit Testing");
    }
    if (structure.includes("cypress/")) {
      techStack.add("Cypress");
      patterns.add("E2E Testing");
    }
  }

  private detectTechStackFromContent(
    fileContents: string,
    techStack: Set<string>,
    patterns: Set<string>
  ): void {
    // Skip analysis if no meaningful content
    if (!fileContents || fileContents.trim().length === 0) {
      return;
    }

    // Analyze package.json dependencies
    if (fileContents.includes('"react"')) {
      techStack.add("React");
    }
    if (fileContents.includes('"next"')) {
      techStack.add("Next.js");
    }
    if (fileContents.includes('"express"')) {
      techStack.add("Express");
      patterns.add("Express Server");
    }
    if (fileContents.includes('"vue"')) {
      techStack.add("Vue.js");
    }
    if (fileContents.includes('"@angular/core"')) {
      techStack.add("Angular");
    }
    if (fileContents.includes('"prisma"')) {
      techStack.add("Prisma");
    }
    if (fileContents.includes('"mongoose"')) {
      techStack.add("MongoDB");
      techStack.add("Mongoose");
    }
    if (fileContents.includes('"sqlite3"') || fileContents.includes('"pg"')) {
      patterns.add("SQL Database");
    }
    if (fileContents.includes('"@types/"')) {
      techStack.add("TypeScript");
    }

    // Authentication patterns
    if (
      fileContents.includes('"passport"') ||
      fileContents.includes('"auth0"') ||
      fileContents.includes('"firebase/auth"') ||
      fileContents.includes('"jsonwebtoken"')
    ) {
      patterns.add("Authentication System");
    }

    // API patterns
    if (fileContents.includes('"axios"') || fileContents.includes("fetch(")) {
      patterns.add("API Integration");
    }
    if (
      fileContents.includes('"/api/"') ||
      fileContents.includes("app.get(") ||
      fileContents.includes("app.post(")
    ) {
      patterns.add("REST API");
    }
    if (
      fileContents.includes('"apollo"') ||
      fileContents.includes('"graphql"')
    ) {
      techStack.add("GraphQL");
      patterns.add("GraphQL API");
    }

    // State management
    if (
      fileContents.includes('"redux"') ||
      fileContents.includes('"@reduxjs/toolkit"')
    ) {
      techStack.add("Redux");
      patterns.add("State Management");
    }
    if (
      fileContents.includes('"zustand"') ||
      fileContents.includes('"jotai"')
    ) {
      patterns.add("State Management");
    }

    // Styling
    if (fileContents.includes('"tailwindcss"')) {
      techStack.add("Tailwind CSS");
    }
    if (fileContents.includes('"styled-components"')) {
      techStack.add("Styled Components");
    }
    if (fileContents.includes('"@mui/material"')) {
      techStack.add("Material-UI");
    }
  }
}
