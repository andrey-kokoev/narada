import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import { type CliFormat } from '../lib/cli-output.js';
import { workNextCommand } from './work-next.js';
import { taskWorkboardCommand } from './task-workboard.js';
import { checkLawAdmission } from '../lib/law-sync.js';

export interface RoleLoopNextOptions {
  agent?: string;
  role?: string;
  cwd?: string;
  format?: CliFormat;
}

function gitLines(cwd: string, args: string[]): string[] {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function classifyDirtyPath(path: string): string {
  if (path.startsWith('.ai/do-not-open/tasks/')) return 'task_projection';
  if (path.startsWith('.ai/mutation-evidence/')) return 'mutation_evidence';
  if (path.startsWith('.ai/inbox') || path.startsWith('.ai/inbox-envelopes/')) return 'inbox';
  if (path.startsWith('docs/') || path === 'AGENTS.md' || path === 'SEMANTICS.md') return 'doctrine_or_docs';
  if (path.startsWith('packages/layers/cli/src/')) return 'cli_source';
  if (path.startsWith('packages/layers/cli/test/')) return 'cli_tests';
  return 'unknown';
}

function dirtyOwnership(cwd: string): Record<string, unknown> {
  const entries = gitLines(cwd, ['status', '--porcelain']).map((line) => ({
    status: line.slice(0, 2).trim(),
    path: line.slice(3),
  })).filter((entry) => entry.path);
  const groups = new Map<string, number>();
  for (const entry of entries) {
    const group = classifyDirtyPath(entry.path);
    groups.set(group, (groups.get(group) ?? 0) + 1);
  }
  return {
    dirty: entries.length > 0,
    count: entries.length,
    groups: Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b))),
    sample: entries.slice(0, 10),
    truncated: entries.length > 10,
  };
}

function compactWorkNext(result: unknown): Record<string, unknown> {
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  const primary = record.primary && typeof record.primary === 'object' ? record.primary as Record<string, unknown> : null;
  const architectLoop = record.architect_duty_loop && typeof record.architect_duty_loop === 'object'
    ? record.architect_duty_loop as Record<string, unknown>
    : null;
  const pendingReviews = Array.isArray(architectLoop?.pending_reviews) ? architectLoop.pending_reviews : [];
  return {
    status: record.status ?? 'unknown',
    action_kind: record.action_kind ?? null,
    task_number: primary?.task_number ?? null,
    envelope_id: primary?.envelope_id ?? null,
    reason: record.reason ?? null,
    next_step: record.next_step ?? null,
    pending_reviews_count: pendingReviews.length,
    checked: Array.isArray(record.checked) ? record.checked : [],
  };
}

function compactWorkboard(result: unknown): Record<string, unknown> {
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  const counts = record.counts && typeof record.counts === 'object' ? record.counts : {};
  return {
    counts,
    high_priority_diagnostics: Array.isArray(record.high_priority_diagnostics) ? record.high_priority_diagnostics : [],
    recommended_command: record.recommended_command ?? null,
  };
}

export async function roleLoopNextCommand(options: RoleLoopNextOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const agent = options.agent ?? options.role;
  if (!agent) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        reason: 'agent_or_role_required',
        error: 'Provide --agent <id> or --role <role>.',
      },
    };
  }

  const next = await workNextCommand({ cwd, agent, peek: true, format: 'json' });
  const workboard = await taskWorkboardCommand({ cwd, view: 'compact', includeGuidance: true, format: 'json' });
  const lawAdmission = await checkLawAdmission(cwd, agent, options.role);
  const compactNext = compactWorkNext(next.result);
  const compactBoard = compactWorkboard(workboard.result);
  const dirty = dirtyOwnership(cwd);
  const pendingLawNotices = lawAdmission.unread.map((change) => ({
    change_id: change.change_id,
    summary: change.summary,
    notice_envelope_id: change.notice_envelope_id,
    required_roles: change.required_roles,
    affected_agents: change.affected_agents,
    receipt_state: change.receipt_state,
    escalation_required: change.escalation_required,
    ack_command: `narada law ack ${change.change_id} --agent ${agent}${lawAdmission.role ? ` --role ${lawAdmission.role}` : ''} --status acknowledged`,
    absorb_command: `narada law ack ${change.change_id} --agent ${agent}${lawAdmission.role ? ` --role ${lawAdmission.role}` : ''} --status absorbed`,
    blocker_command: `narada law ack ${change.change_id} --agent ${agent}${lawAdmission.role ? ` --role ${lawAdmission.role}` : ''} --status blocked --questions-or-blockers <reason>`,
  }));
  const lawBlocks = pendingLawNotices.length > 0;

  return {
    exitCode: next.exitCode === ExitCode.SUCCESS ? ExitCode.SUCCESS : next.exitCode,
    result: {
      status: next.exitCode === ExitCode.SUCCESS ? 'success' : 'blocked',
      mutation_performed: false,
      schema: 'https://narada.dev/schemas/role-loop-next/v1',
      agent,
      role: options.role ?? null,
      mode: 'peek_compact',
      next: compactNext,
      workboard: compactBoard,
      dirty_ownership: dirty,
      pending_law_notices: pendingLawNotices,
      recommended_action: lawBlocks ? 'law_receipt_required' : compactNext.action_kind ?? 'inspect',
      recommended_command: lawBlocks
        ? `narada law unread --agent ${agent}${lawAdmission.role ? ` --role ${lawAdmission.role}` : ''} --format json`
        : compactNext.next_step ?? compactBoard.recommended_command ?? `narada work-next --agent ${agent} --peek --format json`,
      role_loop_contract: 'Operator nudge `next` means inspect current role duties, continue claimed work first, surface blockers/reviews/inbox next, and avoid full payload echo by default.',
    },
  };
}
