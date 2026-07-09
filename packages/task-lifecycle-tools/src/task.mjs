import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HELP = String.raw`Narada task lifecycle CLI

Canonical forms:
  node tools/task-lifecycle/task.mjs help
  node tools/task-lifecycle/task.mjs doctor <site-root>
  node tools/task-lifecycle/task.mjs list <site-root> [--status <status>]
  node tools/task-lifecycle/task.mjs read <site-root> <task-number>
  node tools/task-lifecycle/task.mjs claim <site-root> <task-number> --agent <agent-id> [--reason <text>]
  node tools/task-lifecycle/task.mjs continue <site-root> <task-number> --agent <agent-id> [--reason <text>]
  node tools/task-lifecycle/task.mjs finish <site-root> <task-number> --agent <agent-id> [--summary <text>]
  node tools/task-lifecycle/task.mjs review <site-root> <task-number> --agent <agent-id> --verdict <accepted|accepted_with_notes|rejected> [--findings-file <path>] [--findings-json <json>]
  node tools/task-lifecycle/task.mjs inspect <site-root> [--task <task-number>|--table <table-name>|--tables]
  node tools/task-lifecycle/task.mjs migrate <site-root> <assignment-consistency|roster-sync|task-specs|task-roles|task-reports|orphaned-obligations|stale-review-obligations> [--dry-run]

Windows surface:
  .\narada-andrey.ps1 task
  .\narada-andrey.ps1 task-list -Status opened
  .\narada-andrey.ps1 task-read -TaskNumber 388
  .\narada-andrey.ps1 task-claim -TaskNumber 388 -Agent narada-andrey.Bob -Reason "operator authorized"
  .\narada-andrey.ps1 task-finish -TaskNumber 388 -Agent narada-andrey.Bob -Summary "done"
  .\narada-andrey.ps1 task-review -TaskNumber 388 -Agent narada-andrey.Kevin -Verdict accepted_with_notes -FindingsJson '[{"severity":"note","description":"Looks good.","location":"task body"}]'
  .\narada-andrey.ps1 task-inspect -TaskNumber 388
  .\narada-andrey.ps1 task-admin -Status --sql -Reason "SELECT status, COUNT(*) FROM task_lifecycle GROUP BY status"

Legacy aliases remain supported:
  node tools/task-lifecycle/task-list.mjs <site-root> [status]
  node tools/task-lifecycle/task-read.mjs <site-root> <task-number>
  node tools/task-lifecycle/task-claim.mjs <site-root> <task-number> <agent-id> [reason]
  node tools/task-lifecycle/task-continue.mjs <site-root> <task-number> <agent-id> [reason]
  node tools/task-lifecycle/task-finish.mjs <site-root> <task-number> <agent-id> [summary]
  node tools/task-lifecycle/task-review.mjs <site-root> <task-number> <reviewer> [verdict] [findings-json] [--findings-file <path>]
  node tools/task-lifecycle/task-admin.mjs <site-root> --sql|--eval|--file <arg>

Review findings JSON schema:
  [
    {
      "severity": "blocker|major|minor|note",
      "description": "Human-readable finding or review note.",
      "location": "Optional file, section, criterion, or authority boundary reference."
    }
  ]

Migration and doctor flows:
  node tools/task-lifecycle/task.mjs doctor <site-root>
  node tools/task-lifecycle/task.mjs migrate <site-root> assignment-consistency
  node tools/task-lifecycle/task.mjs migrate <site-root> roster-sync
  node tools/task-lifecycle/task.mjs migrate <site-root> task-specs
  node tools/task-lifecycle/task.mjs migrate <site-root> task-roles
  node tools/task-lifecycle/task.mjs migrate <site-root> task-reports
  node tools/task-lifecycle/task.mjs migrate <site-root> orphaned-obligations
  node tools/task-lifecycle/task.mjs migrate <site-root> stale-review-obligations

Agent posture:
  Agents must use task lifecycle MCP for lifecycle mutations. This dispatcher is for human/operator and compatibility surfaces; legacy mutating scripts still enforce the MCP guard when NARADA_AGENT_ID is set.
`;

const MIGRATIONS = new Map([
  ['assignment-consistency', 'migrate-assignment-consistency.mjs'],
  ['roster-sync', 'sync-roster.mjs'],
  ['task-specs', 'sync-task-specs.mjs'],
  ['task-roles', 'sync-task-roles.mjs'],
  ['task-reports', 'migrate-task-reports.mjs'],
  ['orphaned-obligations', 'migrate-orphaned-obligations.mjs'],
  ['stale-review-obligations', 'migrate-stale-review-obligations.mjs'],
]);

