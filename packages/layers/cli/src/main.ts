#!/usr/bin/env node
import { Command, Option, Help } from 'commander';
import { GroupedHelp } from './lib/grouped-help.js';
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
  sitesDoctorCommand,
  sitesInitCommand,
  sitesEnableCommand,
} from './commands/sites.js';
import {
  consoleStatusCommand,
  consoleAttentionCommand,
  consoleControlCommand,
} from './commands/console.js';
import { createConsoleServer } from './commands/console-server.js';
import { createWorkbenchServer, workbenchDiagnoseCommand } from './commands/workbench-server.js';
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
import { taskRecommendCommand } from './commands/task-recommend.js';
import {
  postureShowCommand,
  postureUpdateCommand,
  postureCheckCommand,
} from './commands/posture.js';
import { taskDeriveFromFindingCommand } from './commands/task-derive-from-finding.js';
import { registerTaskAuthoringCommands } from './commands/task-authoring-register.js';
import { taskLintCommand } from './commands/task-lint.js';
import { registerTaskLifecycleCommands } from './commands/task-lifecycle-register.js';
import { taskDispatchCommand } from './commands/task-dispatch.js';
import {
  taskPeekNextCommand,
  taskPullNextCommand,
  taskWorkNextCommand,
} from './commands/task-next.js';
import { openTaskLifecycleStore } from './lib/task-lifecycle-store.js';
import { chapterCloseCommand } from './commands/chapter-close.js';
import { chapterFinishRangeCommand } from './commands/chapter-finish-range.js';
import { chapterInitCommand, chapterValidateTasksFileCommand } from './commands/chapter-init.js';
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
import { taskSearchCommand } from './commands/task-search.js';
import { taskEvidenceAdmitCommand, taskEvidenceCommand, taskEvidenceProveCriteriaCommand } from './commands/task-evidence.js';
import { taskReadCommand } from './commands/task-read.js';
import { taskEvidenceAssertCompleteCommand, taskEvidenceListCommand } from './commands/task-evidence-list.js';
import { taskReconcileInspectCommand, taskReconcileRecordCommand, taskReconcileRepairCommand } from './commands/task-reconcile.js';
import {
  taskRosterShowCommand,
  taskRosterAssignCommand,
  taskRosterReviewCommand,
  taskRosterDoneCommand,
  taskRosterIdleCommand,
} from './commands/task-roster.js';
import { verifyStatusCommand } from './commands/verify-status.js';
import {
  crossingListCommand,
  crossingShowCommand,
} from './commands/crossing.js';
import { verifySuggestCommand } from './commands/verify-suggest.js';
import { verifyExplainCommand } from './commands/verify-explain.js';
import { verifyRunCommand } from './commands/verify-run.js';
import {
  testRunCommand,
  testRunInspectCommand,
  testRunListCommand,
} from './commands/test-run.js';
import {
  commandRunCommand,
  commandRunInspectCommand,
  commandRunListCommand,
} from './commands/command-run.js';
import {
  observationInspectCommand,
  observationListCommand,
  observationOpenCommand,
} from './commands/observation.js';
import { runDirectCommand, runDirectCommandWithResource, wrapCommand, type CommandContext } from './lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from './lib/cli-output.js';
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
program.createHelp = () => new GroupedHelp();

