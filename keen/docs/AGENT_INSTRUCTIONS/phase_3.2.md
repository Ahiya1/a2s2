# Phase 3.2: Agent Core with Validation Tools and Self-Completion

## Overview

Phase 3.2 builds upon Phase 3.1 by adding critical validation capabilities and self-completion features. Agents can now validate their own work, ensure quality standards, and complete tasks independently with comprehensive quality assurance. This phase maintains single-agent execution (no recursive spawning) while adding the validation tools that were excluded in Phase 3.1.

## Key Enhancements from Phase 3.1

### 1. Validation Tool Ecosystem

- **`validate_project`**: Comprehensive project validation and quality checks
- **Code quality validation**: Syntax, style, and best practices
- **Test execution and validation**: Automated testing with coverage analysis
- **Security validation**: Vulnerability scanning and security best practices
- **Performance validation**: Performance testing and optimization recommendations
- **Documentation validation**: Ensure proper documentation standards

### 2. Self-Completion Capabilities

- **Quality gates**: Agents must pass validation before completion
- **Iterative improvement**: Agents can identify and fix issues autonomously
- **Confidence-based completion**: Completion requires minimum confidence thresholds
- **Comprehensive reporting**: Detailed completion reports with validation results

### 3. Enhanced Error Recovery

- **Validation-driven fixes**: Use validation results to guide improvements
- **Incremental validation**: Validate changes as they're made
- **Rollback capabilities**: Revert changes that fail validation
- **Learning from failures**: Adapt approach based on validation feedback

## Complete Tool Ecosystem

### Foundation Tools (Inherited from Phase 3.1)

- **`get_project_tree`**: Project structure analysis
- **`read_files`**: Multi-file reading with error handling
- **`write_files`**: Atomic file writing with rollback
- **`run_command`**: Secure command execution
- **`web_search`**: Information and documentation search
- **`git`**: Full git operations and version control

### Autonomy Tools (Enhanced)

- **`report_phase`**: Phase reporting with validation status
- **`continue_work`**: Continuation planning with validation considerations
- **`report_complete`**: Enhanced completion reporting with validation results

### **New in Phase 3.2: Validation Tools**

#### 1. Project Validation Tool

```typescript
interface ValidateProjectTool {
  name: "validate_project";
  description: "Execute comprehensive project validation and quality checks";

  execute(params: {
    validationType?: "full" | "incremental" | "quick";
    scope?: string[]; // File patterns to validate
    rules?: ValidationRuleSet;
    fixIssues?: boolean; // Attempt automatic fixes
  }): Promise<ValidationResult>;
}

interface ValidationResult {
  overall: "pass" | "fail" | "warning";
  score: number; // 0-100
  categories: {
    syntax: ValidationCategory;
    style: ValidationCategory;
    tests: ValidationCategory;
    security: ValidationCategory;
    performance: ValidationCategory;
    documentation: ValidationCategory;
  };
  issues: ValidationIssue[];
  suggestions: string[];
  autoFixApplied: ValidationFix[];
}
```

#### 2. Code Quality Validation

```typescript
class CodeQualityValidator {
  async validateSyntax(files: string[]): Promise<SyntaxValidationResult> {
    // TypeScript/JavaScript syntax validation
    // Python syntax validation
    // Other language support
    return {
      passed: boolean,
      errors: SyntaxError[],
      warnings: SyntaxWarning[]
    };
  }

  async validateStyle(files: string[]): Promise<StyleValidationResult> {
    // ESLint for JavaScript/TypeScript
    // Prettier for formatting
    // Language-specific linters
    return {
      passed: boolean,
      issues: StyleIssue[],
      fixesApplied: StyleFix[]
    };
  }

  async validateBestPractices(project: ProjectStructure): Promise<BestPracticesResult> {
    // Architecture patterns
    // Security best practices
    // Performance patterns
    // Documentation standards
    return {
      score: number,
      recommendations: Recommendation[],
      criticalIssues: CriticalIssue[]
    };
  }
}
```

#### 3. Test Validation System

