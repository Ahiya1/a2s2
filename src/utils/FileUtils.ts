import * as fs from "fs-extra";
import * as path from "path";

export class FileUtils {
  /**
   * Resolve a file path to an absolute path
   */
  static resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(process.cwd(), filePath);
  }

  /**
   * Check if a file or directory exists
   */
  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a file as UTF-8 text
   */
  static async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf8");
  }

  /**
   * Write a file with UTF-8 encoding
   */
  static async writeFile(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    await this.ensureDir(path.dirname(filePath));
    return fs.writeFile(filePath, content, "utf8");
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  static async ensureDir(dirPath: string): Promise<void> {
    return fs.ensureDir(dirPath);
  }

  /**
   * Copy a file from source to destination
   */
  static async copyFile(src: string, dest: string): Promise<void> {
    // Ensure destination directory exists
    await this.ensureDir(path.dirname(dest));
    return fs.copyFile(src, dest);
  }

  /**
   * Delete a file or directory
   */
  static async remove(filePath: string): Promise<void> {
    return fs.remove(filePath);
  }

  /**
   * Get file stats
   */
  static async stat(filePath: string): Promise<fs.Stats> {
    return fs.stat(filePath);
  }

  /**
   * Read directory contents
   */
  static async readDir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  }

  /**
   * Join path segments
   */
  static joinPath(...segments: string[]): string {
    return path.join(...segments);
  }

  /**
   * Get file extension
   */
  static getExtension(filePath: string): string {
    return path.extname(filePath);
  }

  /**
   * Get base name of file (without directory)
   */
  static getBaseName(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }

  /**
   * Get directory name of file
   */
  static getDirName(filePath: string): string {
    return path.dirname(filePath);
  }

  /**
   * Check if path is absolute
   */
  static isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  /**
   * Normalize path (resolve . and .. segments)
   */
  static normalizePath(filePath: string): string {
    return path.normalize(filePath);
  }

  /**
   * Get relative path from one path to another
   */
  static getRelativePath(from: string, to: string): string {
    return path.relative(from, to);
  }

  /**
   * Check if a path is a file
   */
  static async isFile(filePath: string): Promise<boolean> {
    try {
      const stats = await this.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is a directory
   */
  static async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stats = await this.stat(filePath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get file size in bytes
   */
  static async getFileSize(filePath: string): Promise<number> {
    const stats = await this.stat(filePath);
    return stats.size;
  }

  /**
   * Create a temporary file
   */
  static async createTempFile(
    prefix: string = "temp",
    extension: string = ".tmp"
  ): Promise<string> {
    const tempDir = require("os").tmpdir();
    const tempName = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`;
    return path.join(tempDir, tempName);
  }

  /**
   * Move/rename a file
   */
  static async moveFile(src: string, dest: string): Promise<void> {
    await this.ensureDir(path.dirname(dest));
    return fs.move(src, dest);
  }

  /**
   * Find files matching a pattern
   */
  static async findFiles(dirPath: string, pattern: RegExp): Promise<string[]> {
    const files: string[] = [];

    try {
      const items = await this.readDir(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await this.stat(itemPath);

        if (stats.isFile() && pattern.test(item)) {
          files.push(itemPath);
        } else if (stats.isDirectory()) {
          // Recursively search subdirectories
          const subFiles = await this.findFiles(itemPath, pattern);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
      // Return empty array rather than throwing
    }

    return files;
  }

  /**
   * Safely delete files older than specified days
   */
  static async cleanupOldFiles(
    dirPath: string,
    maxAgeDays: number
  ): Promise<number> {
    let deletedCount = 0;
    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    try {
      const items = await this.readDir(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await this.stat(itemPath);

        if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
          await this.remove(itemPath);
          deletedCount++;
        }
      }
    } catch (error) {
      // Directory issues - return count of files actually deleted
    }

    return deletedCount;
  }
}