program
  .name('narada')
  .description('Narada CLI — deterministic state compiler and operation control')
  .version('1.0.0')
  .configureHelp({ sortSubcommands: false, helpWidth: 100 })
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--log-level <level>', 'Log level: debug, info, warn, error', 'info')
  .option('--log-format <format>', 'Log format: pretty, json, or auto', 'auto')
  .option('--metrics-output <file>', 'Write metrics to file on exit')
  .hook('preAction', (thisCommand) => {
    // Store format in environment for commands to access
    const opts = thisCommand.opts();
    if (opts.format && !(opts.format === 'auto' && process.env.OUTPUT_FORMAT)) {
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
      format: resolveCommandFormat(),
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
      format: resolveCommandFormat(),
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
      format: resolveCommandFormat(),
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
  .command('doctor <site-id>')
  .description('Validate Site root posture, registry, and lifecycle state')
  .option('--root <path>', 'Override Site root directory')
  .option('--authority-locus <locus>', 'Windows authority locus: user or pc')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (siteId: string, opts: Record<string, unknown>) => {
    const format = (opts.format ?? process.env.OUTPUT_FORMAT) as 'json' | 'human' | 'auto';
    const result = await sitesDoctorCommand(siteId, {
      root: opts.root as string | undefined,
      authorityLocus: opts.authorityLocus as string | undefined,
      format,
      verbose: opts.verbose as boolean | undefined,
    }, { configPath: './config.json', verbose: !!opts.verbose, logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} } as unknown as CommandContext['logger'] });
    const shouldPrintJson = format === 'json' || (format === 'auto' && !process.stdout.isTTY);
    if (!shouldPrintJson) {
      // human output already printed by formatter
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
    if (result.exitCode !== 0) {
      process.exit(result.exitCode);
    }
  });

sitesCmd
  .command('init <site-id>')
  .description('Initialize a new Narada Site')
  .requiredOption('--substrate <name>', 'Substrate: windows-native, windows-wsl, macos, linux-user, linux-system')
  .option('--operation <id>', 'Operation ID to bind')
  .option('--root <path>', 'Override Site root directory')
  .option('--authority-locus <locus>', 'Windows authority locus: user or pc')
  .option('--sync <posture>', 'User Site sync posture: local_only, cloud_synced_folder, git_backed, hybrid, hybrid_capable_plain_folder')
  .option('--dry-run', 'Preview without making changes', false)
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (siteId: string, opts: Record<string, unknown>) => {
    const result = await sitesInitCommand(siteId, {
      substrate: opts.substrate as string,
      operation: opts.operation as string | undefined,
      root: opts.root as string | undefined,
      authorityLocus: opts.authorityLocus as string | undefined,
      sync: opts.sync as string | undefined,
      dryRun: opts.dryRun as boolean | undefined,
      format: resolveCommandFormat(),
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
      format: resolveCommandFormat(),
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
      format: resolveCommandFormat(),
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
      format: resolveCommandFormat(),
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

consoleCmd
  .command('serve')
  .description('Start the Operator Console HTTP API for browser UI')
  .option('--host <host>', 'Host to bind to', '127.0.0.1')
  .option('--port <port>', 'Port to bind to (0 for ephemeral)', '0')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (opts: Record<string, unknown>) => {
    const host = (opts.host as string) ?? '127.0.0.1';
    const port = opts.port ? parseInt(String(opts.port), 10) : 0;
    const server = await createConsoleServer({ host, port, verbose: !!opts.verbose });
    const url = await server.start();
    console.log(`Operator Console HTTP API listening at ${url}`);
    console.log('Press Ctrl+C to stop');
    process.on('SIGINT', async () => {
      await server.stop();
      process.exit(0);
    });
  });

// ── Workbench commands ──

const workbenchCmd = program
  .command('workbench')
  .description('Self-build workbench HTTP server and controls');

workbenchCmd
  .command('diagnose')
  .description('Show bounded Workbench diagnostics')
  .option('--format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await workbenchDiagnoseCommand({
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(opts.format, 'human'),
    });
    if (opts.format === 'json' || process.env.OUTPUT_FORMAT === 'json') {
      console.log(JSON.stringify(result.result, null, 2));
    } else {
      console.log(result.result);
    }
    if (result.exitCode !== 0) process.exit(result.exitCode);
  });

workbenchCmd
  .command('serve')
  .description('Start the Workbench HTTP API for browser UI')
  .option('--host <host>', 'Host to bind to', '127.0.0.1')
  .option('--port <port>', 'Port to bind to (0 for ephemeral)', '0')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('-v, --verbose', 'Enable verbose output', false)
  .action(async (opts: Record<string, unknown>) => {
    const host = (opts.host as string) ?? '127.0.0.1';
    const port = opts.port ? parseInt(String(opts.port), 10) : 0;
    const cwd = (opts.cwd as string) ?? '.';
    const server = await createWorkbenchServer({ host, port, cwd, verbose: !!opts.verbose });
    const url = await server.start();
    console.log(`Workbench HTTP API listening at ${url}`);
    console.log('Press Ctrl+C to stop');
    process.on('SIGINT', async () => {
      await server.stop();
      process.exit(0);
    });
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
    emitCommandResult(result.result);
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
  .description('Task governance — create, claim, report, review, close, observe, lint, dispatch, roster, evidence');

registerTaskLifecycleCommands(taskCmd);

taskCmd
  .command('recommend')
  .description('Recommend task/agent assignments (advisory, read-only)')
  .option('--agent <id>', 'Restrict to a specific agent')
  .option('--task <number>', 'Recommend for a specific task only')
  .option('--limit <n>', 'Maximum recommendations to show', '10')
  .option('--ignore-posture', 'Disable CCC posture score adjustments', false)
  .option('--abstained-limit <n>', 'Maximum abstained diagnostics to return by default')
  .option('--full', 'Return full abstention diagnostics', false)
  .option('--format <fmt>', 'Output format: json or human')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
  .action(async (opts: Record<string, unknown>) => {
    const wantsJson = opts.format === 'json' || process.env.OUTPUT_FORMAT === 'json';
    const result = await taskRecommendCommand({
      taskNumber: opts.task as string | undefined,
      agent: opts.agent as string | undefined,
      limit: opts.limit ? Number(opts.limit) : undefined,
      ignorePosture: opts.ignorePosture as boolean | undefined,
      full: opts.full as boolean | undefined,
      abstainedLimit: opts.abstainedLimit ? Number(opts.abstainedLimit) : undefined,
      cwd: opts.cwd as string | undefined,
      format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      verbose: opts.verbose as boolean | undefined,
    });
    if (result.exitCode !== 0) {
      const resultObj = result.result as Record<string, unknown>;
      if (resultObj.error) {
        // Actual runtime error
        if (wantsJson) {
          console.log(JSON.stringify(result.result, null, 2));
        } else {
          console.error(resultObj.error);
        }
        process.exit(result.exitCode);
      }
      // Valid empty recommendation (no primary) — not a failure
      if (resultObj.primary === null) {
        const fmt = process.env.OUTPUT_FORMAT as string | undefined;
        const isJson = wantsJson || (fmt !== 'human' && !process.stdout.isTTY);
        if (isJson) {
          console.log(JSON.stringify(result.result, null, 2));
        }
        // Human mode already printed "No recommendations available." in the command
        process.exit(result.exitCode);
      }
      console.error('Recommendation failed');
      process.exit(result.exitCode);
    }
    if (wantsJson) {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

registerTaskAuthoringCommands(taskCmd);

taskCmd
  .command('derive-from-finding <finding-id>')
  .description('Derive a corrective task from a review finding')
  .requiredOption('--review <review-id>', 'Review ID containing the finding')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (findingId: string, opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task derive-from-finding', emit: emitCommandResult, invocation: () => taskDeriveFromFindingCommand({
      findingId,
      review: opts.review as string,
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(),
    }) });
  });

