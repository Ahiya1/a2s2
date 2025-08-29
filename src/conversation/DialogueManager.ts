import { ProjectContext } from "./ConversationAgent";
import { Logger } from "../logging/Logger";

export interface DialogueResult {
  requirements: RequirementItem[];
  cancelled?: boolean;
}

export interface RequirementItem {
  category: string;
  description: string;
  details: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface ConversationFlow {
  currentStep: number;
  requirements: RequirementItem[];
  userResponses: string[];
}

/**
 * DialogueManager handles the interactive conversation flow with the user.
 * It asks contextual questions based on project analysis and builds requirements.
 */
export class DialogueManager {
  private readline: any;
  private rl: any;
  private conversationFlow: ConversationFlow;

  constructor() {
    this.readline = require('readline');
    this.conversationFlow = {
      currentStep: 0,
      requirements: [],
      userResponses: [],
    };

    Logger.info("DialogueManager initialized");
  }

  async startDialogue(projectContext: ProjectContext): Promise<DialogueResult> {
    Logger.info("Starting interactive dialogue", {
      techStack: projectContext.techStack,
      patterns: projectContext.patterns,
    });

    this.rl = this.readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // Start the conversation flow
      await this.conductConversation(projectContext);

      this.rl.close();

      Logger.info("Dialogue completed", {
        requirementsCount: this.conversationFlow.requirements.length,
      });

      return {
        requirements: this.conversationFlow.requirements,
      };
    } catch (error) {
      this.rl.close();
      
      if (error instanceof Error && error.message === 'cancelled') {
        return { requirements: [], cancelled: true };
      }
      
      throw error;
    }
  }

  private async conductConversation(projectContext: ProjectContext): Promise<void> {
    // Step 1: Get the main goal/vision
    const mainGoal = await this.askMainGoal();
    if (mainGoal === 'quit') throw new Error('cancelled');
    
    this.addRequirement('main-goal', mainGoal, [], 'high');

    // Step 2: Ask contextual questions based on project analysis
    await this.askContextualQuestions(projectContext, mainGoal);

    // Step 3: Ask follow-up questions for clarification
    await this.askFollowUpQuestions(projectContext);

    // Step 4: Present summary and confirm
    await this.confirmRequirements();
  }

  private async askMainGoal(): Promise<string> {
    console.log("💭 Let's start with the big picture...");
    console.log("");
    
    const goal = await this.askQuestion(
      "What would you like to build or improve? (be as specific or general as you'd like)"
    );
    
    if (!goal || goal.trim().length === 0) {
      console.log("Please provide a brief description of what you want to accomplish.");
      return this.askMainGoal();
    }
    
    return goal;
  }

  private async askContextualQuestions(
    projectContext: ProjectContext,
    mainGoal: string
  ): Promise<void> {
    const questions = this.generateContextualQuestions(projectContext, mainGoal);

    for (const question of questions) {
      const answer = await this.askQuestion(question.question);
      if (answer === 'quit') throw new Error('cancelled');
      
      if (answer && answer.trim().length > 0) {
        this.addRequirement(
          question.category,
          question.question,
          [answer],
          question.priority
        );
      }
    }
  }

  private async askFollowUpQuestions(projectContext: ProjectContext): Promise<void> {
    // Ask about common concerns based on project type
    const followUps = this.generateFollowUpQuestions(projectContext);
    
    if (followUps.length > 0) {
      console.log("");
      console.log("📋 A few more questions to make sure I get everything right...");
      console.log("");
    }

    for (const followUp of followUps) {
      const answer = await this.askQuestion(followUp.question);
      if (answer === 'quit') throw new Error('cancelled');
      
      if (answer && answer.trim().length > 0 && answer.toLowerCase() !== 'no') {
        this.addRequirement(
          followUp.category,
          followUp.question,
          [answer],
          followUp.priority
        );
      }
    }
  }

  private async confirmRequirements(): Promise<void> {
    console.log("");
    console.log("📝 Here's what I understand you want to build:");
    console.log("");
    
    this.conversationFlow.requirements.forEach((req, index) => {
      console.log(`${index + 1}. ${req.description}`);
      if (req.details.length > 0) {
        req.details.forEach(detail => {
          console.log(`   → ${detail}`);
        });
      }
      console.log("");
    });
    
    const confirmed = await this.askQuestion(
      "Does this capture what you want to build? (yes/no/add more)"
    );
    
    if (confirmed.toLowerCase().includes('no')) {
      throw new Error('cancelled');
    }
    
    if (confirmed.toLowerCase().includes('add') || confirmed.toLowerCase().includes('more')) {
      const additional = await this.askQuestion(
        "What else would you like to add or clarify?"
      );
      if (additional && additional.trim().length > 0) {
        this.addRequirement('additional', 'Additional requirements', [additional], 'medium');
      }
    }
  }

