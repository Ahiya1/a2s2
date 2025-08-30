import { TestUtils } from "./TestUtils";
import { ValidationError } from "../../src/tools/schemas/ToolSchemas";
import * as path from "path";
import * as fs from "fs-extra";

export interface ProjectTemplate {
  files: Record<string, string>;
  config?: {
    typescript?: any;
    eslint?: any;
    prettier?: any;
    jest?: any;
    package?: any;
  };
}

export interface MockValidationOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Utility class for creating validation test scenarios and parsing validation outputs
 */
export class ValidationTestUtils {
  /**
   * Create a TypeScript project with configurable issues
   */
  static async createTypeScriptProject(
    directory: string,
    files: Record<string, string>,
    config: { strict?: boolean; noImplicitAny?: boolean; target?: string } = {}
  ): Promise<void> {
    const { strict = true, noImplicitAny = true, target = "ES2020" } = config;

    const tsConfig = {
      compilerOptions: {
        target,
        module: "CommonJS",
        strict,
        noImplicitAny,
        outDir: "./dist",
        rootDir: "./src",
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist"],
    };

    const allFiles = {
      ...files,
      "tsconfig.json": JSON.stringify(tsConfig, null, 2),
    };

    // Ensure package.json exists
    if (!allFiles["package.json"]) {
      allFiles["package.json"] = JSON.stringify(
        {
          name: "test-typescript-project",
          version: "1.0.0",
          scripts: {
            build: "tsc",
            dev: "tsc --watch",
          },
          devDependencies: {
            typescript: "^5.0.0",
          },
        },
        null,
        2
      );
    }

    await TestUtils.createTestFiles(directory, allFiles);
  }

  /**
   * Create an ESLint project with configurable rules
   */
  static async createESLintProject(
    directory: string,
    files: Record<string, string>,
    rules: Record<string, string | number | [string | number, any]> = {}
  ): Promise<void> {
    const defaultRules = {
      "no-console": "warn",
      "no-unused-vars": "error",
      "prefer-const": "error",
      "no-var": "error",
      ...rules,
    };

    const eslintConfig = {
      env: {
        node: true,
        es6: true,
        jest: true,
      },
      extends: ["eslint:recommended"],
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
      },
      rules: defaultRules,
    };

    const allFiles = {
      ...files,
      ".eslintrc.json": JSON.stringify(eslintConfig, null, 2),
    };

    // Ensure package.json exists
    if (!allFiles["package.json"]) {
      allFiles["package.json"] = JSON.stringify(
        {
          name: "test-eslint-project",
          version: "1.0.0",
          scripts: {
            lint: "eslint src",
            "lint:fix": "eslint src --fix",
          },
          devDependencies: {
            eslint: "^8.0.0",
          },
        },
        null,
        2
      );
    }

    await TestUtils.createTestFiles(directory, allFiles);
  }

  /**
   * Create a testing project with Jest configuration
   */
  static async createTestProject(
    directory: string,
    files: Record<string, string>,
    jestConfig: any = {}
  ): Promise<void> {
    const defaultJestConfig = {
      testEnvironment: "node",
      collectCoverage: true,
      coverageDirectory: "coverage",
      testMatch: ["**/__tests__/**/*.test.js", "**/?(*.)+(spec|test).js"],
      ...jestConfig,
    };

    const allFiles = {
      ...files,
      "jest.config.js": `module.exports = ${JSON.stringify(defaultJestConfig, null, 2)};`,
    };

    // Ensure package.json exists with test script
    if (!allFiles["package.json"]) {
      allFiles["package.json"] = JSON.stringify(
        {
          name: "test-project",
          version: "1.0.0",
          scripts: {
            test: "jest",
            "test:watch": "jest --watch",
            "test:coverage": "jest --coverage",
          },
          devDependencies: {
            jest: "^29.0.0",
          },
        },
        null,
        2
      );
    }

    await TestUtils.createTestFiles(directory, allFiles);
  }

