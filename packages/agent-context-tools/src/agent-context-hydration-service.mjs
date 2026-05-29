import { createHash } from 'node:crypto';

export function buildCheckpointPayload({ checkpointId, agentId, sessionId = null, checkpointAt, activeTask = null, filesTouched = [], keyDecisions = [], openQuestions = [], gitHead = null, lastWorkboardCheckAt = null, nextIntendedAction = null, authorityBasis = null, continuationBlockers = [], evidenceRefs = [], worktreeState = null, tacticalResumeNotes = [] }) {
  return {
    schema: 'narada.agent_context.checkpoint.v0',
    checkpoint_id: checkpointId,
    agent_id: agentId,
    session_id: sessionId,
    checkpoint_at: checkpointAt,
    active_task: activeTask,
    files_touched: filesTouched,
    key_decisions: keyDecisions,
    open_questions: openQuestions,
    git_head: gitHead,
    last_workboard_check_at: lastWorkboardCheckAt,
    next_intended_action: nextIntendedAction,
    authority_basis: authorityBasis,
    continuation_blockers: continuationBlockers,
    evidence_refs: evidenceRefs,
    worktree_state: worktreeState,
    tactical_resume_notes: tacticalResumeNotes,
  };
}

export function checkpointFromPayloadRow(row, payload) {
  return {
    checkpoint_id: row.checkpoint_id,
    agent_id: row.agent_id,
    session_id: row.session_id,
    checkpoint_at: row.checkpoint_at,
    archived_at: row.archived_at,
    git_head: row.git_head,
    active_task: payload?.active_task ?? null,
    files_touched: payload?.files_touched ?? [],
    key_decisions: payload?.key_decisions ?? [],
    open_questions: payload?.open_questions ?? [],
    last_workboard_check_at: payload?.last_workboard_check_at ?? null,
    next_intended_action: payload?.next_intended_action ?? null,
    authority_basis: payload?.authority_basis ?? null,
    continuation_blockers: payload?.continuation_blockers ?? [],
    evidence_refs: payload?.evidence_refs ?? [],
    worktree_state: payload?.worktree_state ?? null,
    tactical_resume_notes: payload?.tactical_resume_notes ?? [],
    payload_schema: payload?.schema ?? null,
  };
}

export function buildResumeBrief({ agentId, role, checkpoint, taskLifecycleNext, recommendedNextAction, hydratedAt, workboardFreshnessInput, provenance, groundingEvent }) {
  return {
    schema: 'narada.agent_context.resume_brief.v0',
    hydrated_at: hydratedAt ?? null,
    agent_id: agentId,
    role,
    checkpoint_status: checkpoint?.status ?? 'unknown',
    grounding_event_id: groundingEvent?.event_id ?? null,
    grounding_status: groundingEvent?.grounding_status ?? null,
    active_task: checkpoint?.active_task ?? null,
    checkpoint_next_intended_action: checkpoint?.next_intended_action ?? null,
    current_recommended_next_action: recommendedNextAction,
    current_workloop_summary: taskLifecycleNext?.workloop_summary ?? null,
    current_workloop_authority: taskLifecycleNext?.workloop_authority ?? null,
    large_output_handling: taskLifecycleNext?.large_output_handling ?? null,
    authority_basis: checkpoint?.authority_basis ?? null,
    continuation_blockers: checkpoint?.continuation_blockers ?? [],
    evidence_refs: checkpoint?.evidence_refs ?? [],
    worktree_state: checkpoint?.worktree_state ?? null,
    tactical_resume_notes: checkpoint?.tactical_resume_notes ?? [],
    checkpoint_last_workboard_check_at: checkpoint?.last_workboard_check_at ?? null,
    workboard_freshness_input: workboardFreshnessInput ?? null,
    provenance: provenance ?? null,
    task_lifecycle_next_generated_at: taskLifecycleNext?.generated_at ?? null,
    workboard_generated_at: taskLifecycleNext?.workboard_generated_at ?? null,
    last_workboard_check_at: workboardFreshnessInput?.last_workboard_check_at ?? checkpoint?.last_workboard_check_at ?? null,
    state_freshness: taskLifecycleNext?.state_freshness ?? null,
  };
}

