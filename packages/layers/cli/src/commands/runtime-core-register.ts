import type { Command } from 'commander';
import { syncCommand } from './sync.js';
import { cycleCommand } from './cycle.js';
import { integrityCommand } from './integrity.js';
import { rebuildViewsCommand } from './rebuild-views.js';
import { rebuildProjectionsCommand } from './rebuild-projections.js';
import { wrapCommand } from '../lib/command-wrapper.js';
import { resolveCommandFormat } from '../lib/cli-output.js';

function outputFormat(): 'json' | 'human' | 'auto' {
  return process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto';
}

export function registerRuntimeCoreCommands(program: Command): void {
  program
    .command('sync')
    .description('Run a single synchronization cycle')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('--dry-run', 'Show what would be done without making changes', false)
    .option('-m, --mailbox <id>', 'Operation ID (mailbox ID for mail operations) to sync')
    .action(wrapCommand('sync', (opts, ctx) =>
      syncCommand({ ...opts, format: outputFormat() }, ctx)));

  program
    .command('cycle')
    .description('Run a single Cycle for a Site')
    .option('--site <id>', 'Site ID to run cycle for')
    .option('--mode <mode>', 'Site mode: system or user (Linux Sites)')
    .option('--site-root <path>', 'Override Site root directory')
    .option('--ceiling-ms <ms>', 'Maximum cycle duration in milliseconds', '30000')
    .option('--lock-ttl-ms <ms>', 'Lock TTL in milliseconds', '35000')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(wrapCommand('cycle', (opts, ctx) =>
      cycleCommand({
        ...opts,
        ceilingMs: opts.ceilingMs ? parseInt(opts.ceilingMs, 10) : undefined,
        lockTtlMs: opts.lockTtlMs ? parseInt(opts.lockTtlMs, 10) : undefined,
        format: resolveCommandFormat(),
      }, ctx)));

  program
    .command('integrity')
    .description('Check data integrity')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(wrapCommand('integrity', (opts, ctx) =>
      integrityCommand({ ...opts, format: outputFormat() }, ctx)));

  program
    .command('rebuild-views')
    .description('Rebuild all derived views (deprecated: use rebuild-projections)')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(wrapCommand('rebuild-views', (opts, ctx) =>
      rebuildViewsCommand({ ...opts, format: outputFormat() }, ctx)));

  program
    .command('rebuild-projections')
    .description('Rebuild all derived projections (views, search index, and other non-authoritative surfaces)')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-m, --mailbox <id>', 'Operation ID (mailbox ID for mail operations) to rebuild')
    .action(wrapCommand('rebuild-projections', (opts, ctx) =>
      rebuildProjectionsCommand({ ...opts, format: outputFormat() }, ctx)));
}
