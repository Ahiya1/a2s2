/**
 * Jest configuration for Phase 1 tests only
 * Focused testing for database layer, agent integration, and CLI
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true
    }]
  },
  testMatch: [
    '**/tests/phase1/**/*.test.ts',
    '**/tests/phase1/**/*.test.tsx'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage/phase1',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  testTimeout: 30000, // 30 second timeout for database operations
  verbose: true,
  
  // Phase 1 specific settings
  displayName: 'Phase 1 Tests',
  
  // Only run Phase 1 tests
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/tests/api/',
    '<rootDir>/tests/integration/',
    '<rootDir>/tests/performance/',
    '<rootDir>/tests/security/',
    '<rootDir>/tests/unit/(?!.*phase1).*' // Exclude other unit tests
  ]
};
