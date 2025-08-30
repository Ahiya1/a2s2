import { ToolManager } from "../../tools/ToolManager";
import { Logger } from "../../logging/Logger";
import { ExplorationResult } from "./ExplorePhase";

export type AgentPhase = "EXPLORE" | "PLAN" | "SUMMON" | "COMPLETE";

export interface PlanningResult {
  success: boolean;
  implementationPlan: ImplementationStep[];
  apiContracts: ApiContract[];
  fileStructure: FileStructurePlan;
  dependencies: DependencyMap;
  validationCriteria: ValidationRule[];
  techStack: TechStackDecision[];
  estimatedEffort: string;
  confidence: number;
  nextPhase: AgentPhase;
  risks: Risk[];
  assumptions: string[];
}

export interface ImplementationStep {
  id: string;
  phase:
    | "setup"
    | "infrastructure"
    | "core"
    | "features"
    | "testing"
    | "documentation";
  title: string;
  description: string;
  dependencies: string[];
  estimatedTime: number; // minutes
  priority: "critical" | "high" | "medium" | "low";
  complexity: "simple" | "moderate" | "complex";
  validationCriteria: string[];
  deliverables: string[];
  risks: string[];
}

export interface ApiContract {
  name: string;
  type: "rest" | "graphql" | "websocket" | "internal";
  endpoints?: EndpointDefinition[];
  schema?: any;
  authentication?: string;
  rateLimit?: string;
  documentation?: string;
}

export interface EndpointDefinition {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  parameters: ParameterDefinition[];
  responses: ResponseDefinition[];
  description: string;
}

export interface ParameterDefinition {
  name: string;
  type: string;
  required: boolean;
  description: string;
  validation?: string;
}

export interface ResponseDefinition {
  statusCode: number;
  description: string;
  schema?: any;
  examples?: any[];
}

export interface FileStructurePlan {
  directories: DirectoryPlan[];
  files: FilePlan[];
  conventions: string[];
}

export interface DirectoryPlan {
  path: string;
  purpose: string;
  contents: string[];
}

export interface FilePlan {
  path: string;
  purpose: string;
  dependencies: string[];
  exports: string[];
  size: "small" | "medium" | "large";
  complexity: "simple" | "moderate" | "complex";
}

export interface DependencyMap {
  production: DependencyInfo[];
  development: DependencyInfo[];
  peer: DependencyInfo[];
  conflicts: ConflictInfo[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  purpose: string;
  alternatives?: string[];
  size: number; // KB
  security: "high" | "medium" | "low";
}

export interface ConflictInfo {
  package1: string;
  package2: string;
  reason: string;
  resolution: string;
}

export interface ValidationRule {
  type: "typescript" | "eslint" | "test" | "build" | "format" | "custom";
  description: string;
  command: string;
  failureAction: "block" | "warn" | "fix";
  autoFix: boolean;
  priority: "critical" | "high" | "medium" | "low";
}

export interface TechStackDecision {
  category: "frontend" | "backend" | "database" | "build" | "test" | "deploy";
  chosen: string;
  alternatives: string[];
  reasoning: string;
  tradeoffs: string[];
  confidence: number;
}

export interface Risk {
  id: string;
  category:
    | "technical"
    | "timeline"
    | "complexity"
    | "dependency"
    | "integration";
  description: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  mitigation: string[];
  owner: "agent" | "human" | "team";
}

export interface PlanOptions {
  workingDirectory: string;
  vision: string;
  explorationResult: ExplorationResult;
  constraints?: string[];
  preferences?: Record<string, any>;
  timeframe?: string;
  complexity?: "simple" | "moderate" | "complex";
}

export class PlanPhase {
  private toolManager: ToolManager;
  private planningHistory: PlanningResult[] = [];

  constructor(toolManager: ToolManager) {
    this.toolManager = toolManager;
  }

