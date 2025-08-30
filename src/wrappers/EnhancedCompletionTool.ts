import {
  CompletionTool,
  CompletionReport,
} from "../tools/autonomy/CompletionTool";
import { Tool } from "../tools/ToolManager";
import { ConversationDAO } from "../database/ConversationDAO";
import { DatabaseConfigManager } from "../config/DatabaseConfig";
import { ConversationEventEmitter } from "../events/ConversationEventEmitter";
import { Logger } from "../logging/Logger";

export interface EnhancedCompletionConfig {
  enableDatabasePersistence: boolean;
  enableAnalytics: boolean;
  enableEventEmission: boolean;
  trackCompletionPatterns: boolean;
  saveCompletionHistory: boolean;
}

export interface CompletionAnalytics {
  totalCompletions: number;
  successRate: number;
  averageFilesCreated: number;
  averageFilesModified: number;
  averageTestsRun: number;
  commonPatterns: {
    summaryKeywords: Record<string, number>;
    frequentNextSteps: string[];
    mostCommonFileTypes: string[];
  };
  timeDistribution: {
    totalTime: number;
    averageTime: number;
    completionsByHour: Record<number, number>;
  };
}

export interface CompletionHistoryEntry {
  id: string;
  sessionId?: string;
  timestamp: Date;
  report: CompletionReport;
  context: {
    workingDirectory: string;
    iterationCount?: number;
    totalCost?: number;
    phaseDuration?: number;
  };
  analytics: {
    processingTime: number;
    callbackCount: number;
  };
}

/**
 * EnhancedCompletionTool wraps CompletionTool with database persistence capabilities.
 *
 * This maintains complete backward compatibility - existing CompletionTool usage continues
 * unchanged. Database persistence is only enabled when explicitly configured.
 *
 * Key features:
 * - Records completion reports for historical analysis
 * - Tracks completion patterns and success rates
 * - Maintains existing callback system
 * - Zero interface changes
 */
export class EnhancedCompletionTool implements Tool {
  private baseTool: CompletionTool;
  private conversationDAO: ConversationDAO;
  private dbConfigManager: DatabaseConfigManager;
  private eventEmitter?: ConversationEventEmitter;
  private config: EnhancedCompletionConfig;

  // Analytics and history
  private completionHistory: CompletionHistoryEntry[] = [];
  private analytics: CompletionAnalytics;
  private currentSessionId?: string;

  constructor(
    config: Partial<EnhancedCompletionConfig> = {},
    eventEmitter?: ConversationEventEmitter
  ) {
    this.baseTool = new CompletionTool();
    this.conversationDAO = new ConversationDAO();
    this.dbConfigManager = DatabaseConfigManager.getInstance();
    this.eventEmitter = eventEmitter;

    this.config = {
      enableDatabasePersistence: this.dbConfigManager.isEnabled(),
      enableAnalytics: true,
      enableEventEmission: true,
      trackCompletionPatterns: true,
      saveCompletionHistory: true,
      ...config,
    };

    this.analytics = this.initializeAnalytics();

    // Wrap the base tool's completion callbacks
    this.setupCallbackWrapping();

    Logger.debug("EnhancedCompletionTool initialized", {
      config: this.config,
      databaseEnabled: this.dbConfigManager.isEnabled(),
    });
  }

  // Tool interface - delegates to base tool
  get name(): string {
    return this.baseTool.name;
  }

  get description(): string {
    return this.baseTool.description;
  }

  get schema(): any {
    return this.baseTool.schema;
  }

