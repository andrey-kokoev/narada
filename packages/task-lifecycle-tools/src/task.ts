import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';

const __dirname: any = dirname(fileURLToPath(import.meta.url));

const HELP: any = String.raw`Narada task lifecycle CLI

Canonical forms:
  node tools/task-lifecycle/task.ts help
  node tools/task-lifecycle/task.ts doctor <site-root>
  node tools/task-lifecycle/task.ts list <site-root> [--status <status>]
  node tools/task-lifecycle/task.ts read <site-root> <task-number>
  node tools/task-lifecycle/task.ts claim <site-root> <task-number> --agent <agent-id> [--reason <text>]
  node tools/task-lifecycle/task.ts continue <site-root> <task-number> --agent <agent-id> [--reason <text>]
  node tools/task-lifecycle/task.ts finish <site-root> <task-number> --agent <agent-id> [--summary <text>]
  node tools/task-lifecycle/task.ts review <site-root> <task-number> --agent <agent-id> --verdict <accepted|accepted_with_notes|rejected> [--findings-file <path>] [--findings-json <json>]
  node tools/task-lifecycle/task.ts inspect <site-root> [--task <task-number>|--table <table-name>|--tables]
  node tools/task-lifecycle/task.ts migrate <site-root> <assignment-consistency|roster-sync|task-specs|task-roles|task-reports|orphaned-obligations|stale-review-obligations> [--dry-run]

Windows surface:
  .\andrey-user.ps1 task
  .\andrey-user.ps1 task-list -Status opened
  .\andrey-user.ps1 task-read -TaskNumber 388
  .\andrey-user.ps1 task-claim -TaskNumber 388 -Agent andrey-user.Bob -Reason "operator authorized"
  .\andrey-user.ps1 task-finish -TaskNumber 388 -Agent andrey-user.Bob -Summary "done"
  .\andrey-user.ps1 task-review -TaskNumber 388 -Agent andrey-user.Kevin -Verdict accepted_with_notes -FindingsJson '[{"severity":"note","description":"Looks good.","location":"task body"}]'
  .\andrey-user.ps1 task-inspect -TaskNumber 388
  .\andrey-user.ps1 task-admin -Status --sql -Reason "SELECT status, COUNT(*) FROM task_lifecycle GROUP BY status"

Legacy aliases remain supported:
  node tools/task-lifecycle/task-list.ts <site-root> [status]
  node tools/task-lifecycle/task-read.ts <site-root> <task-number>
  node tools/task-lifecycle/task-claim.ts <site-root> <task-number> <agent-id> [reason]
  node tools/task-lifecycle/task-continue.ts <site-root> <task-number> <agent-id> [reason]
  node tools/task-lifecycle/task-finish.ts <site-root> <task-number> <agent-id> [summary]
  node tools/task-lifecycle/task-review.ts <site-root> <task-number> <reviewer> [verdict] [findings-json] [--findings-file <path>]
  node tools/task-lifecycle/task-admin.ts <site-root> --sql|--eval|--file <arg>

Review findings JSON schema:
  [
    {
      "severity": "blocker|major|minor|note",
      "description": "Human-readable finding or review note.",
      "location": "Optional file, section, criterion, or authority boundary reference."
    }
  ]

Migration and doctor flows:
  node tools/task-lifecycle/task.ts doctor <site-root>
  node tools/task-lifecycle/task.ts migrate <site-root> assignment-consistency
  node tools/task-lifecycle/task.ts migrate <site-root> roster-sync
  node tools/task-lifecycle/task.ts migrate <site-root> task-specs
  node tools/task-lifecycle/task.ts migrate <site-root> task-roles
  node tools/task-lifecycle/task.ts migrate <site-root> task-reports
  node tools/task-lifecycle/task.ts migrate <site-root> orphaned-obligations
  node tools/task-lifecycle/task.ts migrate <site-root> stale-review-obligations

Agent posture:
  Agents must use task lifecycle MCP for lifecycle mutations. This dispatcher is for human/operator and compatibility surfaces; legacy mutating scripts still enforce the MCP guard when NARADA_AGENT_ID is set.
`;

const MIGRATIONS: any = new Map([
  ['assignment-consistency', 'migrate-assignment-consistency.ts'],
  ['roster-sync', 'sync-roster.ts'],
  ['task-specs', 'sync-task-specs.ts'],
  ['task-roles', 'sync-task-roles.ts'],
  ['task-reports', 'migrate-task-reports.ts'],
  ['orphaned-obligations', 'migrate-orphaned-obligations.ts'],
  ['stale-review-obligations', 'migrate-stale-review-obligations.ts'],
]);

function printHelp() : any {
  console.log(HELP.trimEnd());
}

