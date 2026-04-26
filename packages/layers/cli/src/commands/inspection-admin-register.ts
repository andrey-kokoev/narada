import { Option, type Command } from 'commander';
import { statusCommand } from './status.js';
import { showCommand } from './show.js';
import { auditCommand } from './audit.js';
import { doctorCommand } from './doctor.js';
import { selectCommand } from './select.js';
import { wrapCommand } from '../lib/command-wrapper.js';

function outputFormat(): 'json' | 'human' | 'auto' {
  return process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto';
}

export function registerInspectionAdminCommands(program: Command): void {
  program
    .command('status')
    .description('Show sync status and health')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('--site <id>', 'Query a Site by site ID instead of reading config')
    .option('--mode <mode>', 'Site mode: system or user (Linux Sites)')
    .action(wrapCommand('status', (opts, ctx) =>
      statusCommand({ ...opts, format: outputFormat() }, ctx)));

  program
    .command('show')
    .description('Show deep-dive details for evaluation, decision, or execution')
    .argument('<type>', 'Type of entity to show: evaluation, decision, or execution')
    .argument('<id>', 'Entity ID')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-o, --operation <id>', 'Operation ID')
    .addOption(new Option('-s, --scope <id>', 'Deprecated alias').hideHelp())
    .action(wrapCommand('show', (opts, ctx) =>
      showCommand({
        ...opts,
        format: outputFormat(),
        type: opts.type as 'evaluation' | 'decision' | 'execution',
        id: opts.id as string,
      }, ctx)));

  program
    .command('doctor')
    .description('Check daemon health, sync freshness, and work queue state')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('--stale-threshold-minutes <n>', 'Sync staleness threshold in minutes', '60')
    .option('--site <id>', 'Diagnose a Site by site ID instead of reading config')
    .option('--mode <mode>', 'Site mode: system or user (Linux Sites)')
    .action(wrapCommand('doctor', (opts, ctx) =>
      doctorCommand({
        ...opts,
        format: outputFormat(),
        staleThresholdMinutes: opts.staleThresholdMinutes ? Number(opts.staleThresholdMinutes) : undefined,
      }, ctx)));

  program
    .command('audit [operation-id]')
    .description('Show operator action audit log for an operation')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('--context-id <id>', 'Filter by context ID')
    .option('--limit <n>', 'Maximum number of actions to return', '50')
    .option('--since <timestamp>', 'Only include actions at or after this ISO timestamp')
    .action(wrapCommand('audit', (opts, ctx) =>
      auditCommand({
        ...opts,
        format: outputFormat(),
        scope: (opts.operationId || opts.scopeId) as string | undefined,
        contextId: opts.contextId as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        since: opts.since as string | undefined,
      }, ctx)));

  program
    .command('select')
    .description('Select facts from the fact store for an operation')
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-o, --operation <id>', 'Operation ID')
    .addOption(new Option('-s, --scope <id>', 'Deprecated alias').hideHelp())
    .option('--context-id <id>', 'Filter by a specific context (conversation/thread)')
    .option('--since <timestamp>', 'Only include facts created at or after this ISO timestamp')
    .option('--until <timestamp>', 'Only include facts created at or before this ISO timestamp')
    .option('--fact-ids <ids>', 'Comma-separated list of specific fact IDs')
    .option('--limit <n>', 'Maximum number of facts to return', '100')
    .option('--offset <n>', 'Pagination offset', '0')
    .action(wrapCommand('select', (opts, ctx) =>
      selectCommand({
        ...opts,
        format: outputFormat(),
        scope: (opts.operation || opts.scope) as string | undefined,
        contextId: opts.contextId as string | undefined,
        since: opts.since as string | undefined,
        until: opts.until as string | undefined,
        factIds: opts.factIds ? String(opts.factIds).split(',') : undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        offset: opts.offset ? Number(opts.offset) : undefined,
      }, ctx)));
}