```typescript
class TestValidator {
  async executeTests(testSuite: TestSuite): Promise<TestExecutionResult> {
    // Unit test execution
    // Integration test execution
    // E2E test execution (where applicable)
    return {
      passed: boolean,
      total: number,
      failed: number,
      coverage: CoverageReport,
      duration: number,
      results: TestResult[]
    };
  }

  async validateTestCoverage(project: ProjectStructure): Promise<CoverageValidation> {
    // Line coverage analysis
    // Branch coverage analysis
    // Function coverage analysis
    return {
      overall: number,
      byFile: { [filename: string]: number },
      uncoveredLines: UncoveredLine[],
      recommendations: CoverageRecommendation[]
    };
  }

  async generateMissingTests(analysis: ProjectAnalysis): Promise<TestGenerationResult> {
    // Identify untested functions
    // Generate test templates
    // Suggest test scenarios
    return {
      suggestedTests: TestTemplate[],
      criticalGaps: TestingGap[],
      implementations: GeneratedTest[]
    };
  }
}
```

#### 4. Security Validation

```typescript
class SecurityValidator {
  async scanVulnerabilities(project: ProjectStructure): Promise<SecurityScanResult> {
    // Dependency vulnerability scanning
    // Code security analysis
    // Configuration security review
    return {
      vulnerabilities: SecurityVulnerability[],
      severity: 'low' | 'medium' | 'high' | 'critical',
      recommendations: SecurityRecommendation[],
      autoFixesAvailable: SecurityFix[]
    };
  }

  async validateSecurityPractices(codebase: Codebase): Promise<SecurityPracticesResult> {
    // Input validation practices
    // Authentication implementation
    // Authorization patterns
    // Data protection measures
    return {
      score: number,
      practices: SecurityPractice[],
      issues: SecurityIssue[],
      improvements: SecurityImprovement[]
    };
  }
}
```

#### 5. Performance Validation

```typescript
class PerformanceValidator {
  async analyzePerformance(project: ProjectStructure): Promise<PerformanceAnalysis> {
    // Code performance analysis
    // Bundle size analysis
    // Database query optimization
    // Memory usage patterns
    return {
      score: number,
      bottlenecks: PerformanceBottleneck[],
      optimizations: PerformanceOptimization[],
      metrics: PerformanceMetric[]
    };
  }

  async benchmarkCriticalPaths(endpoints: APIEndpoint[]): Promise<BenchmarkResult> {
    // Response time benchmarking
    // Throughput analysis
    // Resource utilization
    return {
      results: BenchmarkMetric[],
      regressions: PerformanceRegression[],
      recommendations: PerformanceRecommendation[]
    };
  }
}
```

## Enhanced Agent Session Architecture

### 1. Validation-Aware Agent Session

```typescript
export class ValidatingAgentSession extends KeenAgentSession {
  private validationEngine: ValidationEngine;
  private qualityGates: QualityGate[];
  private completionCriteria: CompletionCriteria;

  constructor(options: ValidatingAgentSessionOptions) {
    super(options);

    this.validationEngine = new ValidationEngine({
      enableAutoFix: options.enableAutoFix !== false,
      validationRules: options.validationRules || DEFAULT_VALIDATION_RULES,
      qualityThreshold: options.qualityThreshold || 0.8,
    });

    this.setupValidationIntegration();
    this.setupQualityGates();
  }

  private setupValidationIntegration(): void {
    // Integrate validation into phase transitions
    this.on("phaseTransition", this.validatePhaseTransition.bind(this));

    // Validate after major tool operations
    this.on("toolCompleted", this.validateAfterToolUse.bind(this));

    // Final validation before completion
    this.on("beforeCompletion", this.performFinalValidation.bind(this));
  }

  private setupQualityGates(): void {
    this.qualityGates = [
      {
        phase: "EXPLORE",
        criteria: [
          "Project structure analysis complete",
          "Requirements understood",
        ],
        validator: this.validateExplorePhase.bind(this),
      },
      {
        phase: "PLAN",
        criteria: ["Implementation complete", "Basic functionality working"],
        validator: this.validateImplementation.bind(this),
      },
      {
        phase: "SUMMON",
        criteria: ["Implementation complete", "Basic functionality working"],
        validator: this.validateImplementation.bind(this),
      },
      {
        phase: "COMPLETE",
        criteria: [
          "All tests passing",
          "Quality standards met",
          "Documentation complete",
        ],
        validator: this.validateCompletion.bind(this),
      },
    ];
  }

  // Enhanced execution with validation loops
  async execute(vision: string): Promise<AgentSessionResult> {
    const maxValidationIterations = 5;
    let validationIteration = 0;
    let lastValidationResult: ValidationResult | null = null;

    while (validationIteration < maxValidationIterations) {
      // Execute normal agent workflow
      const result = await super.execute(vision);

      if (result.finalPhase === "COMPLETE") {
        // Perform final validation
        lastValidationResult = await this.performComprehensiveValidation();

        if (lastValidationResult.overall === "pass") {
          // Validation passed - agent can complete
          return this.enhanceResultWithValidation(result, lastValidationResult);
        } else if (this.canAutoFix(lastValidationResult)) {
          // Attempt auto-fixes and continue
          await this.applyAutoFixes(lastValidationResult);
          validationIteration++;
          continue;
        } else {
          // Manual fixes needed - provide detailed feedback
          return this.createValidationFailureResult(
            result,
            lastValidationResult
          );
        }
      }

      // If not yet complete, continue normal execution
      return result;
    }

    // Max iterations reached
    return this.createMaxIterationsResult(lastValidationResult);
  }
}
```

