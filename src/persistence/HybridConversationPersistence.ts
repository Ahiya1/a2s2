import {
  ConversationPersistence,
  ConversationState,
} from "../conversation/ConversationPersistence";
import { ConversationDAO } from "../database/ConversationDAO";
import { DatabaseConfigManager } from "../config/DatabaseConfig";
import { Logger } from "../logging/Logger";
import { DatabaseOperationResult } from "../types/DatabaseTypes";

export interface HybridPersistenceConfig {
  preferDatabase: boolean;
  fallbackToFile: boolean;
  syncBetweenSources: boolean;
  cacheTimeout: number; // milliseconds
  enableMetrics: boolean;
}

export interface PersistenceMetrics {
  databaseOperations: {
    reads: number;
    writes: number;
    errors: number;
  };
  fileOperations: {
    reads: number;
    writes: number;
    errors: number;
  };
  cacheHits: number;
  cacheMisses: number;
  syncOperations: number;
  lastSyncAt?: Date;
}

/**
 * HybridConversationPersistence provides a hybrid approach using both
 * database and file storage, with intelligent fallback and caching.
 */
export class HybridConversationPersistence {
  private filePersistence: ConversationPersistence;
  private conversationDAO: ConversationDAO;
  private dbConfigManager: DatabaseConfigManager;
  private config: HybridPersistenceConfig;
  private cache: Map<string, { state: ConversationState; timestamp: Date }> =
    new Map();
  private metrics: PersistenceMetrics;

  constructor(config: Partial<HybridPersistenceConfig> = {}) {
    this.filePersistence = new ConversationPersistence();
    this.conversationDAO = new ConversationDAO();
    this.dbConfigManager = DatabaseConfigManager.getInstance();

    this.config = {
      preferDatabase: true,
      fallbackToFile: true,
      syncBetweenSources: true,
      cacheTimeout: 5 * 60 * 1000, // 5 minutes
      enableMetrics: true,
      ...config,
    };

    this.metrics = {
      databaseOperations: { reads: 0, writes: 0, errors: 0 },
      fileOperations: { reads: 0, writes: 0, errors: 0 },
      cacheHits: 0,
      cacheMisses: 0,
      syncOperations: 0,
    };

    Logger.info("HybridConversationPersistence initialized", {
      config: this.config,
      databaseEnabled: this.dbConfigManager.isEnabled(),
    });
  }

