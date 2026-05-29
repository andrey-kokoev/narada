import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { join } from 'node:path';
import { buildUnifiedWorkboard, deriveNextRecommendation } from './unified-workboard.mjs';
import {
  buildCorrectiveDebtReadiness,
  correctiveDebtRecommendationListItem,
  deriveCorrectiveDebtRecommendation,
  selectWorkboardRecommendation,
} from './corrective-debt-workboard.mjs';
import { resolveAgentRoleWithDiagnostics } from './agent-role-resolution.mjs';
import { taskLifecycleTools } from './task-mcp-tool-registry.mjs';
import {
  buildMcpFreshnessStatus,
  buildMcpRestartPressure,
  buildStaleLiveNavigationDegradation,
  deriveMcpRestartPressureRecommendation,
} from '../mcp-freshness-service.mjs';

function parseArgs(argv) {
  const args = { cwd: null, agentId: null, json: false, limit: 8, lastWorkboardCheckAt: null };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--limit' && i + 1 < argv.length) {
      const parsed = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(parsed)) args.limit = parsed;
      i++;
    } else if (arg === '--last-workboard-check-at' && i + 1 < argv.length) {
      args.lastWorkboardCheckAt = argv[i + 1];
      i++;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  if (positional.length === 1) {
    const p = positional[0];
    const isPath = p.includes('\\') || p.includes('/') || p === '.' || p === '..';
    if (isPath) {
      args.cwd = p;
    } else {
      args.agentId = p;
      args.cwd = process.cwd();
    }
  } else if (positional.length >= 2) {
    args.cwd = positional[0];
    args.agentId = positional[1];
  }

  return args;
}

function computeStateFreshness(lastWorkboardCheckAt, generatedAt) {
  const now = new Date();
  const generated = generatedAt ? new Date(generatedAt) : now;
  const lastCheck = lastWorkboardCheckAt ? new Date(lastWorkboardCheckAt) : null;
  const staleThresholdMs = 10 * 60 * 1000;

  if (!lastCheck) {
    return {
      status: 'unknown',
      stale: true,
      reason: 'No last_workboard_check_at provided. Agent should checkpoint after every workboard check.',
      last_workboard_check_at: null,
      generated_at: generated.toISOString(),
      seconds_since_check: null,
    };
  }

  const secondsSinceCheck = Math.floor((generated - lastCheck) / 1000);
  const stale = secondsSinceCheck > staleThresholdMs / 1000;

  return {
    status: stale ? 'stale' : 'fresh',
    stale,
    reason: stale
      ? `Last workboard check was ${secondsSinceCheck}s ago (> ${staleThresholdMs / 1000}s threshold). Re-check workboard before declaring state.`
      : `Last workboard check was ${secondsSinceCheck}s ago (within ${staleThresholdMs / 1000}s threshold).`,
    last_workboard_check_at: lastCheck.toISOString(),
    generated_at: generated.toISOString(),
    seconds_since_check: secondsSinceCheck,
  };
}