taskCmd
  .command('lint')
  .description('Lint task files for structural issues (pure tool)')
  .option('--chapter <range>', 'Lint only tasks in a chapter range (e.g. 100-110)')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task lint', emit: emitCommandResult, invocation: () => taskLintCommand({
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(),
      chapter: opts.chapter as string | undefined,
    }) });
  });

taskCmd
  .command('list')
  .description('List runnable tasks sorted by continuation affinity')
  .option('--range <start-end>', 'Filter tasks to a number range (e.g. 501-999)')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task list', emit: emitCommandResult, invocation: () => taskListCommand({
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(),
      range: opts.range as string | undefined,
    }) });
  });

taskCmd
  .command('search <query>')
  .description('Search task files by content (front matter + body)')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .action(async (query: string, opts: Record<string, unknown>) => {
    const result = await taskSearchCommand({
      query,
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(opts.format, 'human'),
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Search failed');
      process.exit(result.exitCode);
    }
    if (typeof result.result === 'string') {
      console.log(result.result);
    } else if (opts.format === 'json' || process.env.OUTPUT_FORMAT === 'json') {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

taskCmd
  .command('read <task-number>')
  .description('Read a single task — canonical observation operator')
  .option('--format <fmt>', 'Output format: json or human', 'human')
  .option('--verbose', 'Show full sections (human mode only)', false)
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task read', emit: emitCommandResult, format: opts.format, invocation: () => taskReadCommand({
      taskNumber,
      format: resolveCommandFormat(opts.format, 'human'),
      verbose: opts.verbose as boolean | undefined,
      cwd: opts.cwd as string | undefined,
    }) });
  });

taskCmd
  .command('graph')
  .description('Render the task graph as Mermaid (read-only inspection)')
  .option('--format <format>', 'Output format: mermaid, json, or auto', 'auto')
  .option('--range <start-end>', 'Filter tasks to a number range (e.g. 429-454)')
  .option('--status <csv>', 'Filter by status (comma-separated)')
  .option('--include-closed', 'Include closed/confirmed tasks', false)
  .option('--full', 'Print full graph output instead of bounded artifact pointer', false)
  .option('--view', 'Create HTML render artifacts and open browser', false)
  .option('--open', 'Open browser after creating artifacts (default true with --view)', true)
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task graph', emit: emitCommandResult, format: opts.format, invocation: () => taskGraphCommand({
      cwd: opts.cwd as string | undefined,
      format: opts.format as 'mermaid' | 'json' | 'auto' | undefined,
      range: opts.range as string | undefined,
      status: opts.status as string | undefined,
      includeClosed: opts.includeClosed as boolean | undefined,
      full: opts.full as boolean | undefined,
      bounded: true,
      view: opts.view as boolean | undefined,
      open: opts.open as boolean | undefined,
    }) });
  });

// Posture commands (Task 467)
const postureCmd = program
  .command('posture')
  .description('CCC posture advisory signal management');

