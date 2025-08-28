import { ToolManager } from "../../tools/ToolManager";
import { Logger } from "../../logging/Logger";

export type AgentPhase = "EXPLORE" | "SUMMON" | "COMPLETE";

export interface ExplorationResult {
  projectStructure: string;
  keyFiles: string[];
  technologies: string[];
  requirements: string[];
  recommendations: string[];
  confidence: number;
  nextPhase: AgentPhase;
}

export interface ExploreOptions {
  workingDirectory: string;
  vision: string;
  maxFilesToRead?: number;
  analyzeTests?: boolean;
  includeDocumentation?: boolean;
}

export class ExplorePhase {
  private toolManager: ToolManager;
  private explorationHistory: ExplorationResult[] = [];

  constructor(toolManager: ToolManager) {
    this.toolManager = toolManager;
  }

  async execute(options: ExploreOptions): Promise<ExplorationResult> {
    Logger.info("Starting EXPLORE phase", {
      workingDirectory: options.workingDirectory,
      vision: options.vision.substring(0, 100) + "...",
    });

    const result: ExplorationResult = {
      projectStructure: "",
      keyFiles: [],
      technologies: [],
      requirements: [],
      recommendations: [],
      confidence: 0,
      nextPhase: "COMPLETE",
    };

    try {
      // Step 1: Analyze project structure
      result.projectStructure = await this.analyzeProjectStructure(
        options.workingDirectory
      );

      // Step 2: Identify key files to examine
      result.keyFiles = this.identifyKeyFiles(result.projectStructure);

      // Step 3: Read and analyze key files
      const fileContents = await this.readKeyFiles(
        result.keyFiles,
        options.maxFilesToRead
      );

      // Step 4: Extract technologies and patterns
      result.technologies = this.extractTechnologies(
        result.projectStructure,
        fileContents
      );

      // Step 5: Analyze requirements and generate recommendations
      result.requirements = this.extractRequirements(
        options.vision,
        fileContents
      );
      result.recommendations = await this.generateRecommendations(
        options.vision,
        result.projectStructure,
        fileContents,
        result.technologies
      );

      // Step 6: Calculate confidence and determine next phase
      result.confidence = this.calculateConfidence(result);
      result.nextPhase = this.determineNextPhase(result);

      this.explorationHistory.push(result);

      Logger.info("EXPLORE phase completed", {
        keyFilesFound: result.keyFiles.length,
        technologiesIdentified: result.technologies.length,
        confidence: result.confidence,
        nextPhase: result.nextPhase,
      });

      return result;
    } catch (error) {
      Logger.error("EXPLORE phase failed", {
        error: (error as Error).message,
      });

      // Return partial results on failure
      result.confidence = 0.2;
      result.recommendations.push(
        "Exploration failed - proceeding with limited information"
      );
      return result;
    }
  }

  private async analyzeProjectStructure(
    workingDirectory: string
  ): Promise<string> {
    try {
      return await this.toolManager.executeTool("get_project_tree", {
        path: workingDirectory,
      });
    } catch (error) {
      Logger.warn("Project tree analysis failed, using fallback", {
        error: (error as Error).message,
      });
      return `Failed to analyze project structure: ${(error as Error).message}`;
    }
  }

  private identifyKeyFiles(projectStructure: string): string[] {
    const keyFiles: string[] = [];
    const lines = projectStructure.split("\n");

    // Priority order for file types
    const priorities = [
      // Package/Project files (highest priority)
      {
        patterns: [
          "package.json",
          "composer.json",
          "Gemfile",
          "requirements.txt",
          "pom.xml",
          "Cargo.toml",
        ],
        priority: 1,
      },
      // Configuration files
      {
        patterns: [
          "tsconfig.json",
          "webpack.config",
          "vite.config",
          ".eslintrc",
          "tailwind.config",
        ],
        priority: 2,
      },
      // Entry points
      {
        patterns: ["main.", "index.", "app.", "server.", "App.tsx", "App.jsx"],
        priority: 3,
      },
      // README and docs
      {
        patterns: ["README", "CHANGELOG", "CONTRIBUTING", "docs/"],
        priority: 4,
      },
      // Test files
      {
        patterns: [".test.", ".spec.", "__tests__/", "test/", "tests/"],
        priority: 5,
      },
    ];

    // Extract files by priority
    for (const { patterns, priority } of priorities) {
      const foundFiles = this.extractFilesMatching(lines, patterns);
      keyFiles.push(...foundFiles);

      if (keyFiles.length >= 15) break; // Limit total files
    }

    Logger.debug("Key files identified", {
      fileCount: keyFiles.length,
      files: keyFiles.slice(0, 5), // Log first 5 for debugging
    });

    return keyFiles.slice(0, 20); // Hard limit
  }