  async execute(params: unknown): Promise<string> {
    const startTime = Date.now();

    try {
      // Execute the base tool
      const result = await this.baseTool.execute(params);

      // Extract completion report from result
      const report = this.extractCompletionReport(result);

      // Enhanced processing
      if (report) {
        await this.processCompletion(report, {
          processingTime: Date.now() - startTime,
          callbackCount: this.getCallbackCount(),
        });
      }

      Logger.debug("Enhanced completion tool executed successfully", {
        sessionId: this.currentSessionId,
        success: report?.success,
        processingTime: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      Logger.error("Enhanced completion tool execution failed", {
        sessionId: this.currentSessionId,
        error: error instanceof Error ? error.message : String(error),
        processingTime: Date.now() - startTime,
      });

      // Still track failed attempts for analytics
      if (this.config.enableAnalytics) {
        this.updateFailureAnalytics();
      }

      throw error;
    }
  }

  private setupCallbackWrapping(): void {
    // Get access to original callbacks to maintain compatibility
    const originalCallbacks = (this.baseTool as any).completionCallbacks || [];

    // Add our enhanced callback that wraps the originals
    this.baseTool.onCompletion(async (report: CompletionReport) => {
      await this.handleCompletionCallback(report);
    });
  }

  private async handleCompletionCallback(
    report: CompletionReport
  ): Promise<void> {
    try {
      // Process the completion with enhanced features
      await this.processCompletion(report, {
        processingTime: 0, // Callback doesn't track processing time
        callbackCount: this.getCallbackCount(),
      });
    } catch (error) {
      Logger.error("Enhanced completion callback failed", {
        sessionId: this.currentSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async processCompletion(
    report: CompletionReport,
    metadata: { processingTime: number; callbackCount: number }
  ): Promise<void> {
    const historyEntry: CompletionHistoryEntry = {
      id: this.generateCompletionId(),
      sessionId: this.currentSessionId,
      timestamp: new Date(),
      report,
      context: {
        workingDirectory: process.cwd(),
        // These would be injected from session context in real implementation
        iterationCount: undefined,
        totalCost: undefined,
        phaseDuration: undefined,
      },
      analytics: metadata,
    };

    // Add to history if enabled
    if (this.config.saveCompletionHistory) {
      this.completionHistory.push(historyEntry);
      this.maintainHistorySize();
    }

    // Update analytics
    if (this.config.enableAnalytics) {
      this.updateAnalytics(historyEntry);
    }

    // Save to database if enabled
    if (this.config.enableDatabasePersistence) {
      await this.saveToDatabase(historyEntry);
    }

    // Emit events if enabled
    if (
      this.config.enableEventEmission &&
      this.eventEmitter &&
      this.currentSessionId
    ) {
      this.eventEmitter.emitValidation(this.currentSessionId, {
        validationType: "completion_report",
        result: report.success ? "passed" : "failed",
        message: `Task completion: ${report.summary}`,
        details: {
          filesCreated: report.filesCreated,
          filesModified: report.filesModified,
          testsRun: report.testsRun,
          validationResults: report.validationResults,
          nextSteps: report.nextSteps,
        },
      });
    }

    Logger.debug("Completion processed with enhancements", {
      completionId: historyEntry.id,
      sessionId: this.currentSessionId,
      success: report.success,
      filesCreated: report.filesCreated?.length || 0,
      filesModified: report.filesModified?.length || 0,
    });
  }

  private extractCompletionReport(result: string): CompletionReport | null {
    try {
      // The result is formatted text, we need to parse it back to a report
      // This is a simplified approach - in practice you might store the original report

      const lines = result.split("\n");

      // Extract summary
      const summaryLine = lines.find((line) => line.includes("📋 Summary:"));
      const summary = summaryLine
        ? summaryLine.replace("📋 Summary: ", "")
        : "";

      // Extract files created
      const filesCreated: string[] = [];
      let inFilesCreated = false;

      // Extract files modified
      const filesModified: string[] = [];
      let inFilesModified = false;

      // Extract tests run
      const testsRun: string[] = [];
      let inTestsRun = false;

      // Extract validation results
      const validationResults: string[] = [];
      let inValidationResults = false;

      // Extract next steps
      const nextSteps: string[] = [];
      let inNextSteps = false;

      // Parse success status
      const success = !result.includes("⚠️  Task completed with issues");

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === "📄 Files Created:") {
          inFilesCreated = true;
          continue;
        } else if (trimmed === "✏️  Files Modified:") {
          inFilesModified = true;
          inFilesCreated = false;
          continue;
        } else if (trimmed === "🧪 Tests Executed:") {
          inTestsRun = true;
          inFilesModified = false;
          continue;
        } else if (trimmed === "✓ Validation Results:") {
          inValidationResults = true;
          inTestsRun = false;
          continue;
        } else if (trimmed === "👉 Suggested Next Steps:") {
          inNextSteps = true;
          inValidationResults = false;
          continue;
        } else if (trimmed === "" || !trimmed.startsWith("  •")) {
          // Reset all flags when we hit a section break
          inFilesCreated =
            inFilesModified =
            inTestsRun =
            inValidationResults =
            inNextSteps =
              false;
        }

        // Collect items from current section
        if (trimmed.startsWith("  • ")) {
          const item = trimmed.replace("  • ", "");

          if (inFilesCreated) filesCreated.push(item);
          else if (inFilesModified) filesModified.push(item);
          else if (inTestsRun) testsRun.push(item);
          else if (inValidationResults) validationResults.push(item);
          else if (inNextSteps) nextSteps.push(item);
        }
      }

      if (!summary) {
        return null; // Couldn't extract a valid report
      }

      return {
        summary,
        filesCreated,
        filesModified,
        testsRun,
        validationResults,
        success,
        nextSteps,
      };
    } catch (error) {
      Logger.warn("Failed to extract completion report from result", {
        error: error instanceof Error ? error.message : String(error),
        resultLength: result.length,
      });
      return null;
    }
  }

  private async saveToDatabase(entry: CompletionHistoryEntry): Promise<void> {
    try {
      // Save completion report to database
      // In a real implementation, this would use a dedicated completion reports table
      Logger.debug("Saving completion report to database", {
        completionId: entry.id,
        sessionId: entry.sessionId,
      });

      // Placeholder for actual database save
      // await this.conversationDAO.saveCompletionReport(entry);
    } catch (error) {
      Logger.error("Failed to save completion report to database", {
        completionId: entry.id,
        sessionId: entry.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private initializeAnalytics(): CompletionAnalytics {
    return {
      totalCompletions: 0,
      successRate: 0,
      averageFilesCreated: 0,
      averageFilesModified: 0,
      averageTestsRun: 0,
      commonPatterns: {
        summaryKeywords: {},
        frequentNextSteps: [],
        mostCommonFileTypes: [],
      },
      timeDistribution: {
        totalTime: 0,
        averageTime: 0,
        completionsByHour: {},
      },
    };
  }

  private updateAnalytics(entry: CompletionHistoryEntry): void {
    const report = entry.report;

    this.analytics.totalCompletions++;

    // Update success rate
    const successfulCompletions = this.completionHistory.filter(
      (e) => e.report.success
    ).length;
    this.analytics.successRate =
      successfulCompletions / this.analytics.totalCompletions;

    // Update averages
    this.analytics.averageFilesCreated =
      (this.analytics.averageFilesCreated *
        (this.analytics.totalCompletions - 1) +
        (report.filesCreated?.length || 0)) /
      this.analytics.totalCompletions;

    this.analytics.averageFilesModified =
      (this.analytics.averageFilesModified *
        (this.analytics.totalCompletions - 1) +
        (report.filesModified?.length || 0)) /
      this.analytics.totalCompletions;

    this.analytics.averageTestsRun =
      (this.analytics.averageTestsRun * (this.analytics.totalCompletions - 1) +
        (report.testsRun?.length || 0)) /
      this.analytics.totalCompletions;

    // Update time distribution
    const hour = entry.timestamp.getHours();
    this.analytics.timeDistribution.completionsByHour[hour] =
      (this.analytics.timeDistribution.completionsByHour[hour] || 0) + 1;

    // Update common patterns if enabled
    if (this.config.trackCompletionPatterns) {
      this.updatePatternAnalytics(report);
    }
  }

  private updatePatternAnalytics(report: CompletionReport): void {
    // Extract keywords from summary
    const words = report.summary
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(" ")
      .filter((word) => word.length > 3);

    words.forEach((word) => {
      this.analytics.commonPatterns.summaryKeywords[word] =
        (this.analytics.commonPatterns.summaryKeywords[word] || 0) + 1;
    });

    // Track next steps
    if (report.nextSteps) {
      report.nextSteps.forEach((step) => {
        if (!this.analytics.commonPatterns.frequentNextSteps.includes(step)) {
          this.analytics.commonPatterns.frequentNextSteps.push(step);
        }
      });
    }

    // Track file types
    const allFiles = [
      ...(report.filesCreated || []),
      ...(report.filesModified || []),
    ];
    allFiles.forEach((filePath) => {
      const extension = filePath.split(".").pop()?.toLowerCase();
      if (extension) {
        if (
          !this.analytics.commonPatterns.mostCommonFileTypes.includes(extension)
        ) {
          this.analytics.commonPatterns.mostCommonFileTypes.push(extension);
        }
      }
    });
  }

  private updateFailureAnalytics(): void {
    // Track failed completion attempts
    this.analytics.totalCompletions++;

    const successfulCompletions = this.completionHistory.filter(
      (e) => e.report.success
    ).length;
    this.analytics.successRate =
      successfulCompletions / this.analytics.totalCompletions;
  }

  private maintainHistorySize(): void {
    // Keep only recent completions to prevent memory issues
    const maxHistorySize = 1000;

    if (this.completionHistory.length > maxHistorySize) {
      this.completionHistory = this.completionHistory.slice(-maxHistorySize);
    }
  }

  private generateCompletionId(): string {
    return `completion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCallbackCount(): number {
    // Access callback count from base tool
    const callbacks = (this.baseTool as any).completionCallbacks || [];
    return callbacks.length;
  }

  // Delegate all CompletionTool methods to maintain compatibility
  onCompletion(callback: (report: CompletionReport) => void): void {
    this.baseTool.onCompletion(callback);
  }

  removeCompletionCallback(callback: (report: CompletionReport) => void): void {
    this.baseTool.removeCompletionCallback(callback);
  }

  getExecutionStats(): any {
    return this.baseTool.getExecutionStats();
  }

  // Enhanced API
  getCompletionHistory(): Readonly<CompletionHistoryEntry[]> {
    return [...this.completionHistory];
  }

  getAnalytics(): Readonly<CompletionAnalytics> {
    return { ...this.analytics };
  }

  getConfig(): Readonly<EnhancedCompletionConfig> {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<EnhancedCompletionConfig>): void {
    this.config = { ...this.config, ...newConfig };

    Logger.debug("Enhanced completion tool configuration updated", {
      config: this.config,
    });
  }

  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  clearSessionId(): void {
    this.currentSessionId = undefined;
  }

  setEventEmitter(eventEmitter: ConversationEventEmitter): void {
    this.eventEmitter = eventEmitter;
  }

  // Pattern analysis methods
  getMostCommonSummaryKeywords(
    limit: number = 10
  ): Array<{ word: string; count: number }> {
    return Object.entries(this.analytics.commonPatterns.summaryKeywords)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  }

  getCompletionTrends(): {
    successTrend: number;
    averageFilesCreatedTrend: number;
    completionFrequency: Record<string, number>;
  } {
    const recentCompletions = this.completionHistory.slice(-50); // Last 50 completions
    const olderCompletions = this.completionHistory.slice(-100, -50); // Previous 50

    // Calculate trends
    const recentSuccessRate =
      recentCompletions.filter((e) => e.report.success).length /
      recentCompletions.length;
    const olderSuccessRate =
      olderCompletions.filter((e) => e.report.success).length /
      olderCompletions.length;
    const successTrend = recentSuccessRate - olderSuccessRate;

    const recentAvgFiles =
      recentCompletions.reduce(
        (sum, e) => sum + (e.report.filesCreated?.length || 0),
        0
      ) / recentCompletions.length;
    const olderAvgFiles =
      olderCompletions.reduce(
        (sum, e) => sum + (e.report.filesCreated?.length || 0),
        0
      ) / olderCompletions.length;
    const averageFilesCreatedTrend = recentAvgFiles - olderAvgFiles;

    // Completion frequency by day of week
    const completionFrequency: Record<string, number> = {};
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    this.completionHistory.forEach((entry) => {
      const dayName = dayNames[entry.timestamp.getDay()];
      completionFrequency[dayName] = (completionFrequency[dayName] || 0) + 1;
    });

    return {
      successTrend,
      averageFilesCreatedTrend,
      completionFrequency,
    };
  }

  // Export data for external analysis
  exportCompletionData(): {
    analytics: CompletionAnalytics;
    history: CompletionHistoryEntry[];
    trends: any;
    config: EnhancedCompletionConfig;
  } {
    return {
      analytics: this.getAnalytics(),
      // FIXED: Fix readonly array issue by creating mutable copy
      history: [...this.getCompletionHistory()],
      trends: this.getCompletionTrends(),
      config: this.getConfig(),
    };
  }

  // Reset analytics (useful for testing or new projects)
  resetAnalytics(): void {
    this.analytics = this.initializeAnalytics();
    this.completionHistory = [];

    Logger.debug("Enhanced completion tool analytics reset");
  }

  // Static utilities
  static validateCompletionReport(report: unknown): {
    isValid: boolean;
    errors: string[];
  } {
    return CompletionTool.validateCompletionReport(report);
  }

  static createCompletionReport(
    summary: string,
    options: Partial<CompletionReport> = {}
  ): CompletionReport {
    return CompletionTool.createCompletionReport(summary, options);
  }

  static isCompletionTool(toolName: string): boolean {
    return CompletionTool.isCompletionTool(toolName);
  }

  // Factory methods
  static create(
    config?: Partial<EnhancedCompletionConfig>,
    eventEmitter?: ConversationEventEmitter
  ): EnhancedCompletionTool {
    return new EnhancedCompletionTool(config, eventEmitter);
  }

  static createWithDefaults(): EnhancedCompletionTool {
    return new EnhancedCompletionTool();
  }
}
