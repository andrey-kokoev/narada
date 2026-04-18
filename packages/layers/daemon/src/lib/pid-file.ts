/**
 * PID file management for daemon process tracking
 */

import { writeFile, readFile, rm } from 'node:fs/promises';

export interface PidFileOptions {
  path: string;
  checkStale?: boolean;
}

export class PidFile {
  private readonly path: string;
  private readonly checkStale: boolean;

  constructor(options: PidFileOptions) {
    this.path = options.path;
    this.checkStale = options.checkStale ?? true;
  }

  /**
   * Write PID file, optionally checking if another instance is running
   */
  async write(): Promise<void> {
    if (this.checkStale) {
      const existingPid = await this.read();
      if (existingPid !== null) {
        // Check if process is actually running
        const isRunning = await this.isProcessRunning(existingPid);
        if (isRunning) {
          throw new Error(`Another instance is already running (PID: ${existingPid})`);
        }
        // Stale PID file, remove it
        await this.remove();
      }
    }

    await writeFile(this.path, String(process.pid), 'utf8');
  }

  /**
   * Remove PID file
   */
  async remove(): Promise<void> {
    try {
      await rm(this.path);
    } catch {
      // Ignore errors (file may not exist)
    }
  }

  /**
   * Read PID from file
   */
  async read(): Promise<number | null> {
    try {
      const content = await readFile(this.path, 'utf8');
      const pid = parseInt(content.trim(), 10);
      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }

  /**
   * Check if a process is running (basic check - not cross-platform)
   */
  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      // process.kill(0) checks if process exists without actually sending signal
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
