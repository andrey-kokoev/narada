export function createSessionActivitySnapshot(state = {}) {
  const requestOutcomeCounts = state.requestOutcomeCounts ?? {};
  const requestIssueCounts = state.requestIssueCounts ?? {};
  const requestPosture = summarizeRequestPosture(requestOutcomeCounts);
  return {
    session_event_count: Number(state.sessionEventCount ?? 0),
    last_event_kind: state.lastEventKind ?? null,
    last_event_at: state.lastEventAt ?? null,
    last_terminal_state: state.lastTerminalState ?? null,
    ...requestPosture,
    request_outcome_counts: requestOutcomeCounts,
    request_outcome_summary: summarizeCounts(requestOutcomeCounts),
    request_issue_counts: requestIssueCounts,
    request_issue_summary: summarizeCounts(requestIssueCounts),
  };
}

export function createOperationalPostureSnapshot({ state = {}, mcpOperationalState = 'unknown' } = {}) {
  const requestPosture = summarizeRequestPosture(state.requestOutcomeCounts ?? {}).request_posture;
  let posture = 'healthy';
  if (mcpOperationalState === 'runtime_faulted') posture = 'mcp_runtime_faulted';
  else if (mcpOperationalState === 'startup_degraded') posture = 'mcp_startup_degraded';
  else if (requestPosture === 'runtime_failures') posture = 'request_runtime_failures';
  else if (requestPosture === 'invalid_control_traffic') posture = 'request_invalid_control_traffic';
  else if (requestPosture === 'closed_session_retries') posture = 'request_closed_session_retries';
  else if (state.closed) posture = 'closed';
  return {
    operational_posture: posture,
    operational_posture_display: posture === 'healthy' ? 'healthy' : `${posture} [mcp=${mcpOperationalState}; request=${requestPosture}; lifecycle=${state.closed ? 'closed' : 'none'}]`,
    recommended_action: requestPosture === 'invalid_control_traffic' ? 'review_invalid_control_traffic' : state.closed ? 'session_closed' : 'review_session_summary',
    recommended_action_display: requestPosture === 'invalid_control_traffic' ? 'review invalid control traffic' : state.closed ? 'session closed' : 'review session summary',
  };
}

export function classifyRequestIssueOutcome(issueCode) {
  if (issueCode === 'invalid_json' || issueCode === 'invalid_request' || issueCode === 'message_required') return 'invalid_request';
  if (issueCode === 'session_closed') return 'rejected_closed';
  if (issueCode === 'request_dispatch_failed') return 'dispatch_failure';
  return 'request_error';
}

export function summarizeRequestPosture(requestOutcomeCounts = {}) {
  const counts = {
    invalid_control_traffic: Number(requestOutcomeCounts.invalid_request ?? 0),
    closed_session_retries: Number(requestOutcomeCounts.rejected_closed ?? 0),
    runtime_failures: Number(requestOutcomeCounts.dispatch_failure ?? 0) + Number(requestOutcomeCounts.request_runtime_failure ?? 0) + Number(requestOutcomeCounts.request_error ?? 0),
  };
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return { request_outcome_total: 0, request_posture: 'clean', request_posture_display: 'clean' };
  const order = ['runtime_failures', 'invalid_control_traffic', 'closed_session_retries'];
  const [requestPosture] = order.map((key) => [key, counts[key]]).sort((left, right) => right[1] - left[1] || order.indexOf(left[0]) - order.indexOf(right[0]))[0];
  return { request_outcome_total: total, request_posture: requestPosture, request_posture_display: `${requestPosture} (${total})` };
}

export function sessionHandoffs({ identity, session, eventCount = 20 } = {}) {
  if (!identity || !session) return {};
  const base = `narada-agent-cli --identity ${identity} --session ${session}`;
  return {
    session_operations: `${base} --session-operations`,
    session_operations_json: `${base} --session-operations-json`,
    session_read: `${base} --session-read`,
    session_read_json: `${base} --session-read-json`,
    session_recovery: `${base} --session-recovery`,
    session_recovery_json: `${base} --session-recovery-json`,
    session_events: `${base} --session-events --session-events-filter all --session-events-count ${eventCount}`,
    session_events_issues: `${base} --session-events --session-events-filter issues --session-events-count ${eventCount}`,
    session_events_diagnostics: `${base} --session-events --session-events-filter diagnostics --session-events-count ${eventCount}`,
  };
}

export function summarizeCounts(counts = {}) {
  const entries = Object.entries(counts).filter(([, value]) => Number(value ?? 0) > 0);
  if (entries.length === 0) return '0';
  return entries.map(([key, value]) => `${key}:${value}`).join(', ');
}

export function mcpServerSummaryEntries(mcpServers) {
  return Object.entries(mcpServers ?? {}).map(([server_name, server]) => ({ server_name, tool_count: server.tools?.length ?? 0, operational_state: 'healthy' }));
}
