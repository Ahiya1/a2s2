import { ToolManager } from "../../tools/ToolManager";
import { Logger } from "../../logging/Logger";
import { ExplorationResult } from "./ExplorePhase";

export interface CompletionResult {
  success: boolean;
  filesCreated: string[];
  filesModified: string[];
  testsRun: string[];
  validationResults: string[];
  summary: string;
  nextSteps: string[];
  confidence: number;
  errors: string[];
}

export interface CompleteOptions {
  workingDirectory: string;
  vision: string;
  explorationResult?: ExplorationResult;
  dryRun?: boolean;
  validateChanges?: boolean;
  runTests?: boolean;
}

export class CompletePhase {
  private toolManager: ToolManager;
  private completionHistory: CompletionResult[] = [];

  constructor(toolManager: ToolManager) {
    this.toolManager = toolManager;
  }

  async execute(options: CompleteOptions): Promise<CompletionResult> {
    Logger.info("Starting COMPLETE phase", {
      workingDirectory: options.workingDirectory,
      vision: options.vision.substring(0, 100) + "...",
      dryRun: options.dryRun || false,
    });

    const result: CompletionResult = {
      success: false,
      filesCreated: [],
      filesModified: [],
      testsRun: [],
      validationResults: [],
      summary: "",
      nextSteps: [],
      confidence: 0,
      errors: [],
    };

    try {
      // Step 1: Plan implementation based on vision and exploration
      const implementationPlan = await this.planImplementation(options);

      // Step 2: Execute implementation steps
      if (!options.dryRun) {
        await this.executeImplementationPlan(
          implementationPlan,
          result,
          options
        );
      } else {
        result.summary = `Dry run completed. Would execute: ${implementationPlan.length} implementation steps`;
        result.success = true;
      }

      // Step 3: Validate changes if requested
      if (options.validateChanges && !options.dryRun) {
        await this.validateImplementation(result, options);
      }

      // Step 4: Run tests if requested
      if (options.runTests && !options.dryRun) {
        await this.runValidationTests(result, options);
      }

      // Step 5: Generate summary and next steps
      this.generateCompletionSummary(result, options);

      this.completionHistory.push(result);

      Logger.info("COMPLETE phase finished", {
        success: result.success,
        filesCreated: result.filesCreated.length,
        filesModified: result.filesModified.length,
        errors: result.errors.length,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      result.errors.push(`COMPLETE phase failed: ${(error as Error).message}`);
      result.success = false;
      result.confidence = 0.1;

      Logger.error("COMPLETE phase failed", {
        error: (error as Error).message,
      });

      return result;
    }
  }

  private async planImplementation(
    options: CompleteOptions
  ): Promise<ImplementationStep[]> {
    const plan: ImplementationStep[] = [];
    const vision = options.vision.toLowerCase();

    // Analyze the vision to create implementation steps
    if (vision.includes("readme") || vision.includes("documentation")) {
      plan.push({
        type: "create_file",
        description: "Create comprehensive README.md",
        filePath: "README.md",
        priority: 1,
      });
    }

    if (vision.includes("package.json") || vision.includes("npm")) {
      plan.push({
        type: "create_file",
        description: "Create or update package.json",
        filePath: "package.json",
        priority: 1,
      });
    }

    if (vision.includes("gitignore")) {
      plan.push({
        type: "create_file",
        description: "Create .gitignore file",
        filePath: ".gitignore",
        priority: 2,
      });
    }

    // React/Frontend specific
    if (vision.includes("react") || vision.includes("component")) {
      plan.push({
        type: "create_directory",
        description: "Create src directory structure",
        filePath: "src/",
        priority: 1,
      });

      plan.push({
        type: "create_file",
        description: "Create main React component",
        filePath: "src/App.jsx",
        priority: 2,
      });
    }

    // API/Backend specific
    if (
      vision.includes("api") ||
      vision.includes("server") ||
      vision.includes("express")
    ) {
      plan.push({
        type: "create_file",
        description: "Create server entry point",
        filePath: "server.js",
        priority: 1,
      });
    }

    // Configuration files
    if (vision.includes("typescript")) {
      plan.push({
        type: "create_file",
        description: "Create TypeScript configuration",
        filePath: "tsconfig.json",
        priority: 2,
      });
    }

    // Testing setup
    if (vision.includes("test") || vision.includes("testing")) {
      plan.push({
        type: "create_directory",
        description: "Create tests directory",
        filePath: "tests/",
        priority: 3,
      });
    }

    // Sort by priority
    plan.sort((a, b) => a.priority - b.priority);

    Logger.debug("Implementation plan created", {
      stepCount: plan.length,
      steps: plan.map((s) => s.description),
    });

    return plan;
  }

  private async executeImplementationPlan(
    plan: ImplementationStep[],
    result: CompletionResult,
    options: CompleteOptions
  ): Promise<void> {
    for (const step of plan) {
      try {
        await this.executeImplementationStep(step, result, options);
      } catch (error) {
        const errorMsg = `Failed to execute step '${step.description}': ${(error as Error).message}`;
        result.errors.push(errorMsg);
        Logger.warn("Implementation step failed", {
          step: step.description,
          error: (error as Error).message,
        });
      }
    }

    result.success = result.errors.length === 0;
    result.confidence = result.success
      ? 0.8
      : Math.max(0.3, 1 - result.errors.length * 0.2);
  }

  private async executeImplementationStep(
    step: ImplementationStep,
    result: CompletionResult,
    options: CompleteOptions
  ): Promise<void> {
    switch (step.type) {
      case "create_file":
        await this.createFile(step, result, options);
        break;
      case "modify_file":
        await this.modifyFile(step, result, options);
        break;
      case "create_directory":
        await this.createDirectory(step, result);
        break;
      case "run_command":
        await this.runCommand(step, result);
        break;
      default:
        result.errors.push(`Unknown step type: ${(step as any).type}`);
    }
  }

  private async createFile(
    step: ImplementationStep,
    result: CompletionResult,
    options: CompleteOptions
  ): Promise<void> {
    const content = await this.generateFileContent(step.filePath, options);

    await this.toolManager.executeTool("write_files", {
      files: [
        {
          path: step.filePath,
          content: content,
        },
      ],
    });

    result.filesCreated.push(step.filePath);

    Logger.debug("File created", {
      path: step.filePath,
      size: content.length,
    });
  }

  private async modifyFile(
    step: ImplementationStep,
    result: CompletionResult,
    options: CompleteOptions
  ): Promise<void> {
    // Read existing file
    const existingContent = await this.toolManager.executeTool("read_files", {
      paths: [step.filePath],
    });

    // Generate modified content (simplified approach)
    const modifiedContent = await this.generateModifiedFileContent(
      step.filePath,
      existingContent,
      options
    );

    await this.toolManager.executeTool("write_files", {
      files: [
        {
          path: step.filePath,
          content: modifiedContent,
        },
      ],
    });

    result.filesModified.push(step.filePath);

    Logger.debug("File modified", {
      path: step.filePath,
    });
  }

  private async createDirectory(
    step: ImplementationStep,
    result: CompletionResult
  ): Promise<void> {
    // Create directory by creating a placeholder file
    const placeholderPath = `${step.filePath}.gitkeep`;

    await this.toolManager.executeTool("write_files", {
      files: [
        {
          path: placeholderPath,
          content: "# Directory placeholder\n",
        },
      ],
    });

    result.filesCreated.push(placeholderPath);
  }

  private async runCommand(
    step: ImplementationStep,
    result: CompletionResult
  ): Promise<void> {
    if (!step.command) {
      throw new Error("Command step requires command property");
    }

    const output = await this.toolManager.executeTool("run_command", {
      command: step.command,
      timeout: 30000, // 30 second timeout
    });

    result.testsRun.push(step.command);
    result.validationResults.push(
      `Command '${step.command}' output: ${output.substring(0, 200)}`
    );
  }

  private async generateFileContent(
    filePath: string,
    options: CompleteOptions
  ): Promise<string> {
    const fileName = filePath.toLowerCase();
    const vision = options.vision;

    // README.md
    if (fileName.includes("readme")) {
      return this.generateReadmeContent(options);
    }

    // package.json
    if (fileName.includes("package.json")) {
      return this.generatePackageJsonContent(options);
    }

    // .gitignore
    if (fileName.includes(".gitignore")) {
      return this.generateGitignoreContent(options);
    }

    // React App.jsx
    if (fileName.includes("app.jsx")) {
      return this.generateReactAppContent(options);
    }

    // Server.js
    if (fileName.includes("server.js")) {
      return this.generateServerContent(options);
    }

    // tsconfig.json
    if (fileName.includes("tsconfig.json")) {
      return this.generateTsconfigContent(options);
    }

    // Default content
    return `// ${filePath}\n// Generated by a2s2\n// ${new Date().toISOString()}\n\n// TODO: Implement content for ${filePath}\n`;
  }

  private generateReadmeContent(options: CompleteOptions): string {
    const projectName = this.extractProjectName(options);
    const technologies = options.explorationResult?.technologies || [];

    return `# ${projectName}

${options.vision}

## Overview

This project was generated by a2s2 (Autonomous Agent System v2).

## Technologies

${technologies.length > 0 ? technologies.map((tech) => `- ${tech}`).join("\n") : "- Modern web technologies"}

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start development server:
   \`\`\`bash
   npm run dev
   \`\`\`

## Project Structure

\`\`\`
${options.explorationResult?.projectStructure || "Project structure will be updated after implementation"}
\`\`\`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License

---

Generated by a2s2 on ${new Date().toISOString()}
`;
  }

  private generatePackageJsonContent(options: CompleteOptions): string {
    const projectName = this.extractProjectName(options);
    const hasReact = options.vision.toLowerCase().includes("react");
    const hasExpress =
      options.vision.toLowerCase().includes("express") ||
      options.vision.toLowerCase().includes("server");

    const dependencies: Record<string, string> = {};
    const devDependencies: Record<string, string> = {};
    const scripts: Record<string, string> = {};

    if (hasReact) {
      dependencies["react"] = "^18.2.0";
      dependencies["react-dom"] = "^18.2.0";
      devDependencies["@vitejs/plugin-react"] = "^4.0.0";
      devDependencies["vite"] = "^4.4.0";
      scripts["dev"] = "vite";
      scripts["build"] = "vite build";
      scripts["preview"] = "vite preview";
    }

    if (hasExpress) {
      dependencies["express"] = "^4.18.0";
      dependencies["cors"] = "^2.8.5";
      devDependencies["nodemon"] = "^3.0.0";
      scripts["start"] = "node server.js";
      scripts["dev"] = "nodemon server.js";
    }

    // Default scripts
    if (Object.keys(scripts).length === 0) {
      scripts["start"] = "node index.js";
      scripts["test"] = 'echo "Error: no test specified" && exit 1';
    }

    return JSON.stringify(
      {
        name: projectName,
        version: "1.0.0",
        description:
          options.vision.length > 100
            ? options.vision.substring(0, 100) + "..."
            : options.vision,
        main: hasReact ? "src/main.jsx" : hasExpress ? "server.js" : "index.js",
        scripts,
        dependencies,
        devDependencies,
        keywords: [],
        author: "a2s2",
        license: "MIT",
      },
      null,
      2
    );
  }

  private generateGitignoreContent(options: CompleteOptions): string {
    return `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
build/
*.tgz

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Logs
logs
*.log

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
.nyc_output/

# Temporary folders
tmp/
temp/

# Generated by a2s2
`;
  }

  private generateReactAppContent(options: CompleteOptions): string {
    const componentName = "App";

    return `import React from 'react';

function ${componentName}() {
  return (
    <div className="${componentName}">
      <header>
        <h1>Welcome to Your React App</h1>
        <p>Generated by a2s2 (Autonomous Agent System v2)</p>
      </header>
      
      <main>
        <section>
          <h2>Project Vision</h2>
          <p>${options.vision}</p>
        </section>
        
        <section>
          <h2>Next Steps</h2>
          <ul>
            <li>Customize this component</li>
            <li>Add your business logic</li>
            <li>Style with CSS or a framework</li>
            <li>Add routing if needed</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

export default ${componentName};
`;
  }

  private generateServerContent(options: CompleteOptions): string {
    return `const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to your Express server',
    project: '${options.vision}',
    generatedBy: 'a2s2',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(\`🚀 Server running on port \${PORT}\`);
  console.log(\`📝 Project: \${options.vision}\`);
  console.log(\`🤖 Generated by a2s2\`);
});

module.exports = app;
`;
  }

  private generateTsconfigContent(options: CompleteOptions): string {
    return JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          useDefineForClassFields: true,
          lib: ["ES2020", "DOM", "DOM.Iterable"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx",
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
        },
        include: ["src"],
        references: [{ path: "./tsconfig.node.json" }],
      },
      null,
      2
    );
  }

