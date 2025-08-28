import { Tool } from "../ToolManager";
import { ParameterParser } from "../enhanced/ParameterParser";
import { Logger } from "../../logging/Logger";
import { z } from "zod";

export type AgentPhase = "EXPLORE" | "SUMMON" | "COMPLETE";

export interface PhaseTransition {
  fromPhase: AgentPhase | "START";
  toPhase: AgentPhase;
  summary: string;
  keyFindings?: string[];
  nextActions?: string[];
  confidence?: number;
  estimatedTimeRemaining?: string;
}

const PhaseReportSchema = z.object({
  phase: z.enum(["EXPLORE", "SUMMON", "COMPLETE"]),
  summary: z.string().min(10, "Phase summary must be at least 10 characters"),
  keyFindings: z.array(z.string()).optional().default([]),
  nextActions: z.array(z.string()).optional().default([]),
  confidence: z.number().min(0).max(1).optional(),
  estimatedTimeRemaining: z.string().optional(),
});

export class PhaseReportingTool implements Tool {
  name = "report_phase";
  description =
    "Report the current phase of agent execution and provide status updates";

  schema = {
    type: "object" as const,
    properties: {
      phase: {
        type: "string" as const,
        enum: ["EXPLORE", "SUMMON", "COMPLETE"],
        description: "Current phase of agent execution",
      },
      summary: {
        type: "string" as const,
        description: "Summary of what was accomplished in this phase",
      },
      keyFindings: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Key findings or insights from the current phase",
      },
      nextActions: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Planned actions for the next phase",
      },
      confidence: {
        type: "number" as const,
        minimum: 0,
        maximum: 1,
        description: "Confidence level in the current approach (0-1)",
      },
      estimatedTimeRemaining: {
        type: "string" as const,
        description: "Estimated time to complete remaining work",
      },
    },
    required: ["phase", "summary"],
  };

  private currentPhase: AgentPhase | null = null;
  private phaseHistory: PhaseTransition[] = [];
  private phaseStartTimes: Map<AgentPhase, Date> = new Map();

  async execute(params: unknown): Promise<string> {
    Logger.debug("Agent reporting phase status", { params });

    // Parse parameters robustly
    const parseResult = ParameterParser.parseObject(params, PhaseReportSchema);

    if (!parseResult.success) {
      const errorMsg = `Invalid phase report parameters: ${parseResult.error}`;
      Logger.error(errorMsg, { originalParams: params });
      throw new Error(errorMsg);
    }

    const report = parseResult.data as {
      phase: AgentPhase;
      summary: string;
      keyFindings?: string[];
      nextActions?: string[];
      confidence?: number;
      estimatedTimeRemaining?: string;
    };

    // Record phase transition
    const transition: PhaseTransition = {
      fromPhase: this.currentPhase || "START",
      toPhase: report.phase,
      summary: report.summary,
      keyFindings: report.keyFindings,
      nextActions: report.nextActions,
      confidence: report.confidence,
      estimatedTimeRemaining: report.estimatedTimeRemaining,
    };

    this.recordPhaseTransition(transition);

    Logger.info("Agent phase reported", {
      phase: report.phase,
      fromPhase: this.currentPhase || "START",
      summary: report.summary,
      confidence: report.confidence,
      keyFindingsCount: report.keyFindings?.length || 0,
      nextActionsCount: report.nextActions?.length || 0,
    });

    return this.formatPhaseReport(report, transition);
  }

  private recordPhaseTransition(transition: PhaseTransition): void {
    // Record timing
    if (this.currentPhase) {
      const startTime = this.phaseStartTimes.get(this.currentPhase);
      if (startTime) {
        const duration = Date.now() - startTime.getTime();
        Logger.info(`Phase ${this.currentPhase} completed`, {
          duration: `${(duration / 1000).toFixed(1)}s`,
        });
      }
    }

    // Update current phase
    this.currentPhase = transition.toPhase;
    this.phaseStartTimes.set(transition.toPhase, new Date());

    // Add to history
    this.phaseHistory.push({
      ...transition,
      timestamp: new Date().toISOString(),
    } as any);
  }

  private formatPhaseReport(report: any, transition: PhaseTransition): string {
    const lines = [`📊 PHASE REPORT: ${report.phase}`, ""];

    // Phase transition info
    if (transition.fromPhase !== "START") {
      lines.push(`🔄 Transition: ${transition.fromPhase} → ${report.phase}`);
      lines.push("");
    }

    // Phase summary
    lines.push(`📋 Summary: ${report.summary}`);

    // Confidence level
    if (report.confidence !== undefined) {
      const confidencePercent = Math.round(report.confidence * 100);
      const confidenceEmoji =
        confidencePercent >= 80 ? "🟢" : confidencePercent >= 60 ? "🟡" : "🔴";
      lines.push(`${confidenceEmoji} Confidence: ${confidencePercent}%`);
    }

    // Key findings
    if (report.keyFindings && report.keyFindings.length > 0) {
      lines.push("");
      lines.push("🔍 Key Findings:");
      report.keyFindings.forEach((finding: string) =>
        lines.push(`  • ${finding}`)
      );
    }

    // Next actions
    if (report.nextActions && report.nextActions.length > 0) {
      lines.push("");
      lines.push("⏭️  Next Actions:");
      report.nextActions.forEach((action: string) =>
        lines.push(`  • ${action}`)
      );
    }

    // Time estimation
    if (report.estimatedTimeRemaining) {
      lines.push("");
      lines.push(
        `⏱️  Estimated Time Remaining: ${report.estimatedTimeRemaining}`
      );
    }

    // Phase-specific guidance
    lines.push("");
    lines.push(this.getPhaseGuidance(report.phase));

    return lines.join("\n");
  }

  private getPhaseGuidance(phase: AgentPhase): string {
    switch (phase) {
      case "EXPLORE":
        return "🔍 Focus: Understanding project structure, requirements, and planning approach";

      case "SUMMON":
        return "👥 Focus: Coordinating with specialists (Phase 1B: working independently)";

      case "COMPLETE":
        return "✅ Focus: Implementation, testing, and final validation";

      default:
        return "📌 Continuing with current phase objectives";
    }
  }

  // Phase tracking utilities
  getCurrentPhase(): AgentPhase | null {
    return this.currentPhase;
  }

  getPhaseHistory(): ReadonlyArray<PhaseTransition> {
    return [...this.phaseHistory];
  }

  getPhaseStats(): {
    currentPhase: AgentPhase | null;
    totalPhases: number;
    phaseDistribution: Record<AgentPhase, number>;
    averageConfidence: number;
    totalTransitions: number;
  } {
    const phaseDistribution: Record<AgentPhase, number> = {
      EXPLORE: 0,
      SUMMON: 0,
      COMPLETE: 0,
    };

    let totalConfidence = 0;
    let confidenceCount = 0;

    this.phaseHistory.forEach((transition) => {
      phaseDistribution[transition.toPhase]++;

      if (transition.confidence !== undefined) {
        totalConfidence += transition.confidence;
        confidenceCount++;
      }
    });

    return {
      currentPhase: this.currentPhase,
      totalPhases: this.phaseHistory.length,
      phaseDistribution,
      averageConfidence:
        confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
      totalTransitions: this.phaseHistory.length,
    };
  }

  getPhaseDuration(phase: AgentPhase): number | null {
    const startTime = this.phaseStartTimes.get(phase);
    if (!startTime) return null;

    // If it's the current phase, return elapsed time
    if (phase === this.currentPhase) {
      return Date.now() - startTime.getTime();
    }

    // For completed phases, calculate from history
    const phaseTransitions = this.phaseHistory.filter(
      (t) => t.toPhase === phase
    );
    if (phaseTransitions.length === 0) return null;

    // This is simplified - a more complete implementation would track exact end times
    return 0; // Placeholder
  }

  // Progress tracking
  getOverallProgress(): {
    currentPhase: AgentPhase | null;
    phaseProgress: number; // 0-1
    overallProgress: number; // 0-1
    isStuck: boolean;
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    let phaseProgress = 0;
    let overallProgress = 0;

    if (!this.currentPhase) {
      return {
        currentPhase: null,
        phaseProgress: 0,
        overallProgress: 0,
        isStuck: false,
        recommendations: ["Agent has not started execution"],
      };
    }

    // Calculate phase progress based on confidence and findings
    const lastReport = this.phaseHistory[this.phaseHistory.length - 1];
    if (lastReport) {
      phaseProgress = lastReport.confidence || 0.5;

      // Boost progress if there are key findings or next actions
      if (lastReport.keyFindings && lastReport.keyFindings.length > 0) {
        phaseProgress = Math.min(1, phaseProgress + 0.2);
      }
      if (lastReport.nextActions && lastReport.nextActions.length > 0) {
        phaseProgress = Math.min(1, phaseProgress + 0.1);
      }
    }

    // Calculate overall progress based on phase completion
    const phaseWeights = { EXPLORE: 0.3, SUMMON: 0.4, COMPLETE: 0.3 };
    const completedPhases = new Set(this.phaseHistory.map((t) => t.toPhase));

    Object.entries(phaseWeights).forEach(([phase, weight]) => {
      if (completedPhases.has(phase as AgentPhase)) {
        if (phase === this.currentPhase) {
          overallProgress += weight * phaseProgress;
        } else {
          overallProgress += weight;
        }
      }
    });

    // Check if stuck (same phase for too long without progress)
    const samePhaseReports = this.phaseHistory
      .filter((t) => t.toPhase === this.currentPhase)
      .slice(-3);

    const isStuck =
      samePhaseReports.length >= 3 &&
      samePhaseReports.every((t) => (t.confidence || 0) < 0.7);

    if (isStuck) {
      recommendations.push(
        "Consider changing approach - low confidence for extended period"
      );
    }

    if (phaseProgress < 0.5) {
      recommendations.push("Focus on building confidence in current approach");
    }

    return {
      currentPhase: this.currentPhase,
      phaseProgress,
      overallProgress,
      isStuck,
      recommendations,
    };
  }

  // Reset for new session
  reset(): void {
    const previousPhase = this.currentPhase;
    const previousHistoryLength = this.phaseHistory.length;

    this.currentPhase = null;
    this.phaseHistory = [];
    this.phaseStartTimes.clear();

    Logger.info("Phase tracking reset", {
      previousPhase,
      previousHistoryLength,
    });
  }

  // Validation utilities
  static validatePhaseReport(report: unknown): {
    isValid: boolean;
    errors: string[];
  } {
    const result = PhaseReportSchema.safeParse(report);

    if (result.success) {
      return { isValid: true, errors: [] };
    }

    const errors = result.error.errors.map(
      (err) => `${err.path.join(".")}: ${err.message}`
    );

    return { isValid: false, errors };
  }
}
