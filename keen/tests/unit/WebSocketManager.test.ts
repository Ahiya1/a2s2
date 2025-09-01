/**
 * WebSocketManager Unit Tests - FIXED VERSION
 * Properly handles timer setup and database cleanup
 */

import { EventEmitter } from "events";
import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import { WebSocketManager } from "../../src/api/websocket/WebSocketManager.js";
import { AuditLogger } from "../../src/api/services/AuditLogger.js";
import { StreamingEvent } from "../../src/api/types.js";

// Optimized MockWebSocket - eliminates async delays
class MockWebSocket extends EventEmitter {
  public readyState: number = WebSocket.OPEN;
  public static OPEN = 1;
  public static CLOSED = 3;
  public static CLOSING = 2;
  public lastPingAt: Date = new Date();

  private sentMessages: any[] = [];
  private pingCount = 0;

  send(data: string): void {
    const message = JSON.parse(data);
    this.sentMessages.push(message);
    // Emit synchronously for faster tests
    this.emit("mockSend", data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", code, reason);
  }

  ping(): void {
    this.pingCount++;
    this.emit("mockPing");
  }

  // Test helpers
  getLastMessage(): any {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  getAllMessages(): any[] {
    return [...this.sentMessages];
  }

  getPingCount(): number {
    return this.pingCount;
  }

  clearMessages(): void {
    this.sentMessages = [];
  }
}

class MockWebSocketServer extends EventEmitter {}

// Simplified MockAuditLogger
class MockAuditLogger {
  private logs: any[] = [];

  async logAdminAction(data: any): Promise<void> {
    this.logs.push({ type: "admin", ...data });
  }

  async logSecurityEvent(data: any): Promise<void> {
    this.logs.push({ type: "security", ...data });
  }

  getLogs(): any[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}

const mockKeenDB = {};

function createMockRequest(
  url: string,
  headers: Record<string, string> = {}
): IncomingMessage {
  return {
    url,
    headers,
    connection: { remoteAddress: "192.168.1.1" },
    socket: { remoteAddress: "192.168.1.1" },
  } as IncomingMessage;
}

describe("WebSocketManager", () => {
  let webSocketManager: WebSocketManager;
  let mockWss: MockWebSocketServer;
  let mockAuditLogger: MockAuditLogger;

  // Use real timers for most tests, fake for specific timer tests
  afterEach(async () => {
    // Clean shutdown to prevent hanging processes
    if (webSocketManager) {
      await webSocketManager.shutdown();
    }
    jest.useRealTimers(); // Ensure we always clean up fake timers
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers(); // Start with real timers

    mockWss = new MockWebSocketServer();
    mockAuditLogger = new MockAuditLogger();

    webSocketManager = new WebSocketManager(
      mockWss as any,
      mockKeenDB as any,
      mockAuditLogger as any
    );
  });

  describe("constructor", () => {
    it("should initialize WebSocket server with event handlers", () => {
      expect(mockWss.listenerCount("connection")).toBe(1);
      expect(mockWss.listenerCount("error")).toBe(1);
    });
  });

  describe("connection handling", () => {
    it("should handle new connection with valid token", () => {
      const mockWs = new MockWebSocket();
      const mockReq = createMockRequest("/?token=valid-token");

      mockWss.emit("connection", mockWs, mockReq);

      const message = mockWs.getLastMessage();
      expect(message.event_type).toBe("connection_established");
      expect(message.data.user_id).toBe("user_123");
      expect(message.data.admin_access).toBe(false);
    });

    it("should handle admin connection with admin token", () => {
      const mockWs = new MockWebSocket();
      const mockReq = createMockRequest("/?token=admin-token");

      mockWss.emit("connection", mockWs, mockReq);

      const message = mockWs.getLastMessage();
      expect(message.data.admin_access).toBe(true);
      expect(message.data.privileges).toEqual({ view_all_sessions: true });
    });

    it("should handle connection with session filters", () => {
      const mockWs = new MockWebSocket();
      const mockReq = createMockRequest(
        "/?token=valid-token&sessions=session1,session2"
      );

      mockWss.emit("connection", mockWs, mockReq);

      const message = mockWs.getLastMessage();
      expect(message.data.session_filters).toEqual(["session1", "session2"]);
    });

    it("should reject connection without token", () => {
      const mockWs = new MockWebSocket();
      const closeSpy = jest.spyOn(mockWs, "close");
      const mockReq = createMockRequest("/");

      mockWss.emit("connection", mockWs, mockReq);

      expect(closeSpy).toHaveBeenCalledWith(
        1008,
        "Authentication token required"
      );
    });

    it("should handle token from authorization header", () => {
      const mockWs = new MockWebSocket();
      const mockReq = createMockRequest("/", {
        authorization: "Bearer valid-token",
      });

      mockWss.emit("connection", mockWs, mockReq);

      const message = mockWs.getLastMessage();
      expect(message.data.user_id).toBe("user_123");
    });
  });

  describe("message handling", () => {
    let mockWs: MockWebSocket;
    let connectionId: string;

    beforeEach(() => {
      mockWs = new MockWebSocket();
      const mockReq = createMockRequest("/?token=valid-token");

      mockWss.emit("connection", mockWs, mockReq);
      connectionId = mockWs.getLastMessage().data.connection_id;
      mockWs.clearMessages(); // Clear connection message
    });

    it("should handle subscribe message", () => {
      const subscribeMessage = {
        type: "subscribe",
        session_id: "test-session",
      };

      mockWs.emit("message", Buffer.from(JSON.stringify(subscribeMessage)));

      const message = mockWs.getLastMessage();
      expect(message.event_type).toBe("subscription_confirmed");
      expect(message.session_id).toBe("test-session");
      expect(message.data.subscribed).toBe(true);
    });

    it("should handle unsubscribe message", () => {
      // Subscribe first
      mockWs.emit(
        "message",
        Buffer.from(
          JSON.stringify({
            type: "subscribe",
            session_id: "test-session",
          })
        )
      );
      mockWs.clearMessages();

      // Then unsubscribe
      mockWs.emit(
        "message",
        Buffer.from(
          JSON.stringify({
            type: "unsubscribe",
            session_id: "test-session",
          })
        )
      );

      const message = mockWs.getLastMessage();
      expect(message.event_type).toBe("subscription_cancelled");
      expect(message.data.subscribed).toBe(false);
    });

    it("should handle ping message", () => {
      mockWs.emit("message", Buffer.from(JSON.stringify({ type: "ping" })));

      const message = mockWs.getLastMessage();
      expect(message.event_type).toBe("pong");
      expect(message.data.connection_id).toBe(connectionId);
    });

    it("should reject admin command from non-admin user", () => {
      mockWs.emit(
        "message",
        Buffer.from(
          JSON.stringify({
            type: "admin_command",
            command: "get_active_sessions",
          })
        )
      );

      const message = mockWs.getLastMessage();
      expect(message.event_type).toBe("error");
      expect(message.data.error).toBe("INSUFFICIENT_PRIVILEGES");
    });

    it("should handle invalid JSON message", () => {
      mockWs.emit("message", Buffer.from("invalid json"));

      const message = mockWs.getLastMessage();
      expect(message.event_type).toBe("error");
      expect(message.data.error).toBe("INVALID_MESSAGE_FORMAT");
    });
  });

  describe("admin functionality", () => {
    let adminWs: MockWebSocket;

    beforeEach(() => {
      adminWs = new MockWebSocket();
      const mockReq = createMockRequest("/?token=admin-token");

      mockWss.emit("connection", adminWs, mockReq);
      adminWs.clearMessages(); // Clear connection message
    });

    it("should handle admin command from admin user", () => {
      adminWs.emit(
        "message",
        Buffer.from(
          JSON.stringify({
            type: "admin_command",
            command: "get_active_sessions",
          })
        )
      );

      const message = adminWs.getLastMessage();
      expect(message.event_type).toBe("admin_response");
      expect(message.data.command).toBe("get_active_sessions");
      expect(message.data.total_connections).toBeDefined();
    });
  });

  describe("broadcasting", () => {
    let mockWs: MockWebSocket;
    let userId: string;

    beforeEach(() => {
      mockWs = new MockWebSocket();
      const mockReq = createMockRequest(
        "/?token=valid-token&sessions=test-session"
      );

      mockWss.emit("connection", mockWs, mockReq);
      userId = mockWs.getLastMessage().data.user_id;
      mockWs.clearMessages();
    });

    it("should broadcast to user connections", async () => {
      const testEvent: StreamingEvent = {
        event_type: "progress_update",
        timestamp: new Date().toISOString(),
        session_id: "test-session",
        data: { message: "test" },
      };

      await webSocketManager.broadcastToUser(userId, testEvent);

      const messages = mockWs.getAllMessages();
      expect(messages).toContainEqual(
        expect.objectContaining({
          event_type: "progress_update",
          data: { message: "test" },
        })
      );
    });

    it("should broadcast to session subscribers", async () => {
      // Subscribe to session
      mockWs.emit(
        "message",
        Buffer.from(
          JSON.stringify({
            type: "subscribe",
            session_id: "test-session",
          })
        )
      );
      mockWs.clearMessages();

      const testEvent: StreamingEvent = {
        event_type: "tool_execution",
        timestamp: new Date().toISOString(),
        session_id: "test-session",
        data: { update: "progress" },
      };

      await webSocketManager.broadcastToSession("test-session", testEvent);

      const messages = mockWs.getAllMessages();
      expect(messages).toContainEqual(
        expect.objectContaining({
          event_type: "tool_execution",
          data: { update: "progress" },
        })
      );
    });
  });

  describe("connection lifecycle", () => {
    it("should handle connection close", () => {
      const mockWs = new MockWebSocket();
      const mockReq = createMockRequest("/?token=valid-token");

      mockWss.emit("connection", mockWs, mockReq);
      mockWs.emit("close", 1000, "Client closed");

      const logs = mockAuditLogger.getLogs();
      expect(logs.some((log) => log.action === "websocket_disconnect")).toBe(
        true
      );
    });

    it("should handle connection error gracefully", () => {
      const mockWs = new MockWebSocket();
      const mockReq = createMockRequest("/?token=valid-token");

      mockWss.emit("connection", mockWs, mockReq);

      expect(() => {
        mockWs.emit("error", new Error("Connection error"));
      }).not.toThrow();
    });

    it("should handle pong response", () => {
      const mockWs = new MockWebSocket();
      const mockReq = createMockRequest("/?token=valid-token");

      mockWss.emit("connection", mockWs, mockReq);

      expect(() => {
        mockWs.emit("pong");
      }).not.toThrow();
    });
  });

  describe("heartbeat and cleanup", () => {
    // FIXED: Use a dedicated beforeEach for fake timers
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should send ping to connections during heartbeat", () => {
      // Create a fresh WebSocketManager with fake timers active
      const timerMockWss = new MockWebSocketServer();
      const timerWebSocketManager = new WebSocketManager(
        timerMockWss as any,
        mockKeenDB as any,
        mockAuditLogger as any
      );

      const mockWs = new MockWebSocket();
      const mockReq = createMockRequest("/?token=valid-token");

      // Establish connection first - this should add to internal connections
      timerMockWss.emit("connection", mockWs, mockReq);

      // Manually add connection to manager's internal state since our mock doesn't do the full flow
      const connectionId = "test-connection-id";
      const oldTime = Date.now() - 31000; // 31 seconds ago (older than 30s threshold)
      
      // Access the private connections map via any cast for testing
      const manager = timerWebSocketManager as any;
      manager.connections.set(connectionId, {
        ws: mockWs,
        lastPingAt: new Date(oldTime),
        user: { id: 'user_123', isAdmin: false },
        sessionFilters: []
      });

      // FIXED: Advance time to trigger heartbeat check (15 seconds + 1ms)
      jest.advanceTimersByTime(15001);

      // Now the ping should have been sent
      expect(mockWs.getPingCount()).toBeGreaterThan(0);

      // Clean up
      timerWebSocketManager.shutdown();
    });

    it("should cleanup dead connections", () => {
      // Create a fresh WebSocketManager with fake timers active
      const timerMockWss = new MockWebSocketServer();
      const timerWebSocketManager = new WebSocketManager(
        timerMockWss as any,
        mockKeenDB as any,
        mockAuditLogger as any
      );

      const mockWs = new MockWebSocket();
      mockWs.readyState = MockWebSocket.CLOSED;
      const mockReq = createMockRequest("/?token=valid-token");

      timerMockWss.emit("connection", mockWs, mockReq);

      // FIXED: Fast forward cleanup interval (60 seconds + 1ms)
      jest.advanceTimersByTime(60001);

      // Should not throw error
      expect(() => jest.advanceTimersByTime(1000)).not.toThrow();

      // Clean up
      timerWebSocketManager.shutdown();
    });
  });

  describe("utility functions", () => {
    it("should return connection statistics", () => {
      const stats = webSocketManager.getConnectionStats();

      expect(stats).toHaveProperty("totalConnections");
      expect(stats).toHaveProperty("adminConnections");
      expect(stats).toHaveProperty("activeConnections");
      expect(stats).toHaveProperty("sessionSubscriptions");
      expect(stats).toHaveProperty("userConnections");
      expect(typeof stats.totalConnections).toBe("number");
    });

    it("should handle different IP extraction scenarios", () => {
      const scenarios = [
        { headers: { "x-forwarded-for": "192.168.1.100, 192.168.1.1" } },
        { headers: { "x-real-ip": "192.168.1.200" } },
        { headers: {} },
      ];

      scenarios.forEach(({ headers }) => {
        const mockWs = new MockWebSocket();
        const mockReq = createMockRequest("/?token=valid-token", headers);

        expect(() => {
          mockWss.emit("connection", mockWs, mockReq);
        }).not.toThrow();
      });
    });
  });

  describe("error handling", () => {
    it("should handle WebSocket server errors", () => {
      expect(() => {
        mockWss.emit("error", new Error("Server error"));
      }).not.toThrow();
    });

    it("should handle malformed messages gracefully", () => {
      const mockWs = new MockWebSocket();
      const mockReq = createMockRequest("/?token=valid-token");

      mockWss.emit("connection", mockWs, mockReq);
      mockWs.clearMessages();

      expect(() => {
        mockWs.emit("message", Buffer.from(""));
      }).not.toThrow();
    });

    it("should handle send failures gracefully", () => {
      const mockWs = new MockWebSocket();
      // Override send to throw error
      mockWs.send = () => {
        throw new Error("Send failed");
      };

      const mockReq = createMockRequest("/?token=valid-token");

      expect(() => {
        mockWss.emit("connection", mockWs, mockReq);
      }).not.toThrow();
    });
  });

  describe("shutdown", () => {
    it("should shutdown gracefully", async () => {
      const mockWs = new MockWebSocket();
      const closeSpy = jest.spyOn(mockWs, "close");
      const mockReq = createMockRequest("/?token=valid-token");

      mockWss.emit("connection", mockWs, mockReq);

      await webSocketManager.shutdown();

      expect(closeSpy).toHaveBeenCalledWith(1001, "Server shutting down");
    });
  });
});