### 2. Validation Engine

```typescript
export class ValidationEngine {
  private validators: Map<string, Validator>;
  private autoFixers: Map<string, AutoFixer>;
  private qualityMetrics: QualityMetrics;

  constructor(options: ValidationEngineOptions) {
    this.setupValidators();
    this.setupAutoFixers();
    this.qualityMetrics = new QualityMetrics(options.qualityThreshold);
  }

  async validateProject(
    projectPath: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const validationTasks: Promise<CategoryValidation>[] = [];

    // Syntax validation
    if (options.includeSyntax !== false) {
      validationTasks.push(this.validateSyntax(projectPath));
    }

    // Style validation
    if (options.includeStyle !== false) {
      validationTasks.push(this.validateStyle(projectPath));
    }

    // Test validation
    if (options.includeTests !== false) {
      validationTasks.push(this.validateTests(projectPath));
    }

    // Security validation
    if (options.includeSecurity !== false) {
      validationTasks.push(this.validateSecurity(projectPath));
    }

    // Performance validation
    if (options.includePerformance !== false) {
      validationTasks.push(this.validatePerformance(projectPath));
    }

    // Documentation validation
    if (options.includeDocumentation !== false) {
      validationTasks.push(this.validateDocumentation(projectPath));
    }

    // Execute all validations in parallel
    const categoryResults = await Promise.all(validationTasks);

    // Aggregate results
    return this.aggregateValidationResults(categoryResults, options);
  }

  private async validateSyntax(
    projectPath: string
  ): Promise<CategoryValidation> {
    const syntaxValidator = this.validators.get("syntax")!;
    const files = await this.getSourceFiles(projectPath);

    const issues: ValidationIssue[] = [];
    let totalScore = 0;

    for (const file of files) {
      const result = await syntaxValidator.validate(file);
      issues.push(...result.issues);
      totalScore += result.score;
    }

    return {
      category: "syntax",
      score: files.length > 0 ? totalScore / files.length : 100,
      issues,
      passed: issues.filter((i) => i.severity === "error").length === 0,
    };
  }

  async applyAutoFixes(
    validationResult: ValidationResult
  ): Promise<AutoFixResult> {
    const fixes: AppliedFix[] = [];
    const failedFixes: FailedFix[] = [];

    for (const issue of validationResult.issues) {
      if (issue.autoFixable) {
        const fixer = this.autoFixers.get(issue.type);
        if (fixer) {
          try {
            const fix = await fixer.fix(issue);
            fixes.push(fix);
          } catch (error) {
            failedFixes.push({
              issue,
              error: error.message,
              suggestion: await fixer.getSuggestion(issue),
            });
          }
        }
      }
    }

    return {
      appliedFixes: fixes,
      failedFixes,
      success: failedFixes.length === 0,
    };
  }
}
```

### 3. Quality Gate System

