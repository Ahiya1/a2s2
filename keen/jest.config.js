/**
 * Jest Configuration for keen API Gateway Tests
 * Modern ESM configuration
 */

export default {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/tests/unit/**/*.test.ts",
    "<rootDir>/tests/api/**/*.test.ts",
  ],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts",
    "!src/database/migrations/run.ts",
    "!src/database/seeds/run.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40,
    },
  },
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testTimeout: 30000,
  verbose: true,
  
  // Modern transform configuration 
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  
  // Module mapping for ESM
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
