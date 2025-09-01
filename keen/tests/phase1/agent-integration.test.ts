/**
 * Phase 1 Tests - Agent Integration
 * Tests for the fixed agent execution and tool system
 */

import { KeenAgent } from '../../src/agent/KeenAgent.js';
import { ToolManager } from '../../src/agent/tools/ToolManager.js';
import { AgentSession } from '../../src/agent/AgentSession.js';
import { CLIOptions } from '../../src/cli/types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

describe('Phase 1: Agent Integration Tests', () => {
  let tempDir: string;
  
  beforeEach(async () => {
    // Create temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'keen-test-'));
  });
  
  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Agent Core', () => {
    test('should create KeenAgent successfully', () => {
      const options: CLIOptions = {
        vision: 'Create a simple test file',
        directory: tempDir,
        phase: 'EXPLORE',
        maxIterations: 5,
        costBudget: 10,
        webSearch: false,
        extendedContext: true,
        stream: false,
        verbose: false,
        debug: false,
        dryRun: true // Use dry run for tests
      };
      
      expect(() => {
        new KeenAgent(options);
      }).not.toThrow();
    });

    test('should validate required environment variables', () => {
      const originalApiKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      
      const options: CLIOptions = {
        vision: 'Test task',
        directory: tempDir,
        maxIterations: 1
      };
      
      expect(() => {
        new KeenAgent(options);
      }).toThrow('ANTHROPIC_API_KEY environment variable is required');
      
      // Restore API key
      if (originalApiKey) {
        process.env.ANTHROPIC_API_KEY = originalApiKey;
      }
    });

    test('should handle configuration properly', () => {
      // Set a test API key for this test
      process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';
      
      const options: CLIOptions = {
        vision: 'Test configuration',
        directory: tempDir,
        phase: 'EXPLORE',
        maxIterations: 1,
        webSearch: true,
        extendedContext: true,
        stream: true,
        dryRun: true
      };
      
      const agent = new KeenAgent(options);
      expect(agent).toBeDefined();
    });
  });

  describe('Tool Manager', () => {
    let toolManager: ToolManager;
    
    beforeEach(() => {
      toolManager = new ToolManager({
        workingDirectory: tempDir,
        enableWebSearch: false, // Disable for tests
        debug: false
      });
    });

    test('should initialize with Phase 3.1 tools', () => {
      expect(toolManager).toBeDefined();
      
      const availableTools = toolManager.getAvailableTools();
      
      // Should have foundation tools
      expect(availableTools).toContain('get_project_tree');
      expect(availableTools).toContain('read_files');
      expect(availableTools).toContain('write_files');
      expect(availableTools).toContain('run_command');
      
      // Should have git tools
      expect(availableTools).toContain('git');
      
      // Should have autonomy tools
      expect(availableTools).toContain('report_phase');
      expect(availableTools).toContain('continue_work');
      expect(availableTools).toContain('report_complete');
      
      // Should NOT have validation tools (excluded in Phase 3.1)
      expect(availableTools).not.toContain('validate_project');
      expect(availableTools).not.toContain('summon_agent');
    });

    test('should generate proper tool schemas', () => {
      const schemas = toolManager.getToolSchemas();
      
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
      
      // Check schema structure
      schemas.forEach(schema => {
        expect(schema).toHaveProperty('name');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('input_schema');
        expect(typeof schema.name).toBe('string');
        expect(typeof schema.description).toBe('string');
        expect(schema.input_schema).toHaveProperty('type');
        expect(schema.input_schema.type).toBe('object');
      });
    });

    test('should provide tool descriptions', () => {
      const descriptions = toolManager.getToolDescriptions();
      
      expect(Array.isArray(descriptions)).toBe(true);
      expect(descriptions.length).toBeGreaterThan(0);
      
      descriptions.forEach(desc => {
        expect(desc).toHaveProperty('name');
        expect(desc).toHaveProperty('description');
        expect(typeof desc.name).toBe('string');
        expect(typeof desc.description).toBe('string');
      });
    });

    test('should validate tool parameters', () => {
      // Test valid tool
      const validationResult = toolManager.validateToolParameters('report_phase', {
        phase: 'EXPLORE',
        summary: 'Test summary'
      });
      
      expect(validationResult).toHaveProperty('valid');
      expect(validationResult).toHaveProperty('errors');
      expect(Array.isArray(validationResult.errors)).toBe(true);
    });

    test('should handle unknown tools', () => {
      const validationResult = toolManager.validateToolParameters('unknown_tool', {});
      
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors).toContain('Unknown tool: unknown_tool');
    });

    test('should check tool availability', () => {
      expect(toolManager.hasTool('get_project_tree')).toBe(true);
      expect(toolManager.hasTool('report_complete')).toBe(true);
      expect(toolManager.hasTool('unknown_tool')).toBe(false);
      expect(toolManager.hasTool('validate_project')).toBe(false); // Excluded in Phase 3.1
    });
  });

  describe('Agent Session', () => {
    test('should create session successfully', () => {
      const options = {
        sessionId: 'test-session-123',
        vision: 'Test vision',
        workingDirectory: tempDir,
        anthropicConfig: {
          model: 'claude-sonnet-4-20250514',
          maxTokens: 8000,
          enableExtendedContext: true,
          enableInterleaved: true
        },
        dryRun: true,
        verbose: false,
        debug: false
      };
      
      const session = new AgentSession(options);
      expect(session).toBeDefined();
      expect(session.getSessionId()).toBe('test-session-123');
    });

    test('should handle session lifecycle', async () => {
      const session = new AgentSession({
        sessionId: 'test-session-lifecycle',
        vision: 'Test lifecycle',
        workingDirectory: tempDir,
        anthropicConfig: {
          model: 'claude-sonnet-4-20250514',
          maxTokens: 8000,
          enableExtendedContext: true,
          enableInterleaved: true
        },
        dryRun: true,
        verbose: false,
        debug: false
      });
      
      // Start session
      await session.start();
      
      // Session should be active
      expect(session.getSessionId()).toBe('test-session-lifecycle');
      expect(session.getCurrentPhase()).toBe('EXPLORE');
      expect(session.getDuration()).toBeGreaterThan(0);
    });

    test('should update phases correctly', async () => {
      const session = new AgentSession({
        sessionId: 'test-phase-updates',
        vision: 'Test phases',
        workingDirectory: tempDir,
        anthropicConfig: {
          model: 'claude-sonnet-4-20250514',
          maxTokens: 8000,
          enableExtendedContext: true,
          enableInterleaved: true
        },
        dryRun: true,
        verbose: false,
        debug: false
      });
      
      await session.start();
      
      // Initial phase
      expect(session.getCurrentPhase()).toBe('EXPLORE');
      
      // Update to COMPLETE
      session.updatePhase('COMPLETE');
      expect(session.getCurrentPhase()).toBe('COMPLETE');
      
      // Check execution log
      const executionLog = session.getExecutionLog();
      expect(executionLog.length).toBeGreaterThan(0);
      
      const phaseTransition = executionLog.find(log => log.eventType === 'phase_transition');
      expect(phaseTransition).toBeDefined();
      expect(phaseTransition.data.from).toBe('EXPLORE');
      expect(phaseTransition.data.to).toBe('COMPLETE');
    });

    test('should save session data', async () => {
      const session = new AgentSession({
        sessionId: 'test-session-save',
        vision: 'Test saving',
        workingDirectory: tempDir,
        anthropicConfig: {
          model: 'claude-sonnet-4-20250514',
          maxTokens: 8000,
          enableExtendedContext: true,
          enableInterleaved: true
        },
        dryRun: true,
        verbose: false,
        debug: false
      });
      
      await session.start();
      
      // Save session
      const savedPath = await session.saveSession(tempDir);
      expect(savedPath).toBeDefined();
      
      // Check file exists
      const stats = await fs.stat(savedPath);
      expect(stats.isFile()).toBe(true);
      
      // Load and verify content
      const sessionData = await AgentSession.loadSession(savedPath);
      expect(sessionData).toBeDefined();
      expect(sessionData.sessionId).toBe('test-session-save');
      expect(sessionData.vision).toBe('Test saving');
    });
  });

  describe('Tool Execution (Mock Tests)', () => {
    let toolManager: ToolManager;
    
    beforeEach(() => {
      toolManager = new ToolManager({
        workingDirectory: tempDir,
        enableWebSearch: false,
        debug: false
      });
    });

    test('should execute report_phase tool', async () => {
      const context = {
        sessionId: 'test-session',
        workingDirectory: tempDir,
        dryRun: true,
        verbose: false
      };
      
      const result = await toolManager.executeTool(
        'report_phase',
        {
          phase: 'EXPLORE',
          summary: 'Testing phase reporting',
          confidence: 0.8
        },
        context
      );
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.phase).toBe('EXPLORE');
      expect(result.summary).toBe('Testing phase reporting');
    });

    test('should execute continue_work tool', async () => {
      const context = {
        sessionId: 'test-session',
        workingDirectory: tempDir,
        dryRun: true,
        verbose: false
      };
      
      const result = await toolManager.executeTool(
        'continue_work',
        {
          nextAction: 'Test next action',
          reasoning: 'Testing continuation',
          estimatedDuration: '5 minutes'
        },
        context
      );
      
      expect(result).toBeDefined();
      expect(result.nextAction).toBe('Test next action');
    });

    test('should handle tool execution errors', async () => {
      const context = {
        sessionId: 'test-session',
        workingDirectory: tempDir,
        dryRun: true,
        verbose: false
      };
      
      // Test with invalid parameters
      await expect(
        toolManager.executeTool(
          'report_phase',
          {}, // Missing required parameters
          context
        )
      ).rejects.toThrow();
    });

    test('should handle unknown tool execution', async () => {
      const context = {
        sessionId: 'test-session',
        workingDirectory: tempDir,
        dryRun: true,
        verbose: false
      };
      
      await expect(
        toolManager.executeTool('unknown_tool', {}, context)
      ).rejects.toThrow('Unknown tool: unknown_tool');
    });
  });

  describe('TypeScript Integration', () => {
    test('should have proper type definitions', () => {
      // Test that TypeScript types work correctly
      const options: CLIOptions = {
        vision: 'Type test',
        directory: tempDir,
        phase: 'EXPLORE',
        maxIterations: 1,
        costBudget: 1,
        webSearch: true,
        extendedContext: true,
        stream: false,
        verbose: false,
        debug: false,
        dryRun: true
      };
      
      // This should compile without TypeScript errors
      expect(options.vision).toBe('Type test');
      expect(options.phase).toBe('EXPLORE');
    });
  });
});
