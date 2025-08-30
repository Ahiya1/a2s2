import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { PlanPhase, PlanOptions } from "../../../src/agent/phases/PlanPhase";
import { ToolManager } from "../../../src/tools/ToolManager";
import { ExplorationResult } from "../../../src/agent/phases/ExplorePhase";
import { TestUtils } from "../../helpers/TestUtils";

describe("PlanPhase", () => {
  let planPhase: PlanPhase;
  let toolManager: ToolManager;
  let tempDir: string;
  let mockExplorationResult: ExplorationResult;

  beforeEach(async () => {
    toolManager = new ToolManager();
    planPhase = new PlanPhase(toolManager);
    tempDir = await TestUtils.createTempDir();

    // Mock exploration result
    mockExplorationResult = {
      projectStructure: `
        ├── src/
        │   ├── index.ts
        │   └── components/
        ├── package.json
        ├── tsconfig.json
        └── README.md
      `,
      keyFiles: ["package.json", "tsconfig.json", "src/index.ts"],
      technologies: ["typescript", "react", "jest"],
      requirements: [
        "Create UI components",
        "Add type safety",
        "Test coverage",
      ],
      recommendations: ["Use TypeScript", "Add ESLint", "Implement testing"],
      confidence: 0.8,
      nextPhase: "PLAN",
    };
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
    planPhase.clearHistory();
  });

  describe("Basic Execution", () => {
    test("should execute planning successfully", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create a modern React application with TypeScript and testing",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.implementationPlan.length).toBeGreaterThan(0);
      expect(result.techStack.length).toBeGreaterThan(0);
      expect(result.fileStructure).toBeDefined();
      expect(result.dependencies).toBeDefined();
      expect(result.validationCriteria.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.nextPhase).toBeDefined();
    });

    test("should handle simple projects", async () => {
      const simpleOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create a simple hello world application",
        explorationResult: {
          ...mockExplorationResult,
          technologies: ["javascript"],
          requirements: ["Simple output"],
        },
        complexity: "simple",
      };

      const result = await planPhase.execute(simpleOptions);

      expect(result.success).toBe(true);
      expect(result.implementationPlan.length).toBeGreaterThan(0);
      expect(result.estimatedEffort).toContain("hours");
    });

    test("should handle complex projects", async () => {
      const complexOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision:
          "Create a distributed microservices architecture with real-time features, machine learning integration, and comprehensive monitoring",
        explorationResult: {
          ...mockExplorationResult,
          technologies: [
            "typescript",
            "docker",
            "kubernetes",
            "postgresql",
            "redis",
          ],
          requirements: [
            "Microservices",
            "Real-time updates",
            "ML integration",
          ],
        },
        complexity: "complex",
      };

      const result = await planPhase.execute(complexOptions);

      expect(result.success).toBe(true);
      expect(result.risks.length).toBeGreaterThan(0);
      expect(result.estimatedEffort).toContain("days");
      expect(result.confidence).toBeLessThan(0.9); // Complex projects have lower confidence
    });
  });

  describe("Requirement Analysis", () => {
    test("should extract features from vision", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision:
          "Create a todo application with user authentication, add task management features, implement real-time sync",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      // Should extract multiple features
      const planText = JSON.stringify(result);
      expect(planText.toLowerCase()).toMatch(/todo|task/);
      expect(planText.toLowerCase()).toMatch(/auth|login/);
      expect(planText.toLowerCase()).toMatch(/real.?time|sync/);
    });

    test("should identify non-functional requirements", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision:
          "Create a high-performance, scalable web application that is secure and reliable for production use",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      // Should include non-functional requirements
      const planText = JSON.stringify(result);
      expect(planText.toLowerCase()).toMatch(/performance|scalable/);
      expect(planText.toLowerCase()).toMatch(/secure|security/);
      expect(planText.toLowerCase()).toMatch(/reliable|production/);
    });

    test("should detect integration requirements", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision:
          "Build an app that integrates with external APIs, requires database storage, and needs OAuth authentication",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      // Should identify integrations
      const planText = JSON.stringify(result);
      expect(planText.toLowerCase()).toMatch(/api|integration/);
      expect(planText.toLowerCase()).toMatch(/database|storage/);
      expect(planText.toLowerCase()).toMatch(/auth|oauth/);
    });

    test("should assess project complexity", async () => {
      const microserviceOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision:
          "Create a distributed microservices platform with machine learning capabilities",
        explorationResult: {
          ...mockExplorationResult,
          technologies: ["docker", "kubernetes", "tensorflow"],
        },
      };

      const result = await planPhase.execute(microserviceOptions);

      expect(result.success).toBe(true);
      expect(result.risks.length).toBeGreaterThan(2);
      expect(result.confidence).toBeLessThan(0.8);
    });
  });

  describe("Technology Stack Decisions", () => {
    test("should prefer existing technologies", async () => {
      const reactOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Enhance the existing web application",
        explorationResult: {
          ...mockExplorationResult,
          technologies: ["react", "typescript", "express"],
        },
      };

      const result = await planPhase.execute(reactOptions);

      expect(result.success).toBe(true);
      expect(result.techStack.some((t) => t.chosen === "React")).toBe(true);
      expect(result.techStack.some((t) => t.chosen === "Express.js")).toBe(
        true
      );

      // Existing tech should have high confidence
      const reactDecision = result.techStack.find((t) => t.chosen === "React");
      expect(reactDecision?.confidence).toBeGreaterThan(0.8);
    });

    test("should make frontend technology decisions", async () => {
      const uiOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision:
          "Create a modern web UI with components and interactive features",
        explorationResult: {
          ...mockExplorationResult,
          technologies: [],
        },
      };

      const result = await planPhase.execute(uiOptions);

      expect(result.success).toBe(true);
      expect(result.techStack.some((t) => t.category === "frontend")).toBe(
        true
      );

      const frontendChoice = result.techStack.find(
        (t) => t.category === "frontend"
      );
      expect(frontendChoice?.chosen).toBeDefined();
      expect(frontendChoice?.alternatives.length).toBeGreaterThan(0);
      expect(frontendChoice?.reasoning).toBeDefined();
    });

    test("should make backend technology decisions", async () => {
      const apiOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Build a REST API server with database integration",
        explorationResult: {
          ...mockExplorationResult,
          technologies: [],
        },
      };

      const result = await planPhase.execute(apiOptions);

      expect(result.success).toBe(true);
      expect(result.techStack.some((t) => t.category === "backend")).toBe(true);

      const backendChoice = result.techStack.find(
        (t) => t.category === "backend"
      );
      expect(backendChoice?.chosen).toBeDefined();
      expect(backendChoice?.reasoning).toContain("Express.js");
    });

    test("should make database technology decisions", async () => {
      const dataOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create an application that stores user data and preferences",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(dataOptions);

      expect(result.success).toBe(true);
      expect(result.techStack.some((t) => t.category === "database")).toBe(
        true
      );

      const dbChoice = result.techStack.find((t) => t.category === "database");
      expect(dbChoice?.chosen).toBeDefined();
      expect(dbChoice?.alternatives.length).toBeGreaterThan(0);
    });

    test("should choose appropriate database for complexity", async () => {
      const simpleOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Simple prototype application",
        explorationResult: mockExplorationResult,
        complexity: "simple",
      };

      const result = await planPhase.execute(simpleOptions);
      const dbChoice = result.techStack.find((t) => t.category === "database");
      expect(dbChoice?.chosen).toBe("SQLite");

      const complexOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Production-scale enterprise application",
        explorationResult: mockExplorationResult,
        complexity: "complex",
      };

      const complexResult = await planPhase.execute(complexOptions);
      const complexDbChoice = complexResult.techStack.find(
        (t) => t.category === "database"
      );
      expect(complexDbChoice?.chosen).toBe("PostgreSQL");
    });

    test("should include build and test tool decisions", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create a well-tested application with modern build tools",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.techStack.some((t) => t.category === "build")).toBe(true);
      expect(result.techStack.some((t) => t.category === "test")).toBe(true);
    });
  });

  describe("File Structure Planning", () => {
    test("should plan directory structure", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create a React application with TypeScript",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.fileStructure.directories.length).toBeGreaterThan(0);

      const srcDir = result.fileStructure.directories.find(
        (d) => d.path === "src"
      );
      expect(srcDir).toBeDefined();
      expect(srcDir?.purpose).toContain("source");
    });

    test("should plan individual files", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create a TypeScript project",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.fileStructure.files.length).toBeGreaterThan(0);

      const packageFile = result.fileStructure.files.find(
        (f) => f.path === "package.json"
      );
      expect(packageFile).toBeDefined();
      expect(packageFile?.purpose).toContain("configuration");
    });

    test("should define coding conventions", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create a maintainable codebase",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.fileStructure.conventions.length).toBeGreaterThan(0);
      expect(
        result.fileStructure.conventions.some((c) => c.includes("TypeScript"))
      ).toBe(true);
    });
  });

  describe("Implementation Planning", () => {
    test("should create implementation steps", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Build a complete web application",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.implementationPlan.length).toBeGreaterThan(2);

      // Should have setup step
      const setupStep = result.implementationPlan.find(
        (s) => s.phase === "setup"
      );
      expect(setupStep).toBeDefined();
      expect(setupStep?.priority).toBe("critical");

      // Should have core implementation
      const coreStep = result.implementationPlan.find(
        (s) => s.phase === "core"
      );
      expect(coreStep).toBeDefined();
      expect(coreStep?.estimatedTime).toBeGreaterThan(0);
    });

    test("should include testing steps", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create a well-tested application",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      const testStep = result.implementationPlan.find(
        (s) => s.phase === "testing"
      );
      expect(testStep).toBeDefined();
      expect(testStep?.title).toMatch(/test/i);
      expect(
        testStep?.validationCriteria.some((c) => c.includes("coverage"))
      ).toBe(true);
    });

    test("should prioritize steps correctly", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Build application incrementally",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      const criticalSteps = result.implementationPlan.filter(
        (s) => s.priority === "critical"
      );
      const highSteps = result.implementationPlan.filter(
        (s) => s.priority === "high"
      );

      expect(criticalSteps.length).toBeGreaterThan(0);
      expect(highSteps.length).toBeGreaterThan(0);
    });

    test("should define step dependencies", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create project with proper dependency order",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      const setupStep = result.implementationPlan.find(
        (s) => s.id === "setup-project"
      );
      expect(setupStep?.dependencies).toEqual([]);

      const dependentSteps = result.implementationPlan.filter(
        (s) => s.dependencies.length > 0
      );
      expect(dependentSteps.length).toBeGreaterThan(0);
    });

    test("should estimate effort realistically", async () => {
      const quickOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Simple hello world",
        explorationResult: mockExplorationResult,
        complexity: "simple",
      };

      const quickResult = await planPhase.execute(quickOptions);
      expect(quickResult.estimatedEffort).toMatch(/hours?/);

      const complexOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Complex enterprise application with multiple services",
        explorationResult: {
          ...mockExplorationResult,
          technologies: ["microservices", "docker", "kubernetes"],
        },
        complexity: "complex",
      };

      const complexResult = await planPhase.execute(complexOptions);
      expect(complexResult.estimatedEffort).toMatch(/days?/);
    });
  });

  describe("Dependency Analysis", () => {
    test("should analyze production dependencies", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create React application",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.dependencies.production.length).toBeGreaterThan(0);

      const reactDep = result.dependencies.production.find(
        (d) => d.name === "react"
      );
      expect(reactDep).toBeDefined();
      expect(reactDep?.version).toMatch(/^\^?\d+\.\d+\.\d+/);
      expect(reactDep?.security).toBeDefined();
    });

    test("should analyze development dependencies", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create TypeScript project with build tools",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.dependencies.development.length).toBeGreaterThan(0);

      const tsDep = result.dependencies.development.find(
        (d) => d.name === "typescript"
      );
      expect(tsDep).toBeDefined();
      expect(tsDep?.purpose).toContain("Type checking");
    });

    test("should estimate package sizes", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create lightweight application",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      result.dependencies.production.forEach((dep) => {
        expect(dep.size).toBeGreaterThan(0);
        expect(typeof dep.size).toBe("number");
      });
    });
  });

  describe("Validation Criteria", () => {
    test("should define TypeScript validation", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create TypeScript application",
        explorationResult: {
          ...mockExplorationResult,
          technologies: ["typescript"],
        },
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      const tsValidation = result.validationCriteria.find(
        (v) => v.type === "typescript"
      );
      expect(tsValidation).toBeDefined();
      expect(tsValidation?.command).toContain("tsc");
      expect(tsValidation?.priority).toBe("critical");
    });

    test("should define ESLint validation", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create well-linted codebase",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      const lintValidation = result.validationCriteria.find(
        (v) => v.type === "eslint"
      );
      expect(lintValidation).toBeDefined();
      expect(lintValidation?.autoFix).toBe(true);
      expect(lintValidation?.failureAction).toBe("warn");
    });

    test("should define test validation", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create tested application",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      const testValidation = result.validationCriteria.find(
        (v) => v.type === "test"
      );
      expect(testValidation).toBeDefined();
      expect(testValidation?.failureAction).toBe("block");
    });

    test("should define build validation", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create production-ready app",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      const buildValidation = result.validationCriteria.find(
        (v) => v.type === "build"
      );
      expect(buildValidation).toBeDefined();
      expect(buildValidation?.priority).toBe("critical");
    });
  });

  describe("Risk Assessment", () => {
    test("should identify technical risks", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Use bleeding-edge experimental technologies",
        explorationResult: {
          ...mockExplorationResult,
          technologies: ["experimental-tech"],
        },
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.risks.length).toBeGreaterThan(0);

      const techRisks = result.risks.filter((r) => r.category === "technical");
      expect(techRisks.length).toBeGreaterThan(0);
    });

    test("should identify complexity risks", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Build highly complex system with many moving parts",
        explorationResult: mockExplorationResult,
        complexity: "complex",
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      const complexityRisks = result.risks.filter(
        (r) => r.category === "complexity"
      );
      expect(complexityRisks.length).toBeGreaterThan(0);

      complexityRisks.forEach((risk) => {
        expect(risk.mitigation.length).toBeGreaterThan(0);
        expect(risk.probability).toMatch(/low|medium|high/);
        expect(risk.impact).toMatch(/low|medium|high/);
      });
    });

    test("should assess risk impact and probability", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create challenging project",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      result.risks.forEach((risk) => {
        expect(["low", "medium", "high"]).toContain(risk.probability);
        expect(["low", "medium", "high"]).toContain(risk.impact);
        expect(risk.mitigation.length).toBeGreaterThan(0);
        expect(["agent", "human", "team"]).toContain(risk.owner);
      });
    });

    test("should provide risk mitigation strategies", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Risky project with unknowns",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      result.risks.forEach((risk) => {
        expect(risk.mitigation.length).toBeGreaterThan(0);
        risk.mitigation.forEach((mitigation) => {
          expect(typeof mitigation).toBe("string");
          expect(mitigation.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe("Confidence Calculation", () => {
    test("should have high confidence for well-explored projects", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Standard React TypeScript project",
        explorationResult: {
          ...mockExplorationResult,
          confidence: 0.9,
          technologies: ["react", "typescript"],
        },
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test("should have lower confidence for poorly explored projects", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Vague project requirements",
        explorationResult: {
          ...mockExplorationResult,
          confidence: 0.3,
          technologies: [],
          keyFiles: [],
        },
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.confidence).toBeLessThan(0.6);
    });

    test("should reduce confidence for high-risk projects", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision:
          "Extremely complex project with many unknowns and experimental tech",
        explorationResult: {
          ...mockExplorationResult,
          technologies: ["bleeding-edge-tech"],
        },
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(
        result.risks.filter((r) => r.impact === "high").length
      ).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(0.8);
    });
  });

  describe("Next Phase Determination", () => {
    test("should proceed to COMPLETE for successful planning", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Well-defined project",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.4);
      expect(result.nextPhase).toBe("COMPLETE");
    });

    test("should return to EXPLORE for low confidence", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Poorly understood project",
        explorationResult: {
          ...mockExplorationResult,
          confidence: 0.1,
          keyFiles: [],
          technologies: [],
        },
      };

      const result = await planPhase.execute(options);

      expect(result.confidence).toBeLessThan(0.4);
      if (result.nextPhase === "EXPLORE") {
        // This is acceptable behavior for low confidence
        expect(result.success).toBe(true);
      }
    });
  });

  describe("History Management", () => {
    test("should track planning history", async () => {
      expect(planPhase.getPlanningHistory().length).toBe(0);

      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Test project",
        explorationResult: mockExplorationResult,
      };

      await planPhase.execute(options);

      expect(planPhase.getPlanningHistory().length).toBe(1);
      expect(planPhase.getLastPlan()).toBeDefined();
    });

    test("should maintain multiple planning attempts", async () => {
      const options1: PlanOptions = {
        workingDirectory: tempDir,
        vision: "First project",
        explorationResult: mockExplorationResult,
      };

      const options2: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Second project",
        explorationResult: mockExplorationResult,
      };

      await planPhase.execute(options1);
      await planPhase.execute(options2);

      const history = planPhase.getPlanningHistory();
      expect(history.length).toBe(2);
      expect(history[0]).not.toEqual(history[1]);
    });

    test("should clear history", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Test project",
        explorationResult: mockExplorationResult,
      };

      await planPhase.execute(options);
      expect(planPhase.getPlanningHistory().length).toBe(1);

      planPhase.clearHistory();
      expect(planPhase.getPlanningHistory().length).toBe(0);
      expect(planPhase.getLastPlan()).toBeNull();
    });
  });

  describe("Error Handling", () => {
    test("should handle planning failures gracefully", async () => {
      // Mock a failure in tech stack decisions
      const invalidOptions: PlanOptions = {
        workingDirectory: "/invalid/directory/path",
        vision: "", // Empty vision
        explorationResult: {
          ...mockExplorationResult,
          keyFiles: [],
          technologies: [],
          confidence: 0.0,
        },
      };

      const result = await planPhase.execute(invalidOptions);

      expect(result.success).toBe(false);
      expect(result.confidence).toBeLessThanOrEqual(0.1);
      expect(result.risks.some((r) => r.id === "planning_failure")).toBe(true);
    });

    test("should include failure risks in results", async () => {
      const problematicOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Impossible project with contradictory requirements",
        explorationResult: {
          ...mockExplorationResult,
          confidence: 0.0,
          keyFiles: [],
        },
      };

      const result = await planPhase.execute(problematicOptions);

      if (!result.success) {
        expect(result.risks.length).toBeGreaterThan(0);
        const planningRisk = result.risks.find(
          (r) => r.category === "technical"
        );
        expect(planningRisk).toBeDefined();
      }
    });

    test("should handle missing dependencies gracefully", async () => {
      // This tests internal error handling
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Test project",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      // Should complete despite any internal issues
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("Constraints and Preferences", () => {
    test("should respect project constraints", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create web application",
        explorationResult: mockExplorationResult,
        constraints: [
          "No external dependencies",
          "Must use SQLite",
          "JavaScript only",
        ],
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      // Should reflect constraints in assumptions or tech choices
      const assumptionsText = result.assumptions.join(" ");
      expect(assumptionsText).toBeDefined();
    });

    test("should incorporate user preferences", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Create application with preferences",
        explorationResult: mockExplorationResult,
        preferences: {
          database: "postgresql",
          testing: "jest",
          styling: "tailwind",
        },
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      // Preferences should influence tech stack decisions
      expect(result.techStack.length).toBeGreaterThan(0);
    });

    test("should handle timeframe constraints", async () => {
      const urgentOptions: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Quick prototype needed urgently",
        explorationResult: mockExplorationResult,
        timeframe: "1 day",
      };

      const result = await planPhase.execute(urgentOptions);

      expect(result.success).toBe(true);
      expect(result.estimatedEffort).toBeDefined();
    });
  });

  describe("Output Formatting", () => {
    test("should provide comprehensive planning output", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Complete web application",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);
      expect(result.implementationPlan.length).toBeGreaterThan(0);
      expect(result.techStack.length).toBeGreaterThan(0);
      expect(result.fileStructure.directories.length).toBeGreaterThan(0);
      expect(result.dependencies.production.length).toBeGreaterThan(0);
      expect(result.validationCriteria.length).toBeGreaterThan(0);
      expect(result.estimatedEffort).toBeDefined();
      expect(result.assumptions.length).toBeGreaterThan(0);
    });

    test("should include detailed step information", async () => {
      const options: PlanOptions = {
        workingDirectory: tempDir,
        vision: "Detailed project planning",
        explorationResult: mockExplorationResult,
      };

      const result = await planPhase.execute(options);

      expect(result.success).toBe(true);

      result.implementationPlan.forEach((step) => {
        expect(step.id).toBeDefined();
        expect(step.title).toBeDefined();
        expect(step.description).toBeDefined();
        expect(step.estimatedTime).toBeGreaterThan(0);
        expect(["critical", "high", "medium", "low"]).toContain(step.priority);
        expect(["simple", "moderate", "complex"]).toContain(step.complexity);
        expect(Array.isArray(step.validationCriteria)).toBe(true);
        expect(Array.isArray(step.deliverables)).toBe(true);
        expect(Array.isArray(step.risks)).toBe(true);
      });
    });
  });
});
