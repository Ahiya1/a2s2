/**
 * git Tool
 * Execute git tool operations with comprehensive functionality
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class GitTool {
  getDescription(): string {
    return 'Execute git tool';
  }
  
  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Git action to perform',
          enum: [
            'status', 'init', 'add', 'commit', 'push', 'pull', 'branch', 'checkout',
            'merge', 'log', 'diff', 'remote', 'clone', 'fetch', 'reset', 'stash'
          ]
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional arguments for the git command'
        },
        message: {
          type: 'string',
          description: 'Commit message (for commit action)'
        },
        branch: {
          type: 'string',
          description: 'Branch name (for branch/checkout actions)'
        },
        remote: {
          type: 'string',
          description: 'Remote name (default: origin)'
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to add (for add action)'
        }
      },
      required: []
    };
  }
  
  async execute(parameters: any, context: any): Promise<any> {
    const { 
      action = 'status', 
      args = [], 
      message, 
      branch, 
      remote = 'origin', 
      files = [] 
    } = parameters;
    
    const workingDirectory = context.workingDirectory;
    const dryRun = context.dryRun;
    
    try {
      // Check if we're in a git repository
      const isGitRepo = await this.isGitRepository(workingDirectory);
      
      if (!isGitRepo && action !== 'init' && action !== 'clone') {
        throw new Error('Not in a git repository. Use "git init" to initialize.');
      }
      
      // Build git command
      const gitCommand = await this.buildGitCommand(action, {
        args,
        message,
        branch,
        remote,
        files
      });
      
      if (dryRun) {
        return {
          success: true,
          message: `Dry run: Would execute: git ${gitCommand}`,
          command: `git ${gitCommand}`,
          workingDirectory,
          dryRun: true
        };
      }
      
      // Execute git command
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(`git ${gitCommand}`, {
        cwd: workingDirectory,
        timeout: 30000,
        maxBuffer: 1024 * 1024
      });
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        action,
        command: `git ${gitCommand}`,
        workingDirectory,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        duration
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        action,
        workingDirectory,
        stdout: error.stdout ? error.stdout.toString() : '',
        stderr: error.stderr ? error.stderr.toString() : ''
      };
    }
  }
  
  /**
   * Check if directory is a git repository
   */
  private async isGitRepository(directory: string): Promise<boolean> {
    try {
      const gitDir = path.join(directory, '.git');
      const stats = await fs.stat(gitDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
  
  /**
   * Build git command based on action and parameters
   */
  private async buildGitCommand(action: string, options: any): Promise<string> {
    const { args, message, branch, remote, files } = options;
    
    switch (action) {
      case 'init':
        return 'init';
        
      case 'status':
        return 'status --porcelain';
        
      case 'add':
        if (files.length > 0) {
          const quotedFiles = files.map((f: string) => `"${f}"`).join(' ');
          return `add ${quotedFiles}`;
        }
        return 'add .';
        
      case 'commit':
        if (!message) {
          throw new Error('Commit message is required for commit action');
        }
        return `commit -m "${message.replace(/"/g, '\\"')}"`;
        
      case 'push':
        return `push ${remote} ${branch || 'HEAD'}`;
        
      case 'pull':
        return `pull ${remote} ${branch || 'HEAD'}`;
        
      case 'branch':
        if (branch) {
          return `branch ${branch}`;
        }
        return 'branch';
        
      case 'checkout':
        if (!branch) {
          throw new Error('Branch name is required for checkout action');
        }
        return `checkout ${branch}`;
        
      case 'merge':
        if (!branch) {
          throw new Error('Branch name is required for merge action');
        }
        return `merge ${branch}`;
        
      case 'log':
        return 'log --oneline -10';
        
      case 'diff':
        if (files.length > 0) {
          const quotedFiles = files.map((f: string) => `"${f}"`).join(' ');
          return `diff ${quotedFiles}`;
        }
        return 'diff';
        
      case 'remote':
        return 'remote -v';
        
      case 'clone':
        if (args.length === 0) {
          throw new Error('Repository URL is required for clone action');
        }
        return `clone ${args.join(' ')}`;
        
      case 'fetch':
        return `fetch ${remote}`;
        
      case 'reset':
        if (args.length > 0) {
          return `reset ${args.join(' ')}`;
        }
        return 'reset --hard HEAD';
        
      case 'stash':
        if (args.length > 0) {
          return `stash ${args.join(' ')}`;
        }
        return 'stash';
        
      default:
        if (args.length > 0) {
          return `${action} ${args.join(' ')}`;
        }
        return action;
    }
  }
  
  /**
   * Get current git status information
   */
  async getStatus(workingDirectory: string): Promise<any> {
    try {
      const { stdout } = await execAsync('git status --porcelain', {
        cwd: workingDirectory
      });
      
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      const changes = lines.map(line => {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        
        let changeType = 'unknown';
        if (status.includes('M')) changeType = 'modified';
        else if (status.includes('A')) changeType = 'added';
        else if (status.includes('D')) changeType = 'deleted';
        else if (status.includes('??')) changeType = 'untracked';
        
        return { file, status, changeType };
      });
      
      return {
        clean: changes.length === 0,
        changes,
        totalChanges: changes.length
      };
    } catch (error: any) {
      throw new Error(`Failed to get git status: ${error.message}`);
    }
  }
  
  /**
   * Get current branch information
   */
  async getBranchInfo(workingDirectory: string): Promise<any> {
    try {
      const { stdout: currentBranch } = await execAsync('git branch --show-current', {
        cwd: workingDirectory
      });
      
      const { stdout: allBranches } = await execAsync('git branch', {
        cwd: workingDirectory
      });
      
      const branches = allBranches
        .split('\n')
        .map(b => b.trim())
        .filter(b => b)
        .map(b => ({
          name: b.replace(/^\* /, ''),
          current: b.startsWith('* ')
        }));
      
      return {
        currentBranch: currentBranch.trim(),
        branches,
        totalBranches: branches.length
      };
    } catch (error: any) {
      throw new Error(`Failed to get branch info: ${error.message}`);
    }
  }
}