  /**
   * Create a build project with configurable build setup
   */
  static async createBuildProject(
    directory: string,
    files: Record<string, string>,
    buildConfig: { tool?: "webpack" | "vite" | "rollup"; target?: string } = {}
  ): Promise<void> {
    const { tool = "vite", target = "es2020" } = buildConfig;

    const packageScripts: Record<string, string> = {
      vite: "vite build",
      webpack: "webpack --mode=production",
      rollup: "rollup -c",
    };

    const allFiles = {
      ...files,
    };

    // Add build configuration based on tool
    if (tool === "vite") {
      allFiles["vite.config.js"] = `
        import { defineConfig } from 'vite';
        export default defineConfig({
          build: {
            target: '${target}',
            outDir: 'dist',
          },
        });
      `;
    } else if (tool === "webpack") {
      allFiles["webpack.config.js"] = `
        module.exports = {
          mode: 'production',
          entry: './src/index.js',
          output: {
            path: require('path').resolve(__dirname, 'dist'),
            filename: 'bundle.js',
          },
        };
      `;
    }

    // Ensure package.json exists
    if (!allFiles["package.json"]) {
      allFiles["package.json"] = JSON.stringify(
        {
          name: "test-build-project",
          version: "1.0.0",
          scripts: {
            build: packageScripts[tool],
            dev: tool === "vite" ? "vite" : "echo 'Dev server not configured'",
          },
          devDependencies: {
            [tool]: "^4.0.0",
          },
        },
        null,
        2
      );
    }

    await TestUtils.createTestFiles(directory, allFiles);
  }

  /**
   * Create a formatting project with Prettier configuration
   */
  static async createFormatProject(
    directory: string,
    files: Record<string, string>,
    prettierConfig: any = {}
  ): Promise<void> {
    const defaultPrettierConfig = {
      semi: true,
      trailingComma: "es5",
      singleQuote: true,
      printWidth: 80,
      tabWidth: 2,
      ...prettierConfig,
    };

    const allFiles = {
      ...files,
      ".prettierrc": JSON.stringify(defaultPrettierConfig, null, 2),
    };

    // Ensure package.json exists
    if (!allFiles["package.json"]) {
      allFiles["package.json"] = JSON.stringify(
        {
          name: "test-format-project",
          version: "1.0.0",
          scripts: {
            format: "prettier --write src",
            "format:check": "prettier --check src",
          },
          devDependencies: {
            prettier: "^3.0.0",
          },
        },
        null,
        2
      );
    }

    await TestUtils.createTestFiles(directory, allFiles);
  }

