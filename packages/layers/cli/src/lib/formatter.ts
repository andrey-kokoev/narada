/**
 * Output formatter - supports JSON (machine) and human (interactive) formats
 */

import { WriteStream } from 'node:tty';

export type OutputFormat = 'json' | 'human' | 'auto';

export interface FormatterOptions {
  format?: OutputFormat;
  colors?: boolean;
  verbose?: boolean;
}

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

class Formatter {
  private format: OutputFormat;
  private colors: boolean;
  private verbose: boolean;

  constructor(options: FormatterOptions = {}) {
    this.format = options.format || 'auto';
    this.verbose = options.verbose || false;
    
    // Auto-detect: human for TTY, json for pipes
    if (this.format === 'auto') {
      this.format = process.stdout.isTTY ? 'human' : 'json';
    }
    
    // Enable colors if explicitly set, or if human format and TTY
    this.colors = options.colors ?? (this.format === 'human' && process.stdout.isTTY);
  }

  /**
   * Output data in the configured format
   */
  output(data: unknown): void {
    if (this.format === 'json') {
      console.log(JSON.stringify(data, null, 2));
    } else {
      // Human format - data should have a _format property or be formatted by caller
      if (data && typeof data === 'object' && '_formatted' in data) {
        console.log((data as { _formatted: string })._formatted);
      } else {
        // Fallback to JSON if not specifically formatted
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  /**
   * Output a simple message
   */
  message(text: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    if (this.format === 'json') {
      console.log(JSON.stringify({ type, message: text }));
      return;
    }

    const prefix = this.getPrefix(type);
    console.log(`${prefix}${text}${COLORS.reset}`);
  }

  /**
   * Output a section header
   */
  section(title: string): void {
    if (this.format === 'json') return;
    
    const line = '─'.repeat(60);
    console.log(`\n${this.c(title, 'bold')}`);
    console.log(this.c(line, 'gray'));
  }

  /**
   * Output a key-value pair
   */
  kv(key: string, value: unknown, options?: { indent?: number }): void {
    if (this.format === 'json') return;
    
    const indent = ' '.repeat(options?.indent || 2);
    const keyStr = `${indent}${key}:`;
    const paddedKey = keyStr.padEnd(25, ' ');
    
    let valueStr: string;
    if (value === null || value === undefined) {
      valueStr = this.c('-', 'gray');
    } else if (typeof value === 'boolean') {
      valueStr = value ? this.c('Yes', 'green') : this.c('No', 'red');
    } else if (typeof value === 'number') {
      valueStr = this.formatNumber(value);
    } else {
      valueStr = String(value);
    }
    
    console.log(`${this.c(paddedKey, 'dim')} ${valueStr}`);
  }

  /**
   * Output a table
   */
  table<T extends Record<string, unknown>>(
    headers: { key: keyof T; label: string; width?: number }[],
    rows: T[],
    options?: { maxWidth?: number }
  ): void {
    if (this.format === 'json') {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    if (rows.length === 0) {
      console.log(this.c('  (no data)', 'gray'));
      return;
    }

    // Calculate column widths
    const widths = headers.map(h => {
      const headerWidth = h.label.length;
      const maxDataWidth = Math.max(...rows.map(r => String(r[h.key] ?? '').length));
      return Math.min(
        h.width || Math.max(headerWidth, maxDataWidth) + 2,
        40
      );
    });

    // Print header
    const headerLine = headers
      .map((h, i) => this.c(h.label.padEnd(widths[i]), 'bold'))
      .join('');
    console.log(headerLine);
    console.log(headers.map((_, i) => '─'.repeat(widths[i])).join(''));

    // Print rows
    for (const row of rows) {
      const line = headers
        .map((h, i) => {
          const value = String(row[h.key] ?? '');
          const truncated = value.length > widths[i] 
            ? value.slice(0, widths[i] - 3) + '...'
            : value;
          return truncated.padEnd(widths[i]);
        })
        .join('');
      console.log(line);
    }
  }

  /**
   * Output a list
   */
  list(items: string[], options?: { bullet?: string; indent?: number }): void {
    if (this.format === 'json') return;
    
    const bullet = options?.bullet || '•';
    const indent = ' '.repeat(options?.indent || 2);
    
    for (const item of items) {
      console.log(`${indent}${this.c(bullet, 'dim')} ${item}`);
    }
  }

  /**
   * Format a duration in milliseconds
   */
  duration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  }

  /**
   * Format a number with commas
   */
  formatNumber(n: number): string {
    return n.toLocaleString();
  }

  /**
   * Format a file size
   */
  fileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  /**
   * Format a timestamp
   */
  timestamp(isoString: string | Date | undefined): string {
    if (!isoString) return this.c('never', 'gray');
    const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
    return date.toLocaleString();
  }

  /**
   * Get current format
   */
  getFormat(): OutputFormat {
    return this.format;
  }

  private getPrefix(type: 'info' | 'success' | 'warning' | 'error'): string {
    if (!this.colors) {
      const prefixes = { info: 'ℹ ', success: '✓ ', warning: '⚠ ', error: '✗ ' };
      return prefixes[type];
    }

    switch (type) {
      case 'success': return `${COLORS.green}✓${COLORS.reset} `;
      case 'warning': return `${COLORS.yellow}⚠${COLORS.reset} `;
      case 'error': return `${COLORS.red}✗${COLORS.reset} `;
      default: return `${COLORS.blue}ℹ${COLORS.reset} `;
    }
  }

  private c(text: string, color: keyof typeof COLORS): string {
    if (!this.colors) return text;
    return `${COLORS[color]}${text}${COLORS.reset}`;
  }
}

// Factory function
export function createFormatter(options?: FormatterOptions): Formatter {
  return new Formatter(options);
}

// Detect format from environment
export function detectFormat(): OutputFormat {
  const envFormat = process.env.OUTPUT_FORMAT as OutputFormat | undefined;
  if (envFormat && ['json', 'human', 'auto'].includes(envFormat)) {
    return envFormat;
  }
  return 'auto';
}