```typescript
export class QualityGateManager {
  private gates: Map<AgentPhase, QualityGate>;

  constructor() {
    this.setupQualityGates();
  }

  private setupQualityGates(): void {
    this.gates = new Map([
      [
        "EXPLORE",
        {
          name: "Exploration Quality Gate",
          criteria: [
            {
              name: "Project structure analyzed",
              weight: 0.3,
              validator: this.validateProjectAnalysis,
            },
            {
              name: "Requirements understood",
              weight: 0.4,
              validator: this.validateRequirementsUnderstanding,
            },
            {
              name: "Technology stack identified",
              weight: 0.2,
              validator: this.validateTechStackAnalysis,
            },
            {
              name: "Implementation plan drafted",
              weight: 0.1,
              validator: this.validatePlanDraft,
            },
          ],
          threshold: 0.8,
        },
      ],

      [
        "SUMMON",
        {
          name: "Implementation Quality Gate",
          criteria: [
            {
              name: "Core functionality implemented",
              weight: 0.4,
              validator: this.validateCoreImplementation,
            },
            {
              name: "Basic tests written",
              weight: 0.2,
              validator: this.validateBasicTesting,
            },
            {
              name: "Code quality standards met",
              weight: 0.2,
              validator: this.validateCodeQuality,
            },
            {
              name: "Documentation updated",
              weight: 0.1,
              validator: this.validateDocumentationUpdates,
            },
            {
              name: "Security considerations addressed",
              weight: 0.1,
              validator: this.validateSecurityConsiderations,
            },
          ],
          threshold: 0.85,
        },
      ],

      [
        "COMPLETE",
        {
          name: "Completion Quality Gate",
          criteria: [
            {
              name: "All tests passing",
              weight: 0.25,
              validator: this.validateAllTests,
            },
            {
              name: "Code coverage adequate",
              weight: 0.15,
              validator: this.validateCodeCoverage,
            },
            {
              name: "Performance acceptable",
              weight: 0.15,
              validator: this.validatePerformance,
            },
            {
              name: "Security scan passed",
              weight: 0.15,
              validator: this.validateSecurityScan,
            },
            {
              name: "Documentation complete",
              weight: 0.15,
              validator: this.validateDocumentationComplete,
            },
            {
              name: "Code style consistent",
              weight: 0.1,
              validator: this.validateCodeStyle,
            },
            {
              name: "No critical issues",
              weight: 0.05,
              validator: this.validateNoCriticalIssues,
            },
          ],
          threshold: 0.9,
        },
      ],
    ]);
  }

  async evaluateGate(
    phase: AgentPhase,
    context: ValidationContext
  ): Promise<GateResult> {
    const gate = this.gates.get(phase);
    if (!gate) {
      throw new Error(`No quality gate defined for phase: ${phase}`);
    }

    const evaluations: CriteriaEvaluation[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const criteria of gate.criteria) {
      const evaluation = await criteria.validator(context);
      evaluations.push({
        criteria: criteria.name,
        score: evaluation.score,
        weight: criteria.weight,
        passed: evaluation.score >= 0.7, // Individual criteria threshold
        issues: evaluation.issues || [],
        suggestions: evaluation.suggestions || [],
      });

      totalScore += evaluation.score * criteria.weight;
      totalWeight += criteria.weight;
    }

    const overallScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    const passed = overallScore >= gate.threshold;

    return {
      gate: gate.name,
      phase,
      passed,
      overallScore,
      threshold: gate.threshold,
      evaluations,
      recommendations: this.generateRecommendations(evaluations, passed),
    };
  }
}
```

## Enhanced Completion System

### 1. Self-Completion Logic

```typescript
export class SelfCompletionManager {
  private completionCriteria: CompletionCriteria;
  private validationEngine: ValidationEngine;
  private confidenceThreshold: number;

  constructor(options: SelfCompletionOptions) {
    this.completionCriteria =
      options.completionCriteria || DEFAULT_COMPLETION_CRITERIA;
    this.validationEngine = new ValidationEngine(options.validationOptions);
    this.confidenceThreshold = options.confidenceThreshold || 0.85;
  }

  async canComplete(
    session: ValidatingAgentSession
  ): Promise<CompletionAssessment> {
    // 1. Check if agent believes work is complete
    const agentConfidence = session.getCurrentConfidence();
    if (agentConfidence < this.confidenceThreshold) {
      return {
        canComplete: false,
        reason: "Agent confidence below threshold",
        requiredActions: [
          "Continue implementation",
          "Address identified issues",
        ],
        confidence: agentConfidence,
      };
    }

    // 2. Validate current state
    const validationResult = await this.validationEngine.validateProject(
      session.getWorkspacePath()
    );

    if (validationResult.overall !== "pass") {
      if (this.hasAutoFixableIssues(validationResult)) {
        // Attempt auto-fixes
        const fixResult =
          await this.validationEngine.applyAutoFixes(validationResult);
        if (fixResult.success) {
          // Re-validate after fixes
          const revalidationResult =
            await this.validationEngine.validateProject(
              session.getWorkspacePath()
            );
          if (revalidationResult.overall === "pass") {
            return {
              canComplete: true,
              autoFixesApplied: fixResult.appliedFixes,
              finalValidation: revalidationResult,
            };
          }
        }
      }

      return {
        canComplete: false,
        reason: "Validation issues require attention",
        validationIssues: validationResult.issues,
        requiredActions: this.generateRequiredActions(validationResult),
      };
    }

    // 3. Check quality gates
    const gateResult = await this.checkQualityGates(session);
    if (!gateResult.passed) {
      return {
        canComplete: false,
        reason: "Quality gates not met",
        gateFailures: gateResult.failures,
        requiredActions: gateResult.recommendations,
      };
    }

    // 4. Verify completion criteria
    const criteriaCheck = await this.verifyCriteria(session);
    if (!criteriaCheck.allMet) {
      return {
        canComplete: false,
        reason: "Completion criteria not satisfied",
        unmetCriteria: criteriaCheck.unmet,
        requiredActions: criteriaCheck.recommendations,
      };
    }

    // All checks passed - agent can complete
    return {
      canComplete: true,
      confidence: agentConfidence,
      validationResult,
      qualityGateResult: gateResult,
      criteriaResult: criteriaCheck,
    };
  }
}
```

