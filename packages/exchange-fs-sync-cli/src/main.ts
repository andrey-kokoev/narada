#!/usr/bin/env node
import { Command } from 'commander';
import { syncCommand } from './commands/sync.js';
import { integrityCommand } from './commands/integrity.js';
import { rebuildViewsCommand } from './commands/rebuild-views.js';
import { configCommand } from './commands/config.js';
import { configInteractiveCommand } from './commands/config-interactive.js';
import { statusCommand } from './commands/status.js';
import { backupCommand } from './commands/backup.js';
import { restoreCommand } from './commands/restore.js';
import { verifyBackupCommand } from './commands/verify-backup.js';
import { listBackupCommand } from './commands/backup-ls.js';
import { cleanupCommand } from './commands/cleanup.js';
import { wrapCommand } from './lib/command-wrapper.js';

const program = new Command();

program
  .name('exchange-sync')
  .description('Exchange filesystem synchronization CLI')
  .version('1.0.0')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--log-level <level>', 'Log level: debug, info, warn, error', 'info')
  .option('--log-format <format>', 'Log format: pretty, json, or auto', 'auto')
  .option('--metrics-output <file>', 'Write metrics to file on exit')
  .hook('preAction', (thisCommand) => {
    // Store format in environment for commands to access
    const opts = thisCommand.opts();
    if (opts.format) {
      process.env.OUTPUT_FORMAT = opts.format;
    }
    if (opts.logLevel) {
      process.env.LOG_LEVEL = opts.logLevel;
    }
    if (opts.logFormat) {
      process.env.LOG_FORMAT = opts.logFormat;
    }
    if (opts.metricsOutput) {
      process.env.METRICS_OUTPUT = opts.metricsOutput;
    }
  });

program
  .command('sync')
  .description('Run a single synchronization cycle')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('--dry-run', 'Show what would be done without making changes', false)
  .action(wrapCommand('sync', (opts, ctx) => 
    syncCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

program
  .command('integrity')
  .description('Check data integrity')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(wrapCommand('integrity', (opts, ctx) => 
    integrityCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

program
  .command('rebuild-views')
  .description('Rebuild all derived views')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(wrapCommand('rebuild-views', (opts, ctx) => 
    rebuildViewsCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

program
  .command('init')
  .description('Create a new configuration file')
  .option('-o, --output <path>', 'Output path for config file', './config.json')
  .option('-f, --force', 'Overwrite existing file', false)
  .option('-i, --interactive', 'Interactive mode with prompts', false)
  .action(wrapCommand('init', (opts, ctx) => {
    const format = process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto';
    if (opts.interactive) {
      return configInteractiveCommand({ ...opts, format }, ctx);
    }
    return configCommand({ ...opts, format }, ctx);
  }));

program
  .command('status')
  .description('Show sync status and health')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(wrapCommand('status', (opts, ctx) => 
    statusCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

// Backup commands
program
  .command('backup')
  .description('Create a backup of sync data')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .requiredOption('-o, --output <path>', 'Output file path (e.g., backup.tar.gz)')
  .option('--include <components>', 'Components to include (comma-separated: messages,views,config,cursor,applyLog,tombstones)', 'messages,views,config,cursor,applyLog,tombstones')
  .option('--exclude-pattern <pattern>', 'Exclude files matching pattern')
  .option('--compression <type>', 'Compression type (gzip, brotli, none)', 'gzip')
  .option('--encrypt', 'Encrypt backup with passphrase', false)
  .option('--passphrase <phrase>', 'Passphrase for encryption')
  .action(wrapCommand('backup', (opts, ctx) => {
    const include = opts.include.split(',') as Array<'messages' | 'views' | 'config' | 'cursor' | 'applyLog' | 'tombstones'>;
    return backupCommand({ 
      ...opts, 
      include,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' 
    }, ctx);
  }));

program
  .command('restore')
  .description('Restore data from backup')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .requiredOption('-i, --input <path>', 'Backup file path')
  .option('-t, --target-dir <path>', 'Override target directory')
  .option('-f, --force', 'Overwrite existing files', false)
  .option('--verify', 'Verify checksums before restoring', false)
  .option('--select <id>', 'Restore specific message by ID')
  .option('--before <date>', 'Restore only messages before date (ISO format)')
  .option('--passphrase <phrase>', 'Passphrase for encrypted backups')
  .action(wrapCommand('restore', (opts, ctx) => 
    restoreCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

program
  .command('backup-verify')
  .description('Verify backup integrity without extracting')
  .option('-v, --verbose', 'Enable verbose output', false)
  .requiredOption('-i, --input <path>', 'Backup file path')
  .option('--passphrase <phrase>', 'Passphrase for encrypted backups')
  .action(wrapCommand('backup-verify', (opts, ctx) => 
    verifyBackupCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

program
  .command('backup-ls')
  .description('List backup contents')
  .option('-v, --verbose', 'Enable verbose output', false)
  .requiredOption('-i, --input <path>', 'Backup file path')
  .option('-d, --detailed', 'Show detailed file listing', false)
  .option('--passphrase <phrase>', 'Passphrase for encrypted backups')
  .action(wrapCommand('backup-ls', (opts, ctx) => 
    listBackupCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

// Cleanup commands
program
  .command('cleanup')
  .description('Run data lifecycle cleanup operations')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('--dry-run', 'Preview changes without applying', false)
  .option('--tombstones', 'Clean tombstones only', false)
  .option('--compact', 'Archive old messages only', false)
  .option('--vacuum', 'Run integrity check only', false)
  .option('--retention', 'Apply retention policy only', false)
  .option('--all', 'Run all cleanup operations', false)
  .action(wrapCommand('cleanup', (opts, ctx) => 
    cleanupCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

program.parse();
