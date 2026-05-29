/**
 * Shared workboard categorization logic used by generate-workboard.mjs and task_mcp_next.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectSameOperatorReview, detectSelfReview, getReviewAcceptanceProvenance } from './operator-identity.mjs';
import { deriveClosureAuthority } from './closure-authority.mjs';
import { validateRecoveryTruthfulnessBody } from './recovery-truthfulness-guard.mjs';

export function buildWorkboard({ store, siteRoot = null, agentId, agentRole, allTasks }) {
  const all_in_review = [];
  const reviewed_closeouts = [];
  const in_progress = [];
  const needs_continuation = [];
  const local_followups = [];
  const role_wide_followups = [];
  const non_actionable_parent_followups = [];
  const closure_authority_conflicts = [];
  const downstream_role_followups = [];
  const claimed_terminal_blocked = [];
  const deferred = [];
  const actionable_deferred = [];
  const lifecycleByNumber = new Map((allTasks || []).map((t) => [t.task_number, t]));

  // Preload operator identities for agents in the workboard
  const operatorIdentities = new Map();
  try {
    const rows = store.db.prepare("SELECT agent_id, operator_identity FROM agent_roster WHERE operator_identity IS NOT NULL").all();
    for (const row of rows) {
      operatorIdentities.set(row.agent_id, row.operator_identity);
    }
  } catch {
    // Best-effort; column may not exist in minimal stores
  }

  for (const task of allTasks) {
    const spec = store.getTaskSpecByNumber(task.task_number);
    const assignment = store.getActiveAssignment(task.task_id);

    let targetRole = null;
    let preferredAgentId = null;
    try {
      const rolePref = store.db.prepare(
        'SELECT target_role, preferred_role, preferred_agent_id FROM narada_andrey_task_role_preferences WHERE task_id = ?'
      ).get(task.task_id);
      targetRole = rolePref?.target_role || rolePref?.preferred_role || spec?.target_role || spec?.preferred_role || null;
      preferredAgentId = rolePref?.preferred_agent_id || spec?.preferred_agent_id || null;
    } catch {
      // Table may not exist in fresh or minimal stores
    }

    let roleMatch = true;
    if (['opened', 'needs_continuation'].includes(task.status)) {
      if (targetRole) {
        roleMatch = agentRole === targetRole;
      }
    }

    const item = {
      task_number: task.task_number,
      task_id: task.task_id,
      status: task.status,
      title: spec?.title || '(untitled)',
      assigned_agent: assignment?.agent_id || null,
      assigned_agent_operator_identity: operatorIdentities.get(assignment?.agent_id) || null,
      target_role: targetRole,
      preferred_agent_id: preferredAgentId,
      updated_at: task.updated_at,
      relative_priority: task.relative_priority ?? 0,
    };
    item.preferred_agent_relation = preferredAgentRelation(preferredAgentId, agentId);
    item.routing_policy = 'preferred_agent_id_is_soft_affinity_target_role_is_role_gate';
    item.parent_coordinator_actionability = deriveParentCoordinatorActionability({ task, spec, lifecycleByNumber });
    item.closure_authority = deriveClosureAuthority(task);
    item.pre_claim_warnings = buildPreClaimWarnings({ item, assignment, agentId });

    if (item.closure_authority.closure_dominates) {
      closure_authority_conflicts.push({
        ...item,
        visibility: 'closure_authority_conflict',
        claim_authority: 'not_claimable_closed_evidence_dominates',
        reason: item.closure_authority.reason,
      });
      continue;
    }

    if (!roleMatch) {
      downstream_role_followups.push({
        ...item,
        claim_authority: 'not_claimable_role_binding_mismatch',
        visibility: 'downstream_role_context',
        reason: `Task target_role=${targetRole}; querying agent role binding=${agentRole ?? 'unknown'}. Role binding is an eligibility filter, not mutation authority.`, 
      });
      continue;
    }

    if (task.status === 'in_review') {
      // Detect if the requesting agent would face a single-operator review
      item.review_independence_for_querying_agent = {
        schema: 'narada.task.pending_review_independence.v0',
        independent_review_available: true,
        reviewer_agent_id: agentId ?? null,
        limitation_kind: null,
        limitation_reason: null,
      };
      if (agentId) {
        let structuralInfo = detectSameOperatorReview(store, agentId, task.task_number);
        if (!structuralInfo?.sameOperator) {
          structuralInfo = detectSelfReview(store, agentId, task.task_number);
        }
        if (structuralInfo?.sameOperator || structuralInfo?.selfReview) {
          item.single_operator_review_risk = true;
          item.single_operator_review_kind = structuralInfo.kind || 'same_operator';
          item.single_operator_review_hint = structuralInfo.warning;
          item.review_independence_for_querying_agent = {
            schema: 'narada.task.pending_review_independence.v0',
            independent_review_available: false,
            reviewer_agent_id: agentId,
            worker_agent_id: structuralInfo.finisherAgent ?? null,
            reviewer_operator_identity: structuralInfo.operatorIdentity ?? null,
            limitation_kind: structuralInfo.kind || 'same_operator',
            limitation_reason: structuralInfo.warning,
          };
        }
      }
      const acceptedReview = findLatestAcceptedReview(store, task.task_id);
      if (acceptedReview) {
        item.review_closeout_guidance = {
          schema: 'narada.task.reviewed_closeout_guidance.v0',
          status: 'accepted_review_pending_close',
          action: 'task_lifecycle_close',
          mode: 'peer_reviewed',
          review_id: acceptedReview.review_id,
          verdict: acceptedReview.verdict,
          reviewed_at: acceptedReview.reviewed_at,
          acceptance_provenance: getReviewAcceptanceProvenance(store, acceptedReview),
          reason: 'Accepted review evidence exists, but the task remains in_review until an explicit close call admits closure authority.',
        };
        reviewed_closeouts.push(item);
      }
      all_in_review.push(item);
    } else if (task.status === 'claimed') {
      if (agentId && assignment?.agent_id !== agentId) continue;
      const terminalBlocker = deriveClaimedTerminalBlocker({ siteRoot, store, task, spec });
      if (terminalBlocker) {
        claimed_terminal_blocked.push({
          ...item,
          visibility: 'claimed_terminal_blocked_inconsistent',
          continuation_actionability: terminalBlocker.actionability,
          repair_state: terminalBlocker.repair_state,
          blocker_state: terminalBlocker.blocker_state,
          blocker: terminalBlocker,
          reason: terminalBlocker.reason,
          agent_actionable: false,
        });
        continue;
      }
      in_progress.push(item);
    } else if (task.status === 'needs_continuation') {
      const acceptedReview = findLatestAcceptedReview(store, task.task_id);
      if (acceptedReview) {
        item.review_closeout_guidance = {
          schema: 'narada.task.reviewed_closeout_guidance.v0',
          status: 'accepted_review_advisory_continuation_required',
          action: 'continue',
          mode: 'continuation_dominates_review',
          review_id: acceptedReview.review_id,
          verdict: acceptedReview.verdict,
          reviewed_at: acceptedReview.reviewed_at,
          acceptance_provenance: getReviewAcceptanceProvenance(store, acceptedReview),
          reason: 'Accepted review evidence is advisory because the lifecycle state remains needs_continuation.',
        };
      }
      if (agentId && assignment?.agent_id && assignment.agent_id !== agentId) continue;
      needs_continuation.push({
        ...item,
        visibility: assignment?.agent_id ? 'assigned_needs_continuation' : 'unassigned_needs_continuation',
        continuation_actionability: assignment?.agent_id ? 'assigned_agent_resume' : 'unassigned_role_visible',
      });
    } else if (task.status === 'opened') {
      if (item.parent_coordinator_actionability.status === 'non_actionable_parent') {
        non_actionable_parent_followups.push({
          ...item,
          visibility: 'parent_coordinator_context',
          claim_authority: 'not_recommended_parent_waiting_on_children',
          reason: item.parent_coordinator_actionability.reason,
          child_task_numbers: item.parent_coordinator_actionability.child_task_numbers,
          active_child_task_numbers: item.parent_coordinator_actionability.active_child_task_numbers,
        });
        continue;
      }
      if (item.preferred_agent_relation === 'self') {
        local_followups.push({
          ...item,
          visibility: 'preferred_local_followup',
          claim_authority: 'preferred_agent',
        });
      } else {
        role_wide_followups.push({
          ...item,
          visibility: item.preferred_agent_relation === 'other' ? 'role_wide_preferred_elsewhere' : 'role_wide_unpreferred',
          claim_authority: item.preferred_agent_relation === 'other'
            ? 'preferred_agent_override_required'
            : 'role_binding_eligible_unpreferred',
          reason: item.preferred_agent_relation === 'other'
            ? `Task prefers agent ${preferredAgentId}; same-role claim requires explicit override authority.`
            : 'Task has no preferred_agent_id; matching role binding makes the task claimable through the claim surface, not authorized for arbitrary mutation.',
        });
      }
    } else if (task.status === 'deferred') {
      const observationText = loadObservationArtifactText({ store, task });
      const actionability = deriveDeferredActionability({ siteRoot, task, spec, observationText, lifecycleByNumber });
      item.deferred_actionability = actionability.status;
      item.deferred_actionability_reason = actionability.reason;
      item.deferred_blocker = actionability.blocker;
      item.local_continuation_available = actionability.local_continuation_available;
      deferred.push(item);
      const assignmentMatches = !assignment?.agent_id || assignment.agent_id === agentId;
      const roleMatches = !targetRole || agentRole === targetRole;
      if (assignmentMatches && roleMatches && actionability.status === 'actionable') {
        actionable_deferred.push(item);
      }
    }
  }

  const sortByPriorityThenPreferred = (a, b) => {
    const prioDiff = (b.relative_priority ?? 0) - (a.relative_priority ?? 0);
    if (prioDiff !== 0) return prioDiff;
    const aPref = a.preferred_agent_id === agentId ? 0 : 1;
    const bPref = b.preferred_agent_id === agentId ? 0 : 1;
    return aPref - bPref;
  };

  all_in_review.sort(sortByPriorityThenPreferred);
  in_progress.sort(sortByPriorityThenPreferred);
  needs_continuation.sort(sortByPriorityThenPreferred);
  local_followups.sort(sortByPriorityThenPreferred);
  role_wide_followups.sort(sortByPriorityThenPreferred);
  non_actionable_parent_followups.sort(sortByPriorityThenPreferred);
  closure_authority_conflicts.sort(sortByPriorityThenPreferred);
  downstream_role_followups.sort(sortByPriorityThenPreferred);
  claimed_terminal_blocked.sort(sortByPriorityThenPreferred);
  deferred.sort(sortByPriorityThenPreferred);
  actionable_deferred.sort(sortByPriorityThenPreferred);

  return {
    all_in_review,
    reviewed_closeouts,
    in_progress,
    needs_continuation,
    local_followups,
    role_wide_followups,
    non_actionable_parent_followups,
    closure_authority_conflicts,
    downstream_role_followups,
    claimed_terminal_blocked,
    deferred,
    actionable_deferred,
  };
}

function findLatestAcceptedReview(store, taskId) {
  const acceptedVerdicts = new Set(['accepted', 'accepted_with_notes']);
  try {
    const reviews = typeof store.listReviews === 'function'
      ? store.listReviews(taskId)
      : store.db.prepare('SELECT * FROM task_reviews WHERE task_id = ? ORDER BY reviewed_at DESC, rowid DESC').all(taskId);
    return reviews.find((review) => acceptedVerdicts.has(review.verdict)) || null;
  } catch {
    return null;
  }
}

const ACTIVE_CHILD_STATUSES = new Set(['opened', 'claimed', 'needs_continuation', 'in_review', 'deferred']);

function deriveParentCoordinatorActionability({ task, spec, lifecycleByNumber }) {
  if (task.status !== 'opened') {
    return { status: 'not_applicable', reason: 'task is not opened' };
  }
  const text = [
    spec?.title,
    spec?.goal_markdown,
    spec?.context_markdown,
    spec?.required_work_markdown,
    spec?.non_goals_markdown,
  ].filter(Boolean).join('\n\n');
  if (!/\b(split child tasks|child tasks|parent\/coordinator|coordinator)\b/i.test(text)) {
    return { status: 'ordinary_leaf_or_unclassified', reason: 'no parent/coordinator child-task evidence detected' };
  }
  const childTaskNumbers = extractChildTaskNumbers(text, task.task_number);
  if (childTaskNumbers.length === 0) {
    return { status: 'ordinary_leaf_or_unclassified', reason: 'parent/coordinator wording has no numbered child refs' };
  }
  const activeChildTaskNumbers = childTaskNumbers.filter((number) => {
    const child = lifecycleByNumber.get(number);
    return child && ACTIVE_CHILD_STATUSES.has(child.status);
  });
  if (activeChildTaskNumbers.length === 0) {
    return {
      status: 'parent_ready_for_consolidation',
      reason: 'parent/coordinator has no active child lifecycle refs',
      child_task_numbers: childTaskNumbers,
      active_child_task_numbers: [],
    };
  }
  return {
    status: 'non_actionable_parent',
    reason: `Parent/coordinator task has active child task(s): ${activeChildTaskNumbers.map((n) => `#${n}`).join(', ')}.`,
    child_task_numbers: childTaskNumbers,
    active_child_task_numbers: activeChildTaskNumbers,
  };
}

function extractChildTaskNumbers(text, parentTaskNumber) {
  const refs = new Set();
  const childRefPattern = /(?:^|\n)\s*(?:[-*]\s*)?`?#(\d+)`?/g;
  let match;
  while ((match = childRefPattern.exec(text)) !== null) {
    const number = Number(match[1]);
    if (Number.isInteger(number) && number !== parentTaskNumber) {
      refs.add(number);
    }
  }
  return [...refs].sort((a, b) => a - b);
}

function buildPreClaimWarnings({ item, assignment, agentId }) {
  const warnings = [];
  if (assignment?.agent_id && assignment.agent_id !== agentId) {
    warnings.push({
      kind: 'active_assignment',
      severity: 'blocker',
      assigned_agent: assignment.agent_id,
      claimed_at: assignment.claimed_at ?? null,
      message: `Task already has an active assignment by ${assignment.agent_id}.`,
    });
  }
  if (item.preferred_agent_id && item.preferred_agent_id !== agentId) {
    warnings.push({
      kind: 'preferred_agent_mismatch',
      severity: 'requires_authority',
      preferred_agent_id: item.preferred_agent_id,
      claiming_agent: agentId ?? null,
      message: `Task prefers ${item.preferred_agent_id}; claim requires override authority.`,
    });
  }
  return warnings;
}

function preferredAgentRelation(preferredAgentId, agentId) {
  if (!preferredAgentId) return 'none';
  if (agentId && preferredAgentId === agentId) return 'self';
  return 'other';
}

function deriveClaimedTerminalBlocker({ siteRoot, store, task, spec }) {
  const bodyText = loadTaskText({ siteRoot, task, spec });
  const bodyValidation = validateRecoveryTruthfulnessBody({ body: bodyText, summary: '', context: `task:${task.task_number}` });
  const normalizedBodyState = bodyValidation.evaluation?.normalized_state ?? null;
  const latestReport = findLatestTaskReport(store, task.task_id);
  const reportText = [latestReport?.summary, latestReport?.verification_json, latestReport?.changed_files_json].filter(Boolean).join('\n');
  const normalizedReport = reportText.toLowerCase();
  const bodyHasTerminalBlocked = normalizedBodyState === 'terminal_blocked' || /\brecovery truthfulness[\s\S]{0,400}\bstate\s*:\s*terminal_blocked\b/i.test(bodyText);
  const reportHasTerminalBlocked = /\bterminal_blocked\b/.test(normalizedReport);
  const externalAuthorityBlocked = detectExternalAuthorityBlocker(`${bodyText}\n${reportText}`);
  const checkedBlockedCriteria = detectCheckedBlockedCriteria(bodyText);

  if (!bodyHasTerminalBlocked && !reportHasTerminalBlocked && !externalAuthorityBlocked && !checkedBlockedCriteria) {
    return null;
  }

  const evidenceSources = [];
  if (bodyHasTerminalBlocked) evidenceSources.push('task_body_recovery_truthfulness');
  if (reportHasTerminalBlocked) evidenceSources.push('latest_structured_report');
  if (externalAuthorityBlocked) evidenceSources.push('external_authority_text');
  if (checkedBlockedCriteria) evidenceSources.push('checked_blocked_acceptance_criterion');

  return {
    kind: externalAuthorityBlocked ? 'blocked_external_authority' : 'claimed_terminal_blocked_inconsistent',
    repair_state: 'claimed_terminal_blocked_inconsistent',
    blocker_state: externalAuthorityBlocked ? 'blocked_external_authority' : 'terminal_blocked',
    actionability: 'blocked_external_authority',
    reason: externalAuthorityBlocked
      ? 'claimed task records terminal-blocked or external-authority deferral evidence; suppressing ordinary continue recommendation until lifecycle is deferred/unclaimed or an explicit override is recorded'
      : 'claimed task records terminal_blocked evidence; suppressing ordinary continue recommendation until lifecycle state is reconciled',
    evidence_sources: evidenceSources,
    latest_report_id: latestReport?.report_id ?? null,
    recovery_state: bodyHasTerminalBlocked ? 'terminal_blocked' : null,
    checked_blocked_criteria: checkedBlockedCriteria,
  };
}

function findLatestTaskReport(store, taskId) {
  if (!store?.db || !taskId) return null;
  try {
    return store.db.prepare(`
      SELECT report_id, summary, changed_files_json, verification_json, submitted_at
      FROM task_reports
      WHERE task_id = ?
      ORDER BY submitted_at DESC, rowid DESC
      LIMIT 1
    `).get(taskId) ?? null;
  } catch {
    return null;
  }
}

function detectExternalAuthorityBlocker(text) {
  const normalized = text.toLowerCase();
  const hasTerminalOrDeferred = /\b(terminal_blocked|deferred|blocked|needs_external_authority|external authority|other locus|pc-locus|staccato)\b/.test(normalized);
  const hasExternalBoundary = /\b(external authority|needs_external_authority|other locus|different locus|pc-locus|staccato|outside (?:this )?(?:workspace|user site|authority)|missing .*capability)\b/.test(normalized);
  const hasNoLocalPath = /\b(no local executable path|cannot honestly|cannot .* from .*locus|outside .*authority|awaiting .*authority|requires .*authority|deferred to)\b/.test(normalized);
  return hasTerminalOrDeferred && hasExternalBoundary && hasNoLocalPath;
}

function detectCheckedBlockedCriteria(body) {
  const matches = [];
  const section = extractAcceptanceCriteriaSection(body);
  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^-\s*\[[xX]\]/.test(line)) continue;
    if (/\b(blocked|deferred|terminal_blocked|needs_external_authority|cannot execute|outside .*authority|no local executable path)\b/i.test(line)) {
      matches.push(line.replace(/\s+/g, ' '));
    }
  }
  return matches.length > 0 ? matches : null;
}

function extractAcceptanceCriteriaSection(body) {
  const match = body.match(/^##\s+Acceptance Criteria\s*$/mi);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const nextHeading = rest.match(/^##\s/m);
  return rest.slice(0, nextHeading ? nextHeading.index : undefined).trim();
}

function deriveDeferredActionability({ siteRoot, task, spec, observationText = '', lifecycleByNumber = new Map() }) {
  const text = loadDeferredTaskText({ siteRoot, task, spec, observationText });
  const normalized = text.toLowerCase();
  const coordinatorBlocker = detectDeferredCoordinatorChildBlocker({ text, task, lifecycleByNumber });
  if (coordinatorBlocker) {
    return {
      status: 'blocked',
      reason: coordinatorBlocker.reason,
      blocker: coordinatorBlocker,
      local_continuation_available: false,
    };
  }

  const explicitBlocker = detectExplicitDeferredBlockerSection(text);
  if (explicitBlocker) {
    return {
      status: 'blocked',
      reason: explicitBlocker.reason,
      blocker: explicitBlocker,
      local_continuation_available: false,
    };
  }

  const admittedBlocker = detectAdmittedDeferredBlockerObservation(normalized);
  if (admittedBlocker) {
    return {
      status: 'blocked',
      reason: admittedBlocker.reason,
      blocker: admittedBlocker,
      local_continuation_available: false,
    };
  }

  const reviewAcceptanceBlocker = detectReviewAcceptanceDeferredBlocker(normalized);
  if (reviewAcceptanceBlocker) {
    return {
      status: 'blocked',
      reason: reviewAcceptanceBlocker.reason,
      blocker: reviewAcceptanceBlocker,
      local_continuation_available: false,
    };
  }

  const externalBlocker = detectExternalDeferredBlocker(normalized);
  if (externalBlocker) {
    return {
      status: 'blocked',
      reason: externalBlocker.reason,
      blocker: externalBlocker,
      local_continuation_available: false,
    };
  }

  const hasClearedBlocker = /\b(blocker|blocked|external|upstream)\b[\s\S]{0,80}\b(cleared|resolved|accepted|available|unblocked)\b/i.test(text)
    || /\b(local continuation path|local executable path)\b[\s\S]{0,80}\b(available|exists|present)\b/i.test(text);
  if (hasClearedBlocker) {
    return {
      status: 'actionable',
      reason: 'deferred task has blocker-cleared or local-continuation evidence',
      blocker: null,
      local_continuation_available: true,
    };
  }

  return {
    status: 'actionable',
    reason: 'no unresolved blocker evidence detected in deferred task text',
    blocker: null,
    local_continuation_available: true,
  };
}

function detectExplicitDeferredBlockerSection(text) {
  const match = text.match(/^##\s+Blocker\s*\n([\s\S]*?)(?=^##\s|$)/im);
  if (!match) return null;
  const section = match[1].trim();
  if (!section) return null;
  if (/\b(cleared|resolved|accepted|available|unblocked)\b/i.test(section)) return null;
  return {
    kind: 'explicit_blocker_section',
    reason: 'deferred task projection contains an unresolved ## Blocker section',
    evidence_source: 'task_projection_blocker_section',
    excerpt: section.replace(/\s+/g, ' ').slice(0, 240),
  };
}

function detectAdmittedDeferredBlockerObservation(normalizedText) {
  const hasBlockerObservation = /\b(finish_blocked|review_blocked|mcp_finish_blocked|mcp_review_blocked|guard[_-]blocked|self_cert_false_treated_missing|task_file_resolution_failed)\b/.test(normalizedText);
  if (!hasBlockerObservation) return null;
  return {
    kind: 'admitted_blocker_observation',
    reason: 'deferred task has admitted finish/review blocker observation evidence',
    evidence_source: 'observation_artifacts',
  };
}

function detectReviewAcceptanceDeferredBlocker(normalizedText) {
  const hasReviewAcceptanceGate = /\b(independent review|operator acceptance|explicit operator acceptance|review\/operator acceptance|review or operator acceptance|self-certification|same-subject|same subject)\b/.test(normalizedText);
  const hasRequirementLanguage = /\b(needs|requires|required|until|dependent on|pending|deferred|blocked)\b/.test(normalizedText);
  const hasTerminalOrClosureLanguage = /\b(terminal|closure|close|finish|acceptance|corrected|correction)\b/.test(normalizedText);
  if (hasReviewAcceptanceGate && hasRequirementLanguage && hasTerminalOrClosureLanguage) {
    return {
      kind: 'review_or_operator_acceptance_required',
      reason: 'deferred task records unresolved independent-review or operator-acceptance requirement',
    };
  }
  return null;
}

function detectExternalDeferredBlocker(normalizedText) {
  const hasBlockerLanguage = /\b(blocked|blocker|refused|rejects|rejected|invalid --kind|still fails|still rejects|unresolved)\b/.test(normalizedText);
  const hasExternalBoundary = /\b(external|upstream|outside (?:this )?(?:workspace|user site|writable roots)|canonical .*cli|d:\\code\\narada|missing .*capability)\b/.test(normalizedText);
  const hasNoLocalPath = /\b(cannot honestly|cannot .* from .*workspace|no local executable path|outside .*authority|outside .*writable roots|awaiting upstream|until canonical)\b/.test(normalizedText);
  if (hasBlockerLanguage && hasExternalBoundary && hasNoLocalPath) {
    return {
      kind: 'external_unresolved_blocker',
      reason: 'deferred task records an unresolved external blocker with no local continuation path',
    };
  }
  return null;
}

function detectDeferredCoordinatorChildBlocker({ text, task, lifecycleByNumber }) {
  if (!/\b(child tasks?|children|parent\/coordinator|coordinator|blocked on|blocked until|blocked by)\b/i.test(text)) {
    return null;
  }
  const childTaskNumbers = extractTaskRefsAndRanges(text, task.task_number);
  if (childTaskNumbers.length === 0) return null;
  const activeChildTaskNumbers = childTaskNumbers.filter((number) => {
    const child = lifecycleByNumber.get(number);
    return child && ACTIVE_CHILD_STATUSES.has(child.status);
  });
  if (activeChildTaskNumbers.length === 0) return null;
  return {
    kind: 'deferred_parent_coordinator_child_blockers',
    reason: `deferred parent/coordinator has unresolved child task blocker evidence: ${activeChildTaskNumbers.map((n) => `#${n}`).join(', ')}`,
    child_task_numbers: childTaskNumbers,
    active_child_task_numbers: activeChildTaskNumbers,
    evidence_source: 'task_text_or_observation_artifact',
  };
}

function extractTaskRefsAndRanges(text, parentTaskNumber) {
  const refs = new Set();
  const rangePattern = /#(\d+)\s*-\s*#?(\d+)/g;
  let range;
  while ((range = rangePattern.exec(text)) !== null) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    if (high - low > 50) continue;
    for (let number = low; number <= high; number += 1) {
      if (number !== parentTaskNumber) refs.add(number);
    }
  }
  const refPattern = /#(\d+)/g;
  let match;
  while ((match = refPattern.exec(text)) !== null) {
    const number = Number(match[1]);
    if (Number.isInteger(number) && number !== parentTaskNumber) refs.add(number);
  }
  return [...refs].sort((a, b) => a - b);
}

function loadDeferredTaskText({ siteRoot, task, spec, observationText = '' }) {
  const chunks = [loadTaskText({ siteRoot, task, spec })];
  if (observationText) chunks.push(observationText);
  return chunks.join('\n\n');
}

function loadTaskText({ siteRoot, task, spec }) {
  const chunks = [
    spec?.title,
    spec?.goal_markdown,
    spec?.context_markdown,
    spec?.required_work_markdown,
    spec?.non_goals_markdown,
  ].filter(Boolean);
  if (siteRoot && task?.task_id) {
    const taskPath = join(siteRoot, '.ai', 'do-not-open', 'tasks', `${task.task_id}.md`);
    if (existsSync(taskPath)) {
      try {
        chunks.push(readFileSync(taskPath, 'utf8'));
      } catch {
        // SQLite task spec remains enough for advisory actionability derivation.
      }
    }
  }
  return chunks.join('\n\n');
}

function loadObservationArtifactText({ store, task }) {
  if (!store?.db || !task?.task_id) return '';
  try {
    const rows = store.db.prepare(`
      SELECT artifact_uri, admitted_view_json
      FROM observation_artifacts
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT 8
    `).all(task.task_id);
    return rows.map((row) => `${row.artifact_uri ?? ''}\n${row.admitted_view_json ?? ''}`).join('\n\n');
  } catch {
    return '';
  }
}