  private generateContextualQuestions(
    projectContext: ProjectContext,
    mainGoal: string
  ): Array<{ question: string; category: string; priority: 'high' | 'medium' | 'low' }> {
    const questions: Array<{ question: string; category: string; priority: 'high' | 'medium' | 'low' }> = [];
    
    const goal = mainGoal.toLowerCase();

    // Authentication questions
    if (goal.includes('auth') || goal.includes('login') || goal.includes('user') ||
        goal.includes('account') || goal.includes('sign')) {
      if (projectContext.techStack.includes('React') || projectContext.techStack.includes('Next.js')) {
        questions.push({
          question: "For authentication, what would you prefer? (1) Email/password only (2) Social login (Google/GitHub) (3) Both",
          category: 'authentication',
          priority: 'high'
        });
      }
      questions.push({
        question: "Do you need user profiles/settings pages? (yes/no/basic)",
        category: 'user-management',
        priority: 'medium'
      });
      questions.push({
        question: "Should users be able to reset passwords? (yes/no)",
        category: 'authentication',
        priority: 'medium'
      });
    }

    // Database questions
    if (goal.includes('data') || goal.includes('store') || goal.includes('save') ||
        goal.includes('database') || goal.includes('crud')) {
      if (!projectContext.techStack.some(tech => tech.includes('SQL') || tech.includes('MongoDB'))) {
        questions.push({
          question: "What type of database would you prefer? (1) SQLite (simple) (2) PostgreSQL (robust) (3) MongoDB (flexible)",
          category: 'database',
          priority: 'high'
        });
      }
      questions.push({
        question: "Do you need data validation/schemas? (yes/no/basic)",
        category: 'data-validation',
        priority: 'medium'
      });
    }

    // API questions
    if (goal.includes('api') || goal.includes('endpoint') || goal.includes('rest') ||
        projectContext.patterns.includes('REST API')) {
      questions.push({
        question: "What kind of API operations do you need? (GET/POST/PUT/DELETE or describe specific endpoints)",
        category: 'api-design',
        priority: 'high'
      });
      questions.push({
        question: "Do you need API authentication/permissions? (yes/no/basic)",
        category: 'api-security',
        priority: 'medium'
      });
    }

    // UI/UX questions for frontend projects
    if (projectContext.techStack.includes('React') || projectContext.techStack.includes('Vue.js') ||
        projectContext.techStack.includes('Next.js') || goal.includes('ui') || goal.includes('interface')) {
      if (goal.includes('component') || goal.includes('page') || goal.includes('form')) {
        questions.push({
          question: "What style approach do you prefer? (1) Tailwind CSS (2) Material-UI (3) Custom CSS (4) Existing styles",
          category: 'styling',
          priority: 'medium'
        });
      }
      questions.push({
        question: "Do you need responsive design (mobile-friendly)? (yes/no/mobile-first)",
        category: 'responsive-design',
        priority: 'medium'
      });
    }

    // Testing questions
    if (goal.includes('test') || projectContext.techStack.includes('Jest')) {
      questions.push({
        question: "What level of testing do you want? (1) None (2) Basic unit tests (3) Full test coverage",
        category: 'testing',
        priority: 'low'
      });
    }

    // Deployment questions
    if (goal.includes('deploy') || goal.includes('production') || goal.includes('host')) {
      questions.push({
        question: "Where would you like to deploy? (1) Local development only (2) Vercel/Netlify (3) AWS/GCP (4) Docker container",
        category: 'deployment',
        priority: 'medium'
      });
    }

    return questions;
  }

  private generateFollowUpQuestions(
    projectContext: ProjectContext
  ): Array<{ question: string; category: string; priority: 'high' | 'medium' | 'low' }> {
    const questions: Array<{ question: string; category: string; priority: 'high' | 'medium' | 'low' }> = [];

    // Error handling
    questions.push({
      question: "Should I add comprehensive error handling and logging? (yes/no)",
      category: 'error-handling',
      priority: 'low'
    });

    // Performance considerations
    if (projectContext.techStack.includes('React') || projectContext.techStack.includes('Next.js')) {
      questions.push({
        question: "Any specific performance requirements? (loading speed, large datasets, etc.)",
        category: 'performance',
        priority: 'low'
      });
    }

    // Security considerations
    if (projectContext.patterns.includes('Authentication System') || 
        projectContext.patterns.includes('REST API')) {
      questions.push({
        question: "Any specific security requirements? (HTTPS, rate limiting, input validation)",
        category: 'security',
        priority: 'medium'
      });
    }

    // Documentation
    questions.push({
      question: "Should I include documentation (README, API docs, code comments)? (yes/no/basic)",
      category: 'documentation',
      priority: 'low'
    });

    return questions;
  }

  private async askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(`❓ ${question}\n> `, (answer: string) => {
        const trimmed = answer.trim();
        
        // Handle quit/exit commands
        if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
          resolve('quit');
          return;
        }
        
        resolve(trimmed);
      });
    });
  }

  private addRequirement(
    category: string,
    description: string,
    details: string[],
    priority: 'high' | 'medium' | 'low'
  ): void {
    this.conversationFlow.requirements.push({
      category,
      description,
      details,
      priority,
    });
  }
}
