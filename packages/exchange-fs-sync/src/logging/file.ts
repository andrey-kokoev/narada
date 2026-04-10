/**
 * File-based logging with rotation
 *
 * Writes logs to files with size-based rotation and optional compression.
 * Designed for production deployments where logs need to be persisted.
 */

import { createWriteStream, type WriteStream } from 'node:fs';
import { rename, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
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
  /** Base filename (default: exchange-sync) */
  filename?: string;
}

interface ParsedSize {
  value: number;
  unit: string;
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
  private stream: WriteStream | null = null;
  private currentSize = 0;
  private rotating = false;
  private buffer: string[] = [];
  private flushPromise: Promise<void> | null = null;

  constructor(config: FileLoggerConfig) {
    this.config = {
      filename: 'exchange-sync',
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
    const { mkdir } = await import('node:fs/promises');
    await mkdir(this.config.directory, { recursive: true });

    const logPath = this.getLogPath(0);

    // Check if existing file and get its size
    try {
      const stats = await stat(logPath);
      this.currentSize = stats.size;
    } catch {
      this.currentSize = 0;
    }

    this.stream = createWriteStream(logPath, { flags: 'a' });

    await new Promise<void>((resolve, reject) => {
      this.stream!.once('open', resolve);
      this.stream!.once('error', reject);
    });
  }

  /**
   * Write a log entry to file
   */
  write(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    const lineBytes = Buffer.byteLength(line, 'utf8');

    // Check if rotation needed
    if (this.currentSize + lineBytes > this.maxSizeBytes && !this.rotating) {
      this.rotating = true;
      this.performRotation().catch(() => {
        // Rotation errors are silent to avoid breaking application
      }).finally(() => {
        this.rotating = false;
      });
    }

    // Buffer if rotating
    if (this.rotating) {
      this.buffer.push(line);
      return;
    }

    // Write directly
    if (this.stream && this.stream.writable) {
      this.stream.write(line);
      this.currentSize += lineBytes;
    }
  }

  /**
   * Flush any buffered writes
   */
  async flush(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    this.flushPromise = this.doFlush();
    return this.flushPromise;
  }

  private async doFlush(): Promise<void> {
    if (this.stream && this.stream.writable) {
      await new Promise<void>((resolve) => {
        this.stream!.end(resolve);
      });
      this.stream = null;
    }
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
    return `${base}.${index}.log${suffix}`;
  }

  private async performRotation(): Promise<void> {
    if (!this.stream) return;

    // Close current stream
    await this.doFlush();

    // Rotate existing files
    await this.rotateFiles();

    // Reopen new file
    this.currentSize = 0;
    this.stream = createWriteStream(this.getLogPath(0), { flags: 'w' });

    // Flush buffer
    const buffer = this.buffer;
    this.buffer = [];
    for (const line of buffer) {
      this.write(JSON.parse(line) as LogEntry);
    }
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
      const { createGzip } = await import('node:zlib');
      const { pipeline } = await import('node:stream/promises');
      const { createReadStream, createWriteStream } = await import('node:fs');

      const gzip = createGzip();
      const source = createReadStream(currentPath);
      const dest = createWriteStream(`${rotatedPath}.gz`);

      await pipeline(source, gzip, dest);
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
 *   directory: '/var/log/exchange-sync',
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
