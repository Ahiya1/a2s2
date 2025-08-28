import { FileUtils } from "../../utils/FileUtils";
import { Logger } from "../../logging/Logger";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class FileValidator {
  async validateFilePath(filePath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      const resolvedPath = FileUtils.resolvePath(filePath);

      // Check if path contains dangerous patterns
      if (this.containsDangerousPatterns(resolvedPath)) {
        result.errors.push(
          `File path contains potentially dangerous patterns: ${filePath}`
        );
        result.isValid = false;
      }

      // Check if file exists
      const exists = await FileUtils.exists(resolvedPath);
      if (!exists) {
        result.warnings.push(`File does not exist: ${filePath}`);
      }

      return result;
    } catch (error) {
      result.errors.push(
        `Error validating file path: ${error instanceof Error ? error.message : String(error)}`
      );
      result.isValid = false;
      return result;
    }
  }

  async validateMultipleFiles(filePaths: string[]): Promise<ValidationResult> {
    const overallResult: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    for (const filePath of filePaths) {
      const result = await this.validateFilePath(filePath);
      overallResult.errors.push(...result.errors);
      overallResult.warnings.push(...result.warnings);

      if (!result.isValid) {
        overallResult.isValid = false;
      }
    }

    return overallResult;
  }

  private containsDangerousPatterns(filePath: string): boolean {
    const dangerousPatterns = [
      "../",
      "..\\",
      "/etc/",
      "/var/",
      "/usr/",
      "/sys/",
      "/proc/",
      "C:\\Windows\\",
      "C:\\System32\\",
    ];

    return dangerousPatterns.some((pattern) => filePath.includes(pattern));
  }

  validateFileContent(content: string, maxSize: number): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (content.length > maxSize) {
      result.errors.push(
        `Content size ${content.length} exceeds maximum allowed size ${maxSize}`
      );
      result.isValid = false;
    }

    if (content.length === 0) {
      result.warnings.push("File content is empty");
    }

    return result;
  }
}
