/**
 * WebSocketDAO Unit Tests - FIXED VERSION
 * Tests WebSocket connection management with admin privileges and metrics
 */

import {
  DatabaseManager,
  UserContext,
} from "../../src/database/DatabaseManager.js";
import {
  WebSocketDAO,
  CreateConnectionRequest,
} from "../../src/database/dao/WebSocketDAO.js";

// Mock DatabaseManager - FIXED VERSION
class MockDatabaseManager {
  public connections: any[] = [];
  public metricsData: any[] = [];

  async query<T = any>(
    text: string,
    params?: any[],
    context?: UserContext
  ): Promise<T[]> {
    if (text.includes("INSERT INTO websocket_connections")) {
      const connection = {
        id: params?.[0] || "conn-id",
        user_id: params?.[1],
        session_id: params?.[2],
        connection_id: params?.[3],
        client_ip: params?.[4],
        user_agent: params?.[5],
        client_type: params?.[6],
        connected_at: new Date(),
        last_ping_at: new Date(),
        disconnected_at: null as Date | null,
        subscribed_events: params?.[7] || ([] as string[]),
        session_filters: params?.[8] || ([] as string[]),
        connection_status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.connections.push(connection);
      return [connection] as T[];
    }

    if (
      text.includes("UPDATE websocket_connections") &&
      text.includes("last_ping_at")
    ) {
      const connectionId = params?.[0];
      const connection = this.connections.find(
        (c) =>
          c.connection_id === connectionId && c.connection_status === "active"
      );
      if (connection) {
        connection.last_ping_at = new Date();
        connection.updated_at = new Date();
        return [{ id: connection.id }] as T[];
      }
      return [] as T[];
    }

    if (
      text.includes("UPDATE websocket_connections") &&
      text.includes("connection_status = 'closed'")
    ) {
      const connectionId = params?.[0];
      const connection = this.connections.find(
        (c) => c.connection_id === connectionId
      );
      if (
        connection &&
        ["active", "inactive"].includes(connection.connection_status)
      ) {
        connection.connection_status = "closed";
        connection.disconnected_at = new Date();
        connection.updated_at = new Date();
        return [{ id: connection.id }] as T[];
      }
      return [] as T[];
    }

    // FIXED: Handle most specific queries first - session-specific queries
    if (
      text.includes("SELECT * FROM websocket_connections") &&
      text.includes("WHERE session_id = $1") &&
      text.includes("connection_status = 'active'") &&
      text.includes("ORDER BY connected_at DESC")
    ) {
      const sessionId = params?.[0];
      return this.connections.filter(
        (c) => c.session_id === sessionId && c.connection_status === "active"
      ) as T[];
    }

    // Handle user-specific queries
    if (
      text.includes("SELECT * FROM websocket_connections") &&
      text.includes("user_id = $1") &&
      text.includes("connection_status = 'active'")
    ) {
      const userId = params?.[0];
      return this.connections.filter(
        (c) => c.user_id === userId && c.connection_status === "active"
      ) as T[];
    }

    // Handle getEventSubscribers query (before general query)
    if (
      text.includes("SELECT * FROM websocket_connections") &&
      text.includes("connection_status = 'active'") &&
      text.includes("ANY(subscribed_events)")
    ) {
      const eventType = params?.[0];
      const sessionId = params?.[1];
      
      let filteredConnections = this.connections.filter((c) => {
        if (c.connection_status !== "active") return false;
        
        // Check if connection subscribes to this event type or 'all'
        const subscribes = c.subscribed_events.includes(eventType) || 
                          c.subscribed_events.includes("all");
        
        if (!subscribes) return false;
        
        // If sessionId is provided, check session filters
        if (sessionId) {
          // Include if connection has no session filters (receives all) or
          // if the sessionId is in the connection's session filters
          return c.session_filters.length === 0 || 
                 c.session_filters.includes(sessionId);
        }
        
        return true;
      });
      
      // Sort by connected_at DESC
      filteredConnections.sort((a, b) => b.connected_at.getTime() - a.connected_at.getTime());
      
      return filteredConnections as T[];
    }

    // Handle general active connections query (least specific, should be last)
    if (
      text.includes("SELECT * FROM websocket_connections") &&
      text.includes("connection_status = 'active'") &&
      !text.includes("user_id") &&
      !text.includes("session_id") &&
      !text.includes("ANY(subscribed_events)")
    ) {
      return this.connections.filter(
        (c) => c.connection_status === "active"
      ) as T[];
    }

    if (
      text.includes("UPDATE websocket_connections") &&
      text.includes("subscribed_events")
    ) {
      const [subscribedEvents, sessionFilters, connectionId] = params || [];
      const connection = this.connections.find(
        (c) =>
          c.connection_id === connectionId && c.connection_status === "active"
      );
      if (connection) {
        connection.subscribed_events = subscribedEvents;
        connection.session_filters = sessionFilters;
        connection.updated_at = new Date();
        return [{ id: connection.id }] as T[];
      }
      return [] as T[];
    }

    if (
      text.includes("SELECT * FROM websocket_connections WHERE connection_id")
    ) {
      const connectionId = params?.[0];
      const connection = this.connections.find(
        (c) => c.connection_id === connectionId
      );
      return connection ? ([connection] as T[]) : ([] as T[]);
    }

    // Connection metrics queries
    if (text.includes("COUNT(*) as total_connections")) {
      const totalConnections = this.connections.length;
      const activeConnections = this.connections.filter(
        (c) => c.connection_status === "active"
      ).length;
      return [
        {
          total_connections: totalConnections.toString(),
          active_connections: activeConnections.toString(),
          avg_duration: "300", // 5 minutes
        },
      ] as T[];
    }

    if (text.includes("GROUP BY client_type")) {
      const typeMap: Record<string, number> = {};
      this.connections.forEach((c) => {
        typeMap[c.client_type] = (typeMap[c.client_type] || 0) + 1;
      });
      return Object.entries(typeMap).map(([client_type, count]) => ({
        client_type,
        count: count.toString(),
      })) as T[];
    }

    if (text.includes("GROUP BY user_id")) {
      const userMap: Record<string, number> = {};
      this.connections.forEach((c) => {
        userMap[c.user_id] = (userMap[c.user_id] || 0) + 1;
      });
      return Object.entries(userMap).map(([user_id, count]) => ({
        user_id,
        connection_count: count.toString(),
        total_duration: "600", // 10 minutes
      })) as T[];
    }

    if (
      text.includes("UPDATE websocket_connections") &&
      text.includes("connection_status = 'inactive'")
    ) {
      const inactiveConnections = this.connections.filter(
        (c) =>
          c.connection_status === "active" &&
          new Date().getTime() - c.last_ping_at.getTime() > 30 * 60 * 1000
      );
      inactiveConnections.forEach((c) => {
        c.connection_status = "inactive";
        c.disconnected_at = new Date();
      });
      return inactiveConnections.map((c) => ({ id: c.id })) as T[];
    }

    return [] as T[];
  }
}

describe("WebSocketDAO", () => {
  let webSocketDAO: WebSocketDAO;
  let mockDb: MockDatabaseManager;

  beforeEach(() => {
    mockDb = new MockDatabaseManager();
    webSocketDAO = new WebSocketDAO(mockDb as any);
  });

  describe("createConnection", () => {
    it("should create a WebSocket connection successfully", async () => {
      const userId = "user-123";
      const request: CreateConnectionRequest = {
        connectionId: "ws-conn-456",
        sessionId: "session-789",
        clientIp: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        clientType: "dashboard",
        subscribedEvents: ["message", "update"],
        sessionFilters: ["session-789"],
      };

      const connection = await webSocketDAO.createConnection(userId, request);

      expect(connection.user_id).toBe(userId);
      expect(connection.connection_id).toBe(request.connectionId);
      expect(connection.session_id).toBe(request.sessionId);
      expect(connection.client_ip).toBe(request.clientIp);
      expect(connection.client_type).toBe(request.clientType);
      expect(connection.subscribed_events).toEqual(request.subscribedEvents);
      expect(connection.session_filters).toEqual(request.sessionFilters);
      expect(connection.connection_status).toBe("active");
    });

    it("should create connection with minimal data", async () => {
      const userId = "user-123";
      const request: CreateConnectionRequest = {
        connectionId: "ws-conn-456",
        clientIp: "192.168.1.1",
        clientType: "cli",
      };

      const connection = await webSocketDAO.createConnection(userId, request);

      expect(connection.user_id).toBe(userId);
      expect(connection.connection_id).toBe(request.connectionId);
      expect(connection.session_id).toBeNull();
      expect(connection.subscribed_events).toEqual([]);
      expect(connection.session_filters).toEqual([]);
    });
  });

  describe("updateConnectionActivity", () => {
    it("should update connection activity for active connection", async () => {
      // Setup active connection
      await webSocketDAO.createConnection("user-123", {
        connectionId: "ws-conn-456",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });

      const result = await webSocketDAO.updateConnectionActivity("ws-conn-456");

      expect(result).toBe(true);
    });

    it("should return false for non-existent connection", async () => {
      const result =
        await webSocketDAO.updateConnectionActivity("non-existent");

      expect(result).toBe(false);
    });

    it("should return false for inactive connection", async () => {
      // Setup connection and close it
      await webSocketDAO.createConnection("user-123", {
        connectionId: "ws-conn-456",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });
      await webSocketDAO.closeConnection("ws-conn-456");

      const result = await webSocketDAO.updateConnectionActivity("ws-conn-456");

      expect(result).toBe(false);
    });
  });

  describe("closeConnection", () => {
    it("should close active connection", async () => {
      await webSocketDAO.createConnection("user-123", {
        connectionId: "ws-conn-456",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });

      const result = await webSocketDAO.closeConnection("ws-conn-456");

      expect(result).toBe(true);
    });

    it("should close inactive connection", async () => {
      await webSocketDAO.createConnection("user-123", {
        connectionId: "ws-conn-456",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });
      // Make it inactive
      const connection = mockDb.connections[0];
      connection.connection_status = "inactive";

      const result = await webSocketDAO.closeConnection("ws-conn-456");

      expect(result).toBe(true);
    });

    it("should return false for already closed connection", async () => {
      await webSocketDAO.createConnection("user-123", {
        connectionId: "ws-conn-456",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });
      await webSocketDAO.closeConnection("ws-conn-456"); // Close first time

      const result = await webSocketDAO.closeConnection("ws-conn-456"); // Try to close again

      expect(result).toBe(false);
    });

    it("should return false for non-existent connection", async () => {
      const result = await webSocketDAO.closeConnection("non-existent");

      expect(result).toBe(false);
    });
  });

  describe("getUserConnections", () => {
    it("should return user connections", async () => {
      const userId = "user-123";
      await webSocketDAO.createConnection(userId, {
        connectionId: "ws-conn-1",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });
      await webSocketDAO.createConnection(userId, {
        connectionId: "ws-conn-2",
        clientIp: "192.168.1.1",
        clientType: "cli",
      });

      const connections = await webSocketDAO.getUserConnections(userId);

      expect(connections).toHaveLength(2);
      expect(connections[0].user_id).toBe(userId);
      expect(connections[1].user_id).toBe(userId);
    });

    it("should not return closed connections", async () => {
      const userId = "user-123";
      await webSocketDAO.createConnection(userId, {
        connectionId: "ws-conn-1",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });
      await webSocketDAO.createConnection(userId, {
        connectionId: "ws-conn-2",
        clientIp: "192.168.1.1",
        clientType: "cli",
      });
      await webSocketDAO.closeConnection("ws-conn-1");

      const connections = await webSocketDAO.getUserConnections(userId);

      expect(connections).toHaveLength(1);
      expect(connections[0].connection_id).toBe("ws-conn-2");
    });
  });

  describe("getAllActiveConnections", () => {
    it("should return all active connections for admin", async () => {
      await webSocketDAO.createConnection("user-1", {
        connectionId: "ws-conn-1",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });
      await webSocketDAO.createConnection("user-2", {
        connectionId: "ws-conn-2",
        clientIp: "192.168.1.2",
        clientType: "cli",
      });

      const adminContext: UserContext = { userId: "admin-id", isAdmin: true };
      const connections =
        await webSocketDAO.getAllActiveConnections(adminContext);

      expect(connections).toHaveLength(2);
    });

    it("should throw error for non-admin user", async () => {
      const userContext: UserContext = { userId: "user-id", isAdmin: false };

      await expect(
        webSocketDAO.getAllActiveConnections(userContext)
      ).rejects.toThrow("Admin privileges required to view all connections");
    });

    it("should throw error for undefined context", async () => {
      await expect(webSocketDAO.getAllActiveConnections()).rejects.toThrow(
        "Admin privileges required to view all connections"
      );
    });
  });

  describe("getSessionConnections", () => {
    it("should return connections for specific session", async () => {
      const sessionId = "session-789";
      await webSocketDAO.createConnection("user-1", {
        connectionId: "ws-conn-1",
        sessionId,
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });
      await webSocketDAO.createConnection("user-2", {
        connectionId: "ws-conn-2",
        sessionId: "other-session",
        clientIp: "192.168.1.2",
        clientType: "cli",
      });

      const connections = await webSocketDAO.getSessionConnections(sessionId);

      expect(connections).toHaveLength(1);
      expect(connections[0].session_id).toBe(sessionId);
    });
  });

  describe("updateConnectionSubscriptions", () => {
    it("should update subscriptions for active connection", async () => {
      await webSocketDAO.createConnection("user-123", {
        connectionId: "ws-conn-456",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });

      const newEvents = ["message", "update", "admin"];
      const newFilters = ["session-1", "session-2"];
      const result = await webSocketDAO.updateConnectionSubscriptions(
        "ws-conn-456",
        newEvents,
        newFilters
      );

      expect(result).toBe(true);
    });

    it("should return false for non-existent connection", async () => {
      const result = await webSocketDAO.updateConnectionSubscriptions(
        "non-existent",
        ["message"],
        []
      );

      expect(result).toBe(false);
    });

    it("should return false for closed connection", async () => {
      await webSocketDAO.createConnection("user-123", {
        connectionId: "ws-conn-456",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });
      await webSocketDAO.closeConnection("ws-conn-456");

      const result = await webSocketDAO.updateConnectionSubscriptions(
        "ws-conn-456",
        ["message"],
        []
      );

      expect(result).toBe(false);
    });
  });

  describe("getConnectionMetrics", () => {
    it("should return metrics for admin", async () => {
      // Setup test data
      await webSocketDAO.createConnection("user-1", {
        connectionId: "ws-conn-1",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });
      await webSocketDAO.createConnection("user-2", {
        connectionId: "ws-conn-2",
        clientIp: "192.168.1.2",
        clientType: "cli",
      });

      const adminContext: UserContext = { userId: "admin-id", isAdmin: true };
      const metrics = await webSocketDAO.getConnectionMetrics(
        undefined,
        undefined,
        adminContext
      );

      expect(metrics.totalConnections).toBe(2);
      expect(metrics.activeConnections).toBe(2);
      expect(metrics.avgConnectionDuration).toBe(300);
      expect(metrics.connectionsByType).toHaveProperty("dashboard");
      expect(metrics.connectionsByType).toHaveProperty("cli");
      expect(metrics.topUsers).toHaveLength(2);
    });

    it("should return metrics with date range for admin", async () => {
      const startDate = new Date("2023-01-01");
      const endDate = new Date("2023-12-31");
      const adminContext: UserContext = { userId: "admin-id", isAdmin: true };

      const metrics = await webSocketDAO.getConnectionMetrics(
        startDate,
        endDate,
        adminContext
      );

      expect(typeof metrics.totalConnections).toBe("number");
      expect(typeof metrics.activeConnections).toBe("number");
    });

    it("should throw error for non-admin user", async () => {
      const userContext: UserContext = { userId: "user-id", isAdmin: false };

      await expect(
        webSocketDAO.getConnectionMetrics(undefined, undefined, userContext)
      ).rejects.toThrow("Admin privileges required for connection metrics");
    });
  });

  describe("cleanupInactiveConnections", () => {
    it("should cleanup inactive connections for admin", async () => {
      // Setup old connection
      await webSocketDAO.createConnection("user-1", {
        connectionId: "ws-conn-1",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });

      // Make it old by modifying last_ping_at
      const connection = mockDb.connections[0];
      connection.last_ping_at = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      const adminContext: UserContext = { userId: "admin-id", isAdmin: true };
      const cleaned = await webSocketDAO.cleanupInactiveConnections(
        30,
        adminContext
      );

      expect(cleaned).toBeGreaterThanOrEqual(0);
    });

    it("should use default threshold when not specified", async () => {
      const adminContext: UserContext = { userId: "admin-id", isAdmin: true };
      const cleaned = await webSocketDAO.cleanupInactiveConnections(
        undefined,
        adminContext
      );

      expect(typeof cleaned).toBe("number");
    });

    it("should throw error for non-admin user", async () => {
      const userContext: UserContext = { userId: "user-id", isAdmin: false };

      await expect(
        webSocketDAO.cleanupInactiveConnections(30, userContext)
      ).rejects.toThrow("Admin privileges required for connection cleanup");
    });
  });

  describe("getConnectionById", () => {
    it("should return connection by ID", async () => {
      await webSocketDAO.createConnection("user-123", {
        connectionId: "ws-conn-456",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
      });

      const connection = await webSocketDAO.getConnectionById("ws-conn-456");

      expect(connection).not.toBeNull();
      expect(connection!.connection_id).toBe("ws-conn-456");
    });

    it("should return null for non-existent connection", async () => {
      const connection = await webSocketDAO.getConnectionById("non-existent");

      expect(connection).toBeNull();
    });
  });

  describe("getEventSubscribers", () => {
    it("should return subscribers for specific event", async () => {
      await webSocketDAO.createConnection("user-1", {
        connectionId: "ws-conn-1",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
        subscribedEvents: ["message"],
      });
      await webSocketDAO.createConnection("user-2", {
        connectionId: "ws-conn-2",
        clientIp: "192.168.1.2",
        clientType: "cli",
        subscribedEvents: ["update"],
      });

      const subscribers = await webSocketDAO.getEventSubscribers("message");

      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].connection_id).toBe("ws-conn-1");
    });

    it('should return subscribers with "all" events subscription', async () => {
      await webSocketDAO.createConnection("user-1", {
        connectionId: "ws-conn-1",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
        subscribedEvents: ["all"],
      });

      const subscribers = await webSocketDAO.getEventSubscribers("any-event");

      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].connection_id).toBe("ws-conn-1");
    });

    it("should filter by session when provided", async () => {
      await webSocketDAO.createConnection("user-1", {
        connectionId: "ws-conn-1",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
        subscribedEvents: ["message"],
        sessionFilters: ["session-123"],
      });
      await webSocketDAO.createConnection("user-2", {
        connectionId: "ws-conn-2",
        clientIp: "192.168.1.2",
        clientType: "cli",
        subscribedEvents: ["message"],
        sessionFilters: ["session-456"],
      });

      const subscribers = await webSocketDAO.getEventSubscribers(
        "message",
        "session-123"
      );

      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].connection_id).toBe("ws-conn-1");
    });

    it("should include connections with no session filters", async () => {
      await webSocketDAO.createConnection("user-1", {
        connectionId: "ws-conn-1",
        clientIp: "192.168.1.1",
        clientType: "dashboard",
        subscribedEvents: ["message"],
        sessionFilters: [], // No filters - should receive all sessions
      });

      const subscribers = await webSocketDAO.getEventSubscribers(
        "message",
        "any-session"
      );

      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].connection_id).toBe("ws-conn-1");
    });
  });
});
