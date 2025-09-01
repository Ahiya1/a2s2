/**
 * keen CLI - Progress indicators and visual feedback
 */

import chalk from 'chalk';

/**
 * Simple spinner progress indicator
 */
export function startProgressIndicator(message: string): () => void {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let isRunning = true;
  
  const interval = setInterval(() => {
    if (!isRunning) return;
    
    process.stdout.write(`\r${chalk.cyan(frames[i])} ${message}`);
    i = (i + 1) % frames.length;
  }, 100);
  
  return () => {
    isRunning = false;
    clearInterval(interval);
    process.stdout.write('\r' + ' '.repeat(message.length + 5) + '\r');
  };
}

/**
 * Stop progress indicator
 */
export function stopProgressIndicator(stopFn: () => void): void {
  stopFn();
}

/**
 * Progress bar for longer operations
 */
export class ProgressBar {
  private current: number = 0;
  private total: number;
  private width: number = 40;
  private message: string;
  
  constructor(total: number, message: string = 'Progress') {
    this.total = total;
    this.message = message;
  }
  
  update(current: number, customMessage?: string): void {
    this.current = current;
    const percentage = Math.floor((current / this.total) * 100);
    const filled = Math.floor((current / this.total) * this.width);
    const empty = this.width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const msg = customMessage || this.message;
    
    process.stdout.write(`\r${chalk.blue(msg)}: ${chalk.green(bar)} ${percentage}%`);
    
    if (current >= this.total) {
      process.stdout.write('\n');
    }
  }
  
  increment(customMessage?: string): void {
    this.update(this.current + 1, customMessage);
  }
}

/**
 * Display step-by-step progress
 */
export class StepProgress {
  private steps: string[];
  private currentStep: number = 0;
  private startTime: number;
  
  constructor(steps: string[]) {
    this.steps = steps;
    this.startTime = Date.now();
  }
  
  start(): void {
    console.log(chalk.blue('\n🚀 Starting execution...'));
    this.showCurrentStep();
  }
  
  nextStep(customMessage?: string): void {
    if (this.currentStep < this.steps.length) {
      console.log(chalk.green(`✅ ${this.steps[this.currentStep]}`));
    }
    
    this.currentStep++;
    
    if (customMessage) {
      console.log(chalk.cyan(`ℹ️  ${customMessage}`));
    }
    
    this.showCurrentStep();
  }
  
  error(message: string): void {
    console.log(chalk.red(`❌ ${message}`));
  }
  
  complete(message?: string): void {
    const duration = Date.now() - this.startTime;
    console.log(chalk.green(`\n✅ All steps completed in ${Math.round(duration / 1000)}s`));
    
    if (message) {
      console.log(chalk.cyan(`📋 ${message}`));
    }
  }
  
  private showCurrentStep(): void {
    if (this.currentStep < this.steps.length) {
      const spinner = startProgressIndicator(this.steps[this.currentStep]);
      setTimeout(() => {
        stopProgressIndicator(spinner);
      }, 500);
    }
  }
}