export function buildHydrationGrounding({ detail, whoami, capabilityPolicy, checkpoint, taskLifecycleNext, regroundResult }) {
  if (!regroundResult?.ok) {
    return {
      status: 'unavailable',
      provenance: 'unavailable',
      layers: buildGroundingLayers({ whoami, capabilityPolicy, checkpoint, taskLifecycleNext, reground: null, regroundAvailable: false }),
      payload: {
        status: 'unavailable',
        mode: detail,
        message: regroundResult?.error ?? 'reground_unavailable',
      },
    };
  }

  const value = regroundResult.value;
  const status = computeGroundingStatus(value);
  const layers = buildGroundingLayers({ whoami, capabilityPolicy, checkpoint, taskLifecycleNext, reground: value, regroundAvailable: true });
  return {
    status,
    provenance: detail,
    layers,
    payload: shapeDoctrinePayload(value, detail, status, layers),
  };
}

export function computeGroundingStatus(reground) {
  const localAvailable = reground?.corpus_status?.local_sources?.all_available === true;
  const thoughtsAvailable = reground?.corpus_status?.thoughts_corpus?.available === true;
  if (localAvailable && thoughtsAvailable) return 'grounded';
  if (localAvailable || thoughtsAvailable) return 'degraded';
  return 'unavailable';
}

export function buildGroundingLayers({ whoami, capabilityPolicy, checkpoint, taskLifecycleNext, reground, regroundAvailable }) {
  return {
    identity: whoami?.status === 'ok' ? 'loaded' : 'missing',
    capability_policy: capabilityPolicy ? 'loaded' : 'missing',
    local_doctrine_sources: regroundAvailable && reground?.corpus_status?.local_sources?.all_available ? 'loaded' : 'missing',
    thoughts_corpus: regroundAvailable && reground?.corpus_status?.thoughts_corpus?.available ? 'loaded' : 'missing',
    checkpoint: checkpoint?.status === 'ok' ? 'loaded' : checkpoint?.status === 'no_checkpoint' ? 'missing' : 'degraded',
    workboard: taskLifecycleNext?.status === 'ok' ? 'loaded' : 'degraded',
  };
}

export function shapeDoctrinePayload(reground, detail, groundingStatus, groundingLayers) {
  const base = {
    status: 'ok',
    mode: detail,
    schema: reground.schema,
    generated_at: reground.generated_at,
    grounding_status: groundingStatus,
    grounding_layers: groundingLayers,
    corpus_status: reground.corpus_status,
  };

  if (detail === 'status') return base;
  if (detail === 'summary') {
    return {
      ...base,
      posture_summary: reground.posture_summary,
      doctrine_catalog: reground.doctrine_catalog,
    };
  }
  if (detail === 'reground') {
    const { source_excerpts, site_root, ...compact } = reground;
    return {
      ...compact,
      status: 'ok',
      mode: detail,
      grounding_status: groundingStatus,
      grounding_layers: groundingLayers,
    };
  }
  return {
    ...reground,
    status: 'ok',
    mode: detail,
    grounding_status: groundingStatus,
    grounding_layers: groundingLayers,
  };
}

export function buildGroundingSourceHashes(sourceRefs, readText) {
  const hashes = [];
  for (const source of sourceRefs ?? []) {
    if (!source?.path || typeof readText !== 'function') continue;
    try {
      hashes.push({
        path: source.path,
        sha256: createHash('sha256').update(readText(source.path)).digest('hex'),
      });
    } catch {
      hashes.push({ path: source.path, sha256: null, unreadable: true });
    }
  }
  return hashes;
}
