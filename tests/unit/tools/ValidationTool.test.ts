import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { ValidationTool } from "../../../src/tools/validation/ValidationTool";
import { TestUtils } from "../../helpers/TestUtils";
import { ValidationTestUtils } from "../../helpers/ValidationTestUtils";
import * as path from "path";

describe("ValidationTool", () => {
  let validationTool: ValidationTool;
  let tempDir: string;

  beforeEach(async () => {
    validationTool = new ValidationTool();
    tempDir = await TestUtils.createTempDir();
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
  });

  describe("Parameter Validation", () => {
    test("should validate required type parameter", async () => {
      await expect(validationTool.execute({})).rejects.toThrow(
        "Invalid validation tool parameters"
      );
    });

    test("should validate supported validation types", async () => {
      await expect(
        validationTool.execute({ type: "invalid_type" })
      ).rejects.toThrow("Invalid validation tool parameters");
    });

    test("should accept all supported validation types", async () => {
      const types = [
        "typescript",
        "javascript",
        "eslint",
        "test",
        "build",
        "format",
        "custom",
      ];

      for (const type of types) {
        const params = { type, options: { directory: tempDir } };
        try {
          await validationTool.execute(params);
        } catch (error) {
          // Validation errors should mention "Invalid validation tool parameters"
          // Execution errors should not
          expect(String(error)).not.toContain(
            "Invalid validation tool parameters"
          );
        }
      }
    });

    test("should validate optional parameters", async () => {
      const validParams = {
        type: "typescript" as const,
        options: {
          directory: tempDir,
          files: ["src/*.ts"],
          fix: true,
          strict: true,
          timeout: 30000,
          format: "json" as const,
        },
      };

      // Should not throw validation error
      try {
        await validationTool.execute(validParams);
      } catch (error) {
        expect(String(error)).not.toContain(
          "Invalid validation tool parameters"
        );
      }
    });
  });

  describe("TypeScript Validation", () => {
    test("should validate TypeScript files with no errors", async () => {
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/index.ts": `
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
      });

      const result = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });

      expect(result).toContain("VALIDATION: TYPESCRIPT");
      expect(result).toContain("✅ PASSED");
      expect(result).toContain("Files analyzed: 1");
      expect(result).toContain("Errors: 0");
    });

    test("should detect TypeScript compilation errors", async () => {
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/errors.ts": `
          // Type errors
          const num: number = "string"; // Type error
          function broken(x: string) {
            return x.unknownMethod(); // Method doesn't exist
          }
        `,
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            target: "ES2020",
            strict: true,
          },
          include: ["src/**/*"],
        }),
      });

      const result = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });

      expect(result).toContain("❌ FAILED");
      expect(result).toContain("🚨 Errors:");
      expect(result).toContain("errors.ts");
      expect(result).toContain(
        "Type 'string' is not assignable to type 'number'"
      );
    });

    test("should handle missing tsconfig.json", async () => {
      await TestUtils.createTestFile(
        path.join(tempDir, "test.ts"),
        "const x: string = 'test';"
      );

      const result = await validationTool.execute({
        type: "typescript",
        options: { directory: tempDir },
      });

      // Should still attempt validation, might succeed or fail depending on environment
      expect(result).toContain("VALIDATION: TYPESCRIPT");
    });

    test("should validate specific files only", async () => {
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/good.ts": `export const good = "works";`,
        "src/bad.ts": `const bad: number = "invalid";`,
        "tsconfig.json": JSON.stringify({
          compilerOptions: { strict: true },
        }),
      });

      const result = await validationTool.execute({
        type: "typescript",
        options: {
          directory: tempDir,
          files: ["src/good.ts"],
        },
      });

      expect(result).toContain("VALIDATION: TYPESCRIPT");
      // Should only validate the good file
    });

    test("should handle strict mode", async () => {
      await ValidationTestUtils.createTypeScriptProject(tempDir, {
        "src/loose.ts": `
          // Code that would fail in strict mode
          function loose(x) { // Missing type annotation
            return x;
          }
        `,
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            strict: false,
          },
        }),
      });

      const result = await validationTool.execute({
        type: "typescript",
        options: {
          directory: tempDir,
          strict: true,
        },
      });

      expect(result).toContain("VALIDATION: TYPESCRIPT");
    });
  });

  describe("ESLint Validation", () => {
    test("should validate JavaScript with ESLint", async () => {
      await ValidationTestUtils.createESLintProject(tempDir, {
        "src/index.js": `
          const message = 'Hello, world!';
          console.log(message);
        `,
        ".eslintrc.json": JSON.stringify({
          env: { node: true, es6: true },
          extends: ["eslint:recommended"],
          rules: {
            "no-console": "warn",
            "prefer-const": "error",
          },
        }),
      });

      const result = await validationTool.execute({
        type: "eslint",
        options: { directory: tempDir },
      });

      expect(result).toContain("VALIDATION: ESLINT");
      expect(result).toContain("⚠️  Warnings:");
      expect(result).toContain("no-console");
    });

    test("should detect ESLint errors", async () => {
      await ValidationTestUtils.createESLintProject(tempDir, {
        "src/errors.js": `
          // ESLint errors
          var unused = 'variable'; // no-unused-vars
          let reassigned = 'initial';
          reassigned = 'changed'; // Should be const
          console.log('debug'); // no-console if configured as error
        `,
        ".eslintrc.json": JSON.stringify({
          env: { node: true },
          extends: ["eslint:recommended"],
          rules: {
            "no-unused-vars": "error",
            "prefer-const": "error",
            "no-console": "error",
          },
        }),
      });

      const result = await validationTool.execute({
        type: "eslint",
        options: { directory: tempDir },
      });

      expect(result).toContain("❌ FAILED");
      expect(result).toContain("🚨 Errors:");
      expect(result).toContain("no-unused-vars");
      expect(result).toContain("prefer-const");
    });

    test("should support auto-fixing", async () => {
      await ValidationTestUtils.createESLintProject(tempDir, {
        "src/fixable.js": `
          var shouldBeConst = 'value'; // prefer-const (fixable)
          const spaces   =    'too many'; // spacing issues (fixable)
        `,
        ".eslintrc.json": JSON.stringify({
          env: { node: true },
          extends: ["eslint:recommended"],
          rules: {
            "prefer-const": "error",
            "no-multi-spaces": "error",
          },
        }),
      });

      const result = await validationTool.execute({
        type: "eslint",
        options: {
          directory: tempDir,
          fix: true,
        },
      });

      expect(result).toContain("VALIDATION: ESLINT");
      expect(result).toContain("Auto-fix completed successfully");
    });

    test("should parse JSON output format", async () => {
      await ValidationTestUtils.createESLintProject(tempDir, {
        "src/test.js": `const x = 'test';`,
        ".eslintrc.json": JSON.stringify({
          extends: ["eslint:recommended"],
        }),
      });

      const result = await validationTool.execute({
        type: "eslint",
        options: {
          directory: tempDir,
          format: "json",
        },
      });

      expect(result).toContain("VALIDATION: ESLINT");
    });

    test("should use custom config file", async () => {
      await ValidationTestUtils.createESLintProject(tempDir, {
        "src/custom.js": `console.log('test');`,
        "custom-eslint.json": JSON.stringify({
          env: { node: true },
          rules: { "no-console": "error" },
        }),
      });

      const result = await validationTool.execute({
        type: "eslint",
        options: {
          directory: tempDir,
          config: "custom-eslint.json",
        },
      });

      expect(result).toContain("VALIDATION: ESLINT");
    });
  });

  describe("Test Validation", () => {
    test("should run test suite successfully", async () => {
      await ValidationTestUtils.createTestProject(tempDir, {
        "package.json": JSON.stringify({
          name: "test-project",
          scripts: {
            test: "echo 'All tests passed'",
          },
        }),
        "src/math.js": `
          exports.add = (a, b) => a + b;
          exports.multiply = (a, b) => a * b;
        `,
      });

      const result = await validationTool.execute({
        type: "test",
        options: { directory: tempDir },
      });

      expect(result).toContain("VALIDATION: TEST");
      expect(result).toContain("✅ PASSED");
    });

    test("should detect test failures", async () => {
      await ValidationTestUtils.createTestProject(tempDir, {
        "package.json": JSON.stringify({
          name: "test-project",
          scripts: {
            test: "exit 1", // Simulate test failure
          },
        }),
      });

      const result = await validationTool.execute({
        type: "test",
        options: { directory: tempDir },
      });

      expect(result).toContain("❌ FAILED");
      expect(result).toContain("🚨 Errors:");
    });

    test("should use custom test command", async () => {
      await TestUtils.createTestFile(
        path.join(tempDir, "custom-test.sh"),
        "#!/bin/bash\necho 'Custom test runner executed'\nexit 0"
      );

      const result = await validationTool.execute({
        type: "test",
        options: {
          directory: tempDir,
          command: "bash custom-test.sh",
        },
      });

      expect(result).toContain("Custom test runner executed");
    });

    test("should handle test timeout", async () => {
      await ValidationTestUtils.createTestProject(tempDir, {
        "package.json": JSON.stringify({
          scripts: {
            test: "sleep 10", // Long running test
          },
        }),
      });

      const result = await validationTool.execute({
        type: "test",
        options: {
          directory: tempDir,
          timeout: 1000, // 1 second timeout
        },
      });

      // Should timeout and report error
      expect(result).toContain("❌ FAILED");
    });
  });

  describe("Build Validation", () => {
    test("should validate successful build", async () => {
      await ValidationTestUtils.createBuildProject(tempDir, {
        "package.json": JSON.stringify({
          name: "build-test",
          scripts: {
            build: "echo 'Build completed successfully'",
          },
        }),
        "src/index.js": "console.log('Hello, world!');",
      });

      const result = await validationTool.execute({
        type: "build",
        options: { directory: tempDir },
      });

      expect(result).toContain("VALIDATION: BUILD");
      expect(result).toContain("✅ PASSED");
    });

    test("should detect build failures", async () => {
      await ValidationTestUtils.createBuildProject(tempDir, {
        "package.json": JSON.stringify({
          scripts: {
            build: "exit 1", // Simulate build failure
          },
        }),
      });

      const result = await validationTool.execute({
        type: "build",
        options: { directory: tempDir },
      });

      expect(result).toContain("❌ FAILED");
      expect(result).toContain("🚨 Errors:");
    });

    test("should use custom build command", async () => {
      const result = await validationTool.execute({
        type: "build",
        options: {
          directory: tempDir,
          command: "echo 'Custom build process'",
        },
      });

      expect(result).toContain("Custom build process");
    });
  });

  describe("Format Validation", () => {
    test("should validate formatted code", async () => {
      await ValidationTestUtils.createFormatProject(tempDir, {
        "src/formatted.js": `const message = 'Hello, world!';\nconsole.log(message);\n`,
        ".prettierrc": JSON.stringify({
          semi: true,
          singleQuote: true,
          tabWidth: 2,
        }),
      });

      const result = await validationTool.execute({
        type: "format",
        options: { directory: tempDir },
      });

      expect(result).toContain("VALIDATION: FORMAT");
    });

    test("should detect formatting issues", async () => {
      await ValidationTestUtils.createFormatProject(tempDir, {
        "src/unformatted.js": `const   message='Hello, world!'   ;console.log( message)`,
        ".prettierrc": JSON.stringify({
          semi: true,
          singleQuote: true,
        }),
      });

      const result = await validationTool.execute({
        type: "format",
        options: { directory: tempDir },
      });

      expect(result).toContain("VALIDATION: FORMAT");
      expect(result).toContain("unformatted.js");
    });

    test("should support auto-fixing formatting", async () => {
      await ValidationTestUtils.createFormatProject(tempDir, {
        "src/fixable.js": `const   x='test'   ;`,
        ".prettierrc": JSON.stringify({ singleQuote: true }),
      });

      const result = await validationTool.execute({
        type: "format",
        options: {
          directory: tempDir,
          fix: true,
        },
      });

      expect(result).toContain("Auto-fix completed successfully");
    });

    test("should use custom prettier config", async () => {
      await ValidationTestUtils.createFormatProject(tempDir, {
        "src/custom.js": `const x = "test";`,
        "custom.prettierrc": JSON.stringify({
          singleQuote: true,
          semi: false,
        }),
      });

      const result = await validationTool.execute({
        type: "format",
        options: {
          directory: tempDir,
          config: "custom.prettierrc",
        },
      });

      expect(result).toContain("VALIDATION: FORMAT");
    });
  });

  describe("JavaScript Validation", () => {
    test("should validate JavaScript syntax", async () => {
      await TestUtils.createTestFile(
        path.join(tempDir, "valid.js"),
        `
          function greet(name) {
            return \`Hello, \${name}!\`;
          }
          module.exports = { greet };
        `
      );

      const result = await validationTool.execute({
        type: "javascript",
        options: { directory: tempDir },
      });

      expect(result).toContain("VALIDATION: JAVASCRIPT");
    });

    test("should detect JavaScript syntax errors", async () => {
      await TestUtils.createTestFile(
        path.join(tempDir, "invalid.js"),
        `
          function broken(name {
            return \`Hello, \${name!\`;  // Syntax error
          }
        `
      );

      const result = await validationTool.execute({
        type: "javascript",
        options: { directory: tempDir },
      });

      expect(result).toContain("❌ FAILED");
      expect(result).toContain("Unexpected token");
    });
  });

  describe("Custom Validation", () => {
    test("should execute custom validation command", async () => {
      const result = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command: "echo 'Custom validation completed'",
        },
      });

      expect(result).toContain("VALIDATION: CUSTOM");
      expect(result).toContain("Custom validation completed");
    });

    test("should require custom command", async () => {
      try {
        await validationTool.execute({
          type: "custom",
          options: { directory: tempDir },
        });
        expect.fail("Should have failed without custom command");
      } catch (error) {
        expect(String(error)).toContain(
          "No default command for validation type"
        );
      }
    });

    test("should handle custom command failures", async () => {
      const result = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command: "exit 1",
        },
      });

      expect(result).toContain("❌ FAILED");
    });

    test("should parse custom command output", async () => {
      const result = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command:
            "echo 'ERROR: Something went wrong'; echo 'WARNING: Minor issue'",
        },
      });

      expect(result).toContain("🚨 Errors:");
      expect(result).toContain("Something went wrong");
      expect(result).toContain("⚠️  Warnings:");
      expect(result).toContain("Minor issue");
    });
  });

  describe("Output Formatting", () => {
    test("should format validation summary correctly", async () => {
      const result = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command: "echo 'Test completed'",
        },
      });

      expect(result).toContain("VALIDATION: CUSTOM");
      expect(result).toContain("Status:");
      expect(result).toContain("📊 Summary:");
      expect(result).toContain("Execution time:");
    });

    test("should include suggestions for failures", async () => {
      const result = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command: "echo 'ERROR: Test failed'; exit 1",
        },
      });

      expect(result).toContain("💡 Suggestions:");
    });

    test("should show command used", async () => {
      const customCommand = "echo 'Custom validation'";
      const result = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command: customCommand,
        },
      });

      expect(result).toContain(`Command: ${customCommand}`);
    });

    test("should indicate fixable issues", async () => {
      await ValidationTestUtils.createESLintProject(tempDir, {
        "src/fixable.js": `var x = 'should be const';`,
        ".eslintrc.json": JSON.stringify({
          extends: ["eslint:recommended"],
          rules: { "prefer-const": "error" },
        }),
      });

      const result = await validationTool.execute({
        type: "eslint",
        options: { directory: tempDir },
      });

      expect(result).toContain("[fixable]");
      expect(result).toContain("Auto-fixable:");
    });
  });

  describe("File Handling", () => {
    test("should validate specific files only", async () => {
      await TestUtils.createTestFiles(tempDir, {
        "good.js": "const good = 'valid';",
        "bad.js": "const bad syntax error",
      });

      const result = await validationTool.execute({
        type: "javascript",
        options: {
          directory: tempDir,
          files: "good.js",
        },
      });

      // Should only validate the good file
      expect(result).toContain("VALIDATION: JAVASCRIPT");
    });

    test("should validate multiple files", async () => {
      await TestUtils.createTestFiles(tempDir, {
        "file1.js": "const x1 = 'valid';",
        "file2.js": "const x2 = 'also valid';",
        "file3.js": "const x3 = 'valid too';",
      });

      const result = await validationTool.execute({
        type: "javascript",
        options: {
          directory: tempDir,
          files: ["file1.js", "file2.js"],
        },
      });

      expect(result).toContain("VALIDATION: JAVASCRIPT");
    });

    test("should handle non-existent files gracefully", async () => {
      const result = await validationTool.execute({
        type: "javascript",
        options: {
          directory: tempDir,
          files: "does-not-exist.js",
        },
      });

      expect(result).toContain("VALIDATION: JAVASCRIPT");
    });
  });

  describe("Error Parsing", () => {
    test("should parse TypeScript error format", async () => {
      const mockOutput = `src/test.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/test.ts(15,3): error TS2339: Property 'unknownMethod' does not exist on type 'string'.`;

      const result =
        await ValidationTestUtils.parseTypeScriptOutput(mockOutput);

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].file).toBe("src/test.ts");
      expect(result.errors[0].line).toBe(10);
      expect(result.errors[0].column).toBe(5);
      expect(result.errors[0].severity).toBe("error");
      expect(result.errors[0].type).toBe("type");
    });

    test("should parse ESLint JSON output", async () => {
      const mockJsonOutput = JSON.stringify([
        {
          filePath: "/path/to/file.js",
          messages: [
            {
              ruleId: "no-unused-vars",
              severity: 2,
              message: "'unused' is defined but never used.",
              line: 5,
              column: 7,
              fix: { range: [0, 10], text: "" },
            },
            {
              ruleId: "no-console",
              severity: 1,
              message: "Unexpected console statement.",
              line: 10,
              column: 1,
            },
          ],
        },
      ]);

      const result =
        await ValidationTestUtils.parseESLintOutput(mockJsonOutput);

      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.errors[0].rule).toBe("no-unused-vars");
      expect(result.errors[0].fixable).toBe(true);
      expect(result.warnings[0].rule).toBe("no-console");
    });

    test("should parse generic error output", async () => {
      const mockOutput = `Error: Something went wrong
Warning: This is a warning
Failed: Build process failed`;

      const result = await ValidationTestUtils.parseGenericOutput(mockOutput);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e) => e.message.includes("Something went wrong"))
      ).toBe(true);
    });
  });

  describe("Performance", () => {
    test("should handle large number of files", async () => {
      // Create many files
      const files: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        files[`file${i}.js`] = `const x${i} = 'content${i}';`;
      }
      await TestUtils.createTestFiles(tempDir, files);

      const startTime = Date.now();
      const result = await validationTool.execute({
        type: "javascript",
        options: { directory: tempDir },
      });
      const duration = Date.now() - startTime;

      expect(result).toContain("VALIDATION: JAVASCRIPT");
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    });

    test("should respect timeout limits", async () => {
      const result = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command: "sleep 2",
          timeout: 500, // 500ms timeout
        },
      });

      expect(result).toContain("❌ FAILED");
    });
  });

  describe("Directory Handling", () => {
    test("should default to current directory", async () => {
      const result = await validationTool.execute({
        type: "custom",
        options: {
          command: "pwd",
        },
      });

      expect(result).toContain("VALIDATION: CUSTOM");
    });

    test("should handle relative paths", async () => {
      const result = await validationTool.execute({
        type: "custom",
        options: {
          directory: ".",
          command: "echo 'Working in current directory'",
        },
      });

      expect(result).toContain("Working in current directory");
    });

    test("should handle non-existent directories", async () => {
      try {
        await validationTool.execute({
          type: "custom",
          options: {
            directory: "/path/that/does/not/exist",
            command: "echo 'test'",
          },
        });
      } catch (error) {
        expect(String(error)).toContain("Validation failed");
      }
    });
  });

  describe("Integration with Real Tools", () => {
    test("should detect real TypeScript installation", async () => {
      // This test checks if TypeScript is available
      const result = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command: "which tsc || which npx",
        },
      });

      // Should not throw validation parameter error
      expect(result).toBeDefined();
    });

    test("should work with project package.json", async () => {
      await TestUtils.createTestFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "validation-test",
          scripts: {
            validate: "echo 'Package validation complete'",
          },
        })
      );

      const result = await validationTool.execute({
        type: "custom",
        options: {
          directory: tempDir,
          command: "npm run validate",
        },
      });

      expect(result).toContain("Package validation complete");
    });
  });
});