  async execute(options: PlanOptions): Promise<PlanningResult> {
    Logger.info("Starting PLAN phase", {
      workingDirectory: options.workingDirectory,
      vision: options.vision.substring(0, 100) + "...",
      explorationFindings: options.explorationResult.keyFiles.length,
      constraints: options.constraints?.length || 0,
    });

    const result: PlanningResult = {
      success: false,
      implementationPlan: [],
      apiContracts: [],
      fileStructure: { directories: [], files: [], conventions: [] },
      dependencies: {
        production: [],
        development: [],
        peer: [],
        conflicts: [],
      },
      validationCriteria: [],
      techStack: [],
      estimatedEffort: "Unknown",
      confidence: 0,
      nextPhase: "COMPLETE",
      risks: [],
      assumptions: [],
    };

    try {
      // Step 1: Analyze requirements and constraints
      const requirements = this.analyzeRequirements(options);

      // Step 2: Make technology stack decisions
      result.techStack = await this.decideTechStack(options, requirements);

      // Step 3: Design system architecture
      const architecture = this.designArchitecture(options, result.techStack);

      // Step 4: Plan file structure
      result.fileStructure = this.planFileStructure(options, architecture);

      // Step 5: Define API contracts
      result.apiContracts = this.defineApiContracts(options, architecture);

      // Step 6: Identify dependencies
      result.dependencies = await this.analyzeDependencies(
        result.techStack,
        result.apiContracts
      );

      // Step 7: Create implementation plan
      result.implementationPlan = this.createImplementationPlan(
        options,
        result
      );

      // Step 8: Define validation criteria
      result.validationCriteria = this.defineValidationCriteria(
        result.techStack,
        result.implementationPlan
      );

      // Step 9: Assess risks and assumptions
      result.risks = this.assessRisks(options, result);
      result.assumptions = this.identifyAssumptions(options, result);

      // Step 10: Calculate metrics
      result.estimatedEffort = this.estimateEffort(result.implementationPlan);
      result.confidence = this.calculateConfidence(options, result);
      result.nextPhase = this.determineNextPhase(result);
      result.success = true;

      this.planningHistory.push(result);

      Logger.info("PLAN phase completed", {
        success: result.success,
        implementationSteps: result.implementationPlan.length,
        apiContracts: result.apiContracts.length,
        dependencies:
          result.dependencies.production.length +
          result.dependencies.development.length,
        confidence: result.confidence,
        nextPhase: result.nextPhase,
        risks: result.risks.length,
      });

      return result;
    } catch (error) {
      Logger.error("PLAN phase failed", {
        error: (error as Error).message,
      });

      result.success = false;
      result.confidence = 0.1;
      result.risks.push({
        id: "planning_failure",
        category: "technical",
        description: `Planning failed: ${(error as Error).message}`,
        probability: "high",
        impact: "high",
        mitigation: [
          "Review requirements",
          "Simplify scope",
          "Request human assistance",
        ],
        owner: "agent",
      });

      return result;
    }
  }

  private analyzeRequirements(options: PlanOptions): RequirementAnalysis {
    const vision = options.vision.toLowerCase();
    const exploration = options.explorationResult;

    // Extract key requirements from vision
    const features = this.extractFeatures(vision);
    const nonFunctionalRequirements = this.extractNonFunctionalRequirements(
      vision,
      options
    );
    const integrations = this.extractIntegrations(vision);

    return {
      features,
      nonFunctionalRequirements,
      integrations,
      existingAssets: exploration.keyFiles,
      constraints: options.constraints || [],
      complexity: this.assessComplexity(vision, exploration),
    };
  }

  private extractFeatures(vision: string): string[] {
    const features: string[] = [];

    // Common feature patterns
    const featurePatterns = [
      {
        pattern:
          /\b(?:create|build|make)\s+(.+?)(?:\s+for|\s+with|\s+that|\.)/g,
        prefix: "Create",
      },
      {
        pattern:
          /\b(?:add|implement|include)\s+(.+?)(?:\s+for|\s+with|\s+that|\.)/g,
        prefix: "Add",
      },
      {
        pattern: /\b(?:support|enable)\s+(.+?)(?:\s+for|\s+with|\s+that|\.)/g,
        prefix: "Support",
      },
      {
        pattern: /\bneed\s+(?:to\s+)?(.+?)(?:\s+for|\s+with|\s+that|\.)/g,
        prefix: "Implement",
      },
    ];

    for (const { pattern, prefix } of featurePatterns) {
      let match;
      while ((match = pattern.exec(vision)) !== null) {
        const feature = match[1].trim();
        if (feature.length > 3 && feature.length < 100) {
          features.push(`${prefix} ${feature}`);
        }
      }
    }

    // Default features if none found
    if (features.length === 0) {
      features.push("Implement core functionality");
      features.push("Add error handling");
      features.push("Create documentation");
    }

    return features.slice(0, 20); // Limit features
  }