function readFlag(args: any, name: any) : any {
  const index: any = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function hasFlag(args: any, name: any) : any {
  return args.includes(name);
}

function requireValue(value: any, message: any) : any {
  if (value === null || value === undefined || value === '') {
    console.error(message);
    process.exit(1);
  }
  return value;
}

function runScript(scriptName: any, args: any) : any {
  const result: any = runGovernedCommandSync(process.execPath, [resolve(__dirname, scriptName), ...args], {
    cwd: resolve(__dirname, '../..'),
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

function normalizeSiteRoot(value: any) : any {
  return value || process.cwd();
}

const [commandRaw, ...args]: any = process.argv.slice(2);
const command: any = commandRaw || 'help';

if (['help', '--help', '-h'].includes(command)) {
  printHelp();
  process.exit(0);
}

if (command === 'doctor') {
  const siteRoot: any = normalizeSiteRoot(args[0]);
  runScript('check-assignment-consistency.ts', [siteRoot]);
}

if (command === 'list') {
  const siteRoot: any = normalizeSiteRoot(args[0]);
  const status: any = readFlag(args, '--status');
  runScript('task-list.ts', status ? [siteRoot, status] : [siteRoot]);
}

if (command === 'read') {
  const siteRoot: any = normalizeSiteRoot(args[0]);
  const taskNumber: any = requireValue(args[1], 'task_number_required');
  runScript('task-read.ts', [siteRoot, taskNumber]);
}

if (command === 'claim') {
  const siteRoot: any = normalizeSiteRoot(args[0]);
  const taskNumber: any = requireValue(args[1], 'task_number_required');
  const agent: any = requireValue(readFlag(args, '--agent'), 'agent_required: pass --agent <agent-id>');
  const reason: any = readFlag(args, '--reason');
  runScript('task-claim.ts', reason ? [siteRoot, taskNumber, agent, reason] : [siteRoot, taskNumber, agent]);
}

if (command === 'continue') {
  const siteRoot: any = normalizeSiteRoot(args[0]);
  const taskNumber: any = requireValue(args[1], 'task_number_required');
  const agent: any = requireValue(readFlag(args, '--agent'), 'agent_required: pass --agent <agent-id>');
  const reason: any = readFlag(args, '--reason');
  runScript('task-continue.ts', reason ? [siteRoot, taskNumber, agent, reason] : [siteRoot, taskNumber, agent]);
}

if (command === 'finish') {
  const siteRoot: any = normalizeSiteRoot(args[0]);
  const taskNumber: any = requireValue(args[1], 'task_number_required');
  const agent: any = requireValue(readFlag(args, '--agent'), 'agent_required: pass --agent <agent-id>');
  const summary: any = readFlag(args, '--summary');
  runScript('task-finish.ts', summary ? [siteRoot, taskNumber, agent, summary] : [siteRoot, taskNumber, agent]);
}

if (command === 'review') {
  const siteRoot: any = normalizeSiteRoot(args[0]);
  const taskNumber: any = requireValue(args[1], 'task_number_required');
  const agent: any = requireValue(readFlag(args, '--agent'), 'agent_required: pass --agent <agent-id>');
  const verdict: any = requireValue(readFlag(args, '--verdict'), 'verdict_required: pass --verdict <accepted|accepted_with_notes|rejected>');
  const findingsFile: any = readFlag(args, '--findings-file');
  const findingsJson: any = readFlag(args, '--findings-json');
  if (findingsFile && findingsJson) {
    console.error('findings_source_conflict: use --findings-file or --findings-json, not both');
    process.exit(1);
  }
  const scriptArgs: any = findingsJson
    ? [siteRoot, taskNumber, agent, verdict, findingsJson]
    : [siteRoot, taskNumber, agent, '--verdict', verdict];
  if (findingsFile) scriptArgs.push('--findings-file', findingsFile);
  runScript('task-review.ts', scriptArgs);
}

if (command === 'inspect') {
  const siteRoot: any = normalizeSiteRoot(args[0]);
  if (hasFlag(args, '--tables')) runScript('task-inspect.ts', [siteRoot, '--tables']);
  const task: any = readFlag(args, '--task');
  if (task) runScript('task-inspect.ts', [siteRoot, '--task', task]);
  const table: any = readFlag(args, '--table');
  if (table) runScript('task-inspect.ts', [siteRoot, '--table', table]);
  runScript('task-inspect.ts', [siteRoot, '--tables']);
}

if (command === 'migrate') {
  const siteRoot: any = normalizeSiteRoot(args[0]);
  const migration: any = requireValue(args[1], `migration_required: ${Array.from(MIGRATIONS.keys()).join(', ')}`);
  const scriptName: any = MIGRATIONS.get(migration);
  if (!scriptName) {
    console.error(`unknown_migration: ${migration}`);
    console.error(`known_migrations: ${Array.from(MIGRATIONS.keys()).join(', ')}`);
    process.exit(1);
  }
  const scriptArgs: any = [siteRoot];
  if (hasFlag(args, '--dry-run')) scriptArgs.push('--dry-run');
  runScript(scriptName, scriptArgs);
}

console.error(`unknown_task_command: ${command}`);
console.error('Run: node tools/task-lifecycle/task.ts help');
process.exit(1);
