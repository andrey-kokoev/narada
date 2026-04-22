#!/usr/bin/env node
import { Command, Option } from 'commander';
import { loadEnvFile } from '@narada2/control-plane';

loadEnvFile('./.env');
import { syncCommand } from './commands/sync.js';
import { cycleCommand } from './commands/cycle.js';
import { integrityCommand } from './commands/integrity.js';
import { rebuildViewsCommand } from './commands/rebuild-views.js';
import { rebuildProjectionsCommand } from './commands/rebuild-projections.js';
import { configCommand } from './commands/config.js';
import { configInteractiveCommand } from './commands/config-interactive.js';
import { statusCommand } from './commands/status.js';
import { opsCommand } from './commands/ops.js';
import {
  sitesListCommand,
  sitesDiscoverCommand,
  sitesShowCommand,
  sitesRemoveCommand,
  sitesInitCommand,
  sitesEnableCommand,
} from './commands/sites.js';
import {
  consoleStatusCommand,
  consoleAttentionCommand,
  consoleControlCommand,
} from './commands/console.js';
import { backupCommand } from './commands/backup.js';
import { restoreCommand } from './commands/restore.js';
import { verifyBackupCommand } from './commands/verify-backup.js';
import { listBackupCommand } from './commands/backup-ls.js';
import { cleanupCommand } from './commands/cleanup.js';
import { demoCommand } from './commands/demo.js';
import { uscInitCommand } from './commands/usc-init.js';
import { uscValidateCommand } from './commands/usc-validate.js';
import { deriveWorkCommand } from './commands/derive-work.js';
import { previewWorkCommand } from './commands/preview-work.js';
import { confirmReplayCommand } from './commands/confirm-replay.js';
import { selectCommand } from './commands/select.js';
import { recoverCommand } from './commands/recover.js';
import { showCommand } from './commands/show.js';
import { auditCommand } from './commands/audit.js';
import { doctorCommand } from './commands/doctor.js';
import {
  principalStatusCommand,
  principalListCommand,
  principalAttachCommand,
  principalDetachCommand,
} from './commands/principal.js';
import { principalSyncFromTasksCommand } from './commands/principal-sync-from-tasks.js';
import { rejectDraftCommand } from './commands/reject-draft.js';
import { markReviewedCommand } from './commands/mark-reviewed.js';
import { handledExternallyCommand } from './commands/handled-externally.js';
import { showDraftCommand } from './commands/show-draft.js';
import { draftsCommand } from './commands/drafts.js';
import { approveDraftForSendCommand } from './commands/approve-draft-for-send.js';
import { retryAuthFailedCommand } from './commands/retry-auth-failed.js';
import { acknowledgeAlertCommand } from './commands/acknowledge-alert.js';
import { taskClaimCommand } from './commands/task-claim.js';
import { taskReleaseCommand } from './commands/task-release.js';
import { taskReviewCommand } from './commands/task-review.js';
import { taskReportCommand } from './commands/task-report.js';
import { taskRecommendCommand } from './commands/task-recommend.js';
import { taskAllocateCommand } from './commands/task-allocate.js';
import { taskDeriveFromFindingCommand } from './commands/task-derive-from-finding.js';
import { taskPromoteRecommendationCommand } from './commands/task-promote-recommendation.js';
import { taskLintCommand } from './commands/task-lint.js';
import { taskCloseCommand } from './commands/task-close.js';
import { chapterCloseCommand } from './commands/chapter-close.js';
import { chapterInitCommand } from './commands/chapter-init.js';
import { chapterStatusCommand } from './commands/chapter-status.js';
import {
  constructionLoopPlanCommand,
  constructionLoopPolicyShowCommand,
  constructionLoopPolicyInitCommand,
  constructionLoopPolicyValidateCommand,
  constructionLoopRunCommand,
  constructionLoopPauseCommand,
  constructionLoopResumeCommand,
  constructionLoopMetricsCommand,
} from './commands/construction-loop.js';
import { taskListCommand } from './commands/task-list.js';
import { taskGraphCommand } from './commands/task-graph.js';
import { taskEvidenceCommand } from './commands/task-evidence.js';
import {
  taskRosterShowCommand,
  taskRosterAssignCommand,
  taskRosterReviewCommand,
  taskRosterDoneCommand,
  taskRosterIdleCommand,
} from './commands/task-roster.js';
import { verifyStatusCommand } from './commands/verify-status.js';
import { verifySuggestCommand } from './commands/verify-suggest.js';
import { verifyExplainCommand } from './commands/verify-explain.js';
import { verifyRunCommand } from './commands/verify-run.js';
import { wrapCommand, type CommandContext } from './lib/command-wrapper.js';
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
  .option('-m, --mailbox <id>', 'Operation ID (mailbox ID for mail operations) to sync')
  .action(wrapCommand('sync', (opts, ctx) =>
    syncCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

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
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    }, ctx)));

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
  .option('-m, --mailbox <id>', 'Operation ID (mailbox ID for mail operations) to rebuild')
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

