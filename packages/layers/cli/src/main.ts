#!/usr/bin/env node
import { Command, Help } from 'commander';
import { GroupedHelp } from './lib/grouped-help.js';
import { loadEnvFile } from '@narada2/control-plane';

loadEnvFile('./.env');
import { registerRuntimeCoreCommands } from './commands/runtime-core-register.js';
import { registerProductUtilityCommands } from './commands/product-utility-register.js';
import { registerInspectionAdminCommands } from './commands/inspection-admin-register.js';
import { registerSitesCommands } from './commands/sites-register.js';
import { registerConsoleCommands } from './commands/console-register.js';
import { registerWorkbenchCommands } from './commands/workbench-register.js';
import { registerBackupCommands } from './commands/backup-register.js';
import { registerCleanupCommands } from './commands/cleanup-register.js';
import { registerRederivationCommands } from './commands/rederivation-register.js';
import { registerPrincipalCommands } from './commands/principal-register.js';
import { registerOutboundActionCommands } from './commands/outbound-action-register.js';
import { registerPostureCommands } from './commands/posture-register.js';
import { registerTaskAuthoringCommands } from './commands/task-authoring-register.js';
import { registerTaskLifecycleCommands } from './commands/task-lifecycle-register.js';
import { registerTaskRosterCommands } from './commands/task-roster-register.js';
import { registerTaskEvidenceCommands } from './commands/task-evidence-register.js';
import { registerTaskDispatchCommands } from './commands/task-dispatch-register.js';
import { registerTaskReconcileCommands } from './commands/task-reconcile-register.js';
import { registerTaskOperationsCommands } from './commands/task-operations-register.js';
import { registerChapterCommands } from './commands/chapter-register.js';
import { registerConstructionLoopCommands } from './commands/construction-loop-register.js';
import { registerVerifyCommands } from './commands/verify-register.js';
import { registerCrossingCommands } from './commands/crossing-register.js';
import { registerTestRunCommands } from './commands/test-run-register.js';
import { registerCommandRunCommands } from './commands/command-run-register.js';
import { registerObservationCommands } from './commands/observation-register.js';
import { registerOpsKitCommands } from './commands/ops-kit-register.js';

const program = new Command();
program.createHelp = () => new GroupedHelp();

program
  .name('narada')
  .description('Narada CLI — deterministic state compiler and operation control')
  .version('1.0.0')
  .configureHelp({ sortSubcommands: false, helpWidth: 100 })
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--log-format <format>', 'Log format: pretty, json, or auto', 'auto')
  .option('--metrics-output <file>', 'Write metrics to file on exit')
  .hook('preAction', (thisCommand) => {
    // Store format in environment for commands to access
    const opts = thisCommand.opts();
    if (opts.format && !(opts.format === 'auto' && process.env.OUTPUT_FORMAT)) {
      process.env.OUTPUT_FORMAT = opts.format;
    command: 'task amend',
    emit: emitCommandResult,
    format: (_taskNumber: string, opts: Record<string, unknown>) => opts.format,
    invocation: (taskNumber, opts) => taskAmendCommand({
      taskNumber,
      by: opts.by as string,
      title: opts.title as string | undefined,
      goal: opts.goal as string | undefined,
      context: opts.context as string | undefined,
      requiredWork: opts.requiredWork as string | undefined,
      nonGoals: opts.nonGoals as string | undefined,
      criteria: opts.criteria ? String(opts.criteria).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
      appendCriteria: opts.appendCriteria ? String(opts.appendCriteria).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
      checkAllCriteria: opts.checkAllCriteria as boolean | undefined,
      dependsOn: opts.dependsOn ? String(opts.dependsOn).split(',').map((s: string) => Number(s.trim())).filter((n: number) => Number.isFinite(n)) : undefined,
      fromFile: opts.fromFile as string | undefined,
      format: resolveCommandFormat(opts.format, 'auto'),
      cwd: opts.cwd as string | undefined,
    }),
  }));

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
  .action(directCommandAction<[Record<string, unknown>]>({
    command: 'task promote-recommendation',
    emit: emitCommandResult,
    format: (opts: Record<string, unknown>) => opts.format,
    invocation: (opts) => taskPromoteRecommendationCommand({
      cwd: opts.cwd as string | undefined,
      format: opts.format as 'json' | 'human' | 'auto',
      taskNumber: opts.task as string | undefined,
      agent: opts.agent as string | undefined,
      by: opts.by as string | undefined,
      recommendationId: opts.recommendationId as string | undefined,
      overrideRisk: opts.overrideRisk as string | undefined,
      dryRun: opts.dryRun as boolean,
    }),
  }));

registerVerifyCommands(program);

registerCommandRunCommands(program);

registerTestRunCommands(program);

registerBackupCommands(program);

registerCleanupCommands(program);

registerRederivationCommands(program);

registerOutboundActionCommands(program);

registerCrossingCommands(program);

registerOpsKitCommands(program);

program.parse();
