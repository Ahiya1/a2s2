/**
 * DatabaseService Unit Tests - FIXED VERSION
 * Tests the main database service with initialization and health checks
 */

import { DatabaseService } from "../../src/database/index.js";

// Mock all database dependencies
jest.mock("../../src/database/DatabaseManager.js", () => ({
  DatabaseManager: jest.fn(),
}));
jest.mock("../../src/database/dao/UserDAO.js", () => ({
  UserDAO: jest.fn(),
}));
jest.mock("../../src/database/dao/CreditDAO.js", () => ({
  CreditDAO: jest.fn(),
}));
jest.mock("../../src/database/dao/SessionDAO.js", () => ({
  SessionDAO: jest.fn(),
}));
jest.mock("../../src/database/dao/AnalyticsDAO.js", () => ({
  AnalyticsDAO: jest.fn(),
}));
jest.mock("../../src/database/migrations/run.js", () => ({
  MigrationRunner: jest.fn(),
}));
jest.mock("../../src/database/seeds/run.js", () => ({
  SeedRunner: jest.fn(),
}));
jest.mock("../../src/database/dao/WebSocketDAO.js", () => ({
  WebSocketDAO: jest.fn(),
}));

// Mock console methods to prevent spam during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

describe("DatabaseService", () => {
  let databaseService: DatabaseService;
  let mockDbManager: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock database manager with all required methods
    mockDbManager = {
      testConnection: jest.fn().mockResolvedValue(true),
      healthCheck: jest.fn().mockResolvedValue({
        connected: true,
        poolStats: { totalCount: 10, idleCount: 5, waitingCount: 0 },
        latency: 15,
      }),
      close: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      initialize: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn(),
    };

    // Mock the DatabaseManager constructor
    const {
      DatabaseManager,
    } = require("../../src/database/DatabaseManager.js");
    DatabaseManager.mockImplementation(() => mockDbManager);

    // Mock all DAO constructors
    const { UserDAO } = require("../../src/database/dao/UserDAO.js");
    const { CreditDAO } = require("../../src/database/dao/CreditDAO.js");
    const { SessionDAO } = require("../../src/database/dao/SessionDAO.js");
    const { AnalyticsDAO } = require("../../src/database/dao/AnalyticsDAO.js");
    const { WebSocketDAO } = require("../../src/database/dao/WebSocketDAO.js");

    UserDAO.mockImplementation(() => ({}));
    CreditDAO.mockImplementation(() => ({}));
    SessionDAO.mockImplementation(() => ({}));
    AnalyticsDAO.mockImplementation(() => ({}));
    WebSocketDAO.mockImplementation(() => ({}));

    databaseService = new DatabaseService();
  });

  describe("constructor", () => {
    it("should initialize all DAOs", () => {
      expect(databaseService.users).toBeDefined();
      expect(databaseService.credits).toBeDefined();
      expect(databaseService.sessions).toBeDefined();
      expect(databaseService.analytics).toBeDefined();
      expect(databaseService.websockets).toBeDefined();
    });

    it("should create database manager instance", () => {
      const {
        DatabaseManager,
      } = require("../../src/database/DatabaseManager.js");
      expect(DatabaseManager).toHaveBeenCalled();
    });
  });

  describe("initialize", () => {
    it("should handle successful initialization", async () => {
      // Import the mocked constructors
      const { MigrationRunner } = await import(
        "../../src/database/migrations/run.js"
      );
      const { SeedRunner } = await import("../../src/database/seeds/run.js");

      const mockMigrationRunner = {
        runMigrations: jest.fn().mockResolvedValue(undefined),
      };
      const mockSeedRunner = {
        runSeeds: jest.fn().mockResolvedValue(undefined),
        validateSeeds: jest.fn().mockResolvedValue(true),
      };

      // Setup constructor mocks
      (MigrationRunner as jest.Mock).mockImplementation(
        () => mockMigrationRunner
      );
      (SeedRunner as jest.Mock).mockImplementation(() => mockSeedRunner);

      const service = new DatabaseService();
      await service.initialize();

      expect(console.log).toHaveBeenCalledWith(
        "🚀 Initializing keen database..."
      );
      expect(console.log).toHaveBeenCalledWith(
        "✅ keen database initialized successfully!"
      );
    });

    it("should handle migration failures", async () => {
      const { MigrationRunner } = await import(
        "../../src/database/migrations/run.js"
      );

      const migrationError = new Error("Migration failed");
      const mockMigrationRunner = {
        runMigrations: jest.fn().mockRejectedValue(migrationError),
      };

      (MigrationRunner as jest.Mock).mockImplementation(
        () => mockMigrationRunner
      );

      const service = new DatabaseService();

      await expect(service.initialize()).rejects.toThrow("Migration failed");
      expect(console.error).toHaveBeenCalledWith(
        "❌ Database initialization failed:",
        migrationError
      );
    });

    it("should handle seed validation failures", async () => {
      const { MigrationRunner } = await import("../../src/database/migrations/run.js");
      const { SeedRunner } = await import("../../src/database/seeds/run.js");
      
      const mockMigrationRunner = {
        runMigrations: jest.fn().mockResolvedValue(undefined),
      };
      const mockSeedRunner = {
        runSeeds: jest.fn().mockResolvedValue(undefined),
        validateSeeds: jest.fn().mockResolvedValue(false), // Validation fails
      };

      (MigrationRunner as jest.Mock).mockImplementation(() => mockMigrationRunner);
      (SeedRunner as jest.Mock).mockImplementation(() => mockSeedRunner);

      const service = new DatabaseService();

      await expect(service.initialize()).rejects.toThrow(
        "Database initialization validation failed"
      );
    });
  });

  describe("testConnection", () => {
    it("should return connection test result", async () => {
      const result = await databaseService.testConnection();

      expect(result).toBe(true);
      expect(mockDbManager.testConnection).toHaveBeenCalled();
    });

    it("should return false for failed connection", async () => {
      mockDbManager.testConnection.mockResolvedValue(false);

      const result = await databaseService.testConnection();

      expect(result).toBe(false);
    });

    it("should handle connection errors", async () => {
      const connectionError = new Error("Connection failed");
      mockDbManager.testConnection.mockRejectedValue(connectionError);

      await expect(databaseService.testConnection()).rejects.toThrow(
        "Connection failed"
      );
    });
  });

  describe("getDatabaseManager", () => {
    it("should return database manager instance", () => {
      const dbManager = databaseService.getDatabaseManager();
      expect(dbManager).toBe(mockDbManager);
    });
  });

  describe("getHealthStatus", () => {
    it("should return health status from database manager", async () => {
      const health = await databaseService.getHealthStatus();

      expect(health.connected).toBe(true);
      expect(health.poolStats.totalCount).toBe(10);
      expect(health.latency).toBe(15);
      expect(mockDbManager.healthCheck).toHaveBeenCalled();
    });

    it("should handle health check failures", async () => {
      const healthError = new Error("Health check failed");
      mockDbManager.healthCheck.mockRejectedValue(healthError);

      await expect(databaseService.getHealthStatus()).rejects.toThrow(
        "Health check failed"
      );
    });
  });

  describe("executeRawQuery", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("should execute raw query in test environment", async () => {
      process.env.NODE_ENV = "test";
      const mockResult = [{ id: 1, name: "test" }];
      mockDbManager.query.mockResolvedValue(mockResult);

      const result = await databaseService.executeRawQuery(
        "SELECT * FROM test",
        ["param"]
      );

      expect(result).toEqual(mockResult);
      expect(mockDbManager.query).toHaveBeenCalledWith("SELECT * FROM test", [
        "param",
      ]);
    });

    it("should throw error in non-test environment", async () => {
      process.env.NODE_ENV = "production";

      await expect(
        databaseService.executeRawQuery("SELECT * FROM test")
      ).rejects.toThrow(
        "Raw query execution is only allowed in test environment"
      );
    });

    it("should throw error when NODE_ENV is undefined", async () => {
      delete process.env.NODE_ENV;

      await expect(
        databaseService.executeRawQuery("SELECT * FROM test")
      ).rejects.toThrow(
        "Raw query execution is only allowed in test environment"
      );
    });

    it("should handle query execution errors in test environment", async () => {
      process.env.NODE_ENV = "test";
      const queryError = new Error("Query execution failed");
      mockDbManager.query.mockRejectedValue(queryError);

      await expect(
        databaseService.executeRawQuery("SELECT * FROM test")
      ).rejects.toThrow("Query execution failed");
    });
  });

  describe("close", () => {
    it("should close database connections", async () => {
      await databaseService.close();

      expect(mockDbManager.close).toHaveBeenCalled();
    });

    it("should handle close failures", async () => {
      const closeError = new Error("Close failed");
      mockDbManager.close.mockRejectedValue(closeError);

      await expect(databaseService.close()).rejects.toThrow("Close failed");
    });
  });

  describe("error handling paths", () => {
    it("should handle database manager initialization failure", () => {
      const {
        DatabaseManager,
      } = require("../../src/database/DatabaseManager.js");
      DatabaseManager.mockImplementation(() => {
        throw new Error("DB Manager creation failed");
      });

      expect(() => new DatabaseService()).toThrow("DB Manager creation failed");
    });

    it("should handle DAO initialization failures", () => {
      const { UserDAO } = require("../../src/database/dao/UserDAO.js");
      UserDAO.mockImplementation(() => {
        throw new Error("UserDAO creation failed");
      });

      expect(() => new DatabaseService()).toThrow("UserDAO creation failed");
    });
  });

  describe("environment-specific behavior", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("should behave consistently in development environment", async () => {
      process.env.NODE_ENV = "development";

      const result = await databaseService.testConnection();
      expect(result).toBe(true);
    });

    it("should restrict raw queries in production environment", async () => {
      process.env.NODE_ENV = "production";

      await expect(databaseService.executeRawQuery("SELECT 1")).rejects.toThrow(
        "Raw query execution is only allowed in test environment"
      );
    });

    it("should handle undefined NODE_ENV gracefully", async () => {
      delete process.env.NODE_ENV;

      await expect(databaseService.executeRawQuery("SELECT 1")).rejects.toThrow(
        "Raw query execution is only allowed in test environment"
      );
    });
  });

  describe("service integration", () => {
    it("should provide access to all DAO services", () => {
      expect(databaseService.users).toBeDefined();
      expect(databaseService.credits).toBeDefined();
      expect(databaseService.sessions).toBeDefined();
      expect(databaseService.analytics).toBeDefined();
      expect(databaseService.websockets).toBeDefined();
    });

    it("should maintain consistent database manager reference", () => {
      const dbManager1 = databaseService.getDatabaseManager();
      const dbManager2 = databaseService.getDatabaseManager();

      expect(dbManager1).toBe(dbManager2);
    });
  });

  describe("async operations", () => {
    it("should handle concurrent operations gracefully", async () => {
      const promises = [
        databaseService.testConnection(),
        databaseService.getHealthStatus(),
        databaseService.testConnection(),
      ];

      const results = await Promise.all(promises);

      expect(results[0]).toBe(true); // testConnection
      expect(results[1]).toHaveProperty("connected", true); // healthStatus
      expect(results[2]).toBe(true); // testConnection again
    });

    it("should handle mixed success/failure scenarios", async () => {
      // Make health check fail but connection succeed
      mockDbManager.healthCheck.mockRejectedValue(
        new Error("Health check failed")
      );

      const connectionResult = await databaseService.testConnection();
      expect(connectionResult).toBe(true);

      await expect(databaseService.getHealthStatus()).rejects.toThrow(
        "Health check failed"
      );
    });
  });
});
