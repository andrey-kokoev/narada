// Command exports
export { syncCommand, type SyncOptions } from './commands/sync.js';
export { integrityCommand, type IntegrityOptions } from './commands/integrity.js';
export { rebuildViewsCommand, type RebuildViewsOptions } from './commands/rebuild-views.js';
export { rebuildProjectionsCommand, type RebuildProjectionsOptions } from './commands/rebuild-projections.js';
export { configCommand, type ConfigOptions } from './commands/config.js';
export { backupCommand, type BackupOptions, type BackupResult, type BackupManifest } from './commands/backup.js';
export { restoreCommand, type RestoreOptions, type RestoreResult } from './commands/restore.js';
export { verifyBackupCommand, type VerifyBackupOptions, type VerifyBackupResult } from './commands/verify-backup.js';
export { listBackupCommand, type ListBackupOptions } from './commands/backup-ls.js';

// Lib exports
export { ExitCode, ExitCodeDescriptions } from './lib/exit-codes.js';
export { createLogger, type Logger } from './lib/logger.js';
export { wrapCommand, type CommandContext, type CommandHandler } from './lib/command-wrapper.js';
export { createFormatter, detectFormat, type OutputFormat, type FormatterOptions } from './lib/formatter.js';
