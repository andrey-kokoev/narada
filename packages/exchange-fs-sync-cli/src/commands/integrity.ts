import { resolve } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from 'exchange-fs-sync';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';

export interface IntegrityOptions {
  config?: string;
  verbose?: boolean;
  format?: string;
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
      throw err; // Re-throw unexpected errors
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
  
  return { exitCode, result: report };
}