initCmd
  .command('usc-validate <path>')
  .description('Validate a USC repo using USC packages or cached schemas as fallback')
  .action(async (targetPath: string) => {
    const result = await uscValidateCommand({ path: targetPath });
    if (result.exitCode !== 0) {
      console.error(JSON.stringify(result.result, null, 2));
      process.exit(result.exitCode);
    }
    console.log(JSON.stringify(result.result, null, 2));
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
  .command('ops')
  .description('Operator daily dashboard — health, activity, attention queue, drafts pending review')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-l, --limit <n>', 'Number of recent items per category', '5')
  .option('--site <id>', 'Show only the specified Site')
  .option('--mode <mode>', 'Site mode: system or user (Linux Sites)')
  .action(wrapCommand('ops', (opts, ctx) =>
    opsCommand({ ...opts, limit: Number(opts.limit), format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

// ── Site registry commands ──

const sitesCmd = program
  .command('sites')
  .description('Discover and manage Narada Sites');

sitesCmd
  .command('list')
  .description('List discovered Sites with health status')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(wrapCommand('sites-list', (opts, ctx) =>
    sitesListCommand({ format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto', verbose: opts.verbose }, ctx)));

sitesCmd
  .command('discover')
  .description('Scan filesystem and refresh registry')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(wrapCommand('sites-discover', (opts, ctx) =>
    sitesDiscoverCommand({ format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto', verbose: opts.verbose }, ctx)));

sitesCmd
  .command('show <site-id>')
  .description('Show Site metadata and last-known health')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (siteId: string, opts: Record<string, unknown>) => {
    const result = await sitesShowCommand(siteId, {
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      verbose: opts.verbose as boolean | undefined,
    }, { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

sitesCmd
  .command('remove <site-id>')
  .description('Remove a Site from the registry (does NOT delete Site files)')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (siteId: string, opts: Record<string, unknown>) => {
    const result = await sitesRemoveCommand(siteId, {
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      verbose: opts.verbose as boolean | undefined,
    }, { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

sitesCmd
  .command('init <site-id>')
  .description('Initialize a new Narada Site')
  .requiredOption('--substrate <name>', 'Substrate: windows-native, windows-wsl, macos, linux-user, linux-system')
  .option('--operation <id>', 'Operation ID to bind')
  .option('--root <path>', 'Override Site root directory')
  .option('--dry-run', 'Preview without making changes', false)
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (siteId: string, opts: Record<string, unknown>) => {
    const result = await sitesInitCommand(siteId, {
      substrate: opts.substrate as string,
      operation: opts.operation as string | undefined,
      root: opts.root as string | undefined,
      dryRun: opts.dryRun as boolean | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      verbose: opts.verbose as boolean | undefined,
    }, { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

sitesCmd
  .command('enable <site-id>')
  .description('Enable unattended supervisor for a Site')
  .option('--interval-minutes <n>', 'Cycle interval in minutes', '5')
  .option('--dry-run', 'Preview without making changes', false)
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (siteId: string, opts: Record<string, unknown>) => {
    const result = await sitesEnableCommand(siteId, {
      intervalMinutes: opts.intervalMinutes ? Number(opts.intervalMinutes) : undefined,
      dryRun: opts.dryRun as boolean | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      verbose: opts.verbose as boolean | undefined,
    }, { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

// ── Console commands ──

const consoleCmd = program
  .command('console')
  .description('Operator console for cross-Site health and control');

consoleCmd
  .command('status')
  .description('Show cross-Site health summary')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(wrapCommand('console-status', (opts, ctx) =>
    consoleStatusCommand({ format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto', verbose: opts.verbose }, ctx)));

consoleCmd
  .command('attention')
  .description('Show attention queue across all Sites')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(wrapCommand('console-attention', (opts, ctx) =>
    consoleAttentionCommand({ format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto', verbose: opts.verbose }, ctx)));

consoleCmd
  .command('approve <site-id> <outbound-id>')
  .description('Approve an outbound command')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .action(async (siteId: string, outboundId: string, opts: Record<string, unknown>) => {
    const result = await consoleControlCommand('approve', siteId, outboundId, {
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      verbose: opts.verbose as boolean | undefined,
    }, { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

consoleCmd
  .command('reject <site-id> <outbound-id>')
  .description('Reject an outbound command')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .action(async (siteId: string, outboundId: string, opts: Record<string, unknown>) => {
    const result = await consoleControlCommand('reject', siteId, outboundId, {
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      verbose: opts.verbose as boolean | undefined,
    }, { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

consoleCmd
  .command('retry <site-id> <work-item-id>')
  .description('Retry a work item')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .action(async (siteId: string, workItemId: string, opts: Record<string, unknown>) => {
    const result = await consoleControlCommand('retry', siteId, workItemId, {
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      verbose: opts.verbose as boolean | undefined,
    }, { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

program
  .command('status')
  .description('Show sync status and health')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('--site <id>', 'Query a Site by site ID instead of reading config')
  .option('--mode <mode>', 'Site mode: system or user (Linux Sites)')
  .action(wrapCommand('status', (opts, ctx) =>
    statusCommand({ ...opts, format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto' }, ctx)));

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
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      type: opts.type as 'evaluation' | 'decision' | 'execution',
      id: opts.id as string,
    }, ctx)));

// ── Principal runtime commands (Task 406) ──

const principalCmd = program
  .command('principal')
  .description('Manage principal runtime state');

principalCmd
  .command('status')
  .description('Show principal runtime state for all scopes')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (opts: Record<string, unknown>) => {
    const result = await principalStatusCommand(
      {
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        verbose: opts.verbose as boolean | undefined,
        config: opts.config as string | undefined,
      },
      { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] },
    );
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

principalCmd
  .command('list')
  .description('List principal runtimes')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--scope <id>', 'Filter by scope ID')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (opts: Record<string, unknown>) => {
    const result = await principalListCommand(
      {
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        verbose: opts.verbose as boolean | undefined,
        config: opts.config as string | undefined,
        scope: opts.scope as string | undefined,
      },
      { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] },
    );
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

principalCmd
  .command('attach <scope-id>')
  .description('Attach a principal to a scope')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--principal <id>', 'Principal identity ID (generated if omitted)')
  .option('--runtime <id>', 'Runtime instance ID (generated if omitted)')
  .option('--type <type>', 'Principal type: operator, agent, worker, external', 'operator')
  .option('--mode <mode>', 'Attachment mode: observe or interact', 'interact')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (scopeId: string, opts: Record<string, unknown>) => {
    const result = await principalAttachCommand(
      {
        scope: scopeId,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        verbose: opts.verbose as boolean | undefined,
        config: opts.config as string | undefined,
        principal: opts.principal as string | undefined,
        runtime: opts.runtime as string | undefined,
        type: opts.type as string | undefined,
        mode: opts.mode as string | undefined,
      },
      { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] },
    );
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

principalCmd
  .command('detach <runtime-id>')
  .description('Detach a principal from its scope')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--reason <text>', 'Detach reason')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (runtimeId: string, opts: Record<string, unknown>) => {
    const result = await principalDetachCommand(
      {
        runtimeId,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        verbose: opts.verbose as boolean | undefined,
        config: opts.config as string | undefined,
        reason: opts.reason as string | undefined,
      },
      { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] },
    );
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

principalCmd
  .command('sync-from-tasks')
  .description('Reconcile PrincipalRuntime state from task governance artifacts')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
  .option('--dry-run', 'Show divergences without applying corrections', false)
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .action(async (opts: Record<string, unknown>) => {
    const result = await principalSyncFromTasksCommand({
      cwd: opts.cwd as string | undefined,
      principalStateDir: opts.principalStateDir as string | undefined,
      dryRun: opts.dryRun as boolean | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Sync failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

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
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
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
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      scope: (opts.operationId || opts.scopeId) as string | undefined,
      contextId: opts.contextId as string | undefined,
      limit: opts.limit ? Number(opts.limit) : undefined,
      since: opts.since as string | undefined,
    }, ctx)));

// Task governance commands
const taskCmd = program
  .command('task')
  .description('Task governance operators (claim, release, report, review, list)');

taskCmd
  .command('claim <task-number>')
  .description('Claim a task for an agent')
  .requiredOption('--agent <id>', 'Agent ID from roster')
  .option('--reason <text>', 'Claim justification')
  .option('--update-principal-runtime', 'Update PrincipalRuntime state after claim', false)
  .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    const result = await taskClaimCommand({
      taskNumber,
      agent: opts.agent as string,
      reason: opts.reason as string | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      updatePrincipalRuntime: opts.updatePrincipalRuntime as boolean | undefined,
      principalStateDir: opts.principalStateDir as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Claim failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('release <task-number>')
  .description('Release a claimed task')
  .requiredOption('--reason <reason>', 'Release reason: completed, abandoned, superseded, transferred, budget_exhausted')
  .option('--continuation <path>', 'Path to continuation packet JSON (required for budget_exhausted)')
  .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    const result = await taskReleaseCommand({
      taskNumber,
      reason: opts.reason as 'completed' | 'abandoned' | 'superseded' | 'transferred' | 'budget_exhausted',
      continuation: opts.continuation as string | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      principalStateDir: opts.principalStateDir as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Release failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('report <task-number>')
  .description('Submit a WorkResultReport for a claimed task')
  .requiredOption('--agent <id>', 'Reporting agent ID from roster')
  .requiredOption('--summary <text>', 'Human-readable result summary')
  .option('--changed-files <csv>', 'Comma-separated list of changed file paths')
  .option('--verification <json>', 'JSON array of {command, result} objects')
  .option('--residuals <json>', 'JSON array of known residual strings')
  .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    const result = await taskReportCommand({
      taskNumber,
      agent: opts.agent as string,
      summary: opts.summary as string | undefined,
      changedFiles: opts.changedFiles as string | undefined,
      verification: opts.verification as string | undefined,
      residuals: opts.residuals as string | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      principalStateDir: opts.principalStateDir as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Report failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('recommend')
  .description('Recommend task/agent assignments (advisory, read-only)')
  .option('--agent <id>', 'Restrict to a specific agent')
  .option('--task <number>', 'Recommend for a specific task only')
  .option('--limit <n>', 'Maximum recommendations to show', '10')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskRecommendCommand({
      taskNumber: opts.task as string | undefined,
      agent: opts.agent as string | undefined,
      limit: opts.limit ? Number(opts.limit) : undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Recommendation failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('review <task-number>')
  .description('Review a completed task')
  .requiredOption('--agent <id>', 'Reviewer agent ID from roster')
  .requiredOption('--verdict <verdict>', 'Review verdict: accepted, accepted_with_notes, rejected')
  .option('--findings <json>', 'JSON array of findings')
  .option('--report <id>', 'WorkResultReport ID to link to this review')
  .option('--principal-state-dir <path>', 'Directory containing PrincipalRuntime state file')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    const result = await taskReviewCommand({
      taskNumber,
      agent: opts.agent as string,
      verdict: opts.verdict as 'accepted' | 'accepted_with_notes' | 'rejected',
      findings: opts.findings as string | undefined,
      report: opts.report as string | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      principalStateDir: opts.principalStateDir as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Review failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('allocate')
  .description('Allocate the next task number atomically')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .option('--dry-run', 'Preview next number without mutating registry', false)
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskAllocateCommand({
      cwd: opts.cwd as string | undefined,
      format: opts.format as 'json' | 'human' | 'auto',
      dryRun: opts.dryRun as boolean,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Allocate failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('promote-recommendation')
  .description('Promote an advisory recommendation to a durable assignment')
  .requiredOption('--task <task-number>', 'Task number to promote')
  .requiredOption('--agent <agent-id>', 'Agent to assign')
  .requiredOption('--by <operator-id>', 'Operator requesting the promotion')
  .option('--recommendation-id <id>', 'Original recommendation ID for audit linkage')
  .option('--override-risk <reason>', 'Proceed despite stale or write-set risk')
  .option('--dry-run', 'Validate only; do not mutate', false)
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskPromoteRecommendationCommand({
      cwd: opts.cwd as string | undefined,
      format: opts.format as 'json' | 'human' | 'auto',
      taskNumber: opts.task as string | undefined,
      agent: opts.agent as string | undefined,
      by: opts.by as string | undefined,
      recommendationId: opts.recommendationId as string | undefined,
      overrideRisk: opts.overrideRisk as string | undefined,
      dryRun: opts.dryRun as boolean,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Promotion failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('derive-from-finding <finding-id>')
  .description('Derive a corrective task from a review finding')
  .requiredOption('--review <review-id>', 'Review ID containing the finding')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (findingId: string, opts: Record<string, unknown>) => {
    const result = await taskDeriveFromFindingCommand({
      findingId,
      review: opts.review as string,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Derive failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('lint')
  .description('Lint task files for structural issues (pure tool)')
  .option('--chapter <range>', 'Lint only tasks in a chapter range (e.g. 100-110)')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskLintCommand({
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      chapter: opts.chapter as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Lint found issues');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('list')
  .description('List runnable tasks sorted by continuation affinity')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskListCommand({
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'List failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('graph')
  .description('Render the task graph as Mermaid (read-only inspection)')
  .option('--format <format>', 'Output format: mermaid, json, or auto', 'auto')
  .option('--range <start-end>', 'Filter tasks to a number range (e.g. 429-454)')
  .option('--status <csv>', 'Filter by status (comma-separated)')
  .option('--include-closed', 'Include closed/confirmed tasks', false)
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskGraphCommand({
      cwd: opts.cwd as string | undefined,
      format: opts.format as 'mermaid' | 'json' | 'auto' | undefined,
      range: opts.range as string | undefined,
      status: opts.status as string | undefined,
      includeClosed: opts.includeClosed as boolean | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Graph failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

// Task roster tracking commands (Task 385)
const rosterCmd = taskCmd
  .command('roster')
  .description('Show and update agent operational roster state');

rosterCmd
  .command('show')
  .description('Show current agent roster')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskRosterShowCommand({
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Roster show failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

rosterCmd
  .command('assign <task-number>')
  .description('Mark agent as working on a task (claims the task by default)')
  .requiredOption('--agent <id>', 'Agent ID from roster')
  .option('--no-claim', 'Skip claiming the task (exceptional: only for planning)')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    const result = await taskRosterAssignCommand({
      taskNumber,
      agent: opts.agent as string,
      noClaim: opts.noClaim as boolean | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Roster assign failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

rosterCmd
  .command('review <task-number>')
  .description('Mark agent as reviewing a task')
  .requiredOption('--agent <id>', 'Agent ID from roster')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    const result = await taskRosterReviewCommand({
      taskNumber,
      agent: opts.agent as string,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Roster review failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('close <task-number>')
  .description('Close a task after validating closure gates')
  .requiredOption('--by <id>', 'Operator or agent ID performing the close')
  .option('--format <fmt>', 'Output format: json or human', 'human')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    const result = await taskCloseCommand({
      taskNumber,
      by: opts.by as string | undefined,
      cwd: opts.cwd as string | undefined,
      format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Close failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

taskCmd
  .command('evidence <task-number>')
  .description('Inspect task completion evidence (read-only)')
  .option('--format <fmt>', 'Output format: json or human', 'human')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    const result = await taskEvidenceCommand({
      taskNumber,
      cwd: opts.cwd as string | undefined,
      format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Evidence inspection failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

rosterCmd
  .command('done <task-number>')
  .description('Mark agent done with a task')
  .requiredOption('--agent <id>', 'Agent ID from roster')
  .option('--strict', 'Fail if required evidence is missing', false)
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    const result = await taskRosterDoneCommand({
      taskNumber,
      agent: opts.agent as string,
      strict: opts.strict as boolean | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Roster done failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

rosterCmd
  .command('idle')
  .description('Mark agent as idle')
  .requiredOption('--agent <id>', 'Agent ID from roster')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskRosterIdleCommand({
      agent: opts.agent as string,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Roster idle failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

// Chapter governance commands
const chapterCmd = program
  .command('chapter')
  .description('Chapter governance operators');

chapterCmd
  .command('init <slug>')
  .description('Initialize a chapter skeleton with range file and child tasks')
  .requiredOption('--title <title>', 'Chapter title')
  .requiredOption('--from <number>', 'First task number (positive integer)')
  .requiredOption('--count <n>', 'Number of child tasks (>= 1)')
  .option('--depends-on <numbers>', 'Comma-separated dependency task numbers')
  .option('--dry-run', 'Preview files without writing', false)
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (slug: string, opts: Record<string, unknown>) => {
    const result = await chapterInitCommand({
      slug,
      title: opts.title as string | undefined,
      from: opts.from ? Number(opts.from) : undefined,
      count: opts.count ? Number(opts.count) : undefined,
      dependsOn: opts.dependsOn as string | undefined,
      dryRun: opts.dryRun as boolean | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Chapter init failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

chapterCmd
  .command('status <range>')
  .description('Derive and display chapter state from task statuses in a range')
  .option('--format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (range: string, opts: Record<string, unknown>) => {
    const result = await chapterStatusCommand({
      range,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Chapter status failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

chapterCmd
  .command('close <identifier>')
  .description('Close a chapter: verify tasks, generate closure artifact, or manage closure workflow')
  .option('--dry-run', 'Preview closure without mutating state (legacy chapter-name mode)', false)
  .option('--start', 'Generate closure decision draft (range mode)', false)
  .option('--finish', 'Accept closure and transition tasks to confirmed (range mode)', false)
  .option('--reopen', 'Reopen a closing/closed chapter (range mode)', false)
  .option('--by <operator-id>', 'Operator ID for closure decision')
  .option('--reason <text>', 'Reason for reopen')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (identifier: string, opts: Record<string, unknown>) => {
    const isRange = /^\d+(?:-\d+)?$/.test(identifier);
    const result = await chapterCloseCommand({
      chapterName: isRange && !opts.start && !opts.finish && !opts.reopen ? undefined : (isRange ? undefined : identifier),
      range: isRange && (opts.start || opts.finish || opts.reopen) ? identifier : undefined,
      start: opts.start as boolean | undefined,
      finish: opts.finish as boolean | undefined,
      reopen: opts.reopen as boolean | undefined,
      by: opts.by as string | undefined,
      reason: opts.reason as string | undefined,
      dryRun: opts.dryRun as boolean | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Chapter close failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

// ── Construction loop commands ──

const constructionLoopCmd = program
  .command('construction-loop')
  .description('Construction loop controller — read-only plan composition');

constructionLoopCmd
  .command('plan')
  .description('Generate an operator plan from current task state (read-only)')
  .option('--policy <path>', 'Path to construction loop policy file')
  .option('--max-tasks <n>', 'Override max tasks per cycle for this run')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await constructionLoopPlanCommand({
      policyPath: opts.policy as string | undefined,
      maxTasks: opts.maxTasks ? parseInt(opts.maxTasks as string, 10) : undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Construction loop plan failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

const constructionLoopPolicyCmd = constructionLoopCmd
  .command('policy')
  .description('Construction loop policy operators');

constructionLoopPolicyCmd
  .command('show')
  .description('Display current construction loop policy')
  .option('--policy <path>', 'Path to policy file')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await constructionLoopPolicyShowCommand({
      policyPath: opts.policy as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Policy show failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

constructionLoopPolicyCmd
  .command('init')
  .description('Create a default construction loop policy file')
  .option('--strict', 'Create a stricter variant of the default policy', false)
  .option('--policy <path>', 'Output path for policy file')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await constructionLoopPolicyInitCommand({
      strict: opts.strict as boolean | undefined,
      policyPath: opts.policy as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Policy init failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

constructionLoopPolicyCmd
  .command('validate')
  .description('Validate an existing construction loop policy and report errors')
  .option('--policy <path>', 'Path to policy file')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await constructionLoopPolicyValidateCommand({
      policyPath: opts.policy as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Policy validation failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

constructionLoopCmd
  .command('run')
  .description('Run the construction loop with bounded auto-promotion')
  .option('--policy <path>', 'Path to construction loop policy file')
  .option('--max-tasks <n>', 'Override max tasks per cycle for this run')
  .option('--dry-run', 'Preview promotions without mutating state', false)
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await constructionLoopRunCommand({
      policyPath: opts.policy as string | undefined,
      maxTasks: opts.maxTasks ? parseInt(opts.maxTasks as string, 10) : undefined,
      dryRun: opts.dryRun as boolean | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Construction loop run failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

constructionLoopCmd
  .command('pause')
  .description('Pause the construction loop')
  .option('--reason <text>', 'Reason for pause')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await constructionLoopPauseCommand({
      reason: opts.reason as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Pause failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

constructionLoopCmd
  .command('resume')
  .description('Resume the construction loop')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await constructionLoopResumeCommand({
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Resume failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

constructionLoopCmd
  .command('metrics')
  .description('Show construction loop auto-promotion metrics')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await constructionLoopMetricsCommand({
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Metrics failed');
      process.exit(result.exitCode);
    }
    if ((opts.format as string) !== 'json' && process.env.OUTPUT_FORMAT !== 'json') {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

// Verification commands
const verifyCmd = program
  .command('verify')
  .description('Verification state, suggestion, and run operators');

verifyCmd
  .command('status')
  .description('Summarize recent verification runs and outliers')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await verifyStatusCommand(
      { cwd: opts.cwd as string | undefined, format: process.env.OUTPUT_FORMAT },
      { configPath: './config.json', verbose: false, logger: { info: () => {}, error: () => {}, debug: () => {}, result: () => {} } as any },
    );
    console.log(JSON.stringify(result.result, null, 2));
  });

verifyCmd
  .command('suggest')
  .description('Suggest the smallest verification command for changed files')
  .requiredOption('--files <paths>', 'Comma-separated changed source files')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const files = (opts.files as string | undefined)?.split(',').map((f) => f.trim()).filter(Boolean) ?? [];
    const result = await verifySuggestCommand(
      {
        files,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT,
      },
      { configPath: './config.json', verbose: false, logger: { info: () => {}, error: () => {}, debug: () => {}, result: () => {} } as any },
    );
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Suggestion failed');
      process.exit(result.exitCode);
    }
    console.log(JSON.stringify(result.result, null, 2));
  });

verifyCmd
  .command('explain')
  .description('Explain verification relevant to a task')
  .requiredOption('--task <number>', 'Task number')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await verifyExplainCommand(
      {
        taskNumber: opts.task as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT,
      },
      { configPath: './config.json', verbose: false, logger: { info: () => {}, error: () => {}, debug: () => {}, result: () => {} } as any },
    );
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Explain failed');
      process.exit(result.exitCode);
    }
    console.log(JSON.stringify(result.result, null, 2));
  });

verifyCmd
  .command('run')
  .description('Run a verification command through guarded scripts')
  .requiredOption('--cmd <command>', 'Verification command to run')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('--allow-multi-file', 'Allow multi-file focused tests', false)
  .option('--allow-package', 'Allow package-level test commands', false)
  .option('--allow-full-suite', 'Allow full-suite commands', false)
  .action(async (opts: Record<string, unknown>) => {
    const result = await verifyRunCommand(
      {
        cmd: opts.cmd as string | undefined,
        cwd: opts.cwd as string | undefined,
        allowMultiFile: opts.allowMultiFile as boolean | undefined,
        allowPackage: opts.allowPackage as boolean | undefined,
        allowFullSuite: opts.allowFullSuite as boolean | undefined,
        format: process.env.OUTPUT_FORMAT,
      },
      { configPath: './config.json', verbose: false, logger: { info: () => {}, debug: () => {}, result: () => {} } as any },
    );
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Run failed');
      process.exit(result.exitCode);
    }
    console.log(JSON.stringify(result.result, null, 2));
  });

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
  .option('-o, --operation <id>', 'Operation ID')
  .addOption(new Option('-s, --scope <id>', 'Deprecated alias').hideHelp())
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
  .option('-o, --operation <id>', 'Operation ID')
  .addOption(new Option('-s, --scope <id>', 'Deprecated alias').hideHelp())
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
  .option('-o, --operation <id>', 'Operation ID')
  .addOption(new Option('-s, --scope <id>', 'Deprecated alias').hideHelp())
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
  .option('-o, --operation <id>', 'Operation ID')
  .addOption(new Option('-s, --scope <id>', 'Deprecated alias').hideHelp())
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
  .command('reject-draft')
  .description('Reject a draft-ready outbound command')
  .argument('<outbound-id>', 'Outbound command ID to reject')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('--rationale <text>', 'Operator rationale for rejection')
  .action((outboundId: string, opts: Record<string, unknown>) => wrapCommand<Record<string, unknown> & { config?: string; verbose?: boolean; format?: string }>('reject-draft', (merged, ctx) =>
    rejectDraftCommand({
      ...merged,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      outboundId,
      rationale: merged.rationale as string | undefined,
    }, ctx))({ ...opts, outboundId }));

program
  .command('mark-reviewed')
  .description('Mark a draft-ready outbound command as reviewed')
  .argument('<outbound-id>', 'Outbound command ID to mark reviewed')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('--notes <text>', 'Reviewer notes')
  .action((outboundId: string, opts: Record<string, unknown>) => wrapCommand<Record<string, unknown> & { config?: string; verbose?: boolean; format?: string }>('mark-reviewed', (merged, ctx) =>
    markReviewedCommand({
      ...merged,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      outboundId,
      notes: merged.notes as string | undefined,
    }, ctx))({ ...opts, outboundId }));

program
  .command('handled-externally')
  .description('Record that a draft was handled outside Narada')
  .argument('<outbound-id>', 'Outbound command ID')
  .requiredOption('--ref <reference>', 'External reference (ticket ID, thread URL)')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action((outboundId: string, opts: Record<string, unknown>) => wrapCommand<Record<string, unknown> & { config?: string; verbose?: boolean; format?: string }>('handled-externally', (merged, ctx) =>
    handledExternallyCommand({
      ...merged,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      outboundId,
      ref: merged.ref as string,
    }, ctx))({ ...opts, outboundId }));

program
  .command('drafts')
  .description('Mailbox-specific draft overview — grouped by status with counts and available actions')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-l, --limit <n>', 'Maximum drafts per group', '20')
  .action(wrapCommand('drafts', (opts, ctx) =>
    draftsCommand({
      ...opts,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      limit: opts.limit ? Number(opts.limit) : undefined,
    }, ctx)));

program
  .command('show-draft')
  .description('Show deep-dive draft review detail including lineage and available actions')
  .argument('<outbound-id>', 'Outbound command ID to inspect')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action((outboundId: string, opts: Record<string, unknown>) => wrapCommand<Record<string, unknown> & { config?: string; verbose?: boolean; format?: string }>('show-draft', (merged, ctx) =>
    showDraftCommand({
      ...merged,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      outboundId,
    }, ctx))({ ...opts, outboundId }));

program
  .command('approve-draft-for-send')
  .description('Approve a draft-ready outbound command for send execution')
  .argument('<outbound-id>', 'Outbound command ID to approve for send')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action((outboundId: string, opts: Record<string, unknown>) => wrapCommand<Record<string, unknown> & { config?: string; verbose?: boolean; format?: string }>('approve-draft-for-send', (merged, ctx) =>
    approveDraftForSendCommand({
      ...merged,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      outboundId,
    }, ctx))({ ...opts, outboundId }));

program
  .command('retry-auth-failed')
  .description('Retry outbound commands that failed due to auth errors after credentials are restored')
  .argument('[outbound-id]', 'Specific outbound command ID to retry (optional; scans all scopes if omitted)')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-l, --limit <n>', 'Maximum commands to retry per scope when scanning', '50')
  .action((outboundId: string | undefined, opts: Record<string, unknown>) => wrapCommand<Record<string, unknown> & { config?: string; verbose?: boolean; format?: string }>('retry-auth-failed', (merged, ctx) =>
    retryAuthFailedCommand({
      ...merged,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      outboundId,
      limit: merged.limit ? Number(merged.limit) : undefined,
    }, ctx))({ ...opts, outboundId }));

program
  .command('acknowledge-alert')
  .description('Acknowledge a failed work item so it no longer appears as active operator attention')
  .argument('<work-item-id>', 'Failed work item ID to acknowledge')
  .option('-c, --config <path>', 'Path to config file', './config.json')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action((workItemId: string, opts: Record<string, unknown>) => wrapCommand<Record<string, unknown> & { config?: string; verbose?: boolean; format?: string }>('acknowledge-alert', (merged, ctx) =>
    acknowledgeAlertCommand({
      ...merged,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      workItemId,
    }, ctx))({ ...opts, workItemId }));

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
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      scope: (opts.operation || opts.scope) as string | undefined,
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
    console.log('\nArtifacts:');
    for (const a of result.artifacts) {
      console.log(`  [${a.category}] ${a.path} — ${a.description}`);
    }
    console.log('\nBootstrap contract — run these next:');
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
  .option('--graph-user-id <id>', 'Graph API user ID (defaults to mailbox ID)')
  .option('--folders <list>', 'Comma-separated folder list (defaults to inbox)', 'inbox')
  .option('--data-root-dir <path>', 'Data root directory for this operation')
  .description('Declare a mailbox operation')
  .action((mailboxId, opts) => {
    const result = wantMailbox(mailboxId, {
      configPath: opts.config,
      primaryCharter: opts.primaryCharter,
      secondaryCharters: opts.secondaryCharters ? String(opts.secondaryCharters).split(',') : undefined,
      posture: opts.posture,
      graphUserId: opts.graphUserId,
      folders: opts.folders ? String(opts.folders).split(',') : undefined,
      dataRootDir: opts.dataRootDir,
    });
    console.log(result.summary);
    console.log('\nBootstrap contract — run these next:');
    for (const step of result.nextSteps) console.log(`  ${step}`);
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
