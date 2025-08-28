import { Command } from "commander";
import { AgentSession, AgentSessionOptions } from "../../agent/AgentSession";
import { EnvLoader } from "../../config/EnvLoader";
import { OutputFormatter } from "../utils/output";
import { Logger } from "../../logging/Logger";

export function createContinueCommand(): Command {
  return new Command("continue")
    .description(
      "Continue or resume agent execution with additional instructions"
    )
    .argument(
      "[additional-vision]",
      "Additional instructions or clarifications"
    )
    .option(
      "--directory <dir>",
      "Working directory for the agent",
      process.cwd()
    )
    .option("--session-id <id>", "Existing session ID to resume")
    .option(
      "--phase <phase>",
      "Force specific phase: EXPLORE, SUMMON, or COMPLETE"
    )
    .option(
      "--max-iterations <num>",
      "Maximum additional conversation iterations",
      "25"
    )
    .option("--cost-budget <amount>", "Additional cost budget in USD", "25.0")
    .option("--reset-phase", "Reset to EXPLORE phase")
    .option("--no-web-search", "Disable web search capability")
    .option("--extended-context", "Enable 1M token context window")
    .option("--verbose", "Enable verbose output")
    .action(
      async (
        additionalVision: string | undefined,
        options: {
          directory: string;
          sessionId?: string;
          phase?: string;
          maxIterations: string;
          costBudget: string;
          resetPhase: boolean;
          webSearch: boolean;
          extendedContext: boolean;
          verbose: boolean;
        }
      ) => {
        const startTime = Date.now();

        try {
          OutputFormatter.formatHeader("a2s2 Agent Continuation");

          // Determine what to continue
          let baseVision: string;
          let sessionToResume: string | undefined = options.sessionId;

          if (additionalVision && additionalVision.trim()) {
            baseVision = additionalVision.trim();
            OutputFormatter.formatInfo(
              "Continuing with additional instructions"
            );
          } else {
            // Try to infer from current directory context
            baseVision = await inferContinuationVision(options.directory);
            OutputFormatter.formatInfo(
              "Continuing based on current directory context"
            );
          }

          if (options.verbose) {
            console.log("🔧 Configuration:");
            console.log(`  Additional Vision: ${baseVision}`);
            console.log(`  Directory: ${options.directory}`);
            console.log(`  Session ID: ${sessionToResume || "New session"}`);
            console.log(`  Phase: ${options.phase || "Auto-detect"}`);
            console.log(`  Reset Phase: ${options.resetPhase ? "Yes" : "No"}`);
            console.log(`  Max Iterations: ${options.maxIterations}`);
            console.log(`  Cost Budget: $${options.costBudget}`);
            console.log("");
          }

          // Validate inputs
          validateContinuationInputs(baseVision, options);

          // Prepare session options
          const sessionOptions: AgentSessionOptions = {
            vision: baseVision,
            workingDirectory: options.directory,
            phase: determineStartingPhase(options),
            maxIterations: parseInt(options.maxIterations, 10),
            costBudget: parseFloat(options.costBudget),
            enableWebSearch: options.webSearch,
            enableExtendedContext: options.extendedContext,
          };

          // Create agent session
          const agentSession = new AgentSession(sessionOptions);

          OutputFormatter.formatSection("Agent Continuation Starting");
          console.log(`🎯 Vision: ${baseVision}`);
          console.log(`📂 Working in: ${options.directory}`);
          console.log(`🤖 Session ID: ${agentSession.getSessionId()}`);

          if (sessionToResume) {
            console.log(`🔄 Resuming from: ${sessionToResume}`);
          }

          console.log("");

          // Execute the continuation
          const result = await agentSession.execute(sessionOptions);

          // Display results
          OutputFormatter.formatSection("Continuation Results");

          if (result.success) {
            OutputFormatter.formatSuccess(
              "Agent continuation completed successfully"
            );
          } else {
            OutputFormatter.formatError(
              "Agent continuation completed with issues"
            );
            if (result.error) {
              console.log(`❌ Error: ${result.error}`);
            }
          }

          console.log("");
          console.log("📊 Session Metrics:");
          console.log(`  • Session ID: ${result.sessionId}`);
          console.log(`  • Final Phase: ${result.finalPhase}`);
          console.log(`  • Additional Iterations: ${result.iterationCount}`);
          console.log(`  • Duration: ${(result.duration / 1000).toFixed(1)}s`);
          console.log(`  • Additional Cost: $${result.totalCost.toFixed(4)}`);

          if (result.completionReport) {
            console.log("");
            console.log("📋 What Changed:");
            const report = result.completionReport;

            if (report.filesCreated?.length > 0) {
              console.log(`  • New Files: ${report.filesCreated.length}`);
              report.filesCreated.forEach((file: string) => {
                console.log(`    + ${file}`);
              });
            }

            if (report.filesModified?.length > 0) {
              console.log(`  • Modified Files: ${report.filesModified.length}`);
              report.filesModified.forEach((file: string) => {
                console.log(`    ~ ${file}`);
              });
            }
          }

          // Provide continuation suggestions
          if (result.success && result.completionReport) {
            console.log("");
            console.log("💡 Next Steps:");
            console.log("  • Review the changes made");
            console.log("  • Test the implementation");
            console.log(
              "  • Run 'a2s2 continue \"additional instructions\"' for more changes"
            );
            console.log("  • Use 'a2s2 status' to check project status");
          }

          // Cleanup
          agentSession.cleanup();

          OutputFormatter.formatSuccess("Agent continuation completed");
          OutputFormatter.formatDuration(startTime);
        } catch (error) {
          OutputFormatter.formatError(
            `Agent continuation failed: ${error instanceof Error ? error.message : String(error)}`
          );

          Logger.error("Continue command failed", {
            additionalVision: additionalVision?.substring(0, 100),
            error: String(error),
          });

          OutputFormatter.formatDuration(startTime);
          process.exit(1);
        }
      }
    );
}