postureCmd
  .command('show')
  .description('Display current CCC posture')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await postureShowCommand({
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Posture show failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

postureCmd
  .command('update')
  .description('Update CCC posture from a JSON file')
  .requiredOption('--from <source>', 'Source label, e.g. manual or chapter-closure-400-410')
  .option('--file <path>', 'Path to posture JSON file')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await postureUpdateCommand({
      from: opts.from as string,
      file: opts.file as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Posture update failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

postureCmd
  .command('check')
  .description('Validate current CCC posture schema and freshness')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await postureCheckCommand({
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Posture check failed');
      process.exit(result.exitCode);
    }
    console.log(result.result);
  });

// Task roster tracking commands (Task 385)
const rosterCmd = taskCmd
  .command('roster')
  .description('Roster projection operators for agent operational state');

rosterCmd
  .command('show')
  .description('Observe current agent roster projection')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
  .action(async (opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task roster show', emit: emitCommandResult, invocation: () => taskRosterShowCommand({
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(),
      verbose: opts.verbose as boolean | undefined,
    }) });
  });

rosterCmd
  .command('assign <task-number>')
  .description('Roster + assignment admission: mark agent working and claim by default')
  .requiredOption('--agent <id>', 'Agent ID from roster')
  .option('--no-claim', 'Skip claiming the task (exceptional: only for planning)')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task roster assign', emit: emitCommandResult, invocation: () => taskRosterAssignCommand({
      taskNumber,
      agent: opts.agent as string,
      noClaim: opts.noClaim as boolean | undefined,
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(),
      verbose: opts.verbose as boolean | undefined,
    }) });
  });

rosterCmd
  .command('review <task-number>')
  .description('Roster projection: mark agent as reviewing a task')
  .requiredOption('--agent <id>', 'Agent ID from roster')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task roster review', emit: emitCommandResult, invocation: () => taskRosterReviewCommand({
      taskNumber,
      agent: opts.agent as string,
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(),
      verbose: opts.verbose as boolean | undefined,
    }) });
  });

taskCmd
  .command('peek-next')
  .description('Non-mutating next-task inspection for an agent')
  .requiredOption('--agent <id>', 'Agent ID')
  .option('--format <fmt>', 'Output format: json or human', 'human')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const wantsJson = opts.format === 'json' || process.env.OUTPUT_FORMAT === 'json';
    const result = await taskPeekNextCommand({
      agent: opts.agent as string,
      format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      if (wantsJson) {
        console.log(JSON.stringify(result.result, null, 2));
      } else {
        console.error((result.result as { error?: string }).error ?? 'Peek-next failed');
      }
      process.exit(result.exitCode);
    }
    if (wantsJson) {
      console.log(JSON.stringify(result.result, null, 2));
    } else {
      console.log(result.result);
    }
  });

taskCmd
  .command('pull-next')
  .description('Mutating next-task pull: claim the best admissible task')
  .requiredOption('--agent <id>', 'Agent ID')
  .option('--format <fmt>', 'Output format: json or human', 'human')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const wantsJson = opts.format === 'json' || process.env.OUTPUT_FORMAT === 'json';
    const result = await taskPullNextCommand({
      agent: opts.agent as string,
      format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      if (wantsJson) {
        console.log(JSON.stringify(result.result, null, 2));
      } else {
        console.error((result.result as { error?: string }).error ?? 'Pull-next failed');
      }
      process.exit(result.exitCode);
    }
    if (wantsJson) {
      console.log(JSON.stringify(result.result, null, 2));
    } else {
      console.log(result.result);
    }
  });

taskCmd
  .command('work-next')
  .description('Execution packet for current task, or pull-next then packet')
  .requiredOption('--agent <id>', 'Agent ID')
  .option('--format <fmt>', 'Output format: json or human', 'human')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const wantsJson = opts.format === 'json' || process.env.OUTPUT_FORMAT === 'json';
    const result = await taskWorkNextCommand({
      agent: opts.agent as string,
      format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    });
    if (result.exitCode !== 0) {
      if (wantsJson) {
        console.log(JSON.stringify(result.result, null, 2));
      } else {
        console.error((result.result as { error?: string }).error ?? 'Work-next failed');
      }
      process.exit(result.exitCode);
    }
    if (wantsJson) {
      console.log(JSON.stringify(result.result, null, 2));
    } else {
      console.log(result.result);
    }
  });

taskCmd
  .command('dispatch <action>')
  .description('Dispatch surface: queue, pickup, status, start')
  .option('--task-number <num>', 'Task number (for pickup/status)')
  .option('--agent <id>', 'Agent ID')
  .option('--exec', 'Actually spawn the execution session (start action only)')
  .option('--format <fmt>', 'Output format: json or human', 'human')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (action: string, opts: Record<string, unknown>) => {
    const cwd = opts.cwd as string | undefined;
    await runDirectCommandWithResource({
      command: 'task dispatch',
      emit: emitCommandResult,
      format: opts.format,
      open: () => openTaskLifecycleStore(cwd || process.cwd()),
      close: (store) => {
        store.db.close();
      },
      invocation: (store) => taskDispatchCommand({
        action: action as 'queue' | 'pickup' | 'status' | 'start',
        taskNumber: opts.taskNumber as string | undefined,
        agent: opts.agent as string | undefined,
        exec: opts.exec as boolean | undefined,
        cwd,
        format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        store,
      }),
    });
  });

