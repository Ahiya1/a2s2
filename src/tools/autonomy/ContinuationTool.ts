import { Tool } from "../ToolManager";
import { ParameterParser } from "../enhanced/ParameterParser";
import { Logger } from "../../logging/Logger";
import { z } from "zod";

export interface ContinuationPlan {
  nextAction: string;
  reasoning?: string;
  estimatedDuration?: string;
  requiresUserInput?: boolean;
  risks?: string[];
  dependencies?: string[];
}

const ContinuationSchema = z.object({
  nextAction: z.string().min(10, "Next action must be at least 10 characters"),
  reasoning: z.string().optional(),
  estimatedDuration: z.string().optional(),
  requiresUserInput: z.boolean().optional().default(false),
  risks: z.array(z.string()).optional().default([]),
  dependencies: z.array(z.string()).optional().default([]),
});

export class ContinuationTool implements Tool {
  name = "continue_work";
  description =
    "Indicate that the agent will continue working on the current task with details about the next steps";

  schema = {
    type: "object" as const,
    properties: {
      nextAction: {
        type: "string" as const,
        description: "Clear description of what the agent will do next",
      },
      reasoning: {
        type: "string" as const,
        description: "Optional reasoning behind the chosen next action",
      },
      estimatedDuration: {
        type: "string" as const,
        description:
          "Estimated time to complete the next action (e.g., '5 minutes', '2 steps')",
      },
      requiresUserInput: {
        type: "boolean" as const,
        description:
          "Whether the next action requires user input or intervention",
      },
      risks: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Potential risks or issues with the planned action",
      },
      dependencies: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Dependencies that must be met before proceeding",
      },
    },
    required: ["nextAction"],
  };

  private continuationHistory: ContinuationPlan[] = [];

  async execute(params: unknown): Promise<string> {
    Logger.debug("Agent continuing work", { params });

    // Parse parameters robustly
    const parseResult = ParameterParser.parseObject(params, ContinuationSchema);

    if (!parseResult.success) {
      const errorMsg = `Invalid continuation parameters: ${parseResult.error}`;
      Logger.error(errorMsg, { originalParams: params });
      throw new Error(errorMsg);
    }

    const plan: ContinuationPlan = parseResult.data as ContinuationPlan;

    // Add to history for tracking
    this.continuationHistory.push({
      ...plan,
      // Add timestamp for tracking
      timestamp: new Date().toISOString(),
    } as any);

    Logger.info("Agent continuation plan recorded", {
      nextAction: plan.nextAction,
      hasReasoning: !!plan.reasoning,
      estimatedDuration: plan.estimatedDuration,
      requiresUserInput: plan.requiresUserInput,
      riskCount: plan.risks?.length || 0,
    });

    return this.formatContinuationMessage(plan);
  }

  private formatContinuationMessage(plan: ContinuationPlan): string {
    const lines = [
      "🔄 CONTINUING WORK",
      "",
      `➡️  Next Action: ${plan.nextAction}`,
    ];

    if (plan.reasoning) {
      lines.push("");
      lines.push(`💭 Reasoning: ${plan.reasoning}`);
    }

    if (plan.estimatedDuration) {
      lines.push("");
      lines.push(`⏱️  Estimated Duration: ${plan.estimatedDuration}`);
    }

    if (plan.requiresUserInput) {
      lines.push("");
      lines.push("⚠️  Note: This action may require user input or review");
    }

    if (plan.dependencies && plan.dependencies.length > 0) {
      lines.push("");
      lines.push("📋 Dependencies:");
      plan.dependencies.forEach((dep) => lines.push(`  • ${dep}`));
    }

    if (plan.risks && plan.risks.length > 0) {
      lines.push("");
      lines.push("⚠️  Potential Risks:");
      plan.risks.forEach((risk) => lines.push(`  • ${risk}`));
    }

    lines.push("");
    lines.push("⏳ Proceeding with the planned action...");

    return lines.join("\n");
  }

  // Utility methods for tracking continuation patterns
  getContinuationHistory(): ReadonlyArray<ContinuationPlan> {
    return [...this.continuationHistory];
  }

  getLastContinuation(): ContinuationPlan | null {
    return this.continuationHistory.length > 0
      ? this.continuationHistory[this.continuationHistory.length - 1]
      : null;
  }

  getContinuationStats(): {
    totalContinuations: number;
    averageActionsPerSession: number;
    mostCommonActions: string[];
    riskPatterns: string[];
  } {
    const totalContinuations = this.continuationHistory.length;

    if (totalContinuations === 0) {
      return {
        totalContinuations: 0,
        averageActionsPerSession: 0,
        mostCommonActions: [],
        riskPatterns: [],
      };
    }

    // Analyze action patterns (simple keyword extraction)
    const actionKeywords: Record<string, number> = {};
    const allRisks: string[] = [];

    this.continuationHistory.forEach((plan) => {
      // Extract keywords from actions (simple approach)
      const words = plan.nextAction
        .toLowerCase()
        .split(" ")
        .filter((word) => word.length > 3); // Filter short words

      words.forEach((word) => {
        actionKeywords[word] = (actionKeywords[word] || 0) + 1;
      });

      if (plan.risks) {
        allRisks.push(...plan.risks);
      }
    });

    // Sort by frequency
    const mostCommonActions = Object.entries(actionKeywords)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);

    // Find risk patterns (simple counting)
    const riskCounts: Record<string, number> = {};
    allRisks.forEach((risk) => {
      riskCounts[risk] = (riskCounts[risk] || 0) + 1;
    });

    const riskPatterns = Object.entries(riskCounts)
      .filter(([, count]) => count > 1) // Only risks that appeared multiple times
      .map(([risk]) => risk);

    return {
      totalContinuations,
      averageActionsPerSession: totalContinuations, // Simplified
      mostCommonActions,
      riskPatterns,
    };
  }

  // Clear history (useful for new sessions)
  clearHistory(): void {
    const previousCount = this.continuationHistory.length;
    this.continuationHistory = [];
    Logger.debug("Continuation history cleared", { previousCount });
  }

  // Validation utilities
  static validateContinuationPlan(plan: unknown): {
    isValid: boolean;
    errors: string[];
  } {
    const result = ContinuationSchema.safeParse(plan);

    if (result.success) {
      return { isValid: true, errors: [] };
    }

    const errors = result.error.errors.map(
      (err) => `${err.path.join(".")}: ${err.message}`
    );

    return { isValid: false, errors };
  }

  // Factory method for creating continuation plans
  static createContinuationPlan(
    nextAction: string,
    options: Partial<ContinuationPlan> = {}
  ): ContinuationPlan {
    return {
      nextAction,
      reasoning: options.reasoning,
      estimatedDuration: options.estimatedDuration,
      requiresUserInput: options.requiresUserInput || false,
      risks: options.risks || [],
      dependencies: options.dependencies || [],
    };
  }

  // Analysis methods
  static analyzeContinuationPattern(continuations: ContinuationPlan[]): {
    cycleDetected: boolean;
    stuckPattern: boolean;
    progressIndicators: string[];
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    const progressIndicators: string[] = [];

    if (continuations.length === 0) {
      return {
        cycleDetected: false,
        stuckPattern: false,
        progressIndicators,
        recommendations: ["No continuation history to analyze"],
      };
    }

    // Simple cycle detection - check if recent actions are repeating
    const recentActions = continuations
      .slice(-5)
      .map((c) => c.nextAction.toLowerCase());
    const uniqueRecentActions = new Set(recentActions);
    const cycleDetected =
      recentActions.length > 2 &&
      uniqueRecentActions.size < recentActions.length * 0.6;

    // Stuck pattern - too many similar actions
    const lastAction =
      continuations[continuations.length - 1].nextAction.toLowerCase();
    const similarRecentActions = recentActions.filter(
      (action) => action.includes(lastAction.split(" ")[0]) // Check if first word is similar
    );
    const stuckPattern = similarRecentActions.length > 3;

    // Generate recommendations
    if (cycleDetected) {
      recommendations.push(
        "Potential cycle detected - consider changing approach"
      );
    }

    if (stuckPattern) {
      recommendations.push(
        "Similar actions repeated - may need different strategy"
      );
    }

    // Look for progress indicators
    const progressWords = [
      "complete",
      "finish",
      "done",
      "test",
      "validate",
      "deploy",
    ];
    continuations.forEach((c) => {
      const action = c.nextAction.toLowerCase();
      progressWords.forEach((word) => {
        if (action.includes(word)) {
          progressIndicators.push(`Progress: ${word} mentioned`);
        }
      });
    });

    if (progressIndicators.length === 0) {
      recommendations.push("Consider adding validation or completion steps");
    }

    return {
      cycleDetected,
      stuckPattern,
      progressIndicators,
      recommendations,
    };
  }
}
