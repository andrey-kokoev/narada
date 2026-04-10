/**
 * Output formatter supporting human-readable and JSON formats
 */

import chalk from 'chalk';

export type OutputFormat = 'human' | 'json';

export interface Formatter {
  result(data: unknown): void;
  error(message: string, error?: Error): void;
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
  table(headers: string[], rows: string[][]): void;
}

function isTTY(): boolean {
  return process.stdout.isTTY ?? false;
}

export function detectFormat(explicitFormat?: OutputFormat): OutputFormat {
  if (explicitFormat) return explicitFormat;
  // Default to human for TTY, JSON for pipes
  return isTTY() ? 'human' : 'json';
}

export function createFormatter(format: OutputFormat): Formatter {
  if (format === 'json') {
    return {
      result(data: unknown): void {
        console.log(JSON.stringify(data, null, 2));
      },
      error(message: string, error?: Error): void {
        console.error(JSON.stringify({
          level: 'error',
          message,
          error: error?.message,
        }));
      },
      info(message: string): void {
        console.error(JSON.stringify({ level: 'info', message }));
      },
      success(message: string): void {
        console.error(JSON.stringify({ level: 'success', message }));
      },
      warning(message: string): void {
        console.error(JSON.stringify({ level: 'warning', message }));
      },
      table(): void {
        // Tables not supported in JSON mode
      },
    };
  }

  // Human format with colors
  return {
    result(data: unknown): void {
      if (typeof data === 'object' && data !== null) {
        // Pretty print objects
        const obj = data as Record<string, unknown>;
        
        // Special formatting for sync results (have event_count, applied_count, etc.)
        if ('status' in obj && typeof obj.status === 'string' && 
            ('event_count' in obj || 'applied_count' in obj || 'duration_ms' in obj)) {
          printSyncResult(obj);
          return;
        }
        
        // Special formatting for integrity reports (have checks object)
        if ('checks' in obj) {
          printIntegrityReport(obj);
          return;
        }
        
        // Generic success/error result
        if ('status' in obj) {
          printGenericResult(obj);
          return;
        }
      }
      
      // Default: pretty JSON
      console.log(JSON.stringify(data, null, 2));
    },
    
    error(message: string, error?: Error): void {
      console.error(chalk.red('✗'), chalk.bold('Error:'), message);
      if (error?.message && process.env.DEBUG) {
        console.error(chalk.gray(error.message));
      }
    },
    
    info(message: string): void {
      console.error(chalk.blue('ℹ'), message);
    },
    
    success(message: string): void {
      console.error(chalk.green('✓'), message);
    },
    
    warning(message: string): void {
      console.error(chalk.yellow('⚠'), message);
    },
    
    table(headers: string[], rows: string[][]): void {
      // Simple table formatting
      const colWidths = headers.map((h, i) => {
        const maxData = Math.max(...rows.map(r => r[i]?.length ?? 0));
        return Math.max(h.length, maxData) + 2;
      });
      
      // Header
      const headerLine = headers.map((h, i) => 
        chalk.bold(h.padEnd(colWidths[i]))
      ).join('');
      console.log(headerLine);
      console.log(headers.map((_, i) => '-'.repeat(colWidths[i])).join(''));
      
      // Rows
      for (const row of rows) {
        console.log(row.map((cell, i) => 
          (cell ?? '').padEnd(colWidths[i])
        ).join(''));
      }
    },
  };
}

function printSyncResult(result: Record<string, unknown>): void {
  const status = result.status as string;
  const statusColor = status === 'success' ? chalk.green :
                      status === 'retryable_failure' ? chalk.yellow :
                      chalk.red;
  
  console.log();
  console.log(statusColor.bold(`  ${status === 'success' ? '✓' : '✗'} Sync ${status}`));
  console.log();
  
  if (typeof result.event_count === 'number') {
    console.log(`  Events:     ${result.event_count}`);
  }
  if (typeof result.applied_count === 'number') {
    console.log(`  Applied:    ${chalk.green(String(result.applied_count))}`);
  }
  if (typeof result.skipped_count === 'number') {
    console.log(`  Skipped:    ${result.skipped_count}`);
  }
  if (typeof result.duration_ms === 'number') {
    console.log(`  Duration:   ${result.duration_ms}ms`);
  }
  
  if (result.error) {
    console.log();
    console.log(chalk.red(`  Error: ${result.error}`));
  }
  
  console.log();
}

function printGenericResult(result: Record<string, unknown>): void {
  const status = result.status as string;
  const isError = status === 'error' || status === 'failed';
  const icon = isError ? chalk.red('✗') : chalk.green('✓');
  const statusText = isError ? chalk.red(status) : chalk.green(status);
  
  console.log();
  console.log(`  ${icon} ${statusText}`);
  
  if (result.message) {
    console.log(`  ${result.message}`);
  }
  
  if (result.error) {
    console.log(`  ${chalk.red(String(result.error))}`);
  }
  
  // Print next_steps if present
  const nextSteps = result.next_steps as string[] | undefined;
  if (nextSteps && nextSteps.length > 0) {
    console.log();
    console.log(chalk.bold('  Next steps:'));
    for (const step of nextSteps) {
      console.log(`    • ${step}`);
    }
  }
  
  console.log();
}

function printIntegrityReport(report: Record<string, unknown>): void {
  const status = report.status as string;
  const checks = report.checks as Record<string, unknown> | undefined;
  
  console.log();
  console.log(status === 'ok' 
    ? chalk.green.bold('  ✓ Integrity Check Passed')
    : chalk.red.bold('  ✗ Integrity Issues Found')
  );
  console.log();
  
  if (checks) {
    // Cursor
    const cursor = checks.cursor as Record<string, unknown> | undefined;
    if (cursor) {
      const cursorOk = cursor.exists && cursor.valid;
      console.log(`  Cursor:     ${cursorOk ? chalk.green('✓') : chalk.red('✗')} ${cursor.exists ? 'exists' : 'missing'}${cursor.valid ? ', valid' : ', invalid'}`);
    }
    
    // Messages
    const messages = checks.messages as Record<string, unknown> | undefined;
    if (messages) {
      const msgCount = messages.count as number ?? 0;
      const invalid = messages.invalid as number ?? 0;
      console.log(`  Messages:   ${msgCount} total${invalid > 0 ? chalk.red(`, ${invalid} invalid`) : ''}`);
    }
    
    // Apply log
    const applyLog = checks.applyLog as Record<string, unknown> | undefined;
    if (applyLog) {
      console.log(`  Apply Log:  ${applyLog.count ?? 0} events`);
    }
    
    // Views
    const views = checks.views as Record<string, unknown> | undefined;
    if (views) {
      console.log(`  Views:      ${views.exists ? views.folderCount ?? 0 : chalk.yellow('not initialized')}`);
    }
  }
  
  console.log();
}
