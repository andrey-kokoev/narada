#!/usr/bin/env node
/**
 * Get-BoundedWorkloopNext.mjs — Node.js prototype of the bounded workloop selector.
 *
 * Reads workboard + obligations + git status, applies policy rules, emits JSON.
 *
 * Usage:
 *   node Get-BoundedWorkloopNext.mjs [--agent <name>] [--limit <n>] [--user-site-root <path>]
 *     [--workboard-fixture <path>] [--git-status-fixture <path>] [--obligations-path <path>]
 *     [--before-mutation <none|review|commit|inbox|task_lifecycle>]
 *     [--intended-task-number <n>] [--mutation-path <path>]
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve, basename } from 'path';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';

function parseArgs(argv) {
  const args = {
    agent: 'narada-andrey.Bob',
    limit: 8,
    maxHumanLines: 18,
    maxHumanBytes: 2400,
    intendedTaskNumber: -1,
    beforeMutation: 'none',
    mutationPath: [],
    userSiteRoot: 'C:\\Users\\Andrey\\Narada',
    naradaCli: null,
    workboardFixturePath: null,
    gitStatusFixturePath: null,
    obligationsPath: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--agent': args.agent = argv[++i]; break;
      case '--limit': args.limit = parseInt(argv[++i], 10); break;
      case '--max-human-lines': args.maxHumanLines = parseInt(argv[++i], 10); break;
      case '--max-human-bytes': args.maxHumanBytes = parseInt(argv[++i], 10); break;
      case '--intended-task-number': args.intendedTaskNumber = parseInt(argv[++i], 10); break;
      case '--before-mutation': args.beforeMutation = argv[++i]; break;
      case '--mutation-path': args.mutationPath.push(argv[++i]); break;
      case '--user-site-root': args.userSiteRoot = resolve(argv[++i]); break;
      case '--narada-cli': args.naradaCli = argv[++i]; break;
      case '--workboard-fixture': args.workboardFixturePath = argv[++i]; break;
      case '--git-status-fixture': args.gitStatusFixturePath = argv[++i]; break;
      case '--obligations-path': args.obligationsPath = argv[++i]; break;
    }
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function getPropertyValue(obj, names) {
  if (obj == null) return null;
  for (const name of names) {
    if (name in obj) return obj[name];
  }
  return null;
}

function getTaskNumber(obj) {
  const value = getPropertyValue(obj, ['task_number', 'taskNumber', 'number', 'task']);
  if (value == null) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function readWorkboard(args) {
  if (args.workboardFixturePath) {
    return readJson(args.workboardFixturePath);
  }

  const scriptPath = join(args.userSiteRoot, 'tools', 'task-lifecycle', 'generate-workboard.mjs');
  if (existsSync(scriptPath)) {
    const result = runGovernedCommandSync(process.execPath, [scriptPath, args.userSiteRoot, String(args.limit), args.agent], {
      encoding: 'utf8',
      timeout: 15000,
    });
    if (result.status === 0) {
      try { return JSON.parse(result.stdout); } catch { /* fall through */ }
    }
  }

  const workboardPath = join(args.userSiteRoot, 'state', 'workboard.json');
  if (existsSync(workboardPath)) {
    return readJson(workboardPath);
  }

  return {
    pending_reviews: [],
    in_progress: [],
    local_followups: [],
    diagnostics: [{ kind: 'workboard_not_available', reason: 'Local task-lifecycle library not available and no workboard state found.' }],
  };
}