function printHelp() {
  console.log(HELP.trimEnd());
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function requireValue(value, message) {
  if (value === null || value === undefined || value === '') {
    console.error(message);
    process.exit(1);
  }
  return value;
}

function runScript(scriptName, args) {
  const result = runGovernedCommandSync(process.execPath, [resolve(__dirname, scriptName), ...args], {
    cwd: resolve(__dirname, '../..'),
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

function normalizeSiteRoot(value) {
  return value || process.cwd();
}

const [commandRaw, ...args] = process.argv.slice(2);
const command = commandRaw || 'help';

if (['help', '--help', '-h'].includes(command)) {
  printHelp();
  process.exit(0);
}

if (command === 'doctor') {
  const siteRoot = normalizeSiteRoot(args[0]);
  runScript('check-assignment-consistency.mjs', [siteRoot]);
}

if (command === 'list') {
  const siteRoot = normalizeSiteRoot(args[0]);
  const status = readFlag(args, '--status');
  runScript('task-list.mjs', status ? [siteRoot, status] : [siteRoot]);
}

if (command === 'read') {
  const siteRoot = normalizeSiteRoot(args[0]);
  const taskNumber = requireValue(args[1], 'task_number_required');
  runScript('task-read.mjs', [siteRoot, taskNumber]);
}

if (command === 'claim') {
  const siteRoot = normalizeSiteRoot(args[0]);
  const taskNumber = requireValue(args[1], 'task_number_required');
  const agent = requireValue(readFlag(args, '--agent'), 'agent_required: pass --agent <agent-id>');
  const reason = readFlag(args, '--reason');
  runScript('task-claim.mjs', reason ? [siteRoot, taskNumber, agent, reason] : [siteRoot, taskNumber, agent]);
}

if (command === 'continue') {
  const siteRoot = normalizeSiteRoot(args[0]);
  const taskNumber = requireValue(args[1], 'task_number_required');
  const agent = requireValue(readFlag(args, '--agent'), 'agent_required: pass --agent <agent-id>');
  const reason = readFlag(args, '--reason');
  runScript('task-continue.mjs', reason ? [siteRoot, taskNumber, agent, reason] : [siteRoot, taskNumber, agent]);
}

if (command === 'finish') {
  const siteRoot = normalizeSiteRoot(args[0]);
  const taskNumber = requireValue(args[1], 'task_number_required');
  const agent = requireValue(readFlag(args, '--agent'), 'agent_required: pass --agent <agent-id>');
  const summary = readFlag(args, '--summary');
  runScript('task-finish.mjs', summary ? [siteRoot, taskNumber, agent, summary] : [siteRoot, taskNumber, agent]);
}

if (command === 'review') {
  const siteRoot = normalizeSiteRoot(args[0]);
  const taskNumber = requireValue(args[1], 'task_number_required');
  const agent = requireValue(readFlag(args, '--agent'), 'agent_required: pass --agent <agent-id>');
  const verdict = requireValue(readFlag(args, '--verdict'), 'verdict_required: pass --verdict <accepted|accepted_with_notes|rejected>');
  const findingsFile = readFlag(args, '--findings-file');
  const findingsJson = readFlag(args, '--findings-json');
  if (findingsFile && findingsJson) {
    console.error('findings_source_conflict: use --findings-file or --findings-json, not both');
    process.exit(1);
  }
  const scriptArgs = findingsJson
    ? [siteRoot, taskNumber, agent, verdict, findingsJson]
    : [siteRoot, taskNumber, agent, '--verdict', verdict];
  if (findingsFile) scriptArgs.push('--findings-file', findingsFile);
  runScript('task-review.mjs', scriptArgs);
}

if (command === 'inspect') {
  const siteRoot = normalizeSiteRoot(args[0]);
  if (hasFlag(args, '--tables')) runScript('task-inspect.mjs', [siteRoot, '--tables']);
  const task = readFlag(args, '--task');
  if (task) runScript('task-inspect.mjs', [siteRoot, '--task', task]);
  const table = readFlag(args, '--table');
  if (table) runScript('task-inspect.mjs', [siteRoot, '--table', table]);
  runScript('task-inspect.mjs', [siteRoot, '--tables']);
}

if (command === 'migrate') {
  const siteRoot = normalizeSiteRoot(args[0]);
  const migration = requireValue(args[1], `migration_required: ${Array.from(MIGRATIONS.keys()).join(', ')}`);
  const scriptName = MIGRATIONS.get(migration);
  if (!scriptName) {
    console.error(`unknown_migration: ${migration}`);
    console.error(`known_migrations: ${Array.from(MIGRATIONS.keys()).join(', ')}`);
    process.exit(1);
  }
  const scriptArgs = [siteRoot];
  if (hasFlag(args, '--dry-run')) scriptArgs.push('--dry-run');
  runScript(scriptName, scriptArgs);
}

console.error(`unknown_task_command: ${command}`);
console.error('Run: node tools/task-lifecycle/task.mjs help');
process.exit(1);