  private extractFilesMatching(lines: string[], patterns: string[]): string[] {
    const matches: string[] = [];

    for (const line of lines) {
      for (const pattern of patterns) {
        if (
          line.toLowerCase().includes(pattern.toLowerCase()) &&
          !matches.some((m) => m.includes(pattern))
        ) {
          // Extract the actual file path from tree output
          const cleanedPath = this.extractPathFromTreeLine(line);
          if (cleanedPath) {
            matches.push(cleanedPath);
          }
        }
      }
    }

    return matches;
  }

  private extractPathFromTreeLine(line: string): string | null {
    // Remove tree characters and whitespace
    const cleaned = line.replace(/[│├└─\s]/g, "").replace(/^\s+/, "");

    // Skip if line is too short or contains tree artifacts
    if (
      cleaned.length < 2 ||
      cleaned.includes("directory") ||
      cleaned.includes("file")
    ) {
      return null;
    }

    return cleaned;
  }

  private async readKeyFiles(
    keyFiles: string[],
    maxFiles: number = 10
  ): Promise<string> {
    if (keyFiles.length === 0) {
      return "No key files identified for analysis.";
    }

    const filesToRead = keyFiles.slice(0, maxFiles);

    try {
      return await this.toolManager.executeTool("read_files", {
        paths: filesToRead,
      });
    } catch (error) {
      Logger.warn("Failed to read some key files", {
        error: (error as Error).message,
        attempted: filesToRead.length,
      });
      return `Partial file reading completed. Error: ${(error as Error).message}`;
    }
  }

  private extractTechnologies(
    projectStructure: string,
    fileContents: string
  ): string[] {
    const technologies = new Set<string>();
    const content = (projectStructure + fileContents).toLowerCase();

    // Framework detection
    const frameworks = {
      react: ["react", "jsx", "tsx", '"react"'],
      vue: ["vue", ".vue", '"vue"'],
      angular: ["angular", "@angular", "ng-"],
      svelte: ["svelte", ".svelte"],
      "next.js": ["next", "next.js", '"next"'],
      nuxt: ["nuxt", '"nuxt"'],
      express: ["express", '"express"'],
      fastify: ["fastify", '"fastify"'],
      django: ["django", "manage.py"],
      flask: ["flask", "from flask"],
      spring: ["spring", "@spring"],
      rails: ["rails", "gemfile"],
    };

    // Language detection
    const languages = {
      typescript: ["typescript", ".ts", ".tsx", "tsconfig"],
      javascript: [".js", ".jsx", "package.json"],
      python: [".py", "requirements.txt", "__init__.py"],
      java: [".java", "pom.xml", ".class"],
      csharp: [".cs", ".csproj", "using system"],
      rust: [".rs", "cargo.toml", "cargo.lock"],
      go: [".go", "go.mod", "package main"],
    };

    // Database detection
    const databases = {
      postgresql: ["postgresql", "postgres", "pg"],
      mysql: ["mysql", "mariadb"],
      mongodb: ["mongodb", "mongo", "mongoose"],
      sqlite: ["sqlite", ".db", ".sqlite"],
      redis: ["redis", "redis-"],
    };

    // Check all categories
    [frameworks, languages, databases].forEach((category) => {
      Object.entries(category).forEach(([tech, indicators]) => {
        if (indicators.some((indicator) => content.includes(indicator))) {
          technologies.add(tech);
        }
      });
    });

    Logger.debug("Technologies detected", {
      count: technologies.size,
      technologies: Array.from(technologies),
    });

    return Array.from(technologies);
  }

