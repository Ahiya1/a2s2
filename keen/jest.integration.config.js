/**
 * Jest Configuration for keen Database Integration Tests
 * Requires PostgreSQL database to be running
 */

export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.\\.?\\/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '<rootDir>/tests/integration/**/*.test.ts', 
    '<rootDir>/tests/security/**/*.test.ts',
    '<rootDir>/tests/performance/**/*.test.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/database/migrations/run.ts',
    '!src/database/seeds/run.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 60000, // 60 seconds for integration tests
  maxWorkers: 2, // Limit concurrent workers for database tests
  
  // Test environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Coverage reporting
  coverageDirectory: 'coverage-integration',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov'
  ],
  
  // Modern transform configuration for ES modules
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ES2022',
        target: 'ES2022'
      }
    }]
  },
  
  // Exclude migration runner from Jest compilation
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/src/database/migrations/run.ts',
    '/src/database/seeds/run.ts'
  ],
  
  // Module paths to ignore during transformation
  transformIgnorePatterns: [
    'node_modules/(?!.*\\.mjs$)'
  ]
};
