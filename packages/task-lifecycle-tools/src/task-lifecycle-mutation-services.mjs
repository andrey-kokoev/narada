import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'node:fs';
import { findTaskFile, readTaskFile, writeTaskProjection, isValidTransition } from '@narada2/task-governance/task-governance';
import { admitTaskEvidence } from '@narada2/task-governance/evidence-admission';
import { deriveClosureAuthority } from './closure-authority.mjs';

export async function claimLifecycleTask({ siteRoot, store, taskNumber, agentId }) {
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
  const closureAuthority = deriveClosureAuthority(lifecycle);
  if (closureAuthority.closure_dominates) {
    return {
      status: 'closure_authority_blocks_claim',
      task_number: taskNumber,
      task_id: lifecycle.task_id,
      closure_authority: closureAuthority,
      remediation: 'Use a valid reopen/continue transition before claiming this task.',
    };
  }
  const existing = store.getActiveAssignment(lifecycle.task_id);
  if (existing) return { status: 'already_claimed', assignment: existing, lifecycle };

  const assignmentId = `assign-${randomUUID()}`;
  store.insertAssignment({
    assignment_id: assignmentId,
    task_id: lifecycle.task_id,
    agent_id: agentId,
    claimed_at: new Date().toISOString(),
    released_at: null,
    release_reason: null,
    intent: 'primary',
  });
  store.updateStatus(lifecycle.task_id, 'claimed', agentId, {});
  await writeTaskStatusProjection(siteRoot, taskNumber, 'claimed');
  return { status: 'claimed', assignment_id: assignmentId, task_number: taskNumber, lifecycle };
}

export async function unclaimLifecycleTask({ siteRoot, store, taskNumber, agentId, reason }) {
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
  const existing = store.getActiveAssignment(lifecycle.task_id);
  if (!existing) return { status: 'not_claimed', task_number: taskNumber };
  if (agentId && existing.agent_id !== agentId) return { status: 'claimed_by_other', claimed_by: existing.agent_id };
  const closureAuthority = deriveClosureAuthority(lifecycle);
  if (closureAuthority.closure_dominates) {
    return {
      status: 'closure_authority_blocks_unclaim',
      task_number: taskNumber,
      task_id: lifecycle.task_id,
      closure_authority: closureAuthority,
      remediation: 'Use a valid reopen transition before releasing a stale active assignment into opened state.',
    };
  }

  store.releaseAssignment(existing.assignment_id, reason ?? 'mcp_unclaim');
  store.updateStatus(lifecycle.task_id, 'opened', agentId ?? existing.agent_id, {});
  await writeTaskStatusProjection(siteRoot, taskNumber, 'opened');
  return { status: 'unclaimed', task_number: taskNumber, previous_agent: existing.agent_id, task_id: lifecycle.task_id };
}

export async function transitionLifecycleTask({ siteRoot, store, taskNumber, agentId, reason, toStatus, resultStatus }) {
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
  if (!isValidTransition(lifecycle.status, toStatus)) {
    return {
      status: 'error',
      error: 'invalid_transition',
      task_number: taskNumber,
      from: lifecycle.status,
      to: toStatus,
      message: `Cannot transition from '${lifecycle.status}' to '${toStatus}'.`,
    };
  }
  const updates = { reason };
  if (toStatus === 'opened' && ['closed', 'confirmed'].includes(lifecycle.status)) {
    updates.reopened_at = new Date().toISOString();
    updates.reopened_by = agentId;
  }
  store.updateStatus(lifecycle.task_id, toStatus, agentId, updates);
  await writeTaskStatusProjection(siteRoot, taskNumber, toStatus);
  return { status: resultStatus, task_number: taskNumber, task_id: lifecycle.task_id };
}

