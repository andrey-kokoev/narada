/**
 * Cleanup scheduler module
 * 
 * Manages scheduled execution of cleanup operations within time windows.
 */

import type { CleanupExecutionContext, CleanupSchedule } from './types.js';

/**
 * Default schedule
 */
const DEFAULT_SCHEDULE: CleanupSchedule = {
  frequency: 'weekly',
  maxRunTimeMinutes: 60,
};

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (
    isNaN(hours) || isNaN(minutes) ||
    hours < 0 || hours > 23 ||
    minutes < 0 || minutes > 59
  ) {
    throw new Error(`Invalid time format: ${timeStr}. Expected "HH:MM"`);
  }
  return hours * 60 + minutes;
}

/**
 * Check if current time is within the allowed time window
 */
function isInTimeWindow(
  now: Date,
  timeWindow: { start: string; end: string }
): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTime(timeWindow.start);
  const endMinutes = parseTime(timeWindow.end);
  
  if (startMinutes <= endMinutes) {
    // Simple case: start < end (e.g., 02:00 - 04:00)
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Wrap-around case: start > end (e.g., 22:00 - 02:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

/**
 * Check if cleanup should run based on frequency and last run
 */
function shouldRunByFrequency(
  frequency: CleanupSchedule['frequency'],
  lastRun: Date | null,
  now: Date
): boolean {
  if (frequency === 'manual') {
    return false;
  }

  if (!lastRun) {
    return true; // Never run before
  }
  
  const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
  
  switch (frequency) {
    case 'daily':
      return hoursSinceLastRun >= 20; // At least 20 hours ago (some flexibility)
      
    case 'weekly':
      return hoursSinceLastRun >= 6 * 24; // At least 6 days ago
      
    case 'on-sync':
      // This is checked externally - returns true if a sync just completed
      return true;
      
    default:
      return false;
  }
}

/**
 * Determine if cleanup should run now
 * 
 * Checks schedule constraints including frequency and time window.
 */
export function shouldRunCleanup(
  schedule: Partial<CleanupSchedule>,
  lastRun: Date | null,
  now: Date = new Date()
): boolean {
  const fullSchedule = { ...DEFAULT_SCHEDULE, ...schedule };
  
  // Check frequency first
  if (!shouldRunByFrequency(fullSchedule.frequency, lastRun, now)) {
    return false;
  }
  
  // Check time window if specified
  if (fullSchedule.timeWindow) {
    return isInTimeWindow(now, fullSchedule.timeWindow);
  }
  
  return true;
}

/**
 * Calculate next scheduled run time
 */
export function getNextRunTime(
  schedule: Partial<CleanupSchedule>,
  _lastRun: Date | null,
  now: Date = new Date()
): Date | null {
  const fullSchedule = { ...DEFAULT_SCHEDULE, ...schedule };
  
  if (fullSchedule.frequency === 'manual') {
    return null;
  }
  
  if (fullSchedule.frequency === 'on-sync') {
    return null; // Depends on sync, not time
  }
  
  let nextRun = new Date(now);
  
  // If we have a time window, use the start time
  if (fullSchedule.timeWindow) {
    const startMinutes = parseTime(fullSchedule.timeWindow.start);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    nextRun.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    
    // If we've passed the start time today, schedule for next period
    if (currentMinutes > startMinutes) {
      if (fullSchedule.frequency === 'daily') {
        nextRun.setDate(nextRun.getDate() + 1);
      } else {
        nextRun.setDate(nextRun.getDate() + 7);
      }
    }
  } else {
    // No time window - use frequency-based calculation
    if (fullSchedule.frequency === 'daily') {
      nextRun.setDate(nextRun.getDate() + 1);
    } else {
      nextRun.setDate(nextRun.getDate() + 7);
    }
  }
  
  return nextRun;
}

/**
 * Maybe run cleanup based on schedule
 * 
 * Returns true if cleanup was started, false if skipped.
 */
export async function maybeRunCleanup(
  schedule: Partial<CleanupSchedule>,
  lastRun: Date | null,
  context: CleanupExecutionContext,
  now: Date = new Date()
): Promise<boolean> {
  const { signal, execute, onSkipped, onStarted, onCompleted, onError } = context;
  
  // Check if already aborted
  if (signal?.aborted) {
    onSkipped?.('Aborted before start');
    return false;
  }
  
  // Check if should run
  if (!shouldRunCleanup(schedule, lastRun, now)) {
    const fullSchedule = { ...DEFAULT_SCHEDULE, ...schedule };
    const nextRun = getNextRunTime(schedule, lastRun, now);
    
    if (nextRun) {
      onSkipped?.(`Next run scheduled for ${nextRun.toISOString()}`);
    } else {
      onSkipped?.(`Frequency set to "${fullSchedule.frequency}"`);
    }
    return false;
  }
  
  // Start cleanup
  onStarted?.();
  
  try {
    await execute();
    onCompleted?.();
    return true;
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Create a timeout that respects the max run time
 */
export function createCleanupTimeout(
  maxRunTimeMinutes: number
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, maxRunTimeMinutes * 60 * 1000);
  
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

/**
 * Run cleanup with time limit
 */
export async function runWithTimeLimit<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  maxRunTimeMinutes: number
): Promise<T> {
  const { signal, clear } = createCleanupTimeout(maxRunTimeMinutes);
  
  try {
    return await fn(signal);
  } finally {
    clear();
  }
}
