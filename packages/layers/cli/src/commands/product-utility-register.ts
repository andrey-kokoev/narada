import type { Command } from 'commander';
import { configCommand } from './config.js';
import { configInteractiveCommand } from './config-interactive.js';
import { demoCommand } from './demo.js';
import { opsCommand } from './ops.js';
import { uscInitCommand } from './usc-init.js';
import { uscValidateCommand } from './usc-validate.js';
import { wrapCommand } from '../lib/command-wrapper.js';
import { emitFiniteCommandFailure, emitFiniteCommandResult } from '../lib/cli-output.js';

function outputFormat(): 'json' | 'human' | 'auto' {
  return process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto';
}

export function registerProductUtilityCommands(program: Command): void {
  const initCmd = program
    .command('init')
    .description('Create a new configuration file or USC repo')
    .option('-o, --output <path>', 'Output path for config file', './config.json')
    .option('-f, --force', 'Overwrite existing file', false)
    .option('-i, --interactive', 'Interactive mode with prompts', false);

  initCmd
    .command('usc <path>')
    .description('Initialize a USC-governed construction repo')
    .option('--name <name>', 'App/repo name (defaults to directory name)')
    .option('--intent <text>', 'Initial intent statement')
    .option('--domain <domain>', 'Domain hint for intent refinement')
    .option('--cis', 'Include CIS admissibility policy', false)
    .option('--principal <name>', 'Principal name', 'TBD')
    .option('--force', 'Overwrite existing files', false)
    .action(async (targetPath: string, opts: Record<string, unknown>) => {
      try {
        await uscInitCommand({
          path: targetPath,
          name: opts.name as string | undefined,
          intent: opts.intent as string | undefined,
          domain: opts.domain as string | undefined,
          cis: opts.cis as boolean | undefined,
          principal: opts.principal as string | undefined,
          force: opts.force as boolean | undefined,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        emitFiniteCommandFailure(`init usc failed: ${err.message}`);
      }
    });

  initCmd
    .command('usc-validate <path>')
    .description('Validate a USC repo using USC packages or cached schemas as fallback')
    .action(async (targetPath: string) => {
      const result = await uscValidateCommand({ path: targetPath });
      emitFiniteCommandResult(result, { format: 'json' });
    });

  initCmd.action(wrapCommand('init', (opts, ctx) => {
    const format = outputFormat();
    if (opts.interactive) {
      return configInteractiveCommand({ ...opts, format }, ctx);
    }
    return configCommand({ ...opts, format }, ctx);
  }));

  program
    .command('demo')
    .description('Run a zero-setup demo with synthetic mailbox data')
    .option('-n, --count <n>', 'Number of messages to generate', '5')
    .action(wrapCommand('demo', (opts, ctx) =>
      demoCommand({ count: Number(opts.count), format: outputFormat() }, ctx)));

  program
    .command('ops')
    .description('Operator daily dashboard - health, activity, attention queue, drafts pending review')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-l, --limit <n>', 'Number of recent items per category', '5')
    .option('--site <id>', 'Show only the specified Site')
    .option('--mode <mode>', 'Site mode: system or user (Linux Sites)')
    .action(wrapCommand('ops', (opts, ctx) =>
      opsCommand({ ...opts, limit: Number(opts.limit), format: outputFormat() }, ctx)));
}
