import { promises as fs } from 'fs';
import { join } from 'path';
import { Logger } from '../logging/Logger';
import { ProjectContext } from './ConversationAgent';

export interface ConversationState {
  conversationId: string;
  workingDirectory: string;
  conversationHistory: Array<{
    role: string;
    content: string;
    timestamp: Date;
  }>;
  projectContext: ProjectContext;
  totalCost: number;
  messageCount: number;
  lastUpdated: Date;
}

/**
 * ConversationPersistence handles saving and loading conversation state
 * to avoid re-analyzing projects and losing conversation context.
 */
export class ConversationPersistence {
  private readonly storageDir: string;
  private readonly maxAge = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Use a temporary directory or system temp for conversation storage
    this.storageDir = join(process.cwd(), '.a2s2-conversations');
    this.ensureStorageDir();
  }

  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.access(this.storageDir);
    } catch (error) {
      await fs.mkdir(this.storageDir, { recursive: true });
      Logger.info('Created conversation storage directory', {
        path: this.storageDir,
      });
    }
  }

  async saveConversation(state: ConversationState): Promise<void> {
    try {
      const filePath = join(this.storageDir, `${state.conversationId}.json`);
      const serializedState = {
        ...state,
        conversationHistory: state.conversationHistory.map(msg => ({
          ...msg,
          timestamp: msg.timestamp.toISOString(),
        })),
        lastUpdated: state.lastUpdated.toISOString(),
      };

      await fs.writeFile(filePath, JSON.stringify(serializedState, null, 2));
      
      Logger.debug('Conversation state saved', {
        conversationId: state.conversationId,
        messageCount: state.messageCount,
        totalCost: state.totalCost,
      });
    } catch (error) {
      Logger.error('Failed to save conversation state', {
        conversationId: state.conversationId,
        error: String(error),
      });
      throw error;
    }
  }

  async loadConversation(conversationId: string): Promise<ConversationState | null> {
    try {
      const filePath = join(this.storageDir, `${conversationId}.json`);
      
      try {
        await fs.access(filePath);
      } catch (error) {
        // File doesn't exist, return null
        return null;
      }

      const data = await fs.readFile(filePath, 'utf-8');
      const serializedState = JSON.parse(data);
      
      // Check if the conversation is too old
      const lastUpdated = new Date(serializedState.lastUpdated);
      const now = new Date();
      
      if (now.getTime() - lastUpdated.getTime() > this.maxAge) {
        Logger.info('Conversation state expired, removing', {
          conversationId,
          age: now.getTime() - lastUpdated.getTime(),
        });
        await this.removeConversation(conversationId);
        return null;
      }

      // Deserialize the state
      const state: ConversationState = {
        ...serializedState,
        conversationHistory: serializedState.conversationHistory.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
        lastUpdated: new Date(serializedState.lastUpdated),
      };

      Logger.debug('Conversation state loaded', {
        conversationId,
        messageCount: state.messageCount,
        totalCost: state.totalCost,
        age: `${Math.floor((now.getTime() - lastUpdated.getTime()) / (60 * 1000))} minutes`,
      });

      return state;
    } catch (error) {
      Logger.error('Failed to load conversation state', {
        conversationId,
        error: String(error),
      });
      return null;
    }
  }

  async removeConversation(conversationId: string): Promise<void> {
    try {
      const filePath = join(this.storageDir, `${conversationId}.json`);
      await fs.unlink(filePath);
      
      Logger.debug('Conversation state removed', { conversationId });
    } catch (error) {
      Logger.warn('Failed to remove conversation state', {
        conversationId,
        error: String(error),
      });
    }
  }

  async listConversations(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      Logger.error('Failed to list conversations', {
        error: String(error),
      });
      return [];
    }
  }

  async cleanupExpiredConversations(): Promise<void> {
    try {
      const conversations = await this.listConversations();
      const now = new Date();

      for (const conversationId of conversations) {
        try {
          const filePath = join(this.storageDir, `${conversationId}.json`);
          const stats = await fs.stat(filePath);
          
          if (now.getTime() - stats.mtime.getTime() > this.maxAge) {
            await this.removeConversation(conversationId);
          }
        } catch (error) {
          // Ignore individual file errors
        }
      }
      
      Logger.debug('Expired conversation cleanup completed');
    } catch (error) {
      Logger.warn('Failed to cleanup expired conversations', {
        error: String(error),
      });
    }
  }

  getStorageDirectory(): string {
    return this.storageDir;
  }
}