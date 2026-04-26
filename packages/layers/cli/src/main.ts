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
import { registerBackupCommands } from './commands/backup-register.js';
import { registerCleanupCommands } from './commands/cleanup-register.js';
import { demoCommand } from './commands/demo.js';
import { uscInitCommand } from './commands/usc-init.js';
import { uscValidateCommand } from './commands/usc-validate.js';
import { registerRederivationCommands } from './commands/rederivation-register.js';
import { selectCommand } from './commands/select.js';
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
import { registerOutboundActionCommands } from './commands/outbound-action-register.js';
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
import { registerVerifyCommands } from './commands/verify-register.js';
import { registerCrossingCommands } from './commands/crossing-register.js';
import { registerTestRunCommands } from './commands/test-run-register.js';
import { registerCommandRunCommands } from './commands/command-run-register.js';
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

registerVerifyCommands(program);

registerCommandRunCommands(program);

registerTestRunCommands(program);

registerBackupCommands(program);

registerCleanupCommands(program);

registerRederivationCommands(program);

registerOutboundActionCommands(program);

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

registerCrossingCommands(program);

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
