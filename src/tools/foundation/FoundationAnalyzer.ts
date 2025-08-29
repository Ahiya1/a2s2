import {
  FoundationAnalyzerSchema,
  FoundationAnalyzerParams,
} from "../schemas/ToolSchemas";
import { ShellExecutor } from "../shell/ShellExecutor";
import { Logger } from "../../logging/Logger";

interface CachedResult {
  result: string;
  timestamp: number;
  path: string;
}

export class FoundationAnalyzer {
  private shellExecutor: ShellExecutor;
  private cache: Map<string, CachedResult> = new Map();
  private cacheExpiryMs: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.shellExecutor = new ShellExecutor();
  }

  async execute(params: unknown): Promise<string> {
    const validatedParams = this.validateParams(params);
    return this.get_project_tree(validatedParams);
  }

  async get_project_tree(params: FoundationAnalyzerParams & { forceRefresh?: boolean }): Promise<string> {
    const projectPath = params.path || process.cwd();
    const normalizedPath = require('path').resolve(projectPath);
    const cacheKey = `tree_${normalizedPath}`;

    // Check cache unless force refresh is requested
    if (!params.forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      const age = Date.now() - cached.timestamp;
      
      if (age < this.cacheExpiryMs) {
        Logger.debug(`Using cached project tree analysis`, { 
          path: projectPath, 
          age: Math.round(age / 1000) + 's'
        });
        return cached.result;
      } else {
        // Remove expired cache entry
        this.cache.delete(cacheKey);
        Logger.debug(`Cache expired, will re-analyze`, { path: projectPath });
      }
    }

    Logger.info(`Analyzing project structure`, { path: projectPath });

    try {
      // Try tree command without --gitignore first, then with basic exclusions
      const command = `tree -a -I "node_modules|.git|dist|build|coverage" -L 3 "${projectPath}"`;

      const result = await this.shellExecutor.run_command({
        command,
        timeout: 10000,
      });

      // Cache the result
      this.cache.set(cacheKey, {
        result,
        timestamp: Date.now(),
        path: projectPath
      });

      Logger.info(`Project tree analysis completed and cached`, {
        path: projectPath,
        outputSize: result.length,
        cacheKey
      });

      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error(`Failed to analyze project structure`, {
        path: projectPath,
        error: errorMessage,
      });

      // Fallback: if tree command fails, provide basic directory listing
      try {
        const fallbackCommand = `find "${projectPath}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | head -50`;
        const fallbackResult = await this.shellExecutor.run_command({
          command: fallbackCommand,
          timeout: 5000,
        });

        const result = `Project structure (fallback listing):\n${fallbackResult}`;
        
        // Cache the fallback result too
        this.cache.set(cacheKey, {
          result,
          timestamp: Date.now(),
          path: projectPath
        });

        Logger.warn(`Using fallback directory listing and cached result`, { path: projectPath });
        return result;
      } catch (fallbackError) {
        throw new Error(
          `Both tree command and fallback failed: ${errorMessage}`
        );
      }
    }
  }

  /**
   * Clear the cache for a specific path or all entries
   */
  clearCache(path?: string): void {
    if (path) {
      const normalizedPath = require('path').resolve(path);
      const cacheKey = `tree_${normalizedPath}`;
      this.cache.delete(cacheKey);
      Logger.debug(`Cleared cache for path`, { path });
    } else {
      this.cache.clear();
      Logger.debug(`Cleared all project tree cache`);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): { size: number; entries: Array<{ path: string; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.values()).map(cached => ({
      path: cached.path,
      age: Math.round((now - cached.timestamp) / 1000) // age in seconds
    }));

    return {
      size: this.cache.size,
      entries
    };
  }

  private validateParams(params: unknown): FoundationAnalyzerParams {
    try {
      return FoundationAnalyzerSchema.parse(params);
    } catch (error) {
      throw new Error(
        `Invalid foundation analyzer parameters: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}