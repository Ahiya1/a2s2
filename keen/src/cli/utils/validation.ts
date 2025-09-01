/**
 * keen CLI - Validation utilities
 */

import { promises as fs } from 'fs';
import { statSync } from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * Validate vision string
 */
export function validateVision(vision: string, source: string): void {
  if (!vision || typeof vision !== 'string') {
    throw new Error(`Invalid vision from ${source}: vision must be a non-empty string`);
  }
  
  const trimmed = vision.trim();
  if (trimmed.length < 10) {
    throw new Error(`Invalid vision from ${source}: vision must be at least 10 characters long`);
  }
  
  if (trimmed.length > 10000) {
    throw new Error(`Invalid vision from ${source}: vision must be less than 10,000 characters`);
  }
}

/**
 * Validate directory path
 */
export function validateDirectory(directory: string): void {
  if (!directory || typeof directory !== 'string') {
    throw new Error('Invalid directory: directory must be a non-empty string');
  }
  
  const resolved = path.resolve(directory);
  
  try {
    const stat = statSync(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`Invalid directory: ${resolved} is not a directory`);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Invalid directory: ${resolved} does not exist`);
    }
    throw error;
  }
}

/**
 * Validate file path
 */
export function validateFile(filePath: string): void {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path: file path must be a non-empty string');
  }
  
  const resolved = path.resolve(filePath);
  
  try {
    const stat = statSync(resolved);
    if (!stat.isFile()) {
      throw new Error(`Invalid file: ${resolved} is not a file`);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${resolved}`);
    }
    throw error;
  }
}

/**
 * Validate phase value
 */
export function validatePhase(phase: string): void {
  const validPhases = ['EXPLORE', 'SUMMON', 'COMPLETE'];
  if (!validPhases.includes(phase)) {
    throw new Error(`Invalid phase: ${phase}. Valid phases are: ${validPhases.join(', ')}`);
  }
}

/**
 * Validate numeric options
 */
export function validateNumericOption(value: string, name: string, min?: number, max?: number): number {
  const num = parseFloat(value);
  
  if (isNaN(num)) {
    throw new Error(`Invalid ${name}: must be a number`);
  }
  
  if (min !== undefined && num < min) {
    throw new Error(`Invalid ${name}: must be at least ${min}`);
  }
  
  if (max !== undefined && num > max) {
    throw new Error(`Invalid ${name}: must be at most ${max}`);
  }
  
  return num;
}

/**
 * Check if directory is writable
 */
export async function checkDirectoryWritable(directory: string): Promise<boolean> {
  try {
    const testFile = path.join(directory, '.keen-test-write');
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is within allowed boundaries (security)
 */
export function validatePathSecurity(targetPath: string, allowedRoot: string): void {
  const resolved = path.resolve(targetPath);
  const allowedResolved = path.resolve(allowedRoot);
  
  if (!resolved.startsWith(allowedResolved)) {
    throw new Error(`Path ${resolved} is outside allowed directory ${allowedResolved}`);
  }
}
