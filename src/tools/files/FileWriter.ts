import { FileWriterSchema, FileWriterParams } from "../schemas/ToolSchemas";
import { FileUtils } from "../../utils/FileUtils";
import { Logger } from "../../logging/Logger";
import * as fs from "fs-extra";
import * as path from "path";

interface WriteResult {
  path: string;
  success: boolean;
  error?: string;
}

export class FileWriter {
  private backupDir: string = ".a2s2-backup";

  async execute(params: unknown): Promise<string> {
    const validatedParams = this.validateParams(params);
    return this.write_files(validatedParams);
  }

  async write_files(params: FileWriterParams): Promise<string> {
    const { files } = params;

    Logger.info(`Writing files`, { fileCount: files.length });

    const backupId = this.generateBackupId();
    const results: WriteResult[] = [];

    try {
      // Create backup of existing files
      await this.createBackup(
        files.map((f) => f.path),
        backupId
      );

      // Write files atomically
      const writePromises = files.map(async (file) => {
        try {
          const resolvedPath = FileUtils.resolvePath(file.path);

          // Write to temporary file first
          const tempPath = `${resolvedPath}.tmp`;
          await FileUtils.writeFile(tempPath, file.content);

          // Atomic rename
          await fs.rename(tempPath, resolvedPath);

          Logger.debug(`Successfully wrote file`, {
            path: file.path,
            size: file.content.length,
          });

          return { path: file.path, success: true };
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          Logger.error(`Failed to write file`, {
            path: file.path,
            error: errorMessage,
          });
          return { path: file.path, success: false, error: errorMessage };
        }
      });

      const writeResults = await Promise.allSettled(writePromises);

      writeResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            path: files[index].path,
            success: false,
            error: String(result.reason),
          });
        }
      });

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      if (failureCount > 0) {
        Logger.warn(`Some files failed to write, rolling back`, {
          successful: successCount,
          failed: failureCount,
        });
        await this.rollback(
          files.map((f) => f.path),
          backupId
        );
        throw new Error(`${failureCount} files failed to write`);
      }

      // Commit changes by removing backup
      await this.commitChanges(backupId);

      Logger.info(`All files written successfully`, {
        fileCount: files.length,
      });

      return this.formatResults(results);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error(`File writing operation failed, attempting rollback`, {
        error: errorMessage,
      });

      try {
        await this.rollback(
          files.map((f) => f.path),
          backupId
        );
      } catch (rollbackError) {
        Logger.error(`Rollback failed`, { error: String(rollbackError) });
      }

      throw new Error(`File writing failed: ${errorMessage}`);
    }
  }

  private async createBackup(
    filePaths: string[],
    backupId: string
  ): Promise<void> {
    const backupPath = FileUtils.joinPath(this.backupDir, backupId);
    await FileUtils.ensureDir(backupPath);

    for (const filePath of filePaths) {
      const resolvedPath = FileUtils.resolvePath(filePath);
      const exists = await FileUtils.exists(resolvedPath);

      if (exists) {
        const backupFilePath = FileUtils.joinPath(
          backupPath,
          path.basename(filePath)
        );
        await FileUtils.copyFile(resolvedPath, backupFilePath);
      }
    }
  }

  private async rollback(filePaths: string[], backupId: string): Promise<void> {
    const backupPath = FileUtils.joinPath(this.backupDir, backupId);
    const backupExists = await FileUtils.exists(backupPath);

    if (!backupExists) {
      return;
    }

    for (const filePath of filePaths) {
      const resolvedPath = FileUtils.resolvePath(filePath);
      const backupFilePath = FileUtils.joinPath(
        backupPath,
        path.basename(filePath)
      );
      const backupFileExists = await FileUtils.exists(backupFilePath);

      if (backupFileExists) {
        await FileUtils.copyFile(backupFilePath, resolvedPath);
      }
    }

    await fs.remove(backupPath);
  }

  private async commitChanges(backupId: string): Promise<void> {
    const backupPath = FileUtils.joinPath(this.backupDir, backupId);
    const exists = await FileUtils.exists(backupPath);

    if (exists) {
      await fs.remove(backupPath);
    }
  }

  private generateBackupId(): string {
    return `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private formatResults(results: WriteResult[]): string {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    const summary = `File operation completed: ${successful.length}/${results.length} files written successfully`;

    const details = results
      .map((r) =>
        r.success
          ? `✅ ${r.path}`
          : `❌ ${r.path}: ${r.error || "Unknown error"}`
      )
      .join("\n");

    if (failed.length > 0) {
      return `${summary}\n\n❌ Errors:\n${failed.map((f) => `${f.path}: ${f.error}`).join("\n")}\n\n✅ Successful:\n${successful.map((s) => s.path).join("\n")}`;
    }

    return `${summary}\n\n✅ All files written successfully:\n${details}`;
  }

  private validateParams(params: unknown): FileWriterParams {
    try {
      return FileWriterSchema.parse(params);
    } catch (error) {
      throw new Error(
        `Invalid file writer parameters: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