function readDirectedObligations(args, workboard) {
  const scriptPath = join(new URL('.', import.meta.url).pathname, 'Get-DirectedObligations.ps1');
  if (!existsSync(scriptPath)) {
    return { available: false, due_obligations: [], diagnostics: [{ kind: 'directed_obligation_reader_missing', path: scriptPath }] };
  }

  const psArgs = [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
    '-UserSiteRoot', args.userSiteRoot,
    '-IdentityName', args.agent,
    '-PassThru',
  ];
  if (args.obligationsPath) psArgs.push('-ObligationsPath', args.obligationsPath);
  if (args.workboardFixturePath) psArgs.push('-WorkboardFixturePath', args.workboardFixturePath);
  else psArgs.push('-WorkboardJson', JSON.stringify(workboard));

  const result = runGovernedCommandSync('pwsh', psArgs, { encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) {
    return { available: false, due_obligations: [], diagnostics: [{ kind: 'directed_obligation_read_failed', message: result.stderr }] };
  }
  try { return JSON.parse(result.stdout); } catch {
    return { available: false, due_obligations: [], diagnostics: [{ kind: 'directed_obligation_parse_failed', message: 'Invalid JSON from Get-DirectedObligations' }] };
  }
}

function convertDirectedObligationFact(obligation) {
  if (obligation == null) return null;
  const payload = getPropertyValue(obligation, ['payload']);
  const title = getPropertyValue(payload, ['summary', 'title']) || obligation.kind;
  return {
    obligation_id: String(obligation.obligation_id ?? ''),
    kind: String(obligation.kind ?? ''),
    task_number: getTaskNumber(obligation),
    title: String(title ?? ''),
    source: 'directed_obligations',
    target: obligation.target,
    dedupe_key: String(obligation.dedupe_key ?? ''),
    authority: obligation.authority,
  };
}

function getWorkboardFacts(workboard) {
  if (workboard.tasks) {
    const tasks = toArray(workboard.tasks);
    return {
      pending_reviews: tasks.filter(t => String(t.status) === 'in_review'),
      in_progress: tasks.filter(t => ['claimed', 'in_progress', 'needs_continuation'].includes(String(t.status))),
      local_followups: tasks.filter(t => String(t.status) === 'opened'),
      source_envelopes: [],
    };
  }
  return {
    pending_reviews: toArray(workboard.pending_reviews),
    in_progress: toArray(workboard.in_progress),
    local_followups: toArray(workboard.local_followups),
    source_envelopes: toArray(workboard.source_envelopes),
  };
}

function convertTaskFact(task) {
  if (task == null) return null;
  return {
    task_number: getTaskNumber(task),
    title: String(getPropertyValue(task, ['title', 'summary']) ?? ''),
    status: String(getPropertyValue(task, ['status']) ?? ''),
    chapter: String(getPropertyValue(task, ['chapter']) ?? ''),
    assigned_agent: String(getPropertyValue(task, ['assigned_agent', 'agent_id', 'assignee']) ?? ''),
    target_role: String(getPropertyValue(task, ['target_role']) ?? ''),
    preferred_agent_id: String(getPropertyValue(task, ['preferred_agent_id']) ?? ''),
  };
}

function readGitStatusLines(args) {
  if (args.gitStatusFixturePath) {
    return readFileSync(args.gitStatusFixturePath, 'utf8').split(/\r?\n/);
  }
  const result = runGovernedCommandSync('git', ['-C', args.userSiteRoot, 'status', '--porcelain=v1'], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new Error(`bounded_workloop_git_status_failed: ${result.stderr}`);
  return result.stdout.split(/\r?\n/);
}

function convertGitStatusLine(line) {
  if (!line || line.length < 4) return null;
  const status = line.substring(0, 2);
  let pathText = line.substring(3).trim();
  const arrowIdx = pathText.indexOf(' -> ');
  if (arrowIdx >= 0) pathText = pathText.substring(arrowIdx + 4);
  return { status, path: pathText.replace(/\\/g, '/') };
}

function findTaskFile(userSiteRoot, taskNumber) {
  const patterns = [
    join(userSiteRoot, '.ai', 'do-not-open', 'tasks', `*-${taskNumber}-*.md`),
    join(userSiteRoot, '.ai', 'tasks', `*-${taskNumber}-*.md`),
  ];
  for (const pattern of patterns) {
    // Simplified: in Node.js we'd use glob; here we approximate with a known path
    // For the prototype we skip exact glob matching
  }
  return null;
}

function getTaskNumberFromPath(path) {
  const m = path.match(/^\.ai\/(?:do-not-open\/)?tasks\/\d{8}-(\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

function testTaskMentionsPath(taskPath, dirtyPath) {
  if (!taskPath || !existsSync(taskPath)) return false;
  const text = readFileSync(taskPath, 'utf8');
  const normalized = dirtyPath.replace(/\\/g, '/');
  const base = basename(normalized);
  if (text.includes(normalized)) return true;
  if (base.length >= 12 && text.includes(base)) return true;
  return false;
}

function getDirtyFileFacts(args, activeTasks) {
  const taskByNumber = {};
  for (const task of activeTasks) {
    const num = getTaskNumber(task);
    if (num != null) taskByNumber[num] = task;
  }

  const facts = [];
  for (const line of readGitStatusLines(args)) {
    const entry = convertGitStatusLine(line);
    if (entry == null) continue;

    const likelyTasks = [];
    const pathTask = getTaskNumberFromPath(entry.path);
    if (pathTask != null) {
      const task = taskByNumber[pathTask];
      likelyTasks.push({ task_number: pathTask, owner: task ? getPropertyValue(task, ['assigned_agent', 'agent_id', 'assignee']) : null, reason: 'task_file_path' });
    }

    for (const taskNumber of Object.keys(taskByNumber).map(Number)) {
      if (pathTask === taskNumber) continue;
      const taskPath = findTaskFile(args.userSiteRoot, taskNumber);
      if (taskPath && testTaskMentionsPath(taskPath, entry.path)) {
        const task = taskByNumber[taskNumber];
        likelyTasks.push({ task_number: taskNumber, owner: getPropertyValue(task, ['assigned_agent', 'agent_id', 'assignee']), reason: 'task_mentions_path' });
      }
    }

    facts.push({
      path: entry.path,
      git_status: entry.status,
      likely_tasks: likelyTasks.slice(0, 4),
      ownership_posture: likelyTasks.length > 0 ? 'likely_owned' : 'unknown',
    });
  }
  return facts.slice(0, args.limit);
}

function checkCollaboratorOverlap(nextAction, dirtyFiles, currentAgent) {
  if (!nextAction.task_number) return { has_overlap: false, overlaps: [] };
  const overlaps = [];
  for (const file of dirtyFiles) {
    const relatedToNext = file.likely_tasks.some(t => t.task_number === nextAction.task_number);
    if (!relatedToNext) continue;
    const otherOwners = file.likely_tasks.filter(t =>
      t.task_number !== nextAction.task_number && t.owner && t.owner !== currentAgent
    );
    if (otherOwners.length > 0) {
      overlaps.push({
        path: file.path,
        other_owners: [...new Set(otherOwners.map(t => t.owner))],
        other_tasks: [...new Set(otherOwners.map(t => t.task_number))],
      });
    }
  }
  return { has_overlap: overlaps.length > 0, overlaps };
}

function getMutationPreflight(args, dirtyFiles) {
  const warnings = [];
  const blocking = [];
  const unknown = dirtyFiles.filter(f => f.ownership_posture === 'unknown');
  const normalizedMutationPaths = args.mutationPath.map(p => p.replace(/\\/g, '/').trim()).filter(Boolean);

  if (args.beforeMutation === 'none') {
    return {
      before_mutation: 'none',
      intended_task_number: args.intendedTaskNumber > 0 ? args.intendedTaskNumber : null,
      mutation_paths: normalizedMutationPaths,
      posture: 'observe_only',
      blocking_dirty_files: [],
      warnings: [],
    };
  }

  if (args.intendedTaskNumber <= 0) {
    warnings.push(`intended_task_number_missing_for_${args.beforeMutation}`);
  }

  for (const file of dirtyFiles) {
    const tasks = toArray(file.likely_tasks);
    if (tasks.length === 0) continue;
    let matchesIntended = false;
    for (const task of tasks) {
      if (args.intendedTaskNumber > 0 && task.task_number === args.intendedTaskNumber) {
        matchesIntended = true;
      }
    }
    if (!matchesIntended) {
      const included = normalizedMutationPaths.length === 0 || normalizedMutationPaths.some(mp => file.path === mp || file.path.startsWith(mp.replace(/\/$/, '') + '/'));
      if (included) {
        blocking.push({ path: file.path, git_status: file.git_status, likely_tasks: tasks });
      }
    }
  }

  if (unknown.length > 0) warnings.push(`unknown_dirty_ownership_count=${unknown.length}`);
  if (normalizedMutationPaths.length > 0) {
    const excluded = dirtyFiles.filter(f => !normalizedMutationPaths.some(mp => f.path === mp || f.path.startsWith(mp.replace(/\/$/, '') + '/')));
    if (excluded.length > 0) warnings.push(`dirty_files_excluded_from_mutation_count=${excluded.length}`);
  }

  const posture = blocking.length > 0 || args.intendedTaskNumber <= 0 ? 'refuse' : warnings.length > 0 ? 'warn' : 'safe';

  return {
    before_mutation: args.beforeMutation,
    intended_task_number: args.intendedTaskNumber > 0 ? args.intendedTaskNumber : null,
    mutation_paths: normalizedMutationPaths,
    posture,
    blocking_dirty_files: blocking,
    warnings,
  };
}

function newHumanSummary(args, facts, preflight, warnings) {
  const lines = [];
  const next = facts.next_action;
  lines.push(`Next: ${next.action}${next.task_number != null ? ' task #' + next.task_number : ''}`);
  if (next.title) lines.push(`Title: ${next.title}`);
  lines.push(`Workboard: ${facts.counts.pending_reviews} reviews, ${facts.counts.in_progress} in progress, ${facts.counts.local_followups} followups`);
  lines.push(`Dirty: ${facts.counts.dirty_files} files; mutation preflight: ${preflight.posture}`);
  for (const w of warnings) lines.push(`Warning: ${w}`);
  for (const file of facts.dirty_files.slice(0, 5)) {
    const owners = file.likely_tasks.map(t => `#${t.task_number}:${t.reason}`).join(',');
    lines.push(`Dirty ${file.git_status.trim()} ${file.path} ${owners ? '[' + owners + ']' : '[unknown]'}`);
  }

  const out = [];
  let byteCount = 0;
  for (const line of lines) {
    if (out.length >= args.maxHumanLines) break;
    const candidate = out.join('\n') + (out.length > 0 ? '\n' : '') + line;
    const candidateBytes = Buffer.byteLength(candidate, 'utf8');
    if (candidateBytes > args.maxHumanBytes) break;
    out.push(line);
    byteCount = candidateBytes;
  }
  return { lines: out, actual_lines: out.length, actual_bytes: byteCount, capped: out.length < lines.length };
}

function main() {
  const args = parseArgs(process.argv);
  if (!existsSync(args.userSiteRoot)) throw new Error(`user_site_root_missing: ${args.userSiteRoot}`);

  const workboard = readWorkboard(args);
  const directedObligationView = readDirectedObligations(args, workboard);
  const dueDirectedObligations = toArray(directedObligationView.due_obligations);
  const nextDirectedObligation = dueDirectedObligations.length > 0 ? convertDirectedObligationFact(dueDirectedObligations[0]) : null;

  const workboardFacts = getWorkboardFacts(workboard);
  const pendingReviews = toArray(workboardFacts.pending_reviews).map(convertTaskFact).filter(t => t.task_number != null)
    .sort((a, b) => (a.preferred_agent_id === args.agent ? 0 : 1) - (b.preferred_agent_id === args.agent ? 0 : 1))
    .slice(0, args.limit);
  const inProgress = toArray(workboardFacts.in_progress).map(convertTaskFact).filter(t => t.task_number != null)
    .sort((a, b) => (a.preferred_agent_id === args.agent ? 0 : 1) - (b.preferred_agent_id === args.agent ? 0 : 1))
    .slice(0, args.limit);
  const localFollowups = toArray(workboardFacts.local_followups).map(convertTaskFact).filter(t => t.task_number != null)
    .sort((a, b) => (a.preferred_agent_id === args.agent ? 0 : 1) - (b.preferred_agent_id === args.agent ? 0 : 1))
    .slice(0, args.limit);

  const activeRawTasks = [
    ...toArray(workboardFacts.pending_reviews),
    ...toArray(workboardFacts.in_progress),
    ...toArray(workboardFacts.local_followups),
  ];

  const mine = inProgress.filter(t => t.assigned_agent === args.agent || t.task_number === args.intendedTaskNumber).slice(0, 1);

  let nextAction;
  if (nextDirectedObligation) {
    nextAction = { action: 'directed_obligation', task_number: nextDirectedObligation.task_number, title: nextDirectedObligation.title, source: 'directed_obligations', obligation_id: nextDirectedObligation.obligation_id, kind: nextDirectedObligation.kind };
  } else if (mine.length > 0) {
    nextAction = { action: 'continue', task_number: mine[0].task_number, title: mine[0].title, source: 'in_progress' };
  } else if (pendingReviews.length > 0) {
    nextAction = { action: 'review', task_number: pendingReviews[0].task_number, title: pendingReviews[0].title, source: 'pending_review' };
  } else if (inProgress.length > 0) {
    nextAction = { action: 'inspect_in_progress', task_number: inProgress[0].task_number, title: inProgress[0].title, source: 'in_progress' };
  } else if (localFollowups.length > 0) {
    nextAction = { action: 'inspect', task_number: localFollowups[0].task_number, title: localFollowups[0].title, source: 'local_followup' };
  } else {
    nextAction = { action: 'idle', task_number: null, title: null, source: 'workboard_empty' };
  }

  const dirtyFiles = getDirtyFileFacts(args, activeRawTasks).slice(0, args.limit);
  const preflight = getMutationPreflight(args, dirtyFiles);
  const overlapCheck = checkCollaboratorOverlap(nextAction, dirtyFiles, args.agent);
  const warnings = [...preflight.warnings];
  if (preflight.posture === 'refuse') warnings.push(`dirty_ownership_blocks_${args.beforeMutation}`);
  if (overlapCheck.has_overlap) {
    warnings.push(`collaborator_dirty_overlap_task_${nextAction.task_number}`);
    for (const o of overlapCheck.overlaps.slice(0, 3)) {
      warnings.push(`overlap_${o.path}_owned_by_${o.other_owners.join(',')}`);
    }
  }

  const facts = {
    next_action: nextAction,
    counts: {
      pending_reviews: pendingReviews.length,
      in_progress: inProgress.length,
      local_followups: localFollowups.length,
      directed_obligations: dueDirectedObligations.length,
      dirty_files: dirtyFiles.length,
    },
    directed_obligations: dueDirectedObligations.map(convertDirectedObligationFact).slice(0, 3),
    pending_reviews: pendingReviews.slice(0, 3),
    in_progress: inProgress.slice(0, 3),
    local_followups: localFollowups.slice(0, 3),
    dirty_files: dirtyFiles,
  };

  const summary = newHumanSummary(args, facts, preflight, warnings);

  const result = {
    schema: 'narada.operator_surfaces.bounded_workloop_next.v0',
    generated_at: new Date().toISOString(),
    agent: args.agent,
    status: preflight.posture === 'refuse' ? 'blocked' : warnings.length > 0 ? 'warning' : 'ok',
    output_budget: {
      max_human_lines: args.maxHumanLines,
      max_human_bytes: args.maxHumanBytes,
      actual_human_lines: summary.actual_lines,
      actual_human_bytes: summary.actual_bytes,
      capped: summary.capped,
    },
    facts,
    warnings,
    diagnostics: {
      workboard_source: args.workboardFixturePath ? 'fixture' : existsSync(join(args.userSiteRoot, 'tools', 'task-lifecycle', 'generate-workboard.mjs')) ? 'task_lifecycle_lib' : existsSync(join(args.userSiteRoot, 'state', 'workboard.json')) ? 'local_state' : 'unavailable',
      git_status_source: args.gitStatusFixturePath ? 'fixture' : 'git_status',
      directed_obligation_source: directedObligationView.source_path ?? 'unavailable',
      limit: args.limit,
      machine_output_shape: 'facts_warnings_diagnostics_separated',
    },
    mutation_preflight: preflight,
    human_summary: summary.lines,
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