  private extractNonFunctionalRequirements(
    vision: string,
    options: PlanOptions
  ): string[] {
    const requirements: string[] = [];
    const vision_lower = vision.toLowerCase();

    // Performance requirements
    if (vision_lower.includes("fast") || vision_lower.includes("performance")) {
      requirements.push("Optimize for performance");
    }

    // Scalability requirements
    if (vision_lower.includes("scale") || vision_lower.includes("many users")) {
      requirements.push("Design for scalability");
    }

    // Security requirements
    if (
      vision_lower.includes("secure") ||
      vision_lower.includes("auth") ||
      vision_lower.includes("login")
    ) {
      requirements.push("Implement security measures");
    }

    // Reliability requirements
    if (
      vision_lower.includes("reliable") ||
      vision_lower.includes("production")
    ) {
      requirements.push("Ensure reliability and error handling");
    }

    // Maintainability (always important)
    requirements.push("Write maintainable, well-documented code");
    requirements.push("Follow established coding conventions");

    return requirements;
  }

  private extractIntegrations(vision: string): string[] {
    const integrations: string[] = [];
    const vision_lower = vision.toLowerCase();

    // Database integrations
    if (vision_lower.includes("database") || vision_lower.includes("db")) {
      integrations.push("Database integration");
    }

    // API integrations
    if (
      vision_lower.includes("api") ||
      vision_lower.includes("rest") ||
      vision_lower.includes("graphql")
    ) {
      integrations.push("External API integration");
    }

    // Authentication integrations
    if (
      vision_lower.includes("auth") ||
      vision_lower.includes("oauth") ||
      vision_lower.includes("login")
    ) {
      integrations.push("Authentication system");
    }

    return integrations;
  }

  private assessComplexity(
    vision: string,
    exploration: ExplorationResult
  ): "simple" | "moderate" | "complex" {
    let complexityScore = 0;

    // Vision complexity indicators
    const visionWords = vision.split(" ").length;
    if (visionWords > 50) complexityScore += 1;
    if (visionWords > 100) complexityScore += 1;

    // Technical complexity indicators
    if (vision.toLowerCase().includes("microservice")) complexityScore += 2;
    if (vision.toLowerCase().includes("distributed")) complexityScore += 2;
    if (vision.toLowerCase().includes("realtime")) complexityScore += 1;
    if (vision.toLowerCase().includes("machine learning")) complexityScore += 2;

    // Existing codebase complexity
    if (exploration.technologies.length > 5) complexityScore += 1;
    if (exploration.keyFiles.length > 20) complexityScore += 1;

    if (complexityScore >= 4) return "complex";
    if (complexityScore >= 2) return "moderate";
    return "simple";
  }

  private async decideTechStack(
    options: PlanOptions,
    requirements: RequirementAnalysis
  ): Promise<TechStackDecision[]> {
    const decisions: TechStackDecision[] = [];
    const exploration = options.explorationResult;

    // Frontend decisions
    if (this.needsFrontend(options.vision)) {
      const frontendChoice = this.chooseFrontendTech(
        exploration.technologies,
        requirements
      );
      decisions.push(frontendChoice);
    }

    // Backend decisions
    if (this.needsBackend(options.vision)) {
      const backendChoice = this.chooseBackendTech(
        exploration.technologies,
        requirements
      );
      decisions.push(backendChoice);
    }

    // Database decisions
    if (this.needsDatabase(options.vision)) {
      const dbChoice = this.chooseDatabaseTech(options.vision, requirements);
      decisions.push(dbChoice);
    }

    // Build tool decisions
    const buildChoice = this.chooseBuildTech(
      exploration.technologies,
      requirements
    );
    decisions.push(buildChoice);

    // Testing decisions
    const testChoice = this.chooseTestTech(
      exploration.technologies,
      requirements
    );
    decisions.push(testChoice);

    return decisions;
  }