### 2. Enhanced Completion Reporting

```typescript
interface Phase32CompletionReport extends CompletionReport {
  validationResults: {
    overall: ValidationResult;
    byCategory: { [category: string]: CategoryValidation };
    autoFixesApplied: AppliedFix[];
    remainingIssues: ValidationIssue[];
  };

  qualityMetrics: {
    codeQualityScore: number;
    testCoverage: number;
    performanceScore: number;
    securityScore: number;
    documentationScore: number;
    overallQualityScore: number;
  };

  qualityGates: {
    [phase: string]: GateResult;
  };

  completionConfidence: number;
  iterativeImprovements: {
    iteration: number;
    issuesFound: number;
    issuesFixed: number;
    improvements: string[];
  }[];

  recommendations: {
    immediate: string[];
    future: string[];
    maintenance: string[];
  };
}
```

## Database Schema Extensions

### Validation Results Storage

```sql
-- Validation results for each session
CREATE TABLE IF NOT EXISTS validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    validation_type VARCHAR(50) NOT NULL, -- 'syntax', 'style', 'tests', etc.
    overall_status VARCHAR(20) NOT NULL, -- 'pass', 'fail', 'warning'
    score DECIMAL(5,2), -- 0-100 score
    issues JSONB DEFAULT '[]'::jsonb,
    auto_fixes_applied JSONB DEFAULT '[]'::jsonb,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quality gate evaluations
CREATE TABLE IF NOT EXISTS quality_gate_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    phase VARCHAR(20) NOT NULL,
    gate_name VARCHAR(100) NOT NULL,
    passed BOOLEAN NOT NULL,
    overall_score DECIMAL(5,2),
    threshold DECIMAL(5,2),
    criteria_evaluations JSONB,
    recommendations JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-fix tracking
CREATE TABLE IF NOT EXISTS auto_fixes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    issue_type VARCHAR(100) NOT NULL,
    file_path TEXT,
    fix_description TEXT,
    before_snippet TEXT,
    after_snippet TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_validation_results_session ON validation_results (session_id);
CREATE INDEX idx_quality_gate_evaluations_session ON quality_gate_evaluations (session_id, phase);
CREATE INDEX idx_auto_fixes_session ON auto_fixes (session_id, success);
```

## API Enhancements

### Validation Endpoints