  private async generateModifiedFileContent(
    filePath: string,
    existingContent: string,
    options: CompleteOptions
  ): Promise<string> {
    // Simple append approach for now
    return (
      existingContent +
      `\n\n// Modified by a2s2 on ${new Date().toISOString()}\n`
    );
  }

  private async validateImplementation(
    result: CompletionResult,
    options: CompleteOptions
  ): Promise<void> {
    // Validate that files were created successfully
    for (const filePath of result.filesCreated) {
      try {
        await this.toolManager.executeTool("read_files", {
          paths: [filePath],
        });
        result.validationResults.push(
          `✓ File created successfully: ${filePath}`
        );
      } catch (error) {
        result.validationResults.push(`✗ File creation failed: ${filePath}`);
        result.errors.push(
          `Validation failed for ${filePath}: ${(error as Error).message}`
        );
      }
    }
  }

  private async runValidationTests(
    result: CompletionResult,
    options: CompleteOptions
  ): Promise<void> {
    // Run basic validation commands
    const testCommands = [
      "ls -la", // List files
      "pwd", // Show working directory
    ];

    // Add specific tests based on what was created
    if (result.filesCreated.includes("package.json")) {
      testCommands.push("npm ls --depth=0");
    }

    for (const command of testCommands) {
      try {
        const output = await this.toolManager.executeTool("run_command", {
          command,
          timeout: 10000,
        });
        result.testsRun.push(command);
        result.validationResults.push(
          `Command '${command}' completed successfully`
        );
      } catch (error) {
        result.errors.push(
          `Test command failed '${command}': ${(error as Error).message}`
        );
      }
    }
  }

