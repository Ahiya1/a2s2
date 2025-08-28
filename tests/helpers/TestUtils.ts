import * as fs from "fs-extra";
import * as path from "path";

export class TestUtils {
  static async createTempDir(): Promise<string> {
    const tempDir = path.join(
      __dirname,
      "../temp",
      `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    );
    await fs.ensureDir(tempDir);
    return tempDir;
  }

  static async cleanupTempDir(tempDir: string): Promise<void> {
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  }

  static async createTestFile(
    filePath: string,
    content: string
  ): Promise<void> {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, "utf8");
  }

  static async createTestFiles(
    baseDir: string,
    files: Record<string, string>
  ): Promise<void> {
    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = path.join(baseDir, relativePath);
      await this.createTestFile(fullPath, content);
    }
  }

  static expectStringContains(actual: string, expected: string): void {
    if (!actual.includes(expected)) {
      throw new Error(
        `Expected string to contain "${expected}", but got: ${actual}`
      );
    }
  }

  static expectStringNotContains(actual: string, notExpected: string): void {
    if (actual.includes(notExpected)) {
      throw new Error(
        `Expected string not to contain "${notExpected}", but got: ${actual}`
      );
    }
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async readTestFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf8") as Promise<string>;
  }

  static mockConsoleOutput(): {
    output: string[];
    error: string[];
    restore: () => void;
  } {
    const originalLog = console.log;
    const originalError = console.error;

    const output: string[] = [];
    const error: string[] = [];

    console.log = (...args: unknown[]) => {
      output.push(args.join(" "));
    };

    console.error = (...args: unknown[]) => {
      error.push(args.join(" "));
    };

    const restore = () => {
      console.log = originalLog;
      console.error = originalError;
    };

    return { output, error, restore };
  }
}
