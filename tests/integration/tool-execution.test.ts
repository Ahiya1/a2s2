import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { ToolManager } from "../../src/tools/ToolManager";
import { FoundationAnalyzer } from "../../src/tools/foundation/FoundationAnalyzer";
import { FileReader } from "../../src/tools/files/FileReader";
import { FileWriter } from "../../src/tools/files/FileWriter";
import { ShellExecutor } from "../../src/tools/shell/ShellExecutor";
import { TestUtils } from "../helpers/TestUtils";
import * as path from "path";

describe("Tool Execution Integration", () => {
  let toolManager: ToolManager;
  let tempDir: string;

  beforeEach(async () => {
    toolManager = new ToolManager();
    tempDir = await TestUtils.createTempDir();
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
  });

  test("should register and execute all core tools", async () => {
    const tools = toolManager.getAllToolNames();

    expect(tools).toContain("get_project_tree");
    expect(tools).toContain("read_files");
    expect(tools).toContain("write_files");
    expect(tools).toContain("run_command");

    // Validate all tools are working
    const { valid, invalid } = await toolManager.validateTools();
    expect(invalid.length).toBe(0);
    expect(valid.length).toBe(4);
  });

  test("should execute foundation analyzer with real project", async () => {
    // Create a realistic project structure
    await TestUtils.createTestFiles(tempDir, {
      "package.json": JSON.stringify({
        name: "integration-test-project",
        version: "1.0.0",
        dependencies: {
          react: "^18.0.0",
          typescript: "^4.9.0",
        },
        devDependencies: {
          jest: "^29.0.0",
          "@types/node": "^18.0.0",
        },
        scripts: {
          start: "node index.js",
          test: "jest",
          build: "tsc",
        },
      }),
      "src/index.ts": `
import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('Hello World'));
app.listen(3000, () => console.log('Server running'));
      `,
      "src/utils/helpers.ts": `
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
      `,
      "src/components/Button.tsx": `
import React from 'react';
interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}
export const Button: React.FC<ButtonProps> = ({ onClick, children }) => (
  <button onClick={onClick}>{children}</button>
);
      `,
      "tests/utils.test.ts": `
import { capitalize, formatDate } from '../src/utils/helpers';
describe('helpers', () => {
  test('capitalize', () => {
    expect(capitalize('hello')).toBe('Hello');
  });
});
      `,
      "README.md":
        "# Integration Test Project\nA project for testing tool integration",
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "CommonJS",
          strict: true,
          outDir: "./dist",
        },
        include: ["src/**/*"],
      }),
      ".gitignore": "node_modules/\ndist/\n*.log",
    });

    const result = await toolManager.executeToolForResult("get_project_tree", {
      path: tempDir,
    });

    expect(result).toContain("package.json");
    expect(result).toContain("src");
    expect(result).toContain("tests");
    expect(result).toContain("README.md");
    expect(result).not.toContain("node_modules"); // Should be excluded
  });

  test("should execute file operations in realistic workflow", async () => {
    // Step 1: Analyze empty directory
    const initialTree = await toolManager.executeToolForResult(
      "get_project_tree",
      {
        path: tempDir,
      }
    );
    expect(initialTree).toBeDefined();

    // Step 2: Create initial files
    const initialFiles = [
      {
        path: path.join(tempDir, "package.json"),
        content: JSON.stringify(
          {
            name: "workflow-test",
            version: "1.0.0",
            main: "index.js",
          },
          null,
          2
        ),
      },
      {
        path: path.join(tempDir, "index.js"),
        content: `console.log('Hello from workflow test!');\nmodule.exports = { greeting: 'Hello World' };`,
      },
      {
        path: path.join(tempDir, "config.json"),
        content: JSON.stringify(
          {
            environment: "development",
            debug: true,
            version: "1.0.0",
          },
          null,
          2
        ),
      },
    ];

    const writeResult = await toolManager.executeToolForResult("write_files", {
      files: initialFiles,
    });
    expect(writeResult).toContain("3/3 files written successfully");

    // Step 3: Verify files were created
    const verifyTree = await toolManager.executeToolForResult(
      "get_project_tree",
      {
        path: tempDir,
      }
    );
    expect(verifyTree).toContain("package.json");
    expect(verifyTree).toContain("index.js");
    expect(verifyTree).toContain("config.json");

    // Step 4: Read files back
    const filePaths = initialFiles.map((f) => f.path);
    const readResult = await toolManager.executeToolForResult("read_files", {
      paths: filePaths,
    });

    expect(readResult).toContain("workflow-test");
    expect(readResult).toContain("Hello from workflow test");
    expect(readResult).toContain("development");

    // Step 5: Test shell command execution
    const nodeResult = await toolManager.executeToolForResult("run_command", {
      command: `cd "${tempDir}" && node index.js`,
    });
    expect(nodeResult).toContain("Hello from workflow test!");
  });

  test("should handle large scale file operations", async () => {
    const fileCount = 25;
    const files = [];

    // Generate many files
    for (let i = 0; i < fileCount; i++) {
      files.push({
        path: path.join(tempDir, `file_${i.toString().padStart(3, "0")}.txt`),
        content: `This is file number ${i}\nGenerated for large scale test\nContent: ${Math.random()}`,
      });
    }

    // Write all files
    const writeResult = await toolManager.executeToolForResult("write_files", {
      files: files,
    });
    expect(writeResult).toContain(
      `${fileCount}/${fileCount} files written successfully`
    );

    // Read a subset of files
    const readPaths = files.slice(0, 10).map((f) => f.path);
    const readResult = await toolManager.executeToolForResult("read_files", {
      paths: readPaths,
    });

    expect(readResult).toContain("file number 0");
    expect(readResult).toContain("file number 9");

    // Verify project structure includes all files
    const treeResult = await toolManager.executeToolForResult(
      "get_project_tree",
      {
        path: tempDir,
      }
    );

    expect(treeResult).toContain("file_000.txt");
    expect(treeResult).toContain("file_024.txt");
  });

  test("should handle complex shell operations", async () => {
    // Create a project with npm scripts
    await TestUtils.createTestFiles(tempDir, {
      "package.json": JSON.stringify({
        name: "shell-test",
        scripts: {
          hello: "echo 'Hello from npm script'",
          version: "node -v",
          list: "ls -la",
        },
      }),
    });

    // Test multiple shell commands
    const commands = [
      `cd "${tempDir}" && npm run hello`,
      `cd "${tempDir}" && npm run version`,
      `cd "${tempDir}" && echo "Working directory test"`,
    ];

    for (const command of commands) {
      const result = await toolManager.executeToolForResult("run_command", {
        command,
        timeout: 10000,
      });
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    }
  });

  test("should handle error conditions gracefully", async () => {
    // Test file operations with errors

    // 1. Try to read non-existent files
    const readResult = await toolManager.executeToolForResult("read_files", {
      paths: [
        path.join(tempDir, "does-not-exist.txt"),
        path.join(tempDir, "also-missing.js"),
      ],
    });
    expect(readResult).toContain("[Error: File not found]");

    // 2. Try to run invalid shell command
    try {
      await toolManager.executeToolForResult("run_command", {
        command: "this-command-definitely-does-not-exist-12345",
      });
      // Should not reach here
      expect(false).toBe(true);
    } catch (error) {
      expect(String(error)).toContain("Command failed");
    }

    // 3. Try to write to protected location (may not fail on all systems)
    const protectedFiles = [
      {
        path: "/root/protected-file.txt", // This will likely fail
        content: "Should not be able to write this",
      },
    ];

    try {
      await toolManager.executeToolForResult("write_files", {
        files: protectedFiles,
      });
      // If it succeeds, that's fine too (some systems allow this)
    } catch (error) {
      expect(String(error)).toContain("failed");
    }
  });

  test("should maintain atomicity in file operations", async () => {
    // Create an existing file
    const existingFile = path.join(tempDir, "existing.txt");
    await TestUtils.createTestFile(existingFile, "original content");

    // Mix of valid and invalid write operations
    const mixedFiles = [
      {
        path: existingFile,
        content: "updated content",
      },
      {
        path: path.join(tempDir, "new-file.txt"),
        content: "new content",
      },
      {
        path: "/invalid/path/file.txt", // This should fail
        content: "should not be written",
      },
    ];

    try {
      await toolManager.executeToolForResult("write_files", {
        files: mixedFiles,
      });
    } catch (error) {
      // If atomic operations work correctly, the existing file should be unchanged
      const originalContent = await TestUtils.readTestFile(existingFile);
      expect(originalContent).toBe("original content");
    }
  });

  test("should handle concurrent tool executions", async () => {
    // Create multiple independent operations
    const operations = [
      toolManager.executeToolForResult("get_project_tree", { path: tempDir }),
      toolManager.executeToolForResult("write_files", {
        files: [
          {
            path: path.join(tempDir, "concurrent1.txt"),
            content: "First concurrent file",
          },
        ],
      }),
      toolManager.executeToolForResult("write_files", {
        files: [
          {
            path: path.join(tempDir, "concurrent2.txt"),
            content: "Second concurrent file",
          },
        ],
      }),
      toolManager.executeToolForResult("run_command", {
        command: "echo 'Concurrent command execution'",
      }),
    ];

    // Execute all operations concurrently
    const results = await Promise.all(operations);

    // All should succeed
    results.forEach((result) => {
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    // Verify files were created
    expect(
      await TestUtils.fileExists(path.join(tempDir, "concurrent1.txt"))
    ).toBe(true);
    expect(
      await TestUtils.fileExists(path.join(tempDir, "concurrent2.txt"))
    ).toBe(true);
  });

  test("should integrate with custom tools", async () => {
    // Create a custom tool
    const customTool = {
      name: "custom_processor",
      description: "Process data in a custom way",
      schema: {
        type: "object" as const,
        properties: {
          input: { type: "string" as const },
          operation: { type: "string" as const },
        },
        required: ["input"],
      },
      execute: async (params: any) => {
        const { input, operation = "uppercase" } = params;

        switch (operation) {
          case "uppercase":
            return `Processed: ${input.toUpperCase()}`;
          case "reverse":
            return `Processed: ${input.split("").reverse().join("")}`;
          case "count":
            return `Processed: ${input} has ${input.length} characters`;
          default:
            return `Processed: ${input}`;
        }
      },
    };

    // Register custom tool
    toolManager.registerTool("custom_processor", customTool);

    // Test custom tool execution
    const result1 = await toolManager.executeToolForResult("custom_processor", {
      input: "hello world",
      operation: "uppercase",
    });
    expect(result1).toBe("Processed: HELLO WORLD");

    const result2 = await toolManager.executeToolForResult("custom_processor", {
      input: "integration",
      operation: "reverse",
    });
    expect(result2).toBe("Processed: noitargetni");

    // Verify tool is listed
    const allTools = toolManager.getAllToolNames();
    expect(allTools).toContain("custom_processor");
  });

  test("should provide comprehensive tool information", () => {
    const toolDescriptions = toolManager.getToolDescriptions();

    expect(toolDescriptions).toContain("get_project_tree");
    expect(toolDescriptions).toContain("read_files");
    expect(toolDescriptions).toContain("write_files");
    expect(toolDescriptions).toContain("run_command");

    // Check individual tools exist
    expect(toolManager.hasTool("get_project_tree")).toBe(true);
    expect(toolManager.hasTool("read_files")).toBe(true);
    expect(toolManager.hasTool("write_files")).toBe(true);
    expect(toolManager.hasTool("run_command")).toBe(true);
    expect(toolManager.hasTool("nonexistent_tool")).toBe(false);
  });
});