  /**
   * Create a comprehensive project with all validation types
   */
  static async createFullProject(
    directory: string,
    files: Record<string, string>,
    options: {
      typescript?: boolean;
      eslint?: boolean;
      prettier?: boolean;
      jest?: boolean;
    } = {}
  ): Promise<void> {
    const {
      typescript = true,
      eslint = true,
      prettier = true,
      jest = true,
    } = options;

    const allFiles = { ...files };

    // Base package.json
    const packageJson = {
      name: "full-validation-project",
      version: "1.0.0",
      scripts: {} as Record<string, string>,
      devDependencies: {} as Record<string, string>,
    };

    // TypeScript configuration
    if (typescript) {
      allFiles["tsconfig.json"] = JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            module: "CommonJS",
            strict: true,
            outDir: "./dist",
            rootDir: "./src",
            esModuleInterop: true,
            skipLibCheck: true,
          },
          include: ["src/**/*"],
        },
        null,
        2
      );

      packageJson.scripts.build = "tsc";
      packageJson.scripts["build:watch"] = "tsc --watch";
      packageJson.devDependencies.typescript = "^5.0.0";
    }

    // ESLint configuration
    if (eslint) {
      const eslintConfig = {
        env: { node: true, es6: true },
        extends: ["eslint:recommended"],
        rules: {
          "no-console": "warn",
          "no-unused-vars": "error",
          "prefer-const": "error",
        },
      };

      if (typescript) {
        eslintConfig.extends.push("@typescript-eslint/recommended");
        packageJson.devDependencies["@typescript-eslint/parser"] = "^6.0.0";
        packageJson.devDependencies["@typescript-eslint/eslint-plugin"] =
          "^6.0.0";
      }

      allFiles[".eslintrc.json"] = JSON.stringify(eslintConfig, null, 2);
      packageJson.scripts.lint = "eslint src";
      packageJson.scripts["lint:fix"] = "eslint src --fix";
      packageJson.devDependencies.eslint = "^8.0.0";
    }

    // Prettier configuration
    if (prettier) {
      allFiles[".prettierrc"] = JSON.stringify(
        {
          semi: true,
          singleQuote: true,
          trailingComma: "es5",
          printWidth: 80,
        },
        null,
        2
      );

      packageJson.scripts.format = "prettier --write src";
      packageJson.scripts["format:check"] = "prettier --check src";
      packageJson.devDependencies.prettier = "^3.0.0";
    }

    // Jest configuration
    if (jest) {
      const jestConfig = {
        testEnvironment: "node",
        collectCoverage: true,
        coverageDirectory: "coverage",
      };

      if (typescript) {
        jestConfig["preset"] = "ts-jest";
        packageJson.devDependencies["ts-jest"] = "^29.0.0";
      }

      allFiles["jest.config.js"] =
        `module.exports = ${JSON.stringify(jestConfig, null, 2)};`;
      packageJson.scripts.test = "jest";
      packageJson.scripts["test:watch"] = "jest --watch";
      packageJson.scripts["test:coverage"] = "jest --coverage";
      packageJson.devDependencies.jest = "^29.0.0";
    }

    // Add validate-all script
    const validationCommands = [];
    if (typescript) validationCommands.push("npm run build");
    if (eslint) validationCommands.push("npm run lint");
    if (prettier) validationCommands.push("npm run format:check");
    if (jest) validationCommands.push("npm run test");

    if (validationCommands.length > 0) {
      packageJson.scripts["validate"] = validationCommands.join(" && ");
    }

    allFiles["package.json"] = JSON.stringify(packageJson, null, 2);

    await TestUtils.createTestFiles(directory, allFiles);
  }

  /**
   * Create a project with intentional validation errors
   */
  static async createProjectWithErrors(
    directory: string,
    errorTypes: Array<"typescript" | "eslint" | "format" | "test">
  ): Promise<void> {
    const files: Record<string, string> = {};

    if (errorTypes.includes("typescript")) {
      files["src/typescript-errors.ts"] = `
        // Type errors
        const num: number = "not a number";
        const obj: { name: string } = { age: 25 };
        
        function noReturn(): string {
          console.log("missing return");
        }
        
        interface User {
          id: numbr; // Typo in type
          name: string;
        }
      `;
    }

    if (errorTypes.includes("eslint")) {
      files["src/eslint-errors.js"] = `
        // ESLint errors
        var shouldBeConst = "constant"; // prefer-const
        let unused = "never used"; // no-unused-vars
        
        console.log(shouldBeConst); // no-console if configured
        
        // Missing semicolon
        const missing = "semicolon"
      `;
    }

    if (errorTypes.includes("format")) {
      files["src/format-errors.js"] = `
        // Formatting issues
        const   badly    =     "spaced";
        const object = {a:1,b:2,c:3}; // No spaces
        
        function poorlyFormatted(   param1,param2   ) {
        return param1+param2;
        }
      `;
    }

    if (errorTypes.includes("test")) {
      files["src/failing-test.test.js"] = `
        describe('Failing Tests', () => {
          test('should fail', () => {
            expect(1 + 1).toBe(3); // Intentional failure
          });
          
          test('should throw error', () => {
            throw new Error('Intentional test error');
          });
        });
      `;
    }

    const config = {
      typescript: errorTypes.includes("typescript"),
      eslint: errorTypes.includes("eslint"),
      prettier: errorTypes.includes("format"),
      jest: errorTypes.includes("test"),
    };

    await this.createFullProject(directory, files, config);
  }

  /**
   * Parse TypeScript compiler output
   */
  static parseTypeScriptOutput(output: string): {
    errors: ValidationError[];
    warnings: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      // TypeScript error format: filename(line,column): error TS#### message
      const match = line.match(
        /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/
      );
      if (match) {
        const [, file, lineNum, column, severity, code, message] = match;

        const error: ValidationError = {
          file: path.relative(process.cwd(), file),
          line: parseInt(lineNum, 10),
          column: parseInt(column, 10),
          message: message.trim(),
          rule: `TS${code}`,
          severity: severity as "error" | "warning",
          type: "type",
          fixable: false,
        };

        if (severity === "error") {
          errors.push(error);
        } else {
          warnings.push(error);
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Parse ESLint output (supports both JSON and text formats)
   */
  static parseESLintOutput(output: string): {
    errors: ValidationError[];
    warnings: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    try {
      // Try parsing as JSON first
      const jsonOutput = JSON.parse(output);
      if (Array.isArray(jsonOutput)) {
        for (const fileResult of jsonOutput) {
          for (const message of fileResult.messages) {
            const error: ValidationError = {
              file: path.relative(process.cwd(), fileResult.filePath),
              line: message.line,
              column: message.column,
              message: message.message,
              rule: message.ruleId || "unknown",
              severity: message.severity === 2 ? "error" : "warning",
              type: "lint",
              fixable: message.fix !== undefined,
            };

            if (error.severity === "error") {
              errors.push(error);
            } else {
              warnings.push(error);
            }
          }
        }
        return { errors, warnings };
      }
    } catch {
      // Fall through to text parsing
    }

    // Parse text output
    const lines = output.split("\n");
    for (const line of lines) {
      // ESLint text format: filepath:line:column: severity message (rule)
      const match = line.match(
        /^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+?)\s+(.+)$/
      );
      if (match) {
        const [, file, lineNum, column, severity, message, rule] = match;

        const error: ValidationError = {
          file: path.relative(process.cwd(), file),
          line: parseInt(lineNum, 10),
          column: parseInt(column, 10),
          message: message.trim(),
          rule: rule.replace(/[()]/g, ""),
          severity: severity as "error" | "warning",
          type: "lint",
          fixable: true, // Assume fixable for text format
        };

        if (severity === "error") {
          errors.push(error);
        } else {
          warnings.push(error);
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Parse generic command output for errors and warnings
   */
  static parseGenericOutput(output: string): {
    errors: ValidationError[];
    warnings: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const lowerLine = trimmedLine.toLowerCase();

      if (
        lowerLine.includes("error") ||
        lowerLine.includes("failed") ||
        lowerLine.includes("exception")
      ) {
        errors.push({
          message: trimmedLine,
          severity: "error",
          type: "custom",
          fixable: false,
        });
      } else if (lowerLine.includes("warning") || lowerLine.includes("warn")) {
        warnings.push({
          message: trimmedLine,
          severity: "warning",
          type: "custom",
          fixable: false,
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Generate mock validation command output
   */
  static generateMockOutput(
    type: "typescript" | "eslint" | "test" | "build",
    scenario: "success" | "errors" | "warnings" | "mixed"
  ): MockValidationOutput {
    const outputs = {
      typescript: {
        success: {
          stdout: "Found 0 errors in 5 files.\n",
          stderr: "",
          exitCode: 0,
          errors: [],
          warnings: [],
        },
        errors: {
          stdout: `src/error.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/error.ts(15,3): error TS2339: Property 'unknownMethod' does not exist on type 'string'.
Found 2 errors in 2 files.`,
          stderr: "",
          exitCode: 1,
          errors: [
            {
              file: "src/error.ts",
              line: 10,
              column: 5,
              message: "Type 'string' is not assignable to type 'number'.",
              rule: "TS2322",
              severity: "error" as const,
              type: "type" as const,
              fixable: false,
            },
            {
              file: "src/error.ts",
              line: 15,
              column: 3,
              message:
                "Property 'unknownMethod' does not exist on type 'string'.",
              rule: "TS2339",
              severity: "error" as const,
              type: "type" as const,
              fixable: false,
            },
          ],
          warnings: [],
        },
        warnings: {
          stdout: `src/warning.ts(5,7): warning TS6133: 'unused' is declared but its value is never read.
Found 0 errors, 1 warning in 1 file.`,
          stderr: "",
          exitCode: 0,
          errors: [],
          warnings: [
            {
              file: "src/warning.ts",
              line: 5,
              column: 7,
              message: "'unused' is declared but its value is never read.",
              rule: "TS6133",
              severity: "warning" as const,
              type: "type" as const,
              fixable: false,
            },
          ],
        },
        mixed: {
          stdout: `src/mixed.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/mixed.ts(5,7): warning TS6133: 'unused' is declared but its value is never read.
Found 1 error, 1 warning in 1 file.`,
          stderr: "",
          exitCode: 1,
          errors: [
            {
              file: "src/mixed.ts",
              line: 10,
              column: 5,
              message: "Type 'string' is not assignable to type 'number'.",
              rule: "TS2322",
              severity: "error" as const,
              type: "type" as const,
              fixable: false,
            },
          ],
          warnings: [
            {
              file: "src/mixed.ts",
              line: 5,
              column: 7,
              message: "'unused' is declared but its value is never read.",
              rule: "TS6133",
              severity: "warning" as const,
              type: "type" as const,
              fixable: false,
            },
          ],
        },
      },
      eslint: {
        success: {
          stdout: "",
          stderr: "",
          exitCode: 0,
          errors: [],
          warnings: [],
        },
        errors: {
          stdout: `src/error.js:10:5: error 'unused' is defined but never used. no-unused-vars
src/error.js:15:1: error 'console' is not defined. no-console

2 problems (2 errors, 0 warnings)`,
          stderr: "",
          exitCode: 1,
          errors: [
            {
              file: "src/error.js",
              line: 10,
              column: 5,
              message: "'unused' is defined but never used.",
              rule: "no-unused-vars",
              severity: "error" as const,
              type: "lint" as const,
              fixable: false,
            },
            {
              file: "src/error.js",
              line: 15,
              column: 1,
              message: "'console' is not defined.",
              rule: "no-console",
              severity: "error" as const,
              type: "lint" as const,
              fixable: false,
            },
          ],
          warnings: [],
        },
        warnings: {
          stdout: `src/warning.js:5:1: warning Unexpected console statement. no-console

1 problem (0 errors, 1 warning)`,
          stderr: "",
          exitCode: 0,
          errors: [],
          warnings: [
            {
              file: "src/warning.js",
              line: 5,
              column: 1,
              message: "Unexpected console statement.",
              rule: "no-console",
              severity: "warning" as const,
              type: "lint" as const,
              fixable: false,
            },
          ],
        },
        mixed: {
          stdout: `src/mixed.js:10:5: error 'unused' is defined but never used. no-unused-vars
src/mixed.js:5:1: warning Unexpected console statement. no-console

2 problems (1 error, 1 warning)`,
          stderr: "",
          exitCode: 1,
          errors: [
            {
              file: "src/mixed.js",
              line: 10,
              column: 5,
              message: "'unused' is defined but never used.",
              rule: "no-unused-vars",
              severity: "error" as const,
              type: "lint" as const,
              fixable: false,
            },
          ],
          warnings: [
            {
              file: "src/mixed.js",
              line: 5,
              column: 1,
              message: "Unexpected console statement.",
              rule: "no-console",
              severity: "warning" as const,
              type: "lint" as const,
              fixable: false,
            },
          ],
        },
      },
      test: {
        success: {
          stdout: `PASS src/test.test.js
✓ should pass test 1 (2 ms)
✓ should pass test 2 (1 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total`,
          stderr: "",
          exitCode: 0,
          errors: [],
          warnings: [],
        },
        errors: {
          stdout: `FAIL src/failing.test.js
✕ should fail test 1 (5 ms)
✕ should fail test 2 (3 ms)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 2 total`,
          stderr: "",
          exitCode: 1,
          errors: [
            {
              file: "src/failing.test.js",
              message: "Test suite failed",
              severity: "error" as const,
              type: "test" as const,
              fixable: false,
            },
          ],
          warnings: [],
        },
        warnings: {
          stdout: `PASS src/warning.test.js
✓ should pass with warning (2 ms)

Warning: Deprecated API used in test

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total`,
          stderr: "",
          exitCode: 0,
          errors: [],
          warnings: [
            {
              message: "Deprecated API used in test",
              severity: "warning" as const,
              type: "test" as const,
              fixable: false,
            },
          ],
        },
        mixed: {
          stdout: `PASS src/mixed.test.js
✓ should pass (2 ms)

FAIL src/mixed.test.js
✕ should fail (3 ms)

Warning: Some tests are flaky

Test Suites: 1 failed, 1 total
Tests:       1 passed, 1 failed, 2 total`,
          stderr: "",
          exitCode: 1,
          errors: [
            {
              file: "src/mixed.test.js",
              message: "Test suite has failures",
              severity: "error" as const,
              type: "test" as const,
              fixable: false,
            },
          ],
          warnings: [
            {
              message: "Some tests are flaky",
              severity: "warning" as const,
              type: "test" as const,
              fixable: false,
            },
          ],
        },
      },
      build: {
        success: {
          stdout: "Build completed successfully\nGenerated 5 files in dist/",
          stderr: "",
          exitCode: 0,
          errors: [],
          warnings: [],
        },
        errors: {
          stdout: "",
          stderr:
            "ERROR: Build failed due to compilation errors\nERROR: Cannot resolve module 'missing-dependency'",
          exitCode: 1,
          errors: [
            {
              message: "Build failed due to compilation errors",
              severity: "error" as const,
              type: "build" as const,
              fixable: false,
            },
            {
              message: "Cannot resolve module 'missing-dependency'",
              severity: "error" as const,
              type: "build" as const,
              fixable: false,
            },
          ],
          warnings: [],
        },
        warnings: {
          stdout: "Build completed successfully\nGenerated 5 files in dist/",
          stderr:
            "WARNING: Large bundle size detected\nWARNING: Unused import found",
          exitCode: 0,
          errors: [],
          warnings: [
            {
              message: "Large bundle size detected",
              severity: "warning" as const,
              type: "build" as const,
              fixable: false,
            },
            {
              message: "Unused import found",
              severity: "warning" as const,
              type: "build" as const,
              fixable: false,
            },
          ],
        },
        mixed: {
          stdout: "Build completed with issues",
          stderr:
            "ERROR: Critical build error\nWARNING: Performance issue detected",
          exitCode: 1,
          errors: [
            {
              message: "Critical build error",
              severity: "error" as const,
              type: "build" as const,
              fixable: false,
            },
          ],
          warnings: [
            {
              message: "Performance issue detected",
              severity: "warning" as const,
              type: "build" as const,
              fixable: false,
            },
          ],
        },
      },
    };

    return outputs[type][scenario];
  }

  /**
   * Create validation scenarios for testing
   */
  static async createValidationScenarios(baseDirectory: string): Promise<{
    clean: string;
    withErrors: string;
    withWarnings: string;
    mixed: string;
  }> {
    const scenarios = {
      clean: path.join(baseDirectory, "clean"),
      withErrors: path.join(baseDirectory, "with-errors"),
      withWarnings: path.join(baseDirectory, "with-warnings"),
      mixed: path.join(baseDirectory, "mixed"),
    };

    // Clean project
    await this.createFullProject(scenarios.clean, {
      "src/index.ts": `
        export function greet(name: string): string {
          return \`Hello, \${name}!\`;
        }
      `,
    });

    // Project with errors
    await this.createProjectWithErrors(scenarios.withErrors, [
      "typescript",
      "eslint",
    ]);

    // Project with warnings only
    await this.createFullProject(scenarios.withWarnings, {
      "src/warning.ts": `
        const unused = 'this variable is never used';
        console.log('This will warn with no-console rule');
        
        export function work(): void {
          // Function works but has warnings
        }
      `,
    });

    // Mixed project
    await this.createProjectWithErrors(scenarios.mixed, [
      "typescript",
      "eslint",
      "format",
    ]);

    return scenarios;
  }

  /**
   * Validate that a project structure contains expected validation files
   */
  static async validateProjectStructure(
    directory: string,
    expectedFiles: {
      typescript?: boolean;
      eslint?: boolean;
      prettier?: boolean;
      jest?: boolean;
      package?: boolean;
    }
  ): Promise<boolean> {
    const checks = [];

    if (expectedFiles.typescript) {
      checks.push(fs.pathExists(path.join(directory, "tsconfig.json")));
    }

    if (expectedFiles.eslint) {
      checks.push(fs.pathExists(path.join(directory, ".eslintrc.json")));
    }

    if (expectedFiles.prettier) {
      checks.push(fs.pathExists(path.join(directory, ".prettierrc")));
    }

    if (expectedFiles.jest) {
      checks.push(fs.pathExists(path.join(directory, "jest.config.js")));
    }

    if (expectedFiles.package) {
      checks.push(fs.pathExists(path.join(directory, "package.json")));
    }

    const results = await Promise.all(checks);
    return results.every((result) => result);
  }

  /**
   * Clean up validation test directories
   */
  static async cleanupValidationProjects(directories: string[]): Promise<void> {
    await Promise.all(
      directories.map((dir) => TestUtils.cleanupTempDir(dir).catch(() => {}))
    );
  }
}
