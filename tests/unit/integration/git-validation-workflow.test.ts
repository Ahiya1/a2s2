import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { GitTool } from "../../src/tools/git/GitTool";
import { ValidationTool } from "../../src/tools/validation/ValidationTool";
import { ToolManager } from "../../src/tools/ToolManager";
import { TestUtils } from "../helpers/TestUtils";
import { GitTestUtils } from "../helpers/GitTestUtils";
import { ValidationTestUtils } from "../helpers/ValidationTestUtils";
import * as path from "path";

describe("Git-Validation Workflow Integration", () => {
  let gitTool: GitTool;
  let validationTool: ValidationTool;
  let toolManager: ToolManager;
  let tempDir: string;

  beforeEach(async () => {
    gitTool = new GitTool();
    validationTool = new ValidationTool();
    toolManager = new ToolManager();
    tempDir = await TestUtils.createTempDir();
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
  });

  describe("Complete Development Workflow", () => {
    test("should execute full development cycle with validation", async () => {
      // Step 1: Initialize git repository
      const initResult = await gitTool.execute({
        operation: "init",
        options: { directory: tempDir },
      });
      expect(initResult).toContain("Git init: SUCCESS");

      // Step 2: Create initial project structure with some issues
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/index.ts": `
          // Has type errors to demonstrate validation
          const message: string = 123; // Type error
          console.log(message);
        `,
        "src/utils.ts": `
          export function add(a: number, b: number): number {
            return a + b;
          }
          
          export function greet(name: string): string {
            return \`Hello, \${name}!\`;
          }
        `,
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            module: "CommonJS",
            strict: true,
            outDir: "./dist",
          },
          include: ["src/**/*"],
        }),
        "package.json": JSON.stringify({
          name: "integration-test-project",
          version: "1.0.0",
          scripts: {
            build: "tsc",
            test: "echo 'Tests passed'",
            lint: "echo 'Linting complete'",
          },
          devDependencies: {
            typescript: "^5.0.0",
          },
        }),
        ".gitignore": "node_modules/\ndist/\n*.log",
      });

      // Step 3: Add files to git
      const addResult = await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      expect(addResult).toContain("Git add: SUCCESS");

      // Step 4: Validate before commit - should fail
      const initialValidation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(initialValidation).toContain("❌ FAILED");
      expect(initialValidation).toContain(
        "Type 'number' is not assignable to type 'string'"
      );

      // Step 5: Fix the validation issues
      await TestUtils.createTestFile(
        path.join(tempDir, "src/index.ts"),
        `
          // Fixed version
          const message: string = "Hello, TypeScript!";
          console.log(message);
        `
      );

      // Step 6: Validate again - should pass
      const fixedValidation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(fixedValidation).toContain("✅ PASSED");

      // Step 7: Add fixed files and commit
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "src/index.ts" },
      });

      const commitResult = await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "Fix TypeScript compilation errors",
        },
      });
      expect(commitResult).toContain("Git commit: SUCCESS");

      // Step 8: Validate that the commit worked
      const statusResult = await gitTool.execute({
        operation: "status",
        options: { directory: tempDir },
      });
      expect(statusResult).toContain("Working tree clean");

      // Step 9: Run comprehensive validation
      const finalValidation = await validationTool.execute({
        type: "build",
        options: { directory: tempDir },
      });
      expect(finalValidation).toContain("✅ PASSED");
    });

    test("should handle validation failures with git rollback", async () => {
      // Initialize git repo and create working code
      await GitTestUtils.createGitRepo(tempDir);
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/working.ts": `
          export const version = "1.0.0";
          export function isProduction(): boolean {
            return process.env.NODE_ENV === 'production';
          }
        `,
        "tsconfig.json": JSON.stringify({
          compilerOptions: { target: "ES2020", strict: true },
        }),
      });

      // Commit working version
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      await gitTool.execute({
        operation: "commit",
        options: { directory: tempDir, message: "Working version" },
      });

      // Verify working version validates
      let validationResult = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(validationResult).toContain("✅ PASSED");

      // Introduce breaking changes
      await TestUtils.createTestFile(
        path.join(tempDir, "src/broken.ts"),
        `
          // This has syntax errors
          const broken: string = 123;  // Type error
          function incomplete( {  // Syntax error
            return;
          }
        `
      );

      // Add broken changes
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "src/broken.ts" },
      });

      // Validation should fail
      validationResult = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(validationResult).toContain("❌ FAILED");

      // Rollback the broken changes by resetting to HEAD
      await gitTool.execute({
        operation: "checkout",
        options: { directory: tempDir, branch: "HEAD", files: "src/broken.ts" },
      });

      // Remove the broken file entirely
      const fs = require("fs");
      const brokenFile = path.join(tempDir, "src/broken.ts");
      if (fs.existsSync(brokenFile)) {
        fs.unlinkSync(brokenFile);
      }

      // Validation should pass again
      validationResult = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(validationResult).toContain("✅ PASSED");
    });

    test("should support feature branch workflow with validation", async () => {
      // Initialize repo with main branch
      await GitTestUtils.createGitRepo(tempDir);
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/main.ts": `export const mainFeature = "stable";`,
        "tsconfig.json": JSON.stringify({
          compilerOptions: { target: "ES2020", strict: true },
        }),
      });

      // Commit to main
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      await gitTool.execute({
        operation: "commit",
        options: { directory: tempDir, message: "Initial main branch" },
      });

      // Create feature branch
      await gitTool.execute({
        operation: "checkout",
        options: {
          directory: tempDir,
          branch: "feature/new-functionality",
          create: true,
        },
      });

      // Add new feature with validation
      await TestUtils.createTestFile(
        path.join(tempDir, "src/feature.ts"),
        `
          export function newFeature(input: string): string {
            return \`New feature: \${input}\`;
          }
        `
      );

      // Validate feature branch
      let validation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(validation).toContain("✅ PASSED");

      // Commit feature
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "src/feature.ts" },
      });
      await gitTool.execute({
        operation: "commit",
        options: { directory: tempDir, message: "Add new feature" },
      });

      // Switch back to main
      await gitTool.execute({
        operation: "checkout",
        options: { directory: tempDir, branch: "main" },
      });

      // Main should still validate
      validation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(validation).toContain("✅ PASSED");

      // Check that feature file doesn't exist on main
      expect(
        await TestUtils.fileExists(path.join(tempDir, "src/feature.ts"))
      ).toBe(false);

      // Switch back to feature branch
      await gitTool.execute({
        operation: "checkout",
        options: { directory: tempDir, branch: "feature/new-functionality" },
      });

      // Feature should exist and validate
      expect(
        await TestUtils.fileExists(path.join(tempDir, "src/feature.ts"))
      ).toBe(true);

      validation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(validation).toContain("✅ PASSED");
    });
  });

  describe("Continuous Integration Simulation", () => {
    test("should simulate CI pipeline with multiple validation stages", async () => {
      // Setup: Initialize project like a CI environment would
      await GitTestUtils.createGitRepo(tempDir);
      await ValidationTestUtils.createFullProject(tempDir, {
        "src/index.ts": `
          import { Calculator } from './calculator';
          
          const calc = new Calculator();
          console.log('2 + 3 =', calc.add(2, 3));
        `,
        "src/calculator.ts": `
          export class Calculator {
            add(a: number, b: number): number {
              return a + b;
            }
            
            subtract(a: number, b: number): number {
              return a - b;
            }
          }
        `,
        "src/calculator.test.ts": `
          import { Calculator } from './calculator';
          
          describe('Calculator', () => {
            const calc = new Calculator();
            
            test('addition', () => {
              expect(calc.add(2, 3)).toBe(5);
            });
            
            test('subtraction', () => {
              expect(calc.subtract(5, 3)).toBe(2);
            });
          });
        `,
        "package.json": JSON.stringify({
          name: "ci-simulation",
          scripts: {
            test: "echo 'Running tests...' && echo 'All tests passed'",
            build: "echo 'Building project...' && echo 'Build successful'",
            lint: "echo 'Linting code...' && echo 'No lint errors'",
          },
        }),
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            module: "CommonJS",
            strict: true,
            outDir: "./dist",
          },
        }),
        ".eslintrc.json": JSON.stringify({
          extends: ["eslint:recommended"],
        }),
      });

      // Commit initial code
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      await gitTool.execute({
        operation: "commit",
        options: { directory: tempDir, message: "Initial commit" },
      });

      // CI Pipeline Stage 1: TypeScript compilation
      console.log("CI Stage 1: TypeScript compilation");
      const tsValidation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(tsValidation).toContain("✅ PASSED");

      // CI Pipeline Stage 2: Linting
      console.log("CI Stage 2: Code linting");
      const lintValidation = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command: "npm run lint",
        },
      });
      expect(lintValidation).toContain("✅ PASSED");

      // CI Pipeline Stage 3: Testing
      console.log("CI Stage 3: Running tests");
      const testValidation = await validationTool.execute({
        type: "test",
        options: { directory: tempDir },
      });
      expect(testValidation).toContain("✅ PASSED");

      // CI Pipeline Stage 4: Build
      console.log("CI Stage 4: Building project");
      const buildValidation = await validationTool.execute({
        type: "build",
        options: { directory: tempDir },
      });
      expect(buildValidation).toContain("✅ PASSED");

      // All stages passed - tag the commit
      await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "CI: All validation stages passed",
          allowEmpty: true,
        },
      });

      console.log("CI Pipeline completed successfully");
    });

    test("should handle CI pipeline with validation failures", async () => {
      // Setup project with issues
      await GitTestUtils.createGitRepo(tempDir);
      await ValidationTestUtils.createFullProject(tempDir, {
        "src/buggy.ts": `
          // Multiple issues for CI to catch
          const unused = "variable";  // Unused variable
          let shouldBeConst = "constant"; // Should be const
          
          function badFunction() {
            console.log("Should not use console"); // Console usage
            return shouldBeConst;
          }
        `,
        "package.json": JSON.stringify({
          scripts: {
            lint: "echo 'ERROR: Linting failed' && exit 1",
            test: "echo 'ERROR: Tests failed' && exit 1",
            build: "echo 'ERROR: Build failed' && exit 1",
          },
        }),
        "tsconfig.json": JSON.stringify({
          compilerOptions: { target: "ES2020", strict: true },
        }),
      });

      // Commit code with issues
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      await gitTool.execute({
        operation: "commit",
        options: { directory: tempDir, message: "Code with issues" },
      });

      // CI Pipeline - each stage should fail
      console.log("Running CI pipeline with failing code...");

      // Stage 1: TypeScript - might pass depending on specific issues
      const tsResult = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      console.log("TypeScript validation completed");

      // Stage 2: Linting - should fail
      const lintResult = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command: "npm run lint",
        },
      });
      expect(lintResult).toContain("❌ FAILED");

      // Stage 3: Testing - should fail
      const testResult = await validationTool.execute({
        type: "test",
        options: { directory: tempDir },
      });
      expect(testResult).toContain("❌ FAILED");

      // Stage 4: Build - should fail
      const buildResult = await validationTool.execute({
        type: "build",
        options: { directory: tempDir },
      });
      expect(buildResult).toContain("❌ FAILED");

      // Record CI failure
      await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "CI: Multiple validation failures",
          allowEmpty: true,
        },
      });

      console.log("CI Pipeline failed as expected");
    });
  });

  describe("Auto-fix Workflows", () => {
    test("should demonstrate auto-fix and commit workflow", async () => {
      // Setup project with fixable issues
      await GitTestUtils.createGitRepo(tempDir);
      await ValidationTestUtils.createESLintProject(tempDir, {
        "src/fixable.js": `
          // Issues that ESLint can fix
          var shouldBeConst = 'value';  // prefer-const
          const x    =     'spacing';   // no-multi-spaces
          console.log(shouldBeConst,x)  // missing semicolon
        `,
        ".eslintrc.json": JSON.stringify({
          env: { node: true, es6: true },
          extends: ["eslint:recommended"],
          rules: {
            "prefer-const": "error",
            "no-multi-spaces": "error",
            semi: "error",
          },
        }),
        "package.json": JSON.stringify({
          scripts: {
            lint: "eslint src --format=json",
            "lint:fix": "eslint src --fix",
          },
        }),
      });

      // Commit unfixed code
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      await gitTool.execute({
        operation: "commit",
        options: { directory: tempDir, message: "Code with fixable issues" },
      });

      // Validate and show issues
      const initialValidation = await validationTool.execute({
        type: "eslint",
        options: { directory: tempDir },
      });
      expect(initialValidation).toContain("🚨 Errors:");
      expect(initialValidation).toContain("prefer-const");

      // Auto-fix issues
      const fixValidation = await validationTool.execute({
        type: "eslint",
        options: {
          directory: tempDir,
          fix: true,
        },
      });
      expect(fixValidation).toContain("Auto-fix completed");

      // Verify files were fixed by checking git status
      const statusResult = await gitTool.execute({
        operation: "status",
        options: { directory: tempDir },
      });
      expect(statusResult).toContain("modified:");

      // Add and commit fixes
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "src/fixable.js" },
      });
      await gitTool.execute({
        operation: "commit",
        options: { directory: tempDir, message: "Auto-fix ESLint issues" },
      });

      // Validate that issues are resolved
      const finalValidation = await validationTool.execute({
        type: "eslint",
        options: { directory: tempDir },
      });
      expect(finalValidation).toContain("✅ PASSED");
    });

    test("should handle mixed fixable and non-fixable issues", async () => {
      await GitTestUtils.createGitRepo(tempDir);
      await ValidationTestUtils.createESLintProject(tempDir, {
        "src/mixed.js": `
          // Fixable issue
          var fixable = 'can be fixed';  // prefer-const
          
          // Non-fixable issue
          eval('console.log("dangerous")');  // no-eval
          
          // Another fixable issue
          const x    =    'spacing';  // no-multi-spaces
        `,
        ".eslintrc.json": JSON.stringify({
          env: { node: true },
          extends: ["eslint:recommended"],
          rules: {
            "prefer-const": "error",
            "no-multi-spaces": "error",
            "no-eval": "error",
          },
        }),
      });

      // Initial validation should show both fixable and non-fixable
      const validation = await validationTool.execute({
        type: "eslint",
        options: { directory: tempDir },
      });
      expect(validation).toContain("❌ FAILED");
      expect(validation).toContain("[fixable]");

      // Auto-fix should fix what it can
      const fixResult = await validationTool.execute({
        type: "eslint",
        options: {
          directory: tempDir,
          fix: true,
        },
      });
      expect(fixResult).toContain("Auto-fix completed");

      // Some issues should remain (non-fixable ones)
      const postFixValidation = await validationTool.execute({
        type: "eslint",
        options: { directory: tempDir },
      });
      expect(postFixValidation).toContain("no-eval");

      // Commit what was fixed
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "Auto-fix: Resolved fixable ESLint issues",
        },
      });
    });
  });

  describe("Complex Project Validation", () => {
    test("should validate multi-language project with git integration", async () => {
      // Create a complex project with multiple technologies
      await GitTestUtils.createGitRepo(tempDir);
      await TestUtils.createTestFiles(tempDir, {
        // Frontend TypeScript
        "frontend/src/index.ts": `
          export interface User {
            id: number;
            name: string;
            email: string;
          }
          
          export class UserService {
            async fetchUser(id: number): Promise<User> {
              return { id, name: 'Test User', email: 'test@example.com' };
            }
          }
        `,
        "frontend/tsconfig.json": JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            module: "ESNext",
            strict: true,
            outDir: "./dist",
          },
        }),
        // Backend JavaScript
        "backend/server.js": `
          const express = require('express');
          const app = express();
          
          app.get('/api/users/:id', (req, res) => {
            const user = {
              id: parseInt(req.params.id),
              name: 'Test User',
              email: 'test@example.com'
            };
            res.json(user);
          });
          
          module.exports = app;
        `,
        // Shared configuration
        "package.json": JSON.stringify({
          name: "multi-lang-project",
          workspaces: ["frontend", "backend"],
          scripts: {
            "test:all": "echo 'All tests passed'",
            "build:frontend": "cd frontend && tsc",
            "build:backend": "echo 'Backend build complete'",
          },
        }),
        // Documentation
        "README.md":
          "# Multi-Language Project\n\nFrontend: TypeScript\nBackend: Node.js",
        ".gitignore": "node_modules/\ndist/\n*.log",
      });

      // Commit initial structure
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "Initial multi-language setup",
        },
      });

      // Validate TypeScript frontend
      const frontendValidation = await validationTool.execute({
        type: "typescript",
        options: {
          directory: path.join(tempDir, "frontend"),
        },
      });
      expect(frontendValidation).toContain("✅ PASSED");

      // Validate JavaScript backend
      const backendValidation = await validationTool.execute({
        type: "javascript",
        options: {
          directory: path.join(tempDir, "backend"),
        },
      });
      expect(backendValidation).toContain("✅ PASSED");

      // Run project-wide tests
      const projectValidation = await validationTool.execute({
        type: "test",
        options: { directory: tempDir },
      });
      expect(projectValidation).toContain("✅ PASSED");

      // Check git status after validation
      const statusResult = await gitTool.execute({
        operation: "status",
        options: { directory: tempDir },
      });
      expect(statusResult).toContain("Working tree clean");
    });

    test("should handle validation of large commit sets", async () => {
      // Setup initial repo
      await GitTestUtils.createGitRepo(tempDir);

      // Create many files in one commit
      const files: Record<string, string> = {};
      for (let i = 0; i < 20; i++) {
        files[`src/module${i}.ts`] = `
          export class Module${i} {
            private value: number = ${i};
            
            getValue(): number {
              return this.value;
            }
            
            setValue(newValue: number): void {
              this.value = newValue;
            }
          }
        `;
      }

      files["tsconfig.json"] = JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          strict: true,
          outDir: "./dist",
        },
        include: ["src/**/*"],
      });

      await TestUtils.createTestFiles(tempDir, files);

      // Add and commit all files
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      await gitTool.execute({
        operation: "commit",
        options: { directory: tempDir, message: "Add 20 TypeScript modules" },
      });

      // Validate the large commit
      const validation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(validation).toContain("✅ PASSED");
      expect(validation).toContain("Files analyzed: 20");

      // Check commit was successful
      const logResult = await gitTool.execute({
        operation: "log",
        options: { directory: tempDir, limit: 1 },
      });
      expect(logResult).toContain("Add 20 TypeScript modules");
    });
  });

  describe("Error Recovery and Healing", () => {
    test("should demonstrate validation-driven healing workflow", async () => {
      // Setup project with systematic issues
      await GitTestUtils.createGitRepo(tempDir);
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/broken.ts": `
          // Multiple TypeScript issues
          const num: number = "wrong type";
          function noReturn(): string {
            // Missing return statement
          }
          
          interface User {
            id: numbr; // Typo in type
            name: string;
          }
        `,
        "tsconfig.json": JSON.stringify({
          compilerOptions: { target: "ES2020", strict: true },
        }),
      });

      // Commit broken code
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "Commit with systematic issues",
        },
      });

      // Step 1: Identify all validation issues
      const diagnostic = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(diagnostic).toContain("❌ FAILED");
      expect(diagnostic).toContain(
        "Type 'string' is not assignable to type 'number'"
      );

      // Step 2: Create healing branch
      await gitTool.execute({
        operation: "checkout",
        options: {
          directory: tempDir,
          branch: "fix/typescript-issues",
          create: true,
        },
      });

      // Step 3: Systematically fix issues
      await TestUtils.createTestFile(
        path.join(tempDir, "src/broken.ts"),
        `
          // Fixed TypeScript issues
          const num: number = 42; // Correct type
          function hasReturn(): string {
            return "Now has return statement";
          }
          
          interface User {
            id: number; // Fixed typo
            name: string;
          }
          
          // Test the fixes
          const user: User = { id: 1, name: "Test" };
          console.log(hasReturn(), num, user);
        `
      );

      // Step 4: Validate fixes
      const fixedValidation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(fixedValidation).toContain("✅ PASSED");

      // Step 5: Commit healing changes
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "src/broken.ts" },
      });
      await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "Heal: Fix all TypeScript validation issues",
        },
      });

      // Step 6: Switch back to main and verify healing branch
      await gitTool.execute({
        operation: "checkout",
        options: { directory: tempDir, branch: "main" },
      });

      // Main still has issues
      const mainValidation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(mainValidation).toContain("❌ FAILED");

      // Healing branch has fixes
      await gitTool.execute({
        operation: "checkout",
        options: { directory: tempDir, branch: "fix/typescript-issues" },
      });

      const healedValidation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(healedValidation).toContain("✅ PASSED");
    });
  });

  describe("Performance and Scalability", () => {
    test("should handle validation of repositories with long history", async () => {
      // Create repo with extensive commit history
      await GitTestUtils.createGitRepo(tempDir);
      await GitTestUtils.createCommitHistory(tempDir, [
        "Initial commit",
        "Add feature A",
        "Fix bug in feature A",
        "Add feature B",
        "Refactor feature A",
        "Add tests for feature B",
        "Fix build issues",
        "Update documentation",
        "Add feature C",
        "Final improvements",
      ]);

      // Add current code that validates
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/final.ts": `
          export class FinalImplementation {
            process(input: string): string {
              return \`Processed: \${input}\`;
            }
          }
        `,
        "tsconfig.json": JSON.stringify({
          compilerOptions: { target: "ES2020", strict: true },
        }),
      });

      // Validate current state
      const validation = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });
      expect(validation).toContain("✅ PASSED");

      // Check git log shows full history
      const logResult = await gitTool.execute({
        operation: "log",
        options: { directory: tempDir, oneline: true },
      });
      expect(logResult).toContain("Initial commit");
      expect(logResult).toContain("Final improvements");
    });

    test("should efficiently validate concurrent git operations", async () => {
      // Setup base repo
      await GitTestUtils.createGitRepo(tempDir);
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/base.ts": "export const base = 'stable';",
        "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
      });

      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });
      await gitTool.execute({
        operation: "commit",
        options: { directory: tempDir, message: "Base commit" },
      });

      // Simulate concurrent operations
      const operations = [
        // Status check
        gitTool.execute({
          operation: "status",
          options: { directory: tempDir },
        }),
        // Validation
        validationTool.execute({
          type: "typescript",
          options: { directory: tempDir },
        }),
        // Log check
        gitTool.execute({
          operation: "log",
          options: { directory: tempDir, limit: 5 },
        }),
        // Another validation
        validationTool.execute({
          type: "custom",
          options: {
            directory: tempDir,
            command: "echo 'Concurrent validation'",
          },
        }),
      ];

      // All operations should complete successfully
      const results = await Promise.all(operations);

      expect(results[0]).toContain("Git status: SUCCESS"); // Status
      expect(results[1]).toContain("✅ PASSED"); // TypeScript validation
      expect(results[2]).toContain("Git log: SUCCESS"); // Log
      expect(results[3]).toContain("Concurrent validation"); // Custom validation
    });
  });
});
