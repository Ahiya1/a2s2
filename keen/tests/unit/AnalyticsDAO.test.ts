/**
 * AnalyticsDAO Unit Tests - FIXED VERSION
 * Tests analytics management with proper database mocking
 */

import Decimal from "decimal.js";
import {
  DatabaseManager,
  UserContext,
} from "../../src/database/DatabaseManager.js";
import {
  AnalyticsDAO,
  AnalyticsUpdate,
  DailyAnalytics,
} from "../../src/database/dao/AnalyticsDAO.js";

// Mock DatabaseManager
class MockDatabaseManager {
  public analyticsData: any[] = [];
  public sessionData: any[] = [];
  public userData: any[] = [];
  public creditData: any[] = [];

  async query<T = any>(
    text: string,
    params?: any[],
    context?: UserContext
  ): Promise<T[]> {
    // Handle daily analytics queries
    if (
      text.includes("SELECT * FROM daily_analytics") &&
      text.includes("WHERE date_bucket BETWEEN")
    ) {
      const [startDate, endDate] = params || [];

      // Create sample analytics data for the test
      const sampleData = {
        id: "analytics-123",
        user_id: context?.userId || null,
        date_bucket: new Date(startDate),
        sessions_started: 5,
        sessions_completed: 4,
        sessions_failed: 1,
        total_session_time_seconds: 1200,
        agents_spawned: 10,
        max_recursion_depth: 3,
        tool_executions: 25,
        unique_tools_used: ["git", "filesystem", "editor"],
        total_tokens_consumed: 15000,
        total_cost: "12.50",
        claude_api_cost: "10.00",
        files_modified: 8,
        files_created: 3,
        git_operations: 5,
        admin_bypass_usage: "0.00",
        created_at: new Date(),
      };

      return [sampleData] as T[];
    }

    // Handle user analytics summary
    if (
      text.includes("COUNT(*) as total_sessions") &&
      text.includes("WHERE user_id = $1")
    ) {
      const userId = params?.[0];

      // Return mock summary data
      const summaryData = {
        total_sessions: "10",
        completed_sessions: "8",
        total_cost: "50.00",
        total_tokens: "25000",
        avg_duration: "300",
        last_active: new Date(),
      };

      return [summaryData] as T[];
    }

    // Handle platform metrics queries
    if (text.includes("COUNT(*) as total_users")) {
      return [
        {
          total_users: "100",
          active_users: "25",
          admin_users: "3",
        },
      ] as T[];
    }

    // Handle getPlatformMetrics session query (returns both total and active)
    if (text.includes("COUNT(*) as total_sessions") && !text.includes("WHERE start_time > NOW() - INTERVAL '1 hour'")) {
      return [
        {
          total_sessions: "500",
          active_sessions: "15",
        },
      ] as T[];
    }

    if (text.includes("SUM(CASE WHEN amount < 0")) {
      return [
        {
          total_credits_consumed: "1000.00",
          total_revenue: "2500.00",
          total_claude_costs: "800.00",
          admin_bypass_total: "150.00",
        },
      ] as T[];
    }

    // Handle system health session query (MOVED BEFORE more general handlers)
    if (
      text.includes("COUNT(*) FILTER (WHERE execution_status = 'running') as active_sessions") &&
      text.includes("FROM agent_sessions") &&
      text.includes("WHERE start_time > NOW() - INTERVAL '1 hour'") &&
      text.includes("avg_response_time") &&
      text.includes("error_rate")
    ) {
      return [
        {
          active_sessions: "12", // Return as string (AnalyticsDAO calls parseInt on it)
          avg_response_time: "250",
          error_rate: "0.05",
        },
      ] as T[];
    }

    if (text.includes("AVG(EXTRACT(EPOCH FROM") && text.includes("WHERE end_time IS NOT NULL")) {
      return [
        {
          avg_duration: "450",
        },
      ] as T[];
    }

    if (text.includes("GROUP BY git_branch")) {
      return [
        { git_branch: "main", session_count: "10", success_rate: "0.9" },
        { git_branch: "feature", session_count: "5", success_rate: "0.8" },
      ] as T[];
    }
    
    // Handle getPlatformMetrics session query (general case)
    if (
      text.includes("COUNT(*) FILTER (WHERE execution_status = 'running') as active_sessions") &&
      text.includes("FROM agent_sessions") &&
      !text.includes("avg_response_time") &&
      !text.includes("error_rate")
    ) {
      return [
        {
          active_sessions: "15", // Different value for platform metrics
        },
      ] as T[];
    }

    // Handle database health check for system health
    if (
      text.includes("SUM(current_balance)") ||
      text.includes("WHERE created_at >= CURRENT_DATE")
    ) {
      return [
        {
          total_balance: "5000.00",
          daily_revenue: "250.00",
          admin_bypass_today: "25.00",
        },
      ] as T[];
    }

    // Handle analytics updates (INSERT/UPDATE)
    if (
      text.includes("INSERT INTO daily_analytics") ||
      text.includes("UPDATE daily_analytics")
    ) {
      // For system-wide analytics, user_id should be null
      const userId = params?.[1] !== undefined ? params?.[1] : params?.[0];
      const mockRecord = {
        id: "analytics-456",
        user_id: userId, // This will be null for system-wide analytics when passed as null
        date_bucket: new Date(),
        sessions_started: 1,
        sessions_completed: 1,
        sessions_failed: 0,
        total_session_time_seconds: 300,
        agents_spawned: 2,
        max_recursion_depth: 1,
        tool_executions: 5,
        unique_tools_used: ["git"],
        total_tokens_consumed: 1000,
        total_cost: "2.50",
        claude_api_cost: "2.00",
        files_modified: 1,
        files_created: 0,
        git_operations: 1,
        admin_bypass_usage: "0.00",
        created_at: new Date(),
      };

      this.analyticsData.push(mockRecord);
      return [mockRecord] as T[];
    }

    // DEBUG: Log unmatched queries to understand what's not being caught
    console.log('UNMATCHED ANALYTICS QUERY:', text.replace(/\s+/g, ' ').slice(0, 120));
    console.log('PARAMS:', params);
    
    return [] as T[];
  }

