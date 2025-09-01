/**
 * get_project_tree Tool
 * Analyze project structure using tree command with intelligent exclusions
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export class GetProjectTreeTool {
  getDescription(): string {
    return 'Analyze project structure using tree command with intelligent exclusions';
  }
  
  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Project path to analyze (default: working directory)'
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth to traverse (default: 3)'
        },
        includeHidden: {
          type: 'boolean',
          description: 'Include hidden files and directories (default: false)'
        }
      },
      required: []
    };
  }
  
  async execute(parameters: any, context: any): Promise<any> {
    const targetPath = parameters.path || context.workingDirectory;
    const maxDepth = parameters.maxDepth || 3;
    const includeHidden = parameters.includeHidden || false;
    
    try {
      // Resolve absolute path
      const absolutePath = path.resolve(targetPath);
      
      // Check if path exists
      const stat = await fs.stat(absolutePath);
      if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${absolutePath}`);
      }
      
      // Try to use tree command first
      try {
        const treeResult = await this.executeTreeCommand(absolutePath, maxDepth, includeHidden);
        return {
          success: true,
          tree: treeResult,
          method: 'tree_command',
          path: absolutePath
        };
      } catch (treeError) {
        // Fallback to custom tree implementation
        const customTree = await this.buildCustomTree(absolutePath, maxDepth, includeHidden);
        return {
          success: true,
          tree: customTree,
          method: 'custom_tree',
          path: absolutePath,
          note: 'tree command not available, used custom implementation'
        };
      }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        path: targetPath
      };
    }
  }
  
  /**
   * Execute tree command with intelligent exclusions
   */
  private async executeTreeCommand(targetPath: string, maxDepth: number, includeHidden: boolean): Promise<string> {
    const excludePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.nyc_output',
      'logs',
      '*.log',
      '.DS_Store',
      'Thumbs.db',
      '.vscode',
      '.idea',
      '*.tmp',
      '*.temp',
      '.cache',
      '.jest-cache'
    ];
    
    let command = `tree -L ${maxDepth}`;
    
    if (!includeHidden) {
      command += ' -a';
    }
    
    // Add exclusion patterns
    for (const pattern of excludePatterns) {
      command += ` -I '${pattern}'`;
    }
    
    command += ` "${targetPath}"`;
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 10000, // 10 second timeout
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    if (stderr && !stderr.includes('tree:')) {
      throw new Error(`Tree command error: ${stderr}`);
    }
    
    return stdout;
  }
  
  /**
   * Custom tree implementation as fallback
   */
  private async buildCustomTree(targetPath: string, maxDepth: number, includeHidden: boolean, currentDepth: number = 0): Promise<string> {
    if (currentDepth >= maxDepth) {
      return '';
    }
    
    const excludeNames = new Set([
      'node_modules', '.git', 'dist', 'build', 'coverage', '.nyc_output',
      'logs', '.DS_Store', 'Thumbs.db', '.vscode', '.idea', '.cache', '.jest-cache'
    ]);
    
    let tree = '';
    const indent = '  '.repeat(currentDepth);
    
    try {
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      
      // Filter entries
      const filteredEntries = entries.filter(entry => {
        if (excludeNames.has(entry.name)) return false;
        if (!includeHidden && entry.name.startsWith('.')) return false;
        return true;
      });
      
      // Sort entries (directories first, then files)
      filteredEntries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
      
      for (const entry of filteredEntries) {
        const symbol = entry.isDirectory() ? '📁' : '📄';
        tree += `${indent}${symbol} ${entry.name}\n`;
        
        if (entry.isDirectory() && currentDepth < maxDepth - 1) {
          const subPath = path.join(targetPath, entry.name);
          const subTree = await this.buildCustomTree(subPath, maxDepth, includeHidden, currentDepth + 1);
          tree += subTree;
        }
      }
      
    } catch (error: any) {
      tree += `${indent}❌ Error reading directory: ${error.message}\n`;
    }
    
    return tree;
  }
}