```typescript
// GET /api/agent/sessions/:id/validation - Get validation status
app.get("/api/agent/sessions/:id/validation", async (req, res) => {
  const { id } = req.params;
  const session = await keen.sessions.getSessionById(id);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const validationResults = await keen.sessions.getValidationResults(id);
  const qualityGates = await keen.sessions.getQualityGateEvaluations(id);

  res.json({
    sessionId: id,
    currentPhase: session.current_phase,
    validationResults,
    qualityGates,
    overallStatus: session.validation_status,
    completionReadiness: await SelfCompletionManager.assessCompletion(session),
  });
});

// POST /api/agent/sessions/:id/validate - Trigger validation
app.post("/api/agent/sessions/:id/validate", async (req, res) => {
  const { id } = req.params;
  const { validationType = "full", autoFix = true } = req.body;

  const session = await keen.sessions.getSessionById(id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const validationEngine = new ValidationEngine({ enableAutoFix: autoFix });
  const result = await validationEngine.validateProject(
    session.workspace_path,
    { validationType }
  );

  // Store results
  await keen.sessions.storeValidationResult(id, result);

  res.json(result);
});

// GET /api/agent/sessions/:id/quality-gates - Get quality gate status
app.get("/api/agent/sessions/:id/quality-gates", async (req, res) => {
  const { id } = req.params;
  const session = await keen.sessions.getSessionById(id);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const gateManager = new QualityGateManager();
  const currentGate = await gateManager.evaluateGate(session.current_phase, {
    sessionId: id,
    workspacePath: session.workspace_path,
  });

  const history = await keen.sessions.getQualityGateHistory(id);

  res.json({
    current: currentGate,
    history,
    overallProgress: await gateManager.calculateOverallProgress(history),
  });
});
```

## Testing Strategy

### Validation System Tests

```typescript
describe("Phase 3.2 Validation System", () => {
  test("Code quality validation detects and fixes issues", async () => {
    const testProject = await createTestProject({
      "src/index.js": `
        function hello() {
          var name="world"  // Style issues
          console.log("Hello " + name);; // Extra semicolon
        }
      `,
    });

    const validator = new CodeQualityValidator();
    const result = await validator.validateStyle([
      testProject + "/src/index.js",
    ]);

    expect(result.passed).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        type: "style",
        message: expect.stringContaining("semicolon"),
      })
    );

    // Apply auto-fixes
    const fixResult = await validator.applyAutoFixes(result.issues);
    expect(fixResult.appliedFixes.length).toBeGreaterThan(0);
  });

  test("Test validation executes and reports coverage", async () => {
    const testProject = await createTestProjectWithTests({
      "src/calculator.js": "export const add = (a, b) => a + b;",
      "test/calculator.test.js": `
        import { add } from '../src/calculator.js';
        test('add function', () => {
          expect(add(2, 3)).toBe(5);
        });
      `,
    });

    const validator = new TestValidator();
    const result = await validator.executeTests({ projectPath: testProject });

    expect(result.passed).toBe(true);
    expect(result.coverage.overall).toBeGreaterThan(0.8);
  });

  test("Security validation identifies vulnerabilities", async () => {
    const vulnerableProject = await createTestProject({
      "package.json": JSON.stringify({
        dependencies: {
          "vulnerable-package": "1.0.0", // Known vulnerable version
        },
      }),
      "src/app.js": `
        app.get('/user/:id', (req, res) => {
          const query = \`SELECT * FROM users WHERE id = \${req.params.id}\`; // SQL injection
          db.query(query, (err, results) => res.json(results));
        });
      `,
    });

    const validator = new SecurityValidator();
    const result = await validator.scanVulnerabilities({
      projectPath: vulnerableProject,
    });

    expect(result.vulnerabilities.length).toBeGreaterThan(0);
    expect(result.vulnerabilities).toContainEqual(
      expect.objectContaining({
        type: "sql-injection",
        severity: "high",
      })
    );
  });
});

describe("Quality Gate System", () => {
  test("Quality gates enforce phase completion standards", async () => {
    const session = new ValidatingAgentSession({
      userId: "test-user",
      vision: "Create a REST API with proper testing",
    });

    const gateManager = new QualityGateManager();

    // Should fail initially
    const initialEvaluation = await gateManager.evaluateGate("COMPLETE", {
      sessionId: session.getSessionId(),
      workspacePath: session.getWorkspacePath(),
    });
    expect(initialEvaluation.passed).toBe(false);

    // Simulate proper implementation
    await session.executeTask("implement-api-with-tests");

    // Should pass after proper implementation
    const finalEvaluation = await gateManager.evaluateGate("COMPLETE", {
      sessionId: session.getSessionId(),
      workspacePath: session.getWorkspacePath(),
    });
    expect(finalEvaluation.passed).toBe(true);
    expect(finalEvaluation.overallScore).toBeGreaterThan(0.9);
  });
});