  async transaction<T>(
    callback: (transaction: any) => Promise<T>,
    context?: UserContext
  ): Promise<T> {
    // Mock transaction - just pass this instance as the transaction object
    return callback(this);
  }

  async healthCheck(): Promise<any> {
    return {
      connected: true,
      poolStats: {
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0,
      },
    };
  }
}

describe("AnalyticsDAO", () => {
  let analyticsDAO: AnalyticsDAO;
  let mockDb: MockDatabaseManager;

  beforeEach(() => {
    mockDb = new MockDatabaseManager();
    analyticsDAO = new AnalyticsDAO(mockDb as any);
  });

  describe("getDailyAnalytics", () => {
    it("should get analytics for date range", async () => {
      const startDate = new Date("2023-01-01");
      const endDate = new Date("2023-01-31");
      const context: UserContext = { userId: "user-123", isAdmin: false };

      const analytics = await analyticsDAO.getDailyAnalytics(
        startDate,
        endDate,
        undefined,
        context
      );

      expect(analytics).toHaveLength(1);
      expect(analytics[0].total_cost).toBeInstanceOf(Decimal);
    });

    it("should get analytics for specific user", async () => {
      const startDate = new Date("2023-01-01");
      const endDate = new Date("2023-01-31");
      const userId = "user-123";
      const context: UserContext = { userId, isAdmin: false };

      const analytics = await analyticsDAO.getDailyAnalytics(
        startDate,
        endDate,
        userId,
        context
      );

      expect(analytics).toHaveLength(1);
      expect(analytics[0].user_id).toBe(userId);
    });

    it("should allow admin to view system-wide analytics", async () => {
      const startDate = new Date("2023-01-01");
      const endDate = new Date("2023-01-31");
      const adminContext: UserContext = { userId: "admin-123", isAdmin: true };

      const analytics = await analyticsDAO.getDailyAnalytics(
        startDate,
        endDate,
        undefined,
        adminContext
      );

      expect(analytics).toHaveLength(1);
    });
  });

  describe("getUserAnalyticsSummary", () => {
    it("should return user summary for own data", async () => {
      const userId = "user-123";
      const userContext: UserContext = { userId, isAdmin: false };

      const summary = await analyticsDAO.getUserAnalyticsSummary(
        userId,
        userContext
      );

      expect(summary.totalSessions).toBe(10);
      expect(summary.completedSessions).toBe(8);
      expect(summary.totalCost).toBeInstanceOf(Decimal);
      expect(summary.totalTokens).toBe(25000);
    });

    it("should allow admin to view any user summary", async () => {
      const userId = "user-123";
      const adminContext: UserContext = { userId: "admin-456", isAdmin: true };

      const summary = await analyticsDAO.getUserAnalyticsSummary(
        userId,
        adminContext
      );

      expect(summary.totalSessions).toBe(10);
      expect(summary.completedSessions).toBe(8);
    });

    it("should throw error when user tries to view other user data", async () => {
      const userId = "user-123";
      const otherUserContext: UserContext = {
        userId: "user-456",
        isAdmin: false,
      };

      await expect(
        analyticsDAO.getUserAnalyticsSummary(userId, otherUserContext)
      ).rejects.toThrow("Insufficient privileges to view these analytics");
    });
  });

  describe("updateDailyAnalytics", () => {
    it("should create new analytics record", async () => {
      const userId = "user-123";
      const date = new Date("2023-01-01");
      const updates: AnalyticsUpdate = {
        sessionsStarted: 1,
        sessionsCompleted: 1,
        tokensConsumed: 1000,
        cost: new Decimal("2.50"),
      };

      const analytics = await analyticsDAO.updateDailyAnalytics(
        userId,
        date,
        updates
      );

      expect(analytics.user_id).toBe(userId);
      expect(analytics.total_cost).toBeInstanceOf(Decimal);
      expect(analytics.sessions_started).toBe(1);
    });

    it("should create system-wide analytics record", async () => {
      const date = new Date("2023-01-01");
      const updates: AnalyticsUpdate = {
        sessionsStarted: 1,
        agentsSpawned: 2,
      };

      const analytics = await analyticsDAO.updateDailyAnalytics(
        null,
        date,
        updates
      );

      expect(analytics.user_id).toBeNull();
      expect(analytics.sessions_started).toBe(1);
      expect(analytics.agents_spawned).toBe(2);
    });
  });

  describe("getPlatformMetrics", () => {
    it("should return platform metrics for admin", async () => {
      const adminContext: UserContext = { userId: "admin-123", isAdmin: true };

      const metrics = await analyticsDAO.getPlatformMetrics(adminContext);

      expect(metrics.totalUsers).toBe(100);
      expect(metrics.activeUsers).toBe(25);
      expect(metrics.adminUsers).toBe(3);
      expect(metrics.totalSessions).toBe(500);
      expect(metrics.activeSessions).toBe(15);
      expect(metrics.totalCreditsConsumed).toBeInstanceOf(Decimal);
      expect(metrics.totalRevenue).toBeInstanceOf(Decimal);
      expect(metrics.topPerformingBranches).toHaveLength(2);
    });

    it("should throw error for non-admin user", async () => {
      const userContext: UserContext = { userId: "user-123", isAdmin: false };

      await expect(
        analyticsDAO.getPlatformMetrics(userContext)
      ).rejects.toThrow("Admin privileges required for platform metrics");
    });
  });

  describe("getAnalyticsRange", () => {
    it("should get analytics range for user", async () => {
      const startDate = new Date("2023-01-01");
      const endDate = new Date("2023-01-31");
      const userId = "user-123";
      const userContext: UserContext = { userId, isAdmin: false };

      const analytics = await analyticsDAO.getAnalyticsRange(
        startDate,
        endDate,
        userId,
        userContext
      );

      expect(analytics).toHaveLength(1);
    });

    it("should allow admin to view any user analytics", async () => {
      const startDate = new Date("2023-01-01");
      const endDate = new Date("2023-01-31");
      const userId = "user-123";
      const adminContext: UserContext = { userId: "admin-456", isAdmin: true };

      const analytics = await analyticsDAO.getAnalyticsRange(
        startDate,
        endDate,
        userId,
        adminContext
      );

      expect(analytics).toHaveLength(1);
    });

    it("should throw error when non-admin tries to view other user data", async () => {
      const startDate = new Date("2023-01-01");
      const endDate = new Date("2023-01-31");
      const userId = "user-123";
      const otherUserContext: UserContext = {
        userId: "user-456",
        isAdmin: false,
      };

      await expect(
        analyticsDAO.getAnalyticsRange(
          startDate,
          endDate,
          userId,
          otherUserContext
        )
      ).rejects.toThrow(
        "Admin privileges required to view other user analytics"
      );
    });
  });

  describe("getSystemHealth", () => {
    it("should return system health for admin", async () => {
      const adminContext: UserContext = { userId: "admin-123", isAdmin: true };

      const health = await analyticsDAO.getSystemHealth(adminContext);

      expect(health.databaseHealth.connected).toBe(true);
      expect(health.databaseHealth.activeConnections).toBe(5);
      expect(health.sessionHealth.activeSessions).toBe(12);
      expect(health.sessionHealth.averageResponseTime).toBe(250);
      expect(health.sessionHealth.errorRate).toBe(0.05);
      expect(health.creditHealth.totalBalance).toBeInstanceOf(Decimal);
      expect(health.creditHealth.dailyRevenue).toBeInstanceOf(Decimal);
      expect(health.creditHealth.adminBypassToday).toBeInstanceOf(Decimal);
    });

    it("should throw error for non-admin user", async () => {
      const userContext: UserContext = { userId: "user-123", isAdmin: false };

      await expect(analyticsDAO.getSystemHealth(userContext)).rejects.toThrow(
        "Admin privileges required for system health metrics"
      );
    });
  });

  describe("transformAnalytics", () => {
    it("should transform database record with Decimal conversion", async () => {
      const userId = "user-123";
      const date = new Date("2023-01-01");
      const updates: AnalyticsUpdate = {
        cost: new Decimal("10.50"),
        claudeApiCost: new Decimal("8.25"),
      };

      const analytics = await analyticsDAO.updateDailyAnalytics(
        userId,
        date,
        updates
      );

      expect(analytics.total_cost).toBeInstanceOf(Decimal);
      expect(analytics.claude_api_cost).toBeInstanceOf(Decimal);
      expect(analytics.admin_bypass_usage).toBeInstanceOf(Decimal);
    });
  });
});