  private extractRequirements(vision: string, fileContents: string): string[] {
    const requirements: string[] = [];
    const visionLower = vision.toLowerCase();

    // Extract explicit requirements from vision
    const requirementPatterns = [
      /need[s]?\s+to\s+([^.]+)/g,
      /must\s+([^.]+)/g,
      /should\s+([^.]+)/g,
      /require[s]?\s+([^.]+)/g,
      /implement\s+([^.]+)/g,
      /add\s+([^.]+)/g,
      /create\s+([^.]+)/g,
    ];

    requirementPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(visionLower)) !== null) {
        const requirement = match[1].trim();
        if (requirement.length > 5 && requirement.length < 100) {
          requirements.push(requirement);
        }
      }
    });

    // Infer requirements from existing codebase
    if (fileContents.includes("package.json")) {
      requirements.push("maintain npm package structure");
    }
    if (fileContents.includes("test") || fileContents.includes("spec")) {
      requirements.push("maintain test coverage");
    }
    if (fileContents.includes("README")) {
      requirements.push("update documentation");
    }

    Logger.debug("Requirements extracted", {
      count: requirements.length,
      requirements: requirements.slice(0, 3),
    });

    return requirements.slice(0, 10); // Limit requirements
  }

  private async generateRecommendations(
    vision: string,
    projectStructure: string,
    fileContents: string,
    technologies: string[]
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Analyze project health
    if (!fileContents.includes("README") && !fileContents.includes("readme")) {
      recommendations.push("Add comprehensive README.md documentation");
    }

    if (
      technologies.includes("javascript") &&
      !technologies.includes("typescript")
    ) {
      recommendations.push(
        "Consider migrating to TypeScript for better type safety"
      );
    }

    if (!fileContents.includes("test") && !fileContents.includes("spec")) {
      recommendations.push("Add test coverage for reliability");
    }

    // Project structure recommendations
    if (technologies.includes("react") && !projectStructure.includes("src/")) {
      recommendations.push("Organize components in src/ directory structure");
    }

    if (
      projectStructure.includes("node_modules") &&
      !fileContents.includes(".gitignore")
    ) {
      recommendations.push(
        "Add .gitignore to exclude node_modules and build artifacts"
      );
    }

    // Security recommendations
    if (fileContents.includes("api") && !fileContents.includes("cors")) {
      recommendations.push(
        "Implement CORS and security headers for API endpoints"
      );
    }

    // Performance recommendations
    if (technologies.includes("react") && !technologies.includes("next.js")) {
      recommendations.push(
        "Consider Next.js for production-ready React applications"
      );
    }

    Logger.debug("Recommendations generated", {
      count: recommendations.length,
      recommendations: recommendations.slice(0, 3),
    });

    return recommendations;
  }

  private calculateConfidence(result: ExplorationResult): number {
    let confidence = 0.3; // Base confidence

    // Increase confidence based on successful analysis
    if (result.projectStructure && result.projectStructure.length > 100) {
      confidence += 0.2;
    }

    if (result.keyFiles.length >= 3) {
      confidence += 0.2;
    }

    if (result.technologies.length >= 2) {
      confidence += 0.2;
    }

    if (result.requirements.length >= 1) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  private determineNextPhase(result: ExplorationResult): AgentPhase {
    // Simple heuristic: if confidence is high enough, go to COMPLETE
    // Otherwise, might need SUMMON phase (not implemented in Phase 1B)

    if (result.confidence >= 0.7) {
      return "COMPLETE";
    } else if (result.confidence >= 0.4) {
      return "COMPLETE"; // Still proceed but with caution
    } else {
      return "COMPLETE"; // In Phase 1B, always proceed to COMPLETE
    }
  }

  // Public methods for monitoring and debugging
  getExplorationHistory(): ReadonlyArray<ExplorationResult> {
    return [...this.explorationHistory];
  }

  getLastExploration(): ExplorationResult | null {
    return this.explorationHistory.length > 0
      ? this.explorationHistory[this.explorationHistory.length - 1]
      : null;
  }

  clearHistory(): void {
    this.explorationHistory = [];
  }
}