const taskEvidenceCmd = taskCmd
  .command('evidence')
  .description('Task evidence operators (inspect, admit, prove-criteria, list)');

taskEvidenceCmd
  .command('inspect <task-number>')
  .description('Inspect task completion evidence (task-authority read-only; may admit observation output)')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task evidence inspect', emit: emitCommandResult, invocation: () => taskEvidenceCommand({
      taskNumber,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    }) });
  });

taskEvidenceCmd
  .command('list')
  .description('List tasks by completion evidence (task-authority read-only; writes bounded observation artifact)')
  .option('--verdict <csv>', 'Filter by verdict (comma-separated: complete,attempt_complete,needs_review,needs_closure,incomplete,unknown)')
  .option('--status <csv>', 'Filter by front-matter status (comma-separated)')
  .option('--range <start-end>', 'Filter tasks to a number range (e.g. 480-490)')
  .option('--limit <n>', 'Maximum tasks to return/show without --full', '25')
  .option('--full', 'Return the complete list (explicitly opt into unbounded output)', false)
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task evidence list', emit: emitCommandResult, invocation: () => taskEvidenceListCommand({
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(),
      verdict: opts.verdict as string | undefined,
      status: opts.status as string | undefined,
      range: opts.range as string | undefined,
      limit: opts.limit as string | undefined,
      full: opts.full === true,
    }) });
  });

taskEvidenceCmd
  .command('assert-complete <range>')
  .description('Fail unless every task in a numeric range is evidence-complete')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (range: string, opts: Record<string, unknown>) => {
    const format = resolveCommandFormat(undefined, 'human');
    await runDirectCommand({ command: 'task evidence assert-complete', emit: emitCommandResult, format, invocation: () => taskEvidenceAssertCompleteCommand({
      range,
      cwd: opts.cwd as string | undefined,
      format,
    }) });
  });

taskEvidenceCmd
  .command('prove-criteria <task-number>')
  .description('Prove acceptance criteria completion through Evidence Admission')
  .requiredOption('--by <id>', 'Operator or agent ID proving criteria')
  .option('--verification-run <id>', 'Verification run ID supporting this criteria proof')
  .option('--no-run-rationale <text>', 'Explicit rationale when criteria proof has no verification run binding')
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task evidence prove-criteria', emit: emitCommandResult, format: opts.format, invocation: () => taskEvidenceProveCriteriaCommand({
      taskNumber,
      by: opts.by as string,
      verificationRunId: opts.verificationRun as string | undefined,
      noRunRationale: opts.noRunRationale as string | undefined,
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(opts.format, 'auto'),
    }) });
  });

taskEvidenceCmd
  .command('admit <task-number>')
  .description('Admit task evidence for lifecycle transition consumption')
  .requiredOption('--by <id>', 'Operator or agent ID admitting evidence')
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task evidence admit', emit: emitCommandResult, format: opts.format, invocation: () => taskEvidenceAdmitCommand({
      taskNumber,
      by: opts.by as string,
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(opts.format, 'auto'),
    }) });
  });

// Backward compatibility: `narada task evidence <task-number>` routes to inspect
// This is handled by a catch-all argument on the parent evidence command
taskEvidenceCmd
  .argument('[task-number]', 'Task number to inspect (backward compatibility; prefer `inspect`)')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (taskNumber: string | undefined, opts: Record<string, unknown>) => {
    if (!taskNumber) {
      taskEvidenceCmd.help();
      return;
    }
    await runDirectCommand({ command: 'task evidence', emit: emitCommandResult, invocation: () => taskEvidenceCommand({
      taskNumber,
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(),
    }) });
  });

const taskReconcileCmd = taskCmd
  .command('reconcile')
  .description('Task reconciliation operators (inspect, record, repair)');

taskReconcileCmd
  .command('inspect')
  .description('Detect task authority drift without recording or repairing it')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('--range <start-end>', 'Restrict inspection to task number range')
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskReconcileInspectCommand({
      cwd: opts.cwd as string | undefined,
      range: opts.range as string | undefined,
      format: opts.format as 'json' | 'human' | 'auto' | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Reconcile inspect failed');
      process.exit(result.exitCode);
    }
    console.log(JSON.stringify(result.result, null, 2));
  });

taskReconcileCmd
  .command('record')
  .description('Record reconciliation findings for later sanctioned repair')
  .option('--by <id>', 'Operator or agent recording findings', 'operator')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('--range <start-end>', 'Restrict recording to task number range')
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskReconcileRecordCommand({
      by: opts.by as string | undefined,
      cwd: opts.cwd as string | undefined,
      range: opts.range as string | undefined,
      format: opts.format as 'json' | 'human' | 'auto' | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Reconcile record failed');
      process.exit(result.exitCode);
    }
    console.log(JSON.stringify(result.result, null, 2));
  });

