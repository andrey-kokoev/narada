/**
 * Unified workboard — compose task workboard, inbox backlog, and obligations
 * into a single prioritized work surface.
 */

import { buildWorkboard } from './workboard.mjs';
import { buildInboxWorkboard } from './inbox-workboard.mjs';

export function deriveNextRecommendation(board, agentId) {
  const myInProgress = board.in_progress.filter((t) => t.assigned_agent === agentId);
  const myNeedsContinuation = board.needs_continuation.filter((t) => !t.assigned_agent || t.assigned_agent === agentId);
  const highSeverityInbox = board.inbox_backlog.filter((b) => b.severity >= 70);

  if (highSeverityInbox.length > 0) {
    return {
      action: 'bridge_poll',
      reason: `There are ${highSeverityInbox.length} high-severity inbox envelope(s) ready to materialize into tasks.`,
      inbox_item: highSeverityInbox[0],
    };
  }
  if (myNeedsContinuation.length > 0) {
    return {
      action: 'continue',
      reason: 'You have a task that needs continuation. Resume work on it.',
      task: myNeedsContinuation[0],
    };
  }
  if (myInProgress.length > 0) {
    return {
      action: 'continue',
      reason: 'You have an active claimed task. Continue working on it.',
      task: myInProgress[0],
    };
  }
  if (board.my_review_obligations.length > 0) {
    return {
      action: 'review',
      reason: 'You have executable review obligations.',
      obligation: board.my_review_obligations[0],
    };
  }
  if ((board.reviewed_closeouts || []).length > 0) {
    return {
      action: 'close_reviewed',
      reason: 'Accepted review evidence exists; explicitly close the reviewed task if no continuation remains.',
      task: board.reviewed_closeouts[0],
    };
  }
  if (board.local_followups.length > 0) {
    const claimable = board.local_followups.filter((t) => !t.assigned_agent);
    if (claimable.length > 0) {
      return {
        action: 'claim',
        reason: 'No active work and no reviews. Claim the next available task.',
        task: claimable[0],
      };
    }
  }
  if ((board.role_wide_followups || []).length > 0) {
    const claimable = board.role_wide_followups.filter((t) => !t.assigned_agent);
    if (claimable.length > 0) {
      const task = claimable[0];
      return {
        action: task.claim_authority === 'preferred_agent_override_required' ? 'claim_with_authority' : 'claim',
        reason: task.claim_authority === 'preferred_agent_override_required'
          ? 'No local preferred work is available. Role-wide work exists, but this task prefers another agent and requires explicit override authority to claim.'
          : 'No local preferred work is available. Claim the next role-wide task for your role.',
        task,
      };
    }
  }
  if (board.actionable_deferred.length > 0) {
    return {
      action: 'un_defer',
      reason: 'Actionable deferred tasks are available. Consider un-deferring one to resume work.',
      task: board.actionable_deferred[0],
    };
  }
  return null;
}

