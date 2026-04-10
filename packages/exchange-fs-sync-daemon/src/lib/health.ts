/**
 * Health check file management
 */

import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

export interface HealthStatus {
  status: 'healthy' | 'stopped' | 'error';
  lastSyncAt?: string;
  cyclesCompleted: number;
  eventsApplied: number;
  errors: number;
  consecutiveErrors: number;
  pid: number;
  timestamp: string;
}

export interface HealthFileOptions {
  rootDir: string;
  filename?: string;
}

export class HealthFile {
  private readonly filepath: string;

  constructor(options: HealthFileOptions) {
    const filename = options.filename ?? '.health.json';
    this.filepath = join(options.rootDir, filename);
  }

  /**
   * Update health file with current status
   */
  async update(status: Omit<HealthStatus, 'timestamp'>): Promise<void> {
    const health: HealthStatus = {
      ...status,
      timestamp: new Date().toISOString(),
    };

    await writeFile(this.filepath, JSON.stringify(health, null, 2) + '\n', 'utf8');
  }

  /**
   * Mark as stopped and clean up
   */
  async markStopped(finalStatus: Omit<HealthStatus, 'status' | 'timestamp'>): Promise<void> {
    const health: HealthStatus = {
      ...finalStatus,
      status: 'stopped',
      timestamp: new Date().toISOString(),
    };

    await writeFile(this.filepath, JSON.stringify(health, null, 2) + '\n', 'utf8');
  }

  /**
   * Remove health file
   */
  async remove(): Promise<void> {
    try {
      await rm(this.filepath);
    } catch {
      // Ignore errors (file may not exist)
    }
  }

  /**
   * Get health file path
   */
  get path(): string {
    return this.filepath;
  }
}
