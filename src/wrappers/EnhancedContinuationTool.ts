import {
  ContinuationTool,
  ContinuationPlan,
} from "../tools/autonomy/ContinuationTool";
import { Tool } from "../tools/ToolManager";
import { ConversationDAO } from "../database/ConversationDAO";
import { DatabaseConfigManager } from "../config/DatabaseConfig";
import { ConversationEventEmitter } from "../events/ConversationEventEmitter";
import { Logger } from "../logging/Logger";

export interface EnhancedContinuationConfig {
  enableDatabasePersistence: boolean;
  enableAnalytics: boolean;
  enableEventEmission: boolean;
  trackContinuationPatterns: boolean;
  saveContinuationHistory: boolean;
  enableCycleDetection: boolean;
  enableStuckDetection: boolean;
}

export interface ContinuationAnalytics {
  totalContinuations: number;
  averageActionsPerSession: number;
  riskPatternFrequency: Record<string, number>;
  actionPatternFrequency: Record<string, number>;
  estimatedDurationAccuracy: {
    averageEstimated: number;
    averageActual: number;
    accuracyRate: number;
  };
  cycleDetection: {
    cyclesDetected: number;
    averageCycleLength: number;
    mostCommonCyclePatterns: string[];
  };
  userInputRequiredRate: number;
  riskLevels: {
    low: number;
    medium: number;
    high: number;
  };
}

export interface ContinuationHistoryEntry {
  id: string;
  sessionId?: string;
  timestamp: Date;
  plan: ContinuationPlan;
  context: {
    workingDirectory: string;
    currentPhase?: string;
    iterationCount?: number;
    previousAction?: string;
  };
  analytics: {
    processingTime: number;
    actionComplexityScore: number;
    riskScore: number;
  };
  outcome?: {
    completed: boolean;
    actualDuration?: number;
    success: boolean;
    issues?: string[];
  };
}

export interface ContinuationInsight {
  type:
    | "cycle_detected"
    | "stuck_pattern"
    | "risk_escalation"
    | "efficiency_opportunity";
  severity: "low" | "medium" | "high";
  message: string;
  recommendation: string;
  confidence: number;
  relatedContinuations: string[];
}

/**
 * EnhancedContinuationTool wraps ContinuationTool with database persistence and analytics.
 *
 * This maintains complete backward compatibility - existing ContinuationTool usage continues
 * unchanged. Database persistence is only enabled when explicitly configured.
 *
 * Key features:
 * - Records continuation plans for historical analysis
 * - Detects cycles and stuck patterns
 * - Tracks continuation effectiveness and duration accuracy
 * - Maintains existing interface completely
 * - Zero interface changes
 */
export class EnhancedContinuationTool implements Tool {
  private baseTool: ContinuationTool;
  private conversationDAO: ConversationDAO;
  private dbConfigManager: DatabaseConfigManager;
  private eventEmitter?: ConversationEventEmitter;
  private config: EnhancedContinuationConfig;

  // Analytics and history
  private continuationHistory: ContinuationHistoryEntry[] = [];
  private analytics: ContinuationAnalytics;
  private currentSessionId?: string;
  private sessionContinuations: ContinuationPlan[] = [];

