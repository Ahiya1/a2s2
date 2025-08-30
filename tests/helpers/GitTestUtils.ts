import { exec } from "child_process";
import { promisify } from "util";
import { TestUtils } from "./TestUtils";
import * as path from "path";
import * as fs from "fs-extra";

const execAsync = promisify(exec);

export interface GitRepoConfig {
  bare?: boolean;
  initialBranch?: string;
  userConfig?: {
    name: string;
    email: string;
  };
}

export interface GitCommitConfig {
  message?: string;
  author?: {
    name: string;
    email: string;
  };
  allowEmpty?: boolean;
}

export interface GitStatusInfo {
  branch: string;
  staged: string[];
  modified: string[];
  untracked: string[];
  clean: boolean;
}

/**
 * Utility class for creating and managing Git repositories in tests
 */
export class GitTestUtils {
  /**
   * Create a Git repository in the specified directory
   */
  static async createGitRepo(
    directory: string,
    config: GitRepoConfig = {}
  ): Promise<void> {
    const {
      bare = false,
      initialBranch = "main",
      userConfig = { name: "Test User", email: "test@example.com" },
    } = config;

    try {
      // Initialize repository
      const initCommand = bare ? "git init --bare" : "git init";
      await execAsync(`cd "${directory}" && ${initCommand}`);

      // Set initial branch name
      await execAsync(
        `cd "${directory}" && git config init.defaultBranch ${initialBranch}`
      );

      // Configure user (required for commits)
      await execAsync(
        `cd "${directory}" && git config user.name "${userConfig.name}"`
      );
      await execAsync(
        `cd "${directory}" && git config user.email "${userConfig.email}"`
      );

      // Set safe directory (for some Git versions)
      try {
        await execAsync(
          `cd "${directory}" && git config --global --add safe.directory "*"`
        );
      } catch {
        // Ignore safe directory errors - not critical for tests
      }
    } catch (error) {
      throw new Error(
        `Failed to create Git repository: ${(error as Error).message}`
      );
    }
  }

  /**
   * Create a commit history with the specified messages
   */
  static async createCommitHistory(
    directory: string,
    commitMessages: string[],
    config: Partial<GitCommitConfig> = {}
  ): Promise<string[]> {
    const commitHashes: string[] = [];

    for (let i = 0; i < commitMessages.length; i++) {
      const message = commitMessages[i];

      // Create a file for each commit to ensure there are changes
      const filename = `commit_${i + 1}.txt`;
      const filepath = path.join(directory, filename);
      await fs.writeFile(
        filepath,
        `Content for commit: ${message}\nCreated at: ${new Date().toISOString()}`
      );

      // Stage the file
      await execAsync(`cd "${directory}" && git add "${filename}"`);

      // Create commit
      const commitConfig: GitCommitConfig = {
        message,
        allowEmpty: false,
        ...config,
      };

      const authorString = commitConfig.author
        ? `--author="${commitConfig.author.name} <${commitConfig.author.email}>"`
        : "";

      const allowEmptyFlag = commitConfig.allowEmpty ? "--allow-empty" : "";

      try {
        const result = await execAsync(
          `cd "${directory}" && git commit ${authorString} ${allowEmptyFlag} -m "${commitConfig.message}"`
        );

        // Extract commit hash from output
        const hashMatch = result.stdout.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
        if (hashMatch) {
          commitHashes.push(hashMatch[1]);
        }
      } catch (error) {
        throw new Error(
          `Failed to create commit "${message}": ${(error as Error).message}`
        );
      }
    }

    return commitHashes;
  }

  /**
   * Create a branch and optionally switch to it
   */
  static async createBranch(
    directory: string,
    branchName: string,
    switchTo: boolean = false
  ): Promise<void> {
    try {
      // Create branch
      await execAsync(`cd "${directory}" && git branch "${branchName}"`);

      if (switchTo) {
        await execAsync(`cd "${directory}" && git checkout "${branchName}"`);
      }
    } catch (error) {
      throw new Error(
        `Failed to create branch "${branchName}": ${(error as Error).message}`
      );
    }
  }

  /**
   * Switch to a specific branch
   */
  static async switchBranch(
    directory: string,
    branchName: string,
    createIfNotExists: boolean = false
  ): Promise<void> {
    try {
      const createFlag = createIfNotExists ? "-b" : "";
      await execAsync(
        `cd "${directory}" && git checkout ${createFlag} "${branchName}"`
      );
    } catch (error) {
      throw new Error(
        `Failed to switch to branch "${branchName}": ${(error as Error).message}`
      );
    }
  }