  async saveConversation(state: ConversationState): Promise<void> {
    const conversationId = state.conversationId;

    try {
      // Update cache
      this.updateCache(conversationId, state);

      // Determine primary storage method
      const useDatabase = this.shouldUseDatabase();
      let primarySuccess = false;
      let primaryError: Error | null = null;

      if (useDatabase) {
        try {
          const result = await this.saveToDatabaseWithMetrics(state);
          primarySuccess = result.success;
          if (!result.success) {
            primaryError = new Error(result.error || "Database save failed");
          }
        } catch (error) {
          primaryError =
            error instanceof Error ? error : new Error(String(error));
        }
      } else {
        try {
          await this.saveToFileWithMetrics(state);
          primarySuccess = true;
        } catch (error) {
          primaryError =
            error instanceof Error ? error : new Error(String(error));
        }
      }

      // Fallback to secondary storage if primary failed
      if (!primarySuccess && this.config.fallbackToFile) {
        try {
          if (useDatabase) {
            // Database failed, try file storage
            await this.saveToFileWithMetrics(state);
            Logger.warn("Primary database save failed, used file fallback", {
              conversationId,
              primaryError: primaryError?.message,
            });
          } else {
            // File failed, try database
            const result = await this.saveToDatabaseWithMetrics(state);
            if (!result.success) {
              throw new Error(result.error || "Database fallback save failed");
            }
            Logger.warn("Primary file save failed, used database fallback", {
              conversationId,
              primaryError: primaryError?.message,
            });
          }
        } catch (fallbackError) {
          Logger.error("Both primary and fallback save failed", {
            conversationId,
            primaryError: primaryError?.message,
            fallbackError:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          });
          throw primaryError || fallbackError;
        }
      } else if (!primarySuccess) {
        Logger.error("Primary save failed and fallback disabled", {
          conversationId,
          error: primaryError?.message,
        });
        throw primaryError || new Error("Save failed");
      }

      // Sync between sources if enabled
      if (this.config.syncBetweenSources && primarySuccess) {
        await this.syncConversation(conversationId, useDatabase);
      }

      Logger.debug("Conversation saved successfully", {
        conversationId,
        primaryStorage: useDatabase ? "database" : "file",
        messageCount: state.messageCount,
        totalCost: state.totalCost,
      });
    } catch (error) {
      Logger.error("Failed to save conversation", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async loadConversation(
    conversationId: string
  ): Promise<ConversationState | null> {
    try {
      // Check cache first
      const cached = this.getFromCache(conversationId);
      if (cached) {
        this.metrics.cacheHits++;
        Logger.debug("Conversation loaded from cache", { conversationId });
        return cached;
      }

      this.metrics.cacheMisses++;

      // Determine primary storage method
      const useDatabase = this.shouldUseDatabase();
      let primaryResult: ConversationState | null = null;
      let primaryError: Error | null = null;

      if (useDatabase) {
        try {
          const dbResult =
            await this.loadFromDatabaseWithMetrics(conversationId);
          // FIXED: Handle undefined type properly by using null coalescing
          primaryResult = dbResult.success ? (dbResult.data ?? null) : null;
          if (!dbResult.success) {
            primaryError = new Error(dbResult.error || "Database load failed");
          }
        } catch (error) {
          primaryError =
            error instanceof Error ? error : new Error(String(error));
          primaryResult = null;
        }
      } else {
        try {
          primaryResult = await this.loadFromFileWithMetrics(conversationId);
        } catch (error) {
          primaryError =
            error instanceof Error ? error : new Error(String(error));
          primaryResult = null;
        }
      }

      // Try fallback if primary failed or returned null
      if (primaryResult === null && this.config.fallbackToFile) {
        try {
          if (useDatabase) {
            // Database failed/empty, try file storage
            const fallbackResult =
              await this.loadFromFileWithMetrics(conversationId);
            if (fallbackResult !== null) {
              primaryResult = fallbackResult;
              Logger.debug("Used file fallback for conversation load", {
                conversationId,
                primaryError: primaryError?.message,
              });
            }
          } else {
            // File failed/empty, try database
            const dbResult =
              await this.loadFromDatabaseWithMetrics(conversationId);
            // FIXED: Handle undefined type properly
            if (dbResult.success && dbResult.data) {
              primaryResult = dbResult.data;
              Logger.debug("Used database fallback for conversation load", {
                conversationId,
                primaryError: primaryError?.message,
              });
            }
          }
        } catch (fallbackError) {
          Logger.warn("Fallback load also failed", {
            conversationId,
            fallbackError:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          });
        }
      }

      // Update cache if we successfully loaded
      if (primaryResult !== null) {
        this.updateCache(conversationId, primaryResult);

        // Sync between sources if enabled and conversation was found
        if (this.config.syncBetweenSources) {
          await this.syncConversation(conversationId, useDatabase);
        }
      }

      Logger.debug(
        primaryResult
          ? "Conversation loaded successfully"
          : "Conversation not found",
        {
          conversationId,
          primaryStorage: useDatabase ? "database" : "file",
          foundInPrimary: primaryResult !== null,
        }
      );

      return primaryResult;
    } catch (error) {
      Logger.error("Failed to load conversation", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async removeConversation(conversationId: string): Promise<void> {
    try {
      // Remove from cache
      this.cache.delete(conversationId);

      // Remove from both storage methods if enabled
      const removePromises: Promise<void>[] = [];

      if (this.shouldUseDatabase()) {
        removePromises.push(this.removeFromDatabase(conversationId));
      }

      if (this.config.fallbackToFile) {
        removePromises.push(this.removeFromFile(conversationId));
      }

      await Promise.allSettled(removePromises);

      Logger.debug("Conversation removed", { conversationId });
    } catch (error) {
      Logger.error("Failed to remove conversation", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async listConversations(): Promise<string[]> {
    try {
      const useDatabase = this.shouldUseDatabase();
      let primaryList: string[] = [];
      let fallbackList: string[] = [];

      if (useDatabase) {
        try {
          const dbResult = await this.conversationDAO.listConversations();
          if (dbResult.success && dbResult.data) {
            primaryList = dbResult.data.map((state) => state.conversationId);
            this.metrics.databaseOperations.reads++;
          }
        } catch (error) {
          this.metrics.databaseOperations.errors++;
          Logger.warn("Database list failed, trying file fallback", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        try {
          primaryList = await this.filePersistence.listConversations();
          this.metrics.fileOperations.reads++;
        } catch (error) {
          this.metrics.fileOperations.errors++;
          Logger.warn("File list failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Get fallback list if enabled
      if (this.config.fallbackToFile) {
        try {
          if (useDatabase) {
            fallbackList = await this.filePersistence.listConversations();
            this.metrics.fileOperations.reads++;
          } else {
            const dbResult = await this.conversationDAO.listConversations();
            if (dbResult.success && dbResult.data) {
              fallbackList = dbResult.data.map((state) => state.conversationId);
              this.metrics.databaseOperations.reads++;
            }
          }
        } catch (error) {
          Logger.warn("Fallback list failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Combine and deduplicate lists
      const combinedSet = new Set([...primaryList, ...fallbackList]);
      const combinedList = Array.from(combinedSet);

      Logger.debug("Conversations listed", {
        primaryCount: primaryList.length,
        fallbackCount: fallbackList.length,
        totalCount: combinedList.length,
      });

      return combinedList;
    } catch (error) {
      Logger.error("Failed to list conversations", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async cleanupExpiredConversations(): Promise<void> {
    try {
      // Clean up both storage methods and cache
      const cleanupPromises: Promise<void>[] = [];

      if (this.shouldUseDatabase()) {
        cleanupPromises.push(this.cleanupDatabaseExpired());
      }

      if (this.config.fallbackToFile) {
        cleanupPromises.push(
          this.filePersistence.cleanupExpiredConversations()
        );
      }

      cleanupPromises.push(this.cleanupCacheExpired());

      await Promise.allSettled(cleanupPromises);

      Logger.debug("Expired conversations cleanup completed");
    } catch (error) {
      Logger.error("Failed to cleanup expired conversations", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Private helper methods
  private shouldUseDatabase(): boolean {
    return this.config.preferDatabase && this.dbConfigManager.isEnabled();
  }

  private updateCache(conversationId: string, state: ConversationState): void {
    this.cache.set(conversationId, {
      state: { ...state },
      timestamp: new Date(),
    });
  }

  private getFromCache(conversationId: string): ConversationState | null {
    const cached = this.cache.get(conversationId);
    if (!cached) {
      return null;
    }

    // Check if cache entry is expired
    const now = Date.now();
    const age = now - cached.timestamp.getTime();

    if (age > this.config.cacheTimeout) {
      this.cache.delete(conversationId);
      return null;
    }

    return { ...cached.state };
  }

  // FIXED: Make cleanupCacheExpired return Promise<void>
  private cleanupCacheExpired(): Promise<void> {
    return Promise.resolve().then(() => {
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [conversationId, cached] of this.cache.entries()) {
        const age = now - cached.timestamp.getTime();
        if (age > this.config.cacheTimeout) {
          expiredKeys.push(conversationId);
        }
      }

      expiredKeys.forEach((key) => this.cache.delete(key));

      if (expiredKeys.length > 0) {
        Logger.debug("Cache cleanup completed", {
          expiredCount: expiredKeys.length,
          remainingCount: this.cache.size,
        });
      }
    });
  }

  private async saveToDatabaseWithMetrics(
    state: ConversationState
  ): Promise<DatabaseOperationResult<string>> {
    try {
      const result = await this.conversationDAO.saveConversation(state);
      this.metrics.databaseOperations.writes++;
      return result;
    } catch (error) {
      this.metrics.databaseOperations.errors++;
      throw error;
    }
  }

  private async saveToFileWithMetrics(state: ConversationState): Promise<void> {
    try {
      await this.filePersistence.saveConversation(state);
      this.metrics.fileOperations.writes++;
    } catch (error) {
      this.metrics.fileOperations.errors++;
      throw error;
    }
  }

  private async loadFromDatabaseWithMetrics(
    conversationId: string
  ): Promise<DatabaseOperationResult<ConversationState | null>> {
    try {
      const result = await this.conversationDAO.getConversation(conversationId);
      this.metrics.databaseOperations.reads++;
      return result;
    } catch (error) {
      this.metrics.databaseOperations.errors++;
      throw error;
    }
  }

  private async loadFromFileWithMetrics(
    conversationId: string
  ): Promise<ConversationState | null> {
    try {
      const result =
        await this.filePersistence.loadConversation(conversationId);
      this.metrics.fileOperations.reads++;
      return result;
    } catch (error) {
      this.metrics.fileOperations.errors++;
      throw error;
    }
  }

  private async removeFromDatabase(conversationId: string): Promise<void> {
    // Note: ConversationDAO doesn't have a remove method in the current implementation
    // This would need to be added to support removal from database
    Logger.debug("Database conversation removal not implemented", {
      conversationId,
    });
  }

  private async removeFromFile(conversationId: string): Promise<void> {
    try {
      await this.filePersistence.removeConversation(conversationId);
    } catch (error) {
      Logger.warn("Failed to remove conversation from file storage", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async cleanupDatabaseExpired(): Promise<void> {
    try {
      // Use the cleanup method from DAO with default retention
      const result = await this.conversationDAO.cleanupOldData(7); // 7 days default
      if (result.success) {
        Logger.debug("Database expired conversations cleaned up", {
          removedCount: result.data,
        });
      }
    } catch (error) {
      Logger.warn("Failed to cleanup expired conversations from database", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async syncConversation(
    conversationId: string,
    primaryIsDatabase: boolean
  ): Promise<void> {
    if (!this.config.syncBetweenSources) {
      return;
    }

    try {
      this.metrics.syncOperations++;
      this.metrics.lastSyncAt = new Date();

      if (primaryIsDatabase) {
        // Sync from database to file
        const dbResult =
          await this.conversationDAO.getConversation(conversationId);
        // FIXED: Handle undefined properly with null check
        if (dbResult.success && dbResult.data != null) {
          await this.filePersistence.saveConversation(dbResult.data);
          Logger.debug("Synced conversation from database to file", {
            conversationId,
          });
        }
      } else {
        // Sync from file to database
        const fileState =
          await this.filePersistence.loadConversation(conversationId);
        if (fileState !== null) {
          await this.conversationDAO.saveConversation(fileState);
          Logger.debug("Synced conversation from file to database", {
            conversationId,
          });
        }
      }
    } catch (error) {
      Logger.warn("Failed to sync conversation between storage methods", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Public utility methods
  getMetrics(): PersistenceMetrics {
    return { ...this.metrics };
  }

  getConfig(): Readonly<HybridPersistenceConfig> {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<HybridPersistenceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    Logger.debug("Hybrid persistence configuration updated", {
      config: this.config,
    });
  }

  clearCache(): void {
    this.cache.clear();
    Logger.debug("Persistence cache cleared");
  }

  getCacheStats(): {
    size: number;
    hitRate: number;
    entries: Array<{ conversationId: string; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(
      ([conversationId, cached]) => ({
        conversationId,
        age: now - cached.timestamp.getTime(),
      })
    );

    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate =
      totalRequests > 0 ? (this.metrics.cacheHits / totalRequests) * 100 : 0;

    return {
      size: this.cache.size,
      hitRate,
      entries,
    };
  }

  isHealthy(): boolean {
    const metrics = this.getMetrics();
    const dbOps = metrics.databaseOperations;
    const fileOps = metrics.fileOperations;

    // Calculate error rates
    const dbErrorRate =
      dbOps.reads + dbOps.writes > 0
        ? (dbOps.errors / (dbOps.reads + dbOps.writes)) * 100
        : 0;
    const fileErrorRate =
      fileOps.reads + fileOps.writes > 0
        ? (fileOps.errors / (fileOps.reads + fileOps.writes)) * 100
        : 0;

    // Consider unhealthy if error rate is above 10% for either storage method
    return dbErrorRate < 10 && fileErrorRate < 10;
  }

  getStorageDirectory(): string {
    return this.filePersistence.getStorageDirectory();
  }
}