  constructor(
    config: Partial<EnhancedContinuationConfig> = {},
    eventEmitter?: ConversationEventEmitter
  ) {
    this.baseTool = new ContinuationTool();
    this.conversationDAO = new ConversationDAO();
    this.dbConfigManager = DatabaseConfigManager.getInstance();
    this.eventEmitter = eventEmitter;

    this.config = {
      enableDatabasePersistence: this.dbConfigManager.isEnabled(),
      enableAnalytics: true,
      enableEventEmission: true,
      trackContinuationPatterns: true,
      saveContinuationHistory: true,
      enableCycleDetection: true,
      enableStuckDetection: true,
      ...config,
    };

    this.analytics = this.initializeAnalytics();

    Logger.debug("EnhancedContinuationTool initialized", {
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

      // Extract continuation plan from the latest tool state
      const plan = this.extractContinuationPlan(result);

      // Enhanced processing
      if (plan) {
        await this.processContinuation(plan, {
          processingTime: Date.now() - startTime,
          actionComplexityScore: this.calculateComplexityScore(plan),
          riskScore: this.calculateRiskScore(plan),
        });
      }

      Logger.debug("Enhanced continuation tool executed successfully", {
        sessionId: this.currentSessionId,
        nextAction: plan?.nextAction.substring(0, 50) + "...",
        requiresUserInput: plan?.requiresUserInput,
        processingTime: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      Logger.error("Enhanced continuation tool execution failed", {
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

  private extractContinuationPlan(result: string): ContinuationPlan | null {
    try {
      // Get the latest continuation plan from the base tool
      const lastContinuation = this.baseTool.getLastContinuation();

      if (!lastContinuation) {
        // Try to extract from result text
        return this.parseResultForContinuation(result);
      }

      return lastContinuation;
    } catch (error) {
      Logger.warn("Failed to extract continuation plan", {
        error: error instanceof Error ? error.message : String(error),
        resultLength: result.length,
      });
      return null;
    }
  }

  private parseResultForContinuation(result: string): ContinuationPlan | null {
    try {
      const lines = result.split("\n").map((line) => line.trim());

      // Find the next action line
      const nextActionLine = lines.find((line) =>
        line.startsWith("➡️  Next Action:")
      );
      if (!nextActionLine) return null;

      const nextAction = nextActionLine.replace("➡️  Next Action: ", "");

      // Extract other fields
      const reasoningLine = lines.find((line) =>
        line.startsWith("💭 Reasoning:")
      );
      const reasoning = reasoningLine?.replace("💭 Reasoning: ", "");

      const durationLine = lines.find((line) =>
        line.startsWith("⏱️  Estimated Duration:")
      );
      const estimatedDuration = durationLine?.replace(
        "⏱️  Estimated Duration: ",
        ""
      );

      const requiresUserInput = result.includes(
        "⚠️  Note: This action may require user input"
      );

      // Extract dependencies and risks from list items
      const dependencies: string[] = [];
      const risks: string[] = [];

      let inDependencies = false;
      let inRisks = false;

      for (const line of lines) {
        if (line === "📋 Dependencies:") {
          inDependencies = true;
          inRisks = false;
          continue;
        } else if (line === "⚠️  Potential Risks:") {
          inRisks = true;
          inDependencies = false;
          continue;
        } else if (line === "" || !line.startsWith("  •")) {
          inDependencies = inRisks = false;
          continue;
        }

        if (line.startsWith("  • ")) {
          const item = line.replace("  • ", "");
          if (inDependencies) dependencies.push(item);
          else if (inRisks) risks.push(item);
        }
      }

      return {
        nextAction,
        reasoning,
        estimatedDuration,
        requiresUserInput,
        dependencies,
        risks,
      };
    } catch (error) {
      Logger.warn("Failed to parse result for continuation plan", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async processContinuation(
    plan: ContinuationPlan,
    metadata: {
      processingTime: number;
      actionComplexityScore: number;
      riskScore: number;
    }
  ): Promise<void> {
    const historyEntry: ContinuationHistoryEntry = {
      id: this.generateContinuationId(),
      sessionId: this.currentSessionId,
      timestamp: new Date(),
      plan,
      context: {
        workingDirectory: process.cwd(),
        currentPhase: this.getCurrentPhase(),
        iterationCount: this.sessionContinuations.length,
        previousAction:
          this.sessionContinuations.length > 0
            ? this.sessionContinuations[this.sessionContinuations.length - 1]
                .nextAction
            : undefined,
      },
      analytics: metadata,
    };

    // Add to session continuations for pattern detection
    this.sessionContinuations.push(plan);

    // Add to history if enabled
    if (this.config.saveContinuationHistory) {
      this.continuationHistory.push(historyEntry);
      this.maintainHistorySize();
    }

    // Update analytics
    if (this.config.enableAnalytics) {
      this.updateAnalytics(historyEntry);
    }

    // Detect patterns if enabled
    if (this.config.enableCycleDetection || this.config.enableStuckDetection) {
      const insights = this.analyzePatterns(historyEntry);
      if (insights.length > 0) {
        await this.handleInsights(insights);
      }
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
        validationType: "continuation_plan",
        result: plan.risks && plan.risks.length > 0 ? "warning" : "passed",
        message: `Agent continuing: ${plan.nextAction}`,
        details: {
          reasoning: plan.reasoning,
          estimatedDuration: plan.estimatedDuration,
          requiresUserInput: plan.requiresUserInput,
          dependencies: plan.dependencies,
          risks: plan.risks,
          complexityScore: metadata.actionComplexityScore,
          riskScore: metadata.riskScore,
        },
      });
    }

    Logger.debug("Continuation processed with enhancements", {
      continuationId: historyEntry.id,
      sessionId: this.currentSessionId,
      nextAction: plan.nextAction.substring(0, 50) + "...",
      riskCount: plan.risks?.length || 0,
      requiresUserInput: plan.requiresUserInput,
    });
  }

  private calculateComplexityScore(plan: ContinuationPlan): number {
    let score = 0;

    // Base complexity from action description
    const actionWords = plan.nextAction.split(" ").length;
    score += Math.min(actionWords * 0.5, 10); // Max 10 points from action length

    // Complexity from dependencies
    score += (plan.dependencies?.length || 0) * 2;

    // Complexity from risks
    score += (plan.risks?.length || 0) * 1.5;

    // Complexity from requiring user input
    if (plan.requiresUserInput) score += 3;

    // Complexity from reasoning depth
    if (plan.reasoning) {
      const reasoningWords = plan.reasoning.split(" ").length;
      score += Math.min(reasoningWords * 0.1, 5); // Max 5 points from reasoning
    }

    return Math.min(score, 20); // Cap at 20
  }

  private calculateRiskScore(plan: ContinuationPlan): number {
    let score = 0;

    // Base risk from risk count
    const riskCount = plan.risks?.length || 0;
    score += riskCount * 2;

    // Risk keywords in action
    const highRiskWords = [
      "delete",
      "remove",
      "destroy",
      "overwrite",
      "replace",
      "modify",
    ];
    const mediumRiskWords = [
      "update",
      "change",
      "refactor",
      "migrate",
      "install",
    ];

    const actionLower = plan.nextAction.toLowerCase();

    highRiskWords.forEach((word) => {
      if (actionLower.includes(word)) score += 3;
    });

    mediumRiskWords.forEach((word) => {
      if (actionLower.includes(word)) score += 1;
    });

    // Risk from requiring user input (could indicate uncertainty)
    if (plan.requiresUserInput) score += 2;

    return Math.min(score, 15); // Cap at 15
  }

  private analyzePatterns(
    entry: ContinuationHistoryEntry
  ): ContinuationInsight[] {
    const insights: ContinuationInsight[] = [];

    if (this.config.enableCycleDetection) {
      const cycleInsight = this.detectCycles(entry);
      if (cycleInsight) insights.push(cycleInsight);
    }

    if (this.config.enableStuckDetection) {
      const stuckInsight = this.detectStuckPattern(entry);
      if (stuckInsight) insights.push(stuckInsight);
    }

    // Risk escalation detection
    const riskInsight = this.detectRiskEscalation(entry);
    if (riskInsight) insights.push(riskInsight);

    // Efficiency opportunities
    const efficiencyInsight = this.detectEfficiencyOpportunities(entry);
    if (efficiencyInsight) insights.push(efficiencyInsight);

    return insights;
  }

  private detectCycles(
    entry: ContinuationHistoryEntry
  ): ContinuationInsight | null {
    if (this.sessionContinuations.length < 4) return null;

    const recent = this.sessionContinuations.slice(-5);
    const actions = recent.map((c) => c.nextAction.toLowerCase());

    // Simple cycle detection - look for repeated action patterns
    const actionCounts: Record<string, number> = {};
    actions.forEach((action) => {
      const firstWords = action.split(" ").slice(0, 3).join(" ");
      actionCounts[firstWords] = (actionCounts[firstWords] || 0) + 1;
    });

    const repeatedActions = Object.entries(actionCounts)
      .filter(([, count]) => count > 2)
      .map(([action]) => action);

    if (repeatedActions.length > 0) {
      return {
        type: "cycle_detected",
        severity: "medium",
        message: `Potential cycle detected: "${repeatedActions[0]}" repeated ${actionCounts[repeatedActions[0]]} times`,
        recommendation:
          "Consider changing approach or breaking down the task differently",
        confidence: 0.7,
        relatedContinuations: this.continuationHistory
          .slice(-5)
          .map((c) => c.id),
      };
    }

    return null;
  }

  private detectStuckPattern(
    entry: ContinuationHistoryEntry
  ): ContinuationInsight | null {
    if (this.sessionContinuations.length < 3) return null;

    const recent = this.sessionContinuations.slice(-4);

    // Check for similar reasoning or high risk patterns
    const similarReasoningCount = recent.filter(
      (c) =>
        c.reasoning &&
        entry.plan.reasoning &&
        this.calculateSimilarity(c.reasoning, entry.plan.reasoning) > 0.7
    ).length;

    const highRiskCount = recent.filter(
      (c) => (c.risks?.length || 0) > 2
    ).length;

    if (similarReasoningCount > 2 || highRiskCount > 2) {
      return {
        type: "stuck_pattern",
        severity: "medium",
        message:
          "Agent appears to be stuck with similar reasoning or high-risk actions",
        recommendation:
          "Consider stepping back and reassessing the overall approach",
        confidence: 0.6,
        relatedContinuations: this.continuationHistory
          .slice(-4)
          .map((c) => c.id),
      };
    }

    return null;
  }

  private detectRiskEscalation(
    entry: ContinuationHistoryEntry
  ): ContinuationInsight | null {
    if (this.continuationHistory.length < 3) return null;

    const recent = this.continuationHistory.slice(-3);
    const riskScores = recent.map((c) => c.analytics.riskScore);

    // Check if risk is escalating
    const isEscalating = riskScores.every(
      (score, i) => i === 0 || score >= riskScores[i - 1]
    );

    if (isEscalating && entry.analytics.riskScore > 8) {
      return {
        type: "risk_escalation",
        severity: "high",
        message: `Risk score escalating: ${riskScores.join(" → ")} → ${entry.analytics.riskScore}`,
        recommendation:
          "Consider implementing safety measures or seeking user confirmation",
        confidence: 0.8,
        relatedContinuations: recent.map((c) => c.id),
      };
    }

    return null;
  }

  private detectEfficiencyOpportunities(
    entry: ContinuationHistoryEntry
  ): ContinuationInsight | null {
    if (this.continuationHistory.length < 5) return null;

    const recent = this.continuationHistory.slice(-5);

    // Look for opportunities to batch operations
    const writeOperations = recent.filter(
      (c) =>
        c.plan.nextAction.toLowerCase().includes("write") ||
        c.plan.nextAction.toLowerCase().includes("create") ||
        c.plan.nextAction.toLowerCase().includes("modify")
    );

    if (writeOperations.length >= 3) {
      return {
        type: "efficiency_opportunity",
        severity: "low",
        message: `${writeOperations.length} file operations detected - could potentially be batched`,
        recommendation: "Consider combining similar operations for efficiency",
        confidence: 0.5,
        relatedContinuations: writeOperations.map((c) => c.id),
      };
    }

    return null;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple similarity calculation based on common words
    const words1 = text1
      .toLowerCase()
      .split(" ")
      .filter((w) => w.length > 3);
    const words2 = text2
      .toLowerCase()
      .split(" ")
      .filter((w) => w.length > 3);

    const commonWords = words1.filter((word) => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;

    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  private async handleInsights(insights: ContinuationInsight[]): Promise<void> {
    // Log insights
    insights.forEach((insight) => {
      Logger.info(`Continuation insight: ${insight.type}`, {
        sessionId: this.currentSessionId,
        severity: insight.severity,
        message: insight.message,
        recommendation: insight.recommendation,
        confidence: insight.confidence,
      });
    });

    // Emit high-severity insights as validation events
    const highSeverityInsights = insights.filter((i) => i.severity === "high");

    if (
      highSeverityInsights.length > 0 &&
      this.eventEmitter &&
      this.currentSessionId
    ) {
      for (const insight of highSeverityInsights) {
        this.eventEmitter.emitValidation(this.currentSessionId, {
          validationType: "continuation_insight",
          result: "warning",
          message: insight.message,
          details: {
            type: insight.type,
            recommendation: insight.recommendation,
            confidence: insight.confidence,
            relatedContinuations: insight.relatedContinuations,
          },
        });
      }
    }
  }

  private async saveToDatabase(entry: ContinuationHistoryEntry): Promise<void> {
    try {
      // Save continuation plan to database
      // In a real implementation, this would use a dedicated continuation plans table
      Logger.debug("Saving continuation plan to database", {
        continuationId: entry.id,
        sessionId: entry.sessionId,
      });

      // Placeholder for actual database save
      // await this.conversationDAO.saveContinuationPlan(entry);
    } catch (error) {
      Logger.error("Failed to save continuation plan to database", {
        continuationId: entry.id,
        sessionId: entry.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private initializeAnalytics(): ContinuationAnalytics {
    return {
      totalContinuations: 0,
      averageActionsPerSession: 0,
      riskPatternFrequency: {},
      actionPatternFrequency: {},
      estimatedDurationAccuracy: {
        averageEstimated: 0,
        averageActual: 0,
        accuracyRate: 0,
      },
      cycleDetection: {
        cyclesDetected: 0,
        averageCycleLength: 0,
        mostCommonCyclePatterns: [],
      },
      userInputRequiredRate: 0,
      riskLevels: {
        low: 0,
        medium: 0,
        high: 0,
      },
    };
  }

  private updateAnalytics(entry: ContinuationHistoryEntry): void {
    this.analytics.totalContinuations++;

    // Update action patterns
    const firstWords = entry.plan.nextAction
      .split(" ")
      .slice(0, 2)
      .join(" ")
      .toLowerCase();
    this.analytics.actionPatternFrequency[firstWords] =
      (this.analytics.actionPatternFrequency[firstWords] || 0) + 1;

    // Update risk patterns
    if (entry.plan.risks) {
      entry.plan.risks.forEach((risk) => {
        const riskKey = risk.substring(0, 50); // Limit key length
        this.analytics.riskPatternFrequency[riskKey] =
          (this.analytics.riskPatternFrequency[riskKey] || 0) + 1;
      });
    }

    // Update user input required rate
    const userInputCount = this.continuationHistory.filter(
      (c) => c.plan.requiresUserInput
    ).length;
    this.analytics.userInputRequiredRate =
      userInputCount / this.analytics.totalContinuations;

    // Update risk levels
    const riskScore = entry.analytics.riskScore;
    if (riskScore < 5) this.analytics.riskLevels.low++;
    else if (riskScore < 10) this.analytics.riskLevels.medium++;
    else this.analytics.riskLevels.high++;
  }

  private updateFailureAnalytics(): void {
    this.analytics.totalContinuations++;
  }

  private maintainHistorySize(): void {
    const maxHistorySize = 500;

    if (this.continuationHistory.length > maxHistorySize) {
      this.continuationHistory =
        this.continuationHistory.slice(-maxHistorySize);
    }
  }

  private generateContinuationId(): string {
    return `continuation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentPhase(): string | undefined {
    // In a real implementation, this would get the current phase from session context
    return undefined;
  }

  // Delegate all ContinuationTool methods to maintain compatibility
  getContinuationHistory(): ReadonlyArray<ContinuationPlan> {
    return this.baseTool.getContinuationHistory();
  }

  getLastContinuation(): ContinuationPlan | null {
    return this.baseTool.getLastContinuation();
  }

  getContinuationStats(): any {
    return this.baseTool.getContinuationStats();
  }

  clearHistory(): void {
    this.baseTool.clearHistory();
    this.sessionContinuations = [];
  }

  // Enhanced API
  getEnhancedHistory(): Readonly<ContinuationHistoryEntry[]> {
    return [...this.continuationHistory];
  }

  getAnalytics(): Readonly<ContinuationAnalytics> {
    return { ...this.analytics };
  }

  getConfig(): Readonly<EnhancedContinuationConfig> {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<EnhancedContinuationConfig>): void {
    this.config = { ...this.config, ...newConfig };

    Logger.debug("Enhanced continuation tool configuration updated", {
      config: this.config,
    });
  }

  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
    this.sessionContinuations = []; // Reset for new session
  }

  clearSessionId(): void {
    this.currentSessionId = undefined;
    this.sessionContinuations = [];
  }

  setEventEmitter(eventEmitter: ConversationEventEmitter): void {
    this.eventEmitter = eventEmitter;
  }

  // Pattern analysis methods
  getMostCommonActions(
    limit: number = 10
  ): Array<{ action: string; count: number }> {
    return Object.entries(this.analytics.actionPatternFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([action, count]) => ({ action, count }));
  }

  getMostCommonRisks(
    limit: number = 10
  ): Array<{ risk: string; count: number }> {
    return Object.entries(this.analytics.riskPatternFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([risk, count]) => ({ risk, count }));
  }

  getContinuationTrends(): {
    complexityTrend: number;
    riskTrend: number;
    userInputTrend: number;
    sessionEfficiency: number;
  } {
    const recent = this.continuationHistory.slice(-20); // Last 20
    const older = this.continuationHistory.slice(-40, -20); // Previous 20

    const recentAvgComplexity =
      recent.reduce((sum, e) => sum + e.analytics.actionComplexityScore, 0) /
      recent.length;
    const olderAvgComplexity =
      older.reduce((sum, e) => sum + e.analytics.actionComplexityScore, 0) /
      older.length;
    const complexityTrend = recentAvgComplexity - olderAvgComplexity;

    const recentAvgRisk =
      recent.reduce((sum, e) => sum + e.analytics.riskScore, 0) / recent.length;
    const olderAvgRisk =
      older.reduce((sum, e) => sum + e.analytics.riskScore, 0) / older.length;
    const riskTrend = recentAvgRisk - olderAvgRisk;

    const recentUserInputRate =
      recent.filter((e) => e.plan.requiresUserInput).length / recent.length;
    const olderUserInputRate =
      older.filter((e) => e.plan.requiresUserInput).length / older.length;
    const userInputTrend = recentUserInputRate - olderUserInputRate;

    // Session efficiency: fewer continuations for same outcomes
    const sessionEfficiency =
      this.sessionContinuations.length > 0
        ? 1 / this.sessionContinuations.length
        : 1;

    return {
      complexityTrend,
      riskTrend,
      userInputTrend,
      sessionEfficiency,
    };
  }

  getRecentInsights(limit: number = 5): ContinuationInsight[] {
    // In a real implementation, you'd store insights and retrieve them
    // For now, return empty array as insights are processed immediately
    return [];
  }

  // Export data for external analysis
  exportContinuationData(): {
    analytics: ContinuationAnalytics;
    history: ContinuationHistoryEntry[];
    trends: any;
    config: EnhancedContinuationConfig;
  } {
    return {
      analytics: this.getAnalytics(),
      // FIXED: Fix readonly array issue by creating mutable copy
      history: [...this.getEnhancedHistory()],
      trends: this.getContinuationTrends(),
      config: this.getConfig(),
    };
  }

  // Reset analytics (useful for testing or new projects)
  resetAnalytics(): void {
    this.analytics = this.initializeAnalytics();
    this.continuationHistory = [];
    this.sessionContinuations = [];

    Logger.debug("Enhanced continuation tool analytics reset");
  }

  // Static utilities
  static validateContinuationPlan(plan: unknown): {
    isValid: boolean;
    errors: string[];
  } {
    return ContinuationTool.validateContinuationPlan(plan);
  }

  static createContinuationPlan(
    nextAction: string,
    options: Partial<ContinuationPlan> = {}
  ): ContinuationPlan {
    return ContinuationTool.createContinuationPlan(nextAction, options);
  }

  static analyzeContinuationPattern(continuations: ContinuationPlan[]): any {
    return ContinuationTool.analyzeContinuationPattern(continuations);
  }

  // Factory methods
  static create(
    config?: Partial<EnhancedContinuationConfig>,
    eventEmitter?: ConversationEventEmitter
  ): EnhancedContinuationTool {
    return new EnhancedContinuationTool(config, eventEmitter);
  }

  static createWithDefaults(): EnhancedContinuationTool {
    return new EnhancedContinuationTool();
  }
}
