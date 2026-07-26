import { enforceMcpGuard } from './mcp-guard.js';
enforceMcpGuard(process.argv);

import { allocateTaskNumbers } from '@narada2/task-governance/task-governance';
import { renderTaskBodyFromSpec } from '@narada2/task-governance/task-spec';
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { existsSync, readFileSync } from 'fs';
import { writeFileUtf8, writeJsonFile } from '@narada2/site-common-tools/incubation/write-file-utf8.ts';
import { join, resolve } from 'path';

const cwd: any = process.argv[2] || process.cwd();

function parseArgs(argv: any) : any {
  const args: any = {};
  for (let i = 3; i < argv.length; i++) {
    const arg: any = argv[i];
    if (arg.startsWith('--')) {
      const key: any = arg.replace(/^--/, '').replace(/-/g, '_');
      const next: any = argv[i + 1];
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

function slugify(title: any) : any {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function todayYmd() : any {
  const d: any = new Date();
  const y: any = d.getFullYear();
  const m: any = String(d.getMonth() + 1).padStart(2, '0');
  const day: any = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const args: any = parseArgs(process.argv);

function readValidRoles(siteRoot: any) : any {
  const rosterPath: any = join(resolve(siteRoot), '.ai', 'agents', 'roster.json');
  if (!existsSync(rosterPath)) {
    return { ok: false, error: 'roster_not_found', valid_roles: [] };
  }
  try {
    const roster: any = JSON.parse(readFileSync(rosterPath, 'utf8'));
    const agents: any = Array.isArray(roster.agents) ? roster.agents : [];
    const roles: any = [...new Set(agents.map((a: any) : any => a.role).filter(Boolean))];
    return { ok: true, valid_roles: roles };
  } catch (e: any) {
    return { ok: false, error: `roster_parse_error: ${e.message}`, valid_roles: [] };
  }
}

let exitCode: any = 0;
MAIN: try {
  const title: any = args.title;
  if (!title) {
    const titleError: any = { status: 'error', error: 'title_required', message: '--title is required' };
    if (args.output_file) { writeJsonFile(args.output_file, titleError); }
    else { console.error(JSON.stringify(titleError, null, 2)); }
    exitCode = 1;
    break MAIN;
  }

  const goal: any = args.goal || title;
  const context: any = args.context || null;
  const requiredWork: any = args.required_work || '1. TBD';
  const nonGoals: any = args.non_goals || null;
  const preferredRole: any = args.preferred_role || null;
  const chapter: any = args.chapter || null;

  if (preferredRole && !args.skip_role_validation) {
    const roleCheck: any = readValidRoles(cwd);
    if (!roleCheck.ok) {
      const roleError: any = { status: 'error', error: roleCheck.error, message: 'Could not validate preferred_role against roster' };
      if (args.output_file) { writeJsonFile(args.output_file, roleError); }
      else { console.error(JSON.stringify(roleError, null, 2)); }
      exitCode = 1;
      break MAIN;
    }
    if (!roleCheck.valid_roles.includes(preferredRole)) {
      const roleError: any = {
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

  let acceptanceCriteria: any = ['TBD'];
  if (args.acceptance_criteria && args.acceptance_criteria_inline) {
    const conflictError: any = { status: 'error', error: 'acceptance_criteria_conflict', message: 'Use either --acceptance-criteria or --acceptance-criteria-inline, not both' };
    if (args.output_file) { writeJsonFile(args.output_file, conflictError); }
    else { console.error(JSON.stringify(conflictError, null, 2)); }
    exitCode = 1;
    break MAIN;
  }
  if (args.acceptance_criteria) {
    const acPath: any = args.acceptance_criteria;
    if (!existsSync(acPath)) {
      const acError: any = { status: 'error', error: 'acceptance_criteria_file_not_found', path: acPath };
      if (args.output_file) { writeJsonFile(args.output_file, acError); }
      else { console.error(JSON.stringify(acError, null, 2)); }
      exitCode = 1;
      break MAIN;
    }
    try {
      const acRaw: any = readFileSync(acPath, 'utf8');
      const acParsed: any = JSON.parse(acRaw);
      if (!Array.isArray(acParsed)) {
        const acTypeError: any = { status: 'error', error: 'acceptance_criteria_must_be_array' };
        if (args.output_file) { writeJsonFile(args.output_file, acTypeError); }
        else { console.error(JSON.stringify(acTypeError, null, 2)); }
        exitCode = 1;
        break MAIN;
      }
      acceptanceCriteria = acParsed;
    } catch (e: any) {
      const acJsonError: any = { status: 'error', error: 'invalid_acceptance_criteria_json', message: e.message };
      if (args.output_file) { writeJsonFile(args.output_file, acJsonError); }
      else { console.error(JSON.stringify(acJsonError, null, 2)); }
      exitCode = 1;
      break MAIN;
    }
  }
  if (args.acceptance_criteria_inline) {
    const raw: any = args.acceptance_criteria_inline.trim();
    let parsed: any = null;
    // Try JSON array first
    if (raw.startsWith('[')) {
      try {
        parsed = JSON.parse(raw);
      } catch (e: any) {
        const acJsonError: any = { status: 'error', error: 'invalid_acceptance_criteria_inline_json', message: e.message };
        if (args.output_file) { writeJsonFile(args.output_file, acJsonError); }
        else { console.error(JSON.stringify(acJsonError, null, 2)); }
        exitCode = 1;
        break MAIN;
      }
    } else {
      // Treat as comma-separated list
      parsed = raw.split(',').map((s: any) : any => s.trim()).filter((s: any) : any => s.length > 0);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const acTypeError: any = { status: 'error', error: 'acceptance_criteria_inline_must_be_non_empty_array' };
      if (args.output_file) { writeJsonFile(args.output_file, acTypeError); }
      else { console.error(JSON.stringify(acTypeError, null, 2)); }
      exitCode = 1;
      break MAIN;
    }
    acceptanceCriteria = parsed;
  }

  const taskNumber: any = (await allocateTaskNumbers(cwd, 1))[0];
  const slug: any = slugify(title);
  const taskId: any = `${todayYmd()}-${taskNumber}-${slug}`;
  const tasksDir: any = join(resolve(cwd), '.ai', 'do-not-open', 'tasks');
  const filePath: any = join(tasksDir, `${taskId}.md`);

  const body: any = renderTaskBodyFromSpec({
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

  const frontMatterLines: any = [
    '---',
    `number: ${taskNumber}`,
    `governed_by: ${preferredRole || 'unknown'}`,
    'status: opened',
  ];
  if (preferredRole) {
    frontMatterLines.push(`preferred_role: ${preferredRole}`);
  }
  frontMatterLines.push('---');

  const fileContent: any = `${frontMatterLines.join('\n')}\n${body}`;
  writeFileUtf8(filePath, fileContent);

  const now: any = new Date().toISOString();
  const store: any = openTaskLifecycleStore(cwd);
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

  const createPayload: any = {
    schema: 'narada.task.create.v0',
    status: 'created',
    task_number: taskNumber,
    task_id: taskId,
    file_path: filePath,
    title,
  };
  if (args.output_file) { writeJsonFile(args.output_file, createPayload); }
  else { console.log(JSON.stringify(createPayload, null, 2)); }
} catch (err: any) {
  const errPayload: any = { status: 'error', error: err.message, stack: err.stack };
  if (args.output_file) { writeJsonFile(args.output_file, errPayload); }
  else { console.error(JSON.stringify(errPayload, null, 2)); }
  exitCode = 1;
}
process.exit(exitCode);
