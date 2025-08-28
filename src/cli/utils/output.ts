import { Logger } from "../../logging/Logger";

export class OutputFormatter {
  static formatSuccess(message: string): void {
    console.log(`✅ ${message}`);
    Logger.info(message);
  }

  static formatError(message: string): void {
    console.error(`❌ ${message}`);
    Logger.error(message);
  }

  static formatWarning(message: string): void {
    console.warn(`⚠️  ${message}`);
    Logger.warn(message);
  }

  static formatInfo(message: string): void {
    console.log(`ℹ️  ${message}`);
    Logger.info(message);
  }

  static formatHeader(title: string): void {
    console.log(`\n🔧 ${title}`);
    console.log("=".repeat(title.length + 3));
  }

  static formatSection(title: string): void {
    console.log(`\n📋 ${title}`);
    console.log("-".repeat(title.length + 3));
  }

  static formatToolResult(toolName: string, result: string): void {
    this.formatSection(`${toolName} Result`);
    console.log(result);
  }

  static formatValidationResult(
    toolName: string,
    isValid: boolean,
    details?: string
  ): void {
    if (isValid) {
      this.formatSuccess(`${toolName}: Valid`);
    } else {
      this.formatError(`${toolName}: Invalid`);
      if (details) {
        console.log(details);
      }
    }
  }

  static formatFileList(files: string[]): void {
    files.forEach((file) => {
      console.log(`  📄 ${file}`);
    });
  }

  static formatDuration(startTime: number): void {
    const duration = Date.now() - startTime;
    const seconds = (duration / 1000).toFixed(2);
    this.formatInfo(`Completed in ${seconds}s`);
  }
}
