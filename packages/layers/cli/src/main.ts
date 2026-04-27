#!/usr/bin/env node
import { Command } from 'commander';
import { GroupedHelp } from './lib/grouped-help.js';
import { loadEnvFile } from '@narada2/control-plane';
import { registerRuntimeCoreCommands } from './commands/runtime-core-register.js';
import { registerProductUtilityCommands } from './commands/product-utility-register.js';
import { registerInspectionAdminCommands } from './commands/inspection-admin-register.js';
import { registerSitesCommands } from './commands/sites-register.js';
import { registerConsoleCommands } from './commands/console-register.js';
import { registerWorkbenchCommands } from './commands/workbench-register.js';
import { registerWorkNextCommands } from './commands/work-next-register.js';
import { registerPrincipalCommands } from './commands/principal-register.js';
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
import { registerInboxCommands } from './commands/inbox-register.js';
import { registerBackupCommands } from './commands/backup-register.js';
import { registerCleanupCommands } from './commands/cleanup-register.js';
import { registerRederivationCommands } from './commands/rederivation-register.js';
import { registerOutboundActionCommands } from './commands/outbound-action-register.js';
import { registerPostureCommands } from './commands/posture-register.js';

loadEnvFile('./.env');

const program = new Command();
program.createHelp = () => new GroupedHelp();

program
  .name('narada')
  .description('Narada CLI - deterministic state compiler and operation control')
  .version('1.0.0')
  .configureHelp({ sortSubcommands: false, helpWidth: 100 })
  .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
  .option('--log-level <level>', 'Log level: debug, info, warn, error', 'info')
  .option('--log-format <format>', 'Log format: pretty, json, or auto', 'auto')
  .option('--metrics-output <file>', 'Write metrics to file on exit')
  .hook('preAction', (thisCommand) => {
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

registerRuntimeCoreCommands(program);
registerProductUtilityCommands(program);
registerInspectionAdminCommands(program);
registerSitesCommands(program);
registerConsoleCommands(program);
registerWorkbenchCommands(program);
registerWorkNextCommands(program);
registerPrincipalCommands(program);

const taskCmd = program
  .command('task')
  .description('Task governance operators');
registerTaskLifecycleCommands(taskCmd);
registerTaskAuthoringCommands(taskCmd);
registerTaskOperationsCommands(taskCmd);
registerTaskRosterCommands(taskCmd);
registerTaskDispatchCommands(taskCmd);
registerTaskEvidenceCommands(taskCmd);
registerTaskReconcileCommands(taskCmd);

registerPostureCommands(program);
registerObservationCommands(program);
registerInboxCommands(program);
registerChapterCommands(program);
registerConstructionLoopCommands(program);
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
