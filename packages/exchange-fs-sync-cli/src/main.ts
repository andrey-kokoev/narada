#!/usr/bin/env node
import { Command } from 'commander';
import { syncCommand } from './commands/sync.js';
import { integrityCommand } from './commands/integrity.js';
import { rebuildViewsCommand } from './commands/rebuild-views.js';
import { configCommand } from './commands/config.js';
import { wrapCommand } from './lib/command-wrapper.js';

const program = new Command();

program
  .name('exchange-sync')
  .description('Exchange filesystem synchronization CLI')
  .version('1.0.0');

// Common options for all commands
const addCommonOptions = (cmd: Command): Command => {
  return cmd
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('--format <format>', 'Output format: human, json, or auto', 'auto');
};

addCommonOptions(
  program
    .command('sync')
    .description('Run a single synchronization cycle')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('--dry-run', 'Show what would be done without making changes', false)
).action(wrapCommand('sync', syncCommand));

addCommonOptions(
  program
    .command('integrity')
    .description('Check data integrity')
    .option('-c, --config <path>', 'Path to config file', './config.json')
).action(wrapCommand('integrity', integrityCommand));

addCommonOptions(
  program
    .command('rebuild-views')
    .description('Rebuild all derived views')
    .option('-c, --config <path>', 'Path to config file', './config.json')
).action(wrapCommand('rebuild-views', rebuildViewsCommand));

addCommonOptions(
  program
    .command('init')
    .description('Create a new configuration file')
    .option('-o, --output <path>', 'Output path for config file', './config.json')
    .option('--force', 'Overwrite existing file', false)
).action(wrapCommand('init', configCommand));

program.parse();
