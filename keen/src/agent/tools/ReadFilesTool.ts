/**
 * read_files Tool
 * Read multiple files and return their contents with error handling
 */

import { promises as fs } from 'fs';
import path from 'path';

export class ReadFilesTool {
  getDescription(): string {
    return 'Read multiple files and return their contents with error handling';
  }
  
  getInputSchema(): any {
    return {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to read'
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          enum: ['utf-8', 'ascii', 'base64', 'binary']
        },
        maxSize: {
          type: 'number',
          description: 'Maximum file size in bytes (default: 1MB)'
        }
      },
      required: ['paths']
    };
  }
  
  async execute(parameters: any, context: any): Promise<any> {
    const { paths, encoding = 'utf-8', maxSize = 1024 * 1024 } = parameters;
    
    if (!Array.isArray(paths)) {
      throw new Error('paths parameter must be an array');
    }
    
    const results: any[] = [];
    const workingDirectory = context.workingDirectory;
    
    for (const filePath of paths) {
      try {
        // Resolve path relative to working directory
        const absolutePath = path.isAbsolute(filePath) 
          ? filePath 
          : path.resolve(workingDirectory, filePath);
        
        // Security check - ensure path is within working directory
        if (!absolutePath.startsWith(workingDirectory)) {
          results.push({
            path: filePath,
            success: false,
            error: 'Path is outside working directory'
          });
          continue;
        }
        
        // Check if file exists and get stats
        const stats = await fs.stat(absolutePath);
        
        if (!stats.isFile()) {
          results.push({
            path: filePath,
            success: false,
            error: 'Path is not a file'
          });
          continue;
        }
        
        // Check file size
        if (stats.size > maxSize) {
          results.push({
            path: filePath,
            success: false,
            error: `File too large (${stats.size} bytes > ${maxSize} bytes)`
          });
          continue;
        }
        
        // Read file content
        const content = await fs.readFile(absolutePath, encoding as BufferEncoding);
        
        results.push({
          path: filePath,
          success: true,
          content,
          size: stats.size,
          lastModified: stats.mtime.toISOString()
        });
        
      } catch (error: any) {
        results.push({
          path: filePath,
          success: false,
          error: error.message
        });
      }
    }
    
    return {
      success: true,
      files: results,
      totalFiles: paths.length,
      successCount: results.filter(r => r.success).length,
      errorCount: results.filter(r => !r.success).length
    };
  }
}
