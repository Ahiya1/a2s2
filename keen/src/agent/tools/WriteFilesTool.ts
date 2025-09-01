/**
 * write_files Tool
 * Write multiple files atomically with rollback protection
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export class WriteFilesTool {
  getDescription(): string {
    return 'Write multiple files atomically with rollback protection';
  }
  
  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
              content: { type: 'string', description: 'File content' }
            },
            required: ['path', 'content']
          },
          description: 'Array of files to write'
        },
        createDirectories: {
          type: 'boolean',
          description: 'Create parent directories if they don\'t exist (default: true)'
        },
        backup: {
          type: 'boolean',
          description: 'Create backup of existing files (default: true)'
        }
      },
      required: ['files']
    };
  }
  
  async execute(parameters: any, context: any): Promise<any> {
    const { files, createDirectories = true, backup = true } = parameters;
    
    if (!Array.isArray(files)) {
      throw new Error('files parameter must be an array');
    }
    
    if (files.length === 0) {
      return {
        success: true,
        message: 'No files to write',
        filesWritten: 0
      };
    }
    
    const workingDirectory = context.workingDirectory;
    const dryRun = context.dryRun;
    const backupPaths: { original: string; backup: string }[] = [];
    const createdDirectories: string[] = [];
    const writtenFiles: string[] = [];
    
    try {
      // Phase 1: Validate and prepare all files
      const preparedFiles: { absolutePath: string; content: string; exists: boolean }[] = [];
      
      for (const file of files) {
        if (!file.path || typeof file.path !== 'string') {
          throw new Error('Each file must have a valid path');
        }
        
        if (file.content === undefined || file.content === null) {
          throw new Error(`File content is required for: ${file.path}`);
        }
        
        // Resolve path relative to working directory
        const absolutePath = path.isAbsolute(file.path) 
          ? file.path 
          : path.resolve(workingDirectory, file.path);
        
        // Security check - ensure path is within working directory
        if (!absolutePath.startsWith(workingDirectory)) {
          throw new Error(`Path is outside working directory: ${file.path}`);
        }
        
        // Check if file exists
        let exists = false;
        try {
          const stats = await fs.stat(absolutePath);
          exists = stats.isFile();
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
        
        preparedFiles.push({
          absolutePath,
          content: String(file.content),
          exists
        });
      }
      
      // Phase 2: Create directories if needed
      if (createDirectories) {
        for (const file of preparedFiles) {
          const dir = path.dirname(file.absolutePath);
          
          try {
            const dirStats = await fs.stat(dir);
            if (!dirStats.isDirectory()) {
              throw new Error(`Parent path exists but is not a directory: ${dir}`);
            }
          } catch (error: any) {
            if (error.code === 'ENOENT') {
              if (dryRun) {
                console.log(`[DRY RUN] Would create directory: ${dir}`);
              } else {
                await fs.mkdir(dir, { recursive: true });
                createdDirectories.push(dir);
              }
            } else {
              throw error;
            }
          }
        }
      }
      
      // Phase 3: Create backups of existing files
      if (backup) {
        for (const file of preparedFiles) {
          if (file.exists) {
            const backupPath = `${file.absolutePath}.backup.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
            
            if (dryRun) {
              console.log(`[DRY RUN] Would backup: ${file.absolutePath} -> ${backupPath}`);
            } else {
              await fs.copyFile(file.absolutePath, backupPath);
              backupPaths.push({ original: file.absolutePath, backup: backupPath });
            }
          }
        }
      }
      
      // Phase 4: Write all files
      for (const file of preparedFiles) {
        if (dryRun) {
          console.log(`[DRY RUN] Would write file: ${file.absolutePath} (${file.content.length} bytes)`);
        } else {
          await fs.writeFile(file.absolutePath, file.content, 'utf-8');
          writtenFiles.push(file.absolutePath);
        }
      }
      
      return {
        success: true,
        message: dryRun 
          ? `Dry run: Would write ${files.length} files`
          : `Successfully wrote ${files.length} files`,
        filesWritten: writtenFiles.length,
        writtenPaths: writtenFiles.map(p => path.relative(workingDirectory, p)),
        backupsCreated: backupPaths.length,
        directoriesCreated: createdDirectories.length,
        dryRun
      };
      
    } catch (error: any) {
      // Rollback on error
      if (!dryRun) {
        await this.rollback(writtenFiles, backupPaths, createdDirectories);
      }
      
      return {
        success: false,
        error: error.message,
        rollbackPerformed: !dryRun
      };
    }
  }
  
  /**
   * Rollback changes on error
   */
  private async rollback(
    writtenFiles: string[], 
    backupPaths: { original: string; backup: string }[], 
    createdDirectories: string[]
  ): Promise<void> {
    try {
      // Restore from backups
      for (const { original, backup } of backupPaths) {
        try {
          await fs.copyFile(backup, original);
          await fs.unlink(backup); // Clean up backup
        } catch (error) {
          console.error(`Failed to restore backup ${backup} -> ${original}:`, error);
        }
      }
      
      // Remove newly created files that don't have backups
      for (const filePath of writtenFiles) {
        const hasBackup = backupPaths.some(bp => bp.original === filePath);
        if (!hasBackup) {
          try {
            await fs.unlink(filePath);
          } catch (error) {
            console.error(`Failed to remove file during rollback ${filePath}:`, error);
          }
        }
      }
      
      // Remove created directories (in reverse order)
      for (const dir of createdDirectories.reverse()) {
        try {
          await fs.rmdir(dir);
        } catch (error) {
          // Ignore errors - directory might not be empty
        }
      }
      
    } catch (error) {
      console.error('Rollback failed:', error);
    }
  }
}
