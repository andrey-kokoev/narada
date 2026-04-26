import type { Command } from 'commander';
import { cleanupCommand } from './cleanup.js';
import { wrapCommand } from '../lib/command-wrapper.js';

export function registerCleanupCommands(program: Command): void {
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
      cleanupCommand({
        ...opts,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }, ctx)));
}
