export class OutputFormatter {
  private static readonly COLORS = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
  };

  static formatHeader(title: string): void {
    const line = "=".repeat(Math.max(60, title.length + 4));
    console.log();
    console.log(this.colorize("cyan", line));
    console.log(this.colorize("cyan", `  ${title}`));
    console.log(this.colorize("cyan", line));
    console.log();
  }

  static formatSection(title: string): void {
    const line = "-".repeat(Math.max(40, title.length + 2));
    console.log();
    console.log(this.colorize("blue", line));
    console.log(this.colorize("blue", ` ${title}`));
    console.log(this.colorize("blue", line));
  }

  static formatSuccess(message: string): void {
    console.log(this.colorize("green", `✅ ${message}`));
  }

  static formatError(message: string): void {
    console.log(this.colorize("red", `❌ ${message}`));
  }

  static formatWarning(message: string): void {
    console.log(this.colorize("yellow", `⚠️  ${message}`));
  }

  static formatInfo(message: string): void {
    console.log(this.colorize("blue", `ℹ️  ${message}`));
  }

  static formatDuration(startTime: number): void {
    const duration = Date.now() - startTime;
    const seconds = (duration / 1000).toFixed(2);
    console.log();
    console.log(this.colorize("dim", `⏱️  Duration: ${seconds}s`));
  }

  static formatList(items: string[], title?: string): void {
    if (title) {
      console.log(this.colorize("bright", title));
    }
    items.forEach((item) => {
      console.log(`  • ${item}`);
    });
  }

  // FIXED: Add missing formatFileList method (alias to formatList)
  static formatFileList(items: string[], title?: string): void {
    this.formatList(items, title);
  }

  // FIXED: Add missing formatToolResult method
  static formatToolResult(toolName: string, result: string): void {
    this.formatSection(`${toolName} Result`);
    console.log(result);
  }

  // FIXED: Add missing formatValidationResult method
  static formatValidationResult(toolName: string, isValid: boolean): void {
    if (isValid) {
      console.log(this.colorize("green", `✅ ${toolName}: Valid`));
    } else {
      console.log(this.colorize("red", `❌ ${toolName}: Invalid`));
    }
  }

  static formatKeyValue(key: string, value: string | number | boolean): void {
    console.log(`  ${this.colorize("bright", key)}: ${value}`);
  }

  static formatProgress(
    current: number,
    total: number,
    description?: string
  ): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(current, total);
    const desc = description ? ` ${description}` : "";
    console.log(`${progressBar} ${percentage}%${desc}`);
  }

  static formatTable(headers: string[], rows: string[][]): void {
    if (rows.length === 0) {
      console.log(this.colorize("dim", "No data to display"));
      return;
    }

    // Calculate column widths
    const widths = headers.map((header, i) => {
      const maxRowWidth = Math.max(...rows.map((row) => (row[i] || "").length));
      return Math.max(header.length, maxRowWidth);
    });

    // Print header
    const headerLine = headers
      .map((header, i) => header.padEnd(widths[i]))
      .join(" | ");
    console.log(this.colorize("bright", headerLine));

    // Print separator
    const separator = widths.map((width) => "-".repeat(width)).join("-|-");
    console.log(this.colorize("dim", separator));

    // Print rows
    rows.forEach((row) => {
      const rowLine = row
        .map((cell, i) => (cell || "").padEnd(widths[i]))
        .join(" | ");
      console.log(rowLine);
    });
  }

  static createProgressBar(
    current: number,
    total: number,
    width: number = 20
  ): string {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    return `[${this.colorize("green", bar)}]`;
  }

  static colorize(
    color: keyof typeof OutputFormatter.COLORS,
    text: string
  ): string {
    // Skip coloring in test environment or when NO_COLOR is set
    if (process.env.NODE_ENV === "test" || process.env.NO_COLOR) {
      return text;
    }

    return `${this.COLORS[color]}${text}${this.COLORS.reset}`;
  }

  static clearLine(): void {
    if (process.stdout.isTTY) {
      process.stdout.write("\r\x1b[K");
    }
  }

  static newLine(): void {
    console.log();
  }

  static hr(char: string = "-", length: number = 60): void {
    console.log(this.colorize("dim", char.repeat(length)));
  }

  // Utility methods for complex formatting
  static formatMultiColumn(items: string[], columns: number = 3): void {
    const itemsPerColumn = Math.ceil(items.length / columns);

    for (let row = 0; row < itemsPerColumn; row++) {
      const rowItems = [];
      for (let col = 0; col < columns; col++) {
        const index = col * itemsPerColumn + row;
        if (index < items.length) {
          rowItems.push(items[index].padEnd(20));
        }
      }
      if (rowItems.length > 0) {
        console.log(rowItems.join(""));
      }
    }
  }

  static formatJson(obj: any, indent: number = 2): void {
    const json = JSON.stringify(obj, null, indent);
    console.log(this.colorize("dim", json));
  }

  static formatCode(code: string, language?: string): void {
    if (language) {
      console.log(this.colorize("dim", `\`\`\`${language}`));
    }
    console.log(this.colorize("white", code));
    if (language) {
      console.log(this.colorize("dim", "```"));
    }
  }

  // Spinner utility (simple text-based)
  static createSpinner(message: string): {
    start: () => void;
    stop: (finalMessage?: string) => void;
  } {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frameIndex = 0;
    let interval: NodeJS.Timeout | null = null;

    return {
      start: () => {
        if (process.env.NODE_ENV === "test") return; // Skip in tests

        interval = setInterval(() => {
          this.clearLine();
          const frame = frames[frameIndex % frames.length];
          process.stdout.write(`${frame} ${message}`);
          frameIndex++;
        }, 100);
      },
      stop: (finalMessage?: string) => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        this.clearLine();
        if (finalMessage) {
          console.log(finalMessage);
        }
      },
    };
  }
}
