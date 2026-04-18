import { resolve } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '@narada2/control-plane';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface IntegrityOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
}

interface IntegrityReport {
  status: 'ok' | 'issues_found';
  checks: {
    cursor: { exists: boolean; valid: boolean; error?: string };
    messages: { count: number; invalid: number; errors: string[] };
    applyLog: { count: number; orphanMarkers: number };
    views: { exists: boolean; folderCount: number };
  };
  summary: string;
}

export async function integrityCommand(
  options: IntegrityOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose: options.verbose });
  
  logger.info('Loading config', { path: configPath });
  const config = await loadConfig({ path: configPath });
  const rootDir = resolve(config.root_dir);
  
  logger.info('Running integrity checks', { rootDir });
  
  const report: IntegrityReport = {
    status: 'ok',
    checks: {
      cursor: { exists: false, valid: false },
      messages: { count: 0, invalid: 0, errors: [] },
      applyLog: { count: 0, orphanMarkers: 0 },
      views: { exists: false, folderCount: 0 },
    },
    summary: '',
  };
  
  // Check cursor
  try {
    const cursorPath = join(rootDir, 'state', 'cursor.json');
    await stat(cursorPath);
    report.checks.cursor.exists = true;
    
    const cursorData = JSON.parse(await readFile(cursorPath, 'utf8'));
    report.checks.cursor.valid = 
      typeof cursorData.committed_cursor === 'string' &&
      typeof cursorData.mailbox_id === 'string';
    
    logger.debug('Cursor check passed');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      report.checks.cursor.error = 'Cursor file not found (first run)';
      logger.info('No cursor found - first run');
    } else {
      report.checks.cursor.error = (err as Error).message;
      logger.error('Cursor check failed', err as Error);
    }
  }
  
  // Check messages
  try {
    const messagesDir = join(rootDir, 'messages');
    const entries = await readdir(messagesDir, { withFileTypes: true });
    const messageDirs = entries.filter(e => e.isDirectory());
    report.checks.messages.count = messageDirs.length;
    
    logger.info(`Found ${messageDirs.length} message directories`);
    
    // Sample messages for validity
    const sampleSize = Math.min(10, messageDirs.length);
    let checked = 0;
    
    for (const dir of messageDirs.slice(0, sampleSize)) {
      try {
        const recordPath = join(messagesDir, dir.name, 'record.json');
        const record = JSON.parse(await readFile(recordPath, 'utf8'));
        
        if (!record.message_id || !record.mailbox_id) {
          report.checks.messages.invalid++;
          report.checks.messages.errors.push(`Missing required fields in ${dir.name}`);
          logger.error(`Invalid record in ${dir.name}`);
        } else {
          checked++;
        }
      } catch (err) {
        report.checks.messages.invalid++;
        report.checks.messages.errors.push(`${dir.name}: ${(err as Error).message}`);
        logger.error(`Error reading ${dir.name}`, err as Error);
      }
    }
    
    logger.info(`Checked ${checked}/${sampleSize} sample messages`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      logger.info('No messages directory found');
    } else {
      throw err;
    }
  }
  
  // Check apply-log
  try {
    const applyLogDir = join(rootDir, 'state', 'apply-log');
    
    async function countJsonFiles(dir: string): Promise<number> {
      let count = 0;
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          count += await countJsonFiles(join(dir, entry.name));
        } else if (entry.name.endsWith('.json')) {
          count++;
        }
      }
      
      return count;
    }
    
    report.checks.applyLog.count = await countJsonFiles(applyLogDir);
    logger.info(`Found ${report.checks.applyLog.count} apply-log markers`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      logger.info('No apply-log directory found');
    } else {
      throw err;
    }
  }
  
  // Check views
  try {
    const viewsDir = join(rootDir, 'views');
    const entries = await readdir(viewsDir, { withFileTypes: true });
    report.checks.views.exists = true;
    report.checks.views.folderCount = entries.filter(e => e.isDirectory()).length;
    logger.info(`Found ${report.checks.views.folderCount} view folders`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      logger.info('No views directory found');
    } else {
      throw err;
    }
  }
  
  // Determine overall status
  if (!report.checks.cursor.valid || report.checks.messages.invalid > 0) {
    report.status = 'issues_found';
  }
  
  // Generate summary
  const parts: string[] = [];
  parts.push(`Cursor: ${report.checks.cursor.exists ? (report.checks.cursor.valid ? '✓ valid' : '✗ invalid') : 'missing'}`);
  parts.push(`Messages: ${report.checks.messages.count} (${report.checks.messages.invalid} invalid)`);
  parts.push(`Apply log: ${report.checks.applyLog.count} events`);
  parts.push(`Views: ${report.checks.views.exists ? `${report.checks.views.folderCount} folders` : 'missing'}`);
  report.summary = parts.join(', ');
  
  const exitCode = report.status === 'ok' ? ExitCode.SUCCESS : ExitCode.INTEGRITY_ISSUES;
  
  // Output
  if (fmt.getFormat() === 'json') {
    return { exitCode, result: report };
  }
  
  outputHumanReadable(fmt, report);
  return { exitCode, result: report };
}

function outputHumanReadable(
  fmt: ReturnType<typeof createFormatter>,
  report: IntegrityReport,
): void {
  if (report.status === 'ok') {
    fmt.message('Integrity check passed - no issues found', 'success');
  } else {
    fmt.message('Integrity check found issues', 'warning');
  }
  
  fmt.section('Cursor');
  if (report.checks.cursor.exists) {
    if (report.checks.cursor.valid) {
      fmt.kv('Status', 'Valid');
      fmt.kv('Exists', true);
    } else {
      fmt.kv('Status', 'Invalid');
      fmt.kv('Error', report.checks.cursor.error || 'Unknown error');
    }
  } else {
    fmt.kv('Status', 'Not found');
    fmt.kv('Note', 'This is normal for the first run');
  }
  
  fmt.section('Messages');
  fmt.kv('Total messages', fmt.formatNumber(report.checks.messages.count));
  
  if (report.checks.messages.invalid > 0) {
    fmt.kv('Invalid records', report.checks.messages.invalid);
    fmt.message('Sample errors:', 'error');
    for (const error of report.checks.messages.errors.slice(0, 3)) {
      console.log(`  • ${error}`);
    }
    if (report.checks.messages.errors.length > 3) {
      console.log(`  ... and ${report.checks.messages.errors.length - 3} more`);
    }
  } else if (report.checks.messages.count > 0) {
    fmt.message('All sampled messages are valid', 'success');
  } else {
    fmt.message('No messages found', 'info');
  }
  
  fmt.section('Apply Log');
  fmt.kv('Event markers', fmt.formatNumber(report.checks.applyLog.count));
  if (report.checks.applyLog.count === 0) {
    fmt.message('No events recorded yet', 'info');
  }
  
  fmt.section('Views');
  if (report.checks.views.exists) {
    fmt.kv('Status', 'Present');
    fmt.kv('Folder count', report.checks.views.folderCount);
  } else {
    fmt.kv('Status', 'Not found');
    fmt.message('Views will be created on first sync', 'info');
  }
  
  if (report.status === 'ok') {
    console.log('');
    fmt.message('Your data directory looks healthy!', 'success');
  } else {
    console.log('');
    fmt.message('Some issues were found. Review the details above.', 'warning');
    
    if (!report.checks.cursor.valid) {
      console.log('');
      fmt.message('To fix cursor issues, try running a fresh sync:', 'info');
      console.log('  narada sync --config ./config.json');
    }
  }
}