export async function tombstoneLifecycleTask({ siteRoot, store, taskNumber, agentId, reason, authorityBasis = null, disposition = 'tombstoned', metadata = {} }) {
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return {
      status: 'error',
      error: 'reason_required',
      task_number: taskNumber,
      message: 'Tombstoning a task requires a reason so the dropped record remains auditable.',
    };
  }
  if (!isOperatorDirectAuthority(authorityBasis)) {
    return {
      status: 'error',
      error: 'operator_direct_authority_required',
      task_number: taskNumber,
      message: 'Tombstoning a task requires authority_basis.kind=operator_direct_instruction.',
    };
  }
  const tombstoneDisposition = normalizeTombstoneDisposition(disposition);
  const tombstoneMetadata = normalizeTombstoneMetadata(metadata);
  if (lifecycle.status === 'closed' && lifecycle.closure_mode === 'tombstone') {
    return { status: 'already_tombstoned', task_number: taskNumber, task_id: lifecycle.task_id };
  }

  const now = new Date().toISOString();
  const activeAssignment = store.getActiveAssignment(lifecycle.task_id) ?? null;
  if (activeAssignment) {
    store.releaseAssignment(activeAssignment.assignment_id, `tombstoned: ${reason.trim()}`);
  }
  store.db.prepare(`
    UPDATE task_lifecycle
    SET status = 'closed',
        closed_at = ?,
        closed_by = ?,
        closure_mode = 'tombstone',
        updated_at = ?
    WHERE task_id = ?
  `).run(now, agentId, now, lifecycle.task_id);
  await writeTaskTombstoneProjection({
    siteRoot,
    taskNumber,
    status: 'closed',
    closedAt: now,
    closedBy: agentId,
    closureMode: 'tombstone',
    reason: reason.trim(),
    authorityBasis,
    disposition: tombstoneDisposition,
    metadata: tombstoneMetadata,
  });

  return {
    status: 'tombstoned',
    task_number: taskNumber,
    task_id: lifecycle.task_id,
    from: lifecycle.status,
    to: 'closed',
    closure_mode: 'tombstone',
    tombstone_disposition: tombstoneDisposition,
    tombstone_metadata: tombstoneMetadata,
    closed_at: now,
    closed_by: agentId,
    released_assignment: activeAssignment ? {
      assignment_id: activeAssignment.assignment_id,
      agent_id: activeAssignment.agent_id,
      claimed_at: activeAssignment.claimed_at,
    } : null,
    authority_basis: authorityBasis,
  };
}

export async function unDeferLifecycleTask({ siteRoot, store, taskNumber, agentId, reason, authorityBasis }) {
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
  if (lifecycle.status !== 'deferred') {
    return {
      status: 'error',
      error: 'invalid_transition',
      task_number: taskNumber,
      from: lifecycle.status,
      to: 'opened_or_claimed',
      message: `Cannot un-defer a task from '${lifecycle.status}'.`,
    };
  }

  const assignment = store.getActiveAssignment(lifecycle.task_id) ?? null;
  const nextStatus = assignment ? 'claimed' : 'opened';
  if (assignment && assignment.agent_id !== agentId && !isOperatorDirectAuthority(authorityBasis)) {
    return {
      status: 'error',
      error: 'authority_basis_required',
      task_number: taskNumber,
      active_assignment_agent_id: assignment.agent_id,
      actor_agent_id: agentId,
      message: 'Un-deferring a task assigned to another agent requires authority_basis.kind=operator_direct_instruction.',
    };
  }

  store.updateStatus(lifecycle.task_id, nextStatus, agentId, {
    reason,
    un_defer_authority_basis_json: authorityBasis ? JSON.stringify(authorityBasis) : null,
  });
  await writeTaskStatusProjection(siteRoot, taskNumber, nextStatus);
  return {
    status: 'un_deferred',
    task_number: taskNumber,
    task_id: lifecycle.task_id,
    from: 'deferred',
    to: nextStatus,
    active_assignment: assignment ? {
      assignment_id: assignment.assignment_id,
      agent_id: assignment.agent_id,
      claimed_at: assignment.claimed_at,
      intent: assignment.intent,
    } : null,
  };
}