function buildNextPayload({ store, cwd, agentId, limit, lastWorkboardCheckAt }) {
  const roleResolution = resolveAgentRoleWithDiagnostics(store, cwd, agentId);
  const agentRole = roleResolution.role;

  const all = store.getAllLifecycle();
  const board = buildUnifiedWorkboard({ store, siteRoot: cwd, agentId, agentRole, allTasks: all, limit });

  const recommendation = deriveNextRecommendation(board, agentId);
  const correctiveDebtReadiness = buildCorrectiveDebtReadiness({ siteRoot: cwd, store, allTasks: all });
  const correctiveDebtRecommendation = deriveCorrectiveDebtRecommendation({
    correctiveDebtReadiness,
    siteRoot: cwd,
    store,
    agentRole,
  });
  const mcpFreshness = buildMcpFreshnessStatus({
    siteRoot: cwd,
    serverName: 'narada-task-lifecycle-mcp',
    serverEntryPoint: 'tools/task-lifecycle/task-mcp-server.mjs',
    serverBootedAt: new Date().toISOString(),
    watchedPaths: ['tools/task-lifecycle', 'tools/mcp-freshness-service.mjs'],
    expectedTools: taskLifecycleTools().map((tool) => tool.name),
    registeredTools: taskLifecycleTools().map((tool) => tool.name),
    restartRequestPath: join(cwd, '.ai', 'tmp', 'task-lifecycle-restart-request.json'),
    baselinePath: join(cwd, '.ai', 'tmp', 'task-lifecycle-mcp-baseline.json'),
    restartToolName: 'task_lifecycle_restart',
  });
  const mcpRestartPressure = buildMcpRestartPressure([mcpFreshness]);
  const staleLiveNavigation = buildStaleLiveNavigationDegradation(mcpRestartPressure);
  const restartRecommendation = deriveMcpRestartPressureRecommendation(mcpRestartPressure);
  const environmentPressure = restartRecommendation ? {
    status: 'active',
    executable_by_agent: false,
    pressure: restartRecommendation,
  } : { status: 'clear', executable_by_agent: false, pressure: null };
  const finalRecommendation = selectWorkboardRecommendation({
    baseRecommendation: recommendation,
    correctiveDebtRecommendation,
  });
  const myInProgress = board.in_progress.filter((t) => t.assigned_agent === agentId);
  const myNeedsContinuation = board.needs_continuation.filter((t) => t.assigned_agent === agentId);

  const obligatedTaskIds = new Set(board.my_review_obligations.map((o) => o.task_id));
  const pendingReviews = board.pending_reviews.filter((t) => obligatedTaskIds.has(t.task_id));
  const responseCounts = {
    ...board.counts,
    all_in_review: board.counts.pending_reviews,
    corrective_debt_active: correctiveDebtReadiness.counts.active_total,
    corrective_debt_high_severity: correctiveDebtReadiness.counts.high_severity,
    corrective_debt_missing_coverage: correctiveDebtReadiness.counts.missing_corrective_task_coverage,
  };
  const identityBanner = `>>> YOU ARE QUERYING AS: ${agentId}${agentRole ? ` (${agentRole})` : ''} <<<`;
  const generatedAt = new Date().toISOString();
  const workloopGuidance = buildWorkloopGuidance({
    agentId,
    agentRole,
    recommendation: finalRecommendation,
    executableWorkAvailable: Boolean(finalRecommendation),
  });

  return {
    status: 'ok',
    agent_id: agentId,
    agent_role: agentRole,
    role_binding: roleResolution.role_binding,
    role_resolution: roleResolution,
    identity_banner: identityBanner,
    identity_warning: null,
    stale_live_navigation: staleLiveNavigation,
    navigation_critical_field_quality: staleLiveNavigation.field_quality,
    stale_live_warning: staleLiveNavigation.warning,
    workloop_authority: workloopGuidance.authority,
    workloop_summary: workloopGuidance.summary,
    large_output_handling: workloopGuidance.large_output_handling,
    recommendation: finalRecommendation,
    executable_work_available: Boolean(finalRecommendation),
    agent_actionable_recommendation: Boolean(finalRecommendation),
    environment_pressure: environmentPressure,
    blocked_external: !finalRecommendation && restartRecommendation ? environmentPressure : null,
    recommendation_quality: staleLiveNavigation.field_quality.recommendation,
    in_progress: myInProgress.slice(0, limit),
    needs_continuation: myNeedsContinuation.slice(0, limit),
    pending_reviews: pendingReviews.slice(0, limit),
    all_in_review: board.pending_reviews.slice(0, limit),
    reviewed_closeouts: (board.reviewed_closeouts || []).slice(0, limit),
    local_followups: board.local_followups.slice(0, limit),
    role_wide_followups: (board.role_wide_followups || []).slice(0, limit),
    non_actionable_parent_followups: (board.non_actionable_parent_followups || []).slice(0, limit),
    closure_authority_conflicts: (board.closure_authority_conflicts || []).slice(0, limit),
    downstream_role_followups: (board.downstream_role_followups || []).slice(0, limit),
    claimed_terminal_blocked: (board.claimed_terminal_blocked || []).slice(0, limit),
    my_review_obligations: board.my_review_obligations.slice(0, limit),
    blocked_review_obligations: (board.blocked_review_obligations || []).slice(0, limit),
    deferred: board.deferred.slice(0, limit),
    actionable_deferred: board.actionable_deferred.slice(0, limit),
    inbox_backlog: board.inbox_backlog.slice(0, limit),
    inbox_linked_task_suppressed: (board.inbox_linked_task_suppressed || []).slice(0, limit),
    corrective_debt_readiness: correctiveDebtReadiness,
    recommendations: [
      ...(restartRecommendation ? [{
        type: 'mcp_restart_pressure',
        priority: staleLiveNavigation.status === 'degraded' ? 0 : 9,
        action: restartRecommendation.action,
        title: restartRecommendation.reason,
        authority_boundary: restartRecommendation.authority_boundary,
        agent_actionable: restartRecommendation.authority_boundary?.agent_can_execute_restart === true,
      }] : []),
      ...(correctiveDebtRecommendationListItem(correctiveDebtRecommendation) ? [correctiveDebtRecommendationListItem(correctiveDebtRecommendation)] : []),
      ...board.recommendations,
    ].slice(0, limit),
    new_tasks_available: board.new_tasks_available ?? false,
    recently_materialized: (board.recently_materialized || []).slice(0, limit),
    counts: responseCounts,
    schema: 'narada.task.mcp.next.v3',
    generated_at: generatedAt,
    workboard_generated_at: board.generated_at ?? null,
    state_freshness: computeStateFreshness(lastWorkboardCheckAt, generatedAt),
    mcp_freshness: mcpFreshness,
    mcp_restart_pressure: mcpRestartPressure,
  };
}

