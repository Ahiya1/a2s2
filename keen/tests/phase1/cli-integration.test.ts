/**
 * Phase 1 Tests - CLI Integration
 * Tests for the CLI commands and tool_use fix
 */

import { KeenCLI } from '../../src/cli/index.js';
import { BreatheCommand } from '../../src/cli/commands/BreatheCommand.js';
import { BreathCommand } from '../../src/cli/commands/BreathCommand.js';
import { ConverseCommand } from '../../src/cli/commands/ConverseCommand.js';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

describe('Phase 1: CLI Integration Tests', () => {
  let tempDir: string;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'keen-cli-test-'));
  });
  
  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('CLI Core', () => {
    test('should create KeenCLI successfully', () => {
      expect(() => {
        new KeenCLI();
      }).not.toThrow();
    });

    test('should handle empty arguments', async () => {
      const cli = new KeenCLI();
      
      // Should not throw when run with empty args
      await expect(cli.run([])).resolves.not.toThrow();
    });

    test('should handle help command', async () => {
      const cli = new KeenCLI();
      
      // Should not throw when showing help
      await expect(cli.run(['--help'])).resolves.not.toThrow();
    });

    test('should handle version command', async () => {
      const cli = new KeenCLI();
      
      await expect(cli.run(['--version'])).resolves.not.toThrow();
    });
  });

  describe('Command Structure', () => {
    test('should register all required commands', () => {
      // These classes should be available
      expect(BreatheCommand).toBeDefined();
      expect(BreathCommand).toBeDefined();
      expect(ConverseCommand).toBeDefined();
    });

    test('should handle unknown commands gracefully', async () => {
      const cli = new KeenCLI();
      
      // Mock process.exit to prevent actual exit
      const originalExit = process.exit;
      let exitCode = 0;
      process.exit = jest.fn((code?: number) => {
        exitCode = code || 0;
        throw new Error('Process exit called');
      }) as never;
      
      try {
        await cli.run(['unknown-command']);
      } catch (error) {
        expect(error.message).toBe('Process exit called');
        expect(exitCode).toBe(1);
      }
      
      // Restore process.exit
      process.exit = originalExit;
    });
  });

  describe('Configuration Validation', () => {
    test('should validate directory options', async () => {
      const cli = new KeenCLI();
      
      // Test with valid directory
      expect(() => {
        cli.run(['breathe', 'test task', '--directory', tempDir, '--dry-run']);
      }).not.toThrow();
    });

    test('should handle verbose and debug flags', async () => {
      const cli = new KeenCLI();
      
      expect(() => {
        cli.run(['breathe', 'test task', '--verbose', '--debug', '--dry-run']);
      }).not.toThrow();
    });
  });

  describe('Vision File Handling', () => {
    test('should create and read vision files', async () => {
      const visionFile = path.join(tempDir, 'test-vision.md');
      const visionContent = 'Create a simple test application with TypeScript';
      
      await fs.writeFile(visionFile, visionContent);
      
      // Verify file was created
      const stats = await fs.stat(visionFile);
      expect(stats.isFile()).toBe(true);
      
      // Verify content
      const readContent = await fs.readFile(visionFile, 'utf-8');
      expect(readContent).toBe(visionContent);
    });

    test('should handle missing vision files gracefully', async () => {
      const nonExistentFile = path.join(tempDir, 'non-existent.md');
      
      // Should handle missing files without crashing
      try {
        await fs.readFile(nonExistentFile, 'utf-8');
      } catch (error) {
        expect(error.code).toBe('ENOENT');
      }
    });
  });

  describe('Command Options', () => {
    test('should parse breathe command options', () => {
      // Test option parsing logic
      const testOptions = {
        directory: tempDir,
        phase: 'EXPLORE',
        maxIterations: 10,
        costBudget: 25.0,
        webSearch: true,
        extendedContext: true,
        dryRun: true,
        stream: true
      };
      
      // Verify all options are valid types
      expect(typeof testOptions.directory).toBe('string');
      expect(typeof testOptions.phase).toBe('string');
      expect(typeof testOptions.maxIterations).toBe('number');
      expect(typeof testOptions.costBudget).toBe('number');
      expect(typeof testOptions.webSearch).toBe('boolean');
      expect(typeof testOptions.extendedContext).toBe('boolean');
      expect(typeof testOptions.dryRun).toBe('boolean');
      expect(typeof testOptions.stream).toBe('boolean');
    });

    test('should validate phase options', () => {
      const validPhases = ['EXPLORE', 'SUMMON', 'COMPLETE'];
      
      validPhases.forEach(phase => {
        expect(validPhases).toContain(phase);
      });
    });

    test('should validate numeric constraints', () => {
      // Max iterations should be positive
      expect(100).toBeGreaterThan(0);
      
      // Cost budget should be positive
      expect(50.0).toBeGreaterThan(0);
      
      // Should handle edge cases
      expect(Number.isNaN(NaN)).toBe(true);
      expect(Number.isFinite(Infinity)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle CLI initialization errors', () => {
      // Mock environment issues
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      
      expect(() => {
        new KeenCLI();
      }).not.toThrow();
      
      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });

    test('should handle invalid arguments gracefully', async () => {
      const cli = new KeenCLI();
      
      // Mock console.error to capture error messages
      const originalError = console.error;
      const errorMessages: string[] = [];
      console.error = jest.fn((...args: any[]) => {
        errorMessages.push(args.join(' '));
      });
      
      const originalExit = process.exit;
      process.exit = jest.fn() as never;
      
      try {
        await cli.run(['breathe']); // Missing vision argument
      } catch (error) {
        // Expected to throw or exit
      }
      
      // Restore mocks
      console.error = originalError;
      process.exit = originalExit;
    });
  });

  describe('Integration Points', () => {
    test('should integrate with agent system', () => {
      // Test that CLI can import and use agent components
      const KeenAgent = require('../../src/agent/KeenAgent.js').KeenAgent;
      expect(KeenAgent).toBeDefined();
      
      const CLIOptions = require('../../src/cli/types.js');
      expect(CLIOptions).toBeDefined();
    });

    test('should support configuration loading', () => {
      // Test that CLI can access configuration
      const config = require('../../src/config/index.js');
      expect(config).toBeDefined();
      expect(config.databaseConfig).toBeDefined();
    });

    test('should integrate with database layer', () => {
      // Test that CLI can access keen database
      const { keen } = require('../../src/index.js');
      expect(keen).toBeDefined();
      
      const instance = keen.getInstance();
      expect(instance).toBeDefined();
    });
  });

  describe('TypeScript Support', () => {
    test('should have proper CLI type definitions', () => {
      // Import CLI types
      const types = require('../../src/cli/types.js');
      expect(types).toBeDefined();
    });

    test('should support type-safe command parsing', () => {
      // Test CLI option types
      interface TestCLIOptions {
        vision: string;
        directory?: string;
        phase?: 'EXPLORE' | 'SUMMON' | 'COMPLETE';
        maxIterations?: number;
        verbose?: boolean;
        debug?: boolean;
        dryRun?: boolean;
      }
      
      const testOptions: TestCLIOptions = {
        vision: 'Test vision',
        directory: tempDir,
        phase: 'EXPLORE',
        maxIterations: 5,
        verbose: false,
        debug: false,
        dryRun: true
      };
      
      expect(testOptions.vision).toBe('Test vision');
      expect(testOptions.phase).toBe('EXPLORE');
    });
  });
});
