import { ToolManager } from "../../tools/ToolManager";
import { Logger } from "../../logging/Logger";

export type AgentPhase = "EXPLORE" | "PLAN" | "SUMMON" | "COMPLETE";

export interface ExplorationResult {
  projectStructure: string;
  keyFiles: string[];
  technologies: string[];
  requirements: string[];
  recommendations: string[];
  confidence: number;
  nextPhase: AgentPhase;
  validationResults?: ValidationSummary;
  healingActions?: HealingAction[];
}

export interface ValidationSummary {
  passed: boolean;
  checks: ValidationCheck[];
  errors: string[];
  warnings: string[];
  autoFixed: string[];
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning" | "info";
  autoFixable: boolean;
}

export interface HealingAction {
  type: "fix" | "create" | "update" | "delete";
  description: string;
  target: string;
  executed: boolean;
  result?: string;
  error?: string;
}

export interface ExploreOptions {
  workingDirectory: string;
  vision: string;
  maxFilesToRead?: number;
  analyzeTests?: boolean;
  includeDocumentation?: boolean;
  enableValidation?: boolean;
  enableHealing?: boolean;
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
      enableValidation: options.enableValidation,
      enableHealing: options.enableHealing,
    });

    const result: ExplorationResult = {
      projectStructure: "",
      keyFiles: [],
      technologies: [],
      requirements: [],
      recommendations: [],
      confidence: 0,
      nextPhase: "PLAN",
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

      // NEW: Step 7: Validation phase
      if (options.enableValidation) {
        Logger.info("Running exploration validation", {
          workingDirectory: options.workingDirectory,
        });

        result.validationResults = await this.validateExploration(
          result,
          options
        );

        // NEW: Step 8: Healing phase if validation failed and healing enabled
        if (!result.validationResults.passed && options.enableHealing) {
          Logger.info("Running exploration healing", {
            errors: result.validationResults.errors.length,
            warnings: result.validationResults.warnings.length,
          });

          result.healingActions = await this.healExploration(result, options);

          // Re-run validation after healing
          if (result.healingActions.some((a) => a.executed)) {
            result.validationResults = await this.validateExploration(
              result,
              options
            );
          }
        }

        // Adjust confidence based on validation results
        if (result.validationResults.passed) {
          result.confidence = Math.min(1.0, result.confidence + 0.1);
        } else {
          result.confidence = Math.max(0.1, result.confidence - 0.2);
        }
      }

      this.explorationHistory.push(result);

      Logger.info("EXPLORE phase completed", {
        keyFilesFound: result.keyFiles.length,
        technologiesIdentified: result.technologies.length,
        confidence: result.confidence,
        nextPhase: result.nextPhase,
        validationPassed: result.validationResults?.passed,
        healingActionsExecuted:
          result.healingActions?.filter((a) => a.executed).length || 0,
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

      if (options.enableValidation) {
        result.validationResults = {
          passed: false,
          checks: [
            {
              name: "exploration_completion",
              passed: false,
              message: `Exploration failed: ${(error as Error).message}`,
              severity: "error",
              autoFixable: false,
            },
          ],
          errors: [(error as Error).message],
          warnings: [],
          autoFixed: [],
        };
      }

      return result;
    }
  }

  // NEW: Validate the exploration results
  private async validateExploration(
    result: ExplorationResult,
    options: ExploreOptions
  ): Promise<ValidationSummary> {
    const checks: ValidationCheck[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const autoFixed: string[] = [];

    try {
      // Check 1: Project structure was analyzed
      const structureCheck = this.validateProjectStructure(
        result.projectStructure
      );
      checks.push(structureCheck);
      if (!structureCheck.passed) {
        errors.push(structureCheck.message);
      }

      // Check 2: Key files were identified
      const keyFilesCheck = this.validateKeyFiles(result.keyFiles);
      checks.push(keyFilesCheck);
      if (!keyFilesCheck.passed) {
        errors.push(keyFilesCheck.message);
      }

      // Check 3: Technologies were detected
      const techCheck = this.validateTechnologies(result.technologies);
      checks.push(techCheck);
      if (!techCheck.passed) {
        warnings.push(techCheck.message);
      }

      // Check 4: Requirements were extracted
      const reqCheck = this.validateRequirements(
        result.requirements,
        options.vision
      );
      checks.push(reqCheck);
      if (!reqCheck.passed) {
        warnings.push(reqCheck.message);
      }

      // Check 5: Confidence level is reasonable
      const confidenceCheck = this.validateConfidence(result.confidence);
      checks.push(confidenceCheck);
      if (!confidenceCheck.passed) {
        warnings.push(confidenceCheck.message);
      }

      // Check 6: Validate project-specific issues
      const projectChecks = await this.validateProjectSpecificIssues(
        result,
        options
      );
      checks.push(...projectChecks.checks);
      errors.push(...projectChecks.errors);
      warnings.push(...projectChecks.warnings);

      const passed = errors.length === 0;

      Logger.debug("Exploration validation completed", {
        checksRun: checks.length,
        passed,
        errors: errors.length,
        warnings: warnings.length,
      });

      return {
        passed,
        checks,
        errors,
        warnings,
        autoFixed,
      };
    } catch (error) {
      Logger.error("Exploration validation failed", {
        error: (error as Error).message,
      });

      return {
        passed: false,
        checks: [
          {
            name: "validation_error",
            passed: false,
            message: `Validation failed: ${(error as Error).message}`,
            severity: "error",
            autoFixable: false,
          },
        ],
        errors: [(error as Error).message],
        warnings: [],
        autoFixed: [],
      };
    }
  }

  // NEW: Healing actions to fix exploration issues
  private async healExploration(
    result: ExplorationResult,
    options: ExploreOptions
  ): Promise<HealingAction[]> {
    const healingActions: HealingAction[] = [];

    if (!result.validationResults) {
      return healingActions;
    }

    try {
      // Heal missing project structure
      if (
        result.validationResults.errors.some((e) =>
          e.includes("project structure")
        )
      ) {
        const action = await this.healProjectStructure(
          options.workingDirectory
        );
        healingActions.push(action);
      }

      // Heal missing key files
      if (result.keyFiles.length === 0) {
        const action = await this.healKeyFiles(options.workingDirectory);
        healingActions.push(action);
      }

      // Heal missing technologies detection
      if (result.technologies.length === 0) {
        const action = await this.healTechnologyDetection(result, options);
        healingActions.push(action);
      }

      // Heal confidence issues
      if (result.confidence < 0.3) {
        const action = await this.healLowConfidence(result, options);
        healingActions.push(action);
      }

      Logger.info("Exploration healing completed", {
        actionsPlanned: healingActions.length,
        actionsExecuted: healingActions.filter((a) => a.executed).length,
      });

      return healingActions;
    } catch (error) {
      Logger.error("Exploration healing failed", {
        error: (error as Error).message,
      });

      healingActions.push({
        type: "fix",
        description: "Handle healing failure",
        target: "exploration_healing",
        executed: false,
        error: (error as Error).message,
      });

      return healingActions;
    }
  }

  // Validation helper methods
  private validateProjectStructure(projectStructure: string): ValidationCheck {
    if (!projectStructure || projectStructure.trim().length < 10) {
      return {
        name: "project_structure",
        passed: false,
        message:
          "Project structure analysis failed or returned insufficient data",
        severity: "error",
        autoFixable: true,
      };
    }

    if (!projectStructure.includes("├") && !projectStructure.includes("└")) {
      return {
        name: "project_structure",
        passed: false,
        message: "Project structure does not appear to be in tree format",
        severity: "warning",
        autoFixable: false,
      };
    }

    return {
      name: "project_structure",
      passed: true,
      message: "Project structure successfully analyzed",
      severity: "info",
      autoFixable: false,
    };
  }

  private validateKeyFiles(keyFiles: string[]): ValidationCheck {
    if (keyFiles.length === 0) {
      return {
        name: "key_files",
        passed: false,
        message: "No key files were identified for analysis",
        severity: "error",
        autoFixable: true,
      };
    }

    if (keyFiles.length > 50) {
      return {
        name: "key_files",
        passed: false,
        message: "Too many key files identified - may indicate poor filtering",
        severity: "warning",
        autoFixable: false,
      };
    }

    return {
      name: "key_files",
      passed: true,
      message: `${keyFiles.length} key files identified for analysis`,
      severity: "info",
      autoFixable: false,
    };
  }

  private validateTechnologies(technologies: string[]): ValidationCheck {
    if (technologies.length === 0) {
      return {
        name: "technologies",
        passed: false,
        message: "No technologies were detected in the project",
        severity: "warning",
        autoFixable: true,
      };
    }

    if (technologies.length > 20) {
      return {
        name: "technologies",
        passed: false,
        message:
          "Unusually high number of technologies detected - may indicate noise",
        severity: "warning",
        autoFixable: false,
      };
    }

    return {
      name: "technologies",
      passed: true,
      message: `${technologies.length} technologies detected`,
      severity: "info",
      autoFixable: false,
    };
  }

  private validateRequirements(
    requirements: string[],
    vision: string
  ): ValidationCheck {
    if (requirements.length === 0) {
      return {
        name: "requirements",
        passed: false,
        message: "No requirements were extracted from the vision",
        severity: "warning",
        autoFixable: true,
      };
    }

    // Check if requirements seem relevant to the vision
    const visionWords = vision.toLowerCase().split(/\s+/);
    const relevantRequirements = requirements.filter((req) => {
      const reqWords = req.toLowerCase().split(/\s+/);
      return reqWords.some((word) => visionWords.includes(word));
    });

    if (relevantRequirements.length === 0) {
      return {
        name: "requirements",
        passed: false,
        message:
          "Extracted requirements do not seem relevant to the stated vision",
        severity: "warning",
        autoFixable: false,
      };
    }

    return {
      name: "requirements",
      passed: true,
      message: `${requirements.length} requirements extracted, ${relevantRequirements.length} relevant`,
      severity: "info",
      autoFixable: false,
    };
  }

  private validateConfidence(confidence: number): ValidationCheck {
    if (confidence < 0.3) {
      return {
        name: "confidence",
        passed: false,
        message: "Confidence level is too low for reliable planning",
        severity: "warning",
        autoFixable: true,
      };
    }

    if (confidence > 0.95) {
      return {
        name: "confidence",
        passed: false,
        message: "Confidence level is unrealistically high",
        severity: "warning",
        autoFixable: false,
      };
    }

    return {
      name: "confidence",
      passed: true,
      message: `Confidence level (${(confidence * 100).toFixed(1)}%) is reasonable`,
      severity: "info",
      autoFixable: false,
    };
  }

  private async validateProjectSpecificIssues(
    result: ExplorationResult,
    options: ExploreOptions
  ): Promise<{
    checks: ValidationCheck[];
    errors: string[];
    warnings: string[];
  }> {
    const checks: ValidationCheck[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Use validation tool to check for common issues
      const validationResult = await this.toolManager.executeTool(
        "validate_project",
        {
          type: "custom",
          options: {
            directory: options.workingDirectory,
            command:
              "find . -name '*.json' -exec echo 'Found JSON file: {}' \\;",
            timeout: 10000,
          },
        }
      );

      if (validationResult.success) {
        checks.push({
          name: "project_files",
          passed: true,
          message: "Project files are accessible",
          severity: "info",
          autoFixable: false,
        });
      } else {
        errors.push("Unable to access project files for validation");
        checks.push({
          name: "project_files",
          passed: false,
          message: "Project files are not accessible",
          severity: "error",
          autoFixable: false,
        });
      }

      // Check for package.json if technologies suggest Node.js project
      if (
        result.technologies.some((tech) =>
          ["javascript", "typescript", "react", "express"].includes(tech)
        )
      ) {
        if (!result.keyFiles.some((file) => file.includes("package.json"))) {
          warnings.push(
            "Node.js technologies detected but no package.json found"
          );
          checks.push({
            name: "package_json",
            passed: false,
            message: "package.json missing for Node.js project",
            severity: "warning",
            autoFixable: true,
          });
        }
      }

      return { checks, errors, warnings };
    } catch (error) {
      errors.push(
        `Project-specific validation failed: ${(error as Error).message}`
      );
      checks.push({
        name: "project_specific",
        passed: false,
        message: "Project-specific validation encountered errors",
        severity: "error",
        autoFixable: false,
      });

      return { checks, errors, warnings };
    }
  }

  // Healing helper methods
  private async healProjectStructure(
    workingDirectory: string
  ): Promise<HealingAction> {
    const action: HealingAction = {
      type: "fix",
      description: "Re-analyze project structure with different approach",
      target: "project_structure",
      executed: false,
    };

    try {
      // Try alternative approach to get project structure
      const result = await this.toolManager.executeTool("run_command", {
        command: `find "${workingDirectory}" -type f -name "*.js" -o -name "*.ts" -o -name "*.json" | head -20`,
        timeout: 10000,
      });

      if (result.success && result.result) {
        action.executed = true;
        action.result = "Alternative project structure analysis completed";
        Logger.debug("Project structure healing successful");
      } else {
        action.error = "Alternative analysis also failed";
      }
    } catch (error) {
      action.error = (error as Error).message;
      Logger.warn("Project structure healing failed", {
        error: (error as Error).message,
      });
    }

    return action;
  }

  private async healKeyFiles(workingDirectory: string): Promise<HealingAction> {
    const action: HealingAction = {
      type: "fix",
      description: "Use broader search criteria to find key files",
      target: "key_files",
      executed: false,
    };

    try {
      // Try to find any files that might be relevant
      const result = await this.toolManager.executeTool("run_command", {
        command: `find "${workingDirectory}" \\( -name "*.json" -o -name "*.js" -o -name "*.ts" -o -name "*.md" \\) | head -10`,
        timeout: 10000,
      });

      if (result.success && result.result) {
        action.executed = true;
        action.result = "Found files using broader criteria";
        Logger.debug("Key files healing successful");
      } else {
        action.error = "No files found even with broad search";
      }
    } catch (error) {
      action.error = (error as Error).message;
    }

    return action;
  }

  private async healTechnologyDetection(
    result: ExplorationResult,
    options: ExploreOptions
  ): Promise<HealingAction> {
    const action: HealingAction = {
      type: "fix",
      description:
        "Analyze file extensions and common patterns to detect technologies",
      target: "technologies",
      executed: false,
    };

    try {
      // Analyze file extensions in the project
      const extResult = await this.toolManager.executeTool("run_command", {
        command: `find "${options.workingDirectory}" -type f | grep -E '\\.(js|ts|py|java|cpp|rb|go|php)$' | sed 's/.*\\.//' | sort | uniq -c`,
        timeout: 10000,
      });

      if (extResult.success) {
        // Parse extensions and infer technologies
        const extensions = extResult.result
          .split("\n")
          .filter((line: string) => line.trim())
          .map((line: string) => line.trim().split(" ").pop())
          .filter((ext: any) => ext);

        if (extensions.length > 0) {
          // Update the result with inferred technologies
          result.technologies =
            this.inferTechnologiesFromExtensions(extensions);
          action.executed = true;
          action.result = `Inferred technologies from file extensions: ${result.technologies.join(", ")}`;
        }
      }
    } catch (error) {
      action.error = (error as Error).message;
    }

    return action;
  }

  private async healLowConfidence(
    result: ExplorationResult,
    options: ExploreOptions
  ): Promise<HealingAction> {
    const action: HealingAction = {
      type: "fix",
      description:
        "Improve confidence by gathering additional project information",
      target: "confidence",
      executed: false,
    };

    try {
      // Try to gather more information about the project
      const infoSources = [
        { command: "ls -la", description: "directory contents" },
        {
          command: "cat README* 2>/dev/null || echo 'No README found'",
          description: "README content",
        },
        {
          command:
            "cat package.json 2>/dev/null || echo 'No package.json found'",
          description: "package info",
        },
      ];

      let additionalInfo = "";
      let successfulSources = 0;

      for (const source of infoSources) {
        try {
          const cmdResult = await this.toolManager.executeTool("run_command", {
            command: `cd "${options.workingDirectory}" && ${source.command}`,
            timeout: 5000,
          });

          if (cmdResult.success) {
            additionalInfo += `\n--- ${source.description} ---\n${cmdResult.result}`;
            successfulSources++;
          }
        } catch {
          // Ignore individual command failures
        }
      }

      if (successfulSources > 0) {
        // Boost confidence based on additional information gathered
        result.confidence = Math.min(
          1.0,
          result.confidence + successfulSources * 0.1
        );
        action.executed = true;
        action.result = `Gathered additional information from ${successfulSources} sources, confidence improved to ${(result.confidence * 100).toFixed(1)}%`;
      } else {
        action.error = "Unable to gather additional project information";
      }
    } catch (error) {
      action.error = (error as Error).message;
    }

    return action;
  }

  private inferTechnologiesFromExtensions(extensions: string[]): string[] {
    const techMap: Record<string, string> = {
      js: "javascript",
      ts: "typescript",
      jsx: "react",
      tsx: "react",
      py: "python",
      java: "java",
      cpp: "c++",
      rb: "ruby",
      go: "go",
      php: "php",
      rs: "rust",
      kt: "kotlin",
      swift: "swift",
    };

    return extensions
      .map((ext) => techMap[ext])
      .filter((tech) => tech)
      .filter((tech, index, array) => array.indexOf(tech) === index); // Remove duplicates
  }

  // Existing methods remain the same...
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
    // With the new PLAN phase, exploration should lead to planning
    if (result.confidence >= 0.4) {
      return "PLAN";
    } else {
      // If confidence is too low, might need to re-explore or get help
      return "EXPLORE"; // Re-explore with different approach
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
