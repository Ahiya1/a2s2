/**
 * keen Agent Session - Session management and tracking
 */

import { promises as fs } from 'fs';
import path from 'path';
import { AgentSessionOptions, ThinkingBlock, AgentPhase } from './types.js';
import chalk from 'chalk';

export class AgentSession {
  private options: AgentSessionOptions;
  private thinkingBlocks: ThinkingBlock[] = [];
  private startTime: Date;
  private currentPhase: AgentPhase = 'EXPLORE';
  private executionLog: any[] = [];
  
  constructor(options: AgentSessionOptions) {
    this.options = options;
    this.startTime = new Date();
  }
  
  /**
   * Start the agent session
   */
  async start(): Promise<void> {
    if (this.options.verbose) {
      console.log(chalk.blue(`🚀 Starting agent session: ${this.options.sessionId}`));
    }
    
    // Log session start
    this.logExecution('session_start', {
      sessionId: this.options.sessionId,
      vision: this.options.vision.substring(0, 200),
      workingDirectory: this.options.workingDirectory,
      startTime: this.startTime.toISOString()
    });
  }
  
  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.options.sessionId;
  }
  
  /**
   * Log execution event
   */
  logExecution(eventType: string, data: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.options.sessionId,
      eventType,
      data
    };
    
    this.executionLog.push(logEntry);
    
    if (this.options.debug) {
      console.log(chalk.gray(`[DEBUG] ${eventType}: ${JSON.stringify(data)}`));
    }
  }
  
  /**
   * Store thinking block
   */
  storeThinkingBlock(block: ThinkingBlock): void {
    this.thinkingBlocks.push(block);
    
    if (this.options.verbose) {
      console.log(chalk.magenta(`🧠 Thinking: ${block.content.substring(0, 100)}...`));
    }
  }
  
  /**
   * Update current phase
   */
  updatePhase(phase: AgentPhase): void {
    const previousPhase = this.currentPhase;
    this.currentPhase = phase;
    
    this.logExecution('phase_transition', {
      from: previousPhase,
      to: phase,
      timestamp: new Date().toISOString()
    });
    
    if (this.options.verbose) {
      console.log(chalk.blue(`🔄 Phase transition: ${previousPhase} → ${phase}`));
    }
  }
  
  /**
   * Get current phase
   */
  getCurrentPhase(): AgentPhase {
    return this.currentPhase;
  }
  
  /**
   * Get session duration
   */
  getDuration(): number {
    return Date.now() - this.startTime.getTime();
  }
  
  /**
   * Get thinking blocks
   */
  getThinkingBlocks(): ThinkingBlock[] {
    return [...this.thinkingBlocks];
  }
  
  /**
   * Get execution log
   */
  getExecutionLog(): any[] {
    return [...this.executionLog];
  }
  
  /**
   * Save session to disk (for debugging/recovery)
   */
  async saveSession(outputDir?: string): Promise<string> {
    const sessionData = {
      sessionId: this.options.sessionId,
      vision: this.options.vision,
      visionFile: this.options.visionFile,
      workingDirectory: this.options.workingDirectory,
      startTime: this.startTime.toISOString(),
      currentPhase: this.currentPhase,
      duration: this.getDuration(),
      thinkingBlocks: this.thinkingBlocks,
      executionLog: this.executionLog,
      anthropicConfig: this.options.anthropicConfig
    };
    
    const saveDir = outputDir || path.join(this.options.workingDirectory, '.keen-sessions');
    const fileName = `${this.options.sessionId}.json`;
    const filePath = path.join(saveDir, fileName);
    
    try {
      await fs.mkdir(saveDir, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));
      
      if (this.options.verbose) {
        console.log(chalk.green(`💾 Session saved: ${filePath}`));
      }
      
      return filePath;
    } catch (error: any) {
      console.error(chalk.red(`Failed to save session: ${error.message}`));
      throw error;
    }
  }
  
  /**
   * Load session from disk
   */
  static async loadSession(sessionFile: string): Promise<any> {
    try {
      const sessionData = JSON.parse(await fs.readFile(sessionFile, 'utf-8'));
      return sessionData;
    } catch (error: any) {
      throw new Error(`Failed to load session: ${error.message}`);
    }
  }
}
