import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { ExplorePhase } from "../../src/agent/phases/ExplorePhase";
import { PlanPhase } from "../../src/agent/phases/PlanPhase";
import { ToolManager } from "../../src/tools/ToolManager";
import { TestUtils } from "../helpers/TestUtils";
import { ValidationTestUtils } from "../helpers/ValidationTestUtils";
import { GitTestUtils } from "../helpers/GitTestUtils";
import * as path from "path";

describe("Plan Phase Integration", () => {
  let explorePhase: ExplorePhase;
  let planPhase: PlanPhase;
  let toolManager: ToolManager;
  let tempDir: string;

  beforeEach(async () => {
    toolManager = new ToolManager();
    explorePhase = new ExplorePhase(toolManager);
    planPhase = new PlanPhase(toolManager);
    tempDir = await TestUtils.createTempDir();
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
  });

  describe("EXPLORE → PLAN Phase Transition", () => {
    test("should transition from successful exploration to comprehensive planning", async () => {
      // Step 1: Create realistic project for exploration
      await ValidationTestUtils.createFullProject(tempDir, {
        "package.json": JSON.stringify({
          name: "integration-project",
          version: "1.0.0",
          scripts: {
            dev: "vite",
            build: "vite build",
            test: "vitest",
          },
          dependencies: {
            react: "^18.2.0",
            "react-dom": "^18.2.0",
          },
          devDependencies: {
            "@types/react": "^18.0.0",
            typescript: "^5.0.0",
            vite: "^4.4.0",
            vitest: "^1.0.0",
          },
        }),
        "src/App.tsx": `
          import React from 'react';
          
          interface AppProps {
            title: string;
          }
          
          export const App: React.FC<AppProps> = ({ title }) => {
            return (
              <div>
                <h1>{title}</h1>
                <p>Welcome to our React application!</p>
              </div>
            );
          };
        `,
        "src/index.tsx": `
          import React from 'react';
          import ReactDOM from 'react-dom/client';
          import { App } from './App';
          
          const root = ReactDOM.createRoot(
            document.getElementById('root') as HTMLElement
          );
          
          root.render(<App title="My Application" />);
        `,
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            lib: ["DOM", "DOM.Iterable", "ES6"],
            allowJs: true,
            skipLibCheck: true,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            strict: true,
            forceConsistentCasingInFileNames: true,
            module: "ESNext",
            moduleResolution: "node",
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: "react-jsx",
          },
          include: ["src"],
        }),
        "vite.config.ts": `
          import { defineConfig } from 'vite';
          import react from '@vitejs/plugin-react';
          
          export default defineConfig({
            plugins: [react()],
            server: {
              port: 3000,
            },
          });
        `,
        "README.md":
          "# Integration Project\n\nA React TypeScript project with Vite",
        ".gitignore": "node_modules/\ndist/\n*.log",
      });

      // Step 2: Execute exploration phase
      const exploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision:
          "Enhance this React application with modern features and best practices",
        enableValidation: true,
        enableHealing: true,
      });

      expect(exploreResult.success).toBe(true);
      expect(exploreResult.confidence).toBeGreaterThan(0.6);
      expect(exploreResult.technologies).toContain("react");
      expect(exploreResult.technologies).toContain("typescript");
      expect(exploreResult.keyFiles.length).toBeGreaterThan(0);
      expect(exploreResult.nextPhase).toBe("PLAN");

      // Step 3: Execute planning phase with exploration results
      const planResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision:
          "Enhance this React application with modern features and best practices",
        explorationResult: exploreResult,
      });

      expect(planResult.success).toBe(true);
      expect(planResult.confidence).toBeGreaterThan(0.5);
      expect(planResult.nextPhase).toBe("COMPLETE");

      // Validate planning used exploration data effectively
      expect(planResult.techStack.some((t) => t.chosen === "React")).toBe(true);
      expect(
        planResult.techStack.some((t) => t.chosen.includes("TypeScript"))
      ).toBe(true);
      expect(planResult.implementationPlan.length).toBeGreaterThan(3);

      // Validate that existing technologies influenced planning
      const reactDecision = planResult.techStack.find(
        (t) => t.chosen === "React"
      );
      expect(reactDecision?.reasoning).toContain("already");
      expect(reactDecision?.confidence).toBeGreaterThan(0.8);

      // Validate file structure planning considers existing structure
      expect(
        planResult.fileStructure.directories.some((d) => d.path === "src")
      ).toBe(true);

      // Validate dependencies analysis considers existing packages
      expect(
        planResult.dependencies.production.some((d) => d.name === "react")
      ).toBe(true);
      expect(
        planResult.dependencies.development.some((d) => d.name === "typescript")
      ).toBe(true);
    });

    test("should handle low-confidence exploration requiring re-exploration", async () => {
      // Create minimal/confusing project structure
      await TestUtils.createTestFiles(tempDir, {
        "mysterious.file": "unknown content",
        "config.xyz": "mysterious configuration",
      });

      // Step 1: Exploration should have low confidence
      const exploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision: "Work with this mysterious project structure",
        enableValidation: true,
      });

      expect(exploreResult.confidence).toBeLessThan(0.4);
      expect(exploreResult.keyFiles.length).toBeLessThan(3);
      expect(exploreResult.technologies.length).toBeLessThan(2);

      // Step 2: Planning should recognize low confidence and suggest re-exploration
      const planResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision: "Work with this mysterious project structure",
        explorationResult: exploreResult,
      });

      // Plan should succeed but with low confidence
      expect(planResult.success).toBe(true);
      expect(planResult.confidence).toBeLessThan(0.5);

      // Should include risks about uncertainty
      expect(
        planResult.risks.some(
          (r) =>
            r.category === "technical" && r.description.includes("uncertainty")
        )
      ).toBe(true);

      // May suggest returning to exploration
      if (planResult.nextPhase === "EXPLORE") {
        expect(planResult.confidence).toBeLessThan(0.4);
      }
    });

    test("should integrate validation results into planning decisions", async () => {
      // Create project with validation issues
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/problematic.ts": `
          // Code with issues that exploration validation should catch
          const implicitAny = "should be typed";
          let mutableWhenConst = "should be const";
          
          function missingReturn(): string {
            // Missing return statement
            console.log("function without return");
          }
        `,
        "package.json": JSON.stringify({
          name: "problematic-project",
          scripts: {
            build: "tsc",
            lint: "echo 'No linter configured'",
          },
          devDependencies: {
            typescript: "^5.0.0",
          },
        }),
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            strict: true,
            noImplicitReturns: true,
          },
        }),
      });

      // Step 1: Exploration with validation should detect issues
      const exploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision: "Fix and improve this TypeScript project",
        enableValidation: true,
        enableHealing: false, // Don't heal, just detect
      });

      expect(exploreResult.validationResults).toBeDefined();
      expect(exploreResult.validationResults?.passed).toBe(false);
      expect(exploreResult.validationResults?.errors.length).toBeGreaterThan(0);

      // Step 2: Planning should incorporate validation findings
      const planResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision: "Fix and improve this TypeScript project",
        explorationResult: exploreResult,
      });

      expect(planResult.success).toBe(true);

      // Plan should include steps to address validation issues
      expect(
        planResult.implementationPlan.some(
          (step) =>
            step.title.toLowerCase().includes("fix") ||
            step.description.toLowerCase().includes("error")
        )
      ).toBe(true);

      // Should include comprehensive validation criteria
      expect(
        planResult.validationCriteria.some((v) => v.type === "typescript")
      ).toBe(true);
      expect(
        planResult.validationCriteria.some((v) => v.priority === "critical")
      ).toBe(true);

      // Should identify risks related to code quality
      expect(
        planResult.risks.some(
          (r) =>
            r.category === "technical" &&
            (r.description.toLowerCase().includes("quality") ||
              r.description.toLowerCase().includes("error"))
        )
      ).toBe(true);
    });

    test("should demonstrate healing integration between phases", async () => {
      // Create project with systematically fixable issues
      await ValidationTestUtils.createESLintProject(tempDir, {
        "src/fixable-issues.js": `
          // Multiple fixable issues
          var shouldBeConst = 'constant value';  // prefer-const
          let   extraSpaces    = 'spacing';      // no-multi-spaces  
          const unused = 'never used';           // no-unused-vars
          
          function goodFunction() {
            return shouldBeConst + extraSpaces;
          }
        `,
        ".eslintrc.json": JSON.stringify({
          env: { node: true, es6: true },
          extends: ["eslint:recommended"],
          rules: {
            "prefer-const": "error",
            "no-multi-spaces": "error",
            "no-unused-vars": "warn",
          },
        }),
        "package.json": JSON.stringify({
          scripts: {
            lint: "eslint src",
            "lint:fix": "eslint src --fix",
          },
        }),
      });

      // Step 1: Exploration with healing enabled
      const exploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision: "Improve code quality of this JavaScript project",
        enableValidation: true,
        enableHealing: true,
      });

      expect(exploreResult.success).toBe(true);
      expect(exploreResult.validationResults).toBeDefined();
      expect(exploreResult.healingActions).toBeDefined();
      expect(exploreResult.healingActions?.length).toBeGreaterThan(0);

      // Some healing should have occurred
      const executedHealing =
        exploreResult.healingActions?.filter((a) => a.executed) || [];
      if (executedHealing.length > 0) {
        expect(exploreResult.validationResults?.passed).toBe(true);
      }

      // Step 2: Planning should reflect healing capabilities
      const planResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision: "Improve code quality of this JavaScript project",
        explorationResult: exploreResult,
      });

      expect(planResult.success).toBe(true);

      // Plan should include automated fixing in implementation steps
      expect(
        planResult.implementationPlan.some(
          (step) =>
            step.description.toLowerCase().includes("auto") ||
            step.description.toLowerCase().includes("fix")
        )
      ).toBe(true);

      // Should include ESLint with auto-fix in validation criteria
      const eslintValidation = planResult.validationCriteria.find(
        (v) => v.type === "eslint"
      );
      expect(eslintValidation).toBeDefined();
      expect(eslintValidation?.autoFix).toBe(true);

      // Should have higher confidence due to demonstrated healing capability
      expect(planResult.confidence).toBeGreaterThan(0.6);
    });
  });

  describe("PLAN → COMPLETE Phase Transition", () => {
    test("should create actionable implementation plans for completion phase", async () => {
      // Setup: Complete exploration and planning
      await ValidationTestUtils.createFullProject(tempDir, {
        "src/existing.ts": `export const existing = 'code';`,
        "package.json": JSON.stringify({
          name: "plan-to-complete",
          version: "1.0.0",
          scripts: { test: "echo 'No tests yet'" },
        }),
        "tsconfig.json": JSON.stringify({
          compilerOptions: { target: "ES2020", strict: true },
        }),
      });

      const exploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision:
          "Add comprehensive testing and build pipeline to this TypeScript project",
        enableValidation: true,
      });

      const planResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision:
          "Add comprehensive testing and build pipeline to this TypeScript project",
        explorationResult: exploreResult,
      });

      expect(planResult.success).toBe(true);
      expect(planResult.nextPhase).toBe("COMPLETE");

      // Validate implementation plan is actionable for COMPLETE phase
      expect(planResult.implementationPlan.length).toBeGreaterThan(3);

      // Should have clear setup step
      const setupStep = planResult.implementationPlan.find(
        (s) => s.phase === "setup"
      );
      expect(setupStep).toBeDefined();
      expect(setupStep?.dependencies).toEqual([]);
      expect(setupStep?.deliverables.length).toBeGreaterThan(0);

      // Should have dependent steps with clear dependencies
      const dependentSteps = planResult.implementationPlan.filter(
        (s) => s.dependencies.length > 0
      );
      expect(dependentSteps.length).toBeGreaterThan(0);

      // All dependencies should reference valid step IDs
      const stepIds = planResult.implementationPlan.map((s) => s.id);
      for (const step of dependentSteps) {
        for (const dependency of step.dependencies) {
          expect(stepIds).toContain(dependency);
        }
      }

      // Should have testing step that depends on core implementation
      const testStep = planResult.implementationPlan.find(
        (s) => s.phase === "testing"
      );
      expect(testStep).toBeDefined();
      expect(
        testStep?.dependencies.some(
          (d) => d.includes("core") || d.includes("implement")
        )
      ).toBe(true);

      // Validation criteria should be executable
      for (const criterion of planResult.validationCriteria) {
        expect(criterion.command).toBeDefined();
        expect(criterion.command.length).toBeGreaterThan(0);
        expect(["block", "warn", "fix"]).toContain(criterion.failureAction);
      }

      // File structure should be detailed enough for implementation
      expect(planResult.fileStructure.directories.length).toBeGreaterThan(2);
      expect(planResult.fileStructure.files.length).toBeGreaterThan(2);
      expect(planResult.fileStructure.conventions.length).toBeGreaterThan(2);
    });

    test("should handle complex project with multiple implementation phases", async () => {
      // Create complex project structure
      await ValidationTestUtils.createFullProject(tempDir, {
        // Frontend
        "frontend/src/App.tsx": `
          import React from 'react';
          export const App = () => <div>Frontend App</div>;
        `,
        "frontend/package.json": JSON.stringify({
          name: "frontend",
          dependencies: { react: "^18.0.0" },
        }),
        // Backend
        "backend/server.js": `
          const express = require('express');
          const app = express();
          module.exports = app;
        `,
        "backend/package.json": JSON.stringify({
          name: "backend",
          dependencies: { express: "^4.18.0" },
        }),
        // Shared
        "shared/types.ts": `
          export interface User {
            id: number;
            name: string;
          }
        `,
        // Root
        "package.json": JSON.stringify({
          name: "monorepo-project",
          workspaces: ["frontend", "backend", "shared"],
        }),
        "README.md": "# Full-Stack Monorepo Project",
      });

      const exploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision:
          "Complete full-stack application with shared types, API integration, and production deployment",
        enableValidation: true,
      });

      const planResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision:
          "Complete full-stack application with shared types, API integration, and production deployment",
        explorationResult: exploreResult,
      });

      expect(planResult.success).toBe(true);

      // Should recognize complexity and plan accordingly
      expect(planResult.implementationPlan.length).toBeGreaterThan(5);

      // Should have infrastructure phase for monorepo setup
      expect(
        planResult.implementationPlan.some((s) => s.phase === "infrastructure")
      ).toBe(true);

      // Should have multiple tech stack decisions
      expect(planResult.techStack.some((t) => t.category === "frontend")).toBe(
        true
      );
      expect(planResult.techStack.some((t) => t.category === "backend")).toBe(
        true
      );

      // Should plan for each workspace
      expect(
        planResult.fileStructure.directories.some((d) =>
          d.path.includes("frontend")
        )
      ).toBe(true);
      expect(
        planResult.fileStructure.directories.some((d) =>
          d.path.includes("backend")
        )
      ).toBe(true);
      expect(
        planResult.fileStructure.directories.some((d) =>
          d.path.includes("shared")
        )
      ).toBe(true);

      // Should have higher estimated effort due to complexity
      expect(planResult.estimatedEffort).toMatch(/days?/);

      // Should identify integration risks
      expect(planResult.risks.some((r) => r.category === "integration")).toBe(
        true
      );

      // Should have comprehensive validation for each component
      expect(planResult.validationCriteria.length).toBeGreaterThan(3);
    });

    test("should maintain confidence tracking across phase transitions", async () => {
      // Start with high-confidence scenario
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/well-structured.ts": `
          export interface Config {
            apiUrl: string;
            timeout: number;
          }
          
          export class ApiClient {
            constructor(private config: Config) {}
            
            async fetch<T>(endpoint: string): Promise<T> {
              // Implementation would go here
              return {} as T;
            }
          }
        `,
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            strict: true,
            declaration: true,
          },
        }),
        "package.json": JSON.stringify({
          name: "high-confidence-project",
          scripts: {
            build: "tsc",
            test: "jest",
          },
        }),
      });

      // Step 1: High confidence exploration
      const exploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision:
          "Extend this well-structured TypeScript API client with additional methods",
        enableValidation: true,
      });

      expect(exploreResult.confidence).toBeGreaterThan(0.7);

      // Step 2: Planning should maintain high confidence
      const planResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision:
          "Extend this well-structured TypeScript API client with additional methods",
        explorationResult: exploreResult,
      });

      expect(planResult.confidence).toBeGreaterThan(0.7);
      expect(planResult.nextPhase).toBe("COMPLETE");

      // Should have fewer risks due to high confidence
      expect(planResult.risks.length).toBeLessThan(3);

      // Should have optimistic effort estimates
      expect(planResult.estimatedEffort).toMatch(/hours?/);

      // Now test decreasing confidence scenario
      await TestUtils.createTestFiles(tempDir, {
        "src/confusing.ts": `
          // Add confusing code that reduces confidence
          const mystery: any = process.env.UNKNOWN_VAR;
          function cryptic(x: any): any {
            return x.foo?.bar?.baz();
          }
        `,
      });

      // Step 3: Re-exploration should show reduced confidence
      const reExploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision: "Now handle this confusing addition to the codebase",
        enableValidation: true,
      });

      expect(reExploreResult.confidence).toBeLessThan(exploreResult.confidence);

      // Step 4: Planning should reflect reduced confidence
      const rePlanResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision: "Now handle this confusing addition to the codebase",
        explorationResult: reExploreResult,
      });

      expect(rePlanResult.confidence).toBeLessThan(planResult.confidence);
      expect(rePlanResult.risks.length).toBeGreaterThan(
        planResult.risks.length
      );
      expect(rePlanResult.estimatedEffort).not.toEqual(
        planResult.estimatedEffort
      );
    });
  });

  describe("Phase State Management", () => {
    test("should track phase history and allow reprocessing", async () => {
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/index.ts": `export const app = 'test';`,
        "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
      });

      // Execute multiple exploration attempts
      const explore1 = await explorePhase.execute({
        workingDirectory: tempDir,
        vision: "First exploration attempt",
        enableValidation: false,
      });

      const explore2 = await explorePhase.execute({
        workingDirectory: tempDir,
        vision: "Second exploration with validation",
        enableValidation: true,
      });

      // Check exploration history
      const exploreHistory = explorePhase.getExplorationHistory();
      expect(exploreHistory.length).toBe(2);
      expect(exploreHistory[0].vision).not.toEqual(exploreHistory[1].vision);

      // Execute multiple planning attempts
      const plan1 = await planPhase.execute({
        workingDirectory: tempDir,
        vision: "First planning attempt",
        explorationResult: explore1,
      });

      const plan2 = await planPhase.execute({
        workingDirectory: tempDir,
        vision: "Second planning attempt with better exploration",
        explorationResult: explore2,
      });

      // Check planning history
      const planHistory = planPhase.getPlanningHistory();
      expect(planHistory.length).toBe(2);
      expect(planHistory[0].confidence).not.toEqual(planHistory[1].confidence);

      // Latest results should be retrievable
      expect(explorePhase.getLastExploration()).toEqual(explore2);
      expect(planPhase.getLastPlan()).toEqual(plan2);

      // History should be clearable
      explorePhase.clearHistory();
      planPhase.clearHistory();

      expect(explorePhase.getExplorationHistory().length).toBe(0);
      expect(planPhase.getPlanningHistory().length).toBe(0);
      expect(explorePhase.getLastExploration()).toBeNull();
      expect(planPhase.getLastPlan()).toBeNull();
    });

    test("should handle concurrent phase executions gracefully", async () => {
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/concurrent.ts": `export const test = 'concurrent';`,
        "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
      });

      // Create multiple exploration promises
      const explorePromises = [
        explorePhase.execute({
          workingDirectory: tempDir,
          vision: "Concurrent exploration 1",
          enableValidation: false,
        }),
        explorePhase.execute({
          workingDirectory: tempDir,
          vision: "Concurrent exploration 2",
          enableValidation: false,
        }),
        explorePhase.execute({
          workingDirectory: tempDir,
          vision: "Concurrent exploration 3",
          enableValidation: false,
        }),
      ];

      // All should complete successfully
      const exploreResults = await Promise.all(explorePromises);

      exploreResults.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.confidence).toBeGreaterThan(0);
      });

      // History should contain all explorations
      expect(explorePhase.getExplorationHistory().length).toBe(3);

      // Now test concurrent planning
      const planPromises = exploreResults.map((exploreResult, index) =>
        planPhase.execute({
          workingDirectory: tempDir,
          vision: `Concurrent plan ${index + 1}`,
          explorationResult,
        })
      );

      const planResults = await Promise.all(planPromises);

      planResults.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.confidence).toBeGreaterThan(0);
      });

      expect(planPhase.getPlanningHistory().length).toBe(3);
    });
  });

  describe("Error Recovery Between Phases", () => {
    test("should handle exploration failures gracefully in planning", async () => {
      // Create problematic exploration result
      const failedExploreResult = await explorePhase.execute({
        workingDirectory: "/nonexistent/path",
        vision: "Work with non-existent directory",
        enableValidation: false,
      });

      expect(failedExploreResult.success).toBe(false);
      expect(failedExploreResult.confidence).toBeLessThanOrEqual(0.3);

      // Planning should handle failed exploration gracefully
      const planResult = await planPhase.execute({
        workingDirectory: tempDir, // Use valid directory for planning
        vision: "Recover from failed exploration",
        explorationResult: failedExploreResult,
      });

      // Plan should succeed but with appropriate caveats
      expect(planResult.success).toBe(true);
      expect(planResult.confidence).toBeLessThan(0.5);
      expect(
        planResult.risks.some((r) => r.description.includes("exploration"))
      ).toBe(true);
      expect(planResult.assumptions.some((a) => a.includes("limited"))).toBe(
        true
      );
    });

    test("should recover from partial validation failures", async () => {
      // Create project with mixed validation outcomes
      await TestUtils.createTestFiles(tempDir, {
        "src/good.ts": `export const good = 'working code';`,
        "src/broken.ts": `export const broken: number = "wrong type";`,
        "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
        "package.json": JSON.stringify({
          scripts: {
            test: "echo 'Some tests pass, others fail' && exit 1",
            build: "echo 'Build succeeds despite some issues'",
          },
        }),
      });

      const exploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision: "Handle project with mixed validation results",
        enableValidation: true,
        enableHealing: false, // Don't heal, test recovery
      });

      expect(exploreResult.validationResults?.passed).toBe(false);
      expect(exploreResult.validationResults?.errors.length).toBeGreaterThan(0);

      // Planning should create recovery strategy
      const planResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision: "Handle project with mixed validation results",
        explorationResult: exploreResult,
      });

      expect(planResult.success).toBe(true);

      // Should include error fixing in implementation plan
      expect(
        planResult.implementationPlan.some(
          (step) =>
            step.title.toLowerCase().includes("fix") ||
            step.description.toLowerCase().includes("error")
        )
      ).toBe(true);

      // Should have validation criteria that can catch these issues
      expect(
        planResult.validationCriteria.some((v) => v.type === "typescript")
      ).toBe(true);
      expect(
        planResult.validationCriteria.some((v) => v.failureAction === "block")
      ).toBe(true);

      // Should identify recovery risks
      expect(planResult.risks.some((r) => r.category === "technical")).toBe(
        true
      );
    });

    test("should handle git repository state inconsistencies", async () => {
      // Create git repo with complex state
      await GitTestUtils.createGitRepo(tempDir);
      await TestUtils.createTestFiles(tempDir, {
        "committed.ts": `export const committed = 'in git';`,
        "modified.ts": `export const modified = 'changed';`,
        "untracked.ts": `export const untracked = 'not in git';`,
      });

      // Commit some files
      const gitTool = toolManager.getTool("git");
      await gitTool?.execute({
        operation: "add",
        options: { directory: tempDir, files: "committed.ts" },
      });
      await gitTool?.execute({
        operation: "commit",
        options: { directory: tempDir, message: "Initial commit" },
      });

      // Modify committed file
      await TestUtils.createTestFile(
        path.join(tempDir, "modified.ts"),
        `export const modified = 'changed content';`
      );

      // Exploration should handle mixed git state
      const exploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision: "Work with project in mixed git state",
        enableValidation: true,
      });

      expect(exploreResult.success).toBe(true);
      expect(exploreResult.keyFiles.length).toBeGreaterThan(0);

      // Planning should account for git state management
      const planResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision: "Work with project in mixed git state",
        explorationResult: exploreResult,
      });

      expect(planResult.success).toBe(true);

      // Should include git workflow in implementation plan
      expect(
        planResult.implementationPlan.some(
          (step) =>
            step.description.toLowerCase().includes("git") ||
            step.deliverables.some((d) => d.toLowerCase().includes("commit"))
        )
      ).toBe(true);

      // Should consider version control in file structure
      expect(
        planResult.fileStructure.conventions.some(
          (c) =>
            c.toLowerCase().includes("git") ||
            c.toLowerCase().includes("commit")
        )
      ).toBe(true);
    });
  });

  describe("Performance and Resource Management", () => {
    test("should handle large projects efficiently", async () => {
      // Create large project structure
      const files: Record<string, string> = {};

      // Create many TypeScript files
      for (let i = 0; i < 30; i++) {
        files[`src/module${i}.ts`] = `
          export class Module${i} {
            private id = ${i};
            
            getId(): number {
              return this.id;
            }
            
            process(input: string): string {
              return \`Module${i}: \${input}\`;
            }
          }
        `;
      }

      // Create configuration files
      files["package.json"] = JSON.stringify({
        name: "large-project",
        dependencies: Object.fromEntries(
          Array.from({ length: 15 }, (_, i) => [`dep${i}`, "^1.0.0"])
        ),
      });

      files["tsconfig.json"] = JSON.stringify({
        compilerOptions: { target: "ES2020", strict: true },
        include: ["src/**/*"],
      });

      await TestUtils.createTestFiles(tempDir, files);

      const startTime = Date.now();

      // Exploration should handle large project efficiently
      const exploreResult = await explorePhase.execute({
        workingDirectory: tempDir,
        vision: "Analyze and improve this large TypeScript project",
        maxFilesToRead: 15, // Limit file reading for performance
        enableValidation: true,
      });

      const exploreTime = Date.now() - startTime;

      expect(exploreResult.success).toBe(true);
      expect(exploreResult.keyFiles.length).toBeGreaterThan(5);
      expect(exploreResult.technologies).toContain("typescript");
      expect(exploreTime).toBeLessThan(30000); // Should complete within 30 seconds

      const planStartTime = Date.now();

      // Planning should efficiently process large exploration results
      const planResult = await planPhase.execute({
        workingDirectory: tempDir,
        vision: "Analyze and improve this large TypeScript project",
        explorationResult: exploreResult,
      });

      const planTime = Date.now() - planStartTime;

      expect(planResult.success).toBe(true);
      expect(planResult.implementationPlan.length).toBeGreaterThan(3);
      expect(planResult.dependencies.production.length).toBeGreaterThan(0);
      expect(planTime).toBeLessThan(20000); // Should complete within 20 seconds

      // Should handle complexity appropriately
      expect(planResult.risks.some((r) => r.category === "complexity")).toBe(
        true
      );
      expect(planResult.estimatedEffort).toMatch(/days?/);
    });
  });
});