  /**
   * Add files to the staging area
   */
  static async stageFiles(
    directory: string,
    files: string | string[]
  ): Promise<void> {
    const fileList = Array.isArray(files) ? files.join(" ") : files;

    try {
      await execAsync(`cd "${directory}" && git add ${fileList}`);
    } catch (error) {
      throw new Error(`Failed to stage files: ${(error as Error).message}`);
    }
  }

  /**
   * Create a commit with the specified message
   */
  static async createCommit(
    directory: string,
    message: string,
    config: Partial<GitCommitConfig> = {}
  ): Promise<string | null> {
    const commitConfig: GitCommitConfig = {
      message,
      allowEmpty: false,
      ...config,
    };

    const authorString = commitConfig.author
      ? `--author="${commitConfig.author.name} <${commitConfig.author.email}>"`
      : "";

    const allowEmptyFlag = commitConfig.allowEmpty ? "--allow-empty" : "";

    try {
      const result = await execAsync(
        `cd "${directory}" && git commit ${authorString} ${allowEmptyFlag} -m "${commitConfig.message}"`
      );

      // Extract commit hash
      const hashMatch = result.stdout.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
      return hashMatch ? hashMatch[1] : null;
    } catch (error) {
      throw new Error(`Failed to create commit: ${(error as Error).message}`);
    }
  }

  /**
   * Get the current Git status
   */
  static async getStatus(directory: string): Promise<GitStatusInfo> {
    try {
      const result = await execAsync(
        `cd "${directory}" && git status --porcelain -b`
      );
      return this.parseGitStatus(result.stdout);
    } catch (error) {
      throw new Error(`Failed to get Git status: ${(error as Error).message}`);
    }
  }

  /**
   * Parse git status --porcelain output
   */
  private static parseGitStatus(statusOutput: string): GitStatusInfo {
    const lines = statusOutput.split("\n");
    const branchLine = lines[0] || "";

    // Parse branch info
    let branch = "main";
    const branchMatch = branchLine.match(/^## (.+?)(?:\.\.\.|\s|$)/);
    if (branchMatch) {
      branch = branchMatch[1];
    }

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    // Parse file statuses
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const statusCode = line.substring(0, 2);
      const fileName = line.substring(3);

      // Staged files (index changes)
      if (statusCode[0] !== " " && statusCode[0] !== "?") {
        staged.push(fileName);
      }

      // Modified files (working tree changes)
      if (statusCode[1] !== " ") {
        if (statusCode[1] === "?") {
          untracked.push(fileName);
        } else {
          modified.push(fileName);
        }
      }
    }

    const clean =
      staged.length === 0 && modified.length === 0 && untracked.length === 0;

    return {
      branch,
      staged,
      modified,
      untracked,
      clean,
    };
  }

  /**
   * Get the current branch name
   */
  static async getCurrentBranch(directory: string): Promise<string> {
    try {
      const result = await execAsync(
        `cd "${directory}" && git branch --show-current`
      );
      return result.stdout.trim() || "main";
    } catch (error) {
      return "main";
    }
  }

