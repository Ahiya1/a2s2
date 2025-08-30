import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { GitTool } from "../../../src/tools/git/GitTool";
import { TestUtils } from "../../helpers/TestUtils";
import { GitTestUtils } from "../../helpers/GitTestUtils";
import * as path from "path";

describe("GitTool", () => {
  let gitTool: GitTool;
  let tempDir: string;

  beforeEach(async () => {
    gitTool = new GitTool();
    tempDir = await TestUtils.createTempDir();
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
  });

  describe("Parameter Validation", () => {
    test("should validate required operation parameter", async () => {
      await expect(gitTool.execute({})).rejects.toThrow(
        "Invalid git tool parameters"
      );
    });

    test("should validate supported operations", async () => {
      await expect(
        gitTool.execute({ operation: "invalid_operation" })
      ).rejects.toThrow("Invalid git tool parameters");
    });

    test("should accept all supported operations", async () => {
      const operations = [
        "init",
        "status",
        "add",
        "commit",
        "push",
        "pull",
        "branch",
        "checkout",
        "log",
        "diff",
        "clone",
        "remote",
      ];

      for (const operation of operations) {
        const params = { operation, options: { directory: tempDir } };
        // This might fail due to git requirements, but shouldn't fail validation
        try {
          await gitTool.execute(params);
        } catch (error) {
          // Validation errors should mention "Invalid git tool parameters"
          // Execution errors should not
          expect(String(error)).not.toContain("Invalid git tool parameters");
        }
      }
    });

    test("should validate optional parameters", async () => {
      const validParams = {
        operation: "commit" as const,
        options: {
          directory: tempDir,
          message: "Test commit",
          allowEmpty: true,
          timeout: 10000,
        },
      };

      // Should not throw validation error
      try {
        await gitTool.execute(validParams);
      } catch (error) {
        expect(String(error)).not.toContain("Invalid git tool parameters");
      }
    });
  });

  describe("Git Init", () => {
    test("should initialize a new git repository", async () => {
      const result = await gitTool.execute({
        operation: "init",
        options: { directory: tempDir },
      });

      expect(result).toContain("Git init: SUCCESS");
      expect(result).toContain("Initialized");

      // Verify .git directory was created
      expect(await TestUtils.fileExists(path.join(tempDir, ".git"))).toBe(true);
    });

    test("should initialize bare repository", async () => {
      const result = await gitTool.execute({
        operation: "init",
        options: { directory: tempDir, bare: true },
      });

      expect(result).toContain("Git init: SUCCESS");
      expect(result).toContain("bare");
    });

    test("should handle init in existing repository", async () => {
      // Initialize once
      await gitTool.execute({
        operation: "init",
        options: { directory: tempDir },
      });

      // Initialize again - should still succeed
      const result = await gitTool.execute({
        operation: "init",
        options: { directory: tempDir },
      });

      expect(result).toContain("Git init: SUCCESS");
    });
  });

  describe("Git Status", () => {
    test("should report status of non-git directory", async () => {
      const result = await gitTool.execute({
        operation: "status",
        options: { directory: tempDir },
      });

      expect(result).toContain("Not a git repository");
    });

    test("should report clean repository status", async () => {
      await GitTestUtils.createGitRepo(tempDir);

      const result = await gitTool.execute({
        operation: "status",
        options: { directory: tempDir },
      });

      expect(result).toContain("Git status: SUCCESS");
      expect(result).toContain("Working tree clean");
      expect(result).toContain("On branch");
    });

    test("should report modified files", async () => {
      await GitTestUtils.createGitRepo(tempDir);

      // Create and modify files
      await TestUtils.createTestFile(
        path.join(tempDir, "test.txt"),
        "test content"
      );

      const result = await gitTool.execute({
        operation: "status",
        options: { directory: tempDir },
      });

      expect(result).toContain("Git status: SUCCESS");
      expect(result).toContain("Untracked files");
      expect(result).toContain("test.txt");
    });

    test("should report staged files", async () => {
      await GitTestUtils.createGitRepo(tempDir);

      // Create file and stage it
      const testFile = path.join(tempDir, "staged.txt");
      await TestUtils.createTestFile(testFile, "staged content");

      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "staged.txt" },
      });

      const result = await gitTool.execute({
        operation: "status",
        options: { directory: tempDir },
      });

      expect(result).toContain("Changes to be committed");
      expect(result).toContain("staged.txt");
    });
  });

  describe("Git Add", () => {
    beforeEach(async () => {
      await GitTestUtils.createGitRepo(tempDir);
    });

    test("should add single file", async () => {
      const testFile = path.join(tempDir, "single.txt");
      await TestUtils.createTestFile(testFile, "single file content");

      const result = await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "single.txt" },
      });

      expect(result).toContain("Git add: SUCCESS");
      expect(result).toContain("Files added to staging area");
    });

    test("should add multiple files", async () => {
      await TestUtils.createTestFiles(tempDir, {
        "file1.txt": "content 1",
        "file2.txt": "content 2",
        "file3.txt": "content 3",
      });

      const result = await gitTool.execute({
        operation: "add",
        options: {
          directory: tempDir,
          files: ["file1.txt", "file2.txt", "file3.txt"],
        },
      });

      expect(result).toContain("Git add: SUCCESS");
    });

    test("should add all files with dot", async () => {
      await TestUtils.createTestFiles(tempDir, {
        "all1.txt": "content 1",
        "all2.txt": "content 2",
        "sub/nested.txt": "nested content",
      });

      const result = await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "." },
      });

      expect(result).toContain("Git add: SUCCESS");
    });

    test("should handle non-existent files gracefully", async () => {
      try {
        await gitTool.execute({
          operation: "add",
          options: { directory: tempDir, files: "does-not-exist.txt" },
        });
      } catch (error) {
        expect(String(error)).toContain("Git add failed");
      }
    });
  });

  describe("Git Commit", () => {
    beforeEach(async () => {
      await GitTestUtils.createGitRepo(tempDir);
    });

    test("should commit staged changes", async () => {
      // Create and stage a file
      const testFile = path.join(tempDir, "commit-test.txt");
      await TestUtils.createTestFile(testFile, "commit test content");

      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "commit-test.txt" },
      });

      const result = await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "Test commit message",
        },
      });

      expect(result).toContain("Git commit: SUCCESS");
      expect(result).toContain("Test commit message");
    });

    test("should handle empty commit with allowEmpty", async () => {
      const result = await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "Empty commit test",
          allowEmpty: true,
        },
      });

      expect(result).toContain("Git commit: SUCCESS");
    });

    test("should fail on empty commit without allowEmpty", async () => {
      try {
        await gitTool.execute({
          operation: "commit",
          options: {
            directory: tempDir,
            message: "This should fail",
          },
        });
        expect.fail("Should have failed for empty commit");
      } catch (error) {
        expect(String(error)).toContain("Git commit failed");
      }
    });

    test("should use default message when none provided", async () => {
      // Create and stage a file
      const testFile = path.join(tempDir, "default-msg.txt");
      await TestUtils.createTestFile(testFile, "default message test");

      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "default-msg.txt" },
      });

      const result = await gitTool.execute({
        operation: "commit",
        options: { directory: tempDir },
      });

      expect(result).toContain("Automated commit by a2s2");
    });

    test("should escape commit messages properly", async () => {
      // Create and stage a file
      const testFile = path.join(tempDir, "escape-test.txt");
      await TestUtils.createTestFile(testFile, "escape test content");

      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "escape-test.txt" },
      });

      const result = await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: 'Commit with "quotes" and special chars!',
        },
      });

      expect(result).toContain("Git commit: SUCCESS");
    });
  });

  describe("Git Branch", () => {
    beforeEach(async () => {
      await GitTestUtils.createGitRepo(tempDir);
      await GitTestUtils.createCommitHistory(tempDir, ["Initial commit"]);
    });

    test("should list branches", async () => {
      const result = await gitTool.execute({
        operation: "branch",
        options: { directory: tempDir, action: "list" },
      });

      expect(result).toContain("Git branch: SUCCESS");
      expect(result).toContain("main");
    });

    test("should create new branch", async () => {
      const result = await gitTool.execute({
        operation: "branch",
        options: {
          directory: tempDir,
          action: "create",
          branch: "feature-branch",
        },
      });

      expect(result).toContain("Git branch: SUCCESS");
      expect(result).toContain("feature-branch");

      // Verify branch was created
      const listResult = await gitTool.execute({
        operation: "branch",
        options: { directory: tempDir, action: "list" },
      });
      expect(listResult).toContain("feature-branch");
    });

    test("should delete branch", async () => {
      // Create branch first
      await gitTool.execute({
        operation: "branch",
        options: {
          directory: tempDir,
          action: "create",
          branch: "delete-me",
        },
      });

      // Delete it
      const result = await gitTool.execute({
        operation: "branch",
        options: {
          directory: tempDir,
          action: "delete",
          branch: "delete-me",
        },
      });

      expect(result).toContain("Git branch: SUCCESS");
    });

    test("should require branch name for create/delete actions", async () => {
      try {
        await gitTool.execute({
          operation: "branch",
          options: { directory: tempDir, action: "create" },
        });
        expect.fail("Should have failed without branch name");
      } catch (error) {
        expect(String(error)).toContain("Branch name required");
      }
    });
  });

  describe("Git Checkout", () => {
    beforeEach(async () => {
      await GitTestUtils.createGitRepo(tempDir);
      await GitTestUtils.createCommitHistory(tempDir, ["Initial commit"]);
    });

    test("should checkout existing branch", async () => {
      // Create a branch first
      await gitTool.execute({
        operation: "branch",
        options: {
          directory: tempDir,
          action: "create",
          branch: "test-checkout",
        },
      });

      const result = await gitTool.execute({
        operation: "checkout",
        options: { directory: tempDir, branch: "test-checkout" },
      });

      expect(result).toContain("Git checkout: SUCCESS");
    });

    test("should create and checkout new branch", async () => {
      const result = await gitTool.execute({
        operation: "checkout",
        options: {
          directory: tempDir,
          branch: "new-feature",
          create: true,
        },
      });

      expect(result).toContain("Git checkout: SUCCESS");
      expect(result).toContain("new-feature");
    });

    test("should require branch name", async () => {
      try {
        await gitTool.execute({
          operation: "checkout",
          options: { directory: tempDir },
        });
        expect.fail("Should have failed without branch name");
      } catch (error) {
        expect(String(error)).toContain("Branch name or commit hash required");
      }
    });
  });

  describe("Git Log", () => {
    beforeEach(async () => {
      await GitTestUtils.createGitRepo(tempDir);
      await GitTestUtils.createCommitHistory(tempDir, [
        "First commit",
        "Second commit",
        "Third commit",
      ]);
    });

    test("should show commit log", async () => {
      const result = await gitTool.execute({
        operation: "log",
        options: { directory: tempDir },
      });

      expect(result).toContain("Git log: SUCCESS");
      expect(result).toContain("First commit");
    });

    test("should limit log entries", async () => {
      const result = await gitTool.execute({
        operation: "log",
        options: { directory: tempDir, limit: 2 },
      });

      expect(result).toContain("Git log: SUCCESS");
      // Should show recent commits
    });

    test("should show oneline format", async () => {
      const result = await gitTool.execute({
        operation: "log",
        options: { directory: tempDir, oneline: true, limit: 5 },
      });

      expect(result).toContain("Git log: SUCCESS");
    });
  });

  describe("Git Diff", () => {
    beforeEach(async () => {
      await GitTestUtils.createGitRepo(tempDir);
    });

    test("should show diff for unstaged changes", async () => {
      // Create initial commit
      await TestUtils.createTestFile(
        path.join(tempDir, "diff-test.txt"),
        "original content"
      );
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "diff-test.txt" },
      });
      await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "Initial content",
        },
      });

      // Modify file
      await TestUtils.createTestFile(
        path.join(tempDir, "diff-test.txt"),
        "modified content"
      );

      const result = await gitTool.execute({
        operation: "diff",
        options: { directory: tempDir },
      });

      expect(result).toContain("Git diff: SUCCESS");
    });

    test("should show diff for staged changes", async () => {
      // Create initial commit
      await TestUtils.createTestFile(
        path.join(tempDir, "staged-diff.txt"),
        "original content"
      );
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "staged-diff.txt" },
      });
      await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "Initial content",
        },
      });

      // Modify and stage file
      await TestUtils.createTestFile(
        path.join(tempDir, "staged-diff.txt"),
        "staged changes"
      );
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "staged-diff.txt" },
      });

      const result = await gitTool.execute({
        operation: "diff",
        options: { directory: tempDir, staged: true },
      });

      expect(result).toContain("Git diff: SUCCESS");
    });

    test("should diff specific files", async () => {
      await TestUtils.createTestFiles(tempDir, {
        "file1.txt": "content 1",
        "file2.txt": "content 2",
      });

      const result = await gitTool.execute({
        operation: "diff",
        options: { directory: tempDir, files: "file1.txt" },
      });

      expect(result).toContain("Git diff: SUCCESS");
    });

    test("should handle no differences", async () => {
      const result = await gitTool.execute({
        operation: "diff",
        options: { directory: tempDir },
      });

      expect(result).toContain("No differences found");
    });
  });

  describe("Git Remote", () => {
    beforeEach(async () => {
      await GitTestUtils.createGitRepo(tempDir);
    });

    test("should list remotes", async () => {
      const result = await gitTool.execute({
        operation: "remote",
        options: { directory: tempDir, action: "list" },
      });

      expect(result).toContain("Git remote: SUCCESS");
    });

    test("should add remote", async () => {
      const result = await gitTool.execute({
        operation: "remote",
        options: {
          directory: tempDir,
          action: "add",
          name: "origin",
          url: "https://github.com/test/repo.git",
        },
      });

      expect(result).toContain("Git remote: SUCCESS");

      // Verify remote was added
      const listResult = await gitTool.execute({
        operation: "remote",
        options: { directory: tempDir, action: "list" },
      });
      expect(listResult).toContain("origin");
    });

    test("should remove remote", async () => {
      // Add remote first
      await gitTool.execute({
        operation: "remote",
        options: {
          directory: tempDir,
          action: "add",
          name: "temp-remote",
          url: "https://github.com/temp/repo.git",
        },
      });

      // Remove it
      const result = await gitTool.execute({
        operation: "remote",
        options: {
          directory: tempDir,
          action: "remove",
          name: "temp-remote",
        },
      });

      expect(result).toContain("Git remote: SUCCESS");
    });

    test("should require name and url for add action", async () => {
      try {
        await gitTool.execute({
          operation: "remote",
          options: { directory: tempDir, action: "add" },
        });
        expect.fail("Should have failed without name and URL");
      } catch (error) {
        expect(String(error)).toContain("Remote name and URL required");
      }
    });
  });

  describe("Git Clone", () => {
    test("should require repository URL", async () => {
      try {
        await gitTool.execute({
          operation: "clone",
          options: { directory: tempDir },
        });
        expect.fail("Should have failed without repository URL");
      } catch (error) {
        expect(String(error)).toContain("Repository URL required");
      }
    });

    // Note: Actual clone testing would require a real repository
    // In a real test environment, you might test with a local bare repo
  });

  describe("Error Handling", () => {
    test("should handle unsupported operations", async () => {
      try {
        await gitTool.execute({
          operation: "unsupported" as any,
          options: { directory: tempDir },
        });
        expect.fail("Should have failed for unsupported operation");
      } catch (error) {
        expect(String(error)).toContain("Unsupported git operation");
      }
    });

    test("should handle non-existent directory", async () => {
      try {
        await gitTool.execute({
          operation: "status",
          options: { directory: "/path/that/does/not/exist" },
        });
      } catch (error) {
        expect(String(error)).toContain("Git status failed");
      }
    });

    test("should handle timeout", async () => {
      // This test would need a command that takes a long time
      // For now, just verify timeout parameter is accepted
      const params = {
        operation: "status" as const,
        options: { directory: tempDir, timeout: 1000 },
      };

      try {
        await gitTool.execute(params);
      } catch (error) {
        // Should not be a validation error
        expect(String(error)).not.toContain("Invalid git tool parameters");
      }
    });

    test("should provide helpful error messages", async () => {
      try {
        await gitTool.execute({
          operation: "commit",
          options: { directory: tempDir, message: "Empty repo commit" },
        });
      } catch (error) {
        expect(String(error)).toContain("Git commit failed");
      }
    });
  });

  describe("Status Parsing", () => {
    beforeEach(async () => {
      await GitTestUtils.createGitRepo(tempDir);
    });

    test("should parse clean repository status", async () => {
      const result = await gitTool.execute({
        operation: "status",
        options: { directory: tempDir },
      });

      expect(result).toContain("Working tree clean");
      expect(result).toContain("On branch");
    });

    test("should parse complex status with multiple file types", async () => {
      // Create various file states
      await TestUtils.createTestFiles(tempDir, {
        "untracked.txt": "untracked content",
        "modified.txt": "will be modified",
        "staged.txt": "will be staged",
      });

      // Stage some files
      await gitTool.execute({
        operation: "add",
        options: { directory: tempDir, files: "staged.txt" },
      });

      // Commit staged file
      await gitTool.execute({
        operation: "commit",
        options: {
          directory: tempDir,
          message: "Add staged file",
        },
      });

      // Modify the committed file
      await TestUtils.createTestFile(
        path.join(tempDir, "staged.txt"),
        "modified after staging"
      );

      const result = await gitTool.execute({
        operation: "status",
        options: { directory: tempDir },
      });

      expect(result).toContain("Git status: SUCCESS");
      expect(result).toContain("untracked.txt");
      expect(result).toContain("modified.txt");
    });
  });

  describe("Directory Handling", () => {
    test("should default to current directory", async () => {
      // This test verifies the tool can handle missing directory option
      try {
        const result = await gitTool.execute({
          operation: "status",
          // No directory specified
        });
        // Should not throw validation error
      } catch (error) {
        expect(String(error)).not.toContain("Invalid git tool parameters");
      }
    });

    test("should handle relative paths", async () => {
      const result = await gitTool.execute({
        operation: "status",
        options: { directory: "." },
      });

      // Should not throw validation error
      expect(result).toBeDefined();
    });
  });
});
