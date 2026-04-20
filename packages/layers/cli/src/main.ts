#!/usr/bin/env node
import { Command } from 'commander';
import { syncCommand } from './commands/sync.js';
import { integrityCommand } from './commands/integrity.js';
import { rebuildViewsCommand } from './commands/rebuild-views.js';
import { rebuildProjectionsCommand } from './commands/rebuild-projections.js';
import { configCommand } from './commands/config.js';
import { configInteractiveCommand } from './commands/config-interactive.js';
import { statusCommand } from './commands/status.js';
import { backupCommand } from './commands/backup.js';
import { restoreCommand } from './commands/restore.js';
import { verifyBackupCommand } from './commands/verify-backup.js';
import { listBackupCommand } from './commands/backup-ls.js';
import { cleanupCommand } from './commands/cleanup.js';
import { demoCommand } from './commands/demo.js';
import { uscInitCommand } from './commands/usc-init.js';
import { deriveWorkCommand } from './commands/derive-work.js';
import { previewWorkCommand } from './commands/preview-work.js';
import { confirmReplayCommand } from './commands/confirm-replay.js';
import { selectCommand } from './commands/select.js';
import { recoverCommand } from './commands/recover.js';
import { showCommand } from './commands/show.js';
import { wrapCommand } from './lib/command-wrapper.js';
import {
  wantMailbox,
  wantWorkflow,
  wantPosture,
  setup,
  preflight,
  renderTargetPreflight,
  inspect,
  explain,
  activate,
  initRepo,
} from '@narada2/ops-kit';
import type { PosturePreset } from '@narada2/ops-kit';

const program = new Command();

program
  .name('narada')
  .description('Narada CLI — deterministic state compiler and operation control')
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

// ── Runtime commands ──