  private needsFrontend(vision: string): boolean {
    const vision_lower = vision.toLowerCase();
    return (
      vision_lower.includes("ui") ||
      vision_lower.includes("frontend") ||
      vision_lower.includes("web app") ||
      vision_lower.includes("interface") ||
      vision_lower.includes("react") ||
      vision_lower.includes("vue") ||
      vision_lower.includes("angular")
    );
  }

  private needsBackend(vision: string): boolean {
    const vision_lower = vision.toLowerCase();
    return (
      vision_lower.includes("api") ||
      vision_lower.includes("server") ||
      vision_lower.includes("backend") ||
      vision_lower.includes("database") ||
      vision_lower.includes("auth")
    );
  }

  private needsDatabase(vision: string): boolean {
    const vision_lower = vision.toLowerCase();
    return (
      vision_lower.includes("database") ||
      vision_lower.includes("data") ||
      vision_lower.includes("store") ||
      vision_lower.includes("persist")
    );
  }

  private chooseFrontendTech(
    existingTech: string[],
    requirements: RequirementAnalysis
  ): TechStackDecision {
    // Prefer existing technology if present
    if (existingTech.includes("react")) {
      return {
        category: "frontend",
        chosen: "React",
        alternatives: ["Vue.js", "Angular", "Svelte"],
        reasoning: "React is already used in the project",
        tradeoffs: ["Large bundle size", "Steep learning curve for beginners"],
        confidence: 0.9,
      };
    }

    if (existingTech.includes("vue")) {
      return {
        category: "frontend",
        chosen: "Vue.js",
        alternatives: ["React", "Angular", "Svelte"],
        reasoning: "Vue.js is already used in the project",
        tradeoffs: ["Smaller ecosystem than React", "Less corporate backing"],
        confidence: 0.9,
      };
    }

    // Default choice for new projects
    return {
      category: "frontend",
      chosen: "React",
      alternatives: ["Vue.js", "Angular", "Svelte"],
      reasoning: "React has the largest ecosystem and community support",
      tradeoffs: ["Larger learning curve", "More complex setup"],
      confidence: 0.8,
    };
  }

  private chooseBackendTech(
    existingTech: string[],
    requirements: RequirementAnalysis
  ): TechStackDecision {
    if (existingTech.includes("express")) {
      return {
        category: "backend",
        chosen: "Express.js",
        alternatives: ["Fastify", "Koa.js", "NestJS"],
        reasoning: "Express.js is already used in the project",
        tradeoffs: ["Older architecture", "Requires more boilerplate"],
        confidence: 0.9,
      };
    }

    if (existingTech.includes("fastify")) {
      return {
        category: "backend",
        chosen: "Fastify",
        alternatives: ["Express.js", "Koa.js", "NestJS"],
        reasoning: "Fastify is already used in the project",
        tradeoffs: ["Smaller ecosystem", "Newer technology"],
        confidence: 0.9,
      };
    }

    return {
      category: "backend",
      chosen: "Express.js",
      alternatives: ["Fastify", "NestJS", "Koa.js"],
      reasoning: "Express.js has the largest ecosystem and is battle-tested",
      tradeoffs: [
        "More verbose than modern alternatives",
        "Requires more setup",
      ],
      confidence: 0.8,
    };
  }

  private chooseDatabaseTech(
    vision: string,
    requirements: RequirementAnalysis
  ): TechStackDecision {
    const vision_lower = vision.toLowerCase();

    if (
      vision_lower.includes("postgresql") ||
      vision_lower.includes("postgres")
    ) {
      return {
        category: "database",
        chosen: "PostgreSQL",
        alternatives: ["MySQL", "SQLite", "MongoDB"],
        reasoning: "PostgreSQL specified in requirements",
        tradeoffs: [
          "More complex setup than SQLite",
          "Heavier than needed for simple apps",
        ],
        confidence: 0.95,
      };
    }

    if (requirements.complexity === "simple") {
      return {
        category: "database",
        chosen: "SQLite",
        alternatives: ["PostgreSQL", "MySQL", "MongoDB"],
        reasoning: "SQLite is perfect for simple applications and prototyping",
        tradeoffs: ["Limited concurrency", "Not suitable for production scale"],
        confidence: 0.8,
      };
    }

    return {
      category: "database",
      chosen: "PostgreSQL",
      alternatives: ["MySQL", "SQLite", "MongoDB"],
      reasoning:
        "PostgreSQL offers the best balance of features and reliability",
      tradeoffs: ["More complex setup", "Resource intensive"],
      confidence: 0.8,
    };
  }

