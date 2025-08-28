import { Tool } from "../ToolManager";
import { ParameterParser } from "../enhanced/ParameterParser";
import { Logger } from "../../logging/Logger";
import { z } from "zod";

export interface CompletionReport {
  summary: string;
  filesCreated: string[];
  filesModified: string[];
  testsRun: string[];
  validationResults: string[];
  duration?: number;
  success: boolean;
  nextSteps?: string[];
}

// FIXED: Enhanced transform to handle null inputs properly
const CompletionSchema = z
  .object({
    summary: z.string().min(10, "Summary must be at least 10 characters"),
    filesCreated: z.array(z.string()).optional().default([]),
    filesModified: z.array(z.string()).optional().default([]),
    testsRun: z.array(z.string()).optional().default([]),
    validationResults: z.array(z.string()).optional().default([]),
    success: z.boolean().optional().default(true),
    nextSteps: z.array(z.string()).optional().default([]),
  })
  .transform((data) => {
    // FIXED: Comprehensive null/undefined array handling
    const safeArray = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value.filter((item) => typeof item === "string");
      }
      return [];
    };

    return {
      ...data,
      filesCreated: safeArray(data.filesCreated),
      filesModified: safeArray(data.filesModified),
      testsRun: safeArray(data.testsRun),
      validationResults: safeArray(data.validationResults),
      nextSteps: safeArray(data.nextSteps),
    };
  });

export class CompletionTool implements Tool {
  name = "report_complete";
  description =
    "Signal that the agent has completed its assigned task with a comprehensive report";

  schema = {
    type: "object" as const,
    properties: {
      summary: {
        type: "string" as const,
        description: "A clear summary of what was accomplished",
      },
      filesCreated: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "List of files that were created during the task",
      },
      filesModified: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "List of files that were modified during the task",
      },
      testsRun: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "List of tests or validation steps that were executed",
      },
      validationResults: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Results of validation steps performed",
      },
      success: {
        type: "boolean" as const,
        description: "Whether the task was completed successfully",
      },
      nextSteps: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Optional suggestions for follow-up work",
      },
    },
    required: ["summary"],
  };

  private completionCallbacks: Array<(report: CompletionReport) => void> = [];

  async execute(params: unknown): Promise<string> {
    Logger.info("Agent reporting task completion", { params });

    // Parse parameters robustly
    const parseResult = ParameterParser.parseObject(params, CompletionSchema);

    if (!parseResult.success) {
      const errorMsg = `Invalid completion parameters: ${parseResult.error}`;
      Logger.error(errorMsg, { originalParams: params });
      throw new Error(errorMsg);
    }

    const report: CompletionReport = parseResult.data as CompletionReport;

    // Log completion details
    Logger.info("Task completion report received", {
      summary: report.summary,
      filesCreated: report.filesCreated?.length || 0,
      filesModified: report.filesModified?.length || 0,
      testsRun: report.testsRun?.length || 0,
      success: report.success,
    });

    // Execute completion callbacks
    for (const callback of this.completionCallbacks) {
      try {
        callback(report);
      } catch (error) {
        Logger.error("Completion callback failed", {
          error: (error as Error).message,
        });
      }
    }

    // Store completion report for retrieval
    this.storeCompletionReport(report);

    // Format completion message
    const completionMessage = this.formatCompletionMessage(report);

    Logger.info("Agent task completion processed successfully");
    return completionMessage;
  }

  private formatCompletionMessage(report: CompletionReport): string {
    const lines = ["✅ TASK COMPLETED", "", `📋 Summary: ${report.summary}`];

    if (report.filesCreated && report.filesCreated.length > 0) {
      lines.push("");
      lines.push("📄 Files Created:");
      report.filesCreated.forEach((file) => lines.push(`  • ${file}`));
    }

    if (report.filesModified && report.filesModified.length > 0) {
      lines.push("");
      lines.push("✏️  Files Modified:");
      report.filesModified.forEach((file) => lines.push(`  • ${file}`));
    }

    if (report.testsRun && report.testsRun.length > 0) {
      lines.push("");
      lines.push("🧪 Tests Executed:");
      report.testsRun.forEach((test) => lines.push(`  • ${test}`));
    }

    if (report.validationResults && report.validationResults.length > 0) {
      lines.push("");
      lines.push("✓ Validation Results:");
      report.validationResults.forEach((result) => lines.push(`  • ${result}`));
    }

    if (!report.success) {
      lines.push("");
      lines.push("⚠️  Task completed with issues - see summary for details");
    }

    if (report.nextSteps && report.nextSteps.length > 0) {
      lines.push("");
      lines.push("👉 Suggested Next Steps:");
      report.nextSteps.forEach((step) => lines.push(`  • ${step}`));
    }

    lines.push("");
    lines.push("🔄 Agent execution will now terminate.");

    return lines.join("\n");
  }

  private storeCompletionReport(report: CompletionReport): void {
    try {
      // Store in a simple way for now - could be enhanced with database storage
      const reportData = {
        ...report,
        timestamp: new Date().toISOString(),
        agentId: process.env.AGENT_ID || "unknown",
      };

      // Log for debugging and potential retrieval
      Logger.info("Completion report stored", { report: reportData });

      // Could add file-based or database storage here
      // For now, the report is available in logs and callbacks
    } catch (error) {
      Logger.error("Failed to store completion report", {
        error: (error as Error).message,
      });
    }
  }

  // Event system for handling completion
  onCompletion(callback: (report: CompletionReport) => void): void {
    this.completionCallbacks.push(callback);
  }

  removeCompletionCallback(callback: (report: CompletionReport) => void): void {
    const index = this.completionCallbacks.indexOf(callback);
    if (index > -1) {
      this.completionCallbacks.splice(index, 1);
    }
  }

  // Utility methods
  static isCompletionTool(toolName: string): boolean {
    return toolName === "report_complete" || toolName === "task_complete";
  }

  static validateCompletionReport(report: unknown): {
    isValid: boolean;
    errors: string[];
  } {
    const result = CompletionSchema.safeParse(report);

    if (result.success) {
      return { isValid: true, errors: [] };
    }

    const errors = result.error.errors.map(
      (err) => `${err.path.join(".")}: ${err.message}`
    );

    return { isValid: false, errors };
  }

  // Factory method for creating standardized completion reports
  static createCompletionReport(
    summary: string,
    options: Partial<CompletionReport> = {}
  ): CompletionReport {
    return {
      summary,
      filesCreated: options.filesCreated || [],
      filesModified: options.filesModified || [],
      testsRun: options.testsRun || [],
      validationResults: options.validationResults || [],
      success: options.success !== false, // Default to true unless explicitly false
      nextSteps: options.nextSteps || [],
      duration: options.duration,
    };
  }

  // Debug method
  getExecutionStats(): {
    totalCompletions: number;
    callbackCount: number;
    lastCompletion?: Date;
  } {
    return {
      totalCompletions: this.completionCallbacks.length, // Rough approximation
      callbackCount: this.completionCallbacks.length,
      lastCompletion: new Date(), // Would track actual last completion in real implementation
    };
  }
}
