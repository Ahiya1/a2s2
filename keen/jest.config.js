/**
 * Jest Configuration for keen Database Layer
 * Supports unit, integration, security, and performance testing
 */

export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapping: {
    '^(\\.\\.?\\/.+)\\.js$': '$1',
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/database/migrations/run.ts',
    '!src/database/seeds/run.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000, // 30 seconds for integration tests
  maxWorkers: 4, // Limit concurrent workers for database tests
  
  // Test environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Coverage reporting
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov'
  ],
  
  // Transform configuration for ES modules
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: {
        module: 'ESNext'
      }
    }
  },
  
  // Test patterns for different test types
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      testTimeout: 10000
    },
    {
      displayName: 'Integration Tests', 
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      testTimeout: 30000
    },
    {
      displayName: 'Security Tests',
      testMatch: ['<rootDir>/tests/security/**/*.test.ts'],
      testTimeout: 20000
    },
    {
      displayName: 'Performance Tests',
      testMatch: ['<rootDir>/tests/performance/**/*.test.ts'],
      testTimeout: 60000
    }
  ]
};