export async function proveTaskCriteria({ siteRoot, store, taskNumber, agentId }) {
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
  const taskPath = resolve(siteRoot, '.ai', 'do-not-open', 'tasks', `${lifecycle.task_id}.md`);
  let body;
  try {
    body = readFileSync(taskPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read task file: ${err.message}`);
  }

  const updatedBody = body.replace(/^(\s*)- \[ \](.*)$/gm, '$1- [x]$2');
  if (updatedBody === body) return { status: 'no_changes', task_number: taskNumber, message: 'No unchecked acceptance criteria found.' };

  const now = new Date().toISOString();
  let updatedContent = updatedBody;
  if (/^---\r?\n/.test(updatedBody)) {
    updatedContent = updatedBody.replace(/^(---\r?\n[\s\S]*?\r?\n---)/, (match) => {
      let fm = match;
      if (!fm.includes('criteria_proved_by:')) {
        fm = fm.replace(/\n---$/, `\ncriteria_proved_by: ${agentId}\ncriteria_proved_at: ${now}\n---`);
      }
      return fm;
    });
  }
  writeFileSync(taskPath, updatedContent, 'utf8');
  const admission = await admitTaskEvidence({ cwd: siteRoot, taskNumber, admittedBy: agentId, methods: ['criteria_proof'] });
  return {
    status: admission.blockers.length === 0 ? 'proved' : 'proved_with_blockers',
    task_number: taskNumber,
    admission_id: admission.result.admission_id,
    blockers: admission.blockers,
    schema: 'narada.task.mcp.prove_criteria.v0',
  };
}

function isOperatorDirectAuthority(value) {
  return value && typeof value === 'object' && value.kind === 'operator_direct_instruction' && typeof value.summary === 'string' && value.summary.trim().length > 0;
}

const TOMBSTONE_DISPOSITIONS = new Set([
  'tombstoned',
  'wrong_site',
  'handoff_created',
  'quarantined_pending_destination',
  'advisory_retained',
  'duplicate_suppressed',
]);

function normalizeTombstoneDisposition(value) {
  const disposition = typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'tombstoned';
  if (!TOMBSTONE_DISPOSITIONS.has(disposition)) {
    throw new Error(`invalid_tombstone_disposition: ${disposition}`);
  }
  return disposition;
}

function normalizeTombstoneMetadata(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const allowed = ['source_task_ref', 'destination_site', 'handoff_ref', 'evidence_ref', 'authority_ref', 'residual_status'];
  const result = {};
  for (const key of allowed) {
    if (input[key] !== null && input[key] !== undefined && String(input[key]).trim().length > 0) {
      result[key] = String(input[key]).trim();
    }
  }
  return result;
}

async function writeTaskTombstoneProjection({ siteRoot, taskNumber, status, closedAt, closedBy, closureMode, reason, authorityBasis, disposition, metadata }) {
  try {
    const taskFile = await findTaskFile(siteRoot, taskNumber);
    if (!taskFile) return;
    const { frontMatter, body } = await readTaskFile(taskFile.path);
    frontMatter.status = status;
    frontMatter.closed_at = closedAt;
    frontMatter.closed_by = closedBy;
    frontMatter.closure_mode = closureMode;
    frontMatter.tombstone_reason = reason;
    frontMatter.tombstone_disposition = disposition;
    frontMatter.tombstone_authority_kind = authorityBasis?.kind ?? null;
    for (const [key, value] of Object.entries(metadata ?? {})) {
      if (value !== null && value !== undefined && String(value).trim().length > 0) {
        frontMatter[`tombstone_${key}`] = String(value);
      }
    }
    const metadataLines = Object.entries(metadata ?? {})
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');
    const section = `\n\n## Tombstone\n\nDropped by operator-direct lifecycle tombstone command. This is a terminal record-retirement disposition, not completion evidence.\n\n- Tombstoned at: ${closedAt}\n- Tombstoned by: ${closedBy}\n- Disposition: ${disposition}\n- Reason: ${reason}\n- Authority: ${authorityBasis?.kind ?? 'unknown'} - ${authorityBasis?.summary ?? ''}${metadataLines ? `\n${metadataLines}` : ''}\n`;
    const nextBody = /(^|\n)## Tombstone\b/.test(body) ? body : `${body.replace(/\s+$/, '')}${section}`;
    await writeTaskProjection(taskFile.path, frontMatter, nextBody);
  } catch {
    // Projection writes are compatibility updates; SQLite remains authoritative.
  }
}

async function writeTaskStatusProjection(siteRoot, taskNumber, status) {
  try {
    const taskFile = await findTaskFile(siteRoot, taskNumber);
    if (!taskFile) return;
    const { frontMatter, body } = await readTaskFile(taskFile.path);
    frontMatter.status = status;
    await writeTaskProjection(taskFile.path, frontMatter, body);
  } catch {
    // Projection writes are compatibility updates; SQLite remains authoritative.
  }
}
