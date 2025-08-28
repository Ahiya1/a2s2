import { FileReaderSchema, FileReaderParams } from "../schemas/ToolSchemas";
import { FileUtils } from "../../utils/FileUtils";
import { Logger } from "../../logging/Logger";
import { ConfigManager } from "../../config/ConfigManager";

export class FileReader {
  async execute(params: unknown): Promise<string> {
    const validatedParams = this.validateParams(params);
    return this.read_files(validatedParams);
  }

  async read_files(params: FileReaderParams): Promise<string> {
    const { paths } = params;
    const config = ConfigManager.getConfig();

    Logger.info(`Reading files`, { fileCount: paths.length, files: paths });

    const results: string[] = [];

    // Process files with Promise.allSettled for resilience
    const readPromises = paths.map(async (filePath: string) => {
      try {
        const resolvedPath = FileUtils.resolvePath(filePath);
        const exists = await FileUtils.exists(resolvedPath);

        if (!exists) {
          return `=== ${filePath} ===\n[Error: File not found]\n`;
        }

        const content = await FileUtils.readFile(resolvedPath);

        // Check file size limit
        if (content.length > config.maxFileSize) {
          const truncated = content.substring(0, config.maxFileSize);
          return `=== ${filePath} ===\n${truncated}\n[Truncated: File size exceeded ${config.maxFileSize} bytes]\n`;
        }

        Logger.debug(`Successfully read file`, {
          path: filePath,
          size: content.length,
        });
        return `=== ${filePath} ===\n${content}\n`;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to read file`, {
          path: filePath,
          error: errorMessage,
        });
        return `=== ${filePath} ===\n[Error: ${errorMessage}]\n`;
      }
    });

    const readResults = await Promise.allSettled(readPromises);

    readResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        const filePath = paths[index];
        results.push(`=== ${filePath} ===\n[Error: ${result.reason}]\n`);
      }
    });

    const successCount = results.filter((r) => !r.includes("[Error:")).length;
    Logger.info(`File reading completed`, {
      total: paths.length,
      successful: successCount,
      failed: paths.length - successCount,
    });

    return results.join("\n");
  }

  private validateParams(params: unknown): FileReaderParams {
    try {
      return FileReaderSchema.parse(params);
    } catch (error) {
      throw new Error(
        `Invalid file reader parameters: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