  private chooseBuildTech(
    existingTech: string[],
    requirements: RequirementAnalysis
  ): TechStackDecision {
    if (existingTech.includes("typescript")) {
      return {
        category: "build",
        chosen: "TypeScript + Vite",
        alternatives: ["Webpack", "Rollup", "esbuild"],
        reasoning:
          "TypeScript is already in use, Vite provides fast development",
        tradeoffs: ["Learning curve for Vite", "Less mature than Webpack"],
        confidence: 0.9,
      };
    }

    return {
      category: "build",
      chosen: "Vite",
      alternatives: ["Webpack", "Rollup", "Parcel"],
      reasoning: "Vite offers fast development and modern defaults",
      tradeoffs: [
        "Newer tool with smaller ecosystem",
        "Different configuration",
      ],
      confidence: 0.8,
    };
  }

  private chooseTestTech(
    existingTech: string[],
    requirements: RequirementAnalysis
  ): TechStackDecision {
    if (existingTech.includes("jest")) {
      return {
        category: "test",
        chosen: "Jest",
        alternatives: ["Vitest", "Mocha + Chai", "Testing Library"],
        reasoning: "Jest is already configured in the project",
        tradeoffs: ["Slower than newer alternatives", "Heavy configuration"],
        confidence: 0.9,
      };
    }

    return {
      category: "test",
      chosen: "Vitest",
      alternatives: ["Jest", "Mocha + Chai", "Playwright"],
      reasoning: "Vitest is fast and works well with modern build tools",
      tradeoffs: ["Newer with smaller ecosystem", "Less plugin support"],
      confidence: 0.8,
    };
  }

  private designArchitecture(
    options: PlanOptions,
    techStack: TechStackDecision[]
  ): Architecture {
    // This would contain more sophisticated architecture decisions
    // For now, return a basic structure
    return {
      pattern: "layered",
      layers: ["presentation", "business", "data"],
      components: [],
    };
  }

  private planFileStructure(
    options: PlanOptions,
    architecture: Architecture
  ): FileStructurePlan {
    const directories: DirectoryPlan[] = [
      {
        path: "src",
        purpose: "Main source code directory",
        contents: ["components", "utils", "types", "services"],
      },
      {
        path: "src/components",
        purpose: "Reusable UI components",
        contents: ["Button.tsx", "Modal.tsx", "Form.tsx"],
      },
      {
        path: "src/utils",
        purpose: "Utility functions and helpers",
        contents: ["api.ts", "validation.ts", "constants.ts"],
      },
      {
        path: "tests",
        purpose: "Test files and test utilities",
        contents: ["unit", "integration", "helpers"],
      },
      {
        path: "docs",
        purpose: "Project documentation",
        contents: ["README.md", "API.md", "CONTRIBUTING.md"],
      },
    ];

    const files: FilePlan[] = [
      {
        path: "src/index.ts",
        purpose: "Main entry point",
        dependencies: [],
        exports: ["main function", "app initialization"],
        size: "small",
        complexity: "simple",
      },
      {
        path: "src/App.tsx",
        purpose: "Root React component",
        dependencies: ["React", "components"],
        exports: ["App component"],
        size: "medium",
        complexity: "moderate",
      },
      {
        path: "package.json",
        purpose: "Project configuration and dependencies",
        dependencies: [],
        exports: [],
        size: "small",
        complexity: "simple",
      },
    ];

    const conventions = [
      "Use TypeScript for all source files",
      "Use kebab-case for file names",
      "Use PascalCase for component names",
      "Keep components under 200 lines",
      "Write tests for all utility functions",
    ];

    return { directories, files, conventions };
  }