async function inferContinuationVision(directory: string): Promise<string> {
  try {
    const fs = require("fs").promises;
    const path = require("path");

    // Check for common files that might give us context
    const contextFiles = ["README.md", "package.json", ".git/config"];
    let context = "";

    for (const file of contextFiles) {
      const filePath = path.join(directory, file);
      try {
        const exists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);
        if (exists) {
          const content = await fs.readFile(filePath, "utf8");

          if (file === "package.json") {
            const pkg = JSON.parse(content);
            if (pkg.description) {
              context += `Project: ${pkg.name || "Unknown"} - ${pkg.description}. `;
            }
          } else if (file === "README.md") {
            const firstLine = content.split("\n")[0];
            if (firstLine.startsWith("#")) {
              context += `${firstLine.replace("#", "").trim()}. `;
            }
          }
        }
      } catch (error) {
        // Skip files we can't read
        continue;
      }
    }

    if (context) {
      return `Continue working on: ${context.trim()} Please improve, fix, or enhance based on current state.`;
    }

    // Default continuation message
    return "Continue improving the current project. Analyze what exists and enhance it appropriately.";
  } catch (error) {
    Logger.warn("Failed to infer continuation vision", {
      directory,
      error: String(error),
    });

    return "Continue working on the current project. Analyze the existing code and make appropriate improvements.";
  }
}

function determineStartingPhase(
  options: any
): "EXPLORE" | "SUMMON" | "COMPLETE" {
  // Explicit phase override
  if (options.phase) {
    return options.phase as "EXPLORE" | "SUMMON" | "COMPLETE";
  }

  // Reset to explore
  if (options.resetPhase) {
    return "EXPLORE";
  }

  // Default to EXPLORE for continuation - let agent decide what phase is appropriate
  return "EXPLORE";
}

function validateContinuationInputs(vision: string, options: any): void {
  if (!vision || vision.trim().length === 0) {
    throw new Error(
      "Cannot determine what to continue. Please provide additional instructions or ensure you're in a project directory."
    );
  }

  if (vision.length > 2000) {
    throw new Error(
      "Additional vision is too long. Please keep it under 2000 characters."
    );
  }

  const maxIterations = parseInt(options.maxIterations, 10);
  if (isNaN(maxIterations) || maxIterations < 1 || maxIterations > 100) {
    throw new Error(
      "Max iterations must be between 1 and 100 for continuation"
    );
  }

  const costBudget = parseFloat(options.costBudget);
  if (isNaN(costBudget) || costBudget < 0.1 || costBudget > 500) {
    throw new Error(
      "Cost budget must be between $0.10 and $500.00 for continuation"
    );
  }

  if (options.phase) {
    const validPhases = ["EXPLORE", "SUMMON", "COMPLETE"];
    if (!validPhases.includes(options.phase)) {
      throw new Error(`Phase must be one of: ${validPhases.join(", ")}`);
    }
  }

  // Validate directory exists
  try {
    const fs = require("fs");
    if (!fs.existsSync(options.directory)) {
      throw new Error(`Directory does not exist: ${options.directory}`);
    }
  } catch (error) {
    throw new Error(`Cannot access directory: ${options.directory}`);
  }

  // Check for required environment variables
  const { missing } = EnvLoader.checkRequiredEnvVars();
  if (missing.length > 0) {
    throw new Error(
      "Missing required environment variables. Please run 'a2s2 config --setup' to configure."
    );
  }
}
