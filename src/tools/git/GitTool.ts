import { exec } from "child_process";
import { promisify } from "util";
import { GitToolSchema, GitToolParams } from "../schemas/ToolSchemas";
import { Logger } from "../../logging/Logger";
import { ConfigManager } from "../../config/ConfigManager";
import * as path from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

export interface GitResult {
  success: boolean;
  output: string;
  operation: string;
  filesChanged?: string[];
  branch?: string;
  commit?: string;
  remote?: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  clean: boolean;
}

export class GitTool {
  async execute(params: unknown): Promise<string> {
    const validatedParams = this.validateParams(params);
    return this.executeGitOperation(validatedParams);
  }

  private async executeGitOperation(params: GitToolParams): Promise<string> {
    const { operation, options = {} } = params;
    const config = ConfigManager.getConfig();
    const timeout = options.timeout || config.commandTimeout;

    Logger.info(`Executing git operation: ${operation}`, {
      operation,
      options,
      timeout,
    });

    try {
      let result: GitResult;

      switch (operation) {
        case "init":
          result = await this.gitInit(options);
          break;
        case "status":
          result = await this.gitStatus(options);
          break;
        case "add":
          result = await this.gitAdd(options);
          break;
        case "commit":
          result = await this.gitCommit(options);
          break;
        case "push":
          result = await this.gitPush(options);
          break;
        case "pull":
          result = await this.gitPull(options);
          break;
        case "branch":
          result = await this.gitBranch(options);
          break;
        case "checkout":
          result = await this.gitCheckout(options);
          break;
        case "log":
          result = await this.gitLog(options);
          break;
        case "diff":
          result = await this.gitDiff(options);
          break;
        case "clone":
          result = await this.gitClone(options);
          break;
        case "remote":
          result = await this.gitRemote(options);
          break;
        default:
          throw new Error(`Unsupported git operation: ${operation}`);
      }

      Logger.info(`Git operation completed: ${operation}`, {
        success: result.success,
        operation: result.operation,
        outputLength: result.output.length,
      });

      return this.formatResult(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error(`Git operation failed: ${operation}`, {
        operation,
        error: errorMessage,
      });

      throw new Error(`Git ${operation} failed: ${errorMessage}`);
    }
  }

  private async gitInit(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();
    const bare = options.bare ? "--bare" : "";

    const command = `cd "${workingDir}" && git init ${bare}`.trim();
    const result = await execAsync(command, { timeout: 30000 });

    return {
      success: true,
      output: result.stdout,
      operation: "init",
    };
  }

  private async gitStatus(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();

    // Check if we're in a git repository
    if (!(await this.isGitRepository(workingDir))) {
      return {
        success: false,
        output: "Not a git repository. Run 'git init' to initialize.",
        operation: "status",
      };
    }

    const command = `cd "${workingDir}" && git status --porcelain -b`;
    const result = await execAsync(command, { timeout: 15000 });

    const status = this.parseGitStatus(result.stdout);

    return {
      success: true,
      output: this.formatGitStatus(status),
      operation: "status",
      branch: status.branch,
      filesChanged: [...status.staged, ...status.unstaged, ...status.untracked],
    };
  }

  private async gitAdd(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();
    const files = options.files || ["."];
    const fileList = Array.isArray(files) ? files.join(" ") : files;

    const command = `cd "${workingDir}" && git add ${fileList}`;
    const result = await execAsync(command, { timeout: 30000 });

    // Get status to show what was staged
    const statusResult = await this.gitStatus({ directory: workingDir });

    return {
      success: true,
      output: `Files added to staging area.\n${result.stdout}\n\nCurrent status:\n${statusResult.output}`,
      operation: "add",
      filesChanged: Array.isArray(files) ? files : [files],
    };
  }

  private async gitCommit(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();
    const message = options.message || "Automated commit by a2s2";
    const allowEmpty = options.allowEmpty ? "--allow-empty" : "";

    // Escape message for shell
    const escapedMessage = message.replace(/"/g, '\\"');

    const command =
      `cd "${workingDir}" && git commit -m "${escapedMessage}" ${allowEmpty}`.trim();
    const result = await execAsync(command, { timeout: 30000 });

    // Extract commit hash from output
    const commitMatch = result.stdout.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
    const commit = commitMatch ? commitMatch[1] : undefined;

    return {
      success: true,
      output: result.stdout,
      operation: "commit",
      commit,
    };
  }

  private async gitPush(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();
    const remote = options.remote || "origin";
    const branch = options.branch || (await this.getCurrentBranch(workingDir));
    const force = options.force ? "--force" : "";

    const command =
      `cd "${workingDir}" && git push ${remote} ${branch} ${force}`.trim();
    const result = await execAsync(command, { timeout: 60000 });

    return {
      success: true,
      output: result.stdout || result.stderr, // git push outputs to stderr
      operation: "push",
      remote,
      branch,
    };
  }

  private async gitPull(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();
    const remote = options.remote || "origin";
    const branch = options.branch || (await this.getCurrentBranch(workingDir));

    const command = `cd "${workingDir}" && git pull ${remote} ${branch}`;
    const result = await execAsync(command, { timeout: 60000 });

    return {
      success: true,
      output: result.stdout,
      operation: "pull",
      remote,
      branch,
    };
  }

  private async gitBranch(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();
    const action = options.action || "list"; // list, create, delete
    const branchName = options.branch;

    let command: string;

    switch (action) {
      case "list":
        command = `cd "${workingDir}" && git branch -a`;
        break;
      case "create":
        if (!branchName)
          throw new Error("Branch name required for create action");
        command = `cd "${workingDir}" && git branch "${branchName}"`;
        break;
      case "delete":
        if (!branchName)
          throw new Error("Branch name required for delete action");
        const force = options.force ? "-D" : "-d";
        command = `cd "${workingDir}" && git branch ${force} "${branchName}"`;
        break;
      default:
        throw new Error(`Unknown branch action: ${action}`);
    }

    const result = await execAsync(command, { timeout: 15000 });

    return {
      success: true,
      output: result.stdout,
      operation: "branch",
      branch: branchName,
    };
  }

  private async gitCheckout(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();
    const target = options.branch || options.commit;
    const createBranch = options.create ? "-b" : "";

    if (!target)
      throw new Error("Branch name or commit hash required for checkout");

    const command = `cd "${workingDir}" && git checkout ${createBranch} "${target}"`;
    const result = await execAsync(command, { timeout: 30000 });

    return {
      success: true,
      output: result.stdout,
      operation: "checkout",
      branch: target,
    };
  }

  private async gitLog(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();
    const limit = options.limit || 10;
    const oneline = options.oneline
      ? "--oneline"
      : "--pretty=format:'%h - %an, %ar : %s'";

    const command = `cd "${workingDir}" && git log ${oneline} -${limit}`;
    const result = await execAsync(command, { timeout: 15000 });

    return {
      success: true,
      output: result.stdout,
      operation: "log",
    };
  }

  private async gitDiff(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();
    const staged = options.staged ? "--staged" : "";
    const files = options.files
      ? Array.isArray(options.files)
        ? options.files.join(" ")
        : options.files
      : "";

    const command = `cd "${workingDir}" && git diff ${staged} ${files}`.trim();
    const result = await execAsync(command, { timeout: 30000 });

    return {
      success: true,
      output: result.stdout || "No differences found",
      operation: "diff",
    };
  }

  private async gitClone(options: any): Promise<GitResult> {
    const url = options.url;
    const directory = options.directory;
    const shallow = options.shallow ? "--depth=1" : "";

    if (!url) throw new Error("Repository URL required for clone");

    const targetDir = directory ? `"${directory}"` : "";
    const command = `git clone ${shallow} "${url}" ${targetDir}`.trim();
    const result = await execAsync(command, { timeout: 120000 }); // 2 minute timeout for clones

    return {
      success: true,
      output: result.stdout,
      operation: "clone",
      remote: url,
    };
  }

  private async gitRemote(options: any): Promise<GitResult> {
    const workingDir = options.directory || process.cwd();
    const action = options.action || "list"; // list, add, remove
    const name = options.name;
    const url = options.url;

    let command: string;

    switch (action) {
      case "list":
        command = `cd "${workingDir}" && git remote -v`;
        break;
      case "add":
        if (!name || !url)
          throw new Error("Remote name and URL required for add action");
        command = `cd "${workingDir}" && git remote add "${name}" "${url}"`;
        break;
      case "remove":
        if (!name) throw new Error("Remote name required for remove action");
        command = `cd "${workingDir}" && git remote remove "${name}"`;
        break;
      default:
        throw new Error(`Unknown remote action: ${action}`);
    }

    const result = await execAsync(command, { timeout: 15000 });

    return {
      success: true,
      output: result.stdout,
      operation: "remote",
      remote: name,
    };
  }

  // Helper methods
  private async isGitRepository(directory: string): Promise<boolean> {
    try {
      const gitDir = path.join(directory, ".git");
      return fs.existsSync(gitDir);
    } catch {
      return false;
    }
  }

  private async getCurrentBranch(directory: string): Promise<string> {
    try {
      const command = `cd "${directory}" && git branch --show-current`;
      const result = await execAsync(command, { timeout: 5000 });
      return result.stdout.trim() || "main";
    } catch {
      return "main";
    }
  }

  private parseGitStatus(statusOutput: string): GitStatus {
    const lines = statusOutput.split("\n");
    const branchLine = lines[0] || "";

    // Parse branch info
    let branch = "main";
    let ahead = 0;
    let behind = 0;

    const branchMatch = branchLine.match(/^## (.+?)(?:\.\.\.|\s|$)/);
    if (branchMatch) {
      branch = branchMatch[1];
    }

    const aheadMatch = branchLine.match(/ahead (\d+)/);
    if (aheadMatch) {
      ahead = parseInt(aheadMatch[1], 10);
    }

    const behindMatch = branchLine.match(/behind (\d+)/);
    if (behindMatch) {
      behind = parseInt(behindMatch[1], 10);
    }

    // Parse file statuses
    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const statusCode = line.substring(0, 2);
      const fileName = line.substring(3);

      if (statusCode[0] !== " " && statusCode[0] !== "?") {
        staged.push(fileName);
      }
      if (statusCode[1] !== " ") {
        if (statusCode[1] === "?") {
          untracked.push(fileName);
        } else {
          unstaged.push(fileName);
        }
      }
    }

    return {
      branch,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      clean:
        staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
    };
  }

  private formatGitStatus(status: GitStatus): string {
    const lines: string[] = [];

    lines.push(`On branch ${status.branch}`);

    if (status.ahead > 0) {
      lines.push(
        `Your branch is ahead of origin/${status.branch} by ${status.ahead} commit(s).`
      );
    }
    if (status.behind > 0) {
      lines.push(
        `Your branch is behind origin/${status.branch} by ${status.behind} commit(s).`
      );
    }

    if (status.clean) {
      lines.push("Working tree clean");
    } else {
      if (status.staged.length > 0) {
        lines.push("\nChanges to be committed:");
        status.staged.forEach((file) => lines.push(`  modified: ${file}`));
      }

      if (status.unstaged.length > 0) {
        lines.push("\nChanges not staged for commit:");
        status.unstaged.forEach((file) => lines.push(`  modified: ${file}`));
      }

      if (status.untracked.length > 0) {
        lines.push("\nUntracked files:");
        status.untracked.forEach((file) => lines.push(`  ${file}`));
      }
    }

    return lines.join("\n");
  }

  private formatResult(result: GitResult): string {
    const lines: string[] = [];

    lines.push(
      `Git ${result.operation}: ${result.success ? "SUCCESS" : "FAILED"}`
    );

    if (result.branch) {
      lines.push(`Branch: ${result.branch}`);
    }
    if (result.commit) {
      lines.push(`Commit: ${result.commit}`);
    }
    if (result.remote) {
      lines.push(`Remote: ${result.remote}`);
    }
    if (result.filesChanged && result.filesChanged.length > 0) {
      lines.push(`Files: ${result.filesChanged.join(", ")}`);
    }

    lines.push("");
    lines.push("Output:");
    lines.push(result.output);

    return lines.join("\n");
  }

  private validateParams(params: unknown): GitToolParams {
    try {
      return GitToolSchema.parse(params);
    } catch (error) {
      throw new Error(
        `Invalid git tool parameters: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
