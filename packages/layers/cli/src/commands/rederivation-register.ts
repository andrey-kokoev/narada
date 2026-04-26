import { Option, type Command } from 'commander';
import { deriveWorkCommand } from './derive-work.js';
import { previewWorkCommand } from './preview-work.js';
import { confirmReplayCommand } from './confirm-replay.js';
import { recoverCommand } from './recover.js';
import { wrapCommand } from '../lib/command-wrapper.js';

type CliFormat = 'json' | 'human' | 'auto';

function outputFormat(): CliFormat {
  return process.env.OUTPUT_FORMAT as CliFormat;
}

function splitCsv(input: unknown): string[] | undefined {
  return input ? String(input).split(',') : undefined;
}

export function registerRederivationCommands(program: Command): void {
  program
    .command('derive-work')
    .description('Derive work from stored facts without requiring a fresh inbound event')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-o, --operation <id>', 'Operation ID')
    .addOption(new Option('-s, --scope <id>', 'Deprecated alias').hideHelp())
    .option('--context-id <id>', 'Derive work for a specific context (conversation/thread)')
    .option('--since <timestamp>', 'Only consider facts created at or after this ISO timestamp')
    .option('--fact-ids <ids>', 'Comma-separated list of specific fact IDs to replay')
    .action(wrapCommand('derive-work', (opts, ctx) =>
      deriveWorkCommand({
        ...opts,
        format: outputFormat(),
        contextId: opts.contextId as string | undefined,
        since: opts.since as string | undefined,
        factIds: splitCsv(opts.factIds),
      }, ctx)));

  program
    .command('preview-work')
    .description('Preview what a charter would propose for stored facts without opening work or creating intents')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-o, --operation <id>', 'Operation ID')
    .addOption(new Option('-s, --scope <id>', 'Deprecated alias').hideHelp())
    .option('--context-id <id>', 'Preview work for a specific context (conversation/thread)')
    .option('--since <timestamp>', 'Only consider facts created at or after this ISO timestamp')
    .option('--fact-ids <ids>', 'Comma-separated list of specific fact IDs to preview')
    .option('--mock', 'Use a mock charter runner instead of a real one', false)
    .action(wrapCommand('preview-work', (opts, ctx) =>
      previewWorkCommand({
        ...opts,
        format: outputFormat(),
        contextId: opts.contextId as string | undefined,
        since: opts.since as string | undefined,
        factIds: splitCsv(opts.factIds),
        mock: opts.mock as boolean | undefined,
      }, ctx)));

  program
    .command('confirm-replay')
    .description('Replay confirmation for unconfirmed or ambiguous executions without re-performing effects')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-o, --operation <id>', 'Operation ID')
    .addOption(new Option('-s, --scope <id>', 'Deprecated alias').hideHelp())
    .option('--intent-ids <ids>', 'Comma-separated intent IDs to replay')
    .option('--outbound-ids <ids>', 'Comma-separated outbound IDs to replay (mail family)')
    .option('--limit <n>', 'Maximum items to process', '50')
    .action(wrapCommand('confirm-replay', (opts, ctx) =>
      confirmReplayCommand({
        ...opts,
        format: outputFormat(),
        intentIds: splitCsv(opts.intentIds),
        outboundIds: splitCsv(opts.outboundIds),
        limit: opts.limit ? Number(opts.limit) : undefined,
      }, ctx)));

  program
    .command('recover')
    .description('Recover control-plane state from stored facts after coordinator loss')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-o, --operation <id>', 'Operation ID')
    .addOption(new Option('-s, --scope <id>', 'Deprecated alias').hideHelp())
    .option('--context-id <id>', 'Recover a specific context')
    .option('--since <timestamp>', 'Only consider facts created at or after this ISO timestamp')
    .option('--fact-ids <ids>', 'Comma-separated list of specific fact IDs')
    .option('--dry-run', 'Preview what would be recovered without making changes', false)
    .action(wrapCommand('recover', (opts, ctx) =>
      recoverCommand({
        ...opts,
        format: outputFormat(),
        contextId: opts.contextId as string | undefined,
        since: opts.since as string | undefined,
        factIds: splitCsv(opts.factIds),
        dryRun: opts.dryRun as boolean | undefined,
      }, ctx)));
}