  private generateCompletionSummary(
    result: CompletionResult,
    options: CompleteOptions
  ): void {
    const totalFiles = result.filesCreated.length + result.filesModified.length;

    result.summary = `Task completion summary:
- Files created: ${result.filesCreated.length}
- Files modified: ${result.filesModified.length}
- Tests run: ${result.testsRun.length}
- Validation checks: ${result.validationResults.length}
- Errors encountered: ${result.errors.length}
- Success rate: ${result.success ? "100%" : `${Math.round(result.confidence * 100)}%`}

Vision: ${options.vision}
Status: ${result.success ? "COMPLETED SUCCESSFULLY" : "COMPLETED WITH ISSUES"}`;

    // Generate next steps
    if (result.success) {
      result.nextSteps = [
        "Review generated files for accuracy",
        "Test the implementation",
        "Customize as needed",
        "Deploy to production when ready",
      ];
    } else {
      result.nextSteps = [
        "Review error messages",
        "Fix any issues manually",
        "Re-run the agent if needed",
        "Consider breaking down the task into smaller parts",
      ];
    }
  }

  private extractProjectName(options: CompleteOptions): string {
    const workingDir = options.workingDirectory;
    const dirName =
      workingDir.split("/").pop() || workingDir.split("\\").pop() || "project";
    return dirName.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
  }

  // Public methods for monitoring
  getCompletionHistory(): ReadonlyArray<CompletionResult> {
    return [...this.completionHistory];
  }

  getLastCompletion(): CompletionResult | null {
    return this.completionHistory.length > 0
      ? this.completionHistory[this.completionHistory.length - 1]
      : null;
  }

  clearHistory(): void {
    this.completionHistory = [];
  }
}

interface ImplementationStep {
  type: "create_file" | "modify_file" | "create_directory" | "run_command";
  description: string;
  filePath: string;
  priority: number;
  command?: string;
  content?: string;
}
