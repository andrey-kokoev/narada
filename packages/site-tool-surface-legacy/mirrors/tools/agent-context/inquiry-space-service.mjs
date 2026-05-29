export const ISN_PLANES = new Set([
  'discovery',
  'selection',
  'de_arbitrization',
  'coverage',
  'execution',
  'verification',
  'integration',
]);

export function validateIsnPlane(plane) {
  if (!ISN_PLANES.has(plane)) {
    throw new Error(`invalid_isn_plane: ${plane}`);
  }
}

export function buildIsnPayload({ nodeId, title, plane, status, summary, authorityOwner, relations, evidenceRefs, nextMovement, linkedTaskNumber, createdBy, updatedBy, createdAt, updatedAt }) {
  return {
    schema: 'narada.inquiry_space.node.v0',
    node_id: nodeId,
    title,
    plane,
    status,
    summary,
    authority_owner: authorityOwner,
    relations,
    evidence_refs: evidenceRefs,
    next_movement: nextMovement ?? null,
    linked_task_number: linkedTaskNumber,
    created_by: createdBy,
    updated_by: updatedBy,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function buildIsnEventPayload({ eventId, nodeId, eventType, fromPlane, toPlane, actorAgentId, reason, payload, createdAt }) {
  return {
    schema: 'narada.inquiry_space.node_event.v0',
    event_id: eventId,
    node_id: nodeId,
    event_type: eventType,
    from_plane: fromPlane,
    to_plane: toPlane,
    actor_agent_id: actorAgentId,
    reason: reason ?? null,
    node: payload,
    created_at: createdAt,
  };
}

export function parseIsnRow(row, parseJsonField, { includePayload = false } = {}) {
  const parsed = {
    node_id: row.node_id,
    title: row.title,
    plane: row.plane,
    status: row.status,
    summary: row.summary,
    authority_owner: parseJsonField(row.authority_owner_json, { kind: 'unreadable' }),
    relations: parseJsonField(row.relations_json, []),
    evidence_refs: parseJsonField(row.evidence_refs_json, []),
    next_movement: parseJsonField(row.next_movement_json, null),
    linked_task_number: row.linked_task_number,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (includePayload) parsed.payload = parseJsonField(row.payload_json, null);
  return parsed;
}

export function parseIsnEventRow(row, parseJsonField) {
  return {
    event_id: row.event_id,
    node_id: row.node_id,
    event_type: row.event_type,
    from_plane: row.from_plane,
    to_plane: row.to_plane,
    actor_agent_id: row.actor_agent_id,
    reason: row.reason,
    created_at: row.created_at,
    payload: parseJsonField(row.payload_json, null),
  };
}

export function buildMovementSequencePayload({ sequenceId, agentId, title, summary, startingNodeRef, requestedStepCount, completedStepCount, terminationReason, driftSummary, linkedArtifacts, disciplineProfile, createdAt, updatedAt }) {
  return {
    schema: 'narada.inquiry_space.movement_sequence.v0',
    sequence_id: sequenceId,
    agent_id: agentId,
    title: title ?? null,
    summary: summary ?? null,
    starting_node_ref: startingNodeRef ?? null,
    requested_step_count: requestedStepCount,
    completed_step_count: completedStepCount,
    termination_reason: terminationReason ?? null,
    drift_summary: driftSummary,
    linked_artifacts: linkedArtifacts,
    discipline_profile: disciplineProfile,
    observational_only: true,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function buildMovementTracePayload({ movementId, sequenceId, stepIndex, agentId, createdAt, navigationPlane, nodeType, isnNodeId, linkedTaskNumber, beforeState, afterState, observedDrift, actionTaken, evidenceRefs, nextPressure, disciplineProfile }) {
  return {
    schema: 'narada.inquiry_space.movement_trace.v0',
    movement_id: movementId,
    sequence_id: sequenceId ?? null,
    step_index: stepIndex,
    agent_id: agentId,
    created_at: createdAt,
    navigation_plane: navigationPlane,
    node_type: nodeType,
    isn_node_id: isnNodeId ?? null,
    linked_task_number: linkedTaskNumber,
    before_state: beforeState,
    after_state: afterState,
    observed_drift: observedDrift,
    action_taken: actionTaken,
    evidence_refs: evidenceRefs,
    next_pressure: nextPressure,
    discipline_profile: disciplineProfile,
    observational_only: true,
    task_lifecycle_authority_preserved: true,
    isn_authority_preserved: true,
  };
}

export function parseMovementTraceRow(row, parseJsonField, { includePayload = false } = {}) {
  const parsed = {
    movement_id: row.movement_id,
    sequence_id: row.sequence_id,
    step_index: row.step_index,
    agent_id: row.agent_id,
    created_at: row.created_at,
    navigation_plane: row.navigation_plane,
    node_type: row.node_type,
    isn_node_id: row.isn_node_id,
    linked_task_number: row.linked_task_number,
    before_state: parseJsonField(row.before_state_json, {}),
    after_state: parseJsonField(row.after_state_json, {}),
    observed_drift: parseJsonField(row.observed_drift_json, {}),
    action_taken: parseJsonField(row.action_taken_json, {}),
    evidence_refs: parseJsonField(row.evidence_refs_json, []),
    next_pressure: parseJsonField(row.next_pressure_json, {}),
    discipline_profile: parseJsonField(row.discipline_profile_json, {}),
  };
  if (includePayload) parsed.payload = parseJsonField(row.payload_json, null);
  return parsed;
}

export function parseMovementSequenceRow(row, parseJsonField, { includePayload = false } = {}) {
  const payload = parseJsonField(row.payload_json, {});
  const parsed = {
    sequence_id: row.sequence_id,
    agent_id: row.agent_id,
    title: payload?.title ?? null,
    summary: payload?.summary ?? null,
    starting_node_ref: row.starting_node_ref,
    requested_step_count: row.requested_step_count,
    completed_step_count: row.completed_step_count,
    termination_reason: row.termination_reason,
    drift_summary: parseJsonField(row.drift_summary_json, {}),
    linked_artifacts: parseJsonField(row.linked_artifacts_json, []),
    discipline_profile: parseJsonField(row.discipline_profile_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (includePayload) parsed.payload = payload || null;
  return parsed;
}