describe("Self-Completion System", () => {
  test("Agent completes only when validation passes", async () => {
    const session = new ValidatingAgentSession({
      userId: "test-user",
      vision: "Create a Node.js API with comprehensive testing",
      enableAutoFix: true,
    });

    const result = await session.execute(
      "Create a Node.js API with comprehensive testing"
    );

    // Should only complete if validation passes
    if (result.success) {
      expect(result.validationResults.overall).toBe("pass");
      expect(result.qualityMetrics.overallQualityScore).toBeGreaterThan(0.8);
      expect(result.completionConfidence).toBeGreaterThan(0.85);
    }

    // Check that validation results are comprehensive
    expect(result.validationResults.byCategory).toHaveProperty("syntax");
    expect(result.validationResults.byCategory).toHaveProperty("tests");
    expect(result.validationResults.byCategory).toHaveProperty("security");
  });
});
```

## Performance Considerations

### Validation Performance Optimization

```typescript
class ValidationPerformanceOptimizer {
  // Incremental validation - only validate changed files
  async incrementalValidation(
    sessionId: string,
    changedFiles: string[]
  ): Promise<ValidationResult> {
    const previousResults = await this.getPreviousValidationResults(sessionId);
    const incrementalResults = await this.validateFiles(changedFiles);

    return this.mergeValidationResults(previousResults, incrementalResults);
  }

  // Parallel validation execution
  async parallelValidation(projectPath: string): Promise<ValidationResult> {
    const validationTasks = [
      this.validateSyntaxAsync(projectPath),
      this.validateStyleAsync(projectPath),
      this.validateTestsAsync(projectPath),
      this.validateSecurityAsync(projectPath),
    ];

    const results = await Promise.allSettled(validationTasks);
    return this.aggregateParallelResults(results);
  }

  // Validation result caching
  async cachedValidation(
    fileHash: string,
    validationType: string
  ): Promise<ValidationResult | null> {
    const cacheKey = `validation:${validationType}:${fileHash}`;
    return await this.cache.get(cacheKey);
  }
}
```

## Migration from Phase 3.1

### Required Changes

```typescript
// 1. Add validation tools to existing tool registry
class Phase31ToPhase32Migrator {
  async upgradeToolRegistry(toolManager: KeenToolManager): Promise<void> {
    // Add validation tools
    toolManager.registerTool("validate_project", new ProjectValidationTool());

    // Enhance existing completion tool
    const existingCompletion = toolManager.getTool("report_complete");
    toolManager.registerTool(
      "report_complete",
      new EnhancedCompletionTool(existingCompletion)
    );
  }

  // 2. Upgrade database schema
  async upgradeDatabaseSchema(): Promise<void> {
    await keen.database.runMigration("add_validation_tables.sql");
    await keen.database.runMigration("add_quality_gates.sql");
    await keen.database.runMigration("add_auto_fixes.sql");
  }

  // 3. Update existing sessions
  async upgradeExistingSessions(): Promise<void> {
    const activeSessions = await keen.sessions.getActiveSessions();

    for (const session of activeSessions) {
      await this.upgradeSessionToValidation(session);
    }
  }
}
```

## Success Criteria

### Technical Requirements

- [x] Validation tool ecosystem fully functional
- [x] Quality gates enforcing completion standards
- [x] Self-completion with confidence thresholds
- [x] Auto-fix capabilities for common issues
- [x] Comprehensive validation reporting
- [x] Integration with existing Phase 3.1 infrastructure

### Quality Requirements

- [x] Code quality validation with 95%+ accuracy
- [x] Test execution and coverage validation
- [x] Security vulnerability detection
- [x] Performance bottleneck identification
- [x] Documentation completeness validation

### Performance Requirements

- [x] Validation execution < 60 seconds for medium projects
- [x] Incremental validation < 10 seconds
- [x] Auto-fix application < 30 seconds
- [x] Quality gate evaluation < 5 seconds

### Integration Requirements

- [x] Seamless upgrade from Phase 3.1
- [x] Database schema properly extended
- [x] API endpoints enhanced with validation data
- [x] WebSocket streaming includes validation events
- [x] Credit system accounts for validation costs

Phase 3.2 transforms agents from simple task executors into sophisticated quality-aware developers that can validate their own work, ensure high standards, and complete tasks independently with confidence. The validation ecosystem provides comprehensive quality assurance while the self-completion system ensures that agents only finish tasks when they meet rigorous quality standards.

This phase bridges the gap between basic tool execution and truly autonomous development, setting the foundation for Phase 3.3's multi-agent coordination capabilities.
