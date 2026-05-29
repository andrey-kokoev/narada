import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { allocateTaskNumbers } from '@narada2/task-governance/task-governance';
import { renderTaskBodyFromSpec } from '@narada2/task-governance/task-spec';
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { existsSync, readFileSync } from 'fs';
import { writeFileUtf8, writeJsonFile } from '../incubation/write-file-utf8.mjs';
import { join, resolve } from 'path';

const cwd = process.argv[2] || process.cwd();

function parseArgs(argv) {
  const args = {};
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '').replace(/-/g, '_');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const args = parseArgs(process.argv);

function readValidRoles(siteRoot) {
  const rosterPath = join(resolve(siteRoot), '.ai', 'agents', 'roster.json');
  if (!existsSync(rosterPath)) {
    return { ok: false, error: 'roster_not_found', valid_roles: [] };
  }
  try {
    const roster = JSON.parse(readFileSync(rosterPath, 'utf8'));
    const agents = Array.isArray(roster.agents) ? roster.agents : [];
    const roles = [...new Set(agents.map((a) => a.role).filter(Boolean))];
    return { ok: true, valid_roles: roles };
  } catch (e) {
    return { ok: false, error: `roster_parse_error: ${e.message}`, valid_roles: [] };
  }
}

let exitCode = 0;
MAIN: try {
  const title = args.title;
  if (!title) {
    const titleError = { status: 'error', error: 'title_required', message: '--title is required' };
    if (args.output_file) { writeJsonFile(args.output_file, titleError); }
    else { console.error(JSON.stringify(titleError, null, 2)); }
    exitCode = 1;
    break MAIN;
  }

  const goal = args.goal || title;
  const context = args.context || null;
  const requiredWork = args.required_work || '1. TBD';
  const nonGoals = args.non_goals || null;
  const preferredRole = args.preferred_role || null;
  const chapter = args.chapter || null;

  if (preferredRole && !args.skip_role_validation) {
    const roleCheck = readValidRoles(cwd);
    if (!roleCheck.ok) {
      const roleError = { status: 'error', error: roleCheck.error, message: 'Could not validate preferred_role against roster' };
      if (args.output_file) { writeJsonFile(args.output_file, roleError); }
      else { console.error(JSON.stringify(roleError, null, 2)); }
      exitCode = 1;
      break MAIN;
    }
    if (!roleCheck.valid_roles.includes(preferredRole)) {
      const roleError = {
        status: 'error',
        error: 'invalid_preferred_role',
        message: `preferred_role '${preferredRole}' is not in roster. Valid roles: ${roleCheck.valid_roles.join(', ')}`,
        valid_roles: roleCheck.valid_roles,
      };
      if (args.output_file) { writeJsonFile(args.output_file, roleError); }
      else { console.error(JSON.stringify(roleError, null, 2)); }
      exitCode = 1;
      break MAIN;
    }
  }

  let acceptanceCriteria = ['TBD'];
  if (args.acceptance_criteria && args.acceptance_criteria_inline) {
    const conflictError = { status: 'error', error: 'acceptance_criteria_conflict', message: 'Use either --acceptance-criteria or --acceptance-criteria-inline, not both' };
    if (args.output_file) { writeJsonFile(args.output_file, conflictError); }
    else { console.error(JSON.stringify(conflictError, null, 2)); }
    exitCode = 1;
    break MAIN;
  }
  if (args.acceptance_criteria) {
    const acPath = args.acceptance_criteria;
    if (!existsSync(acPath)) {
      const acError = { status: 'error', error: 'acceptance_criteria_file_not_found', path: acPath };
      if (args.output_file) { writeJsonFile(args.output_file, acError); }
      else { console.error(JSON.stringify(acError, null, 2)); }
      exitCode = 1;
      break MAIN;
    }
    try {
      const acRaw = readFileSync(acPath, 'utf8');
      const acParsed = JSON.parse(acRaw);
      if (!Array.isArray(acParsed)) {
        const acTypeError = { status: 'error', error: 'acceptance_criteria_must_be_array' };
        if (args.output_file) { writeJsonFile(args.output_file, acTypeError); }
        else { console.error(JSON.stringify(acTypeError, null, 2)); }
        exitCode = 1;
        break MAIN;
      }
      acceptanceCriteria = acParsed;
    } catch (e) {
      const acJsonError = { status: 'error', error: 'invalid_acceptance_criteria_json', message: e.message };
      if (args.output_file) { writeJsonFile(args.output_file, acJsonError); }
      else { console.error(JSON.stringify(acJsonError, null, 2)); }
      exitCode = 1;
      break MAIN;
    }
  }
  if (args.acceptance_criteria_inline) {
    const raw = args.acceptance_criteria_inline.trim();
    let parsed = null;
    // Try JSON array first
    if (raw.startsWith('[')) {
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        const acJsonError = { status: 'error', error: 'invalid_acceptance_criteria_inline_json', message: e.message };
        if (args.output_file) { writeJsonFile(args.output_file, acJsonError); }
        else { console.error(JSON.stringify(acJsonError, null, 2)); }
        exitCode = 1;
        break MAIN;
      }
    } else {
      // Treat as comma-separated list
      parsed = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const acTypeError = { status: 'error', error: 'acceptance_criteria_inline_must_be_non_empty_array' };
      if (args.output_file) { writeJsonFile(args.output_file, acTypeError); }
      else { console.error(JSON.stringify(acTypeError, null, 2)); }
      exitCode = 1;
      break MAIN;
    }
    acceptanceCriteria = parsed;
  }

  const taskNumber = (await allocateTaskNumbers(cwd, 1))[0];
  const slug = slugify(title);
  const taskId = `${todayYmd()}-${taskNumber}-${slug}`;
  const tasksDir = join(resolve(cwd), '.ai', 'do-not-open', 'tasks');
  const filePath = join(tasksDir, `${taskId}.md`);

  const body = renderTaskBodyFromSpec({
    spec: {
      title,
      chapter,
      goal,
      context,
      required_work: requiredWork,
      non_goals: nonGoals,
      acceptance_criteria: acceptanceCriteria,
    },
    executionNotes: null,
    verification: null,
  });

  const frontMatterLines = [
    '---',
    `number: ${taskNumber}`,
    `governed_by: ${preferredRole || 'unknown'}`,
    'status: opened',
  ];
  if (preferredRole) {
    frontMatterLines.push(`preferred_role: ${preferredRole}`);
  }
  frontMatterLines.push('---');

  const fileContent = `${frontMatterLines.join('\n')}\n${body}`;
  writeFileUtf8(filePath, fileContent);

  const now = new Date().toISOString();
  const store = openTaskLifecycleStore(cwd);
  try {
    store.upsertLifecycle({
      task_id: taskId,
      task_number: taskNumber,
      status: 'opened',
      governed_by: preferredRole || null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: now,
    });
    store.upsertTaskSpec({
      task_id: taskId,
      task_number: taskNumber,
      title,
      chapter_markdown: chapter,
      goal_markdown: goal,
      context_markdown: context,
      required_work_markdown: requiredWork,
      non_goals_markdown: nonGoals,
      acceptance_criteria_json: JSON.stringify(acceptanceCriteria),
      dependencies_json: '[]',
      updated_at: now,
    });
  } finally {
    store.db.close();
  }

  const createPayload = {
    schema: 'narada.task.create.v0',
    status: 'created',
    task_number: taskNumber,
    task_id: taskId,
    file_path: filePath,
    title,
  };
  if (args.output_file) { writeJsonFile(args.output_file, createPayload); }
  else { console.log(JSON.stringify(createPayload, null, 2)); }
} catch (err) {
  const errPayload = { status: 'error', error: err.message, stack: err.stack };
  if (args.output_file) { writeJsonFile(args.output_file, errPayload); }
  else { console.error(JSON.stringify(errPayload, null, 2)); }
  exitCode = 1;
}
process.exit(exitCode);
