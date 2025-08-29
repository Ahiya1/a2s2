import { DialogueManager } from "./DialogueManager";
import { ProjectAnalyzer } from "./ProjectAnalyzer";
import { SpecificationBuilder } from "./SpecificationBuilder";
import { OutputFormatter } from "../cli/utils/output";
import { Logger } from "../logging/Logger";

export interface ConversationAgentOptions {
  workingDirectory: string;
  verbose?: boolean;
}

export interface ConversationResult {
  success: boolean;
  specification?: string;
  error?: string;
  cancelled?: boolean;
}

export interface ProjectContext {
  directory: string;
  structure: string;
  keyFiles: string[];
  techStack: string[];
  patterns: string[];
}

/**
 * ConversationAgent orchestrates the interactive conversation flow.
 * It coordinates between dialogue management, project analysis, and specification building.
 */
export class ConversationAgent {
  private options: ConversationAgentOptions;
  private dialogueManager: DialogueManager;
  private projectAnalyzer: ProjectAnalyzer;
  private specificationBuilder: SpecificationBuilder;
  private projectContext?: ProjectContext;

  constructor(options: ConversationAgentOptions) {
    this.options = options;
    this.dialogueManager = new DialogueManager();
    this.projectAnalyzer = new ProjectAnalyzer(options.workingDirectory);
    this.specificationBuilder = new SpecificationBuilder();

    Logger.info("ConversationAgent initialized", {
      workingDirectory: options.workingDirectory,
      verbose: options.verbose,
    });
  }

  async startConversation(): Promise<ConversationResult> {
    try {
      Logger.info("Starting interactive conversation");

      // Step 1: Greet the user
      this.greetUser();

      // Step 2: Analyze the project
      OutputFormatter.formatSection("Project Analysis");
      console.log("🔍 Analyzing your project...");
      
      this.projectContext = await this.projectAnalyzer.analyzeProject();
      
      if (this.options.verbose) {
        console.log("");
        console.log("Project Context:");
        console.log(`  Directory: ${this.projectContext.directory}`);
        console.log(`  Tech Stack: ${this.projectContext.techStack.join(", ")}`);
        console.log(`  Key Files: ${this.projectContext.keyFiles.length}`);
        console.log(`  Patterns: ${this.projectContext.patterns.length}`);
      }
      
      console.log("✅ Project analysis complete!");

      // Step 3: Start interactive dialogue
      OutputFormatter.formatSection("Interactive Planning");
      
      const dialogueResult = await this.dialogueManager.startDialogue(
        this.projectContext
      );

      if (dialogueResult.cancelled) {
        return {
          success: false,
          cancelled: true,
        };
      }

      // Step 4: Build specification from dialogue
      const specification = this.specificationBuilder.buildSpecification(
        dialogueResult.requirements,
        this.projectContext
      );

      // Step 5: Present specification for confirmation
      const confirmed = await this.confirmSpecification(specification);
      
      if (!confirmed) {
        return {
          success: false,
          cancelled: true,
        };
      }

      Logger.info("Conversation completed successfully", {
        specificationLength: specification.length,
      });

      return {
        success: true,
        specification,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error("Conversation failed", { error: errorMessage });
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private greetUser(): void {
    console.log("👋 Hi! I'm here to help you build something. What's on your mind?");
    console.log("");
    console.log("💭 I'll analyze your project, ask some questions, and then");
    console.log("   build a detailed specification for autonomous execution.");
    console.log("");
  }

  private async confirmSpecification(specification: string): Promise<boolean> {
    OutputFormatter.formatSection("Final Specification Review");
    
    console.log("Here's what I'll build for you:");
    console.log("");
    console.log(OutputFormatter.colorize("cyan", specification));
    console.log("");
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      const askConfirmation = () => {
        rl.question("🤔 Does this look good? (y/n/edit): ", (answer: string) => {
          const response = answer.toLowerCase().trim();
          
          if (response === 'y' || response === 'yes') {
            rl.close();
            resolve(true);
          } else if (response === 'n' || response === 'no') {
            console.log("❌ Cancelled by user");
            rl.close();
            resolve(false);
          } else if (response === 'edit') {
            console.log("📝 Editing not implemented in this version. Please restart the conversation.");
            rl.close();
            resolve(false);
          } else {
            console.log("Please answer 'y' for yes, 'n' for no, or 'edit' to modify:");
            askConfirmation();
          }
        });
      };
      
      askConfirmation();
    });
  }
}