function renderTask(task) {
  if (!task) return '(none)';
  return `#${task.task_number} ${task.title} [${task.status}]`;
}

function summarizeWorkboardTask(task) {
  if (!task) return null;
  return {
    task_number: task.task_number,
    task_id: task.task_id,
    status: task.status,
    title: task.title,
    assigned_agent: task.assigned_agent ?? null,
    target_role: task.target_role ?? null,
    preferred_agent_id: task.preferred_agent_id ?? null,
    preferred_agent_relation: task.preferred_agent_relation ?? null,
    claim_authority: task.claim_authority ?? null,
    visibility: task.visibility ?? null,
    reason: task.reason ?? null,
    pre_claim_warnings: task.pre_claim_warnings ?? [],
    single_operator_review_risk: task.single_operator_review_risk ?? false,
    single_operator_review_kind: task.single_operator_review_kind ?? null,
    review_independence_for_querying_agent: task.review_independence_for_querying_agent ?? null,
  };
}

function buildWorkloopGuidance({ agentId, agentRole, recommendation, executableWorkAvailable }) {
  const task = recommendation?.task ?? null;
  const capa = recommendation?.capa ?? null;
  const summary = {
    schema: 'narada.task_lifecycle.workloop_summary.v0',
    agent_id: agentId,
    agent_role: agentRole ?? null,
    has_actionable_recommendation: Boolean(recommendation),
    executable_work_available: Boolean(executableWorkAvailable),
    recommended_action: recommendation?.action ?? null,
    recommended_reason: recommendation?.reason ?? null,
    recommended_task: task ? summarizeWorkboardTask(task) : null,
    recommended_task_number: task?.task_number ?? null,
    recommended_task_id: task?.task_id ?? null,
    recommended_capa: capa ? {
      capa_id: capa.capa_id ?? null,
      severity: capa.severity ?? null,
      concept_name: capa.concept_name ?? null,
      coverage_status: capa.coverage_status ?? null,
      remediation: capa.remediation ?? null,
    } : null,
    next_normal_step: recommendation?.action
      ? recommendation.action === 'corrective_debt_coverage'
        ? 'Act on corrective_debt_coverage by creating/linking a corrective implementation task, recording an explicit defer/blocker, or admitting a no-action rationale through the appropriate MCP surface.'
        : `Act on recommendation.${task?.task_number ? `task (#${task.task_number})` : 'payload'} through the appropriate MCP lifecycle surface.`
      : 'No task workboard action is available; standby-adjacent fallback checks are allowed.',
  };
  return {
    authority: {
      schema: 'narada.task_lifecycle.workloop_authority.v0',
      normal_workloop_surface: 'task_lifecycle_next',
      rule: 'When task_lifecycle_next is live and has an actionable recommendation, including corrective_debt_coverage, it is the normal workloop authority for task selection.',
      fallback_checks_allowed_when: [
        'task_lifecycle_next is unavailable',
        'task_lifecycle_next is live but has no actionable recommendation',
      ],
      fallback_checks: ['inbox_next', 'capa_queue', 'capability_next'],
      drift_guard: 'Do not run inbox/CAPA/capability fallback checks or diagnostic churn before acting on an actionable task_lifecycle_next recommendation.',
      builder_claim_guidance: 'Builder agents should claim/select the top task_lifecycle_next recommendation. If full output is large, use workloop_summary.recommended_task_number before opening large arrays.',
    },
    summary,
    large_output_handling: {
      schema: 'narada.task_lifecycle.large_output_handling.v0',
      primary_fields: ['workloop_summary', 'recommendation', 'agent_actionable_recommendation', 'counts'],
      rule: 'Use compact fields first; full arrays are supporting evidence only.',
      if_output_ref: 'Read only enough output to obtain workloop_summary or recommendation, then inspect/claim the recommended task instead of loading full diagnostic payloads.',
    },
  };
}

function renderHuman(result) {
  const lines = [
    result.identity_banner,
    `Generated: ${result.generated_at}`,
    `Schema: ${result.schema}`,
    '',
  ];
  if (result.stale_live_warning) {
    lines.push(`Stale-live warning: ${result.stale_live_warning}`);
    lines.push('');
  }

  if (result.recommendation) {
    lines.push(`Recommendation: ${result.recommendation.action}`);
    lines.push(`Reason: ${result.recommendation.reason}`);
    if (result.recommendation.task) lines.push(`Task: ${renderTask(result.recommendation.task)}`);
    if (result.recommendation.obligation) {
      const obligation = result.recommendation.obligation;
      lines.push(`Obligation: ${obligation.kind ?? 'review'} for #${obligation.task_number}`);
    }
    if (result.recommendation.inbox_item) {
      const item = result.recommendation.inbox_item;
      lines.push(`Inbox: ${item.envelope_id} ${item.title}`);
    }
    if (result.recommendation.capa) {
      const item = result.recommendation.capa;
      lines.push(`CAPA: ${item.capa_id} ${item.concept_name ?? ''}`.trim());
      lines.push(`Coverage: ${item.coverage_status ?? 'unknown'}`);
    }
  } else {
    lines.push('Recommendation: none');
    if (result.environment_pressure?.status === 'active') {
      lines.push('Reason: No executable task work is available for this agent; external environment pressure remains.');
      lines.push(`Environment pressure: ${result.environment_pressure.pressure?.reason ?? 'external pressure active'}`);
    } else {
      lines.push('Reason: No active work, review obligations, local followups, deferred work, or high-severity inbox items are available.');
    }
  }

  lines.push('');
  lines.push(`In progress: ${result.counts.in_progress}`);
  for (const task of result.in_progress) lines.push(`  - ${renderTask(task)}`);
  lines.push(`Needs continuation: ${result.counts.needs_continuation}`);
  for (const task of result.needs_continuation) lines.push(`  - ${renderTask(task)}`);
  lines.push(`Review obligations: ${result.my_review_obligations.length}`);
  for (const obligation of result.my_review_obligations) lines.push(`  - #${obligation.task_number} ${obligation.title ?? obligation.kind}`);
  lines.push(`Local followups: ${result.counts.local_followups}`);
  for (const task of result.local_followups) lines.push(`  - ${renderTask(task)}`);
  lines.push(`Downstream role followups: ${result.counts.downstream_role_followups ?? 0}`);
  for (const task of result.downstream_role_followups ?? []) lines.push(`  - ${renderTask(task)} (not claim-authorized for ${result.agent_role ?? 'unknown'} role)`);
  lines.push(`Inbox backlog: ${result.counts.inbox_total ?? result.inbox_backlog.length}`);
  lines.push(`Corrective debt missing coverage: ${result.counts.corrective_debt_missing_coverage ?? 0}`);
  lines.push(`State freshness: ${result.state_freshness.status} (${result.state_freshness.reason})`);

  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv);
const cwd = args.cwd || process.cwd();
const agentId = args.agentId;

if (!agentId) {
  console.error(
    'Usage: node task-next.mjs [<cwd>] <agent_id> [--json] [--limit <n>] [--last-workboard-check-at <iso>]\n\n' +
    '  <agent_id>              Agent identity (e.g. narada-andrey.Bob)\n' +
    '  --json                  Emit task_lifecycle_next-compatible JSON\n' +
    '  --limit <n>             Max items per section (default: 8)\n' +
    '  --last-workboard-check-at <iso>  ISO timestamp of last check for freshness compute'
  );
  process.exit(1);
}

const store = openTaskLifecycleStore(cwd);
try {
  const result = buildNextPayload({
    store,
    cwd,
    agentId,
    limit: args.limit,
    lastWorkboardCheckAt: args.lastWorkboardCheckAt,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    process.stdout.write(renderHuman(result));
  }
} finally {
  store.db.close();
}