program
  .command('sync')
  .description('Run a single synchronization cycle')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('--dry-run', 'Show what would be done without making changes', false)
  .option('-m, --mailbox <id>', 'Sync only a specific mailbox (multi-mailbox config)')
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
  .description('Rebuild all derived views (deprecated: use rebuild-projections)')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(wrapCommand('rebuild-views', (opts, ctx) =>
    rebuildViewsCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

program
  .command('rebuild-projections')
  .description('Rebuild all derived projections (views, search index, and other non-authoritative surfaces)')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-m, --mailbox <id>', 'Rebuild only a specific mailbox (multi-mailbox config)')
  .action(wrapCommand('rebuild-projections', (opts, ctx) =>
    rebuildProjectionsCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

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
      console.error(`init usc failed: ${err.message}`);
      process.exit(1);
    }
  });

initCmd.action(wrapCommand('init', (opts, ctx) => {
  const format = process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto';
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
    demoCommand({ count: Number(opts.count), format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

program
  .command('status')
  .description('Show sync status and health')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(wrapCommand('status', (opts, ctx) =>
    statusCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

program
  .command('show')
  .description('Show deep-dive details for evaluation, decision, or execution')
  .argument('<type>', 'Type of entity to show: evaluation, decision, or execution')
  .argument('<id>', 'Entity ID')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-s, --scope <id>', 'Scope ID (mailbox ID) to inspect')
  .action(wrapCommand('show', (opts, ctx) =>
    showCommand({
      ...opts,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      type: opts.type as 'evaluation' | 'decision' | 'execution',
      id: opts.id as string,
    }, ctx)));

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

program
  .command('derive-work')
  .description('Derive work from stored facts without requiring a fresh inbound event')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-s, --scope <id>', 'Scope ID (mailbox ID) to derive work for')
  .option('--context-id <id>', 'Derive work for a specific context (conversation/thread)')
  .option('--since <timestamp>', 'Only consider facts created at or after this ISO timestamp')
  .option('--fact-ids <ids>', 'Comma-separated list of specific fact IDs to replay')
  .action(wrapCommand('derive-work', (opts, ctx) =>
    deriveWorkCommand({
      ...opts,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      contextId: opts.contextId as string | undefined,
      since: opts.since as string | undefined,
      factIds: opts.factIds ? String(opts.factIds).split(',') : undefined,
    }, ctx)));

program
  .command('preview-work')
  .description('Preview what a charter would propose for stored facts without opening work or creating intents')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-s, --scope <id>', 'Scope ID (mailbox ID) to preview work for')
  .option('--context-id <id>', 'Preview work for a specific context (conversation/thread)')
  .option('--since <timestamp>', 'Only consider facts created at or after this ISO timestamp')
  .option('--fact-ids <ids>', 'Comma-separated list of specific fact IDs to preview')
  .option('--mock', 'Use a mock charter runner instead of a real one', false)
  .action(wrapCommand('preview-work', (opts, ctx) =>
    previewWorkCommand({
      ...opts,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      contextId: opts.contextId as string | undefined,
      since: opts.since as string | undefined,
      factIds: opts.factIds ? String(opts.factIds).split(',') : undefined,
      mock: opts.mock as boolean | undefined,
    }, ctx)));

program
  .command('confirm-replay')
  .description('Replay confirmation for unconfirmed or ambiguous executions without re-performing effects')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-s, --scope <id>', 'Scope ID to bound replay (mail family only)')
  .option('--intent-ids <ids>', 'Comma-separated intent IDs to replay')
  .option('--outbound-ids <ids>', 'Comma-separated outbound IDs to replay (mail family)')
  .option('--limit <n>', 'Maximum items to process', '50')
  .action(wrapCommand('confirm-replay', (opts, ctx) =>
    confirmReplayCommand({
      ...opts,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      intentIds: opts.intentIds ? String(opts.intentIds).split(',') : undefined,
      outboundIds: opts.outboundIds ? String(opts.outboundIds).split(',') : undefined,
      limit: opts.limit ? Number(opts.limit) : undefined,
    }, ctx)));

program
  .command('recover')
  .description('Recover control-plane state from stored facts after coordinator loss')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-s, --scope <id>', 'Scope ID to recover')
  .option('--context-id <id>', 'Recover a specific context')
  .option('--since <timestamp>', 'Only consider facts created at or after this ISO timestamp')
  .option('--fact-ids <ids>', 'Comma-separated list of specific fact IDs')
  .option('--dry-run', 'Preview what would be recovered without making changes', false)
  .action(wrapCommand('recover', (opts, ctx) =>
    recoverCommand({
      ...opts,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      contextId: opts.contextId as string | undefined,
      since: opts.since as string | undefined,
      factIds: opts.factIds ? String(opts.factIds).split(',') : undefined,
      dryRun: opts.dryRun as boolean | undefined,
    }, ctx)));

program
  .command('select')
  .description('Select facts from the fact store for a scope')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-s, --scope <id>', 'Scope ID to select facts from')
  .option('--context-id <id>', 'Filter by a specific context (conversation/thread)')
  .option('--since <timestamp>', 'Only include facts created at or after this ISO timestamp')
  .option('--until <timestamp>', 'Only include facts created at or before this ISO timestamp')
  .option('--fact-ids <ids>', 'Comma-separated list of specific fact IDs')
  .option('--limit <n>', 'Maximum number of facts to return', '100')
  .option('--offset <n>', 'Pagination offset', '0')
  .action(wrapCommand('select', (opts, ctx) =>
    selectCommand({
      ...opts,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      scope: opts.scope as string | undefined,
      contextId: opts.contextId as string | undefined,
      since: opts.since as string | undefined,
      until: opts.until as string | undefined,
      factIds: opts.factIds ? String(opts.factIds).split(',') : undefined,
      limit: opts.limit ? Number(opts.limit) : undefined,
      offset: opts.offset ? Number(opts.offset) : undefined,
    }, ctx)));

// ── Operation shaping commands (from ops-kit) ──

program
  .command('init-repo')
  .argument('<path>')
  .option('-n, --name <name>', 'Package name for the generated repo')
  .option('--local-source', 'Link to local monorepo packages instead of npm versions')
  .option('--demo', 'Create a demo repo with a pre-configured mock-backed operation (no credentials needed)', false)
  .description('Bootstrap a private Narada operations repo')
  .action((repoPath, opts) => {
    const result = initRepo(repoPath, { name: opts.name, localSource: opts.localSource, demo: opts.demo });
    console.log(result.summary);
    console.log('\nCreated:');
    for (const f of result.createdFiles) console.log(`  ${f}`);
    console.log('\nGold path — run these next:');
    for (const step of result.nextSteps) console.log(`  ${step}`);
    console.log('\nSee README.md in the repo for the full first-run guide.');
  });

program
  .command('want-mailbox')
  .argument('<mailbox-id>')
  .option('-c, --config <path>')
  .option('--primary-charter <charter>')
  .option('--secondary-charters <charters>')
  .option('--posture <preset>')
  .description('Declare a mailbox operation')
  .action((mailboxId, opts) => {
    const result = wantMailbox(mailboxId, {
      configPath: opts.config,
      primaryCharter: opts.primaryCharter,
      secondaryCharters: opts.secondaryCharters ? String(opts.secondaryCharters).split(',') : undefined,
      posture: opts.posture,
    });
    console.log(result.summary);
  });

program
  .command('want-workflow')
  .argument('<workflow-id>')
  .requiredOption('--schedule <schedule>')
  .option('-c, --config <path>')
  .option('--primary-charter <charter>')
  .option('--posture <preset>')
  .description('Declare a timer workflow operation')
  .action((workflowId, opts) => {
    const result = wantWorkflow(workflowId, {
      configPath: opts.config,
      primaryCharter: opts.primaryCharter,
      schedule: opts.schedule,
      posture: opts.posture,
    });
    console.log(result.summary);
  });

program
  .command('want-posture')
  .argument('<target>')
  .argument('<preset>')
  .option('-c, --config <path>')
  .description('Apply a safety posture to an operation')
  .action((target, preset, opts) => {
    const result = wantPosture(target, preset as PosturePreset, { configPath: opts.config });
    console.log(`${result.target}: ${result.preset} applied`);
    console.log(result.description);
  });

program
  .command('setup')
  .argument('[target]')
  .option('-c, --config <path>')
  .description('Scaffold directories for configured operations')
  .action((target, opts) => {
    const result = setup({ target, configPath: opts.config });
    console.log(result.summary);
  });

program
  .command('preflight')
  .argument('<operation>')
  .option('-c, --config <path>')
  .description('Verify operation readiness')
  .action((scopeId, opts) => {
    console.log(renderTargetPreflight(scopeId, { configPath: opts.config }));
  });

program
  .command('inspect')
  .argument('<operation>')
  .option('-c, --config <path>')
  .description('Show operation configuration')
  .action((scopeId, opts) => {
    console.log(inspect(scopeId, { configPath: opts.config }).summary);
  });

program
  .command('explain')
  .argument('<operation>')
  .option('-c, --config <path>')
  .description('Explain what an operation will do')
  .action((scopeId, opts) => {
    const result = explain(scopeId, { configPath: opts.config });
    console.log(`Target: ${result.target}`);
    console.log(`Why no action: ${result.whyNoAction}`);
    if (result.operationalConsequences.length) {
      console.log('Operational consequences:');
      for (const line of result.operationalConsequences) console.log(`- ${line}`);
    }
    if (result.blockers.length) {
      console.log('Blockers:');
      for (const line of result.blockers) console.log(`- ${line}`);
    }
  });

program
  .command('activate')
  .argument('<operation>')
  .option('-c, --config <path>')
  .description('Mark an operation as live')
  .action((scopeId, opts) => {
    const result = activate(scopeId, { configPath: opts.config });
    if (!result.activated) {
      console.error(result.reason ?? 'Activation failed');
      process.exitCode = 1;
      return;
    }
    console.log(`${scopeId} is now activated.`);
    console.log('Activation marks this operation as live. It does not start the daemon or send mail.');
    console.log(`When the daemon runs, Narada will process operation ${scopeId} according to its configured policy.`);
    console.log(`Activated at: ${result.activatedAt}`);
  });

program.parse();