  /**
   * Get the commit history
   */
  static async getCommitHistory(
    directory: string,
    limit: number = 10
  ): Promise<Array<{ hash: string; message: string; author: string }>> {
    try {
      const result = await execAsync(
        `cd "${directory}" && git log --oneline -${limit} --pretty=format:"%H|%s|%an"`
      );

      return result.stdout
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const [hash, message, author] = line.split("|");
          return {
            hash: hash.trim(),
            message: message.trim(),
            author: author.trim(),
          };
        });
    } catch (error) {
      return [];
    }
  }

  /**
   * Create a remote repository (bare) for testing push/pull operations
   */
  static async createRemoteRepo(remoteDirectory: string): Promise<void> {
    await fs.ensureDir(remoteDirectory);
    await this.createGitRepo(remoteDirectory, { bare: true });
  }

  /**
   * Add a remote to the repository
   */
  static async addRemote(
    directory: string,
    name: string,
    url: string
  ): Promise<void> {
    try {
      await execAsync(`cd "${directory}" && git remote add "${name}" "${url}"`);
    } catch (error) {
      throw new Error(
        `Failed to add remote "${name}": ${(error as Error).message}`
      );
    }
  }

  /**
   * Remove a remote from the repository
   */
  static async removeRemote(directory: string, name: string): Promise<void> {
    try {
      await execAsync(`cd "${directory}" && git remote remove "${name}"`);
    } catch (error) {
      throw new Error(
        `Failed to remove remote "${name}": ${(error as Error).message}`
      );
    }
  }

  /**
   * Push changes to a remote
   */
  static async push(
    directory: string,
    remote: string = "origin",
    branch?: string
  ): Promise<void> {
    const branchArg = branch ? ` ${branch}` : "";

    try {
      await execAsync(`cd "${directory}" && git push ${remote}${branchArg}`);
    } catch (error) {
      throw new Error(
        `Failed to push to ${remote}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Pull changes from a remote
   */
  static async pull(
    directory: string,
    remote: string = "origin",
    branch?: string
  ): Promise<void> {
    const branchArg = branch ? ` ${branch}` : "";

    try {
      await execAsync(`cd "${directory}" && git pull ${remote}${branchArg}`);
    } catch (error) {
      throw new Error(
        `Failed to pull from ${remote}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get the diff output
   */
  static async getDiff(
    directory: string,
    options: {
      staged?: boolean;
      files?: string[];
    } = {}
  ): Promise<string> {
    const { staged = false, files = [] } = options;
    const stagedFlag = staged ? "--staged" : "";
    const filesArg = files.length > 0 ? files.join(" ") : "";

    try {
      const result = await execAsync(
        `cd "${directory}" && git diff ${stagedFlag} ${filesArg}`
      );
      return result.stdout;
    } catch (error) {
      return "";
    }
  }

  /**
   * Check if a directory is a Git repository
   */
  static async isGitRepository(directory: string): Promise<boolean> {
    try {
      await execAsync(`cd "${directory}" && git rev-parse --git-dir`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all branches (local and remote)
   */
  static async getBranches(
    directory: string,
    options: { includeRemote?: boolean } = {}
  ): Promise<{ local: string[]; remote: string[]; current: string }> {
    const { includeRemote = true } = options;

    try {
      const flag = includeRemote ? "-a" : "";
      const result = await execAsync(`cd "${directory}" && git branch ${flag}`);

      const lines = result.stdout.split("\n").filter((line) => line.trim());
      const local: string[] = [];
      const remote: string[] = [];
      let current = "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("* ")) {
          current = trimmed.substring(2).trim();
          if (!current.startsWith("remotes/")) {
            local.push(current);
          }
        } else if (trimmed.startsWith("remotes/")) {
          remote.push(trimmed.substring(8)); // Remove "remotes/" prefix
        } else if (trimmed && !trimmed.startsWith("remotes/")) {
          local.push(trimmed);
        }
      }

      return { local, remote, current };
    } catch (error) {
      return { local: [], remote: [], current: "main" };
    }
  }

  /**
   * Create a complex Git scenario for testing
   */
  static async createComplexScenario(
    directory: string,
    scenario: "merge-conflict" | "feature-branch" | "rebase-scenario"
  ): Promise<void> {
    await this.createGitRepo(directory);

    switch (scenario) {
      case "merge-conflict":
        await this.createMergeConflictScenario(directory);
        break;
      case "feature-branch":
        await this.createFeatureBranchScenario(directory);
        break;
      case "rebase-scenario":
        await this.createRebaseScenario(directory);
        break;
    }
  }

  /**
   * Create a merge conflict scenario
   */
  private static async createMergeConflictScenario(
    directory: string
  ): Promise<void> {
    // Create initial file and commit
    await TestUtils.createTestFile(
      path.join(directory, "conflict.txt"),
      "Line 1\nLine 2\nLine 3\n"
    );
    await this.stageFiles(directory, "conflict.txt");
    await this.createCommit(directory, "Initial commit");

    // Create feature branch and modify file
    await this.createBranch(directory, "feature", true);
    await TestUtils.createTestFile(
      path.join(directory, "conflict.txt"),
      "Line 1\nLine 2 modified in feature\nLine 3\n"
    );
    await this.stageFiles(directory, "conflict.txt");
    await this.createCommit(directory, "Feature changes");

    // Switch back to main and modify same line
    await this.switchBranch(directory, "main");
    await TestUtils.createTestFile(
      path.join(directory, "conflict.txt"),
      "Line 1\nLine 2 modified in main\nLine 3\n"
    );
    await this.stageFiles(directory, "conflict.txt");
    await this.createCommit(directory, "Main changes");
  }

  /**
   * Create a feature branch scenario
   */
  private static async createFeatureBranchScenario(
    directory: string
  ): Promise<void> {
    // Create main branch with some commits
    await this.createCommitHistory(directory, [
      "Initial commit",
      "Add basic functionality",
      "Fix bug in main",
    ]);

    // Create feature branch
    await this.createBranch(directory, "feature/new-component", true);

    // Add feature commits
    await TestUtils.createTestFile(
      path.join(directory, "feature.ts"),
      "export const newFeature = 'implemented';"
    );
    await this.stageFiles(directory, "feature.ts");
    await this.createCommit(directory, "Add new feature");

    await TestUtils.createTestFile(
      path.join(directory, "feature.test.ts"),
      "import { newFeature } from './feature'; test('feature works', () => {});"
    );
    await this.stageFiles(directory, "feature.test.ts");
    await this.createCommit(directory, "Add feature tests");

    // Switch back to main
    await this.switchBranch(directory, "main");
  }

  /**
   * Create a rebase scenario
   */
  private static async createRebaseScenario(directory: string): Promise<void> {
    // Create initial commits
    await this.createCommitHistory(directory, [
      "Initial commit",
      "Add feature A",
      "Add feature B",
    ]);

    // Create branch from earlier commit
    await execAsync(`cd "${directory}" && git checkout HEAD~1`);
    await this.createBranch(directory, "feature-branch", true);

    // Add commits to feature branch
    await TestUtils.createTestFile(
      path.join(directory, "feature-c.ts"),
      "export const featureC = 'new feature';"
    );
    await this.stageFiles(directory, "feature-c.ts");
    await this.createCommit(directory, "Add feature C");

    await TestUtils.createTestFile(
      path.join(directory, "feature-c.test.ts"),
      "// Tests for feature C"
    );
    await this.stageFiles(directory, "feature-c.test.ts");
    await this.createCommit(directory, "Add tests for feature C");

    // Switch back to main
    await this.switchBranch(directory, "main");
  }

  /**
   * Mock Git command responses for testing
   */
  static createMockGitResponses(): {
    mockInit: () => string;
    mockStatus: (files?: {
      staged?: string[];
      modified?: string[];
      untracked?: string[];
    }) => string;
    mockLog: (commits: Array<{ hash: string; message: string }>) => string;
    mockBranch: (branches: string[], current: string) => string;
  } {
    return {
      mockInit: () => "Initialized empty Git repository in /test/repo/.git/",

      mockStatus: (files = {}) => {
        const { staged = [], modified = [], untracked = [] } = files;
        let output = "## main\n";

        staged.forEach((file) => {
          output += `A  ${file}\n`;
        });

        modified.forEach((file) => {
          output += ` M ${file}\n`;
        });

        untracked.forEach((file) => {
          output += `?? ${file}\n`;
        });

        return output;
      },

      mockLog: (commits) => {
        return commits
          .map((commit) => `${commit.hash} ${commit.message}`)
          .join("\n");
      },

      mockBranch: (branches, current) => {
        return branches
          .map((branch) => (branch === current ? `* ${branch}` : `  ${branch}`))
          .join("\n");
      },
    };
  }

  /**
   * Clean up Git repository (remove .git directory)
   */
  static async cleanupGitRepo(directory: string): Promise<void> {
    try {
      const gitDir = path.join(directory, ".git");
      if (await fs.pathExists(gitDir)) {
        await fs.remove(gitDir);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Validate Git repository state
   */
  static async validateRepoState(
    directory: string,
    expectedState: {
      branch?: string;
      stagedFiles?: string[];
      modifiedFiles?: string[];
      untrackedFiles?: string[];
      commitCount?: number;
    }
  ): Promise<boolean> {
    try {
      const status = await this.getStatus(directory);

      if (expectedState.branch && status.branch !== expectedState.branch) {
        return false;
      }

      if (
        expectedState.stagedFiles &&
        !this.arraysEqual(
          status.staged.sort(),
          expectedState.stagedFiles.sort()
        )
      ) {
        return false;
      }

      if (
        expectedState.modifiedFiles &&
        !this.arraysEqual(
          status.modified.sort(),
          expectedState.modifiedFiles.sort()
        )
      ) {
        return false;
      }

      if (
        expectedState.untrackedFiles &&
        !this.arraysEqual(
          status.untracked.sort(),
          expectedState.untrackedFiles.sort()
        )
      ) {
        return false;
      }

      if (expectedState.commitCount !== undefined) {
        const history = await this.getCommitHistory(
          directory,
          expectedState.commitCount + 5
        );
        if (history.length !== expectedState.commitCount) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper method to compare arrays
   */
  private static arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
  }
}