taskReconcileCmd
  .command('repair')
  .description('Apply a sanctioned reconciliation repair')
  .requiredOption('--finding <id>', 'Finding ID to repair')
  .requiredOption('--by <id>', 'Operator or agent performing repair')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .action(async (opts: Record<string, unknown>) => {
    const result = await taskReconcileRepairCommand({
      finding: opts.finding as string | undefined,
      by: opts.by as string | undefined,
      cwd: opts.cwd as string | undefined,
      format: opts.format as 'json' | 'human' | 'auto' | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Reconcile repair failed');
      process.exit(result.exitCode);
    }
    console.log(JSON.stringify(result.result, null, 2));
  });

const observationCmd = program
  .command('observation')
  .description('Observation artifact operators');

observationCmd
  .command('list')
  .description('List recent observation artifacts')
  .option('--limit <n>', 'Maximum artifacts to list', '20')
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await observationListCommand({
      cwd: opts.cwd as string | undefined,
      limit: opts.limit ? Number(opts.limit) : undefined,
      format: resolveCommandFormat(opts.format, 'auto'),
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Observation list failed');
      process.exit(result.exitCode);
    }
    emitCommandResult(result.result, opts.format);
  });

observationCmd
  .command('inspect <artifact-id>')
  .description('Inspect an observation artifact')
  .option('--content', 'Include full artifact content', false)
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (artifactId: string, opts: Record<string, unknown>) => {
    const result = await observationInspectCommand({
      artifactId,
      cwd: opts.cwd as string | undefined,
      content: opts.content as boolean | undefined,
      format: resolveCommandFormat(opts.format, 'auto'),
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Observation inspect failed');
      process.exit(result.exitCode);
    }
    emitCommandResult(result.result, opts.format);
  });

observationCmd
  .command('open <artifact-id>')
  .description('Return the path and shell open command for an observation artifact')
  .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (artifactId: string, opts: Record<string, unknown>) => {
    const result = await observationOpenCommand({
      artifactId,
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(opts.format, 'auto'),
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Observation open failed');
      process.exit(result.exitCode);
    }
    emitCommandResult(result.result, opts.format);
  });

rosterCmd
  .command('done <task-number>')
  .description('Mark agent done with a task')
  .requiredOption('--agent <id>', 'Agent ID from roster')
  .option('--strict', 'Fail if required evidence is missing (default behavior)', false)
  .option('--allow-incomplete', 'Record roster availability even when task evidence is missing', false)
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
  .action(async (taskNumber: string, opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task roster done', emit: emitCommandResult, invocation: () => taskRosterDoneCommand({
      taskNumber,
      agent: opts.agent as string,
      strict: opts.strict as boolean | undefined,
      allowIncomplete: opts.allowIncomplete as boolean | undefined,
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(),
      verbose: opts.verbose as boolean | undefined,
    }) });
  });

rosterCmd
  .command('idle')
  .description('Mark agent as idle')
  .requiredOption('--agent <id>', 'Agent ID from roster')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
  .action(async (opts: Record<string, unknown>) => {
    await runDirectCommand({ command: 'task roster idle', emit: emitCommandResult, invocation: () => taskRosterIdleCommand({
      agent: opts.agent as string,
      cwd: opts.cwd as string | undefined,
      format: resolveCommandFormat(),
      verbose: opts.verbose as boolean | undefined,
    }) });
  });

// Chapter governance commands
const chapterCmd = program
  .command('chapter')
  .description('Chapter governance operators');

chapterCmd
  .command('finish-range <range>')
  .description('Sanctioned chapter task completion orchestration for a numeric range')
  .requiredOption('--agent <id>', 'Agent ID performing the finish path')
  .option('--summary-prefix <text>', 'Summary prefix for each task report')
  .option('--force', 'Continue after task-level failure', false)
  .option('--details', 'Include full per-task command results', false)
  .option('--format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (range: string, opts: Record<string, unknown>) => {
    await runDirectCommand({
      command: 'chapter finish-range',
      emit: emitCommandResult,
      format: opts.format,
      invocation: () => chapterFinishRangeCommand({
        range,
        agent: opts.agent as string,
        summaryPrefix: opts.summaryPrefix as string | undefined,
        force: opts.force as boolean | undefined,
        details: opts.details as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      }),
    });
  });

chapterCmd
  .command('assert-complete <range>')
  .description('Fail unless every task in a numeric chapter range is evidence-complete')
  .option('--format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (range: string, opts: Record<string, unknown>) => {
    const localFormat = opts.format === 'auto' ? undefined : opts.format;
    const format = resolveCommandFormat(localFormat, 'human');
    await runDirectCommand({
      command: 'chapter assert-complete',
      emit: emitCommandResult,
      format,
      invocation: () => taskEvidenceAssertCompleteCommand({
        range,
        cwd: opts.cwd as string | undefined,
        format,
      }),
    });
  });