export function buildUnifiedWorkboard({ store, siteRoot, agentId, agentRole, allTasks, limit = 8 }) {
  // Build task workboard
  const taskBoard = buildWorkboard({ store, siteRoot, agentId, agentRole, allTasks });

  // Build inbox workboard
  const inboxBoard = buildInboxWorkboard(siteRoot, { store });

  // Build obligations
  let obligations = [];
  if (agentId) {
    const rawObligations = store.listDirectedObligationsForTarget(agentId, agentRole, 'open');
    obligations = rawObligations.map((o) => {
      const lifecycle = o.task_number ? store.getLifecycleByNumber(o.task_number) : null;
      const taskLifecycleStatus = lifecycle?.status ?? null;
      const reviewExecutable = o.kind !== 'review_request' || taskLifecycleStatus === 'in_review';
      return {
        obligation_id: o.obligation_id,
        kind: o.kind,
        task_number: o.task_number,
        task_id: o.task_id,
        title: o.task_number ? (store.getTaskSpecByNumber(o.task_number)?.title || '(untitled)') : '(untitled)',
        routed_by: o.source_agent_id || null,
        created_at: o.created_at,
        status: o.status,
        task_lifecycle_status: taskLifecycleStatus,
        executable: reviewExecutable,
        review_executable: reviewExecutable,
        blocked_reason: reviewExecutable ? null : `Review target is ${taskLifecycleStatus ?? 'missing'}, not in_review.`,
        remediation: reviewExecutable ? null : 'Wait for the worker to finish/report the task or route the obligation back to the source agent; task_lifecycle_review requires target lifecycle status in_review.',
      };
    });
  }
  const reviewObligations = obligations.filter((o) => o.kind === 'review_request');
  const executableReviewObligations = reviewObligations.filter((o) => o.review_executable === true);
  const blockedReviewObligations = reviewObligations.filter((o) => o.review_executable !== true);

  // Generate next recommendation with priority:
  // 1. High-severity inbox items (severity >= 70)
  // 2. Review obligations
  // 3. Pending reviews (in_review tasks)
  // 4. Needs continuation
  // 5. In-progress work
  // 6. Local followups (opened tasks)
  // 7. Lower-severity inbox items
  const recommendations = [];

  // 1. High-severity inbox
  for (const item of inboxBoard.backlog.filter((e) => e.severity >= 70)) {
    recommendations.push({
      type: 'inbox_high_severity',
      priority: 1,
      envelope_id: item.envelope_id,
      title: item.title,
      severity: item.severity,
      kind: item.kind,
      target_role: item.target_role,
      action: item.action,
    });
  }

  // 2. Executable review obligations. Blocked review obligations remain visible
  // below but must not drive recommended_action=review.
  for (const item of executableReviewObligations) {
    recommendations.push({
      type: 'review_obligation',
      priority: 2,
      obligation_id: item.obligation_id,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      routed_by: item.routed_by,
      task_lifecycle_status: item.task_lifecycle_status,
      agent_actionable: true,
    });
  }

  // 3. Blocked review obligations stay visible for traceability without consuming the
  // executable review recommendation channel.
  for (const item of blockedReviewObligations) {
    recommendations.push({
      type: 'blocked_review_obligation',
      priority: 3,
      obligation_id: item.obligation_id,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      routed_by: item.routed_by,
      task_lifecycle_status: item.task_lifecycle_status,
      blocked_reason: item.blocked_reason,
      remediation: item.remediation,
      agent_actionable: false,
    });
  }

  // 4. Reviewed tasks awaiting explicit close
  for (const item of taskBoard.reviewed_closeouts || []) {
    recommendations.push({
      type: 'reviewed_task_closeout',
      priority: 4,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      assigned_agent: item.assigned_agent,
      review_closeout_guidance: item.review_closeout_guidance,
      agent_actionable: true,
      action: 'task_lifecycle_close',
    });
  }

  // 5. Pending reviews
  for (const item of taskBoard.all_in_review) {
    if (item.review_closeout_guidance?.status === 'accepted_review_pending_close') continue;
    recommendations.push({
      type: 'pending_review',
      priority: 4,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      assigned_agent: item.assigned_agent,
      single_operator_review_risk: item.single_operator_review_risk ?? false,
      single_operator_review_kind: item.single_operator_review_kind ?? null,
      review_independence_for_querying_agent: item.review_independence_for_querying_agent ?? null,
    });
  }

  // 5. Needs continuation
  for (const item of taskBoard.needs_continuation) {
    recommendations.push({
      type: 'needs_continuation',
      priority: 5,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      assigned_agent: item.assigned_agent,
    });
  }

  // 6. Claimed tasks whose evidence says terminal-blocked stay visible but non-actionable.
  for (const item of taskBoard.claimed_terminal_blocked || []) {
    recommendations.push({
      type: 'claimed_terminal_blocked_inconsistent',
      priority: 6,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      assigned_agent: item.assigned_agent,
      repair_state: item.repair_state,
      blocker_state: item.blocker_state,
      blocker: item.blocker,
      reason: item.reason,
      agent_actionable: false,
    });
  }

  // 7. In progress
  for (const item of taskBoard.in_progress) {
    recommendations.push({
      type: 'in_progress',
      priority: 6,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      assigned_agent: item.assigned_agent,
    });
  }

  // 8. Local followups (opened tasks)
  for (const item of taskBoard.local_followups) {
    recommendations.push({
      type: 'local_followup',
      priority: 7,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      target_role: item.target_role,
      preferred_agent_id: item.preferred_agent_id,
      claim_authority: item.claim_authority,
      preferred_agent_relation: item.preferred_agent_relation,
      pre_claim_warnings: item.pre_claim_warnings || [],
    });
  }

  // 9. Role-wide followups (opened tasks for this role but not preferred-local)
  for (const item of taskBoard.role_wide_followups || []) {
    recommendations.push({
      type: 'role_wide_followup',
      priority: 8,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      target_role: item.target_role,
      preferred_agent_id: item.preferred_agent_id,
      claim_authority: item.claim_authority,
      preferred_agent_relation: item.preferred_agent_relation,
      pre_claim_warnings: item.pre_claim_warnings || [],
    });
  }

  for (const item of taskBoard.non_actionable_parent_followups || []) {
    recommendations.push({
      type: 'non_actionable_parent_followup',
      priority: 8,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      target_role: item.target_role,
      preferred_agent_id: item.preferred_agent_id,
      claim_authority: item.claim_authority,
      preferred_agent_relation: item.preferred_agent_relation,
      reason: item.reason,
      child_task_numbers: item.child_task_numbers,
      active_child_task_numbers: item.active_child_task_numbers,
      agent_actionable: false,
    });
  }

  for (const item of taskBoard.closure_authority_conflicts || []) {
    recommendations.push({
      type: 'closure_authority_conflict',
      priority: 8,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      target_role: item.target_role,
      preferred_agent_id: item.preferred_agent_id,
      claim_authority: item.claim_authority,
      preferred_agent_relation: item.preferred_agent_relation,
      closure_authority: item.closure_authority,
      reason: item.reason,
      agent_actionable: false,
    });
  }

  // 10. Lower-severity inbox
  for (const item of inboxBoard.backlog.filter((e) => e.severity < 70)) {
    recommendations.push({
      type: 'inbox_backlog',
      priority: 9,
      envelope_id: item.envelope_id,
      title: item.title,
      severity: item.severity,
      kind: item.kind,
      target_role: item.target_role,
    });
  }

  // 11. Actionable deferred tasks. Blocked deferred tasks stay visible in
  // taskBoard.deferred but do not consume the executable recommendation channel.
  for (const item of taskBoard.actionable_deferred) {
    recommendations.push({
      type: 'actionable_deferred',
      priority: 10,
      task_number: item.task_number,
      task_id: item.task_id,
      title: item.title,
      assigned_agent: item.assigned_agent,
      target_role: item.target_role,
      preferred_agent_id: item.preferred_agent_id,
    });
  }

  // Detect recently materialized tasks (created within last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentlyMaterialized = [
    ...taskBoard.local_followups,
    ...(taskBoard.role_wide_followups || []),
  ].filter((t) => t.updated_at && t.updated_at > oneHourAgo);

  return {
    pending_reviews: taskBoard.all_in_review.slice(0, limit),
    reviewed_closeouts: (taskBoard.reviewed_closeouts || []).slice(0, limit),
    in_progress: taskBoard.in_progress.slice(0, limit),
    needs_continuation: taskBoard.needs_continuation.slice(0, limit),
    local_followups: taskBoard.local_followups.slice(0, limit),
    role_wide_followups: (taskBoard.role_wide_followups || []).slice(0, limit),
    non_actionable_parent_followups: (taskBoard.non_actionable_parent_followups || []).slice(0, limit),
    closure_authority_conflicts: (taskBoard.closure_authority_conflicts || []).slice(0, limit),
    downstream_role_followups: (taskBoard.downstream_role_followups || []).slice(0, limit),
    claimed_terminal_blocked: (taskBoard.claimed_terminal_blocked || []).slice(0, limit),
    deferred: taskBoard.deferred.slice(0, limit),
    actionable_deferred: taskBoard.actionable_deferred.slice(0, limit),
    my_review_obligations: executableReviewObligations.slice(0, limit),
    blocked_review_obligations: blockedReviewObligations.slice(0, limit),
    inbox_backlog: inboxBoard.backlog.slice(0, limit),
    inbox_linked_task_suppressed: inboxBoard.linked_task_suppressed.slice(0, limit),
    inbox_counts: inboxBoard.counts,
    inbox_index: inboxBoard.index,
    recommendations: recommendations.slice(0, limit),
    new_tasks_available: recentlyMaterialized.length > 0,
    recently_materialized: recentlyMaterialized.slice(0, limit),
    counts: {
      pending_reviews: taskBoard.all_in_review.length,
      reviewed_closeouts: (taskBoard.reviewed_closeouts || []).length,
      in_progress: taskBoard.in_progress.length,
      needs_continuation: taskBoard.needs_continuation.length,
      local_followups: taskBoard.local_followups.length,
      role_wide_followups: (taskBoard.role_wide_followups || []).length,
      non_actionable_parent_followups: (taskBoard.non_actionable_parent_followups || []).length,
      closure_authority_conflicts: (taskBoard.closure_authority_conflicts || []).length,
      downstream_role_followups: (taskBoard.downstream_role_followups || []).length,
      claimed_terminal_blocked: (taskBoard.claimed_terminal_blocked || []).length,
      deferred: taskBoard.deferred.length,
      actionable_deferred: taskBoard.actionable_deferred.length,
      my_review_obligations: executableReviewObligations.length,
      blocked_review_obligations: blockedReviewObligations.length,
      inbox_total: inboxBoard.counts.total,
      inbox_high_severity: inboxBoard.counts.high_severity,
      inbox_linked_task_suppressed: inboxBoard.counts.linked_task_suppressed,
      recently_materialized: recentlyMaterialized.length,
    },
    schema: 'narada.unified_workboard.v3',
    generated_at: new Date().toISOString(),
  };
}
