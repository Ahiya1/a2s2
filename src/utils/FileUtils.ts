import * as fs from "fs-extra";
import * as path from "path";

export class FileUtils {
  static async ensureDir(dirPath: string): Promise<void> {
    await fs.ensureDir(dirPath);
  }

  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf8");
  }

  static async writeFile(filePath: string, content: string): Promise<void> {
    await this.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, "utf8");
  }

  static async copyFile(src: string, dest: string): Promise<void> {
    await this.ensureDir(path.dirname(dest));
    await fs.copy(src, dest);
  }

  static resolvePath(filePath: string): string {
    return path.resolve(filePath);
  }

  static joinPath(...paths: string[]): string {
    return path.join(...paths);
  }
}