chapterCmd
  .command('init <slug>')
  .description('Initialize a chapter skeleton with range file and child tasks')
  .requiredOption('--title <title>', 'Chapter title')
  .requiredOption('--from <number>', 'First task number (positive integer)')
  .requiredOption('--count <n>', 'Number of child tasks (>= 1)')
  .option('--depends-on <numbers>', 'Comma-separated dependency task numbers')
  .option('--tasks-file <path>', 'JSON array of detailed child task specifications')
  .option('--dry-run', 'Preview files without writing', false)
  .option('--format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (slug: string, opts: Record<string, unknown>) => {
    const format = resolveCommandFormat(opts.format, 'auto');
    await runDirectCommand({
      command: 'chapter init',
      emit: emitCommandResult,
      format,
      invocation: () => chapterInitCommand({
        slug,
        title: opts.title as string | undefined,
        from: opts.from ? Number(opts.from) : undefined,
        count: opts.count ? Number(opts.count) : undefined,
        dependsOn: opts.dependsOn as string | undefined,
        tasksFile: opts.tasksFile as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format,
      }),
    });
  });

chapterCmd
  .command('validate-tasks-file <path>')
  .description('Validate a chapter task-spec JSON file without writing tasks')
  .requiredOption('--count <n>', 'Expected number of child task specs')
  .option('--format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (path: string, opts: Record<string, unknown>) => {
    await runDirectCommand({
      command: 'chapter validate-tasks-file',
      emit: emitCommandResult,
      format: opts.format,
      invocation: () => chapterValidateTasksFileCommand({
        path,
        count: opts.count ? Number(opts.count) : undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      }),
    });
  });

