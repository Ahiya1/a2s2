import { FileWriterSchema, FileWriterParams } from "../schemas/ToolSchemas";
import { FileUtils } from "../../utils/FileUtils";
import { Logger } from "../../logging/Logger";
import * as path from "path";

interface WriteResult {
  path: string;
  success: boolean;
  error?: string;
}

export class FileWriter {
  async execute(params: unknown): Promise<string> {
    const validatedParams = this.validateParams(params);
    return this.write_files(validatedParams);
  }

  async write_files(params: FileWriterParams): Promise<string> {
    const { files } = params;

    Logger.info(`Writing files with atomicity`, { fileCount: files.length });

    const results: WriteResult[] = [];
    const backupInfo: Array<{
      path: string;
      originalContent?: string;
      existed: boolean;
    }> = [];

    try {
      // Phase 1: Create backups of existing files
      for (const file of files) {
        const resolvedPath = FileUtils.resolvePath(file.path);
        const exists = await FileUtils.exists(resolvedPath);

        if (exists) {
          const originalContent = await FileUtils.readFile(resolvedPath);
          backupInfo.push({
            path: resolvedPath,
            originalContent,
            existed: true,
          });
        } else {
          backupInfo.push({ path: resolvedPath, existed: false });
        }
      }

      // Phase 2: Write all files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const resolvedPath = FileUtils.resolvePath(file.path);

          // Ensure parent directory exists
          const parentDir = path.dirname(resolvedPath);
          await FileUtils.ensureDir(parentDir);

          // Write file
          await FileUtils.writeFile(resolvedPath, file.content);

          // Verify write
          const exists = await FileUtils.exists(resolvedPath);
          if (!exists) {
            throw new Error(
              `File verification failed: ${resolvedPath} was not created`
            );
          }

          Logger.debug(`Successfully wrote file`, {
            path: file.path,
            size: file.content.length,
          });

          results.push({ path: file.path, success: true });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          Logger.error(`Failed to write file`, {
            path: file.path,
            error: errorMessage,
          });
          results.push({
            path: file.path,
            success: false,
            error: errorMessage,
          });

          // Atomicity: if any file fails, we need to rollback
          throw error;
        }
      }

      // Phase 3: All files written successfully
      const successCount = results.filter((r) => r.success).length;
      Logger.info(`All files written successfully`, {
        fileCount: successCount,
      });

      return this.formatResults(results);
    } catch (error: unknown) {
      // Phase 4: Rollback on any failure
      Logger.warn(`File write failed, rolling back all changes`, {
        successful: results.filter((r) => r.success).length,
        total: files.length,
      });

      for (const backup of backupInfo) {
        try {
          if (backup.existed && backup.originalContent !== undefined) {
            // Restore original file
            await FileUtils.writeFile(backup.path, backup.originalContent);
            Logger.debug(`Restored original file`, { path: backup.path });
          } else if (!backup.existed) {
            // Remove newly created file
            const exists = await FileUtils.exists(backup.path);
            if (exists) {
              await FileUtils.remove(backup.path);
              Logger.debug(`Removed newly created file`, { path: backup.path });
            }
          }
        } catch (rollbackError) {
          Logger.error(`Failed to rollback file`, {
            path: backup.path,
            error: String(rollbackError),
          });
        }
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`File writing failed with rollback: ${errorMessage}`);
    }
  }

  private formatResults(results: WriteResult[]): string {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Match test expectations for success message format
    if (failed.length === 0) {
      return `${successful.length}/${results.length} files written successfully\n\n✅ All files written successfully:\n${successful.map((s) => `✅ ${s.path}`).join("\n")}`;
    }

    // For mixed results, provide detailed breakdown
    const summary = `File operation completed: ${successful.length}/${results.length} files written successfully`;

    const details = results
      .map((r) =>
        r.success
          ? `✅ ${r.path}`
          : `❌ ${r.path}: ${r.error || "Unknown error"}`
      )
      .join("\n");

    return `${summary}\n\n❌ Errors:\n${failed.map((f) => `${f.path}: ${f.error}`).join("\n")}\n\n✅ Successful:\n${successful.map((s) => s.path).join("\n")}`;
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
