/**
 * File-based logging with rotation
 *
 * Writes logs to files with size-based rotation and optional compression.
 * Designed for production deployments where logs need to be persisted.
 */

import { appendFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { LogEntry, LogTransport } from './types.js';

export interface FileLoggerConfig {
  /** Directory to write log files */
  directory: string;
  /** Maximum file size before rotation (e.g., "10MB", "1GB") */
  maxSize: string;
  /** Maximum number of rotated files to keep */
  maxFiles: number;
  /** Compress rotated files with gzip */
  compress: boolean;
  /** Base filename (default: narada) */
  filename?: string;
}

/**
 * Parse human-readable size string to bytes
 *
 * Examples:
 * - "10MB" -> 10485760
 * - "1GB" -> 1073741824
 * - "100KB" -> 102400
 */
function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * (multipliers[unit] || 1));
}

/**
 * File transport with rotation
 *
 * Features:
 * - Size-based rotation (when file exceeds maxSize)
 * - Keeps maxFiles rotated versions
 * - Optional gzip compression
 * - Thread-safe (Node.js single-threaded)
 * - Atomic rotation (rename then reopen)
 */
export class FileTransport implements LogTransport {
  private readonly config: Required<FileLoggerConfig>;
  private readonly maxSizeBytes: number;
  private currentSize = 0;
  private pending: Promise<void> = Promise.resolve();

  constructor(config: FileLoggerConfig) {
    this.config = {
      filename: 'narada',
      ...config,
    };
    this.maxSizeBytes = parseSize(this.config.maxSize);
  }

  /**
   * Initialize the transport (create directory and open file)
   *
   * Must be called before first use.
   */
  async init(): Promise<void> {
    await mkdir(this.config.directory, { recursive: true });
    const logPath = this.getCurrentPath();

    // Check if existing file and get its size
    try {
      const stats = await stat(logPath);
      this.currentSize = stats.size;
    } catch {
      this.currentSize = 0;
    }

    await appendFile(logPath, '', 'utf8');
  }

  /**
   * Write a log entry to file
   */
  write(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    const lineBytes = Buffer.byteLength(line, 'utf8');
    this.pending = this.pending.then(async () => {
      if (this.currentSize + lineBytes > this.maxSizeBytes) {
        await this.performRotation();
      }
      await appendFile(this.getCurrentPath(), line, 'utf8');
      this.currentSize += lineBytes;
    }).catch(() => {
      // Logging failures must remain non-fatal.
    });
  }

  /**
   * Flush any buffered writes
   */
  async flush(): Promise<void> {
    await this.pending;
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    await this.flush();
  }

  /**
   * Get current log file path
   */
  getCurrentPath(): string {
    return this.getLogPath(0);
  }

  private getLogPath(index: number): string {
    const base = join(this.config.directory, this.config.filename);
    if (index === 0) {
      return `${base}.log`;
    }
    const suffix = this.config.compress ? '.gz' : '';
    return `${base}.log.${index}${suffix}`;
  }

  private async performRotation(): Promise<void> {
    // Rotate existing files
    await this.rotateFiles();
    this.currentSize = 0;
    await writeFile(this.getCurrentPath(), '', 'utf8');
  }

  private async rotateFiles(): Promise<void> {
    // Delete oldest file if it exists
    const oldestPath = this.getLogPath(this.config.maxFiles);
    try {
      await unlink(oldestPath);
    } catch {
      // File might not exist
    }

    // Rotate files (n -> n+1)
    for (let i = this.config.maxFiles - 1; i >= 1; i--) {
      const oldPath = this.getLogPath(i);
      const newPath = this.getLogPath(i + 1);
      try {
        await rename(oldPath, newPath);
      } catch {
        // File might not exist
      }
    }

    // Move current file to .1
    const currentPath = this.getLogPath(0);
    const rotatedPath = this.getLogPath(1);

    if (this.config.compress) {
      // Compress current file
      const content = await readFile(currentPath);
      await writeFile(rotatedPath, gzipSync(content));
      await unlink(currentPath);
    } else {
      await rename(currentPath, rotatedPath);
    }
  }
}

/**
 * Create a file logger transport
 *
 * Example:
 * ```typescript
 * const transport = createFileLogger({
 *   directory: '/var/log/narada',
 *   maxSize: '10MB',
 *   maxFiles: 5,
 *   compress: true,
 * });
 * await transport.init();
 * ```
 */
export function createFileLogger(config: FileLoggerConfig): FileTransport {
  return new FileTransport(config);
}

/**
 * Default log directory based on data directory
 */
export function getDefaultLogDirectory(dataDir: string): string {
  return join(dataDir, 'logs');
}
