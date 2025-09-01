/**
 * run_command Tool
 * Execute shell commands with timeout and error handling
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export class RunCommandTool {
  getDescription(): string {
    return 'Execute shell commands with timeout and error handling';
  }
  
  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)'
        },
        workingDirectory: {
          type: 'string',
          description: 'Working directory for command execution'
        },
        env: {
          type: 'object',
          description: 'Environment variables to set'
        },
        shell: {
          type: 'string',
          description: 'Shell to use (default: system default)'
        }
      },
      required: ['command']
    };
  }
  
  async execute(parameters: any, context: any): Promise<any> {
    const { 
      command, 
      timeout = 30000, 
      workingDirectory, 
      env = {},
      shell 
    } = parameters;
    
    if (!command || typeof command !== 'string') {
      throw new Error('command parameter must be a non-empty string');
    }
    
    // Security checks
    const forbiddenPatterns = [
      'rm -rf /',
      'sudo rm',
      'format',
      'del /f /q',
      'rmdir /s /q',
      '> /dev/null 2>&1 &',
      'curl | sh',
      'wget | sh'
    ];
    
    const lowerCommand = command.toLowerCase();
    for (const pattern of forbiddenPatterns) {
      if (lowerCommand.includes(pattern)) {
        throw new Error(`Potentially dangerous command blocked: ${pattern}`);
      }
    }
    
    const cwd = workingDirectory || context.workingDirectory;
    const dryRun = context.dryRun;
    
    if (dryRun) {
      return {
        success: true,
        message: `Dry run: Would execute command: ${command}`,
        command,
        workingDirectory: cwd,
        dryRun: true
      };
    }
    
    try {
      const startTime = Date.now();
      
      // Prepare execution environment
      const execEnv = {
        ...process.env,
        ...env
      };
      
      const options: any = {
        cwd,
        env: execEnv,
        timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
        killSignal: 'SIGKILL'
      };
      
      if (shell) {
        options.shell = shell;
      }
      
      // Execute command
      const { stdout, stderr } = await execAsync(command, options);
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        command,
        workingDirectory: cwd,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        duration,
        exitCode: 0
      };
      
    } catch (error: any) {
      const duration = Date.now() - Date.now();
      
      // Handle timeout
      if (error.killed && error.signal === 'SIGKILL') {
        return {
          success: false,
          error: `Command timed out after ${timeout}ms`,
          command,
          workingDirectory: cwd,
          timeout: true,
          duration
        };
      }
      
      // Handle command execution errors
      return {
        success: false,
        error: error.message,
        command,
        workingDirectory: cwd,
        stdout: error.stdout ? error.stdout.toString() : '',
        stderr: error.stderr ? error.stderr.toString() : '',
        exitCode: error.code || -1,
        duration
      };
    }
  }
  
  /**
   * Execute command with real-time output streaming
   */
  async executeWithStreaming(
    command: string, 
    options: any, 
    context: any,
    onStdout?: (data: string) => void,
    onStderr?: (data: string) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const cwd = options.workingDirectory || context.workingDirectory;
      
      const child = spawn(command, {
        cwd,
        shell: true,
        env: { ...process.env, ...options.env },
        timeout: options.timeout || 30000
      });
      
      let stdout = '';
      let stderr = '';
      const startTime = Date.now();
      
      child.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        if (onStdout) {
          onStdout(text);
        }
      });
      
      child.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        if (onStderr) {
          onStderr(text);
        }
      });
      
      child.on('close', (code) => {
        const duration = Date.now() - startTime;
        resolve({
          success: code === 0,
          command,
          workingDirectory: cwd,
          stdout,
          stderr,
          exitCode: code,
          duration,
          streaming: true
        });
      });
      
      child.on('error', (error) => {
        const duration = Date.now() - startTime;
        reject({
          success: false,
          error: error.message,
          command,
          workingDirectory: cwd,
          duration,
          streaming: true
        });
      });
    });
  }
}