  private defineApiContracts(
    options: PlanOptions,
    architecture: Architecture
  ): ApiContract[] {
    // Return empty array for now - would be populated based on requirements
    return [];
  }

  private async analyzeDependencies(
    techStack: TechStackDecision[],
    apiContracts: ApiContract[]
  ): Promise<DependencyMap> {
    const production: DependencyInfo[] = [];
    const development: DependencyInfo[] = [];

    // Add dependencies based on tech stack
    for (const decision of techStack) {
      const deps = this.getDependenciesForTech(
        decision.chosen,
        decision.category
      );
      production.push(...deps.production);
      development.push(...deps.development);
    }

    return {
      production,
      development,
      peer: [],
      conflicts: [],
    };
  }

  private getDependenciesForTech(
    tech: string,
    category: string
  ): { production: DependencyInfo[]; development: DependencyInfo[] } {
    const production: DependencyInfo[] = [];
    const development: DependencyInfo[] = [];

    if (tech === "React") {
      production.push({
        name: "react",
        version: "^18.2.0",
        purpose: "UI library",
        size: 42,
        security: "high",
      });
      production.push({
        name: "react-dom",
        version: "^18.2.0",
        purpose: "React DOM rendering",
        size: 130,
        security: "high",
      });
    }

    if (tech === "Express.js") {
      production.push({
        name: "express",
        version: "^4.18.0",
        purpose: "Web framework",
        size: 200,
        security: "high",
      });
    }

    if (tech === "TypeScript + Vite") {
      development.push({
        name: "typescript",
        version: "^5.0.0",
        purpose: "Type checking",
        size: 1500,
        security: "high",
      });
      development.push({
        name: "vite",
        version: "^4.4.0",
        purpose: "Build tool",
        size: 800,
        security: "high",
      });
    }

    return { production, development };
  }

  private createImplementationPlan(
    options: PlanOptions,
    result: Partial<PlanningResult>
  ): ImplementationStep[] {
    const steps: ImplementationStep[] = [];

    // Step 1: Project setup
    steps.push({
      id: "setup-project",
      phase: "setup",
      title: "Initialize project structure",
      description:
        "Create directory structure, configuration files, and basic setup",
      dependencies: [],
      estimatedTime: 30,
      priority: "critical",
      complexity: "simple",
      validationCriteria: [
        "Project structure matches plan",
        "Configuration files are valid",
      ],
      deliverables: ["package.json", "tsconfig.json", "directory structure"],
      risks: ["Configuration conflicts"],
    });

    // Step 2: Core implementation
    steps.push({
      id: "implement-core",
      phase: "core",
      title: "Implement core functionality",
      description: "Build the main features and business logic",
      dependencies: ["setup-project"],
      estimatedTime: 120,
      priority: "critical",
      complexity: "moderate",
      validationCriteria: [
        "Core features work as expected",
        "No TypeScript errors",
      ],
      deliverables: ["Main components", "Business logic", "API endpoints"],
      risks: ["Complex business logic", "Integration challenges"],
    });

    // Step 3: Testing
    steps.push({
      id: "add-tests",
      phase: "testing",
      title: "Add comprehensive tests",
      description: "Write unit tests, integration tests, and end-to-end tests",
      dependencies: ["implement-core"],
      estimatedTime: 60,
      priority: "high",
      complexity: "moderate",
      validationCriteria: ["Test coverage > 80%", "All tests pass"],
      deliverables: ["Unit tests", "Integration tests", "Test utilities"],
      risks: ["Complex test scenarios", "Flaky tests"],
    });

    // Step 4: Documentation
    steps.push({
      id: "add-documentation",
      phase: "documentation",
      title: "Create documentation",
      description: "Write README, API docs, and inline code documentation",
      dependencies: ["implement-core"],
      estimatedTime: 45,
      priority: "medium",
      complexity: "simple",
      validationCriteria: ["README is comprehensive", "API is documented"],
      deliverables: ["README.md", "API documentation", "Code comments"],
      risks: ["Outdated documentation"],
    });

    return steps;
  }

