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
import { registerPostureCommands } from './commands/posture-register.js';
import { taskDeriveFromFindingCommand } from './commands/task-derive-from-finding.js';
import { registerTaskAuthoringCommands } from './commands/task-authoring-register.js';
import { taskLintCommand } from './commands/task-lint.js';
import { registerTaskLifecycleCommands } from './commands/task-lifecycle-register.js';
import { registerTaskRosterCommands } from './commands/task-roster-register.js';
import { registerTaskEvidenceCommands } from './commands/task-evidence-register.js';
import { registerTaskDispatchCommands } from './commands/task-dispatch-register.js';
import { registerTaskReconcileCommands } from './commands/task-reconcile-register.js';
import {
  taskPeekNextCommand,
  taskPullNextCommand,
  taskWorkNextCommand,
} from './commands/task-next.js';
import { registerChapterCommands } from './commands/chapter-register.js';
import { registerConstructionLoopCommands } from './commands/construction-loop-register.js';
import { taskListCommand } from './commands/task-list.js';
import { taskGraphCommand } from './commands/task-graph.js';
import { taskSearchCommand } from './commands/task-search.js';
import { taskReadCommand } from './commands/task-read.js';
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
import { registerObservationCommands } from './commands/observation-register.js';
import { directCommandAction, runDirectCommand, wrapCommand, type CommandContext } from './lib/command-wrapper.js';
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
  .action(directCommandAction<[Record<string, unknown>]>({
    command: 'task recommend',
    emit: emitCommandResult,
    format: (opts: Record<string, unknown>) => opts.format,
    invocation: (opts) => taskRecommendCommand({
      taskNumber: opts.task as string | undefined,
      agent: opts.agent as string | undefined,
      limit: opts.limit ? Number(opts.limit) : undefined,
      ignorePosture: opts.ignorePosture as boolean | undefined,
      full: opts.full as boolean | undefined,
      abstainedLimit: opts.abstainedLimit ? Number(opts.abstainedLimit) : undefined,
      cwd: opts.cwd as string | undefined,
      format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      verbose: opts.verbose as boolean | undefined,
    }),
  }));

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

registerPostureCommands(program);

registerTaskRosterCommands(taskCmd);

taskCmd
  .command('peek-next')
  .description('Non-mutating next-task inspection for an agent')
  .requiredOption('--agent <id>', 'Agent ID')
  .option('--format <fmt>', 'Output format: json or human', 'human')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(directCommandAction<[Record<string, unknown>]>({
    command: 'task peek-next',
    emit: emitCommandResult,
    format: (opts: Record<string, unknown>) => opts.format,
    invocation: (opts) => taskPeekNextCommand({
      agent: opts.agent as string,
      format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    }),
  }));

taskCmd
  .command('pull-next')
  .description('Mutating next-task pull: claim the best admissible task')
  .requiredOption('--agent <id>', 'Agent ID')
  .option('--format <fmt>', 'Output format: json or human', 'human')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(directCommandAction<[Record<string, unknown>]>({
    command: 'task pull-next',
    emit: emitCommandResult,
    format: (opts: Record<string, unknown>) => opts.format,
    invocation: (opts) => taskPullNextCommand({
      agent: opts.agent as string,
      format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    }),
  }));

taskCmd
  .command('work-next')
  .description('Execution packet for current task, or pull-next then packet')
  .requiredOption('--agent <id>', 'Agent ID')
  .option('--format <fmt>', 'Output format: json or human', 'human')
  .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
  .action(directCommandAction<[Record<string, unknown>]>({
    command: 'task work-next',
    emit: emitCommandResult,
    format: (opts: Record<string, unknown>) => opts.format,
    invocation: (opts) => taskWorkNextCommand({
      agent: opts.agent as string,
      format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      cwd: opts.cwd as string | undefined,
    }),
  }));

registerTaskDispatchCommands(taskCmd);

registerTaskEvidenceCommands(taskCmd);

registerTaskReconcileCommands(taskCmd);

registerObservationCommands(program);

registerChapterCommands(program);

registerConstructionLoopCommands(program);

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
