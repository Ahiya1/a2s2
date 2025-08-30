import { describe, test, expect, beforeEach, vi } from "vitest";
import { GitTool } from "../../../src/tools/git/GitTool";

// Mock simple-git
const mockGit = {
  init: vi.fn(),
  status: vi.fn(),
  add: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
  pull: vi.fn(),
  branch: vi.fn(),
  checkoutLocalBranch: vi.fn(),
  checkout: vi.fn(),
  log: vi.fn(),
  diff: vi.fn(),
  clone: vi.fn(),
  getRemotes: vi.fn(),
  addRemote: vi.fn(),
  removeRemote: vi.fn(),
  deleteLocalBranch: vi.fn(),
};

// Mock simpleGit function
const mockSimpleGit = vi.fn(() => mockGit);

vi.mock("simple-git", () => ({
  default: mockSimpleGit,
}));

describe("GitTool", () => {
  let gitTool: GitTool;

  beforeEach(() => {
    gitTool = new GitTool();
    vi.clearAllMocks();
  });

  describe("Parameter Validation", () => {
    test("should validate required operation parameter", async () => {
      await expect(gitTool.execute({})).rejects.toThrow(
        "Invalid git tool parameters"
      );
    });

    test("should validate supported git operations", async () => {
      await expect(
        gitTool.execute({ operation: "invalid_operation" })
      ).rejects.toThrow("Invalid git tool parameters");
    });

    test("should accept all supported git operations", async () => {
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
        // Mock successful responses for each operation
        mockGit.init.mockResolvedValue({});
        mockGit.status.mockResolvedValue({
          current: "main",
          ahead: 0,
          behind: 0,
          staged: [],
          modified: [],
          deleted: [],
          not_added: [],
          isClean: () => true,
        });
        mockGit.add.mockResolvedValue({});
        mockGit.commit.mockResolvedValue({
          branch: "main",
          commit: "abc123",
          summary: { changes: 1, insertions: 5, deletions: 2 },
        });
        mockGit.push.mockResolvedValue({});
        mockGit.pull.mockResolvedValue({
          summary: { changes: 0, insertions: 0, deletions: 0 },
        });
        mockGit.branch.mockResolvedValue({ all: ["main", "feature"] });
        mockGit.checkoutLocalBranch.mockResolvedValue({});
        mockGit.checkout.mockResolvedValue({});
        mockGit.log.mockResolvedValue({
          all: [
            {
              hash: "abc123",
              message: "Test commit",
              author_name: "Test",
              date: "today",
            },
          ],
        });
        mockGit.diff.mockResolvedValue("No differences");
        mockSimpleGit.mockReturnValue({
          ...mockGit,
          clone: vi.fn().mockResolvedValue({}),
        });
        mockGit.getRemotes.mockResolvedValue([]);
        mockGit.addRemote.mockResolvedValue({});
        mockGit.removeRemote.mockResolvedValue({});

        const params = { operation, options: {} };

        try {
          const result = await gitTool.execute(params);
          expect(result).toContain(`Git ${operation}: SUCCESS`);
        } catch (error) {
          // Should not throw parameter validation errors
          expect(String(error)).not.toContain("Invalid git tool parameters");
        }
      }
    });

    test("should validate optional parameters", async () => {
      mockGit.status.mockResolvedValue({
        current: "main",
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        deleted: [],
        not_added: [],
        isClean: () => true,
      });

      const validParams = {
        operation: "status" as const,
        options: {
          directory: "/test/dir",
          timeout: 30000,
        },
      };

      const result = await gitTool.execute(validParams);
      expect(result).toContain("Git status: SUCCESS");
      expect(result).not.toContain("Invalid git tool parameters");
    });
  });

  describe("Git Init", () => {
    test("should initialize repository successfully", async () => {
      mockGit.init.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "init",
        options: {},
      });

      expect(result).toContain("Git init: SUCCESS");
      expect(result).toContain("Initialized git repository");
      expect(mockGit.init).toHaveBeenCalledWith();
    });

    test("should support bare repository initialization", async () => {
      mockGit.init.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "init",
        options: { bare: true },
      });

      expect(result).toContain("Git init: SUCCESS");
      expect(mockGit.init).toHaveBeenCalledWith(true);
    });

    test("should handle init failures", async () => {
      mockGit.init.mockRejectedValue(new Error("Init failed"));

      await expect(
        gitTool.execute({
          operation: "init",
          options: {},
        })
      ).rejects.toThrow("Git init failed: Init failed");
    });
  });

  describe("Git Status", () => {
    test("should get repository status successfully", async () => {
      const mockStatus = {
        current: "main",
        ahead: 2,
        behind: 1,
        staged: ["file1.txt"],
        modified: ["file2.txt"],
        deleted: ["file3.txt"],
        not_added: ["file4.txt"],
        isClean: () => false,
      };

      mockGit.status.mockResolvedValue(mockStatus);

      const result = await gitTool.execute({
        operation: "status",
        options: {},
      });

      expect(result).toContain("Git status: SUCCESS");
      expect(result).toContain("On branch main");
      expect(result).toContain("ahead of origin/main by 2 commit(s)");
      expect(result).toContain("behind origin/main by 1 commit(s)");
      expect(result).toContain("Changes to be committed:");
      expect(result).toContain("Changes not staged for commit:");
      expect(result).toContain("Untracked files:");
    });

    test("should handle clean repository status", async () => {
      mockGit.status.mockResolvedValue({
        current: "main",
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        deleted: [],
        not_added: [],
        isClean: () => true,
      });

      const result = await gitTool.execute({
        operation: "status",
        options: {},
      });

      expect(result).toContain("Working tree clean");
    });

    test("should handle non-git repository", async () => {
      mockGit.status.mockRejectedValue(new Error("not a git repository"));

      const result = await gitTool.execute({
        operation: "status",
        options: {},
      });

      expect(result).toContain("Git status: FAILED");
      expect(result).toContain("Not a git repository");
    });
  });

  describe("Git Add", () => {
    test("should add files to staging area", async () => {
      mockGit.add.mockResolvedValue({});
      mockGit.status.mockResolvedValue({
        current: "main",
        ahead: 0,
        behind: 0,
        staged: ["file1.txt"],
        modified: [],
        deleted: [],
        not_added: [],
        isClean: () => false,
      });

      const result = await gitTool.execute({
        operation: "add",
        options: { files: ["file1.txt"] },
      });

      expect(result).toContain("Git add: SUCCESS");
      expect(result).toContain("Files added to staging area");
      expect(result).toContain("Current status:");
      expect(mockGit.add).toHaveBeenCalledWith(["file1.txt"]);
    });

    test("should add all files by default", async () => {
      mockGit.add.mockResolvedValue({});
      mockGit.status.mockResolvedValue({
        current: "main",
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        deleted: [],
        not_added: [],
        isClean: () => true,
      });

      const result = await gitTool.execute({
        operation: "add",
        options: {},
      });

      expect(result).toContain("Git add: SUCCESS");
      expect(mockGit.add).toHaveBeenCalledWith(["."]); // Default to add all
    });

    test("should handle add failures", async () => {
      mockGit.add.mockRejectedValue(new Error("Add failed"));

      await expect(
        gitTool.execute({
          operation: "add",
          options: { files: ["nonexistent.txt"] },
        })
      ).rejects.toThrow("Git add failed: Add failed");
    });
  });

  describe("Git Commit", () => {
    test("should commit changes successfully", async () => {
      mockGit.commit.mockResolvedValue({
        branch: "main",
        commit: "abc123def456",
        summary: {
          changes: 2,
          insertions: 10,
          deletions: 5,
        },
      });

      const result = await gitTool.execute({
        operation: "commit",
        options: { message: "Test commit message" },
      });

      expect(result).toContain("Git commit: SUCCESS");
      expect(result).toContain("[main abc123d] Test commit message");
      expect(result).toContain("2 changes, 10 insertions(+), 5 deletions(-)");
      expect(mockGit.commit).toHaveBeenCalledWith(
        "Test commit message",
        undefined,
        { "--message": "Test commit message" }
      );
    });

    test("should use default commit message", async () => {
      mockGit.commit.mockResolvedValue({
        branch: "main",
        commit: "abc123",
        summary: { changes: 1, insertions: 1, deletions: 0 },
      });

      const result = await gitTool.execute({
        operation: "commit",
        options: {},
      });

      expect(result).toContain("Git commit: SUCCESS");
      expect(mockGit.commit).toHaveBeenCalledWith(
        "Automated commit by a2s2",
        undefined,
        { "--message": "Automated commit by a2s2" }
      );
    });

    test("should support empty commits", async () => {
      mockGit.commit.mockResolvedValue({
        branch: "main",
        commit: "abc123",
        summary: { changes: 0, insertions: 0, deletions: 0 },
      });

      const result = await gitTool.execute({
        operation: "commit",
        options: {
          message: "Empty commit",
          allowEmpty: true,
        },
      });

      expect(result).toContain("Git commit: SUCCESS");
      expect(mockGit.commit).toHaveBeenCalledWith("Empty commit", undefined, {
        "--message": "Empty commit",
        "--allow-empty": null,
      });
    });

    test("should handle commit failures", async () => {
      mockGit.commit.mockRejectedValue(new Error("Nothing to commit"));

      await expect(
        gitTool.execute({
          operation: "commit",
          options: { message: "Test" },
        })
      ).rejects.toThrow("Git commit failed: Nothing to commit");
    });
  });

  describe("Git Push", () => {
    test("should push to remote successfully", async () => {
      mockGit.push.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "push",
        options: {},
      });

      expect(result).toContain("Git push: SUCCESS");
      expect(result).toContain("Push completed successfully to origin");
      expect(mockGit.push).toHaveBeenCalledWith("origin", {});
    });

    test("should push specific branch", async () => {
      mockGit.push.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "push",
        options: {
          remote: "upstream",
          branch: "feature-branch",
        },
      });

      expect(result).toContain("Git push: SUCCESS");
      expect(result).toContain("Remote: upstream");
      expect(result).toContain("Branch: feature-branch");
      expect(mockGit.push).toHaveBeenCalledWith(
        "upstream",
        "feature-branch",
        {}
      );
    });

    test("should support force push", async () => {
      mockGit.push.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "push",
        options: { force: true },
      });

      expect(result).toContain("Git push: SUCCESS");
      expect(mockGit.push).toHaveBeenCalledWith("origin", { "--force": null });
    });

    test("should handle push failures", async () => {
      mockGit.push.mockRejectedValue(new Error("Push rejected"));

      await expect(
        gitTool.execute({
          operation: "push",
          options: {},
        })
      ).rejects.toThrow("Git push failed: Push rejected");
    });
  });

  describe("Git Pull", () => {
    test("should pull from remote successfully", async () => {
      mockGit.pull.mockResolvedValue({
        summary: {
          changes: 3,
          insertions: 15,
          deletions: 7,
        },
      });

      const result = await gitTool.execute({
        operation: "pull",
        options: {},
      });

      expect(result).toContain("Git pull: SUCCESS");
      expect(result).toContain(
        "Pull completed. 3 files changed, 15 insertions(+), 7 deletions(-)"
      );
      expect(mockGit.pull).toHaveBeenCalledWith();
    });

    test("should pull from specific remote and branch", async () => {
      mockGit.pull.mockResolvedValue({
        summary: { changes: 1, insertions: 5, deletions: 0 },
      });

      const result = await gitTool.execute({
        operation: "pull",
        options: {
          remote: "upstream",
          branch: "develop",
        },
      });

      expect(result).toContain("Git pull: SUCCESS");
      expect(result).toContain("Remote: upstream");
      expect(result).toContain("Branch: develop");
      expect(mockGit.pull).toHaveBeenCalledWith("upstream", "develop");
    });

    test("should handle pull failures", async () => {
      mockGit.pull.mockRejectedValue(new Error("Merge conflict"));

      await expect(
        gitTool.execute({
          operation: "pull",
          options: {},
        })
      ).rejects.toThrow("Git pull failed: Merge conflict");
    });
  });

  describe("Git Branch", () => {
    test("should list branches", async () => {
      mockGit.branch.mockResolvedValue({
        all: ["main", "feature-branch", "remotes/origin/main"],
      });

      const result = await gitTool.execute({
        operation: "branch",
        options: { action: "list" },
      });

      expect(result).toContain("Git branch: SUCCESS");
      expect(result).toContain("main\nfeature-branch\nremotes/origin/main");
      expect(mockGit.branch).toHaveBeenCalledWith(["-a"]);
    });

    test("should create new branch", async () => {
      mockGit.checkoutLocalBranch.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "branch",
        options: {
          action: "create",
          branch: "new-feature",
        },
      });

      expect(result).toContain("Git branch: SUCCESS");
      expect(result).toContain("Created branch: new-feature");
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith("new-feature");
    });

    test("should delete branch", async () => {
      mockGit.deleteLocalBranch.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "branch",
        options: {
          action: "delete",
          branch: "old-feature",
        },
      });

      expect(result).toContain("Git branch: SUCCESS");
      expect(result).toContain("Deleted branch: old-feature");
      expect(mockGit.deleteLocalBranch).toHaveBeenCalledWith(
        "old-feature",
        undefined
      );
    });

    test("should force delete branch", async () => {
      mockGit.deleteLocalBranch.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "branch",
        options: {
          action: "delete",
          branch: "unmerged-feature",
          force: true,
        },
      });

      expect(result).toContain("Git branch: SUCCESS");
      expect(mockGit.deleteLocalBranch).toHaveBeenCalledWith(
        "unmerged-feature",
        true
      );
    });

    test("should require branch name for create/delete", async () => {
      await expect(
        gitTool.execute({
          operation: "branch",
          options: { action: "create" },
        })
      ).rejects.toThrow("Branch name required for create action");

      await expect(
        gitTool.execute({
          operation: "branch",
          options: { action: "delete" },
        })
      ).rejects.toThrow("Branch name required for delete action");
    });
  });

  describe("Git Checkout", () => {
    test("should checkout existing branch", async () => {
      mockGit.checkout.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "checkout",
        options: { branch: "develop" },
      });

      expect(result).toContain("Git checkout: SUCCESS");
      expect(result).toContain("Switched to branch: develop");
      expect(mockGit.checkout).toHaveBeenCalledWith("develop");
    });

    test("should create and checkout new branch", async () => {
      mockGit.checkoutLocalBranch.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "checkout",
        options: {
          branch: "new-feature",
          create: true,
        },
      });

      expect(result).toContain("Git checkout: SUCCESS");
      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith("new-feature");
    });

    test("should checkout specific commit", async () => {
      mockGit.checkout.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "checkout",
        options: { commit: "abc123" },
      });

      expect(result).toContain("Git checkout: SUCCESS");
      expect(mockGit.checkout).toHaveBeenCalledWith("abc123");
    });

    test("should require branch or commit", async () => {
      await expect(
        gitTool.execute({
          operation: "checkout",
          options: {},
        })
      ).rejects.toThrow("Branch name or commit hash required for checkout");
    });
  });

  describe("Git Log", () => {
    test("should get commit log", async () => {
      mockGit.log.mockResolvedValue({
        all: [
          {
            hash: "abc123",
            author_name: "Alice",
            date: "2 hours ago",
            message: "Add feature",
          },
          {
            hash: "def456",
            author_name: "Bob",
            date: "1 day ago",
            message: "Fix bug",
          },
        ],
      });

      const result = await gitTool.execute({
        operation: "log",
        options: { limit: 2 },
      });

      expect(result).toContain("Git log: SUCCESS");
      expect(result).toContain("abc123 - Alice, 2 hours ago : Add feature");
      expect(result).toContain("def456 - Bob, 1 day ago : Fix bug");
      expect(mockGit.log).toHaveBeenCalledWith({
        maxCount: 2,
        format: { hash: "%h", author: "%an", date: "%ar", message: "%s" },
      });
    });

    test("should support oneline format", async () => {
      mockGit.log.mockResolvedValue({
        all: [
          { hash: "abc123", message: "Add feature" },
          { hash: "def456", message: "Fix bug" },
        ],
      });

      const result = await gitTool.execute({
        operation: "log",
        options: { oneline: true, limit: 2 },
      });

      expect(result).toContain("abc123 Add feature");
      expect(result).toContain("def456 Fix bug");
      expect(mockGit.log).toHaveBeenCalledWith({
        maxCount: 2,
        format: { hash: "%h", message: "%s" },
      });
    });
  });

  describe("Git Diff", () => {
    test("should show working directory diff", async () => {
      mockGit.diff.mockResolvedValue(
        "diff --git a/file.txt b/file.txt\n+added line"
      );

      const result = await gitTool.execute({
        operation: "diff",
        options: {},
      });

      expect(result).toContain("Git diff: SUCCESS");
      expect(result).toContain("diff --git a/file.txt b/file.txt");
      expect(mockGit.diff).toHaveBeenCalledWith();
    });

    test("should show staged diff", async () => {
      mockGit.diff.mockResolvedValue("staged changes diff");

      const result = await gitTool.execute({
        operation: "diff",
        options: { staged: true },
      });

      expect(result).toContain("staged changes diff");
      expect(mockGit.diff).toHaveBeenCalledWith(["--staged"]);
    });

    test("should diff specific files", async () => {
      mockGit.diff.mockResolvedValue("file specific diff");

      const result = await gitTool.execute({
        operation: "diff",
        options: { files: ["file1.txt", "file2.txt"] },
      });

      expect(result).toContain("file specific diff");
      expect(mockGit.diff).toHaveBeenCalledWith(["file1.txt", "file2.txt"]);
    });

    test("should handle no differences", async () => {
      mockGit.diff.mockResolvedValue("");

      const result = await gitTool.execute({
        operation: "diff",
        options: {},
      });

      expect(result).toContain("No differences found");
    });
  });

  describe("Git Clone", () => {
    test("should clone repository", async () => {
      const mockClone = vi.fn().mockResolvedValue({});
      mockSimpleGit.mockReturnValue({ clone: mockClone });

      const result = await gitTool.execute({
        operation: "clone",
        options: { url: "https://github.com/user/repo.git" },
      });

      expect(result).toContain("Git clone: SUCCESS");
      expect(result).toContain(
        "Repository cloned successfully from https://github.com/user/repo.git"
      );
      expect(mockClone).toHaveBeenCalledWith(
        "https://github.com/user/repo.git",
        []
      );
    });

    test("should clone to specific directory", async () => {
      const mockClone = vi.fn().mockResolvedValue({});
      mockSimpleGit.mockReturnValue({ clone: mockClone });

      const result = await gitTool.execute({
        operation: "clone",
        options: {
          url: "https://github.com/user/repo.git",
          directory: "my-repo",
        },
      });

      expect(result).toContain("Git clone: SUCCESS");
      expect(mockClone).toHaveBeenCalledWith(
        "https://github.com/user/repo.git",
        "my-repo",
        []
      );
    });

    test("should support shallow clone", async () => {
      const mockClone = vi.fn().mockResolvedValue({});
      mockSimpleGit.mockReturnValue({ clone: mockClone });

      const result = await gitTool.execute({
        operation: "clone",
        options: {
          url: "https://github.com/user/repo.git",
          shallow: true,
        },
      });

      expect(result).toContain("Git clone: SUCCESS");
      expect(mockClone).toHaveBeenCalledWith(
        "https://github.com/user/repo.git",
        ["--depth=1"]
      );
    });

    test("should require repository URL", async () => {
      await expect(
        gitTool.execute({
          operation: "clone",
          options: {},
        })
      ).rejects.toThrow("Repository URL required for clone");
    });
  });

  describe("Git Remote", () => {
    test("should list remotes", async () => {
      mockGit.getRemotes.mockResolvedValue([
        {
          name: "origin",
          refs: {
            fetch: "https://github.com/user/repo.git",
            push: "https://github.com/user/repo.git",
          },
        },
      ]);

      const result = await gitTool.execute({
        operation: "remote",
        options: { action: "list" },
      });

      expect(result).toContain("Git remote: SUCCESS");
      expect(result).toContain(
        "origin\thttps://github.com/user/repo.git (fetch)"
      );
      expect(result).toContain(
        "origin\thttps://github.com/user/repo.git (push)"
      );
      expect(mockGit.getRemotes).toHaveBeenCalledWith(true);
    });

    test("should add remote", async () => {
      mockGit.addRemote.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "remote",
        options: {
          action: "add",
          name: "upstream",
          url: "https://github.com/original/repo.git",
        },
      });

      expect(result).toContain("Git remote: SUCCESS");
      expect(result).toContain(
        "Added remote: upstream -> https://github.com/original/repo.git"
      );
      expect(mockGit.addRemote).toHaveBeenCalledWith(
        "upstream",
        "https://github.com/original/repo.git"
      );
    });

    test("should remove remote", async () => {
      mockGit.removeRemote.mockResolvedValue({});

      const result = await gitTool.execute({
        operation: "remote",
        options: {
          action: "remove",
          name: "old-remote",
        },
      });

      expect(result).toContain("Git remote: SUCCESS");
      expect(result).toContain("Removed remote: old-remote");
      expect(mockGit.removeRemote).toHaveBeenCalledWith("old-remote");
    });

    test("should require name and URL for add", async () => {
      await expect(
        gitTool.execute({
          operation: "remote",
          options: { action: "add" },
        })
      ).rejects.toThrow("Remote name and URL required for add action");
    });

    test("should require name for remove", async () => {
      await expect(
        gitTool.execute({
          operation: "remote",
          options: { action: "remove" },
        })
      ).rejects.toThrow("Remote name required for remove action");
    });
  });

  describe("Error Handling", () => {
    test("should handle unsupported operations", async () => {
      await expect(
        gitTool.execute({
          operation: "unsupported" as any,
          options: {},
        })
      ).rejects.toThrow("Unsupported git operation: unsupported");
    });

    test("should handle simple-git errors gracefully", async () => {
      mockGit.status.mockRejectedValue(new Error("Repository access denied"));

      await expect(
        gitTool.execute({
          operation: "status",
          options: {},
        })
      ).rejects.toThrow("Git status failed: Repository access denied");
    });

    test("should handle network errors for remote operations", async () => {
      mockGit.push.mockRejectedValue(new Error("Network unreachable"));

      await expect(
        gitTool.execute({
          operation: "push",
          options: {},
        })
      ).rejects.toThrow("Git push failed: Network unreachable");
    });
  });

  describe("Output Formatting", () => {
    test("should format successful results consistently", async () => {
      mockGit.status.mockResolvedValue({
        current: "main",
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        deleted: [],
        not_added: [],
        isClean: () => true,
      });

      const result = await gitTool.execute({
        operation: "status",
        options: {},
      });

      expect(result).toMatch(/^Git status: SUCCESS$/m);
      expect(result).toMatch(/^Branch: main$/m);
      expect(result).toMatch(/^Output:$/m);
    });

    test("should include relevant metadata in output", async () => {
      mockGit.commit.mockResolvedValue({
        branch: "feature",
        commit: "abc123",
        summary: { changes: 2, insertions: 10, deletions: 3 },
      });

      const result = await gitTool.execute({
        operation: "commit",
        options: { message: "Test commit" },
      });

      expect(result).toContain("Branch: feature");
      expect(result).toContain("Commit: abc123");
      expect(result).not.toContain("Files:");
      expect(result).not.toContain("Remote:");
    });
  });
});