  private defineValidationCriteria(
    techStack: TechStackDecision[],
    implementationPlan: ImplementationStep[]
  ): ValidationRule[] {
    const rules: ValidationRule[] = [];

    // TypeScript validation
    if (techStack.some((t) => t.chosen.includes("TypeScript"))) {
      rules.push({
        type: "typescript",
        description: "TypeScript compilation check",
        command: "npx tsc --noEmit",
        failureAction: "block",
        autoFix: false,
        priority: "critical",
      });
    }

    // Linting validation
    rules.push({
      type: "eslint",
      description: "Code quality and style check",
      command: "npx eslint src",
      failureAction: "warn",
      autoFix: true,
      priority: "high",
    });

    // Test validation
    rules.push({
      type: "test",
      description: "Run all tests",
      command: "npm test",
      failureAction: "block",
      autoFix: false,
      priority: "critical",
    });

    // Build validation
    rules.push({
      type: "build",
      description: "Production build check",
      command: "npm run build",
      failureAction: "block",
      autoFix: false,
      priority: "critical",
    });

    return rules;
  }

  private assessRisks(
    options: PlanOptions,
    result: Partial<PlanningResult>
  ): Risk[] {
    const risks: Risk[] = [];

    // Technical risks
    if (result.techStack?.some((t) => t.confidence < 0.7)) {
      risks.push({
        id: "tech-stack-uncertainty",
        category: "technical",
        description: "Uncertainty in technology stack decisions",
        probability: "medium",
        impact: "medium",
        mitigation: ["Prototype critical components", "Research alternatives"],
        owner: "agent",
      });
    }

    // Complexity risks
    if (result.implementationPlan?.some((s) => s.complexity === "complex")) {
      risks.push({
        id: "implementation-complexity",
        category: "complexity",
        description: "Complex implementation steps may take longer",
        probability: "medium",
        impact: "high",
        mitigation: ["Break down complex steps", "Implement incrementally"],
        owner: "agent",
      });
    }

    return risks;
  }

  private identifyAssumptions(
    options: PlanOptions,
    result: Partial<PlanningResult>
  ): string[] {
    return [
      "Development environment has necessary tools installed",
      "Network access is available for dependency installation",
      "No major requirement changes during implementation",
      "Standard development practices are acceptable",
    ];
  }

  private estimateEffort(implementationPlan: ImplementationStep[]): string {
    const totalMinutes = implementationPlan.reduce(
      (sum, step) => sum + step.estimatedTime,
      0
    );
    const hours = Math.round(totalMinutes / 60);

    if (hours < 2) return "1-2 hours";
    if (hours < 8) return `${hours} hours`;
    if (hours < 24) return "1 day";

    const days = Math.round(hours / 8);
    return `${days} days`;
  }

  private calculateConfidence(
    options: PlanOptions,
    result: PlanningResult
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase based on exploration quality
    if (options.explorationResult.confidence > 0.7) {
      confidence += 0.2;
    }

    // Increase based on tech stack confidence
    const avgTechConfidence =
      result.techStack.reduce((sum, t) => sum + t.confidence, 0) /
      result.techStack.length;
    confidence += (avgTechConfidence - 0.5) * 0.3;

    // Decrease based on risks
    const highRisks = result.risks.filter((r) => r.impact === "high").length;
    confidence -= highRisks * 0.1;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private determineNextPhase(result: PlanningResult): AgentPhase {
    if (!result.success || result.confidence < 0.4) {
      return "EXPLORE"; // Go back to exploration if planning failed
    }

    // Skip SUMMON for now (not implemented)
    return "COMPLETE";
  }

  // Public methods for monitoring and debugging
  getPlanningHistory(): ReadonlyArray<PlanningResult> {
    return [...this.planningHistory];
  }

  getLastPlan(): PlanningResult | null {
    return this.planningHistory.length > 0
      ? this.planningHistory[this.planningHistory.length - 1]
      : null;
  }

  clearHistory(): void {
    this.planningHistory = [];
  }
}

// Helper interfaces
interface RequirementAnalysis {
  features: string[];
  nonFunctionalRequirements: string[];
  integrations: string[];
  existingAssets: string[];
  constraints: string[];
  complexity: "simple" | "moderate" | "complex";
}

interface Architecture {
  pattern: string;
  layers: string[];
  components: any[];
}
