import type { Command } from 'commander';
import { backupCommand, type BackupComponent } from './backup.js';
import { restoreCommand } from './restore.js';
import { verifyBackupCommand } from './verify-backup.js';
import { listBackupCommand } from './backup-ls.js';
import { wrapCommand } from '../lib/command-wrapper.js';

type CliFormat = 'json' | 'human' | 'auto';

function outputFormat(): CliFormat {
  return process.env.OUTPUT_FORMAT as CliFormat;
}

export function registerBackupCommands(program: Command): void {
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
      const include = String(opts.include).split(',') as BackupComponent[];
      return backupCommand({ ...opts, include, format: outputFormat() }, ctx);
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
      restoreCommand({ ...opts, format: outputFormat() }, ctx)));

  program
    .command('backup-verify')
    .description('Verify backup integrity without extracting')
    .option('-v, --verbose', 'Enable verbose output', false)
    .requiredOption('-i, --input <path>', 'Backup file path')
    .option('--passphrase <phrase>', 'Passphrase for encrypted backups')
    .action(wrapCommand('backup-verify', (opts, ctx) =>
      verifyBackupCommand({ ...opts, format: outputFormat() }, ctx)));

  program
    .command('backup-ls')
    .description('List backup contents')
    .option('-v, --verbose', 'Enable verbose output', false)
    .requiredOption('-i, --input <path>', 'Backup file path')
    .option('-d, --detailed', 'Show detailed file listing', false)
    .option('--passphrase <phrase>', 'Passphrase for encrypted backups')
    .action(wrapCommand('backup-ls', (opts, ctx) =>
      listBackupCommand({ ...opts, format: outputFormat() }, ctx)));
}