chapterCmd
  .command('status <range>')
  .description('Derive and display chapter state from task statuses in a range')
  .option('--format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (range: string, opts: Record<string, unknown>) => {
    const format = resolveCommandFormat(opts.format, 'auto');
    await runDirectCommand({
      command: 'chapter status',
      emit: emitCommandResult,
      format,
      invocation: () => chapterStatusCommand({
        range,
        cwd: opts.cwd as string | undefined,
        format,
      }),
    });
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
  .option('--format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (identifier: string, opts: Record<string, unknown>) => {
    const isRange = /^\d+(?:-\d+)?$/.test(identifier);
    const format = resolveCommandFormat(opts.format, 'auto');
    await runDirectCommand({
      command: 'chapter close',
      emit: emitCommandResult,
      format,
      invocation: () => chapterCloseCommand({
        chapterName: isRange && !opts.start && !opts.finish && !opts.reopen ? undefined : (isRange ? undefined : identifier),
        range: isRange && (opts.start || opts.finish || opts.reopen) ? identifier : undefined,
        start: opts.start as boolean | undefined,
        finish: opts.finish as boolean | undefined,
        reopen: opts.reopen as boolean | undefined,
        by: opts.by as string | undefined,
        reason: opts.reason as string | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format,
      }),
    });
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

// Verification commands (diagnostic / non-canonical)
const verifyCmd = program
  .command('verify')
  .description('Diagnostic verification operators — does not create durable test-run records. For canonical task verification, use `test-run`.');

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

// Command Execution Intent Zone commands (sanctioned command-run path)
const commandRunCmd = program
  .command('command-run')
  .description('Command Execution Intent Zone — governed command execution');

commandRunCmd
  .command('run')
  .description('Request and execute a governed command run')
  .option('--cmd <command>', 'Command string to run; argv-first unless --shell is set')
  .option('--argv <json>', 'Command argv JSON array')
  .option('--preset <name>', 'Named diagnostic preset: cli-build, task-graph-json, workbench-diagnose')
  .option('--shell', 'Run through shell mode after classification', false)
  .option('--task <number>', 'Link to a task number')
  .option('--agent <id>', 'Agent identity linkage')
  .option('--requester <identity>', 'Requester identity')
  .option('--requester-kind <kind>', 'Requester kind: operator, agent, or system')
  .option('--side-effect <class>', 'Side-effect class')
  .option('--timeout <seconds>', 'Timeout in seconds')
  .option('--output-profile <profile>', 'Output admission profile', 'bounded_excerpt')
  .option('--rationale <text>', 'Why this run is being requested')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await commandRunCommand({
      cmd: opts.cmd as string | undefined,
      argv: opts.argv as string | undefined,
      preset: opts.preset as any,
      shell: opts.shell as boolean | undefined,
      taskNumber: opts.task ? Number(opts.task) : undefined,
      agent: opts.agent as string | undefined,
      requester: opts.requester as string | undefined,
      requesterKind: opts.requesterKind as 'operator' | 'agent' | 'system' | undefined,
      sideEffect: opts.sideEffect as any,
      timeout: opts.timeout ? Number(opts.timeout) : undefined,
      outputProfile: opts.outputProfile as any,
      rationale: opts.rationale as string | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (process.env.OUTPUT_FORMAT === 'json' || !process.stdout.isTTY) {
      console.log(JSON.stringify(result.result, null, 2));
    } else {
      console.log(result.result);
    }
    if (result.exitCode !== 0) process.exit(result.exitCode);
  });

commandRunCmd
  .command('inspect')
  .description('Inspect a command run without raw unbounded output')
  .requiredOption('--run-id <id>', 'Run ID to inspect')
  .option('--full', 'Include full metadata and retained artifact pointer', false)
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await commandRunInspectCommand({
      runId: opts.runId as string | undefined,
      full: opts.full as boolean | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (process.env.OUTPUT_FORMAT === 'json' || !process.stdout.isTTY) {
      console.log(JSON.stringify(result.result, null, 2));
    } else {
      console.log(result.result);
    }
    if (result.exitCode !== 0) process.exit(result.exitCode);
  });

commandRunCmd
  .command('list')
  .description('List recent command runs with bounded output')
  .option('--task <number>', 'Filter by task number')
  .option('--agent <id>', 'Filter by agent ID')
  .option('--limit <n>', 'Maximum rows', '20')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await commandRunListCommand({
      taskNumber: opts.task ? Number(opts.task) : undefined,
      agent: opts.agent as string | undefined,
      limit: opts.limit ? Number(opts.limit) : undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (process.env.OUTPUT_FORMAT === 'json' || !process.stdout.isTTY) {
      console.log(JSON.stringify(result.result, null, 2));
    } else {
      console.log(result.result);
    }
    if (result.exitCode !== 0) process.exit(result.exitCode);
  });

// Testing Intent Zone commands (sanctioned test-run path)
const testRunCmd = program
  .command('test-run')
  .description('Testing Intent Zone — governed test execution');

testRunCmd
  .command('run')
  .description('Request and execute a governed test run')
  .requiredOption('--cmd <command>', 'Test command to run')
  .option('--task <number>', 'Link to a task number')
  .option('--timeout <seconds>', 'Timeout in seconds')
  .option('--scope <scope>', 'Scope: focused or full')
  .option('--requester <identity>', 'Requester identity', 'operator')
  .option('--rationale <text>', 'Why this run is being requested')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await testRunCommand({
      cmd: opts.cmd as string | undefined,
      taskNumber: opts.task ? Number(opts.task) : undefined,
      timeout: opts.timeout ? Number(opts.timeout) : undefined,
      scope: opts.scope as 'focused' | 'full' | undefined,
      requester: opts.requester as string | undefined,
      rationale: opts.rationale as string | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Test run failed');
      process.exit(result.exitCode);
    }
    console.log(JSON.stringify(result.result, null, 2));
  });

testRunCmd
  .command('inspect')
  .description('Inspect a test run result by ID')
  .requiredOption('--run-id <id>', 'Run ID to inspect')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await testRunInspectCommand({
      runId: opts.runId as string | undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Inspect failed');
      process.exit(result.exitCode);
    }
    console.log(JSON.stringify(result.result, null, 2));
  });

testRunCmd
  .command('list')
  .description('List recent test runs')
  .option('--task <number>', 'Filter to a specific task number')
  .option('--limit <n>', 'Maximum number of runs to show', '20')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(async (opts: Record<string, unknown>) => {
    const result = await testRunListCommand({
      taskNumber: opts.task ? Number(opts.task) : undefined,
      limit: opts.limit ? Number(opts.limit) : undefined,
      cwd: opts.cwd as string | undefined,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'List failed');
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

// ── Crossing regime inspection commands (Task 498) ──

const crossingCmd = program
  .command('crossing')
  .description('Crossing regime inspection operators (read-only)');

crossingCmd
  .command('list')
  .description('List declared crossing regimes from the canonical inventory')
  .option('--classification <csv>', 'Filter by classification: canonical,advisory,deferred')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .action(async (opts: Record<string, unknown>) => {
    const result = await crossingListCommand({
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      classification: opts.classification as string | undefined,
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if (typeof result.result === 'string') {
      console.log(result.result);
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

crossingCmd
  .command('show <name>')
  .description('Show a single crossing regime declaration')
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .action(async (name: string, opts: Record<string, unknown>) => {
    const result = await crossingShowCommand({
      name,
      format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
    });
    if (result.exitCode !== 0) {
      console.error((result.result as { error?: string }).error ?? 'Command failed');
      process.exit(result.exitCode);
    }
    if (typeof result.result === 'string') {
      console.log(result.result);
    } else {
      console.log(JSON.stringify(result.result, null, 2));
    }
  });

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
