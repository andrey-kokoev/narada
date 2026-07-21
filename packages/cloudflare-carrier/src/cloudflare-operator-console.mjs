/** Dedicated operator-console asset source and browser state classifiers. */

export function classifyCloudflareOperationCommandState(input = {}) {
  const operationId = String(input.operation_id || '').trim();
  const isActive = input.is_active === true || input.active === 'yes';
  const scopeLoaded = input.scope_loaded === true || input.scope_loaded === 'yes';
  const sessionCount = Number(input.session_count ?? input.sessions ?? 0) || 0;
  const sessionInhabitanceCount = Number(input.session_inhabitance_count ?? input.effective_sessions ?? sessionCount) || 0;
  const evidenceLoaded = input.evidence_loaded === true || input.evidence_loaded === 'yes';
  const pathAction = String(input.operation_path_next_action || input.command_action || 'read_operation_scope');
  const commandState = pathAction === 'inspect_attention' ? 'attention_required'
    : pathAction === 'inspect_open_task' ? 'task_work_open'
    : pathAction === 'inspect_operation_evidence' ? 'evidence_ready'
    : pathAction === 'read_operation_evidence' ? 'evidence_needed'
    : pathAction === 'start_or_select_session' ? 'session_needed'
    : pathAction === 'read_operation_scope' ? 'scope_needed'
    : 'operation_focus_needed';
  const nextAction = !operationId ? 'select_or_create_operation'
    : !isActive ? 'use_focused_operation'
    : !scopeLoaded ? 'read_operation_scope'
    : sessionInhabitanceCount === 0 ? 'start_or_select_session'
    : evidenceLoaded ? 'inspect_operation_evidence' : 'read_operation_evidence';
  return {
    command_state: commandState,
    command_action: pathAction,
    next_action: nextAction,
  };
}

export function shouldPromoteOperationOperatorFocus(operation = null, next = {}) {
  const status = String(operation?.status ?? '').toLowerCase();
  if (!['monitor_operation', 'start_or_select_session'].includes(next?.action)) return false;
  return status !== 'closed';
}

export function classifyCloudflareAuthorityCommandState(input = {}) {
  const decisionCount = Number(input.decision_count ?? input.decisions ?? 0) || 0;
  const refusalCount = Number(input.refusal_count ?? input.refusals ?? 0) || 0;
  const unresolvedLocusCount = Number(input.unresolved_locus_count ?? input.unresolved_locus ?? 0) || 0;
  const evidenceLoaded = input.evidence_loaded === true || input.evidence_loaded === 'yes';
  const nextAction = decisionCount === 0 ? 'read_site_authority'
    : refusalCount > 0 ? 'inspect_refused_authority'
    : unresolvedLocusCount > 0 ? 'resolve_authority_locus'
    : evidenceLoaded ? 'monitor_authority_admissions' : 'focus_authority_evidence';
  const commandState = nextAction === 'read_site_authority' ? 'authority_needed'
    : nextAction === 'inspect_refused_authority' ? 'refusal_requires_review'
    : nextAction === 'resolve_authority_locus' ? 'locus_unresolved'
    : nextAction === 'focus_authority_evidence' ? 'evidence_needed'
    : 'admissions_monitoring';
  return {
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareSessionCommandState(input = {}) {
  const sessionId = String(input.session_id || '').trim();
  const isActive = input.is_active === true || input.active === 'yes';
  const evidenceLoaded = input.evidence_loaded === true || input.evidence_loaded === 'yes';
  const nextAction = !sessionId ? 'select_or_start_session'
    : !isActive ? 'use_focused_session'
    : evidenceLoaded ? 'inspect_session_evidence' : 'read_session_evidence';
  const commandState = nextAction === 'select_or_start_session' ? 'session_needed'
    : nextAction === 'use_focused_session' ? 'session_focus_needed'
    : nextAction === 'read_session_evidence' ? 'evidence_needed'
    : 'evidence_ready';
  return {
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareTaskCommandState(input = {}) {
  const taskId = String(input.task_id || '').trim();
  const status = String(input.status || input.lifecycle || '').toLowerCase();
  const lifecycle = ['open', 'todo', 'pending'].includes(status) ? 'open'
    : ['done', 'resolved', 'closed'].includes(status) ? 'closed'
    : status || 'unknown';
  const evidenceCount = Number(input.evidence_count ?? input.evidence_events ?? 0) || 0;
  const nextAction = !taskId ? 'select_task'
    : lifecycle === 'open' ? 'mark_done_or_update'
    : lifecycle === 'closed' ? 'reopen_or_inspect_evidence'
    : 'normalize_status_or_update';
  const commandState = nextAction === 'select_task' ? 'task_needed'
    : nextAction === 'mark_done_or_update' ? 'task_work_open'
    : nextAction === 'reopen_or_inspect_evidence' ? (evidenceCount > 0 ? 'evidence_ready' : 'evidence_needed')
    : 'status_needs_normalization';
  return {
    lifecycle,
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareEvidenceCommandState(event = {}, options = {}) {
  const kind = event.event_kind || '';
  const payload = event.payload || {};
  const siteAuthority = payload.site_authority_decision || {};
  const parsedTaskId = options.parsed_task_id || null;
  const taskId = payload.task_id || payload.task?.task_id || parsedTaskId || null;
  const lane = kind.includes('failed') || kind.includes('rejected') || payload.status === 'failed' || payload.admission_action === 'deny' || payload.action === 'refuse' ? 'failures'
    : kind.startsWith('directive_') || payload.directive_kind || payload.directive_id ? 'directives'
    : kind.includes('authority') || payload.site_authority_decision || payload.authority_ref ? 'authority'
    : kind.includes('tool') || payload.tool_name || payload.capability_ref || payload.effect_scope ? 'tools'
    : kind.startsWith('provider_') || kind.startsWith('turn_') || payload.provider || payload.provider_adapter_kind ? 'provider'
    : kind.includes('input') || kind === 'carrier_command_executed' || kind === 'carrier_session_started' ? 'input'
    : 'other';
  const targetType = taskId ? 'task'
    : payload.directive_id ? 'attention'
    : siteAuthority.action || payload.authority_ref ? 'authority'
    : payload.tool_name || payload.capability_ref ? 'tool_effect'
    : event.carrier_session_id ? 'session'
    : 'evidence';
  const targetRef = taskId
    || payload.directive_id
    || siteAuthority.mutation_class
    || payload.tool_name
    || event.carrier_session_id
    || event.event_kind
    || 'none';
  const nextAction = lane === 'failures' ? 'inspect_failure_and_retry_or_escalate'
    : lane === 'authority' ? 'inspect_authority_locus'
    : lane === 'tools' ? (payload.status === 'failed' ? 'inspect_tool_failure' : 'inspect_tool_effect')
    : lane === 'directives' ? 'resolve_or_acknowledge_directive'
    : lane === 'provider' ? 'inspect_provider_turn'
    : lane === 'input' ? 'trace_input_lifecycle'
    : 'inspect_evidence_payload';
  const commandState = lane === 'failures' ? 'failure_requires_review'
    : lane === 'authority' ? 'authority_locus_review'
    : lane === 'tools' ? (payload.status === 'failed' ? 'tool_failure_review' : 'tool_effect_review')
    : lane === 'directives' ? 'directive_requires_resolution'
    : lane === 'provider' ? 'provider_turn_review'
    : lane === 'input' ? 'input_lifecycle_trace'
    : 'payload_review';
  return {
    lane,
    target_type: targetType,
    target_ref: targetRef,
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareSiteCommandState(input = {}) {
  const siteId = String(input.site_id || '').trim();
  const scopeLoaded = input.scope_loaded === true || input.scope_loaded === 'yes';
  const membershipCount = Number(input.membership_count ?? input.memberships ?? 0) || 0;
  const operationCount = Number(input.operation_count ?? input.operations ?? 0) || 0;
  const authorityCount = Number(input.authority_count ?? input.authority_items ?? 0) || 0;
  const nextAction = !siteId ? 'select_site'
    : !scopeLoaded ? 'read_site_scope'
    : membershipCount === 0 ? 'load_or_create_membership'
    : operationCount === 0 ? 'create_or_select_operation'
    : authorityCount === 0 ? 'read_site_authority'
    : 'inspect_site_operations';
  const commandState = nextAction === 'select_site' ? 'site_needed'
    : nextAction === 'read_site_scope' ? 'scope_needed'
    : nextAction === 'load_or_create_membership' ? 'membership_needed'
    : nextAction === 'create_or_select_operation' ? 'operation_needed'
    : nextAction === 'read_site_authority' ? 'authority_needed'
    : 'site_operations_ready';
  return {
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function classifyCloudflareMembershipCommandState(input = {}) {
  const principal = String(input.principal || input.principal_id || input.email || '').trim();
  const siteLoaded = input.site_loaded === true || input.site_loaded === 'yes';
  const known = input.known === true || input.known_membership === true || input.known_membership === 'yes';
  const status = String(input.status || 'unknown').toLowerCase();
  const authorityLoaded = input.authority_loaded === true || input.authority_loaded === 'yes';
  const nextAction = !principal ? 'enter_principal'
    : !siteLoaded ? 'read_membership_site'
    : !known ? 'put_membership'
    : status !== 'active' ? 'inspect_inactive_membership'
    : !authorityLoaded ? 'focus_membership_authority'
    : 'monitor_membership_authority';
  const commandState = nextAction === 'enter_principal' ? 'principal_needed'
    : nextAction === 'read_membership_site' ? 'site_scope_needed'
    : nextAction === 'put_membership' ? 'membership_write_needed'
    : nextAction === 'inspect_inactive_membership' ? 'membership_inactive'
    : nextAction === 'focus_membership_authority' ? 'authority_needed'
    : 'membership_authority_monitoring';
  return {
    command_state: commandState,
    command_action: nextAction,
    next_action: nextAction,
  };
}

export function renderCloudflareCarrierConsole() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Narada Cloudflare Carrier</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f5ef; color: #1e2024; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(180deg, #fbfaf6 0%, #eef2f1 100%); }
    header { padding: 24px clamp(16px, 4vw, 48px) 12px; border-bottom: 1px solid #d7d7ce; background: rgba(255,255,255,.74); backdrop-filter: blur(10px); }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; letter-spacing: 0; }
    header p { margin: 6px 0 0; color: #5c626b; font-size: 14px; }
    main { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 16px; padding: 16px clamp(16px, 4vw, 48px) 32px; }
    section, aside { background: rgba(255,255,255,.86); border: 1px solid #d7d7ce; border-radius: 8px; }
    aside { padding: 16px; align-self: start; }
    section { min-height: calc(100vh - 150px); display: grid; grid-template-rows: auto minmax(220px, 1fr) auto; overflow: hidden; }
    label { display: block; margin: 0 0 12px; font-size: 12px; font-weight: 700; color: #343941; }
    input, select, textarea { width: 100%; margin-top: 6px; padding: 10px 12px; border: 1px solid #c5c7bf; border-radius: 6px; background: #fff; color: #1e2024; font: inherit; }
    textarea { min-height: 92px; resize: vertical; }
    button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 8px 12px; border: 1px solid #1f6f62; border-radius: 6px; background: #1f6f62; color: #fff; font-weight: 700; cursor: pointer; }
    button.secondary { background: #fff; color: #1f6f62; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
    .status { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; }
    .metric { border: 1px solid #d7d7ce; border-radius: 6px; padding: 10px; background: #faf9f4; min-width: 0; }
    .metric b { display: block; font-size: 11px; color: #686d75; }
    .metric span { display: block; margin-top: 4px; overflow-wrap: anywhere; }
    .control-room { margin-top: 16px; border: 1px solid #cfd7d2; border-radius: 8px; padding: 12px; background: #f5faf7; }
    .control-room h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0; color: #1f4e48; }
    .control-room-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .control-room-item { min-width: 0; border: 1px solid #d9dcd3; border-radius: 6px; padding: 8px; background: #fff; }
    .control-room-item b { display: block; font-size: 11px; color: #686d75; }
    .control-room-item span { display: block; margin-top: 4px; font-size: 12px; color: #1e2024; overflow-wrap: anywhere; }
    .attention-items { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .attention-item, .authority-decision, .operation-item, .session-item, .membership-item, .continuity-item, .shadow-read-item { border: 1px solid #d9dcd3; border-radius: 6px; padding: 9px; background: #fff; cursor: pointer; }
    .attention-item strong, .authority-decision strong, .operation-item strong, .session-item strong, .membership-item strong, .continuity-item strong, .shadow-read-item strong { display: block; font-size: 13px; color: #1f4e48; overflow-wrap: anywhere; }
    .attention-item span, .authority-decision span, .operation-item span, .session-item span, .membership-item span, .continuity-item span, .shadow-read-item span { display: block; margin-top: 4px; font-size: 12px; color: #686d75; overflow-wrap: anywhere; }
    .authority-decision.refuse strong { color: #9b3b22; }
    .authority-decision.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .operation-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .session-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .attention-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .membership-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .continuity-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .shadow-read-item.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .task-panel { margin-top: 16px; border-top: 1px solid #d7d7ce; padding-top: 14px; }
    .task-panel h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0; }
    .tasks { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .task { border: 1px solid #d9dcd3; border-radius: 6px; padding: 9px; background: #fff; cursor: pointer; }
    .task.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .task strong { display: block; font-size: 13px; color: #1f4e48; overflow-wrap: anywhere; }
    .task span { display: block; margin-top: 4px; font-size: 12px; color: #686d75; overflow-wrap: anywhere; }
    .product-panel { margin-top: 16px; border-top: 1px solid #d7d7ce; padding-top: 14px; }
    .product-panel h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0; }
    .overview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 12px 14px; border-bottom: 1px solid #d7d7ce; background: #faf9f4; }
    .overview-block { min-width: 0; border: 1px solid #d9dcd3; border-radius: 6px; padding: 10px; background: #fff; }
    .overview-block h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: 0; color: #1f4e48; }
    .overview-block ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .overview-block li { font-size: 12px; color: #343941; overflow-wrap: anywhere; }
    .overview-block b { color: #686d75; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #d7d7ce; }
    .toolbar h2 { margin: 0; font-size: 16px; letter-spacing: 0; }
    .event-filters { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr); gap: 8px; width: min(420px, 100%); }
    .event-filters label { margin: 0; }
    .evidence-lanes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 12px 14px; border-bottom: 1px solid #d7d7ce; background: #faf9f4; }
    .evidence-lane { min-width: 0; border: 1px solid #d9dcd3; border-radius: 6px; padding: 9px; background: #fff; cursor: pointer; }
    .evidence-lane.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .evidence-lane strong { display: block; font-size: 12px; color: #1f4e48; overflow-wrap: anywhere; }
    .evidence-lane span { display: block; margin-top: 4px; font-size: 12px; color: #686d75; overflow-wrap: anywhere; }
    .events { overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
    .evidence-focus { padding: 12px 14px; border-bottom: 1px solid #d7d7ce; background: #fff; }
    .evidence-focus h3 { margin: 0 0 6px; font-size: 13px; color: #1f4e48; letter-spacing: 0; }
    .evidence-focus span { display: block; font-size: 12px; color: #686d75; overflow-wrap: anywhere; }
    .evidence-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
    .evidence-field { min-width: 0; border: 1px solid #d9dcd3; border-radius: 6px; padding: 8px; background: #faf9f4; }
    .evidence-field b { display: block; font-size: 11px; color: #686d75; }
    .evidence-field span { margin-top: 4px; color: #1e2024; }
    .evidence-focus pre { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; color: #343941; }
    .event { border: 1px solid #d9dcd3; border-radius: 8px; padding: 10px; background: #fff; cursor: pointer; }
    .event.selected { border-color: #1f6f62; box-shadow: inset 0 0 0 1px #1f6f62; }
    .event strong { display: block; color: #1f4e48; font-size: 13px; overflow-wrap: anywhere; }
    .event span { display: block; margin-top: 4px; color: #686d75; font-size: 12px; overflow-wrap: anywhere; }
    .event pre { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; color: #343941; }
    .composer { padding: 12px 14px; border-top: 1px solid #d7d7ce; }
    .error { margin-top: 12px; color: #a5361f; font-size: 13px; overflow-wrap: anywhere; }
    .empty { color: #686d75; font-size: 14px; padding: 24px 4px; }
    @media (max-width: 840px) { main { grid-template-columns: 1fr; } section { min-height: 560px; } .evidence-lanes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  </style>
</head>
<body>
  <header>
    <h1>Narada Cloudflare Carrier</h1>
    <p>Authenticated operator console for Worker-hosted Operations, sessions, tasks, evidence, and authority decisions.</p>
  </header>
  <main>
    <aside>
      <label>Service token<input id="token" type="password" autocomplete="current-password" placeholder="Optional when signed in"></label>
      <label>Session ID<input id="sessionId" value="narada-cloudflare-console"></label>
      <label>Operation Sessions<select id="operationSessionSelect"><option value="">No operation sessions loaded</option></select></label>
      <label>Agent ID<input id="agentId" value="narada.cloudflare.agent"></label>
      <label>Site ID<input id="siteId" value="site_narada_cloudflare"></label>
      <label>Operation ID<input id="operationId" value="operation_narada_cloudflare_control"></label>
      <div class="actions">
        <button id="signInMicrosoft" class="secondary">Sign in with Microsoft</button>
        <button id="useSelectedSession" class="secondary">Use Session</button>
        <button id="readSessionEvidence" class="secondary">Read Session Evidence</button>
        <button id="start">Start / Resume</button>
        <button id="refresh" class="secondary">Refresh</button>
        <button id="readOperation" class="secondary">Read Operation</button>
        <button id="readSite" class="secondary">Read Site</button>
        <button id="autoRefreshOperation" class="secondary" aria-pressed="false">Auto Refresh</button>
      </div>
      <div class="status">
        <div class="metric"><b>Site</b><span id="siteStatus">unknown</span></div>
        <div class="metric"><b>Operation</b><span id="operationStatus">unknown</span></div>
        <div class="metric"><b>Active Session</b><span id="activeSession">none</span></div>
        <div class="metric"><b>Role</b><span id="membershipRole">unknown</span></div>
        <div class="metric"><b>Sessions</b><span id="sessionCount">0</span></div>
        <div class="metric"><b>Tasks</b><span id="taskCount">0</span></div>
        <div class="metric"><b>Evidence</b><span id="evidenceCount">0</span></div>
        <div class="metric"><b>Evidence Replay</b><span id="evidenceReplayStatus">unknown</span></div>
        <div class="metric"><b>Authority</b><span id="authorityCount">0</span></div>
        <div class="metric"><b>Continuity</b><span id="continuityCount">0</span></div>
        <div class="metric"><b>Provider</b><span id="provider">unknown</span></div>
        <div class="metric"><b>Effects</b><span id="effects">unknown</span></div>
        <div class="metric"><b>Events</b><span id="eventCount">0</span></div>
        <div class="metric"><b>Cursor</b><span id="cursor">0</span></div>
      </div>
      <div class="product-panel">
        <h2>Active Session Detail</h2>
        <div id="activeSessionDetail" class="evidence-summary"><div class="empty">No active session loaded.</div></div>
      </div>
      <div class="control-room">
        <h2>Control Room</h2>
        <div class="control-room-grid">
          <div class="control-room-item"><b>Operation</b><span id="controlOperation">none</span></div>
          <div class="control-room-item"><b>Product Scope</b><span id="controlProductScope">not loaded</span></div>
          <div class="control-room-item"><b>Operation Focus</b><span id="controlOperationFocus">none</span></div>
          <div class="control-room-item"><b>Selected Session</b><span id="controlSession">none</span></div>
          <div class="control-room-item"><b>Session Focus</b><span id="controlSessionFocus">none</span></div>
          <div class="control-room-item"><b>Authority Locus</b><span id="controlAuthorityLocus">unknown</span></div>
          <div class="control-room-item"><b>Authority Focus</b><span id="controlAuthorityFocus">none</span></div>
          <div class="control-room-item"><b>Operator</b><span id="controlOperator">anonymous</span></div>
          <div class="control-room-item"><b>Task Focus</b><span id="controlTaskFocus">none</span></div>
          <div class="control-room-item"><b>Attention</b><span id="controlAttention">0 open</span></div>
          <div class="control-room-item"><b>Evidence Focus</b><span id="controlEvidenceFocus">none</span></div>
          <div class="control-room-item"><b>Evidence Window</b><span id="controlEvidenceWindow">0 events</span></div>
          <div class="control-room-item"><b>Continuity</b><span id="controlContinuity">unknown</span></div>
          <div class="control-room-item"><b>Workbench Readiness</b><span id="controlWorkbenchReadiness">not loaded</span></div>
        </div>
        <h3>Control Room Action</h3>
        <div id="controlRoomActionSummary" class="evidence-summary"><div class="empty">No control room action loaded.</div></div>
        <div class="actions"><button id="controlRoomNextAction" class="secondary">Apply Control Room Next Action</button></div>
      </div>
      <div class="product-panel">
        <h2>Operator Route</h2>
        <div class="actions"><button id="operatorRouteNextAction" class="secondary">Focus Route Next Action</button></div>
        <div id="operatorRoute" class="attention-items"><div class="empty">No operator route loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Focused Operation Lifecycle</h2>
        <div id="focusedOperationLifecycle" class="evidence-summary"><div class="empty">No focused operation lifecycle loaded.</div></div>
        <div class="actions"><button id="focusedOperationLifecycleNextAction" class="secondary">Apply Lifecycle Next Action</button></div>
      </div>
      <div class="product-panel">
        <h2>Workbench Readiness Gate</h2>
        <div class="actions"><button id="workbenchReadinessNextAction" class="secondary">Focus Readiness Gap</button></div>
        <div id="workbenchReadinessGate" class="attention-items"><div class="empty">No workbench readiness loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Product Scope</h2>
        <div id="productScopeDetail" class="evidence-summary"><div class="empty">No product scope loaded.</div></div>
        <div class="actions">
          <button id="readOperationScope" class="secondary">Read Operation Scope</button>
          <button id="readSiteScope" class="secondary">Read Site Scope</button>
        </div>
      </div>
      <div class="product-panel">
        <h2>Operation Flight Deck</h2>
        <div id="operationFlightDeck" class="evidence-summary"><div class="empty">No operation product loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Persistence Posture</h2>
        <div id="persistencePostureDetail" class="evidence-summary"><div class="empty">No persistence posture loaded.</div></div>
        <div class="actions"><button id="persistenceNextAction" class="secondary">Apply Persistence Next Action</button></div>
        <div id="persistenceWorkflow" class="attention-items"><div class="empty">No persistence workflow loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Recovery Posture</h2>
        <div id="recoveryPostureDetail" class="evidence-summary"><div class="empty">No recovery posture loaded.</div></div>
        <label>Evidence Session Window<input id="carrierEvidenceSessionLimit" type="number" min="1" max="50" value="10"></label>
        <label>Evidence Session Offset<input id="carrierEvidenceSessionOffset" type="number" min="0" value="0"></label>
        <div class="actions">
          <button id="recoveryNextAction" class="secondary">Apply Recovery Next Action</button>
          <button id="loadNextRecoveryEvidenceWindow" class="secondary">Load Next Evidence Window</button>
          <button id="loadRecoveryEvidenceWindow" class="secondary">Load Evidence Window</button>
        </div>
        <div id="recoveryWorkflow" class="attention-items"><div class="empty">No recovery workflow loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Authority Transfer</h2>
        <div id="authorityTransferDetail" class="evidence-summary"><div class="empty">No authority transfer posture loaded.</div></div>
        <div class="actions"><button id="authorityTransferNextAction" class="secondary">Apply Authority Transfer Next Action</button></div>
        <div id="authorityTransferWorkflow" class="attention-items"><div class="empty">No authority transfer workflow loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Operation Activity Timeline</h2>
        <div id="operationActivityTimeline" class="attention-items"><div class="empty">No operation activity loaded.</div></div>
        <h3>Activity Focus</h3>
        <div id="operationActivityFocusDetail" class="evidence-summary"><div class="empty">No operation activity selected.</div></div>
        <div class="actions"><button id="operationActivityApplyFocus" class="secondary">Apply Activity Focus</button></div>
      </div>
      <div class="product-panel">
        <h2>Continuity Workflow</h2>
        <div class="actions"><button id="continuityWorkflowNextAction" class="secondary">Focus Next Workflow Step</button></div>
        <div id="continuityWorkflow" class="attention-items"><div class="empty">No continuity workflow loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Local-Cloud Continuity</h2>
        <div id="localCloudContinuityBridge" class="evidence-summary"><div class="empty">No local-cloud continuity loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Continuity Loop Evidence</h2>
        <div id="continuityLoopEvidence" class="evidence-summary"><div class="empty">No continuity loop evidence loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Runtime Posture</h2>
        <div id="runtimePostureDetail" class="evidence-summary"><div class="empty">No runtime status loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Operator Identity</h2>
        <div id="operatorIdentity" class="evidence-summary"><div class="empty">No operator session loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Operation Navigator</h2>
        <label>Create Operation ID
          <input id="newOperationId" value="operation_control" autocomplete="off">
        </label>
        <label>Create Operation Display Name
          <input id="newOperationDisplayName" value="Control Operation" autocomplete="off">
        </label>
        <label>Create Operation Kind
          <input id="newOperationKind" value="cloudflare_control" autocomplete="off">
        </label>
        <div class="actions">
          <button id="prepareFocusedSiteOperation" class="secondary">Prepare Focused Site Operation</button>
          <button id="createOperation" class="secondary">Create Operation</button>
        </div>
        <div id="operationNavigator" class="attention-items"><div class="empty">No site operations loaded.</div></div>
        <h3>Operation Posture</h3>
        <div id="operationPostureOverview" class="evidence-summary"><div class="empty">No operation posture loaded.</div></div>
        <div class="actions"><button id="operationPostureNextAction" class="secondary">Focus Next Operation</button></div>
        <h3>Operation Work Queue</h3>
        <div id="operationWorkQueue" class="attention-items"><div class="empty">No operation work loaded.</div></div>
        <h3>Operation Action</h3>
        <div id="operationActionSummary" class="evidence-summary"><div class="empty">No operation action loaded.</div></div>
        <div class="actions">
          <button id="operationActionUseOperation" class="secondary">Use Focused Operation</button>
          <button id="operationActionReadOperation" class="secondary">Read Focused Operation</button>
          <button id="operationActionFocusSession" class="secondary">Focus Operation Session</button>
        </div>
        <h3>Operation Focus Detail</h3>
        <div id="operationFocusDetail" class="evidence-summary"><div class="empty">No operation selected.</div></div>
        <h3>Operation Path</h3>
        <div class="actions">
          <button id="focusOperationPathSession" class="secondary">Focus Session</button>
          <button id="focusOperationPathTask" class="secondary">Focus Task</button>
          <button id="focusOperationPathAttention" class="secondary">Focus Attention</button>
          <button id="focusOperationPathAuthority" class="secondary">Focus Authority</button>
          <button id="focusOperationPathEvidence" class="secondary">Focus Evidence</button>
        </div>
        <div id="operationPath" class="evidence-summary"><div class="empty">No operation path loaded.</div></div>
        <h3>Operation Surface</h3>
        <div id="operationSurfaceDetail" class="evidence-summary"><div class="empty">No operation surface loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Session Navigator</h2>
        <div id="sessionNavigator" class="attention-items"><div class="empty">No operation sessions loaded.</div></div>
        <h3>Session Work Queue</h3>
        <div id="sessionWorkQueue" class="attention-items"><div class="empty">No session work loaded.</div></div>
        <h3>Session Action</h3>
        <div id="sessionActionSummary" class="evidence-summary"><div class="empty">No session action loaded.</div></div>
        <div class="actions">
          <button id="sessionActionUseSession" class="secondary">Use Focused Session</button>
          <button id="sessionActionReadEvidence" class="secondary">Read Focused Evidence</button>
          <button id="sessionActionFocusEvidence" class="secondary">Focus Session Evidence</button>
        </div>
        <h3>Session Focus Detail</h3>
        <div id="sessionFocusDetail" class="evidence-summary"><div class="empty">No session selected.</div></div>
        <h3>Session Evidence Path</h3>
        <div class="actions">
          <button id="focusSessionPathEvidence" class="secondary">Focus Evidence</button>
          <button id="focusSessionPathTask" class="secondary">Focus Task</button>
          <button id="focusSessionPathDelivery" class="secondary">Focus Delivery</button>
          <button id="focusSessionPathChain" class="secondary">Focus Chain</button>
        </div>
        <div id="sessionEvidencePath" class="evidence-summary"><div class="empty">No session evidence path loaded.</div></div>
        <h3>Session Evidence Control</h3>
        <div id="sessionEvidenceControl" class="evidence-summary"><div class="empty">No session evidence control loaded.</div></div>
        <div class="actions">
          <button id="sessionEvidenceApplyAction" class="secondary">Apply Session Evidence Action</button>
          <button id="sessionEvidenceFocusAction" class="secondary">Focus Session Evidence</button>
          <button id="sessionEvidenceTaskAction" class="secondary">Focus Session Task</button>
        </div>
      </div>
      <div class="product-panel">
        <div class="actions">
          <button id="raiseAttention" class="secondary">Raise Attention</button>
          <button id="taskFromAttention" class="secondary">Task From Attention</button>
          <button id="resolveAttention" class="secondary">Resolve Attention</button>
        </div>
        <h3>Attention Focus Detail</h3>
        <div id="attentionFocusDetail" class="evidence-summary"><div class="empty">No attention item selected.</div></div>
        <div id="attentionQueue" class="attention-items"><div class="empty">No operation attention loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Last Authority</h2>
        <div id="lastAuthority" class="task"><strong>No authority action loaded.</strong><span>Read Site or Put Membership to inspect evidence.</span></div>
      </div>
      <div class="product-panel">
        <h2>Authority State</h2>
        <div id="authorityPostureSummary" class="evidence-summary"><div class="empty">No authority posture loaded.</div></div>
        <h3>Authority Action</h3>
        <div id="authorityActionSummary" class="evidence-summary"><div class="empty">No authority action loaded.</div></div>
        <div class="actions">
          <button id="authorityNextAction" class="secondary">Apply Authority Next Action</button>
          <button id="authorityReadSiteAction" class="secondary">Read Site Authority</button>
          <button id="authorityActionEvidenceAction" class="secondary">Focus Authority Evidence</button>
        </div>
        <h3>Authority Path</h3>
        <div class="actions">
          <button id="authorityPathFocusDecision" class="secondary">Focus Decision</button>
          <button id="authorityPathFocusEvidence" class="secondary">Focus Authority Evidence</button>
          <button id="authorityPathRefresh" class="secondary">Refresh Authority</button>
        </div>
        <div id="authorityPath" class="evidence-summary"><div class="empty">No authority path loaded.</div></div>
        <h3>Authority Decision Control</h3>
        <div id="authorityDecisionControl" class="evidence-summary"><div class="empty">No authority decision control loaded.</div></div>
        <div class="actions">
          <button id="authorityDecisionApplyAction" class="secondary">Apply Decision Review</button>
          <button id="authorityDecisionEvidenceAction" class="secondary">Focus Decision Evidence</button>
          <button id="authorityDecisionRefreshAction" class="secondary">Refresh Decision Authority</button>
        </div>
        <h3>Authority Decision Queue</h3>
        <div id="authorityDecisionQueue" class="attention-items"><div class="empty">No authority decisions loaded.</div></div>
        <div id="authorityState" class="attention-items"><div class="empty">No authority state loaded.</div></div>
        <div id="authorityFocusDetail" class="evidence-summary"><div class="empty">No authority decision selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Site Product</h2>
        <h3>Sites Overview</h3>
        <div id="sitesOverview" class="evidence-summary"><div class="empty">No sites loaded.</div></div>
        <div id="sitesStatusList" class="attention-items"><div class="empty">No site statuses loaded.</div></div>
        <div class="actions">
          <button id="readSites" class="secondary">Read Sites</button>
          <button id="sitesOverviewNextAction" class="secondary">Focus Next Site</button>
        </div>
        <h3>Site Action</h3>
        <div id="siteActionSummary" class="evidence-summary"><div class="empty">No site action loaded.</div></div>
        <div class="actions">
          <button id="siteActionReadSite" class="secondary">Read Site Scope</button>
          <button id="siteActionFocusOperation" class="secondary">Focus Site Operation</button>
          <button id="siteActionFocusMembership" class="secondary">Focus Membership</button>
        </div>
        <h3>Site Focus Detail</h3>
        <div id="siteFocusDetail" class="evidence-summary"><div class="empty">No site loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Site Continuity</h2>
        <div id="continuityNavigator" class="attention-items"><div class="empty">No continuity loaded.</div></div>
        <h3>Continuity Focus Detail</h3>
        <div id="continuityFocusDetail" class="evidence-summary"><div class="empty">No continuity item selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Webhook Delay Shadow Read</h2>
        <div id="webhookDelayShadowNavigator" class="attention-items"><div class="empty">No webhook delay shadow reads loaded.</div></div>
        <h3>Shadow Read Focus Detail</h3>
        <div id="webhookDelayShadowFocusDetail" class="evidence-summary"><div class="empty">No webhook delay shadow read selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Webhook Delay Directive Intent</h2>
        <div class="actions"><button id="taskFromDirectiveIntent" class="secondary">Task From Directive Intent</button></div>
        <div id="webhookDelayDirectiveNavigator" class="attention-items"><div class="empty">No webhook delay directive records loaded.</div></div>
        <h3>Directive Intent Focus Detail</h3>
        <div id="webhookDelayDirectiveFocusDetail" class="evidence-summary"><div class="empty">No webhook delay directive record selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Webhook Delay Directive Delivery</h2>
        <div id="webhookDelayDirectiveDeliveryNavigator" class="attention-items"><div class="empty">No webhook delay directive deliveries loaded.</div></div>
        <h3>Directive Delivery Focus Detail</h3>
        <div id="webhookDelayDirectiveDeliveryFocusDetail" class="evidence-summary"><div class="empty">No webhook delay directive delivery selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Webhook Delay Evidence Chain</h2>
        <div class="actions">
          <button id="focusWebhookDelayChainObservation" class="secondary">Focus Observation</button>
          <button id="focusWebhookDelayChainIntent" class="secondary">Focus Intent</button>
          <button id="focusWebhookDelayChainDelivery" class="secondary">Focus Delivery</button>
          <button id="focusWebhookDelayChainSession" class="secondary">Focus Session</button>
          <button id="focusWebhookDelayChainTask" class="secondary">Focus Task</button>
        </div>
        <div id="webhookDelayEvidenceChain" class="evidence-summary"><div class="empty">No webhook delay evidence chain loaded.</div></div>
      </div>
      <div class="product-panel">
        <h2>Resident Loop Shadow Read</h2>
        <div id="residentLoopShadowNavigator" class="attention-items"><div class="empty">No resident loop shadow reads loaded.</div></div>
        <h3>Resident Loop Focus Detail</h3>
        <div id="residentLoopShadowFocusDetail" class="evidence-summary"><div class="empty">No resident loop shadow read selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Resident Dispatch</h2>
        <div class="actions"><button id="startResidentDispatch" class="secondary">Start Resident Dispatch</button></div>
        <div id="residentDispatchNavigator" class="attention-items"><div class="empty">No resident dispatch decisions loaded.</div></div>
        <h3>Resident Dispatch Focus Detail</h3>
        <div id="residentDispatchFocusDetail" class="evidence-summary"><div class="empty">No resident dispatch decision selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Local Ingress</h2>
        <div id="localIngressRequestNavigator" class="attention-items"><div class="empty">No local ingress requests loaded.</div></div>
        <h3>Local Ingress Request Detail</h3>
        <div id="localIngressRequestFocusDetail" class="evidence-summary"><div class="empty">No local ingress request selected.</div></div>
        <h3>Returned Execution Evidence</h3>
        <div id="localIngressEvidenceNavigator" class="attention-items"><div class="empty">No local ingress evidence loaded.</div></div>
        <h3>Local Ingress Evidence Detail</h3>
        <div id="localIngressEvidenceFocusDetail" class="evidence-summary"><div class="empty">No local ingress evidence selected.</div></div>
        <h3>Provider Liveness</h3>
        <div id="localIngressProviderHeartbeatNavigator" class="attention-items"><div class="empty">No local ingress provider heartbeats loaded.</div></div>
        <h3>Provider Liveness Detail</h3>
        <div id="localIngressProviderHeartbeatFocusDetail" class="evidence-summary"><div class="empty">No local ingress provider heartbeat selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Repository Publication</h2>
        <div id="repositoryPublicationRequestNavigator" class="attention-items"><div class="empty">No repository publication requests loaded.</div></div>
        <h3>Repository Publication Request Detail</h3>
        <div id="repositoryPublicationRequestFocusDetail" class="evidence-summary"><div class="empty">No repository publication request selected.</div></div>
        <h3>Cloudflare GitHub Readiness</h3>
        <div id="repositoryPublicationReadinessDetail" class="evidence-summary"><div class="empty">No repository publication readiness loaded.</div></div>
        <div class="actions">
          <button id="readRepositoryPublicationReadiness" class="secondary" disabled>Read Cloudflare GitHub Readiness</button>
          <button id="executeRepositoryPublication" class="secondary" disabled>Execute Cloudflare GitHub Publication</button>
        </div>
        <h3>Returned Publication Evidence</h3>
        <div id="repositoryPublicationEvidenceNavigator" class="attention-items"><div class="empty">No repository publication evidence loaded.</div></div>
        <h3>Repository Publication Evidence Detail</h3>
        <div id="repositoryPublicationEvidenceFocusDetail" class="evidence-summary"><div class="empty">No repository publication evidence selected.</div></div>
        <h3>Cloudflare GitHub Executions</h3>
        <div id="repositoryPublicationExecutionNavigator" class="attention-items"><div class="empty">No Cloudflare repository publication executions loaded.</div></div>
        <h3>Cloudflare GitHub Execution Detail</h3>
        <div id="repositoryPublicationExecutionFocusDetail" class="evidence-summary"><div class="empty">No Cloudflare repository publication execution selected.</div></div>
        <h3>Provider Liveness</h3>
        <div id="repositoryPublicationProviderHeartbeatNavigator" class="attention-items"><div class="empty">No repository publication provider heartbeats loaded.</div></div>
        <h3>Provider Liveness Detail</h3>
        <div id="repositoryPublicationProviderHeartbeatFocusDetail" class="evidence-summary"><div class="empty">No repository publication provider heartbeat selected.</div></div>
      </div>
      <div class="product-panel">
        <h2>Mailbox Draft Create</h2>
        <div id="mailboxDraftCreateControl" class="evidence-summary"><div class="empty">No mailbox proposal selected.</div></div>
        <label>Account Ref<input id="mailboxDraftAccountRef" placeholder="user@example.com"></label>
        <label>Recipients<input id="mailboxDraftRecipients" placeholder="recipient@example.com, recipient2@example.com"></label>
        <label>Subject<input id="mailboxDraftSubject" placeholder="Draft subject"></label>
        <label>Body<textarea id="mailboxDraftBody" placeholder="Draft body text"></textarea></label>
        <div class="actions"><button id="createOutlookDraftFromProposal" class="secondary">Create Outlook Draft</button></div>
      </div>
      <div class="product-panel">
        <h2>Mailbox Send Review</h2>
        <div id="mailboxSendReviewDetail" class="evidence-summary"><div class="empty">No mailbox send selected.</div></div>
        <div class="actions"><button id="acknowledgeMailboxSendReview" class="secondary">Acknowledge Send Review</button></div>
      </div>
      <div class="product-panel">
        <h2>Operation Focus Review</h2>
        <div id="operationFocusReviewDetail" class="evidence-summary"><div class="empty">No operation focus selected.</div></div>
        <div class="actions"><button id="acknowledgeOperationFocusReview" class="secondary">Acknowledge Operation Focus</button></div>
      </div>
      <div class="product-panel">
        <h2>Site Membership</h2>
        <label>Principal ID<input id="memberPrincipalId" placeholder="microsoft:tenant:object-id"></label>
        <label>Role<input id="memberRole" value="viewer"></label>
        <div class="actions"><button id="putMembership" class="secondary">Put Membership</button></div>
        <h3>Membership Action</h3>
        <div id="membershipActionSummary" class="evidence-summary"><div class="empty">No membership action loaded.</div></div>
        <div class="actions">
          <button id="membershipActionPut" class="secondary">Put Focused Membership</button>
          <button id="membershipActionReadSite" class="secondary">Read Membership Site</button>
          <button id="membershipActionFocusAuthority" class="secondary">Focus Membership Authority</button>
        </div>
        <h3>Membership Navigator</h3>
        <div id="membershipNavigator" class="attention-items"><div class="empty">No memberships loaded.</div></div>
        <h3>Membership Focus Detail</h3>
        <div id="membershipFocusDetail" class="evidence-summary"><div class="empty">No membership selected.</div></div>
      </div>
      <div class="task-panel">
        <h2>Task State</h2>
        <label>New task<input id="taskTitle" placeholder="Task title"></label>
        <div class="actions"><button id="createTask" class="secondary">Create Task</button></div>
        <label>Task ID<input id="updateTaskId" placeholder="cloudflare-task-1"></label>
        <label>Status<input id="updateTaskStatus" value="done"></label>
        <label>Note<input id="updateTaskNote" placeholder="Update note"></label>
        <h3>Task Command Preview</h3>
        <div id="taskCommandPreview" class="evidence-summary"><div class="empty">No task command prepared.</div></div>
        <div class="actions">
          <button id="focusTaskEvidence" class="secondary">Focus Task Evidence</button>
          <button id="markTaskOpen" class="secondary">Mark Open</button>
          <button id="markTaskDone" class="secondary">Mark Done</button>
          <button id="updateTask" class="secondary">Update Task</button>
        </div>
        <h3>Task Lifecycle Summary</h3>
        <div id="taskLifecycleSummary" class="evidence-summary"><div class="empty">No task lifecycle loaded.</div></div>
        <h3>Task Lifecycle Control</h3>
        <div id="taskLifecycleControl" class="evidence-summary"><div class="empty">No task lifecycle control loaded.</div></div>
        <div class="actions">
          <button id="taskLifecycleApplyAction" class="secondary">Apply Lifecycle Action</button>
          <button id="taskLifecycleEvidenceAction" class="secondary">Focus Lifecycle Evidence</button>
          <button id="taskLifecycleSessionAction" class="secondary">Focus Lifecycle Session</button>
        </div>
        <h3>Task Evidence Path</h3>
        <div class="actions">
          <button id="focusTaskPathSession" class="secondary">Focus Task Session</button>
          <button id="focusTaskPathEvidence" class="secondary">Focus Task Evidence</button>
          <button id="focusTaskPathDirective" class="secondary">Focus Task Directive</button>
          <button id="focusTaskPathDelivery" class="secondary">Focus Task Delivery</button>
          <button id="focusTaskPathChain" class="secondary">Focus Chain</button>
        </div>
        <div id="taskEvidencePath" class="evidence-summary"><div class="empty">No task evidence path loaded.</div></div>
        <h3>Task Focus Detail</h3>
        <div id="taskFocusDetail" class="evidence-summary"><div class="empty">No task selected.</div></div>
        <h3>Task Work Queue</h3>
        <div id="taskWorkQueue" class="attention-items"><div class="empty">No task work loaded.</div></div>
        <div id="tasks" class="tasks"><div class="empty">No tasks loaded.</div></div>
      </div>
      <div id="error" class="error" role="status"></div>
    </aside>
    <section>
      <div class="toolbar">
        <h2>Session Events</h2>
        <div class="event-filters">
          <label>Evidence Filter<select id="eventKindFilter"><option value="">All event kinds</option></select></label>
          <label>Session Filter<select id="eventSessionFilter"><option value="active">Active session</option><option value="all">All loaded sessions</option></select></label>
        </div>
        <button id="read" class="secondary">Read Events</button>
      </div>
      <div id="operationControlBoard" class="overview">
        <div class="overview-block"><h3>Operation Control Board</h3><ul><li class="empty">No control board loaded.</li></ul></div>
      </div>
      <div class="evidence-focus">
        <h3>Focused Control Target</h3>
        <div id="operationControlTarget" class="evidence-summary"><div class="empty">No control target loaded.</div></div>
        <div class="actions">
          <button id="operationControlTargetNextAction" class="secondary">Apply Target Action</button>
          <button id="operationControlTargetEvidenceAction" class="secondary">Focus Target Evidence</button>
          <button id="operationControlTargetReadinessAction" class="secondary">Focus Target Readiness</button>
        </div>
      </div>
      <div class="evidence-focus">
        <h3>Control Board Actions</h3>
        <div class="actions">
          <button id="operationControlBoardNextAction" class="secondary">Apply Board Next Action</button>
          <button id="operationControlBoardReadinessAction" class="secondary">Focus Board Readiness Gap</button>
          <button id="operationControlBoardEvidenceAction" class="secondary">Focus Board Evidence</button>
        </div>
      </div>
      <div id="productOverview" class="overview">
        <div class="overview-block"><h3>Operation</h3><ul><li class="empty">No operation loaded.</li></ul></div>
        <div class="overview-block"><h3>Site</h3><ul><li class="empty">No site loaded.</li></ul></div>
        <div class="overview-block"><h3>Memberships</h3><ul><li class="empty">No memberships loaded.</li></ul></div>
        <div class="overview-block"><h3>Sessions</h3><ul><li class="empty">No sessions loaded.</li></ul></div>
        <div class="overview-block"><h3>Tasks</h3><ul><li class="empty">No tasks loaded.</li></ul></div>
        <div class="overview-block"><h3>Authority Events</h3><ul><li class="empty">No authority events loaded.</li></ul></div>
        <div class="overview-block"><h3>Authority Routing</h3><ul><li class="empty">No authority routing loaded.</li></ul></div>
        <div class="overview-block"><h3>Continuity Packets</h3><ul><li class="empty">No continuity packets loaded.</li></ul></div>
        <div class="overview-block"><h3>Carrier Evidence</h3><ul><li class="empty">No carrier evidence loaded.</li></ul></div>
      </div>
      <div id="evidenceFocus" class="evidence-focus"><h3>Evidence Focus</h3><span>No event selected.</span></div>
      <div id="evidenceActionSummary" class="evidence-focus"><h3>Evidence Action</h3><span>No evidence action selected.</span></div>
      <div id="evidenceLanes" class="evidence-lanes"><div class="empty">No evidence lanes loaded.</div></div>
      <div class="evidence-focus"><h3>Evidence Review Queue</h3><span>Prioritized review path for loaded carrier events.</span></div>
      <div id="evidenceReviewQueue" class="attention-items"><div class="empty">No evidence review loaded.</div></div>
      <div id="events" class="events"><div class="empty">Start or resume a session to read carrier events.</div></div>
      <div class="composer">
        <label>Input<textarea id="input" placeholder="Send an operator input to the Cloudflare carrier"></textarea></label>
        <div class="actions"><button id="send">Send Input</button></div>
      </div>
    </section>
  </main>
  <script type="module">
    const WORKBENCH_STORAGE_KEY = 'narada.cloudflare.operationWorkbench.v1';
    const classifyCloudflareOperationCommandState = ${classifyCloudflareOperationCommandState.toString()};
    const classifyCloudflareAuthorityCommandState = ${classifyCloudflareAuthorityCommandState.toString()};
    const classifyCloudflareSessionCommandState = ${classifyCloudflareSessionCommandState.toString()};
    const classifyCloudflareTaskCommandState = ${classifyCloudflareTaskCommandState.toString()};
    const classifyCloudflareEvidenceCommandState = ${classifyCloudflareEvidenceCommandState.toString()};
    const classifyCloudflareSiteCommandState = ${classifyCloudflareSiteCommandState.toString()};
    const classifyCloudflareMembershipCommandState = ${classifyCloudflareMembershipCommandState.toString()};
    const state = { events: [], afterSequence: 0, autoRefreshTimer: null, operationProduct: null, productScope: 'none', operations: [], siteList: [], siteProductStatuses: [], siteProductOverview: null, sitePostureRoute: null, consoleSequence: 0, operatorPrincipal: null, runtimeStatus: null, siteFocus: null, taskFocus: null, attentionItems: [], attentionFocus: null, evidenceFocus: null, evidenceLane: '', authorityFocus: null, operationFocus: null, operationFocusReviewFocus: null, sessionFocus: null, membershipFocus: null, continuityFocus: null, webhookDelayShadowFocus: null, webhookDelayDirectiveFocus: null, webhookDelayDirectiveDeliveryFocus: null, residentLoopShadowFocus: null, residentDispatchFocus: null, localIngressRequestFocus: null, localIngressEvidenceFocus: null, localIngressProviderHeartbeatFocus: null, repositoryPublicationRequestFocus: null, repositoryPublicationReadinessFocus: null, repositoryPublicationEvidenceFocus: null, repositoryPublicationExecutionFocus: null, repositoryPublicationProviderHeartbeatFocus: null, mailboxDraftReplyProposalFocus: null, mailboxOutlookDraftCreateFocus: null, mailboxSendAcceptedFocus: null, mailboxSendConfirmationFocus: null, mailboxDraftCreateFormProposalId: null, siteFileChangeProposalFocus: null };
    const el = (id) => document.getElementById(id);
    const api = {
      async request(operation, params = {}, extra = {}) {
        const carrierSessionId = el('sessionId').value.trim();
        const token = el('token').value.trim();
        const headers = { 'content-type': 'application/json' };
        if (token) headers.authorization = 'Bearer ' + token;
        const response = await fetch('/api/carrier', {
          method: 'POST',
          credentials: 'same-origin',
          headers,
          body: JSON.stringify({ operation, carrier_session_id: carrierSessionId, params, ...extra }),
        });
        const body = await response.json();
        if (!response.ok || body.ok === false) {
          const error = new Error(body.code || body.error || response.statusText);
          error.details = { operation, http_status: response.status, body };
          throw error;
        }
        return body;
      },
      async session() {
        const response = await fetch('/auth/session', { credentials: 'same-origin', headers: { accept: 'application/json' } });
        if (!response.ok) return null;
        return response.json();
      },
      start() {
        const carrierSessionId = el('sessionId').value.trim();
        const operationId = el('operationId').value.trim();
        return this.request('session.start', {
          carrier_session_id: carrierSessionId,
          agent_id: el('agentId').value.trim(),
          site_id: el('siteId').value.trim(),
          operation_id: operationId || null,
          site_root: 'cloudflare://' + el('siteId').value.trim(),
          site_ref: 'site://' + el('siteId').value.trim(),
        }, { request_id: 'console_start_' + carrierSessionId });
      },
      resumeContinuation(operationId, carrierSessionId) {
        const siteId = el('siteId').value.trim();
        const sessionId = carrierSessionId || el('sessionId').value.trim();
        return this.request('session.start', {
          carrier_session_id: sessionId,
          agent_id: el('agentId').value.trim(),
          site_id: siteId,
          operation_id: operationId,
          site_root: 'cloudflare://' + siteId,
          site_ref: 'site://' + siteId,
        }, { request_id: 'console_operation_continuation_resume_' + Date.now() });
      },
      status() { return this.request('session.status'); },
      readSite() { return this.request('site.read', { site_id: el('siteId').value.trim(), carrier_event_limit: 20, session_limit: carrierEvidenceSessionLimit(), session_offset: carrierEvidenceSessionOffset() }); },
      readSites() { return this.request('site.list', { limit: 20, site_status_limit: 20 }); },
      readOperation() {
        return this.request('operation.read', {
          site_id: el('siteId').value.trim(),
          operation_id: el('operationId').value.trim(),
          carrier_event_limit: 20,
          session_limit: carrierEvidenceSessionLimit(),
          session_offset: carrierEvidenceSessionOffset(),
          mailbox_draft_reply_proposal_limit: 20,
          mailbox_outlook_draft_create_limit: 20,
          mailbox_send_review_limit: 20,
          repository_publication_request_limit: 20,
          repository_publication_evidence_limit: 20,
          repository_publication_execution_limit: 20,
        });
      },
      readRepositoryPublicationReadiness(request) {
        const suffix = Date.now();
        return this.request('repository_publication.cloudflare_execution.readiness', {
          site_id: el('siteId').value.trim(),
          repository_ref: request?.repository_ref || '',
          branch_ref: request?.branch_ref || '',
        }, { request_id: 'console_repository_publication_readiness_' + suffix });
      },
      executeRepositoryPublication(request) {
        const repositoryPublicationRequestId = request?.repository_publication_request_id || '';
        if (!repositoryPublicationRequestId) throw new Error('Repository publication request is required.');
        const suffix = Date.now();
        return this.request('repository_publication.cloudflare_execution.execute', {
          site_id: el('siteId').value.trim(),
          repository_publication_request_id: repositoryPublicationRequestId,
          repository_publication_execution_id: 'console_repository_publication_execution_' + suffix,
        }, { request_id: 'console_repository_publication_execute_' + suffix });
      },
      startResidentDispatch() {
        const siteId = el('siteId').value.trim();
        const operationId = el('operationId').value.trim() || 'operation_narada_cloudflare_control';
        const suffix = Date.now();
        const carrierSessionId = 'carrier_session_cloudflare_dispatch_' + suffix;
        return this.request('resident_dispatch.primary_with_fallback.start', {
          site_id: siteId,
          operation_id: operationId,
          carrier_session_id: carrierSessionId,
          agent_id: el('agentId').value.trim() || 'narada.cloudflare.dispatch',
          site_root: 'cloudflare://' + siteId,
          site_ref: 'site://' + siteId,
          windows_fallback_ref: 'windows_local_site_resident_loop',
        }, { request_id: 'console_resident_dispatch_' + suffix });
      },
      createOperation(operationId, displayName, operationKind) {
        return this.request('operation.create', {
          site_id: el('siteId').value.trim(),
          operation_id: operationId,
          display_name: displayName,
          operation_kind: operationKind,
          status: 'active',
        }, { request_id: 'console_operation_create_' + Date.now() });
      },
      putOperationStatus(status, reason = null) {
        return this.request('operation.status.put', {
          site_id: el('siteId').value.trim(),
          operation_id: el('operationId').value.trim(),
          status,
          ...(reason ? { reason } : {}),
        }, { request_id: 'console_operation_status_put_' + Date.now() });
      },
      putMembership(memberPrincipalId, role) {
        return this.request('site.membership.put', {
          site_id: el('siteId').value.trim(),
          member_principal_id: memberPrincipalId,
          role,
          status: 'active',
        }, { request_id: 'console_membership_put_' + Date.now() });
      },
      createOutlookDraft(params) {
        return this.request('mailbox.outlook_draft.create', {
          site_id: el('siteId').value.trim(),
          ...params,
        }, { request_id: 'console_mailbox_outlook_draft_create_' + Date.now() });
      },
      acknowledgeMailboxSendReview(params) {
        return this.request('mailbox.send_review.acknowledge', {
          site_id: el('siteId').value.trim(),
          operation_id: el('operationId').value.trim(),
          ...params,
        }, { request_id: 'console_mailbox_send_review_acknowledge_' + Date.now() });
      },
      acknowledgeOperationFocusReview(params) {
        return this.request('operation_focus_review.acknowledge', {
          site_id: el('siteId').value.trim(),
          operation_id: el('operationId').value.trim(),
          ...params,
        }, { request_id: 'console_operation_focus_review_acknowledge_' + Date.now() });
      },
      readEvents() { return this.request('session.events.read', { after_sequence: state.afterSequence }); },
      readSessionEvidence() { return this.request('session.events.read', { after_sequence: 0 }); },
      command(command, args = []) { return this.request('carrier.command.execute', { command, args }, { request_id: 'console_command_' + Date.now() }); },
      createTask(title) { return this.command('/task', ['create', ...String(title || '').split(/\s+/).filter(Boolean)]); },
      updateTask(taskId, status, note) { return this.command('/task', ['update', taskId, status, ...String(note || '').split(/\s+/).filter(Boolean)]); },
      emitAttention() {
        const operationId = el('operationId').value.trim();
        return this.request('directive.emit', {
          directive_kind: 'operation_attention',
          operation_id: operationId,
          target: { kind: 'operation', id: operationId },
          reason: 'operator_requested_attention',
        }, { request_id: 'console_attention_' + Date.now() });
      },
      deliver(content) {
        const eventId = 'console_input_' + Date.now();
        return this.request('carrier.input.deliver', { input: { event_id: eventId, input_id: eventId, input_kind: 'operator_message', source: 'operator', visibility: 'operator_visible', content } }, { request_id: 'request_' + eventId });
      },
    };
    window.naradaCloudflareCarrierClient = api;
    function loadWorkbenchState() {
      try {
        const saved = JSON.parse(localStorage.getItem(WORKBENCH_STORAGE_KEY) || '{}');
        if (saved.site_id) el('siteId').value = saved.site_id;
        if (saved.operation_id) el('operationId').value = saved.operation_id;
        if (saved.carrier_session_id) el('sessionId').value = saved.carrier_session_id;
        if (saved.carrier_evidence_session_limit) el('carrierEvidenceSessionLimit').value = String(saved.carrier_evidence_session_limit);
        if (saved.carrier_evidence_session_offset != null) el('carrierEvidenceSessionOffset').value = String(saved.carrier_evidence_session_offset);
      } catch {}
      renderActiveSession();
    }
    function saveWorkbenchState() {
      localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify({
        site_id: el('siteId').value.trim(),
        operation_id: el('operationId').value.trim(),
        carrier_session_id: el('sessionId').value.trim(),
        carrier_evidence_session_limit: carrierEvidenceSessionLimit(),
        carrier_evidence_session_offset: carrierEvidenceSessionOffset(),
      }));
      renderActiveSession();
    }
    function renderActiveSession() {
      el('activeSession').textContent = el('sessionId').value.trim() || 'none';
      renderActiveSessionDetail();
      updateControlRoom();
    }
    function setCurrentOperation(operationId) {
      const next = String(operationId || '').trim();
      if (!next) return;
      el('operationId').value = next;
      state.operationFocus = state.operations.find((operation) => operation.operation_id === next) || null;
      saveWorkbenchState();
      state.events = [];
      state.afterSequence = 0;
      renderEvents();
      renderOperationNavigator(state.operations || []);
      updateControlRoom();
    }
    function setCurrentSession(carrierSessionId) {
      const next = String(carrierSessionId || '').trim();
      if (!next) return;
      el('sessionId').value = next;
      el('operationSessionSelect').value = next;
      state.sessionFocus = (state.operationProduct?.sessions || []).find((session) => session.carrier_session_id === next) || null;
      saveWorkbenchState();
      state.events = [];
      state.afterSequence = 0;
      renderEvents();
      renderSessionNavigator(state.operationProduct?.sessions || []);
      updateControlRoom();
    }
    function appendConsoleEvidence(eventKind, payload = {}) {
      state.consoleSequence += 1;
      appendEvents([{
        carrier_session_id: el('sessionId').value.trim() || 'console',
        sequence: state.afterSequence + state.consoleSequence / 1000,
        event_kind: eventKind,
        payload,
      }]);
    }
    function eventKey(event) {
      return (event.carrier_session_id || el('sessionId').value.trim()) + ':' + event.sequence;
    }
    function eventTitle(event) {
      return (event.carrier_session_id ? event.carrier_session_id + ' ' : '') + '#' + event.sequence + ' ' + event.event_kind;
    }
    function appendEvents(events = []) {
      for (const event of events) {
        if (state.events.some((existing) => eventKey(existing) === eventKey(event))) continue;
        state.events.push(event);
        const sequence = Number(event.sequence || 0);
        if (Number.isInteger(sequence)) state.afterSequence = Math.max(state.afterSequence, sequence);
      }
      refreshEventKindFilter();
      renderEvidenceLanes();
      renderEvents();
      renderAttentionQueue(extractOperationAttention(state.operationProduct || {}));
    }
    function extractOperationAttention(product = {}) {
      const tasks = product.tasks || [];
      const events = [
        ...state.events,
        ...(product.carrier_evidence || []).flatMap((entry) => entry.events || []),
      ];
      const seen = new Set();
      return events
        .filter((event) => event.event_kind === 'directive_emitted' && event.payload?.directive_kind === 'operation_attention')
        .map((event) => {
          const payload = event.payload || {};
          const key = payload.directive_id || payload.input_event_id || [event.carrier_session_id, event.sequence].filter(Boolean).join(':');
          if (seen.has(key)) return null;
          seen.add(key);
          const resolvedByTask = tasks.find((task) => {
            const note = String(task.note || '');
            const status = String(task.status || '').toLowerCase();
            const resolutionStatus = status === 'done' || status === 'resolved' || status === 'closed';
            const inputEventId = String(payload.input_event_id || '');
            return resolutionStatus && (note.includes(key) || (inputEventId && note.includes(inputEventId)));
          }) || null;
          return {
            key,
            directive_id: payload.directive_id || key,
            input_event_id: payload.input_event_id || null,
            carrier_session_id: event.carrier_session_id || payload.carrier_session_id || null,
            operation_id: payload.operation_id || payload.target?.id || product.operation?.operation_id || null,
            reason: payload.reason || 'operation_requires_attention',
            visibility: payload.visibility || 'operator_visible',
            target: payload.target || null,
            sequence: event.sequence || null,
            status: resolvedByTask ? 'resolved' : 'open',
            resolving_task_id: resolvedByTask?.task_id || null,
          };
        })
        .filter(Boolean);
    }
    function updateControlRoom() {
      const product = state.operationProduct || {};
      const surface = product.operation_product_surface || {};
      const activeSession = el('sessionId').value.trim();
      const activeDecision = (product.site_authority?.decisions || []).find((decision) => decision.mutation_class === 'cloudflare_carrier_session')
        || (product.site_authority?.decisions || [])[0]
        || null;
      el('controlOperation').textContent = product.operation?.operation_id || el('operationId').value.trim() || 'none';
      el('controlProductScope').textContent = productScopeSummary(product);
      const workflowOperatorFocus = operationWorkflowRouteStage(product).operator_focus || null;
      el('controlOperationFocus').textContent = workflowOperatorFocus ? operationOperatorFocusSummary(workflowOperatorFocus) : state.operationFocus ? [state.operationFocus.operation_id, state.operationFocus.status || state.operationFocus.operation_kind].filter(Boolean).join(' / ') : 'none';
      el('controlSession').textContent = activeSession || 'none';
      el('controlSessionFocus').textContent = state.sessionFocus ? [state.sessionFocus.carrier_session_id, state.sessionFocus.binding_status || state.sessionFocus.agent_id].filter(Boolean).join(' / ') : 'none';
      el('controlAuthorityLocus').textContent = activeDecision ? [activeDecision.authority_locus || 'unresolved', activeDecision.action || 'unknown'].join(' / ') : 'unknown';
      el('controlAuthorityFocus').textContent = state.authorityFocus ? [state.authorityFocus.mutation_class || state.authorityFocus.event_kind || 'authority', state.authorityFocus.action || 'unknown'].join(' / ') : 'none';
      el('controlOperator').textContent = operatorPrincipalLabel(state.operatorPrincipal);
      el('controlTaskFocus').textContent = state.taskFocus ? [state.taskFocus.task_id, state.taskFocus.status].filter(Boolean).join(' / ') : 'none';
      const openAttention = state.attentionItems.filter((item) => item.status !== 'resolved').length;
      el('controlAttention').textContent = String(openAttention) + ' open / ' + state.attentionItems.length + ' total' + (state.attentionFocus ? ' / ' + state.attentionFocus.directive_id : '');
      el('controlEvidenceFocus').textContent = state.evidenceFocus ? eventTitle(state.evidenceFocus) : 'none';
      el('controlEvidenceWindow').textContent = String(surface.carrier_evidence_count ?? state.events.length) + ' evidence groups / ' + state.events.length + ' loaded events';
      const continuityStatus = surface.continuity_status || product.site_continuity_status || {};
      const reconciliationStatus = surface.continuity_reconciliation_execution_status || product.site_continuity_reconciliation_execution_status || {};
      el('controlContinuity').textContent = String(surface.continuity_packet_count ?? (product.site_continuity_packets || []).length ?? 0) + ' packets / ' + String(continuityStatus.state || 'no_status') + ' / ' + String(reconciliationStatus.latest_status || reconciliationStatus.state || 'no_reconcile') + ' reconcile / ' + String(surface.webhook_delay_directive_record_count ?? (product.webhook_delay_directive_records || []).length ?? 0) + ' directive intents';
      const lifecycleStatus = surface.lifecycle_status || product.operation_lifecycle_status || {};
      el('controlWorkbenchReadiness').textContent = operationWorkbenchReadiness(product) + ' / ' + String(lifecycleStatus.health || 'no_lifecycle_status');
      renderControlRoomActionSummary(product);
      renderOperatorRoute(product);
      renderFocusedOperationLifecycle(product);
      renderWorkbenchReadinessGate(product);
      renderOperationControlBoard(product);
      renderSiteActionSummary();
      renderMembershipActionSummary();
      renderOperationActionSummary();
      renderOperationPath();
      renderSessionActionSummary();
      renderTaskCommandPreview();
      renderAuthorityActionSummary(product);
      renderContinuityWorkflow(product);
      renderLocalCloudContinuityBridge(product);
      renderContinuityLoopEvidence(product);
      renderMailboxDraftCreateControl(product);
      renderMailboxSendReviewDetail(product);
      renderOperationFocusReviewDetail(product);
      renderLocalIngressRequestNavigator(product.local_ingress_requests || []);
      renderLocalIngressEvidenceNavigator(product.local_ingress_evidence || []);
      renderLocalIngressProviderHeartbeatNavigator(product.local_ingress_provider_heartbeats || []);
      renderRepositoryPublicationRequestNavigator(product.repository_publication_requests || []);
      renderRepositoryPublicationEvidenceNavigator(product.repository_publication_evidence || []);
      renderRepositoryPublicationExecutionNavigator(product.repository_publication_executions || []);
      renderRepositoryPublicationProviderHeartbeatNavigator(product.repository_publication_provider_heartbeats || []);
    }
    function productScopeSummary(product = state.operationProduct || {}) {
      if (state.productScope === 'site') return ['site', product.site?.site_id || el('siteId').value.trim(), String((product.operations || []).length) + ' operations'].filter(Boolean).join(' / ');
      if (state.productScope === 'operation') return ['operation', product.operation?.operation_id || el('operationId').value.trim(), String((product.sessions || []).length) + ' sessions'].filter(Boolean).join(' / ');
      return 'not loaded';
    }
    function productScopeContext(product = state.operationProduct || {}) {
      const surface = product.operation_product_surface || {};
      const evidenceStatus = evidenceReplayStatus(product) || {};
      const persistence = persistencePosture(product) || {};
      const recovery = recoveryPosture(product) || {};
      const transferPosture = authorityTransferPosture(product) || {};
      const transferTarget = (transferPosture.remaining_windows_authorities || [])[0] || null;
      const statusHistory = operationStatusHistory(product);
      const scope = state.productScope || 'none';
      const followUp = scope === 'operation'
        ? 'read_site_scope_for_membership_and_operations'
        : scope === 'site'
          ? (el('operationId').value.trim() ? 'read_operation_scope_for_active_operation' : 'select_operation')
          : 'read_operation_or_site_scope';
      return [
        ['Scope', scope],
        ['Site', product.site?.site_id || product.operation?.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', product.operation?.operation_id || el('operationId').value.trim() || 'none'],
        ['Sessions', String(surface.session_count ?? (product.sessions || []).length)],
        ['Tasks', String(surface.task_count ?? (product.tasks || []).length)],
        ['Authority Events', String((product.authority_events || []).length)],
        ['Evidence Groups', String(surface.carrier_evidence_count ?? (product.carrier_evidence || []).length)],
        ['Evidence Replay State', evidenceStatus.state || 'unknown'],
        ['Evidence Replay Source', evidenceReplaySources(product)],
        ['Evidence Replay Sessions', evidenceReplaySessionSummary(evidenceStatus)],
        ['Continuity Reconciliation Executions', String((product.site_continuity_reconciliation_executions || []).length)],
        ['Continuity Reconciliation Status', (product.site_continuity_reconciliation_execution_status || surface.continuity_reconciliation_execution_status || {}).latest_status || (product.site_continuity_reconciliation_execution_status || surface.continuity_reconciliation_execution_status || {}).state || 'unknown'],
        ['Persistence State', persistence.state || 'unknown'],
        ['Persistence Next Action', persistence.next_action || 'monitor_persistence_posture'],
        ['Recovery State', recovery.state || 'unknown'],
        ['Recovery Next Action', recovery.next_action || 'monitor_recovery_posture'],
        ['Authority Transfer State', transferPosture.transfer_complete ? 'complete' : transferPosture.schema ? 'in_transfer' : 'unknown'],
        ['Authority Transfer Remaining', String(transferPosture.remaining_windows_authority_count ?? (transferPosture.remaining_windows_authorities || []).length ?? 0)],
        ['Authority Transfer Next Domain', transferTarget?.domain || 'none'],
        ['Authority Transfer Next Action', transferPosture.next_action || 'monitor_authority_transfer'],
        ['Status Transitions', operationStatusTransitionSummary(statusHistory)],
        ['Latest Status Transition', operationLatestStatusTransitionLabel(statusHistory)],
        ['Activity Items', operationActivityTimelineSummary(product)],
        ['Latest Activity', operationLatestActivityLabel(product)],
        ['Follow Up', followUp],
      ];
    }
    function renderProductScopeDetail(product = state.operationProduct || {}) {
      if (!product || state.productScope === 'none') {
        el('productScopeDetail').innerHTML = '<div class="empty">No product scope loaded.</div>';
        return;
      }
      el('productScopeDetail').replaceChildren(...productScopeContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function focusedOperationLifecycleContext(product = state.operationProduct || {}) {
      const lifecycle = product.focused_operation_lifecycle || {};
      const lifecycleStatus = lifecycle.lifecycle_status || product.operation_lifecycle_status || product.operation_product_surface?.lifecycle_status || {};
      const workflowRoute = lifecycle.workflow_route || product.operation_workflow_route || product.operation_product_surface?.operation_workflow_route || {};
      const postureOverview = lifecycle.operation_posture_overview || product.operation_posture_overview || {};
      const postureRoute = lifecycle.operation_posture_route || product.operation_posture_route || product.operation_product_surface?.operation_posture_route || {};
      const operatorFocus = workflowRoute.operator_focus || null;
      return [
        ['Schema', lifecycle.schema || 'not loaded'],
        ['Operation', lifecycle.operation_id || product.operation?.operation_id || el('operationId').value.trim() || 'none'],
        ['Lifecycle Health', lifecycleStatus.health || 'unknown'],
        ['Lifecycle Next Action', lifecycleStatus.next_action || 'none'],
        ['Workflow Status', workflowRoute.status || 'unknown'],
        ['Workflow Next Action', workflowRoute.next_action || 'none'],
        ['Workflow Target', workflowRoute.target || 'none'],
        ['Workflow Reason', workflowRoute.reason || 'none'],
        ['Operator Focus', operatorFocus ? operationOperatorFocusSummary(operatorFocus) : 'none'],
        ['Posture Status', postureRoute.status || postureOverview.status || 'unknown'],
        ['Posture Next Action', postureRoute.next_action || postureOverview.next_action || 'none'],
      ];
    }
    function renderFocusedOperationLifecycle(product = state.operationProduct || {}) {
      const target = el('focusedOperationLifecycle');
      if (!target) return;
      target.replaceChildren(...focusedOperationLifecycleContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function applyFocusedOperationLifecycleNextAction() {
      const product = state.operationProduct || {};
      const route = product.focused_operation_lifecycle?.workflow_route || operationWorkflowRouteStage(product);
      if (route?.next_action && route.next_action !== 'monitor_operation_continuity') {
        applyOperationWorkflowRouteAction(route, product);
        return;
      }
      applyControlRoomNextAction();
    }
    function operationWorkbenchReadiness(product = {}) {
      const surface = product.operation_product_surface || {};
      const missing = [];
      if (!product.operation && !el('operationId').value.trim()) missing.push('operation');
      if ((product.sessions || []).length === 0 && !el('sessionId').value.trim()) missing.push('session');
      if ((product.carrier_evidence || []).length === 0 && state.events.length === 0) missing.push('evidence');
      if ((product.site_authority?.decisions || []).length === 0 && (product.authority_events || []).length === 0) missing.push('authority');
      if ((product.tasks || []).length === 0) missing.push('tasks');
      if ((product.site_continuity_packets || []).length === 0 && (product.site_continuity?.decisions || []).length === 0) missing.push('continuity');
      if ('webhook_delay_shadow_observations' in product || 'webhook_delay_shadow_observation_count' in surface) {
        if ((product.webhook_delay_shadow_observations || []).length === 0) missing.push('shadow-read');
      }
      if ('webhook_delay_directive_records' in product || 'webhook_delay_directive_record_count' in surface) {
        if ((product.webhook_delay_directive_records || []).length === 0) missing.push('webhook-delay-directive-intent');
      }
      if ('resident_loop_shadow_runs' in product || 'resident_loop_shadow_run_count' in surface) {
        if ((product.resident_loop_shadow_runs || []).length === 0) missing.push('resident-loop-shadow-read');
      }
      if ('resident_dispatch_decisions' in product || 'resident_dispatch_decision_count' in surface) {
        if ((product.resident_dispatch_decisions || []).length === 0) missing.push('resident-dispatch');
      }
      return missing.length === 0 ? 'ready' : 'missing ' + missing.join(', ');
    }
    function workbenchReadinessGateItems(product = state.operationProduct || {}) {
      const surface = product.operation_product_surface || {};
      const principal = state.operatorPrincipal || product.reader_principal || null;
      const membership = focusedMembership();
      const activeSession = el('sessionId').value.trim();
      const sessions = product.sessions || [];
      const evidenceEvents = state.events.length + (product.carrier_evidence || []).reduce((count, entry) => count + (entry.events || []).length, 0);
      const activeTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      const authorityEvidence = (product.site_authority?.decisions || []).length + (product.authority_events || []).length;
      const continuityEvidence = Number(surface.continuity_packet_count ?? (product.site_continuity_packets || []).length ?? 0);
      const nextAction = String(contextValue(controlRoomActionContext(product), 'Action')) || 'monitor_operation_evidence';
      return [
        {
          key: 'operator_identity_ready',
          label: 'Operator Identity',
          status: principal ? 'ready' : 'needs_attention',
          detail: principal ? operatorPrincipalLabel(principal) : 'no signed operator principal',
          action_label: principal ? 'Review Identity' : 'Sign In',
          action: () => { if (principal) renderOperatorIdentity(principal); else window.location.href = '/auth/microsoft/login'; },
        },
        {
          key: 'membership_authority_ready',
          label: 'Membership Authority',
          status: membership && membership.status === 'active' ? 'ready' : 'needs_attention',
          detail: membership ? [membership.role || 'role unknown', membership.status || 'status unknown'].join(' / ') : 'no active membership focus',
          action_label: membership ? 'Focus Membership' : 'Read Site Scope',
          action: () => { if (membership) selectMembership(membership); else run(refreshSiteProduct); },
        },
        {
          key: 'operation_scope_ready',
          label: 'Operation Scope',
          status: product.operation || el('operationId').value.trim() ? 'ready' : 'needs_attention',
          detail: product.operation?.operation_id || el('operationId').value.trim() || 'no operation loaded',
          action_label: product.operation ? 'Read Operation' : 'Read Scope',
          action: () => run(refreshOperation),
        },
        {
          key: 'session_navigation_ready',
          label: 'Session Navigation',
          status: activeSession || sessions.length > 0 ? 'ready' : 'needs_attention',
          detail: (activeSession || 'no active session') + ' / ' + sessions.length + ' listed',
          action_label: sessions.length > 0 ? 'Focus Session' : 'Start Session',
          action: () => { if (sessions.length > 0) focusOperationSession(); else run(async () => { const body = await api.start(); appendEvents([body.event].filter(Boolean)); await refreshStatus(); await refreshOperation(); }); },
        },
        {
          key: 'evidence_inspection_ready',
          label: 'Evidence Inspection',
          status: evidenceEvents > 0 ? 'ready' : 'needs_attention',
          detail: String(evidenceEvents) + ' loaded events',
          action_label: evidenceEvents > 0 ? 'Focus Evidence' : 'Read Evidence',
          action: () => { if (evidenceEvents > 0) focusFlightDeckEvidence(); else run(readSelectedSessionEvidence); },
        },
        {
          key: 'task_lifecycle_ready',
          label: 'Task Lifecycle',
          status: activeTasks.length === 0 && (product.tasks || []).length > 0 ? 'ready' : 'needs_attention',
          detail: String(activeTasks.length) + ' open / ' + (product.tasks || []).length + ' total',
          action_label: activeTasks.length > 0 ? 'Focus Task' : 'Review Tasks',
          action: () => { if (activeTasks.length > 0) selectTask(activeTasks[0]); else renderTaskWorkQueue(); },
        },
        {
          key: 'authority_state_ready',
          label: 'Authority State',
          status: authorityEvidence > 0 ? 'ready' : 'needs_attention',
          detail: String(authorityEvidence) + ' authority records',
          action_label: authorityEvidence > 0 ? 'Focus Authority' : 'Read Authority',
          action: () => { if (authorityEvidence > 0) focusAuthorityPathDecision(); else run(refreshSiteProduct); },
        },
        {
          key: 'continuity_posture_ready',
          label: 'Continuity Posture',
          status: continuityEvidence > 0 ? 'ready' : 'needs_attention',
          detail: String(continuityEvidence) + ' continuity packets',
          action_label: continuityEvidence > 0 ? 'Focus Continuity' : 'Review Workflow',
          action: () => { if ((product.site_continuity_packets || []).length > 0) selectContinuity(product.site_continuity_packets[0]); else applyContinuityWorkflowNextStep(); },
        },
        {
          key: 'next_control_action_ready',
          label: 'Next Control Action',
          status: nextAction === 'monitor_operation_evidence' ? 'ready' : 'needs_attention',
          detail: nextAction,
          action_label: 'Apply Next Action',
          action: applyControlRoomNextAction,
        },
      ];
    }
    function applyWorkbenchReadinessNextAction() {
      const item = workbenchReadinessGateItems().find((entry) => entry.status !== 'ready');
      if (item?.action) item.action();
    }
    function workbenchReadinessActionButton(item) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = item.action_label || 'Focus';
      button.addEventListener('click', item.action);
      return button;
    }
    function renderWorkbenchReadinessGate(product = state.operationProduct || {}) {
      const items = workbenchReadinessGateItems(product);
      el('workbenchReadinessGate').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (item.status !== 'ready' ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.label;
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.detail].filter(Boolean).join(' | ');
        node.append(title, meta, focusActionRow(workbenchReadinessActionButton(item)));
        return node;
      }));
      renderOperationActivityFocusDetail();
    }
    function operationControlBoardContext(product = state.operationProduct || {}) {
      const control = controlRoomActionContext(product);
      const readinessItems = workbenchReadinessGateItems(product);
      const readinessGaps = readinessItems.filter((item) => item.status !== 'ready');
      const sitePosture = state.siteProductOverview || {};
      const operationQueue = operationWorkQueueItems(state.operations || [], product);
      const operationPosture = operationPostureOverview(state.operations || [], product);
      const sessionQueue = sessionWorkQueueItems(product.sessions || [], product);
      const authorityQueue = authorityDecisionQueueItems(product.site_authority?.decisions || [], product);
      const evidenceQueue = evidenceReviewQueueItems();
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      const operationFocus = state.operationFocus || product.operation || null;
      const sessionFocus = state.sessionFocus || activeSessionDetail();
      const authorityFocus = state.authorityFocus || (product.site_authority?.decisions || [])[0] || null;
      const taskFocus = state.taskFocus || openTasks[0] || null;
      const evidenceFocus = state.evidenceFocus || evidenceQueue[0]?.event || null;
      const sessionPath = sessionEvidencePathContext(sessionFocus, product);
      const authoritySummary = authorityPostureSummary(product.site_authority?.decisions || []);
      const authorityEvidenceCount = authorityEvidenceEvents(product).length;
      const taskSummary = taskLifecycleSummary(product.tasks || []);
      const surface = product.operation_product_surface || {};
      const siteFileChangeProposals = product.site_file_change_proposals || [];
      const siteFileMaterializations = product.site_file_materializations || [];
      const mailboxDraftReplyProposals = product.mailbox_draft_reply_proposals || [];
      const mailboxOutlookDraftCreates = product.mailbox_outlook_draft_creates || [];
      const mailboxDraftReplyProposalFocus = state.mailboxDraftReplyProposalFocus || mailboxDraftReplyProposals[0] || null;
      const mailboxOutlookDraftCreateFocus = state.mailboxOutlookDraftCreateFocus || mailboxOutlookDraftCreates[0] || null;
      const siteFileChangeProposalFocus = state.siteFileChangeProposalFocus || siteFileChangeProposals[0] || null;
      const siteFileChangeProposalFile = siteFileChangeProposalFocus?.record?.proposal?.files?.[0]
        || siteFileChangeProposalFocus?.proposal?.files?.[0]
        || null;
      const localIngressRequests = product.local_ingress_requests || [];
      const localIngressEvidence = product.local_ingress_evidence || [];
      const localIngressProviderHeartbeats = product.local_ingress_provider_heartbeats || [];
      const localIngressRequestFocus = state.localIngressRequestFocus || localIngressRequests[0] || null;
      const localIngressEvidenceFocus = state.localIngressEvidenceFocus || localIngressEvidence[0] || null;
      const localIngressProviderHeartbeatFocus = state.localIngressProviderHeartbeatFocus || localIngressProviderHeartbeats[0] || null;
      const localIngressProviderLiveness = surface.local_ingress_provider_liveness || product.operation_lifecycle_status?.local_ingress_provider_liveness || {};
      const localIngressOperationPosture = product.local_ingress_operation_posture || surface.local_ingress_operation_posture || {};
      const repositoryPublicationRequests = product.repository_publication_requests || [];
      const repositoryPublicationEvidence = product.repository_publication_evidence || [];
      const repositoryPublicationProviderHeartbeats = product.repository_publication_provider_heartbeats || [];
      const repositoryPublicationRequestFocus = state.repositoryPublicationRequestFocus || repositoryPublicationRequests[0] || null;
      const repositoryPublicationEvidenceFocus = state.repositoryPublicationEvidenceFocus || repositoryPublicationEvidence[0] || null;
      const repositoryPublicationProviderHeartbeatFocus = state.repositoryPublicationProviderHeartbeatFocus || repositoryPublicationProviderHeartbeats[0] || null;
      const repositoryPublicationProviderLiveness = surface.repository_publication_provider_liveness || product.operation_lifecycle_status?.repository_publication_provider_liveness || {};
      const repositoryPublicationOperationPosture = product.repository_publication_operation_posture || surface.repository_publication_operation_posture || {};
      const controlDomain = contextValue(control, 'Domain') || 'none';
      const controlAction = contextValue(control, 'Action') || 'none';
      const controlTarget = contextValue(control, 'Target') || 'none';
      const controlReason = contextValue(control, 'Reason') || 'none';
      return {
        command: [
          listItem('domain', controlDomain),
          listItem('action', controlAction),
          listItem('target', controlTarget),
          listItem('reason', controlReason),
        ],
        target: [
          listItem('control_domain', controlDomain),
          listItem('control_action', controlAction),
          listItem('control_target', controlTarget),
          listItem('control_reason', controlReason),
          listItem('operation_focus', operationFocus?.operation_id || el('operationId').value.trim() || 'none'),
          listItem('session_focus', sessionFocus?.carrier_session_id || el('sessionId').value.trim() || 'none'),
          listItem('task_focus', taskFocus ? [taskFocus.task_id, taskFocus.status].filter(Boolean).join(' / ') : 'none'),
          listItem('authority_focus', authorityFocus ? [authorityFocus.mutation_class || authorityFocus.event_kind || 'authority', authorityFocus.action || authorityFocus.authority_locus || 'unknown'].join(' / ') : 'none'),
          listItem('evidence_focus', evidenceFocus ? eventTitle(evidenceFocus) : 'none'),
          listItem('mailbox_draft_reply_proposal_focus', mailboxDraftReplyProposalFocus?.proposal_id || 'none'),
          listItem('mailbox_outlook_draft_create_focus', mailboxOutlookDraftCreateFocus?.draft_create_id || 'none'),
          listItem('site_file_change_proposal_focus', siteFileChangeProposalFocus?.proposal_id || 'none'),
          listItem('local_ingress_request_focus', localIngressRequestFocus?.local_ingress_request_id || 'none'),
          listItem('local_ingress_evidence_focus', localIngressEvidenceFocus?.local_ingress_evidence_id || 'none'),
          listItem('local_ingress_provider_heartbeat_focus', localIngressProviderHeartbeatFocus?.local_ingress_provider_heartbeat_id || 'none'),
          listItem('repository_publication_request_focus', repositoryPublicationRequestFocus?.repository_publication_request_id || 'none'),
          listItem('repository_publication_evidence_focus', repositoryPublicationEvidenceFocus?.repository_publication_evidence_id || 'none'),
        ],
        posture: [
          listItem('readiness', contextValue(control, 'Readiness') || operationWorkbenchReadiness(product)),
          listItem('scope', productScopeSummary(product)),
          listItem('operator', operatorPrincipalLabel(state.operatorPrincipal || product.reader_principal)),
          listItem('authority_locus', (product.site_authority?.decisions || [])[0]?.authority_locus || 'unknown'),
          listItem('next_site', sitePosture.next_site_id || 'none'),
          listItem('next_site_action', sitePosture.next_action || 'monitor_sites'),
          listItem('next_site_reason', sitePosture.next_reason || 'all_sites_monitoring'),
          listItem('next_operation', operationPosture.next_operation_id || 'none'),
          listItem('next_operation_action', operationPosture.next_action || 'monitor_operations'),
          listItem('next_operation_reason', operationPosture.next_reason || 'all_operations_monitoring'),
        ],
        queues: [
          listItem('operations_needing_action', operationQueue.filter((item) => item.status !== 'ready').length + ' / ' + operationQueue.length),
          listItem('sessions_needing_action', sessionQueue.filter((item) => item.status !== 'ready').length + ' / ' + sessionQueue.length),
          listItem('open_tasks', openTasks.length + ' / ' + (product.tasks || []).length),
          listItem('authority_needing_action', authorityQueue.filter((item) => item.status !== 'ready').length + ' / ' + authorityQueue.length),
          listItem('mailbox_draft_reply_proposals', mailboxDraftReplyProposals.length + ' / ' + String(surface.mailbox_draft_reply_proposal_count ?? mailboxDraftReplyProposals.length)),
          listItem('mailbox_outlook_draft_creates', mailboxOutlookDraftCreates.length + ' / ' + String(surface.mailbox_outlook_draft_create_count ?? mailboxOutlookDraftCreates.length)),
          listItem('site_file_change_proposals', siteFileChangeProposals.length + ' / ' + String(surface.site_file_change_proposal_count ?? siteFileChangeProposals.length)),
          listItem('site_file_materializations', siteFileMaterializations.length + ' / ' + String(surface.site_file_materialization_count ?? siteFileMaterializations.length)),
          listItem('local_ingress_requests', localIngressRequests.length + ' / ' + String(surface.local_ingress_request_count ?? localIngressRequests.length)),
          listItem('local_ingress_evidence', localIngressEvidence.length + ' / ' + String(surface.local_ingress_evidence_count ?? localIngressEvidence.length)),
          listItem('local_ingress_provider_heartbeats', localIngressProviderHeartbeats.length + ' / ' + String(surface.local_ingress_provider_heartbeat_count ?? localIngressProviderHeartbeats.length)),
          listItem('repository_publication_requests', repositoryPublicationRequests.length + ' / ' + String(surface.repository_publication_request_count ?? repositoryPublicationRequests.length)),
          listItem('repository_publication_evidence', repositoryPublicationEvidence.length + ' / ' + String(surface.repository_publication_evidence_count ?? repositoryPublicationEvidence.length)),
          listItem('repository_publication_provider_heartbeats', repositoryPublicationProviderHeartbeats.length + ' / ' + String(surface.repository_publication_provider_heartbeat_count ?? repositoryPublicationProviderHeartbeats.length)),
        ],
        evidence: [
          listItem('events_loaded', String(state.events.length)),
          listItem('review_items', String(evidenceQueue.length)),
          listItem('focused_evidence', state.evidenceFocus ? eventTitle(state.evidenceFocus) : 'none'),
          listItem('active_lane', state.evidenceLane || 'all'),
        ],
        path: [
          listItem('operation', operationFocus?.operation_id || el('operationId').value.trim() || 'none'),
          listItem('session', sessionFocus?.carrier_session_id || el('sessionId').value.trim() || 'none'),
          listItem('task', state.taskFocus ? [state.taskFocus.task_id, state.taskFocus.status].filter(Boolean).join(' / ') : 'none'),
          listItem('authority', authorityFocus ? [authorityFocus.mutation_class || authorityFocus.event_kind || 'authority', authorityFocus.action || authorityFocus.authority_locus || 'unknown'].join(' / ') : 'none'),
          listItem('evidence', state.evidenceFocus ? eventTitle(state.evidenceFocus) : 'none'),
          listItem('mailbox_draft_reply_proposal', mailboxDraftReplyProposalFocus?.proposal_id || 'none'),
          listItem('mailbox_outlook_draft_create', mailboxOutlookDraftCreateFocus?.draft_create_id || 'none'),
          listItem('site_file_change_proposal', siteFileChangeProposalFocus?.proposal_id || 'none'),
          listItem('local_ingress_request', localIngressRequestFocus?.local_ingress_request_id || 'none'),
          listItem('local_ingress_evidence', localIngressEvidenceFocus?.local_ingress_evidence_id || 'none'),
          listItem('local_ingress_provider_heartbeat', localIngressProviderHeartbeatFocus?.local_ingress_provider_heartbeat_id || 'none'),
          listItem('repository_publication_request', repositoryPublicationRequestFocus?.repository_publication_request_id || 'none'),
          listItem('repository_publication_evidence', repositoryPublicationEvidenceFocus?.repository_publication_evidence_id || 'none'),
          listItem('repository_publication_provider_heartbeat', repositoryPublicationProviderHeartbeatFocus?.repository_publication_provider_heartbeat_id || 'none'),
        ],
        sessionEvidence: [
          listItem('session', contextValue(sessionPath, 'Session') || 'none'),
          listItem('events', contextValue(sessionPath, 'Events') || '0'),
          listItem('provider_events', contextValue(sessionPath, 'Provider Events') || '0'),
          listItem('tool_events', contextValue(sessionPath, 'Tool Events') || '0'),
          listItem('failure_events', contextValue(sessionPath, 'Failure Events') || '0'),
          listItem('session_next_action', contextValue(sessionPath, 'Next Action') || 'select_or_start_session'),
        ],
        authority: [
          listItem('admitted', contextValue(authoritySummary, 'Admitted') || '0'),
          listItem('refused', contextValue(authoritySummary, 'Refused') || '0'),
          listItem('unresolved_locus', contextValue(authoritySummary, 'Unresolved Locus') || '0'),
          listItem('dominant_locus', contextValue(authoritySummary, 'Dominant Locus') || 'none'),
          listItem('controlled_action', authorityFocus?.controlled_action || 'none'),
          listItem('authority_evidence', String(authorityEvidenceCount)),
        ],
        taskLifecycle: [
          listItem('open', contextValue(taskSummary, 'Open') || '0'),
          listItem('closed', contextValue(taskSummary, 'Closed') || '0'),
          listItem('focused_status', contextValue(taskSummary, 'Focused Status') || 'none'),
          listItem('next_task', contextValue(taskSummary, 'Next Task') || 'none'),
          listItem('command_state', contextValue(taskSummary, 'Command State') || 'unknown'),
          listItem('next_action', contextValue(taskSummary, 'Next Action') || 'none'),
        ],
        mailboxStatus: [
          listItem('mailbox_status_shadow_read_count', String(surface.mailbox_status_shadow_read_count ?? 0)),
          listItem('mailbox_status_source_read_count', String(surface.mailbox_status_source_read_count ?? 0)),
          listItem('mailbox_status_authority', surface.mailbox_status_authority || 'not_observed'),
          listItem('mailbox_shadow_target_locus', surface.mailbox_shadow_target_locus || 'not_observed'),
          listItem('mailbox_send_admission', surface.mailbox_send_admission || 'retained'),
          listItem('mailbox_mutation_admission', surface.mailbox_mutation_admission || 'retained'),
          listItem('mailbox_authority_partition', surface.mailbox_authority_partition || 'mailbox_windows_owned'),
        ],
        mailboxDraftReview: [
          listItem('mailbox_draft_reply_proposal_count', String(surface.mailbox_draft_reply_proposal_count ?? mailboxDraftReplyProposals.length)),
          listItem('focused_proposal', mailboxDraftReplyProposalFocus?.proposal_id || 'none'),
          listItem('focused_proposal_subject', mailboxDraftReplyProposalFocus?.subject || 'none'),
          listItem('mailbox_draft_reply_proposal_authority', surface.mailbox_draft_reply_proposal_authority || mailboxDraftReplyProposalFocus?.authority_locus || 'not_observed'),
          listItem('proposal_outlook_draft_create_admission', mailboxDraftReplyProposalFocus?.mailbox_outlook_draft_create_admission || 'not_observed'),
          listItem('proposal_send_admission', mailboxDraftReplyProposalFocus?.mailbox_send_admission || surface.mailbox_send_admission || 'retained'),
          listItem('proposal_mutation_admission', mailboxDraftReplyProposalFocus?.mailbox_mutation_admission || surface.mailbox_mutation_admission || 'retained'),
          listItem('mailbox_draft_reply_authority_partition', surface.mailbox_draft_reply_authority_partition || 'mailbox_draft_reply_proposal_not_observed'),
          listItem('mailbox_draft_reply_next_action', mailboxDraftReplyProposalFocus ? 'review_mailbox_draft_reply_proposal' : 'monitor_mailbox_draft_reply_proposals'),
          listItem('mailbox_outlook_draft_create_count', String(surface.mailbox_outlook_draft_create_count ?? mailboxOutlookDraftCreates.length)),
          listItem('focused_outlook_draft_create', mailboxOutlookDraftCreateFocus?.draft_create_id || 'none'),
          listItem('focused_outlook_message', mailboxOutlookDraftCreateFocus?.outlook_message_id || 'none'),
          listItem('outlook_draft_create_authority', surface.mailbox_outlook_draft_create_authority || mailboxOutlookDraftCreateFocus?.authority_locus || 'not_observed'),
          listItem('outlook_draft_create_admission', mailboxOutlookDraftCreateFocus?.mailbox_outlook_draft_create_admission || surface.mailbox_outlook_draft_create_admission || 'not_observed'),
          listItem('outlook_draft_create_send_admission', mailboxOutlookDraftCreateFocus?.mailbox_send_admission || 'not_observed'),
          listItem('outlook_draft_create_mutation_admission', mailboxOutlookDraftCreateFocus?.mailbox_mutation_admission || 'not_observed'),
          listItem('outlook_draft_create_authority_partition', surface.mailbox_outlook_draft_create_authority_partition || 'mailbox_outlook_draft_create_not_observed'),
          listItem('mailbox_outlook_draft_create_next_action', mailboxOutlookDraftCreateFocus ? 'review_outlook_draft_create_evidence' : 'monitor_outlook_draft_create_records'),
        ],
        siteFileChangeReview: [
          listItem('site_file_change_proposal_count', String(surface.site_file_change_proposal_count ?? siteFileChangeProposals.length)),
          listItem('focused_proposal', siteFileChangeProposalFocus?.proposal_id || 'none'),
          listItem('focused_file', siteFileChangeProposalFile?.file_path || 'none'),
          listItem('site_file_change_proposal_authority', surface.site_file_change_proposal_authority || siteFileChangeProposalFocus?.authority_locus || 'not_observed'),
          listItem('filesystem_executor_authority', surface.filesystem_executor_authority || siteFileChangeProposalFocus?.filesystem_executor_authority || 'retained'),
          listItem('filesystem_mutation_admission', surface.filesystem_mutation_admission || siteFileChangeProposalFocus?.filesystem_mutation_admission || 'retained'),
          listItem('repository_publication_admission', surface.repository_publication_admission || siteFileChangeProposalFocus?.repository_publication_admission || 'retained'),
          listItem('site_file_change_authority_partition', surface.site_file_change_authority_partition || 'filesystem_and_publication_windows_owned'),
          listItem('site_file_change_next_action', siteFileChangeProposalFocus ? 'review_site_file_change_proposal' : 'monitor_site_file_change_proposals'),
          listItem('site_file_materialization_count', String(surface.site_file_materialization_count ?? siteFileMaterializations.length)),
          listItem('site_file_materialization_authority', surface.site_file_materialization_authority || 'not_observed'),
          listItem('cloudflare_site_file_materialization_admission', surface.cloudflare_site_file_materialization_admission || 'not_observed'),
          listItem('cloudflare_site_file_materialization_executor_authority', surface.cloudflare_site_file_materialization_executor_authority || 'not_observed'),
          listItem('windows_filesystem_mutation_admission', surface.windows_filesystem_mutation_admission || 'retained'),
          listItem('site_file_materialization_repository_publication_admission', surface.site_file_materialization_repository_publication_admission || 'retained'),
          listItem('site_file_materialization_authority_partition', surface.site_file_materialization_authority_partition || 'materialization_not_observed_filesystem_and_publication_windows_owned'),
          listItem('site_file_materialization_next_action', siteFileMaterializations.length > 0 ? 'review_site_file_materialization' : 'monitor_site_file_materializations'),
        ],
        localIngressOperationPosture: [
          listItem('schema', localIngressOperationPosture.schema || 'narada.cloudflare_local_ingress_operation_posture.v1'),
          listItem('state', localIngressOperationPosture.state || 'not_observed'),
          listItem('pending_request_count', String(localIngressOperationPosture.pending_request_count ?? 0)),
          listItem('completed_evidence_count', String(localIngressOperationPosture.completed_evidence_count ?? 0)),
          listItem('provider_liveness_state', localIngressOperationPosture.provider_liveness?.state || localIngressProviderLiveness.state || 'not_observed'),
          listItem('provider_liveness_reason', localIngressOperationPosture.provider_liveness?.reason || localIngressProviderLiveness.reason || 'not_observed'),
          listItem('direct_cloudflare_filesystem_mutation_admission', localIngressOperationPosture.direct_cloudflare_filesystem_mutation_admission || surface.local_ingress_direct_cloudflare_filesystem_mutation_admission || 'retained'),
          listItem('repository_publication_admission', localIngressOperationPosture.repository_publication_admission || surface.local_ingress_repository_publication_admission || 'retained'),
          listItem('next_action', localIngressOperationPosture.next_action || 'monitor_local_ingress'),
        ],
        localIngressReview: [
          listItem('local_ingress_request_count', String(surface.local_ingress_request_count ?? localIngressRequests.length)),
          listItem('focused_request', localIngressRequestFocus?.local_ingress_request_id || 'none'),
          listItem('request_action', localIngressRequestFocus?.requested_action_ref || 'none'),
          listItem('local_ingress_request_authority', surface.local_ingress_request_authority || localIngressRequestFocus?.request_authority || 'not_observed'),
          listItem('local_ingress_target_authority_locus', surface.local_ingress_target_authority_locus || localIngressRequestFocus?.target_authority_locus || 'not_observed'),
          listItem('local_ingress_executor_authority', surface.local_ingress_executor_authority || localIngressRequestFocus?.local_executor_authority || 'not_observed'),
          listItem('local_ingress_execution_admission', surface.local_ingress_execution_admission || localIngressRequestFocus?.local_execution_admission || 'not_observed'),
          listItem('local_ingress_evidence_count', String(surface.local_ingress_evidence_count ?? localIngressEvidence.length)),
          listItem('focused_evidence', localIngressEvidenceFocus?.local_ingress_evidence_id || 'none'),
          listItem('local_ingress_evidence_authority', surface.local_ingress_evidence_authority || localIngressEvidenceFocus?.local_executor_authority || 'not_observed'),
          listItem('local_ingress_evidence_store_authority', surface.local_ingress_evidence_store_authority || (localIngressEvidenceFocus ? 'cloudflare_local_ingress_evidence_store' : 'not_observed')),
          listItem('local_ingress_provider_heartbeat_count', String(surface.local_ingress_provider_heartbeat_count ?? localIngressProviderHeartbeats.length)),
          listItem('focused_provider_heartbeat', localIngressProviderHeartbeatFocus?.local_ingress_provider_heartbeat_id || 'none'),
          listItem('provider_liveness_state', localIngressProviderLiveness.state || 'not_observed'),
          listItem('provider_liveness_reason', localIngressProviderLiveness.reason || 'not_observed'),
          listItem('provider_liveness_authority', surface.local_ingress_provider_liveness_authority || localIngressProviderLiveness.provider_liveness_authority || 'not_observed'),
          listItem('latest_provider_heartbeat_at', localIngressProviderLiveness.latest_heartbeat_at || localIngressProviderHeartbeatFocus?.recorded_at || 'none'),
          listItem('provider_authority', localIngressProviderHeartbeatFocus?.provider_authority || 'not_observed'),
          listItem('provider_status', localIngressProviderHeartbeatFocus?.status || 'not_observed'),
          listItem('local_filesystem_mutation_admission', localIngressEvidenceFocus?.local_filesystem_mutation_admission || 'not_observed'),
          listItem('direct_cloudflare_filesystem_mutation_admission', surface.local_ingress_direct_cloudflare_filesystem_mutation_admission || localIngressEvidenceFocus?.direct_cloudflare_filesystem_mutation_admission || 'retained'),
          listItem('repository_publication_admission', surface.local_ingress_repository_publication_admission || localIngressEvidenceFocus?.repository_publication_admission || 'retained'),
          listItem('local_ingress_authority_partition', surface.local_ingress_authority_partition || 'local_ingress_not_observed_windows_authority_retained'),
          listItem('local_ingress_next_action', localIngressOperationPosture.next_action || (['missing', 'stale'].includes(String(localIngressProviderLiveness.state || '')) ? 'review_local_ingress_provider_liveness' : localIngressEvidence.length > 0 ? 'review_local_ingress_evidence' : localIngressRequests.length > 0 ? 'await_windows_local_ingress_evidence' : 'monitor_local_ingress')),
        ],
        repositoryPublicationReview: [
          listItem('repository_publication_request_count', String(surface.repository_publication_request_count ?? repositoryPublicationRequests.length)),
          listItem('focused_request', repositoryPublicationRequestFocus?.repository_publication_request_id || 'none'),
          listItem('publication_ref', repositoryPublicationRequestFocus?.publication_ref || 'none'),
          listItem('repository_ref', repositoryPublicationRequestFocus?.repository_ref || 'none'),
          listItem('branch_ref', repositoryPublicationRequestFocus?.branch_ref || 'none'),
          listItem('repository_publication_request_authority', surface.repository_publication_request_authority || repositoryPublicationRequestFocus?.authority_locus || 'not_observed'),
          listItem('repository_publication_executor_authority', surface.repository_publication_executor_authority || repositoryPublicationRequestFocus?.repository_publication_executor_authority || 'not_observed'),
          listItem('repository_publication_execution_admission', surface.repository_publication_execution_admission || repositoryPublicationRequestFocus?.repository_publication_admission || 'not_observed'),
          listItem('repository_publication_evidence_count', String(surface.repository_publication_evidence_count ?? repositoryPublicationEvidence.length)),
          listItem('focused_evidence', repositoryPublicationEvidenceFocus?.repository_publication_evidence_id || 'none'),
          listItem('publication_status', repositoryPublicationEvidenceFocus?.publication_status || 'not_observed'),
          listItem('published_commit_ref', repositoryPublicationEvidenceFocus?.published_commit_ref || 'none'),
          listItem('repository_publication_evidence_authority', surface.repository_publication_evidence_authority || repositoryPublicationEvidenceFocus?.repository_publication_evidence_authority || 'not_observed'),
          listItem('repository_publication_evidence_store_authority', surface.repository_publication_evidence_store_authority || (repositoryPublicationEvidenceFocus ? 'cloudflare_repository_publication_evidence_store' : 'not_observed')),
          listItem('repository_publication_provider_heartbeat_count', String(surface.repository_publication_provider_heartbeat_count ?? repositoryPublicationProviderHeartbeats.length)),
          listItem('focused_provider_heartbeat', repositoryPublicationProviderHeartbeatFocus?.repository_publication_provider_heartbeat_id || 'none'),
          listItem('provider_liveness_state', repositoryPublicationProviderLiveness.state || 'not_observed'),
          listItem('provider_liveness_reason', repositoryPublicationProviderLiveness.reason || 'not_observed'),
          listItem('provider_liveness_authority', surface.repository_publication_provider_liveness_authority || repositoryPublicationProviderLiveness.provider_liveness_authority || 'not_observed'),
          listItem('latest_provider_heartbeat_at', repositoryPublicationProviderLiveness.latest_heartbeat_at || repositoryPublicationProviderHeartbeatFocus?.recorded_at || 'none'),
          listItem('provider_authority', repositoryPublicationProviderHeartbeatFocus?.provider_authority || 'not_observed'),
          listItem('provider_status', repositoryPublicationProviderHeartbeatFocus?.status || 'not_observed'),
          listItem('cloudflare_git_push_admission', surface.repository_publication_cloudflare_git_push_admission || repositoryPublicationRequestFocus?.cloudflare_git_push_admission || repositoryPublicationEvidenceFocus?.cloudflare_git_push_admission || 'retained'),
          listItem('direct_cloudflare_repository_mutation_admission', surface.repository_publication_direct_cloudflare_repository_mutation_admission || repositoryPublicationRequestFocus?.direct_cloudflare_repository_mutation_admission || repositoryPublicationEvidenceFocus?.direct_cloudflare_repository_mutation_admission || 'retained'),
          listItem('repository_publication_authority_partition', surface.repository_publication_authority_partition || 'repository_publication_not_observed_windows_authority_retained'),
          listItem('repository_publication_next_action', repositoryPublicationOperationPosture.next_action || (['missing', 'stale'].includes(String(repositoryPublicationProviderLiveness.state || '')) ? 'review_repository_publication_provider_liveness' : repositoryPublicationEvidence.length > 0 ? 'review_repository_publication_evidence' : repositoryPublicationRequests.length > 0 ? 'await_windows_repository_publication_evidence' : 'monitor_repository_publication')),
        ],
        repositoryPublicationOperationPosture: [
          listItem('schema', repositoryPublicationOperationPosture.schema || 'narada.cloudflare_repository_publication_operation_posture.v1'),
          listItem('state', repositoryPublicationOperationPosture.state || 'not_observed'),
          listItem('pending_request_count', String(repositoryPublicationOperationPosture.pending_request_count ?? 0)),
          listItem('completed_evidence_count', String(repositoryPublicationOperationPosture.completed_evidence_count ?? 0)),
          listItem('provider_liveness_state', repositoryPublicationOperationPosture.provider_liveness?.state || repositoryPublicationProviderLiveness.state || 'not_observed'),
          listItem('provider_liveness_reason', repositoryPublicationOperationPosture.provider_liveness?.reason || repositoryPublicationProviderLiveness.reason || 'not_observed'),
          listItem('cloudflare_git_push_admission', repositoryPublicationOperationPosture.cloudflare_git_push_admission || surface.repository_publication_cloudflare_git_push_admission || 'retained'),
          listItem('direct_cloudflare_repository_mutation_admission', repositoryPublicationOperationPosture.direct_cloudflare_repository_mutation_admission || surface.repository_publication_direct_cloudflare_repository_mutation_admission || 'retained'),
          listItem('next_action', repositoryPublicationOperationPosture.next_action || 'monitor_repository_publication'),
        ],
        readiness: readinessGaps.length > 0
          ? readinessGaps.slice(0, 4).map((item) => listItem(item.label, item.detail || item.action_label || item.status))
          : [listItem('ready', 'all readiness gates satisfied')],
      };
    }
    function renderOperationControlBoard(product = state.operationProduct || {}) {
      const board = operationControlBoardContext(product);
      el('operationControlTarget').replaceChildren(...board.target.map((item) => evidenceField(item.label, item.value)));
      el('operationControlBoard').replaceChildren(
        renderListBlock('Control Command', board.command),
        renderListBlock('Focused Control Target', board.target),
        renderListBlock('Control Posture', board.posture),
        renderListBlock('Active Work Path', board.path),
        renderListBlock('Session Evidence Posture', board.sessionEvidence),
        renderListBlock('Authority Posture', board.authority),
        renderListBlock('Task Lifecycle Posture', board.taskLifecycle),
        renderListBlock('Mailbox Status Posture', board.mailboxStatus),
        renderListBlock('Mailbox Draft Review', board.mailboxDraftReview),
        renderListBlock('Site File Change Review', board.siteFileChangeReview),
        renderListBlock('Local Ingress Operation Posture', board.localIngressOperationPosture),
        renderListBlock('Local Ingress Review', board.localIngressReview),
        renderListBlock('Repository Publication Operation Posture', board.repositoryPublicationOperationPosture),
        renderListBlock('Repository Publication Review', board.repositoryPublicationReview),
        renderListBlock('Work Queues', board.queues),
        renderListBlock('Evidence Review', board.evidence),
        renderListBlock('Readiness Gaps', board.readiness),
      );
    }
    function contextValue(context, label) {
      return (context || []).find(([key]) => key === label)?.[1] || '';
    }
    function controlRoomActionContext(product = state.operationProduct || {}) {
      const siteId = product.site?.site_id || product.operation?.site_id || el('siteId').value.trim() || '';
      const operationId = product.operation?.operation_id || el('operationId').value.trim() || '';
      const sessionId = el('sessionId').value.trim();
      const siteAction = String(contextValue(siteActionContext(), 'Next Action'));
      const membershipAction = String(contextValue(membershipActionContext(), 'Next Action'));
      const operationAction = String(contextValue(operationActionContext(), 'Next Action'));
      const sessionAction = String(contextValue(sessionActionContext(), 'Next Action'));
      const authorityAction = String(contextValue(authorityActionContext(product), 'Next Action'));
      const operationPathAction = String(contextValue(operationPathContext(focusedOperation(), product), 'Next Action'));
      const sessionPathAction = String(contextValue(sessionEvidencePathContext(focusedSession(), product), 'Next Action'));
      const taskPathAction = String(contextValue(taskEvidencePathContext(state.taskFocus, product), 'Next Action'));
      const authorityPathAction = String(contextValue(authorityPathContext(product), 'Next Action'));
      const targets = operationFlightDeckTargets(product);
      const surface = product.operation_product_surface || {};
      const lifecycleStatus = surface.lifecycle_status || product.operation_lifecycle_status || {};
      const localIngressOperationPosture = product.local_ingress_operation_posture || surface.local_ingress_operation_posture || {};
      const repositoryPublicationOperationPosture = product.repository_publication_operation_posture || surface.repository_publication_operation_posture || {};
      const transferPosture = authorityTransferPosture(product) || {};
      const transferAction = transferPosture.next_action || '';
      const transferTarget = (transferPosture.remaining_windows_authorities || [])[0] || null;
      const webhookDelayDirectiveRecords = product.webhook_delay_directive_records || [];
      const webhookDelayDirectiveDeliveries = product.webhook_delay_directive_deliveries || [];
      const webhookDelayDirectiveSurfacePresent = 'webhook_delay_directive_records' in product || 'webhook_delay_directive_record_count' in surface;
      const dispatchDecisions = product.resident_dispatch_decisions || [];
      const dispatchSurfacePresent = 'resident_dispatch_decisions' in product || 'resident_dispatch_decision_count' in surface;
      const next = (() => {
        if (!siteId && !operationId) return { domain: 'site', action: 'select_site_or_operation', target: 'none', reason: 'no_site_or_operation_loaded' };
        if (state.productScope === 'none') {
          return operationId
            ? { domain: 'product_scope', action: 'read_operation_scope', target: operationId, reason: 'operation_scope_not_loaded' }
            : { domain: 'product_scope', action: 'read_site_scope', target: siteId, reason: 'site_scope_not_loaded' };
        }
        if (siteAction === 'create_or_select_operation') {
          return { domain: 'site', action: 'focus_site_operation', target: siteId, reason: 'site_has_no_active_operation_focus' };
        }
        if (siteAction === 'read_site_authority') {
          return { domain: 'authority', action: 'read_site_authority', target: siteId, reason: 'site_authority_not_loaded' };
        }
        if (membershipAction && !['enter_principal', 'monitor_membership_authority'].includes(membershipAction)) {
          return { domain: 'membership', action: membershipAction, target: contextValue(membershipActionContext(), 'Principal') || 'none', reason: 'membership_authority_bridge_needs_attention' };
        }
        if (operationAction && !['inspect_operation_evidence'].includes(operationAction)) {
          return { domain: 'operation', action: operationAction, target: operationId || 'none', reason: 'operation_focus_or_scope_needs_attention' };
        }
        if (sessionAction && !['inspect_session_evidence'].includes(sessionAction)) {
          return { domain: 'session', action: sessionAction, target: sessionId || contextValue(sessionActionContext(), 'Session') || 'none', reason: 'session_focus_or_evidence_needs_attention' };
        }
        if (authorityAction && !['monitor_authority_admissions'].includes(authorityAction)) {
          return { domain: 'authority', action: authorityAction, target: contextValue(authorityActionContext(product), 'Focused Decision') || 'authority', reason: 'authority_state_needs_attention' };
        }
        if (transferPosture.schema === 'narada.cloudflare_authority_transfer_posture.v1' && transferPosture.transfer_complete !== true) {
          return { domain: 'authority_transfer', action: transferAction || 'continue_authority_transfer', target: transferTarget ? [transferTarget.domain, transferTarget.authority].join('/') : 'authority_transfer', reason: 'windows_authority_remains' };
        }
        if (lifecycleStatus.next_action === 'session') {
          return { domain: 'operation_lifecycle', action: 'focus_lifecycle_start_session', target: operationId || 'operation', reason: 'operation_lifecycle_missing_session' };
        }
        if (['carrier_evidence', 'local_resident_carrier_evidence'].includes(lifecycleStatus.next_action)) {
          return {
            domain: 'operation_lifecycle',
            action: 'focus_lifecycle_read_evidence',
            target: sessionId || operationId || 'operation',
            reason: lifecycleStatus.next_action === 'local_resident_carrier_evidence'
              ? 'operation_lifecycle_missing_local_resident_carrier_evidence'
              : 'operation_lifecycle_missing_carrier_evidence',
          };
        }
        if (lifecycleStatus.next_action === 'continuity_packet') {
          return { domain: 'operation_lifecycle', action: 'focus_lifecycle_continuity', target: operationId || siteId || 'operation', reason: 'operation_lifecycle_missing_continuity_packet' };
        }
        if (lifecycleStatus.next_action === 'continuity_loop_report') {
          return { domain: 'operation_lifecycle', action: 'focus_lifecycle_continuity_loop_report', target: operationId || siteId || 'operation', reason: 'operation_lifecycle_missing_continuity_loop_report' };
        }
        if (lifecycleStatus.next_action === 'continuity_reconciliation_execution') {
          const route = product.operation_workflow_route || product.operation_product_surface?.operation_workflow_route || {};
          if (route.next_action && route.next_action !== 'review_site_continuity_reconciliation_execution') {
            return { domain: 'operation_workflow', action: route.next_action, target: route.target || operationId || siteId || 'operation', reason: route.reason || 'operation_workflow_route_active' };
          }
          const reconciliationExecutionRef = lifecycleStatus.site_continuity_reconciliation_execution_status?.latest_execution_id
            || product.site_continuity_reconciliation_execution_status?.latest_execution_id
            || (product.site_continuity_reconciliation_executions || [])[0]?.execution_id
            || operationId
            || siteId
            || 'operation';
          return { domain: 'operation_lifecycle', action: 'review_site_continuity_reconciliation_execution', target: reconciliationExecutionRef, reason: 'operation_lifecycle_continuity_reconciliation_execution_attention' };
        }
        if (lifecycleStatus.next_action === 'open_tasks') {
          return { domain: 'operation_lifecycle', action: 'focus_lifecycle_open_task', target: (targets.task?.task_id || 'task'), reason: 'operation_lifecycle_open_tasks' };
        }
        if (lifecycleStatus.next_action === 'undelivered_directives') {
          return { domain: 'operation_lifecycle', action: 'focus_lifecycle_directive_delivery', target: (webhookDelayDirectiveRecords[0]?.directive_record_id || 'directive'), reason: 'operation_lifecycle_undelivered_directives' };
        }
        if (['local_ingress_provider_liveness_missing', 'local_ingress_provider_liveness_stale'].includes(lifecycleStatus.next_action)) {
          return { domain: 'local_ingress_provider_liveness', action: 'review_local_ingress_provider_liveness', target: targets.localIngressProviderHeartbeat?.local_ingress_provider_heartbeat_id || siteId || operationId || 'local_ingress_provider_liveness', reason: lifecycleStatus.next_action };
        }
        if (localIngressOperationPosture.next_action === 'restore_windows_local_ingress_executor') {
          return { domain: 'local_ingress_operation_posture', action: 'restore_windows_local_ingress_executor', target: targets.localIngressProviderHeartbeat?.local_ingress_provider_heartbeat_id || siteId || operationId || 'local_ingress_provider_liveness', reason: 'local_ingress_operation_posture_requires_windows_executor' };
        }
        if (localIngressOperationPosture.next_action === 'review_local_ingress_evidence') {
          return { domain: 'local_ingress_operation_posture', action: 'review_local_ingress_evidence', target: targets.localIngressEvidence?.local_ingress_evidence_id || siteId || operationId || 'local_ingress_evidence', reason: 'local_ingress_operation_posture_has_returned_evidence' };
        }
        if (['repository_publication_provider_liveness_missing', 'repository_publication_provider_liveness_stale'].includes(lifecycleStatus.next_action)) {
          return { domain: 'repository_publication_provider_liveness', action: 'review_repository_publication_provider_liveness', target: targets.repositoryPublicationProviderHeartbeat?.repository_publication_provider_heartbeat_id || siteId || operationId || 'repository_publication_provider_liveness', reason: lifecycleStatus.next_action };
        }
        if (repositoryPublicationOperationPosture.next_action === 'restore_windows_repository_publication_provider') {
          return { domain: 'repository_publication_operation_posture', action: 'restore_windows_repository_publication_provider', target: targets.repositoryPublicationProviderHeartbeat?.repository_publication_provider_heartbeat_id || siteId || operationId || 'repository_publication_provider_liveness', reason: 'repository_publication_operation_posture_requires_windows_provider' };
        }
        if (repositoryPublicationOperationPosture.next_action === 'review_repository_publication_evidence') {
          return { domain: 'repository_publication_operation_posture', action: 'review_repository_publication_evidence', target: targets.repositoryPublicationEvidence?.repository_publication_evidence_id || siteId || operationId || 'repository_publication_evidence', reason: 'repository_publication_operation_posture_has_returned_evidence' };
        }
        if (operationPathAction === 'inspect_attention') {
          return { domain: 'operation_path', action: 'focus_operation_path_attention', target: contextValue(operationPathContext(focusedOperation(), product), 'Operation') || operationId || 'operation', reason: 'operation_path_has_open_attention' };
        }
        if (operationPathAction === 'inspect_open_task') {
          return { domain: 'operation_path', action: 'focus_operation_path_task', target: contextValue(operationPathContext(focusedOperation(), product), 'Operation') || operationId || 'operation', reason: 'operation_path_has_open_task' };
        }
        if (sessionPathAction === 'inspect_session_failures') {
          return { domain: 'session_path', action: 'focus_session_path_evidence', target: contextValue(sessionEvidencePathContext(focusedSession(), product), 'Session') || sessionId || 'session', reason: 'session_path_has_failures' };
        }
        if (sessionPathAction === 'inspect_open_task') {
          return { domain: 'session_path', action: 'focus_session_path_task', target: contextValue(sessionEvidencePathContext(focusedSession(), product), 'Session') || sessionId || 'session', reason: 'session_path_has_open_task' };
        }
        if (taskPathAction === 'inspect_evidence_or_reopen') {
          return { domain: 'task_path', action: 'focus_task_path_evidence', target: contextValue(taskEvidencePathContext(state.taskFocus, product), 'Task') || 'task', reason: 'task_path_closed_needs_evidence_review' };
        }
        if (authorityPathAction && !['monitor_authority_admissions'].includes(authorityPathAction)) {
          return { domain: 'authority_path', action: 'focus_authority_path_evidence', target: contextValue(authorityPathContext(product), 'Focused Decision') || 'authority', reason: 'authority_path_needs_evidence_or_locus_attention' };
        }
        if (webhookDelayDirectiveRecords.length > 0 && !state.webhookDelayDirectiveFocus) {
          return { domain: 'webhook_delay_directive', action: 'focus_webhook_delay_directive_intent', target: webhookDelayDirectiveRecords[0].directive_record_id || 'directive_intent', reason: 'directive_intent_record_needs_operator_focus' };
        }
        if (state.webhookDelayDirectiveFocus && !taskForDirectiveIntent(state.webhookDelayDirectiveFocus, product)) {
          return { domain: 'task', action: 'create_task_from_directive_intent', target: state.webhookDelayDirectiveFocus.directive_record_id || 'directive_intent', reason: 'directive_intent_has_no_task' };
        }
        if (webhookDelayDirectiveDeliveries.length > 0 && !state.webhookDelayDirectiveDeliveryFocus) {
          return { domain: 'webhook_delay_directive_delivery', action: 'focus_webhook_delay_directive_delivery', target: webhookDelayDirectiveDeliveries[0].delivery_id || webhookDelayDirectiveDeliveries[0].directive_delivery_id || 'directive_delivery', reason: 'directive_delivery_needs_operator_focus' };
        }
        if (webhookDelayDirectiveSurfacePresent && webhookDelayDirectiveRecords.length === 0 && (product.webhook_delay_shadow_observations || []).length > 0) {
          return { domain: 'webhook_delay_directive', action: 'focus_webhook_delay_shadow_read', target: (product.webhook_delay_shadow_observations || [])[0].observation_id || 'shadow_read', reason: 'directive_intent_not_recorded_from_shadow_read' };
        }
        if (dispatchSurfacePresent && dispatchDecisions.length === 0 && operationId) {
          return { domain: 'resident_dispatch', action: 'start_resident_dispatch', target: operationId, reason: 'cloudflare_primary_dispatch_not_recorded' };
        }
        if (targets.attention && targets.attention.status !== 'resolved') {
          return { domain: 'attention', action: 'focus_open_attention', target: targets.attention.directive_id || 'attention', reason: 'open_operation_attention' };
        }
        if (targets.task && !['done', 'closed', 'resolved'].includes(String(targets.task.status || '').toLowerCase())) {
          return { domain: 'task', action: 'focus_open_task', target: targets.task.task_id || 'task', reason: 'open_task_lifecycle' };
        }
        return { domain: 'evidence', action: 'monitor_operation_evidence', target: sessionId || operationId || siteId || 'control_room', reason: 'workbench_ready_for_monitoring' };
      })();
      return [
        ['Domain', next.domain],
        ['Action', next.action],
        ['Target', next.target],
        ['Reason', next.reason],
        ['Readiness', operationWorkbenchReadiness(product)],
      ];
    }
    function renderControlRoomActionSummary(product = state.operationProduct || {}) {
      el('controlRoomActionSummary').replaceChildren(...controlRoomActionContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function applyControlRoomNextAction() {
      const product = state.operationProduct || {};
      const action = String(contextValue(controlRoomActionContext(product), 'Action'));
      if (action === 'read_site_scope' || action === 'read_membership_site') { run(refreshSiteProduct); return; }
      if (action === 'read_operation_scope') { run(refreshOperation); return; }
      if (action === 'focus_site_operation') { focusSiteOperation(); return; }
      if (action === 'put_membership') { run(putFocusedMembership); return; }
      if (action === 'focus_membership_authority' || action === 'inspect_inactive_membership') { focusMembershipAuthority(); return; }
      if (action === 'use_focused_operation') { useFocusedOperation(); return; }
      if (action === 'read_operation_evidence') { run(refreshOperation); return; }
      if (action === 'focus_operation_session' || action === 'start_or_select_session') { focusOperationSession(); return; }
      if (action === 'use_focused_session') { useFocusedSession(); return; }
      if (action === 'read_session_evidence') { run(readSelectedSessionEvidence); return; }
      if (action === 'focus_authority_evidence' || action === 'inspect_refused_authority' || action === 'resolve_authority_locus' || action === 'read_site_authority') { applyAuthorityNextAction(); return; }
      if (action.startsWith('transfer_') || action === 'continue_authority_transfer' || action === 'verify_full_cloudflare_authority') { focusAuthorityTransferNextAction(product); return; }
      if (action === 'focus_lifecycle_start_session') { focusOperationSession(); return; }
      if (action === 'focus_lifecycle_read_evidence') { run(refreshOperation); return; }
      if (action === 'focus_lifecycle_continuity') { applyContinuityWorkflowNextStep(); return; }
      if (action === 'focus_lifecycle_continuity_loop_report') { focusContinuityLoopReport(); return; }
      if (action === 'review_site_continuity_reconciliation_execution') { focusOperationReviewFromRoute(operationWorkflowRouteStage(product), product); return; }
      if (action === 'focus_lifecycle_open_task') { applyFlightDeckNextAction(); return; }
      if (action === 'focus_lifecycle_directive_delivery') { focusWebhookDelayDirectiveDelivery(); return; }
      if (action === 'focus_operation_path_attention') { focusOperationPathAttention(); return; }
      if (action === 'focus_operation_path_task') { focusOperationPathTask(); return; }
      if (action === 'focus_session_path_evidence') { focusSessionPathEvidence(); return; }
      if (action === 'focus_session_path_task') { focusSessionPathTask(); return; }
      if (action === 'focus_task_path_evidence') { focusTaskPathEvidence(); return; }
      if (action === 'focus_authority_path_evidence') { focusAuthorityEvidence(); return; }
      if (action === 'focus_webhook_delay_directive_intent') { focusWebhookDelayDirective(); return; }
      if (action === 'create_task_from_directive_intent') { run(createTaskFromFocusedDirectiveIntent); return; }
      if (action === 'focus_webhook_delay_directive_delivery') { focusWebhookDelayDirectiveDelivery(); return; }
      if (action === 'focus_webhook_delay_shadow_read') { focusWebhookDelayShadow(); return; }
      if (action === 'restore_windows_local_ingress_executor' || action === 'monitor_local_ingress_provider') { focusLocalIngressProviderLiveness(); return; }
      if (action === 'review_local_ingress_evidence') { const targets = operationFlightDeckTargets(product); if (targets.localIngressEvidence) selectLocalIngressEvidence(targets.localIngressEvidence); else focusLocalIngressProviderLiveness(); return; }
      if (action === 'review_local_ingress_provider_liveness' || action === 'focus_local_ingress_provider_liveness') { focusLocalIngressProviderLiveness(); return; }
      if (action === 'restore_windows_repository_publication_provider' || action === 'monitor_repository_publication_provider') { focusRepositoryPublicationProviderLiveness(); return; }
      if (action === 'review_repository_publication_evidence') { const targets = operationFlightDeckTargets(product); if (targets.repositoryPublicationEvidence) selectRepositoryPublicationEvidence(targets.repositoryPublicationEvidence); else focusRepositoryPublicationProviderLiveness(); return; }
      if (action === 'review_repository_publication_provider_liveness' || action === 'focus_repository_publication_provider_liveness') { focusRepositoryPublicationProviderLiveness(); return; }
      if (action === 'start_resident_dispatch') { run(startResidentDispatchFromWorkbench); return; }
      if (action === 'focus_open_attention' || action === 'focus_open_task' || action === 'monitor_operation_evidence') { applyFlightDeckNextAction(); return; }
      applyFlightDeckNextAction();
    }
    function operatorRouteStage(domain, context, readyActions, targetLabel, action) {
      const nextAction = String(contextValue(context, 'Next Action') || 'none');
      const commandState = String(contextValue(context, 'Command State') || 'not_classified');
      const commandAction = String(contextValue(context, 'Command Action') || nextAction);
      const target = String(contextValue(context, targetLabel) || contextValue(context, 'Target Ref') || contextValue(context, 'Focused Decision') || 'none');
      const ready = readyActions.includes(nextAction) || readyActions.includes(commandState);
      return { domain, command_state: commandState, command_action: commandAction, next_action: nextAction, target, status: ready ? 'ready' : 'needs_attention', action };
    }
    function taskRouteStage(product = state.operationProduct || {}) {
      const targets = operationFlightDeckTargets(product);
      const selected = targets.task || selectedTaskFromWorkbench();
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      if (!selected && openTasks.length === 0) {
        return { domain: 'task', command_state: 'no_open_tasks', command_action: 'monitor_task_lifecycle', next_action: 'monitor_task_lifecycle', target: 'none', status: 'ready', action: applyFlightDeckNextAction };
      }
      const evidenceEvents = state.events.filter((event) => selected?.task_id && JSON.stringify(event.payload || {}).includes(selected.task_id));
      const command = classifyCloudflareTaskCommandState({
        task_id: selected?.task_id || '',
        status: selected?.status || '',
        evidence_count: evidenceEvents.length,
      });
      const ready = ['evidence_ready'].includes(command.command_state) || (openTasks.length === 0 && command.lifecycle === 'closed');
      return {
        domain: 'task',
        command_state: command.command_state,
        command_action: command.command_action,
        next_action: command.next_action,
        target: selected?.task_id || 'none',
        status: ready ? 'ready' : 'needs_attention',
        action: () => { if (selected) selectTask(selected); else applyFlightDeckNextAction(); },
      };
    }
    function authorityTransferRouteStage(product = state.operationProduct || {}) {
      const posture = authorityTransferPosture(product) || {};
      if (posture.schema !== 'narada.cloudflare_authority_transfer_posture.v1') {
        return {
          domain: 'authority_transfer',
          command_state: 'authority_transfer_unloaded',
          command_action: 'read_operation_scope',
          next_action: 'read_operation_scope',
          target: product.operation?.operation_id || product.site?.site_id || el('operationId').value.trim() || el('siteId').value.trim() || 'none',
          status: 'needs_attention',
          action: () => run(product.operation || el('operationId').value.trim() ? refreshOperation : refreshSiteProduct),
        };
      }
      const firstAuthority = (posture.remaining_windows_authorities || [])[0] || null;
      return {
        domain: 'authority_transfer',
        command_state: posture.transfer_complete ? 'authority_transfer_complete' : 'authority_transfer_attention',
        command_action: posture.next_action || 'monitor_authority_transfer',
        next_action: posture.next_action || 'monitor_authority_transfer',
        target: firstAuthority ? [firstAuthority.domain, firstAuthority.authority].join('/') : 'cloudflare_authority',
        status: posture.transfer_complete ? 'ready' : 'needs_attention',
        action: () => focusAuthorityTransferNextAction(product),
      };
    }
    function sitePostureRouteStage() {
      const provided = state.sitePostureRoute || null;
      if (provided?.schema === 'narada.cloudflare_site_posture_route.v1') return { ...provided, action: focusNextSiteFromOverview };
      const overview = state.siteProductOverview || {};
      const focusedSiteId = focusedSite()?.site_id || el('siteId').value.trim();
      const changesFocus = overview.next_site_id && overview.next_site_id !== focusedSiteId;
      const needsAttention = overview.site_count > 0 && overview.next_action && overview.next_action !== 'monitor_sites' && changesFocus;
      return {
        domain: 'site_posture',
        command_state: needsAttention ? 'site_posture_attention' : 'site_posture_ready',
        command_action: needsAttention ? 'focus_next_site' : 'monitor_sites',
        next_action: needsAttention ? 'focus_next_site' : 'monitor_sites',
        target: overview.next_site_id || 'none',
        status: needsAttention ? 'needs_attention' : 'ready',
        action: focusNextSiteFromOverview,
      };
    }
    function operationPostureRouteStage(product = state.operationProduct || {}) {
      const provided = product.operation_posture_route || product.operation_product_surface?.operation_posture_route || null;
      if (provided?.schema === 'narada.cloudflare_operation_posture_route.v1') return { ...provided, action: () => run(focusNextOperationFromPosture) };
      const overview = operationPostureOverview(state.operations || [], product);
      const activeOperationId = el('operationId').value.trim();
      const changesFocus = overview.next_operation_id && overview.next_operation_id !== activeOperationId;
      const status = overview.operation_count > 0 && overview.next_status !== 'ready' && changesFocus ? 'needs_attention' : 'ready';
      return {
        domain: 'operation_posture',
        command_state: status === 'ready' ? 'operation_posture_ready' : 'operation_posture_attention',
        command_action: status === 'ready' ? 'monitor_operations' : 'focus_next_operation',
        next_action: status === 'ready' ? 'monitor_operations' : 'focus_next_operation',
        target: overview.next_operation_id || 'none',
        status,
        action: () => run(focusNextOperationFromPosture),
      };
    }
    function operationWorkflowRouteStage(product = state.operationProduct || {}) {
      const provided = product.operation_workflow_route || product.operation_product_surface?.operation_workflow_route || null;
      if (provided?.schema === 'narada.cloudflare_operation_workflow_route.v1') {
        return { ...provided, action: () => applyOperationWorkflowRouteAction(provided, product) };
      }
      return {
        domain: 'operation_workflow',
        command_state: 'operation_workflow_unloaded',
        command_action: 'read_operation_scope',
        next_action: 'read_operation_scope',
        target: product.operation?.operation_id || el('operationId').value.trim() || 'none',
        status: 'needs_attention',
        action: () => run(refreshOperation),
      };
    }
    function applyOperationWorkflowRouteAction(route = operationWorkflowRouteStage(), product = state.operationProduct || {}) {
      const action = String(route.next_action || route.command_action || '');
      if (route.operator_focus && applyOperationOperatorFocus(route.operator_focus, product)) return;
      if (action === 'select_operation') { focusSiteOperation(); return; }
      if (action === 'review_persistence_posture') { renderPersistencePosture(product); return; }
      if (action === 'review_recovery_posture') { renderRecoveryPosture(product); return; }
      if (action === 'resume_operation_continuation') { run(() => resumeFocusedOperationContinuation(product.operation || focusedOperation())); return; }
      if (action === 'start_or_select_session') { focusOperationSession(); return; }
      if (action === 'read_operation_evidence') { run(refreshOperation); return; }
      if (action === 'review_continuity_packet') { applyContinuityWorkflowNextStep(); return; }
      if (action === 'observe_continuity_packet') { applyContinuityWorkflowNextStep(); return; }
      if (action === 'publish_cloudflare_continuity_packet') { applyContinuityWorkflowNextStep(); return; }
      if (action === 'return_local_windows_continuity_packet') { applyContinuityWorkflowNextStep(); return; }
      if (action === 'monitor_operation_continuity') { renderLocalCloudContinuityBridge(product); return; }
      if (action === 'refresh_site_continuity_loop') { focusContinuityLoopRefresh(product); return; }
      if (action === 'review_continuity_loop_report') { focusContinuityLoopReport(product); return; }
      if (action === 'review_site_continuity_reconciliation_execution') { focusOperationReviewFromRoute(route, product); return; }
      if (action === 'review_carrier_evidence_replay') { focusRecoveryEvidence(product); return; }
      if (action === 'review_directive_delivery') { focusWebhookDelayDirectiveDelivery(); return; }
      if (action === 'review_local_ingress_provider_liveness') { focusLocalIngressProviderLiveness(); return; }
      if (action === 'review_repository_publication_provider_liveness') { focusRepositoryPublicationProviderLiveness(); return; }
      if (action === 'focus_open_task') { applyFlightDeckNextAction(); return; }
      if (action === 'start_resident_dispatch') { run(startResidentDispatchFromWorkbench); return; }
      run(refreshOperation);
    }
    function operationOperatorFocusSummary(focus = null) {
      if (!focus) return '';
      return [focus.focus_kind || focus.activity_kind || 'operator_focus', focus.focus_ref || focus.source_ref || focus.activity_id || 'none', focus.action || 'review'].filter(Boolean).join(' / ');
    }
    function operationOperatorFocusTarget(focus = null, product = state.operationProduct || {}) {
      if (!focus || focus.schema !== 'narada.cloudflare_operation_operator_focus.v1') return null;
      const focusRef = String(focus.focus_ref || focus.source_ref || focus.activity_id || '');
      const matches = (...values) => values.some((value) => value && String(value) === focusRef);
      if (focus.focus_kind === 'mailbox_draft_reply_proposal') {
        return (product.mailbox_draft_reply_proposals || []).find((item) => matches(item.proposal_id, item.activity_id, item.source_ref)) || null;
      }
      if (focus.focus_kind === 'mailbox_outlook_draft_create') {
        return (product.mailbox_outlook_draft_creates || []).find((item) => matches(item.draft_create_id, item.activity_id, item.source_ref)) || null;
      }
      if (focus.focus_kind === 'site_file_change_proposal') {
        return (product.site_file_change_proposals || []).find((item) => matches(item.proposal_id, item.activity_id, item.source_ref)) || null;
      }
      if (focus.focus_kind === 'local_ingress_request') {
        return (product.local_ingress_requests || []).find((item) => matches(item.local_ingress_request_id, item.activity_id, item.source_ref)) || null;
      }
      if (focus.focus_kind === 'repository_publication_request') {
        return (product.repository_publication_requests || []).find((item) => matches(item.repository_publication_request_id, item.activity_id, item.source_ref)) || null;
      }
      if (focus.focus_kind === 'mailbox_send_confirmation') {
        return (product.mailbox_send_confirmations || []).find((item) => matches(item.send_confirmation_id, item.activity_id, item.source_ref)) || null;
      }
      if (focus.focus_kind === 'mailbox_send_accepted') {
        return (product.mailbox_send_accepted_records || []).find((item) => matches(item.send_acceptance_id, item.send_accepted_id, item.activity_id, item.source_ref)) || null;
      }
      return null;
    }
    function applyOperationOperatorFocus(focus = null, product = state.operationProduct || {}) {
      const target = operationOperatorFocusTarget(focus, product);
      if (focus?.focus_kind === 'mailbox_draft_reply_proposal' && target) { selectMailboxDraftReplyProposal(target); return true; }
      if (focus?.focus_kind === 'mailbox_outlook_draft_create' && target) { selectMailboxOutlookDraftCreate(target); return true; }
      if (focus?.focus_kind === 'site_file_change_proposal' && target) { selectSiteFileChangeProposal(target); return true; }
      if (focus?.focus_kind === 'local_ingress_request' && target) { selectLocalIngressRequest(target); return true; }
      if (focus?.focus_kind === 'repository_publication_request' && target) { selectRepositoryPublicationRequest(target); return true; }
      if (focus?.focus_kind === 'mailbox_send_confirmation' && target) { selectMailboxSendConfirmation(target); return true; }
      if (focus?.focus_kind === 'mailbox_send_accepted' && target) { selectMailboxSendAccepted(target); return true; }
      return false;
    }
    function operatorRouteStages(product = state.operationProduct || {}) {
      const evidenceContext = evidenceActionSummaryContext(state.evidenceFocus);
      const evidenceStage = evidenceContext.length > 0
        ? operatorRouteStage('evidence', evidenceContext, ['payload_review'], 'Target Ref', focusFlightDeckEvidence)
        : { domain: 'evidence', command_state: 'evidence_focus_needed', command_action: 'focus_evidence', next_action: 'focus_evidence', target: el('sessionId').value.trim() || product.operation?.operation_id || product.site?.site_id || 'none', status: 'needs_attention', action: focusFlightDeckEvidence };
      return [
        sitePostureRouteStage(),
        operatorRouteStage('site', siteActionContext(), ['inspect_site_operations', 'site_operations_ready'], 'Site', () => {
          const action = String(contextValue(siteActionContext(), 'Next Action'));
          if (action === 'read_site_scope' || action === 'read_site_authority') run(refreshSiteProduct);
          else if (action === 'load_or_create_membership') focusSiteMembership();
          else focusSiteOperation();
        }),
        operatorRouteStage('membership', membershipActionContext(), ['monitor_membership_authority', 'membership_authority_monitoring'], 'Principal', () => {
          const action = String(contextValue(membershipActionContext(), 'Next Action'));
          if (action === 'read_membership_site') run(refreshSiteProduct);
          else if (action === 'put_membership') run(putFocusedMembership);
          else focusMembershipAuthority();
        }),
        operationPostureRouteStage(product),
        operationWorkflowRouteStage(product),
        operatorRouteStage('operation', operationActionContext(), ['inspect_operation_evidence', 'evidence_ready'], 'Operation', () => {
          const action = String(contextValue(operationActionContext(), 'Next Action'));
          if (action === 'read_operation_scope' || action === 'read_operation_evidence') run(refreshOperation);
          else if (action === 'use_focused_operation') useFocusedOperation();
          else focusOperationSession();
        }),
        operatorRouteStage('session', sessionActionContext(), ['inspect_session_evidence', 'evidence_ready'], 'Session', () => {
          const action = String(contextValue(sessionActionContext(), 'Next Action'));
          if (action === 'read_session_evidence') run(readSelectedSessionEvidence);
          else if (action === 'use_focused_session') useFocusedSession();
          else focusFocusedSessionEvidence();
        }),
        taskRouteStage(product),
        operatorRouteStage('authority', authorityActionContext(product), ['monitor_authority_admissions', 'admissions_monitoring'], 'Focused Decision', applyAuthorityNextAction),
        authorityTransferRouteStage(product),
        evidenceStage,
      ];
    }
    function applyOperatorRouteNextAction() {
      const stage = operatorRouteStages().find((item) => item.status !== 'ready') || operatorRouteStages()[0];
      if (stage?.action) stage.action();
    }
    function operatorRouteActionButton(stage) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = stage.status === 'ready' ? 'Focus' : 'Act';
      button.addEventListener('click', stage.action);
      return button;
    }
    function renderOperatorRoute(product = state.operationProduct || {}) {
      const stages = operatorRouteStages(product);
      if (stages.length === 0) {
        el('operatorRoute').innerHTML = '<div class="empty">No operator route loaded.</div>';
        return;
      }
      const firstAttention = stages.find((stage) => stage.status !== 'ready');
      el('operatorRoute').replaceChildren(...stages.map((stage) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (stage === firstAttention ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = stage.domain + ' | ' + stage.command_state;
        const meta = document.createElement('span');
        meta.textContent = [stage.status, stage.next_action, stage.target].filter(Boolean).join(' | ');
        node.append(title, meta, focusActionRow(operatorRouteActionButton(stage)));
        return node;
      }));
    }
    function operationFlightDeckContext(product = {}) {
      const surface = product.operation_product_surface || {};
      const evidenceStatus = evidenceReplayStatus(product) || {};
      const persistence = persistencePosture(product) || {};
      const recovery = recoveryPosture(product) || {};
      const statusHistory = operationStatusHistory(product);
      const activeSession = el('sessionId').value.trim();
      const openAttention = state.attentionItems.filter((item) => item.status !== 'resolved');
      const unresolvedAuthority = (product.site_authority?.decisions || []).filter((decision) => decision.action !== 'admit');
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      const directiveDeliveries = product.webhook_delay_directive_deliveries || [];
      const siteFileChangeProposals = product.site_file_change_proposals || [];
      const localIngressRequests = product.local_ingress_requests || [];
      const localIngressEvidence = product.local_ingress_evidence || [];
      const localIngressProviderHeartbeats = product.local_ingress_provider_heartbeats || [];
      const localIngressProviderLiveness = surface.local_ingress_provider_liveness || product.operation_lifecycle_status?.local_ingress_provider_liveness || {};
      const repositoryPublicationRequests = product.repository_publication_requests || [];
      const repositoryPublicationEvidence = product.repository_publication_evidence || [];
      const repositoryPublicationProviderHeartbeats = product.repository_publication_provider_heartbeats || [];
      const repositoryPublicationProviderLiveness = surface.repository_publication_provider_liveness || product.operation_lifecycle_status?.repository_publication_provider_liveness || {};
      const nextAction = openAttention[0]
        ? 'resolve attention ' + openAttention[0].directive_id
        : openTasks[0]
          ? 'advance task ' + openTasks[0].task_id
          : !activeSession
            ? 'select or start session'
            : unresolvedAuthority[0]
              ? 'inspect authority ' + (unresolvedAuthority[0].mutation_class || unresolvedAuthority[0].reason || 'decision')
              : 'monitor operation';
      return [
        ['Operation', product.operation?.operation_id || el('operationId').value.trim() || 'none'],
        ['Selected Session', activeSession || 'none'],
        ['Session Focus', state.sessionFocus?.carrier_session_id || 'none'],
        ['Open Attention', String(openAttention.length) + ' / ' + state.attentionItems.length],
        ['Open Tasks', String(openTasks.length) + ' / ' + (product.tasks || []).length],
        ['Directive Deliveries', String(directiveDeliveries.length)],
        ['Site File Change Proposals', String(siteFileChangeProposals.length)],
        ['Site File Change Next Action', siteFileChangeProposals.length > 0 ? 'review_site_file_change_proposal' : 'monitor_site_file_change_proposals'],
        ['Local Ingress Requests', String(surface.local_ingress_request_count ?? localIngressRequests.length)],
        ['Local Ingress Evidence', String(surface.local_ingress_evidence_count ?? localIngressEvidence.length)],
        ['Local Ingress Provider Heartbeats', String(surface.local_ingress_provider_heartbeat_count ?? localIngressProviderHeartbeats.length)],
        ['Local Ingress Provider Liveness', localIngressProviderLiveness.state || 'not_observed'],
        ['Local Ingress Next Action', ['missing', 'stale'].includes(String(localIngressProviderLiveness.state || '')) ? 'review_local_ingress_provider_liveness' : localIngressEvidence.length > 0 ? 'review_local_ingress_evidence' : localIngressRequests.length > 0 ? 'await_windows_local_ingress_evidence' : 'monitor_local_ingress'],
        ['Repository Publication Requests', String(surface.repository_publication_request_count ?? repositoryPublicationRequests.length)],
        ['Repository Publication Evidence', String(surface.repository_publication_evidence_count ?? repositoryPublicationEvidence.length)],
        ['Repository Publication Provider Heartbeats', String(surface.repository_publication_provider_heartbeat_count ?? repositoryPublicationProviderHeartbeats.length)],
        ['Repository Publication Provider Liveness', repositoryPublicationProviderLiveness.state || 'not_observed'],
        ['Repository Publication Next Action', ['missing', 'stale'].includes(String(repositoryPublicationProviderLiveness.state || '')) ? 'review_repository_publication_provider_liveness' : repositoryPublicationEvidence.length > 0 ? 'review_repository_publication_evidence' : repositoryPublicationRequests.length > 0 ? 'await_windows_repository_publication_evidence' : 'monitor_repository_publication'],
        ['Evidence Loaded', String(surface.carrier_evidence_count ?? (product.carrier_evidence || []).length) + ' groups / ' + state.events.length + ' events'],
        ['Evidence Replay State', evidenceStatus.state || 'unknown'],
        ['Evidence Replay Source', evidenceReplaySources(product)],
        ['Evidence Replay Sessions', evidenceReplaySessionSummary(evidenceStatus)],
        ['Persistence State', persistence.state || 'unknown'],
        ['Persistence Next Action', persistence.next_action || 'monitor_persistence_posture'],
        ['Recovery State', recovery.state || 'unknown'],
        ['Recovery Next Action', recovery.next_action || 'monitor_recovery_posture'],
        ['Status Transitions', operationStatusTransitionSummary(statusHistory)],
        ['Latest Status Transition', operationLatestStatusTransitionLabel(statusHistory)],
        ['Activity Items', operationActivityTimelineSummary(product)],
        ['Latest Activity', operationLatestActivityLabel(product)],
        ['Authority Posture', unresolvedAuthority.length === 0 ? 'no unresolved decisions' : String(unresolvedAuthority.length) + ' unresolved'],
        ['Next Action', nextAction],
      ];
    }
    function operationFlightDeckTargets(product = state.operationProduct || {}) {
      const activeSession = el('sessionId').value.trim();
      const sessions = product.sessions || [];
      const openAttention = state.attentionItems.filter((item) => item.status !== 'resolved');
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      const unresolvedAuthority = (product.site_authority?.decisions || []).filter((decision) => decision.action !== 'admit');
      const directiveIntent = state.webhookDelayDirectiveFocus || (product.webhook_delay_directive_records || [])[0] || null;
      const directiveDelivery = state.webhookDelayDirectiveDeliveryFocus || (product.webhook_delay_directive_deliveries || [])[0] || null;
      const mailboxDraftReplyProposal = state.mailboxDraftReplyProposalFocus || (product.mailbox_draft_reply_proposals || [])[0] || null;
      const mailboxOutlookDraftCreate = state.mailboxOutlookDraftCreateFocus || (product.mailbox_outlook_draft_creates || [])[0] || null;
      const mailboxSendConfirmation = state.mailboxSendConfirmationFocus || (product.mailbox_send_confirmations || [])[0] || null;
      const mailboxSendAccepted = state.mailboxSendAcceptedFocus || (product.mailbox_send_accepted_records || [])[0] || null;
      const siteFileChangeProposal = state.siteFileChangeProposalFocus || (product.site_file_change_proposals || [])[0] || null;
      const localIngressRequest = state.localIngressRequestFocus || (product.local_ingress_requests || [])[0] || null;
      const localIngressEvidence = state.localIngressEvidenceFocus || (product.local_ingress_evidence || [])[0] || null;
      const localIngressProviderHeartbeat = state.localIngressProviderHeartbeatFocus || (product.local_ingress_provider_heartbeats || [])[0] || null;
      const repositoryPublicationRequest = state.repositoryPublicationRequestFocus || (product.repository_publication_requests || [])[0] || null;
      const repositoryPublicationEvidence = state.repositoryPublicationEvidenceFocus || (product.repository_publication_evidence || [])[0] || null;
      const repositoryPublicationProviderHeartbeat = state.repositoryPublicationProviderHeartbeatFocus || (product.repository_publication_provider_heartbeats || [])[0] || null;
      return {
        session: sessions.find((session) => session.carrier_session_id === activeSession) || state.sessionFocus || sessions[0] || null,
        attention: openAttention[0] || state.attentionFocus || state.attentionItems[0] || null,
        task: openTasks[0] || state.taskFocus || (product.tasks || [])[0] || null,
        authority: unresolvedAuthority[0] || state.authorityFocus || (product.site_authority?.decisions || [])[0] || null,
        directiveIntent,
        directiveDelivery,
        mailboxDraftReplyProposal,
        mailboxOutlookDraftCreate,
        mailboxSendConfirmation,
        mailboxSendAccepted,
        siteFileChangeProposal,
        localIngressRequest,
        localIngressEvidence,
        localIngressProviderHeartbeat,
        repositoryPublicationRequest,
        repositoryPublicationEvidence,
        repositoryPublicationProviderHeartbeat,
      };
    }
    function setEvidenceLane(key) {
      state.evidenceLane = key;
      const first = visibleEvents()[0] || null;
      if (first) focusEvidence(first);
      else { state.evidenceFocus = null; renderEvidenceFocus(); }
      renderEvidenceLanes();
      renderEvidenceReviewQueue();
      renderEvents();
      updateControlRoom();
    }
    function focusFlightDeckEvidence() {
      setEvidenceLane('');
      const activeSession = el('sessionId').value.trim();
      focusEvidenceFor((event) => activeSession && event.carrier_session_id === activeSession);
    }
    function focusFlightDeckEvidenceChain() {
      const targets = operationFlightDeckTargets();
      if (targets.directiveDelivery) { selectWebhookDelayDirectiveDelivery(targets.directiveDelivery); return; }
      if (targets.directiveIntent) { selectWebhookDelayDirective(targets.directiveIntent); return; }
      focusWebhookDelayChainObservation();
    }
    function focusLocalIngressProviderLiveness() {
      const targets = operationFlightDeckTargets();
      if (targets.localIngressProviderHeartbeat) selectLocalIngressProviderHeartbeat(targets.localIngressProviderHeartbeat);
      else renderLocalIngressProviderHeartbeatFocusDetail(null);
    }
    function focusRepositoryPublicationProviderLiveness() {
      const targets = operationFlightDeckTargets();
      if (targets.repositoryPublicationProviderHeartbeat) selectRepositoryPublicationProviderHeartbeat(targets.repositoryPublicationProviderHeartbeat);
      else renderRepositoryPublicationProviderHeartbeatFocusDetail(null);
    }
    function applyFlightDeckWorkflowRouteAction(product = state.operationProduct || {}) {
      const route = operationWorkflowRouteStage(product);
      const action = String(route.next_action || route.command_action || '');
      const delegatedActions = new Set([
        'review_persistence_posture',
        'review_recovery_posture',
        'review_continuity_packet',
        'observe_continuity_packet',
        'publish_cloudflare_continuity_packet',
        'return_local_windows_continuity_packet',
        'monitor_operation_continuity',
        'refresh_site_continuity_loop',
        'review_continuity_loop_report',
        'review_site_continuity_reconciliation_execution',
        'review_carrier_evidence_replay',
        'review_directive_delivery',
        'review_local_ingress_provider_liveness',
        'review_repository_publication_provider_liveness',
        'start_resident_dispatch',
      ]);
      if (route.operator_focus || delegatedActions.has(action)) {
        applyOperationWorkflowRouteAction(route, product);
        return true;
      }
      return false;
    }
    function applyFlightDeckNextAction() {
      if (applyFlightDeckWorkflowRouteAction()) return;
      const targets = operationFlightDeckTargets();
      if (targets.attention && targets.attention.status !== 'resolved') { selectAttentionItem(targets.attention); return; }
      if (targets.task && !['done', 'closed', 'resolved'].includes(String(targets.task.status || '').toLowerCase())) { selectTask(targets.task); return; }
      if (targets.session && !el('sessionId').value.trim()) { selectOperationSession(targets.session); return; }
      if (targets.authority && targets.authority.action !== 'admit') { selectAuthorityDecision(targets.authority); return; }
      if (targets.directiveDelivery) { selectWebhookDelayDirectiveDelivery(targets.directiveDelivery); return; }
      if (targets.directiveIntent) { selectWebhookDelayDirective(targets.directiveIntent); return; }
      if (targets.mailboxSendConfirmation) { selectMailboxSendConfirmation(targets.mailboxSendConfirmation); return; }
      if (targets.mailboxSendAccepted) { selectMailboxSendAccepted(targets.mailboxSendAccepted); return; }
      if (targets.mailboxDraftReplyProposal) { selectMailboxDraftReplyProposal(targets.mailboxDraftReplyProposal); return; }
      if (targets.mailboxOutlookDraftCreate) { selectMailboxOutlookDraftCreate(targets.mailboxOutlookDraftCreate); return; }
      if (targets.siteFileChangeProposal) { selectSiteFileChangeProposal(targets.siteFileChangeProposal); return; }
      if (targets.localIngressProviderHeartbeat) { selectLocalIngressProviderHeartbeat(targets.localIngressProviderHeartbeat); return; }
      if (targets.localIngressEvidence) { selectLocalIngressEvidence(targets.localIngressEvidence); return; }
      if (targets.localIngressRequest) { selectLocalIngressRequest(targets.localIngressRequest); return; }
      if (targets.repositoryPublicationProviderHeartbeat) { selectRepositoryPublicationProviderHeartbeat(targets.repositoryPublicationProviderHeartbeat); return; }
      if (targets.repositoryPublicationEvidence) { selectRepositoryPublicationEvidence(targets.repositoryPublicationEvidence); return; }
      if (targets.repositoryPublicationRequest) { selectRepositoryPublicationRequest(targets.repositoryPublicationRequest); return; }
      focusFlightDeckEvidence();
    }
    function operationFlightDeckButton(id, label, action) {
      const button = document.createElement('button');
      button.id = id;
      button.className = 'secondary';
      button.textContent = label;
      button.addEventListener('click', action);
      return button;
    }
    function renderOperationFlightDeck(product = state.operationProduct || {}) {
      if (!product.operation && !el('operationId').value.trim()) {
        el('operationFlightDeck').innerHTML = '<div class="empty">No operation product loaded.</div>';
        return;
      }
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.style.gridColumn = '1 / -1';
      const targets = operationFlightDeckTargets(product);
      actions.append(
        operationFlightDeckButton('flightDeckNextAction', 'Focus Next Action', applyFlightDeckNextAction),
        operationFlightDeckButton('flightDeckFocusSession', 'Focus Session', () => { if (targets.session) selectOperationSession(targets.session); }),
        operationFlightDeckButton('flightDeckFocusAttention', 'Focus Attention', () => { if (targets.attention) selectAttentionItem(targets.attention); }),
        operationFlightDeckButton('flightDeckFocusTask', 'Focus Task', () => { if (targets.task) selectTask(targets.task); }),
        operationFlightDeckButton('flightDeckFocusAuthority', 'Focus Authority', () => { if (targets.authority) selectAuthorityDecision(targets.authority); }),
        operationFlightDeckButton('flightDeckFocusDirectiveIntent', 'Focus Directive Intent', () => { if (targets.directiveIntent) selectWebhookDelayDirective(targets.directiveIntent); }),
        operationFlightDeckButton('flightDeckFocusDirectiveDelivery', 'Focus Directive Delivery', () => { if (targets.directiveDelivery) selectWebhookDelayDirectiveDelivery(targets.directiveDelivery); }),
        operationFlightDeckButton('flightDeckFocusMailboxSendConfirmation', 'Focus Send Confirmation', () => { if (targets.mailboxSendConfirmation) selectMailboxSendConfirmation(targets.mailboxSendConfirmation); }),
        operationFlightDeckButton('flightDeckFocusMailboxSendAccepted', 'Focus Send Accepted', () => { if (targets.mailboxSendAccepted) selectMailboxSendAccepted(targets.mailboxSendAccepted); }),
        operationFlightDeckButton('flightDeckFocusMailboxDraftReplyProposal', 'Focus Mailbox Proposal', () => { if (targets.mailboxDraftReplyProposal) selectMailboxDraftReplyProposal(targets.mailboxDraftReplyProposal); }),
        operationFlightDeckButton('flightDeckFocusMailboxOutlookDraftCreate', 'Focus Outlook Draft Create', () => { if (targets.mailboxOutlookDraftCreate) selectMailboxOutlookDraftCreate(targets.mailboxOutlookDraftCreate); }),
        operationFlightDeckButton('flightDeckFocusSiteFileChangeProposal', 'Focus File Change Proposal', () => { if (targets.siteFileChangeProposal) selectSiteFileChangeProposal(targets.siteFileChangeProposal); }),
        operationFlightDeckButton('flightDeckFocusLocalIngressRequest', 'Focus Local Ingress', () => { if (targets.localIngressProviderHeartbeat) selectLocalIngressProviderHeartbeat(targets.localIngressProviderHeartbeat); else if (targets.localIngressEvidence) selectLocalIngressEvidence(targets.localIngressEvidence); else if (targets.localIngressRequest) selectLocalIngressRequest(targets.localIngressRequest); }),
        operationFlightDeckButton('flightDeckFocusRepositoryPublication', 'Focus Repository Publication', () => { if (targets.repositoryPublicationProviderHeartbeat) selectRepositoryPublicationProviderHeartbeat(targets.repositoryPublicationProviderHeartbeat); else if (targets.repositoryPublicationEvidence) selectRepositoryPublicationEvidence(targets.repositoryPublicationEvidence); else if (targets.repositoryPublicationRequest) selectRepositoryPublicationRequest(targets.repositoryPublicationRequest); }),
        operationFlightDeckButton('flightDeckFocusPersistencePosture', 'Focus Persistence', () => renderPersistencePosture(product)),
        operationFlightDeckButton('flightDeckFocusRecoveryPosture', 'Focus Recovery', () => renderRecoveryPosture(product)),
        operationFlightDeckButton('flightDeckFocusEvidenceChain', 'Focus Evidence Chain', focusFlightDeckEvidenceChain),
        operationFlightDeckButton('flightDeckFocusEvidence', 'Focus Evidence', focusFlightDeckEvidence),
      );
      el('operationFlightDeck').replaceChildren(...operationFlightDeckContext(product).map(([label, value]) => evidenceField(label, value)), actions);
    }
    function persistencePosture(product = state.operationProduct || {}) {
      return product.cloudflare_persistence_posture
        || product.operation_product_surface?.persistence_posture
        || null;
    }
    function recoveryPosture(product = state.operationProduct || {}) {
      return product.cloudflare_recovery_posture
        || product.operation_product_surface?.recovery_posture
        || null;
    }
    function recoveryPostureItemLabel(item) {
      if (!item || typeof item !== 'object') return String(item || 'unknown');
      const key = item.key || item.boundary || item.reason || item.action || item.status || 'unknown';
      const detail = item.status || item.state || item.next_action || item.authority || '';
      return detail && detail !== key ? String(key) + ':' + String(detail) : String(key);
    }
    function recoveryPostureItemSummary(items = []) {
      return (Array.isArray(items) ? items : []).map(recoveryPostureItemLabel).join(', ') || 'none';
    }
    function authorityTransferPosture(product = state.operationProduct || {}) {
      return product.authority_transfer_posture
        || product.operation_product_surface?.authority_transfer_posture
        || null;
    }
    function persistencePostureContext(product = state.operationProduct || {}) {
      const posture = persistencePosture(product) || {};
      const boundaries = posture.durable_boundaries || [];
      const active = boundaries.filter((boundary) => boundary.status === 'available').map((boundary) => boundary.key).join(', ') || 'none';
      const missing = (posture.missing_boundaries || []).join(', ') || 'none';
      const warnings = (posture.warnings || []).join(', ') || 'none';
      return [
        ['State', posture.state || 'unknown'],
        ['Site', posture.site_id || product.site?.site_id || product.operation?.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', posture.operation_id || product.operation?.operation_id || el('operationId').value.trim() || 'none'],
        ['Active Boundaries', String(posture.active_boundary_count ?? boundaries.filter((boundary) => boundary.status === 'available').length)],
        ['Durable Boundaries', String(posture.durable_boundary_count ?? boundaries.length)],
        ['Available', active],
        ['Missing', missing],
        ['Warnings', warnings],
        ['Sessions', String(posture.session_count ?? (product.sessions || []).length)],
        ['Tasks', String(posture.task_count ?? (product.tasks || []).length)],
        ['Evidence Groups', String(posture.carrier_evidence_group_count ?? (product.carrier_evidence || []).length)],
        ['Evidence Events', String(posture.carrier_evidence_event_count ?? state.events.length)],
        ['Continuity Packets', String(posture.continuity_packet_count ?? (product.site_continuity_packets || []).length)],
        ['Evidence Read State', posture.evidence_read_state || evidenceReplayStatus(product)?.state || 'unknown'],
        ['Next Action', posture.next_action || 'monitor_persistence_posture'],
      ];
    }
    function renderPersistencePosture(product = state.operationProduct || {}) {
      if (!persistencePosture(product)) {
        el('persistencePostureDetail').innerHTML = '<div class="empty">No persistence posture loaded.</div>';
        el('persistenceWorkflow').innerHTML = '<div class="empty">No persistence workflow loaded.</div>';
        return;
      }
      el('persistencePostureDetail').replaceChildren(...persistencePostureContext(product).map(([label, value]) => evidenceField(label, value)));
      renderPersistenceWorkflow(product);
    }
    function persistenceWorkflowItems(product = state.operationProduct || {}) {
      const posture = persistencePosture(product) || {};
      const boundaries = posture.durable_boundaries || [];
      const missingBoundaries = posture.missing_boundaries || [];
      const activeBoundaryCount = Number(posture.active_boundary_count ?? boundaries.filter((boundary) => boundary.status === 'available').length);
      const durableBoundaryCount = Number(posture.durable_boundary_count ?? boundaries.length);
      const evidenceEvents = Number(posture.carrier_evidence_event_count ?? state.events.length);
      const continuityPacketCount = Number(posture.continuity_packet_count ?? (product.site_continuity_packets || []).length);
      const hasProductScope = state.productScope !== 'none' && (product.operation || product.site);
      const durableReady = String(posture.state || '') === 'durable' && missingBoundaries.length === 0;
      const evidenceReadState = String(posture.evidence_read_state || evidenceReplayStatus(product)?.state || 'unknown');
      const evidenceReady = evidenceReadState === 'loaded' || evidenceEvents > 0;
      return [
        {
          key: 'persistence_scope_loaded',
          label: 'Product Scope',
          status: hasProductScope ? 'complete' : 'needs_attention',
          detail: hasProductScope ? productScopeSummary(product) : 'read operation or site scope before persistence review',
          action_label: product.operation || el('operationId').value.trim() ? 'Read Operation Scope' : 'Read Site Scope',
          action: () => run(product.operation || el('operationId').value.trim() ? refreshOperation : refreshSiteProduct),
        },
        {
          key: 'durable_boundaries_available',
          label: 'Durable Boundaries',
          status: durableReady ? 'complete' : 'needs_attention',
          detail: String(activeBoundaryCount) + ' available / ' + String(durableBoundaryCount) + ' durable',
          action_label: missingBoundaries.length > 0 ? 'Review Missing Boundaries' : 'Refresh Persistence State',
          action: () => applyPersistenceMissingBoundaryAction(product),
        },
        {
          key: 'missing_boundaries_reviewed',
          label: 'Missing Boundaries',
          status: missingBoundaries.length === 0 ? 'complete' : 'needs_attention',
          detail: missingBoundaries.join(', ') || 'none',
          action_label: missingBoundaries.length === 0 ? 'Review Recovery Boundaries' : 'Focus Missing Boundary',
          action: () => { if (missingBoundaries.length === 0) renderRecoveryPosture(product); else applyPersistenceMissingBoundaryAction(product); },
        },
        {
          key: 'persistence_evidence_readable',
          label: 'Evidence Readability',
          status: evidenceReady ? 'complete' : 'needs_attention',
          detail: [evidenceReadState, String(evidenceEvents) + ' events'].join(' / '),
          action_label: evidenceEvents > 0 ? 'Focus Evidence' : 'Read Session Evidence',
          action: () => { if (evidenceEvents > 0) focusRecoveryEvidence(product); else run(readSelectedSessionEvidence); },
        },
        {
          key: 'continuity_packets_recorded',
          label: 'Continuity Packets',
          status: continuityPacketCount > 0 ? 'complete' : 'needs_attention',
          detail: String(continuityPacketCount) + ' packet(s)',
          action_label: continuityPacketCount > 0 ? 'Focus Continuity' : 'Read Site Continuity',
          action: () => { if (continuityPacketCount > 0) applyContinuityWorkflowNextStep(); else run(refreshSiteProduct); },
        },
      ];
    }
    function applyPersistenceMissingBoundaryAction(product = state.operationProduct || {}) {
      const missing = (persistencePosture(product)?.missing_boundaries || [])[0] || '';
      if (missing.includes('continuity')) { applyContinuityWorkflowNextStep(); return; }
      if (missing.includes('evidence') || missing.includes('session')) { focusRecoveryEvidence(product); return; }
      run(product.operation || el('operationId').value.trim() ? refreshOperation : refreshSiteProduct);
    }
    function applyPersistenceNextAction() {
      const item = persistenceWorkflowItems().find((entry) => entry.status !== 'complete') || persistenceWorkflowItems().at(-1);
      if (item?.action) item.action();
    }
    function persistenceWorkflowActionButton(item) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = item.action_label || 'Focus';
      button.addEventListener('click', item.action);
      return button;
    }
    function renderPersistenceWorkflow(product = state.operationProduct || {}) {
      const items = persistenceWorkflowItems(product);
      el('persistenceWorkflow').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (item.status !== 'complete' ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.label;
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.detail].filter(Boolean).join(' | ');
        node.append(title, meta, focusActionRow(persistenceWorkflowActionButton(item)));
        return node;
      }));
    }
    function recoveryPostureContext(product = state.operationProduct || {}) {
      const posture = recoveryPosture(product) || {};
      const boundaries = posture.recovery_boundaries || [];
      return [
        ['State', posture.state || 'unknown'],
        ['Site', posture.site_id || product.site?.site_id || product.operation?.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', posture.operation_id || product.operation?.operation_id || el('operationId').value.trim() || 'none'],
        ['Snapshot Reload', posture.snapshot_reload || 'unknown'],
        ['Evidence Replay', posture.evidence_replay || evidenceReplayStatus(product)?.state || 'unknown'],
        ['Evidence Sources', (posture.evidence_sources || []).join(', ') || 'none'],
        ['Recoverable Boundaries', String(posture.recoverable_boundary_count ?? boundaries.filter((boundary) => boundary.status === 'recoverable').length)],
        ['Recovery Boundaries', recoveryPostureItemSummary(boundaries)],
        ['Recovery Gaps', recoveryPostureItemSummary(posture.recovery_gaps || [])],
        ['Missing Sessions', (posture.missing_evidence_session_ids || []).join(', ') || 'none'],
        ['Sessions', String(posture.session_count ?? (product.sessions || []).length)],
        ['Evidence Sessions', String(posture.evidence_session_count ?? (product.carrier_evidence || []).length)],
        ['Evidence Events', String(posture.evidence_event_count ?? state.events.length)],
        ['Next Action', posture.next_action || 'monitor_recovery_posture'],
      ];
    }
    function renderRecoveryPosture(product = state.operationProduct || {}) {
      if (!recoveryPosture(product)) {
        el('recoveryPostureDetail').innerHTML = '<div class="empty">No recovery posture loaded.</div>';
        el('recoveryWorkflow').innerHTML = '<div class="empty">No recovery workflow loaded.</div>';
        return;
      }
      el('recoveryPostureDetail').replaceChildren(...recoveryPostureContext(product).map(([label, value]) => evidenceField(label, value)));
      renderRecoveryWorkflow(product);
    }
    function recoveryWorkflowItems(product = state.operationProduct || {}) {
      const posture = recoveryPosture(product) || {};
      const gaps = posture.recovery_gaps || [];
      const boundaries = posture.recovery_boundaries || [];
      const unavailableBoundaries = boundaries.filter((boundary) => boundary.status !== 'recoverable');
      const missingSessionIds = posture.missing_evidence_session_ids || [];
      const hasProductScope = state.productScope !== 'none' && (product.operation || product.site);
      const hasEvidence = Number(posture.evidence_event_count ?? 0) > 0 || state.events.length > 0;
      const snapshotReady = posture.snapshot_reload === 'available';
      const evidenceReplayReady = ['loaded', 'no_sessions'].includes(String(posture.evidence_replay || '')) && missingSessionIds.length === 0;
      const reconstructable = ['reconstructable', 'ready_no_sessions'].includes(String(posture.state || ''));
      const missingSession = missingSessionIds[0] || '';
      return [
        {
          key: 'recovery_scope_loaded',
          label: 'Product Scope',
          status: hasProductScope ? 'complete' : 'needs_attention',
          detail: hasProductScope ? productScopeSummary(product) : 'read operation or site scope before recovery review',
          action_label: product.operation || el('operationId').value.trim() ? 'Read Operation Scope' : 'Read Site Scope',
          action: () => run(product.operation || el('operationId').value.trim() ? refreshOperation : refreshSiteProduct),
        },
        {
          key: 'snapshot_reload_available',
          label: 'Snapshot Reload',
          status: snapshotReady ? 'complete' : 'needs_attention',
          detail: posture.snapshot_reload || 'unknown',
          action_label: 'Read Runtime Scope',
          action: () => run(product.operation || el('operationId').value.trim() ? refreshOperation : refreshSiteProduct),
        },
        {
          key: 'recovery_boundaries_recoverable',
          label: 'Recovery Boundaries',
          status: unavailableBoundaries.length === 0 ? 'complete' : 'needs_attention',
          detail: unavailableBoundaries.length === 0
            ? String(posture.recoverable_boundary_count ?? boundaries.filter((boundary) => boundary.status === 'recoverable').length) + ' recoverable boundaries'
            : recoveryPostureItemSummary(unavailableBoundaries),
          action_label: unavailableBoundaries.length === 0 ? 'Review Recovery Boundaries' : 'Review Persistence Boundaries',
          action: () => { if (unavailableBoundaries.length > 0) renderPersistencePosture(product); else renderRecoveryPosture(product); },
        },
        {
          key: 'evidence_replay_loaded',
          label: 'Evidence Replay',
          status: evidenceReplayReady || hasEvidence ? 'complete' : 'needs_attention',
          detail: [posture.evidence_replay || 'unknown', String(posture.evidence_event_count ?? state.events.length) + ' events'].join(' / '),
          action_label: 'Read Session Evidence',
          action: () => run(readSelectedSessionEvidence),
        },
        {
          key: 'missing_session_evidence_reviewed',
          label: 'Missing Session Evidence',
          status: missingSessionIds.length === 0 ? 'complete' : 'needs_attention',
          detail: missingSessionIds.length === 0 ? 'all listed sessions have replayed evidence' : missingSessionIds.join(', '),
          action_label: missingSession ? 'Read Missing Session' : 'Review Sessions',
          action: () => run(async () => {
            if (missingSession) setCurrentSession(missingSession);
            await readSelectedSessionEvidence();
          }),
        },
        {
          key: 'reconstructability_confirmed',
          label: 'Reconstructability',
          status: reconstructable ? 'complete' : 'needs_attention',
          detail: gaps.length === 0 ? (posture.state || 'unknown') : recoveryPostureItemSummary(gaps),
          action_label: hasEvidence ? 'Focus Replayed Evidence' : 'Refresh Recovery State',
          action: () => { if (hasEvidence) focusRecoveryEvidence(product); else run(refreshOperation); },
        },
      ];
    }
    function focusRecoveryEvidence(product = state.operationProduct || {}) {
      const activeSession = el('sessionId').value.trim();
      const groups = product.carrier_evidence || [];
      const group = groups.find((entry) => activeSession && entry.carrier_session_id === activeSession)
        || groups.find((entry) => (entry.events || []).length > 0)
        || null;
      if (group?.carrier_session_id && !activeSession) setCurrentSession(group.carrier_session_id);
      if (group?.events?.length > 0) {
        appendEvents(group.events);
        focusEvidence(group.events[0]);
        return;
      }
      run(readSelectedSessionEvidence);
    }
    function applyRecoveryNextAction() {
      const item = recoveryWorkflowItems().find((entry) => entry.status !== 'complete') || recoveryWorkflowItems().at(-1);
      if (item?.action) item.action();
    }
    function recoveryWorkflowActionButton(item) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = item.action_label || 'Focus';
      button.addEventListener('click', item.action);
      return button;
    }
    function renderRecoveryWorkflow(product = state.operationProduct || {}) {
      const items = recoveryWorkflowItems(product);
      el('recoveryWorkflow').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (item.status !== 'complete' ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.label;
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.detail].filter(Boolean).join(' | ');
        node.append(title, meta, focusActionRow(recoveryWorkflowActionButton(item)));
        return node;
      }));
    }
    function authorityTransferContext(product = state.operationProduct || {}) {
      const posture = authorityTransferPosture(product) || {};
      const firstAuthority = (posture.remaining_windows_authorities || [])[0] || null;
      return [
        ['State', posture.transfer_complete ? 'complete' : posture.schema ? 'in_transfer' : 'unknown'],
        ['Domains', String(posture.domain_count ?? 0)],
        ['Cloudflare Owned', String(posture.cloudflare_owned_count ?? 0)],
        ['Cloudflare Governed Windows Executed', String(posture.cloudflare_governed_windows_executed_count ?? 0)],
        ['Cloudflare Recorded Windows Owned', String(posture.cloudflare_recorded_windows_owned_count ?? 0)],
        ['Windows Retained', String(posture.windows_retained_count ?? 0)],
        ['Remaining Domains', (posture.remaining_windows_domains || []).join(', ') || 'none'],
        ['Remaining Authorities', String(posture.remaining_windows_authority_count ?? (posture.remaining_windows_authorities || []).length)],
        ['Next Domain', firstAuthority?.domain || 'none'],
        ['Next Authority', firstAuthority?.authority || 'none'],
        ['Next Action', posture.next_action || 'read_operation_scope'],
      ];
    }
    function renderAuthorityTransfer(product = state.operationProduct || {}) {
      if (!authorityTransferPosture(product)) {
        el('authorityTransferDetail').innerHTML = '<div class="empty">No authority transfer posture loaded.</div>';
        el('authorityTransferWorkflow').innerHTML = '<div class="empty">No authority transfer workflow loaded.</div>';
        return;
      }
      el('authorityTransferDetail').replaceChildren(...authorityTransferContext(product).map(([label, value]) => evidenceField(label, value)));
      renderAuthorityTransferWorkflow(product);
    }
    function focusAuthorityTransferNextAction(product = state.operationProduct || {}) {
      const posture = authorityTransferPosture(product) || {};
      const action = String(posture.next_action || 'read_operation_scope');
      const targets = operationFlightDeckTargets(product);
      if (action === 'read_operation_scope') { run(refreshOperation); return; }
      if (action === 'verify_full_cloudflare_authority') { focusFlightDeckEvidence(); return; }
      if (action.includes('local_ingress')) {
        if (targets.localIngressProviderHeartbeat) selectLocalIngressProviderHeartbeat(targets.localIngressProviderHeartbeat);
        else if (targets.localIngressEvidence) selectLocalIngressEvidence(targets.localIngressEvidence);
        else if (targets.localIngressRequest) selectLocalIngressRequest(targets.localIngressRequest);
        else focusLocalIngressProviderLiveness();
        return;
      }
      if (action.includes('repository_publication') || action.includes('git_push')) {
        if (targets.repositoryPublicationProviderHeartbeat) selectRepositoryPublicationProviderHeartbeat(targets.repositoryPublicationProviderHeartbeat);
        else if (targets.repositoryPublicationEvidence) selectRepositoryPublicationEvidence(targets.repositoryPublicationEvidence);
        else if (targets.repositoryPublicationRequest) selectRepositoryPublicationRequest(targets.repositoryPublicationRequest);
        else focusRepositoryPublicationProviderLiveness();
        return;
      }
      if (action.includes('mailbox')) {
        if (targets.mailboxDraftReplyProposal) selectMailboxDraftReplyProposal(targets.mailboxDraftReplyProposal);
        else if (targets.mailboxOutlookDraftCreate) selectMailboxOutlookDraftCreate(targets.mailboxOutlookDraftCreate);
        else focusFlightDeckEvidence();
        return;
      }
      if (action.includes('site_file') || action.includes('filesystem')) {
        if (targets.siteFileChangeProposal) selectSiteFileChangeProposal(targets.siteFileChangeProposal);
        else focusFlightDeckEvidence();
        return;
      }
      if (action.includes('task_lifecycle') || action.includes('external_effects')) { applyFlightDeckNextAction(); return; }
      applyAuthorityNextAction();
    }
    function authorityTransferWorkflowItems(product = state.operationProduct || {}) {
      const posture = authorityTransferPosture(product) || {};
      const domains = posture.domains || [];
      const firstAuthority = (posture.remaining_windows_authorities || [])[0] || null;
      const hasProductScope = state.productScope !== 'none' && (product.operation || product.site);
      return [
        {
          key: 'authority_transfer_scope_loaded',
          label: 'Product Scope',
          status: hasProductScope ? 'complete' : 'needs_attention',
          detail: hasProductScope ? productScopeSummary(product) : 'read operation or site scope before authority transfer review',
          action_label: product.operation || el('operationId').value.trim() ? 'Read Operation Scope' : 'Read Site Scope',
          action: () => run(product.operation || el('operationId').value.trim() ? refreshOperation : refreshSiteProduct),
        },
        {
          key: 'authority_domains_classified',
          label: 'Authority Domains',
          status: domains.length > 0 ? 'complete' : 'needs_attention',
          detail: domains.length > 0 ? String(domains.length) + ' domains classified' : 'authority transfer posture not loaded',
          action_label: 'Refresh Authority Transfer',
          action: () => run(refreshOperation),
        },
        {
          key: 'remaining_windows_authority_focused',
          label: 'Remaining Windows Authority',
          status: posture.transfer_complete ? 'complete' : 'needs_attention',
          detail: firstAuthority ? [firstAuthority.domain, firstAuthority.authority].join(' / ') : 'none',
          action_label: posture.transfer_complete ? 'Focus Authority Evidence' : 'Focus Transfer Domain',
          action: () => focusAuthorityTransferNextAction(product),
        },
        {
          key: 'cloudflare_authority_verified',
          label: 'Cloudflare Authority Verification',
          status: posture.transfer_complete ? 'complete' : 'needs_attention',
          detail: posture.transfer_complete ? 'all domains transferred' : String(posture.remaining_windows_authority_count ?? (posture.remaining_windows_authorities || []).length) + ' authorities remain',
          action_label: posture.transfer_complete ? 'Focus Evidence' : 'Continue Transfer',
          action: () => focusAuthorityTransferNextAction(product),
        },
      ];
    }
    function applyAuthorityTransferNextAction() {
      const item = authorityTransferWorkflowItems().find((entry) => entry.status !== 'complete') || authorityTransferWorkflowItems().at(-1);
      if (item?.action) item.action();
    }
    function authorityTransferWorkflowActionButton(item) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = item.action_label || 'Focus';
      button.addEventListener('click', item.action);
      return button;
    }
    function renderAuthorityTransferWorkflow(product = state.operationProduct || {}) {
      const items = authorityTransferWorkflowItems(product);
      el('authorityTransferWorkflow').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (item.status !== 'complete' ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.label;
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.detail].filter(Boolean).join(' | ');
        node.append(title, meta, focusActionRow(authorityTransferWorkflowActionButton(item)));
        return node;
      }));
    }
    function continuityWorkflowSteps(product = state.operationProduct || {}) {
      const activeSession = el('sessionId').value.trim();
      const targets = operationFlightDeckTargets(product);
      const siteId = product.site?.site_id || product.operation?.site_id || el('siteId').value.trim();
      const sessionEvidenceLoaded = activeSession && (state.events.some((event) => event.carrier_session_id === activeSession)
        || (product.carrier_evidence || []).some((entry) => entry.carrier_session_id === activeSession && (entry.events || []).length > 0));
      const openAttention = state.attentionItems.filter((item) => item.status !== 'resolved');
      const openTasks = (product.tasks || []).filter((task) => !['done', 'closed', 'resolved'].includes(String(task.status || '').toLowerCase()));
      const authorityLoaded = (product.site_authority?.decisions || []).length > 0 || (product.authority_events || []).length > 0;
      const localWindowsEmbodiment = (product.site_continuity?.binding?.embodiments || []).find((embodiment) => embodiment.embodiment_kind === 'local_windows') || {};
      const cloudflareEmbodiment = (product.site_continuity?.binding?.embodiments || []).find((embodiment) => embodiment.embodiment_kind === 'cloudflare_carrier') || {};
      const continuityPacketCount = Number(product.site_continuity_status?.packet_count ?? (product.site_continuity_packets || []).length ?? 0);
      const continuityLoopReportCount = Number(product.site_continuity_loop_status?.report_count ?? product.operation_product_surface?.continuity_loop_report_count ?? (product.site_continuity_loop_reports || []).length ?? 0);
      const continuityLoopReport = (product.site_continuity_loop_reports || [])[0] || null;
      const continuityReconciliationStatus = product.site_continuity_reconciliation_execution_status || product.operation_product_surface?.continuity_reconciliation_execution_status || {};
      const continuityReconciliationExecution = (product.site_continuity_reconciliation_executions || [])[0] || null;
      const continuityReconciliationExecutionCount = Number(continuityReconciliationStatus.execution_count ?? (product.site_continuity_reconciliation_executions || []).length ?? 0);
      const continuityReconciliationExecutionRef = continuityReconciliationStatus.latest_execution_id || continuityReconciliationExecution?.execution_id || '';
      const continuityReconciliationExecutionObserved = continuityReconciliationExecutionCount > 0 || Boolean(continuityReconciliationExecutionRef);
      const localCloudBridge = product.local_cloud_continuity_bridge || product.operation_product_surface?.local_cloud_continuity_bridge || {};
      const continuityLoopCommand = siteId
        ? (localCloudBridge.loop_command || 'pnpm site:continuity:loop -- sync-cloudflare --site ' + siteId + ' --url <worker-url> --token-file <token-file>')
        : 'pnpm site:continuity:loop -- sync-cloudflare --site <site_id> --url <worker-url> --token-file <token-file>';
      return [
        {
          key: 'operation_scope_loaded',
          label: 'Operation Scope',
          status: state.productScope === 'operation' && (product.operation || el('operationId').value.trim()) ? 'complete' : 'needs_attention',
          detail: product.operation?.operation_id || el('operationId').value.trim() || 'no operation loaded',
          action_label: 'Read Operation Scope',
          action: () => run(refreshOperation),
        },
        {
          key: 'site_scope_loaded',
          label: 'Site Scope',
          status: state.productScope === 'site' && product.site ? 'complete' : 'needs_attention',
          detail: product.site?.site_id || product.operation?.site_id || el('siteId').value.trim() || 'no site loaded',
          action_label: 'Read Site Scope',
          action: () => run(refreshSiteProduct),
        },
        {
          key: 'session_selected',
          label: 'Session Selected',
          status: activeSession ? 'complete' : 'needs_attention',
          detail: activeSession || 'select or start session',
          action_label: 'Focus Session',
          action: () => { if (targets.session) selectOperationSession(targets.session); },
        },
        {
          key: 'session_evidence_loaded',
          label: 'Session Evidence',
          status: sessionEvidenceLoaded ? 'complete' : 'needs_attention',
          detail: sessionEvidenceLoaded ? 'evidence loaded for active session' : 'read active session evidence',
          action_label: 'Read Evidence',
          action: () => run(readSelectedSessionEvidence),
        },
        {
          key: 'attention_reviewed',
          label: 'Attention Review',
          status: openAttention.length === 0 ? 'complete' : 'needs_attention',
          detail: String(openAttention.length) + ' open / ' + state.attentionItems.length + ' total',
          action_label: 'Focus Attention',
          action: () => { if (targets.attention) selectAttentionItem(targets.attention); },
        },
        {
          key: 'task_lifecycle_reviewed',
          label: 'Task Lifecycle',
          status: openTasks.length === 0 ? 'complete' : 'needs_attention',
          detail: String(openTasks.length) + ' open / ' + (product.tasks || []).length + ' total',
          action_label: 'Focus Task',
          action: () => { if (targets.task) selectTask(targets.task); },
        },
        {
          key: 'authority_state_loaded',
          label: 'Authority State',
          status: authorityLoaded ? 'complete' : 'needs_attention',
          detail: authorityLoaded ? 'authority evidence loaded' : 'read site scope for authority state',
          action_label: 'Read Site Scope',
          action: () => run(refreshSiteProduct),
        },
        {
          key: 'local_cloud_binding_declared',
          label: 'Local-Cloud Binding',
          status: product.site_continuity?.binding ? 'complete' : 'needs_attention',
          detail: product.site_continuity?.binding
            ? [localWindowsEmbodiment.site_ref, cloudflareEmbodiment.site_ref].filter(Boolean).join(' <-> ')
            : 'read site continuity binding',
          action_label: 'Read Site Continuity',
          action: () => run(refreshSiteProduct),
        },
        {
          key: 'authority_map_projection_reviewed',
          label: 'Authority Map Projection',
          status: (product.site_continuity?.decisions || []).some((decision) => decision.exchange_class === 'authority_map_projection') ? 'complete' : 'needs_attention',
          detail: product.site_continuity?.binding?.authority_map_ref || 'read authority map projection decision',
          action_label: 'Focus Authority Projection',
          action: () => selectContinuity((product.site_continuity?.decisions || []).find((decision) => decision.exchange_class === 'authority_map_projection')),
        },
        {
          key: 'read_model_projection_reviewed',
          label: 'Read Model Projection',
          status: (product.site_continuity?.decisions || []).some((decision) => decision.exchange_class === 'read_model_projection') ? 'complete' : 'needs_attention',
          detail: 'projection is evidence-bearing; not mutation authority',
          action_label: 'Focus Read Projection',
          action: () => selectContinuity((product.site_continuity?.decisions || []).find((decision) => decision.exchange_class === 'read_model_projection')),
        },
        {
          key: 'mutation_evidence_reference_reviewed',
          label: 'Mutation Evidence Reference',
          status: (product.site_continuity?.decisions || []).some((decision) => decision.exchange_class === 'mutation_evidence_reference') ? 'complete' : 'needs_attention',
          detail: 'remote mutation evidence may be referenced without replaying authority',
          action_label: 'Focus Evidence Reference',
          action: () => selectContinuity((product.site_continuity?.decisions || []).find((decision) => decision.exchange_class === 'mutation_evidence_reference')),
        },
        {
          key: 'cross_embodiment_execution_guarded',
          label: 'Cross-Embodiment Execution Guard',
          status: product.site_continuity_status?.authority_boundary?.executable_cross_embodiment_mutation ? 'complete' : 'needs_attention',
          detail: product.site_continuity_status?.authority_boundary?.executable_cross_embodiment_mutation || 'confirm cross-embodiment mutation refusal',
          action_label: 'Read Site Continuity',
          action: () => run(refreshSiteProduct),
        },
        {
          key: 'continuity_loop_recorded',
          label: 'Continuity Loop',
          status: continuityPacketCount > 0 ? 'complete' : 'needs_attention',
          detail: continuityPacketCount > 0 ? String(continuityPacketCount) + ' packet(s) observed' : continuityLoopCommand,
          action_label: 'Read Site Continuity',
          action: () => run(refreshSiteProduct),
        },
        {
          key: 'continuity_loop_report_recorded',
          label: 'Continuity Loop Report',
          status: continuityLoopReportCount > 0 ? 'complete' : 'needs_attention',
          detail: continuityLoopReportCount > 0 ? String(continuityLoopReportCount) + ' report(s) recorded' : continuityLoopCommand,
          action_label: continuityLoopReport ? 'Focus Loop Evidence' : 'Read Loop Evidence',
          action: () => continuityLoopReport ? focusContinuityLoopReport(product) : run(refreshSiteProduct),
        },
        {
          key: 'site_continuity_reconciliation_execution_reviewed',
          label: 'Reconciliation Execution',
          status: continuityReconciliationExecutionObserved ? 'complete' : 'needs_attention',
          detail: continuityReconciliationExecutionObserved
            ? [String(continuityReconciliationExecutionCount) + ' execution(s) observed', continuityReconciliationStatus.latest_status || continuityReconciliationExecution?.status || 'status unknown'].join(' / ')
            : 'read site continuity reconciliation execution evidence',
          action_label: continuityReconciliationExecutionRef ? 'Focus Reconciliation Execution' : 'Read Reconciliation Evidence',
          action: () => continuityReconciliationExecutionRef ? focusContinuityReconciliationExecution(product) : run(refreshSiteProduct),
        },
        {
          key: 'evidence_focus_set',
          label: 'Evidence Focus',
          status: state.evidenceFocus ? 'complete' : 'needs_attention',
          detail: state.evidenceFocus ? eventTitle(state.evidenceFocus) : 'focus evidence for selected session or operation',
          action_label: 'Focus Evidence',
          action: focusFlightDeckEvidence,
        },
      ];
    }
    function applyContinuityWorkflowNextStep() {
      const step = continuityWorkflowSteps().find((item) => item.status !== 'complete');
      if (step?.action) step.action();
    }
    function continuityWorkflowActionButton(step) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = step.action_label || 'Focus';
      button.addEventListener('click', step.action);
      return button;
    }
    function renderContinuityWorkflow(product = state.operationProduct || {}) {
      if (!product) {
        el('continuityWorkflow').innerHTML = '<div class="empty">No continuity workflow loaded.</div>';
        return;
      }
      const steps = continuityWorkflowSteps(product);
      el('continuityWorkflow').replaceChildren(...steps.map((step) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (step.status !== 'complete' ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = step.label;
        const meta = document.createElement('span');
        meta.textContent = [step.status, step.detail].filter(Boolean).join(' | ');
        node.append(title, meta, focusActionRow(continuityWorkflowActionButton(step)));
        return node;
      }));
    }
    function localCloudContinuityBridgeContext(product = state.operationProduct || {}) {
      const bridge = product.local_cloud_continuity_bridge || product.operation_product_surface?.local_cloud_continuity_bridge || {};
      const binding = product.site_continuity?.binding || {};
      const localWindowsEmbodiment = (binding.embodiments || []).find((embodiment) => embodiment.embodiment_kind === 'local_windows') || {};
      const cloudflareEmbodiment = (binding.embodiments || []).find((embodiment) => embodiment.embodiment_kind === 'cloudflare_carrier') || {};
      const status = product.site_continuity_status || product.operation_product_surface?.continuity_status || {};
      return [
        ['Bridge Schema', bridge.schema || 'narada.local_cloud_continuity_bridge.v1'],
        ['Bridge State', bridge.state || 'no_packet_observed'],
        ['Local Site Ref', bridge.local_windows_site_ref || binding.local_windows_site_ref || localWindowsEmbodiment.site_ref || 'none'],
        ['Cloudflare Site Ref', bridge.cloudflare_site_ref || binding.cloudflare_site_ref || cloudflareEmbodiment.site_ref || 'none'],
        ['Authority Map Ref', bridge.authority_map_ref || binding.authority_map_ref || 'none'],
        ['Expected Exchange Packet', bridge.expected_exchange_packet_id || status.expected_exchange_packet_id || 'none'],
        ['Latest Packet', bridge.latest_packet_id || status.latest_packet_id || 'none'],
        ['Latest Imported', bridge.latest_imported_at || status.latest_imported_at || 'none'],
        ['Latest Admission', [bridge.latest_admission_action || status.latest_admission_action, bridge.latest_admission_reason || status.latest_admission_reason].filter(Boolean).join(' / ') || 'none'],
        ['Cloudflare -> Local Packets', bridge.cloudflare_to_local_windows_packets ?? status.direction_counts?.cloudflare_to_local_windows ?? 0],
        ['Local -> Cloudflare Packets', bridge.local_windows_to_cloudflare_packets ?? status.direction_counts?.local_windows_to_cloudflare ?? 0],
        ['Executable Cross-Embodiment Mutation', bridge.executable_cross_embodiment_mutation || status.authority_boundary?.executable_cross_embodiment_mutation || 'refused_by_site_continuity_classifier'],
        ['Durable Mutation Authority', bridge.durable_mutation_authority || status.authority_boundary?.durable_mutation_authority || 'unchanged; routed_by_site_authority_map'],
        ['Next Action', bridge.next_action || 'observe_continuity_packet'],
        ['Loop Command', bridge.loop_command || 'pnpm site:continuity:loop -- sync-cloudflare --site <site_id> --url <worker-url> --token-file <token-file>'],
        ['Refresh Command', bridge.refresh_command || bridge.loop_command || 'pnpm site:continuity:loop -- sync-cloudflare --site <site_id> --url <worker-url> --token-file <token-file>'],
        ['Pull Command', bridge.pull_command || 'pnpm --filter @narada2/cloudflare-carrier continuity:cloudflare -- pull-cloudflare --site <site_id> --url <worker-url> --token-file <token-file>'],
        ['Push Command', bridge.push_command || 'pnpm --filter @narada2/cloudflare-carrier continuity:cloudflare -- push-cloudflare --site <site_id> --url <worker-url> --token-file <token-file> < packet.json'],
        ['Read Command', bridge.read_command || 'pnpm --filter @narada2/cloudflare-carrier continuity:cloudflare -- read-cloudflare --site <site_id> --url <worker-url> --token-file <token-file>'],
      ];
    }
    function renderLocalCloudContinuityBridge(product = state.operationProduct || {}) {
      if (!product?.site_continuity && !product?.site_continuity_status && !product?.operation_product_surface?.continuity_status && !product?.local_cloud_continuity_bridge) {
        el('localCloudContinuityBridge').innerHTML = '<div class="empty">No local-cloud continuity loaded.</div>';
        return;
      }
      el('localCloudContinuityBridge').replaceChildren(...localCloudContinuityBridgeContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function continuityLoopEvidenceContext(product = state.operationProduct || {}) {
      const status = product.site_continuity_loop_status || product.operation_product_surface?.continuity_loop_status || {};
      const latest = (product.site_continuity_loop_reports || [])[0] || {};
      return [
        ['Schema', status.schema || 'narada.cloudflare_site_continuity_loop_status.v1'],
        ['State', status.state || 'no_loop_report_observed'],
        ['Reports', status.report_count ?? (product.site_continuity_loop_reports || []).length ?? 0],
        ['Latest Report', status.latest_report_id || latest.report_id || 'none'],
        ['Latest Status', status.latest_status || latest.status || 'none'],
        ['Generated', status.latest_generated_at || latest.generated_at || 'none'],
        ['Recorded', status.latest_recorded_at || latest.recorded_at || 'none'],
        ['Cloudflare Push', status.cloudflare_push_status || latest.cloudflare_push_status || 'none'],
        ['Windows Packets', status.windows_packet_count ?? latest.windows_packet_count ?? 0],
        ['Next Action', status.next_action || ((status.report_count ?? 0) > 0 ? 'review_continuity_loop_report' : 'run_site_continuity_loop')],
      ];
    }
    function renderContinuityLoopEvidence(product = state.operationProduct || {}) {
      if (!product?.site_continuity_loop_status && !product?.operation_product_surface?.continuity_loop_status) {
        el('continuityLoopEvidence').innerHTML = '<div class="empty">No continuity loop evidence loaded.</div>';
        return;
      }
      el('continuityLoopEvidence').replaceChildren(...continuityLoopEvidenceContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function focusContinuityLoopRefresh(product = state.operationProduct || {}) {
      renderLocalCloudContinuityBridge(product);
      focusContinuityLoopReport(product);
    }
    function focusContinuityLoopReport(product = state.operationProduct || {}) {
      const report = (product.site_continuity_loop_reports || [])[0] || null;
      if (report) selectContinuity({ kind: 'loop_report', ...report });
      renderContinuityLoopEvidence(product);
    }
    function focusContinuityReconciliationExecution(product = state.operationProduct || {}) {
      const status = product.site_continuity_reconciliation_execution_status || product.operation_product_surface?.continuity_reconciliation_execution_status || {};
      const execution = (product.site_continuity_reconciliation_executions || [])[0] || null;
      const executionRef = status.latest_execution_id || execution?.execution_id || '';
      if (!executionRef) { run(refreshSiteProduct); return; }
      focusOperationReviewFromRoute({
        focus_kind: 'site_continuity_reconciliation_execution',
        focus_ref: executionRef,
        next_action: 'review_site_continuity_reconciliation_execution',
        command_action: 'review_site_continuity_reconciliation_execution',
        target: executionRef,
        reason: status.health === 'attention' ? 'site_continuity_reconciliation_execution_needs_review' : 'site_continuity_reconciliation_execution_observed',
      }, product);
    }
    function refreshEventKindFilter() {
      const select = el('eventKindFilter');
      const current = select.value;
      const kinds = [...new Set(state.events.map((event) => event.event_kind).filter(Boolean))].sort();
      select.replaceChildren(new Option('All event kinds', ''), ...kinds.map((kind) => new Option(kind, kind)));
      if (kinds.includes(current)) select.value = current;
    }
    function visibleEvents() {
      const activeSession = el('sessionId').value.trim();
      const kindFilter = el('eventKindFilter').value;
      const sessionFilter = el('eventSessionFilter').value;
      return state.events.filter((event) => {
        if (kindFilter && event.event_kind !== kindFilter) return false;
        if (state.evidenceLane && classifyEvidenceLane(event) !== state.evidenceLane) return false;
        if (sessionFilter === 'active' && activeSession && event.carrier_session_id && event.carrier_session_id !== activeSession) return false;
        return true;
      });
    }
    function evidenceLaneDefinitions() {
      return [
        { key: '', label: 'All Evidence' },
        { key: 'input', label: 'Input Lifecycle' },
        { key: 'provider', label: 'Provider Turns' },
        { key: 'tools', label: 'Tools / Effects' },
        { key: 'authority', label: 'Authority' },
        { key: 'directives', label: 'Directives' },
        { key: 'failures', label: 'Failures' },
        { key: 'other', label: 'Other' },
      ];
    }
    function classifyEvidenceLane(event = {}) {
      return classifyCloudflareEvidenceCommandState(event, { parsed_task_id: tryParseTaskId(event.payload?.result_summary) }).lane;
    }
    function renderEvidenceLanes() {
      const counts = new Map(evidenceLaneDefinitions().map((lane) => [lane.key, 0]));
      for (const event of state.events) {
        counts.set('', (counts.get('') || 0) + 1);
        const lane = classifyEvidenceLane(event);
        counts.set(lane, (counts.get(lane) || 0) + 1);
      }
      el('evidenceLanes').replaceChildren(...evidenceLaneDefinitions().map((lane) => {
        const node = document.createElement('article');
        node.className = 'evidence-lane' + (state.evidenceLane === lane.key ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = lane.label;
        const meta = document.createElement('span');
        meta.textContent = String(counts.get(lane.key) || 0) + ' events';
        node.addEventListener('click', () => setEvidenceLane(lane.key));
        node.append(title, meta);
        return node;
      }));
    }
    function focusEvidence(event) {
      if (!event) return;
      state.evidenceFocus = event;
      renderEvidenceFocus();
      renderEvidenceActionSummary();
      renderEvidenceReviewQueue();
      updateControlRoom();
    }
    function focusEvidenceFor(predicate) {
      const event = state.events.find(predicate) || (state.operationProduct?.carrier_evidence || []).flatMap((entry) => entry.events || []).find(predicate) || null;
      if (event) focusEvidence(event);
    }
    function evidenceFocusIndex(events = visibleEvents()) {
      if (!state.evidenceFocus) return -1;
      return events.findIndex((event) => eventKey(event) === eventKey(state.evidenceFocus));
    }
    function focusAdjacentEvidence(offset) {
      const events = visibleEvents();
      if (events.length === 0) return;
      const current = evidenceFocusIndex(events);
      const nextIndex = current < 0 ? 0 : Math.max(0, Math.min(events.length - 1, current + offset));
      focusEvidence(events[nextIndex]);
      renderEvents();
    }
    function evidenceTrailContext(event) {
      const events = visibleEvents();
      const index = evidenceFocusIndex(events);
      const lane = state.evidenceLane || classifyEvidenceLane(event);
      return [
        ['Trail Position', index >= 0 ? String(index + 1) + ' / ' + events.length : 'outside visible window'],
        ['Lane', lane || 'all'],
        ['Active Kind Filter', el('eventKindFilter').value || 'all'],
        ['Active Session Filter', el('eventSessionFilter').value || 'all'],
      ];
    }
    function renderEvidenceFocus() {
      if (!state.evidenceFocus) {
        el('evidenceFocus').replaceChildren(
          Object.assign(document.createElement('h3'), { textContent: 'Evidence Focus' }),
          Object.assign(document.createElement('span'), { textContent: 'No event selected.' }),
        );
        renderEvidenceActionSummary();
        return;
      }
      const heading = document.createElement('h3');
      heading.textContent = 'Evidence Focus';
      const meta = document.createElement('span');
      meta.textContent = eventTitle(state.evidenceFocus);
      const summary = document.createElement('div');
      summary.className = 'evidence-summary';
      summary.replaceChildren(...evidenceActionContext(state.evidenceFocus).map(([label, value]) => evidenceField(label, value)), ...evidenceTrailContext(state.evidenceFocus).map(([label, value]) => evidenceField(label, value)));
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(evidencePayload(state.evidenceFocus), null, 2);
      el('evidenceFocus').replaceChildren(
        heading,
        meta,
        summary,
        focusActionRow(
          focusActionButton('evidenceFocusPreviousAction', 'Previous Evidence', () => focusAdjacentEvidence(-1)),
          focusActionButton('evidenceFocusNextAction', 'Next Evidence', () => focusAdjacentEvidence(1)),
        ),
        pre,
      );
    }
    function evidenceTargetContext(event = {}) {
      const command = classifyCloudflareEvidenceCommandState(event, { parsed_task_id: tryParseTaskId(event.payload?.result_summary) });
      return { targetType: command.target_type, targetRef: command.target_ref };
    }
    function tryParseTaskId(value) {
      if (!value || typeof value !== 'string') return null;
      try { return JSON.parse(value).task?.task_id || null; } catch { return null; }
    }
    function evidenceNextAction(event = {}) {
      return classifyCloudflareEvidenceCommandState(event, { parsed_task_id: tryParseTaskId(event.payload?.result_summary) }).next_action;
    }
    function evidenceActionSummaryContext(event = state.evidenceFocus) {
      if (!event) return [];
      const command = classifyCloudflareEvidenceCommandState(event, { parsed_task_id: tryParseTaskId(event.payload?.result_summary) });
      return [
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
        ['Target Type', command.target_type],
        ['Target Ref', command.target_ref],
        ['Lane', command.lane],
        ['Session', event.carrier_session_id || el('sessionId').value.trim() || 'none'],
        ['Sequence', event.sequence ?? 'none'],
        ['Kind', event.event_kind || 'unknown'],
      ];
    }
    function focusEvidenceLaneForCurrent() {
      if (!state.evidenceFocus) return;
      state.evidenceLane = classifyEvidenceLane(state.evidenceFocus);
      renderEvidenceLanes();
      renderEvidenceReviewQueue();
      renderEvents();
      updateControlRoom();
    }
    function selectEvidenceSession() {
      if (state.evidenceFocus?.carrier_session_id) setCurrentSession(state.evidenceFocus.carrier_session_id);
    }
    function focusEvidenceTarget() {
      const event = state.evidenceFocus;
      if (!event) return;
      const payload = event.payload || {};
      const target = evidenceTargetContext(event);
      if (target.targetType === 'task') {
        const task = (state.operationProduct?.tasks || []).find((entry) => entry.task_id === target.targetRef) || { task_id: target.targetRef };
        selectTask(task);
        return;
      }
      if (target.targetType === 'attention') {
        const attention = state.attentionItems.find((item) => item.directive_id === target.targetRef || item.input_event_id === payload.input_event_id);
        if (attention) selectAttentionItem(attention);
        return;
      }
      if (target.targetType === 'authority') {
        const decision = (state.operationProduct?.site_authority?.decisions || []).find((entry) => entry.mutation_class === target.targetRef || entry.reason === payload.reason || entry.action === payload.admission_action);
        if (decision) selectAuthorityDecision(decision);
        else focusAuthorityEvidence();
        return;
      }
      if (target.targetType === 'session' && event.carrier_session_id) {
        const session = (state.operationProduct?.sessions || []).find((entry) => entry.carrier_session_id === event.carrier_session_id) || { carrier_session_id: event.carrier_session_id };
        selectOperationSession(session);
        return;
      }
      if (target.targetType === 'tool_effect') {
        focusOperationPathTask();
        return;
      }
      focusOperationPathEvidence();
    }
    function focusEvidencePath() {
      const event = state.evidenceFocus;
      if (!event) return;
      const target = evidenceTargetContext(event);
      if (target.targetType === 'task') { focusEvidenceTarget(); renderTaskEvidencePath(selectedTaskFromWorkbench()); return; }
      if (target.targetType === 'authority') { focusEvidenceTarget(); renderAuthorityPath(); return; }
      if (event.carrier_session_id || target.targetType === 'session') { focusEvidenceTarget(); renderSessionEvidencePath(focusedSession()); return; }
      focusOperationPathEvidence();
      renderOperationPath();
    }
    function renderEvidenceActionSummary(event = state.evidenceFocus) {
      if (!event) {
        el('evidenceActionSummary').replaceChildren(
          Object.assign(document.createElement('h3'), { textContent: 'Evidence Action' }),
          Object.assign(document.createElement('span'), { textContent: 'No evidence action selected.' }),
        );
        return;
      }
      const heading = Object.assign(document.createElement('h3'), { textContent: 'Evidence Action' });
      const summary = document.createElement('div');
      summary.className = 'evidence-summary';
      summary.replaceChildren(...evidenceActionSummaryContext(event).map(([label, value]) => evidenceField(label, value)));
      el('evidenceActionSummary').replaceChildren(
        heading,
        summary,
        focusActionRow(
          focusActionButton('evidenceActionLaneAction', 'Focus Evidence Lane', focusEvidenceLaneForCurrent),
          focusActionButton('evidenceActionSessionAction', 'Use Evidence Session', selectEvidenceSession),
          focusActionButton('evidenceActionTargetAction', 'Focus Evidence Target', focusEvidenceTarget),
          focusActionButton('evidenceActionPathAction', 'Focus Evidence Path', focusEvidencePath),
        ),
      );
    }
    function evidenceReviewPriority(command = {}) {
      if (command.lane === 'failures') return 0;
      if (command.lane === 'authority') return 1;
      if (command.lane === 'tools') return 2;
      if (command.lane === 'directives') return 3;
      if (command.lane === 'provider') return 4;
      if (command.lane === 'input') return 5;
      return 6;
    }
    function evidenceReviewQueueItems(events = visibleEvents()) {
      return events.map((event) => {
        const command = classifyCloudflareEvidenceCommandState(event, { parsed_task_id: tryParseTaskId(event.payload?.result_summary) });
        return { event, command };
      }).sort((left, right) => {
        const priority = evidenceReviewPriority(left.command) - evidenceReviewPriority(right.command);
        if (priority !== 0) return priority;
        return Number(right.event.sequence ?? 0) - Number(left.event.sequence ?? 0);
      });
    }
    function evidenceReviewQueueButtonId(event, suffix) {
      return ['evidenceReviewQueue', event.event_kind || 'event', event.sequence ?? 'seq', suffix].join('_').replace(/[^a-z0-9_:-]+/gi, '_');
    }
    function renderEvidenceReviewQueue(events = visibleEvents()) {
      if (!events.length) {
        el('evidenceReviewQueue').innerHTML = '<div class="empty">No evidence review loaded.</div>';
        return;
      }
      const items = evidenceReviewQueueItems(events).slice(0, 25);
      el('evidenceReviewQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (state.evidenceFocus && eventKey(state.evidenceFocus) === eventKey(item.event) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.command.lane, item.command.command_state, item.event.event_kind || 'event'].join(' | ');
        const meta = document.createElement('span');
        meta.textContent = [item.command.next_action, item.command.target_type + ':' + item.command.target_ref, item.event.carrier_session_id || 'no session', 'seq ' + (item.event.sequence ?? 'none')].join(' | ');
        node.addEventListener('click', () => focusEvidence(item.event));
        node.append(
          title,
          meta,
          focusActionRow(
            focusActionButton(evidenceReviewQueueButtonId(item.event, 'focus'), 'Focus', () => focusEvidence(item.event)),
            focusActionButton(evidenceReviewQueueButtonId(item.event, 'target'), 'Target', () => { focusEvidence(item.event); focusEvidenceTarget(); }),
            focusActionButton(evidenceReviewQueueButtonId(item.event, 'path'), 'Path', () => { focusEvidence(item.event); focusEvidencePath(); }),
          ),
        );
        return node;
      }));
    }
    function selectAttentionItem(item) {
      if (!item?.directive_id) return;
      state.attentionFocus = item;
      focusEvidenceFor((event) => event.event_kind === 'directive_emitted' && event.payload?.directive_id === item.directive_id);
      if (item.carrier_session_id) setCurrentSession(item.carrier_session_id);
      el('updateTaskStatus').value = 'done';
      el('updateTaskNote').value = ['resolved_attention', item.directive_id, item.input_event_id, item.reason].filter(Boolean).join(' ');
      el('eventKindFilter').value = 'directive_emitted';
      renderAttentionFocusDetail(item);
      renderAttentionQueue(state.attentionItems);
      renderEvents();
      updateControlRoom();
    }
    function renderAttentionQueue(items = []) {
      state.attentionItems = items;
      if (items.length === 0) {
        state.attentionFocus = null;
        el('attentionQueue').innerHTML = '<div class="empty">No operation attention loaded.</div>';
        renderAttentionFocusDetail();
        updateControlRoom();
        return;
      }
      if (state.attentionFocus) state.attentionFocus = items.find((item) => item.directive_id === state.attentionFocus.directive_id) || state.attentionFocus;
      el('attentionQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (state.attentionFocus?.directive_id === item.directive_id ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.status + ' ' + item.directive_id;
        const meta = document.createElement('span');
        meta.textContent = [item.reason, item.operation_id, item.carrier_session_id, item.visibility, item.resolving_task_id].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectAttentionItem(item));
        node.append(title, meta);
        return node;
      }));
      renderAttentionFocusDetail();
      updateControlRoom();
    }
    function attentionFocusContext(item = {}) {
      const followUp = item.status === 'resolved'
        ? 'inspect_evidence'
        : item.resolving_task_id
          ? 'inspect_resolving_task'
          : 'create_or_select_resolution_task';
      return [
        ['Directive', item.directive_id || 'none'],
        ['Status', item.status || 'unknown'],
        ['Reason', item.reason || 'none'],
        ['Operation', item.operation_id || el('operationId').value.trim() || 'none'],
        ['Session', item.carrier_session_id || 'none'],
        ['Visibility', item.visibility || 'unknown'],
        ['Input Event', item.input_event_id || 'none'],
        ['Sequence', item.sequence ?? 'none'],
        ['Resolving Task', item.resolving_task_id || 'none'],
        ['Follow Up', followUp],
        ['Target', item.target ? JSON.stringify(item.target) : 'none'],
      ];
    }
    function renderAttentionFocusDetail(item = state.attentionFocus) {
      if (!item) {
        el('attentionFocusDetail').innerHTML = '<div class="empty">No attention item selected.</div>';
        return;
      }
      el('attentionFocusDetail').replaceChildren(
        ...attentionFocusContext(item).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('attentionFocusEvidenceAction', 'Focus Evidence', () => focusEvidenceFor((event) => event.event_kind === 'directive_emitted' && event.payload?.directive_id === item.directive_id)),
          focusActionButton('attentionFocusTaskAction', 'Task From Attention', () => run(createTaskFromFocusedAttention)),
          focusActionButton('attentionFocusResolveAction', 'Resolve Attention', () => run(resolveFocusedAttention)),
        ),
      );
    }
    function renderAuthorityState(product = {}) {
      const decisions = product.site_authority?.decisions || [];
      if (decisions.length === 0) {
        state.authorityFocus = null;
        el('authorityState').innerHTML = '<div class="empty">No authority state loaded.</div>';
        renderAuthorityDecisionQueue(decisions, product);
        renderAuthorityPostureSummary(decisions);
        renderAuthorityFocusDetail();
        renderAuthorityPath(product);
        renderAuthorityDecisionControl(null, product);
        updateControlRoom();
        return;
      }
      if (!state.authorityFocus) state.authorityFocus = decisions[0];
      state.authorityFocus = decisions.find((decision) => authorityDecisionKey(decision) === authorityDecisionKey(state.authorityFocus)) || state.authorityFocus;
      el('authorityState').replaceChildren(...decisions.map((decision) => {
        const node = document.createElement('article');
        node.className = 'authority-decision ' + (decision.action || 'unknown') + (authorityDecisionKey(decision) === authorityDecisionKey(state.authorityFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [decision.action || 'unknown', decision.mutation_class || 'mutation'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = authorityRouteSummary(decision);
        node.addEventListener('click', () => selectAuthorityDecision(decision));
        node.append(title, meta);
        return node;
      }));
      renderAuthorityDecisionQueue(decisions, product);
      renderAuthorityPostureSummary(decisions);
      renderAuthorityFocusDetail();
      renderAuthorityPath(product);
      renderAuthorityDecisionControl(state.authorityFocus, product);
      updateControlRoom();
    }
    function authorityPostureSummary(decisions = []) {
      const counts = decisions.reduce((next, decision) => {
        const action = String(decision.action || '').toLowerCase();
        if (action === 'admit') next.admit += 1;
        else if (action === 'refuse' || action === 'deny') next.refuse += 1;
        else next.other += 1;
        if (!decision.authority_locus || decision.authority_locus === 'unresolved') next.unresolved += 1;
        const locus = decision.authority_locus || 'unresolved';
        next.loci.set(locus, (next.loci.get(locus) || 0) + 1);
        return next;
      }, { admit: 0, refuse: 0, other: 0, unresolved: 0, loci: new Map() });
      const dominantLocus = [...counts.loci.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || 'none';
      const nextAction = decisions.length === 0 ? 'read_site_authority'
        : counts.refuse > 0 ? 'inspect_refusals'
        : counts.unresolved > 0 ? 'resolve_authority_locus'
        : 'monitor_admissions';
      return [
        ['Admitted', counts.admit],
        ['Refused', counts.refuse],
        ['Other', counts.other],
        ['Unresolved Locus', counts.unresolved],
        ['Dominant Locus', dominantLocus],
        ['Next Action', nextAction],
      ];
    }
    function renderAuthorityPostureSummary(decisions = []) {
      if (!decisions.length) {
        el('authorityPostureSummary').innerHTML = '<div class="empty">No authority posture loaded.</div>';
        return;
      }
      el('authorityPostureSummary').replaceChildren(...authorityPostureSummary(decisions).map(([label, value]) => evidenceField(label, value)));
    }
    function authorityDecisionEvidenceEvents(decision = {}, product = state.operationProduct || {}) {
      const tokens = [decision.mutation_class, decision.reason, decision.authority_locus, decision.controlled_action].filter(Boolean);
      return authorityEvidenceEvents(product).filter((event) => {
        const text = JSON.stringify(event.payload || {});
        return tokens.length === 0 || tokens.some((token) => text.includes(token));
      });
    }
    function authorityDecisionQueueItems(decisions = [], product = state.operationProduct || {}) {
      return decisions.map((decision) => {
        const evidenceCount = authorityDecisionEvidenceEvents(decision, product).length;
        const action = String(decision.action || '').toLowerCase();
        const unresolved = !decision.authority_locus || decision.authority_locus === 'unresolved';
        const refused = action === 'refuse' || action === 'deny';
        const status = refused || unresolved || evidenceCount === 0 ? 'needs_attention' : 'ready';
        const nextAction = refused ? 'inspect_refused_authority'
          : unresolved ? 'resolve_authority_locus'
          : evidenceCount === 0 ? 'focus_authority_evidence'
          : 'monitor_authority_admission';
        return { decision, evidence_count: evidenceCount, status, next_action: nextAction };
      }).sort((left, right) => {
        if (left.status !== right.status) return left.status === 'needs_attention' ? -1 : 1;
        if (left.decision.action !== right.decision.action) return String(right.decision.action || '').localeCompare(String(left.decision.action || ''));
        return authorityDecisionKey(left.decision).localeCompare(authorityDecisionKey(right.decision));
      });
    }
    function authorityDecisionQueueButtonId(decision, suffix) {
      return ['authorityDecisionQueue', authorityDecisionKey(decision) || 'decision', suffix].join('_').replace(/[^a-z0-9_:-]+/gi, '_');
    }
    function renderAuthorityDecisionQueue(decisions = [], product = state.operationProduct || {}) {
      if (!decisions.length) {
        el('authorityDecisionQueue').innerHTML = '<div class="empty">No authority decisions loaded.</div>';
        return;
      }
      const items = authorityDecisionQueueItems(decisions, product);
      el('authorityDecisionQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (authorityDecisionKey(item.decision) === authorityDecisionKey(state.authorityFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.decision.action || 'unknown', item.decision.mutation_class || 'mutation'].join(' | ');
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.next_action, item.decision.authority_locus || 'unresolved', item.decision.controlled_action || 'none', String(item.evidence_count) + ' evidence'].join(' | ');
        node.addEventListener('click', () => selectAuthorityDecision(item.decision));
        node.append(
          title,
          meta,
          focusActionRow(
            focusActionButton(authorityDecisionQueueButtonId(item.decision, 'focus'), 'Focus', () => selectAuthorityDecision(item.decision)),
            focusActionButton(authorityDecisionQueueButtonId(item.decision, 'evidence'), 'Evidence', () => { selectAuthorityDecision(item.decision); focusAuthorityEvidence(); }),
          ),
        );
        return node;
      }));
    }
    function authorityDecisionKey(decision = {}) {
      return [decision.mutation_class, decision.action, decision.reason, decision.authority_locus].filter(Boolean).join('|');
    }
    function authorityActorMembership(product = state.operationProduct || {}) {
      const principalId = state.operatorPrincipal?.principal_id || product.reader_principal?.principal_id || '';
      return currentMemberships(product).find((membership) => membership.principal_id === principalId || membership.email === state.operatorPrincipal?.email) || product.membership || null;
    }
    function authorityActionContext(product = state.operationProduct || {}) {
      const decisions = product.site_authority?.decisions || [];
      const focused = state.authorityFocus || decisions.find((decision) => decision.action !== 'admit') || decisions[0] || null;
      const membership = authorityActorMembership(product);
      const refused = decisions.filter((decision) => ['refuse', 'deny'].includes(String(decision.action || '').toLowerCase()));
      const unresolved = decisions.filter((decision) => !decision.authority_locus || decision.authority_locus === 'unresolved');
      const evidenceLoaded = state.events.some((event) => classifyEvidenceLane(event) === 'authority')
        || (product.authority_events || []).length > 0
        || (product.carrier_evidence || []).some((entry) => (entry.events || []).some((event) => classifyEvidenceLane(event) === 'authority'));
      const command = classifyCloudflareAuthorityCommandState({
        decision_count: decisions.length,
        refusal_count: refused.length,
        unresolved_locus_count: unresolved.length,
        evidence_loaded: evidenceLoaded,
      });
      return [
        ['Authority Loaded', decisions.length > 0 ? 'yes' : 'no'],
        ['Focused Decision', focused ? authorityDecisionKey(focused) || focused.mutation_class || 'authority' : 'none'],
        ['Decision Action', focused?.action || 'none'],
        ['Actor Membership', membership ? [membership.role || 'unknown', membership.status || 'unknown'].join(' / ') : 'none'],
        ['Authority Locus', focused?.authority_locus || 'unresolved'],
        ['Controlled Action', focused?.controlled_action || 'none'],
        ['Refusals', refused.length],
        ['Unresolved Locus', unresolved.length],
        ['Evidence Loaded', evidenceLoaded ? 'yes' : 'no'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
      ];
    }
    function renderAuthorityActionSummary(product = state.operationProduct || {}) {
      el('authorityActionSummary').replaceChildren(...authorityActionContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function authorityEvidenceEvents(product = state.operationProduct || {}) {
      const events = [...state.events, ...(product.carrier_evidence || []).flatMap((entry) => entry.events || [])];
      const seen = new Set();
      return events.filter((event) => {
        if (classifyEvidenceLane(event) !== 'authority') return false;
        const key = eventKey(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function authorityPathContext(product = state.operationProduct || {}) {
      const decisions = product.site_authority?.decisions || [];
      const focused = state.authorityFocus || decisions.find((decision) => decision.action !== 'admit') || decisions[0] || null;
      const membership = authorityActorMembership(product);
      const evidenceEvents = authorityEvidenceEvents(product);
      const refused = decisions.filter((decision) => ['refuse', 'deny'].includes(String(decision.action || '').toLowerCase()));
      const unresolved = decisions.filter((decision) => !decision.authority_locus || decision.authority_locus === 'unresolved');
      const nextAction = decisions.length === 0 ? 'read_site_authority'
        : refused.length > 0 ? 'inspect_refused_authority'
        : unresolved.length > 0 ? 'resolve_authority_locus'
        : evidenceEvents.length > 0 ? 'monitor_authority_admissions' : 'focus_authority_evidence';
      return [
        ['Operator', state.operatorPrincipal?.email || state.operatorPrincipal?.principal_id || product.reader_principal?.email || product.reader_principal?.principal_id || 'anonymous'],
        ['Actor Membership', membership ? [membership.role || 'unknown', membership.status || 'unknown'].join(' / ') : 'none'],
        ['Focused Decision', focused ? authorityDecisionKey(focused) || focused.mutation_class || 'authority' : 'none'],
        ['Decision Action', focused?.action || 'none'],
        ['Authority Locus', focused?.authority_locus || 'unresolved'],
        ['Controlled Action', focused?.controlled_action || 'none'],
        ['Decisions', String(decisions.length)],
        ['Refusals', String(refused.length)],
        ['Unresolved Locus', String(unresolved.length)],
        ['Authority Evidence Events', String(evidenceEvents.length)],
        ['Dominant Locus', contextValue(authorityPostureSummary(decisions), 'Dominant Locus') || 'none'],
        ['Next Action', nextAction],
      ];
    }
    function renderAuthorityPath(product = state.operationProduct || {}) {
      const target = el('authorityPath');
      if (!target) return;
      target.replaceChildren(...authorityPathContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function authorityDecisionControlContext(decision = state.authorityFocus, product = state.operationProduct || {}) {
      const decisions = product.site_authority?.decisions || [];
      const focused = decision || decisions.find((entry) => entry.action !== 'admit') || decisions[0] || null;
      if (!focused) return [];
      const evidenceEvents = authorityDecisionEvidenceEvents(focused, product);
      const action = String(focused.action || '').toLowerCase();
      const refused = action === 'refuse' || action === 'deny';
      const unresolved = !focused.authority_locus || focused.authority_locus === 'unresolved';
      const reviewAction = refused ? 'review_refused_authority'
        : unresolved ? 'review_unresolved_locus'
        : evidenceEvents.length === 0 ? 'load_decision_evidence'
        : 'monitor_authority_admission';
      return [
        ['Decision', authorityDecisionKey(focused) || focused.mutation_class || 'authority'],
        ['Decision Action', focused.action || 'unknown'],
        ['Mutation', focused.mutation_class || 'unknown'],
        ['Reason', focused.reason || 'none'],
        ['Authority Locus', focused.authority_locus || 'unresolved'],
        ['Controlled Action', focused.controlled_action || 'none'],
        ['Evidence Events', String(evidenceEvents.length)],
        ['Review State', refused || unresolved || evidenceEvents.length === 0 ? 'needs_attention' : 'ready'],
        ['Review Action', reviewAction],
      ];
    }
    function renderAuthorityDecisionControl(decision = state.authorityFocus, product = state.operationProduct || {}) {
      const context = authorityDecisionControlContext(decision, product);
      if (!context.length) {
        el('authorityDecisionControl').innerHTML = '<div class="empty">No authority decision control loaded.</div>';
        return;
      }
      el('authorityDecisionControl').replaceChildren(...context.map(([label, value]) => evidenceField(label, value)));
    }
    function applyAuthorityDecisionReview() {
      const product = state.operationProduct || {};
      const decisions = product.site_authority?.decisions || [];
      const decision = state.authorityFocus || decisions.find((entry) => entry.action !== 'admit') || decisions[0] || null;
      if (!decision) { run(refreshSiteProduct); return; }
      selectAuthorityDecision(decision);
      const reviewAction = contextValue(authorityDecisionControlContext(decision, product), 'Review Action');
      if (reviewAction === 'load_decision_evidence') { run(refreshSiteProduct); return; }
      focusAuthorityEvidence();
    }
    function focusAuthorityPathDecision() {
      const product = state.operationProduct || {};
      const decisions = product.site_authority?.decisions || [];
      const target = state.authorityFocus || decisions.find((decision) => decision.action !== 'admit') || decisions[0] || null;
      if (target) selectAuthorityDecision(target);
    }
    function refreshAuthorityPath() {
      run(refreshSiteProduct);
    }
    function focusAuthorityEvidence() {
      const decision = state.authorityFocus || (state.operationProduct?.site_authority?.decisions || [])[0] || null;
      if (decision) {
        focusEvidenceFor((event) => JSON.stringify(event.payload || {}).includes(decision.mutation_class || '') || JSON.stringify(event.payload || {}).includes(decision.reason || '') || classifyEvidenceLane(event) === 'authority');
        return;
      }
      focusEvidenceFor((event) => classifyEvidenceLane(event) === 'authority');
    }
    function applyAuthorityNextAction() {
      const product = state.operationProduct || {};
      const decisions = product.site_authority?.decisions || [];
      if (decisions.length === 0) { run(refreshSiteProduct); return; }
      const target = decisions.find((decision) => decision.action !== 'admit') || state.authorityFocus || decisions[0];
      if (target) selectAuthorityDecision(target);
      focusAuthorityEvidence();
    }
    function selectAuthorityDecision(decision) {
      if (!decision) return;
      state.authorityFocus = decision;
      focusAuthorityEvidence();
      renderAuthorityState(state.operationProduct || {});
      renderAuthorityPath(state.operationProduct || {});
      renderAuthorityDecisionControl(decision, state.operationProduct || {});
      updateControlRoom();
    }
    function authorityDecisionContext(decision = {}) {
      const followUp = decision.action === 'admit'
        ? 'inspect_admission_evidence'
        : decision.authority_locus
          ? 'inspect_authority_locus'
          : 'resolve_authority_locus';
      return [
        ['Action', decision.action || 'unknown'],
        ['Mutation', decision.mutation_class || 'unknown'],
        ['Reason', decision.reason || 'none'],
        ['Authority Locus', decision.authority_locus || 'unresolved'],
        ['Locus Kind', decision.authority_locus_kind || 'unknown'],
        ['Controlled Action', decision.controlled_action || 'none'],
        ['Follow Up', followUp],
      ];
    }
    function renderAuthorityFocusDetail() {
      if (!state.authorityFocus) {
        el('authorityFocusDetail').innerHTML = '<div class="empty">No authority decision selected.</div>';
        renderAuthorityDecisionControl();
        return;
      }
      renderAuthorityDecisionControl(state.authorityFocus, state.operationProduct || {});
      el('authorityFocusDetail').replaceChildren(
        ...authorityDecisionContext(state.authorityFocus).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('authorityFocusEvidenceAction', 'Focus Evidence', () => focusEvidenceFor((event) => JSON.stringify(event.payload || {}).includes(state.authorityFocus.mutation_class || '') || JSON.stringify(event.payload || {}).includes(state.authorityFocus.reason || ''))),
        ),
      );
    }
    async function selectOperation(operation) {
      if (!operation?.operation_id) return;
      setCurrentOperation(operation.operation_id);
      await refreshOperation();
    }
    function focusedOperation() {
      const activeOperation = el('operationId').value.trim();
      return state.operationFocus
        || (state.operations || []).find((operation) => operation.operation_id === activeOperation)
        || (state.operationProduct?.operation?.operation_id === activeOperation ? state.operationProduct.operation : null)
        || (activeOperation ? { operation_id: activeOperation } : null);
    }
    function operationScopeLoaded(operation = focusedOperation()) {
      const operationId = operation?.operation_id || el('operationId').value.trim();
      return Boolean(operationId && state.productScope === 'operation' && state.operationProduct?.operation?.operation_id === operationId);
    }
    function operationEvidenceLoaded(operation = focusedOperation()) {
      const operationId = operation?.operation_id || el('operationId').value.trim();
      if (!operationId) return false;
      return (state.operationProduct?.carrier_evidence || []).some((entry) => (entry.events || []).length > 0)
        || state.events.some((event) => (event.payload?.operation_id || event.payload?.target?.id || state.operationProduct?.operation?.operation_id) === operationId);
    }
    function operationActionContext(operation = focusedOperation()) {
      const operationId = operation?.operation_id || el('operationId').value.trim() || '';
      const isActive = operationId && operationId === el('operationId').value.trim();
      const scopeLoaded = operationScopeLoaded(operation);
      const sessionCount = scopeLoaded ? (state.operationProduct?.sessions || []).length : 0;
      const evidenceLoaded = operationEvidenceLoaded(operation);
      const path = Object.fromEntries(operationPathContext(operation, state.operationProduct || {}));
      const workflowRoute = operationWorkflowRouteStage(state.operationProduct || {});
      const command = classifyCloudflareOperationCommandState({
        operation_id: operationId,
        is_active: Boolean(isActive),
        scope_loaded: scopeLoaded,
        session_count: sessionCount,
        evidence_loaded: evidenceLoaded,
        operation_path_next_action: path['Next Action'] || 'read_operation_scope',
      });
      return [
        ['Operation', operationId || 'none'],
        ['Active', isActive ? 'yes' : 'no'],
        ['Status', operation?.status || state.operationProduct?.operation?.status || 'unknown'],
        ['Kind', operation?.operation_kind || state.operationProduct?.operation?.operation_kind || 'unknown'],
        ['Scope Loaded', scopeLoaded ? 'yes' : 'no'],
        ['Sessions', sessionCount],
        ['Open Tasks', path['Open Tasks'] || '0'],
        ['Attention', path.Attention || '0 open / 0 total'],
        ['Authority Decisions', path['Authority Decisions'] || '0'],
        ['Evidence Loaded', evidenceLoaded ? 'yes' : 'no'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
        ['Workflow State', workflowRoute.command_state || 'unknown'],
        ['Workflow Action', workflowRoute.next_action || workflowRoute.command_action || 'none'],
        ['Workflow Reason', workflowRoute.reason || 'none'],
        ['Action Command Kind', workflowRoute.action_command_kind || 'none'],
        ['Action Command', workflowRoute.action_command || 'none'],
      ];
    }
    function applyOperationCommandAction() {
      const product = state.operationProduct || {};
      const commandAction = String(contextValue(operationActionContext(focusedOperation()), 'Command Action'));
      if (commandAction === 'read_operation_scope') { run(refreshOperation); return; }
      if (commandAction === 'start_or_select_session') { focusOperationPathSession(); return; }
      if (commandAction === 'inspect_attention') { focusOperationPathAttention(); return; }
      if (commandAction === 'inspect_open_task') { focusOperationPathTask(); return; }
      if (commandAction === 'inspect_operation_evidence' || commandAction === 'read_operation_evidence') { focusOperationPathEvidence(); return; }
      if (String(contextValue(authorityPathContext(product), 'Next Action')) !== 'monitor_authority_admissions') { focusOperationPathAuthority(); return; }
      focusOperationPathEvidence();
    }
    function renderOperationActionSummary(operation = focusedOperation()) {
      if (!operation) {
        el('operationActionSummary').innerHTML = '<div class="empty">No operation action loaded.</div>';
        return;
      }
      el('operationActionSummary').replaceChildren(
        ...operationActionContext(operation).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('operationCommandNextAction', 'Run Operation Command', applyOperationCommandAction),
          focusActionButton('operationCommandSessionAction', 'Focus Operation Session', focusOperationPathSession),
          focusActionButton('operationCommandTaskAction', 'Focus Operation Task', focusOperationPathTask),
          focusActionButton('operationCommandAuthorityAction', 'Focus Operation Authority', focusOperationPathAuthority),
          focusActionButton('operationCommandEvidenceAction', 'Focus Operation Evidence', focusOperationPathEvidence),
        ),
      );
    }
    function useFocusedOperation() {
      const operation = focusedOperation();
      if (operation?.operation_id) run(() => selectOperation(operation));
    }
    function focusOperationSession() {
      const targets = operationFlightDeckTargets();
      if (targets.session) selectOperationSession(targets.session);
    }
    function renderOperationNavigator(operations = []) {
      state.operations = operations;
      if (operations.length === 0) {
        state.operationFocus = null;
        el('operationNavigator').innerHTML = '<div class="empty">No site operations loaded.</div>';
        renderOperationPostureOverview(operations);
        renderOperationWorkQueue(operations);
        renderOperationActionSummary();
        renderOperationFocusDetail();
        renderOperationPath();
        updateControlRoom();
        return;
      }
      const activeOperation = el('operationId').value.trim();
      state.operationFocus = operations.find((operation) => operation.operation_id === activeOperation) || null;
      el('operationNavigator').replaceChildren(...operations.map((operation) => {
        const node = document.createElement('article');
        node.className = 'operation-item' + (operation.operation_id === activeOperation ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = operation.operation_id;
        const meta = document.createElement('span');
        meta.textContent = [operation.status || 'unknown', operation.operation_kind, operation.display_name].filter(Boolean).join(' | ');
        node.addEventListener('click', () => run(() => selectOperation(operation)));
        node.append(title, meta);
        return node;
      }));
      renderOperationPostureOverview(operations);
      renderOperationWorkQueue(operations);
      renderOperationActionSummary();
      renderOperationFocusDetail();
      renderOperationPath();
      updateControlRoom();
    }
    function operationWorkQueueItems(operations = state.operations || [], product = state.operationProduct || {}) {
      return operations.map((operation) => {
        const path = Object.fromEntries(operationPathContext(operation, product));
        const scopeLoaded = operationScopeLoaded(operation);
        const evidenceLoaded = operationEvidenceLoaded(operation);
        const command = classifyCloudflareOperationCommandState({
          operation_id: operation.operation_id || '',
          is_active: operation.operation_id === el('operationId').value.trim(),
          scope_loaded: scopeLoaded,
          session_count: Number(path.Sessions || 0) || 0,
          evidence_loaded: evidenceLoaded,
          operation_path_next_action: path['Next Action'] || 'read_operation_scope',
        });
        const ready = command.command_state === 'evidence_ready'
          || command.next_action === 'inspect_operation_evidence'
          || (
            command.next_action === 'use_focused_operation'
            && ['inspect_operation_evidence', 'monitor_operation'].includes(command.command_action)
          );
        return { operation, command, path, status: ready ? 'ready' : 'needs_attention' };
      }).sort((left, right) => {
        if (left.status !== right.status) return left.status === 'needs_attention' ? -1 : 1;
        if (left.operation.operation_id === el('operationId').value.trim()) return -1;
        if (right.operation.operation_id === el('operationId').value.trim()) return 1;
        return String(right.operation.updated_at || '').localeCompare(String(left.operation.updated_at || ''));
      });
    }
    function operationPostureReason(item = {}) {
      const action = item.command?.next_action || 'inspect_operation';
      if (action === 'read_operation_scope') return 'operation_scope';
      if (action === 'start_or_select_session') return 'session';
      if (action === 'inspect_attention') return 'operation_attention';
      if (action === 'inspect_open_task') return 'open_tasks';
      if (action === 'read_operation_evidence') return 'carrier_evidence';
      if (action === 'inspect_operation_evidence') return 'evidence_review';
      return action;
    }
    function operationPostureOverview(operations = state.operations || [], product = state.operationProduct || {}) {
      const provided = product.operation_posture_overview || product.operation_product_surface?.operation_posture_overview || null;
      if (provided?.schema === 'narada.cloudflare_operation_posture_overview.v1') return provided;
      const items = operationWorkQueueItems(operations, product);
      const healthCounts = { ready: 0, needs_attention: 0 };
      const actionCounts = {};
      const reasonCounts = {};
      const commandStateCounts = {};
      for (const item of items) {
        healthCounts[item.status] = (healthCounts[item.status] || 0) + 1;
        const action = item.command?.next_action || 'inspect_operation';
        const reason = operationPostureReason(item);
        const commandState = item.command?.command_state || 'not_classified';
        actionCounts[action] = (actionCounts[action] || 0) + 1;
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        commandStateCounts[commandState] = (commandStateCounts[commandState] || 0) + 1;
      }
      const activeOperationId = el('operationId').value.trim();
      const next = items.find((item) => item.status === 'needs_attention') || items.find((item) => item.operation.operation_id === activeOperationId) || items[0] || null;
      return {
        schema: 'narada.cloudflare_operation_posture_overview.v1',
        operation_count: items.length,
        health_counts: healthCounts,
        action_counts: actionCounts,
        reason_counts: reasonCounts,
        command_state_counts: commandStateCounts,
        active_operation_id: activeOperationId || null,
        next_operation_id: next?.operation?.operation_id || null,
        next_status: next?.status || 'ready',
        next_action: next?.command?.next_action || 'monitor_operations',
        next_reason: next ? operationPostureReason(next) : 'all_operations_monitoring',
      };
    }
    function renderOperationPostureOverview(operations = state.operations || [], product = state.operationProduct || {}) {
      const target = el('operationPostureOverview');
      if (!target) return;
      const overview = operationPostureOverview(operations, product);
      if (overview.operation_count === 0) {
        target.innerHTML = '<div class="empty">No operation posture loaded.</div>';
        return;
      }
      target.replaceChildren(...[
        ['Schema', overview.schema],
        ['Operations', overview.operation_count],
        ['Ready', overview.health_counts.ready ?? 0],
        ['Needs Attention', overview.health_counts.needs_attention ?? 0],
        ['Active Operation', overview.active_operation_id || 'none'],
        ['Next Operation', overview.next_operation_id || 'none'],
        ['Next Status', overview.next_status || 'ready'],
        ['Next Action', overview.next_action || 'monitor_operations'],
        ['Next Reason', overview.next_reason || 'all_operations_monitoring'],
        ['Action Counts', countMapSummary(overview.action_counts)],
        ['Reason Counts', countMapSummary(overview.reason_counts)],
        ['Command State Counts', countMapSummary(overview.command_state_counts)],
      ].map(([label, value]) => evidenceField(label, value)));
    }
    function nextOperationFromPosture(operations = state.operations || [], product = state.operationProduct || {}) {
      const overview = operationPostureOverview(operations, product);
      return operations.find((operation) => operation.operation_id === overview.next_operation_id) || operations[0] || null;
    }
    async function focusNextOperationFromPosture() {
      const operation = nextOperationFromPosture();
      if (operation) await selectOperation(operation);
    }
    function operationWorkQueueButtonId(operation, suffix) {
      return ['operationWorkQueue', operation.operation_id || 'operation', suffix].join('_').replace(/[^a-z0-9_:-]+/gi, '_');
    }
    function renderOperationWorkQueue(operations = state.operations || [], product = state.operationProduct || {}) {
      if (!operations.length) {
        el('operationWorkQueue').innerHTML = '<div class="empty">No operation work loaded.</div>';
        return;
      }
      const items = operationWorkQueueItems(operations, product);
      el('operationWorkQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (item.operation.operation_id === el('operationId').value.trim() ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.operation.operation_id || 'unknown operation';
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.command.command_state, item.command.next_action, (item.path.Sessions || '0') + ' sessions', (item.path['Open Tasks'] || '0') + ' open tasks', item.path.Attention || '0 open / 0 total'].join(' | ');
        node.addEventListener('click', () => run(() => selectOperation(item.operation)));
        node.append(
          title,
          meta,
          focusActionRow(
            focusActionButton(operationWorkQueueButtonId(item.operation, 'use'), 'Use', () => run(() => selectOperation(item.operation))),
            focusActionButton(operationWorkQueueButtonId(item.operation, 'session'), 'Session', () => { state.operationFocus = item.operation; focusOperationPathSession(); }),
            focusActionButton(operationWorkQueueButtonId(item.operation, 'evidence'), 'Evidence', () => { state.operationFocus = item.operation; focusOperationPathEvidence(); }),
          ),
        );
        return node;
      }));
    }
    function operationFocusContext(operation = {}) {
      const statusHistory = operationStatusHistory();
      return [
        ['Operation', operation.operation_id || el('operationId').value.trim() || 'none'],
        ['Display Name', operation.display_name || 'none'],
        ['Kind', operation.operation_kind || 'unknown'],
        ['Status', operation.status || 'unknown'],
        ['Status Transitions', operationStatusTransitionSummary(statusHistory)],
        ['Latest Status Transition', operationLatestStatusTransitionLabel(statusHistory)],
        ['Site', operation.site_id || el('siteId').value.trim() || 'none'],
        ['Created', operation.created_at || 'none'],
        ['Updated', operation.updated_at || 'none'],
      ];
    }
    function renderOperationFocusDetail(operation = state.operationFocus) {
      if (!operation) {
        el('operationFocusDetail').innerHTML = '<div class="empty">No operation selected.</div>';
        return;
      }
      el('operationFocusDetail').replaceChildren(
        ...operationFocusContext(operation).map(([label, value]) => evidenceField(label, value)),
        operationLifecycleActionRow(operation),
      );
    }
    function operationLifecycleActionRow(operation = focusedOperation()) {
      return focusActionRow(
        focusActionButton('operationLifecycleResume', 'Resume', () => run(() => putFocusedOperationStatus('active', 'operation_resumed_by_operator'))),
        focusActionButton('operationLifecycleResumeContinuation', 'Resume Continuation', () => run(() => resumeFocusedOperationContinuation(operation))),
        focusActionButton('operationLifecyclePause', 'Pause', () => run(() => putFocusedOperationStatus('inactive', 'operation_paused_by_operator'))),
        focusActionButton('operationLifecycleNeedsContinuation', 'Needs Continuation', () => run(() => putFocusedOperationStatus('needs_continuation', 'operation_needs_continuation_by_operator'))),
        focusActionButton('operationLifecycleArchive', 'Archive', () => run(() => putFocusedOperationStatus('closed', 'operation_closed_by_operator'))),
      );
    }
    function continuationSessionIdForOperation(operationId) {
      return 'carrier_session_' + String(operationId || 'operation').replace(/[^a-z0-9_:-]+/gi, '_') + '_' + Date.now();
    }
    async function resumeFocusedOperationContinuation(operation = focusedOperation()) {
      const operationId = operation?.operation_id || el('operationId').value.trim();
      if (!operationId) throw new Error('Operation ID is required.');
      setCurrentOperation(operationId);
      const currentStatus = operation?.status || state.operationProduct?.operation?.status || '';
      if (currentStatus === 'needs_continuation') {
        await putFocusedOperationStatus('active', 'operation_continuation_resumed_by_operator');
      }
      const carrierSessionId = continuationSessionIdForOperation(operationId);
      setCurrentSession(carrierSessionId);
      const body = await api.resumeContinuation(operationId, carrierSessionId);
      appendEvents([body.event].filter(Boolean));
      renderLastAuthority(null, {
        event_kind: 'session.start',
        action: 'operation_continuation_resumed',
        reason: 'operation_continuation_resumed_by_operator',
        evidence: {
          operation_id: operationId,
          carrier_session_id: body.carrier_session_id || carrierSessionId,
          status: currentStatus === 'needs_continuation' ? 'active' : currentStatus || null,
        },
      });
      await refreshStatus();
      await refreshOperation();
    }
    async function putFocusedOperationStatus(status, reason) {
      const operation = focusedOperation();
      const operationId = operation?.operation_id || el('operationId').value.trim();
      if (!operationId) throw new Error('Operation ID is required.');
      setCurrentOperation(operationId);
      const body = await api.putOperationStatus(status, reason);
      renderLastAuthority(null, {
        event_kind: 'operation.status.put',
        action: body.action || 'status_updated',
        reason: body.reason || reason || 'site_operation_status_updated',
        evidence: {
          operation_id: operationId,
          previous_status: body.previous_status || operation?.status || null,
          status: body.status || status,
          status_reason: body.reason || reason || null,
        },
      });
      await refreshOperation();
    }
    function operationEvents(operation = focusedOperation(), product = state.operationProduct || {}) {
      const operationId = operation?.operation_id || el('operationId').value.trim();
      if (!operationId) return [];
      const events = [...state.events, ...(product.carrier_evidence || []).flatMap((entry) => entry.events || [])];
      const seen = new Set();
      return events.filter((event) => {
        const eventOperationId = event.payload?.operation_id || event.payload?.target?.id || product.operation?.operation_id || '';
        if (eventOperationId !== operationId) return false;
        const key = eventKey(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function operationTasks(operation = focusedOperation(), product = state.operationProduct || {}) {
      const operationId = operation?.operation_id || el('operationId').value.trim();
      if (!operationId) return [];
      return (product.tasks || []).filter((task) => task.operation_id === operationId || task.site_id === (product.site?.site_id || el('siteId').value.trim()));
    }
    function operationPathContext(operation = focusedOperation(), product = state.operationProduct || {}) {
      if (!operation) return [];
      const operationId = operation.operation_id || el('operationId').value.trim();
      const sessions = (product.sessions || []).filter((session) => !session.operation_id || session.operation_id === operationId);
      const tasks = operationTasks(operation, product);
      const events = operationEvents(operation, product);
      const attention = extractOperationAttention(product).filter((item) => !item.operation_id || item.operation_id === operationId);
      const authorityDecisions = product.site_authority?.decisions || [];
      const openTasks = tasks.filter((task) => taskLifecycleStatus(task) === 'open');
      const openAttention = attention.filter((item) => item.status !== 'resolved');
      const nextAction = !operationId ? 'select_or_create_operation'
        : state.productScope !== 'operation' ? 'read_operation_scope'
        : sessions.length === 0 ? 'start_or_select_session'
        : openAttention.length > 0 ? 'inspect_attention'
        : openTasks.length > 0 ? 'inspect_open_task'
        : events.length > 0 ? 'inspect_operation_evidence' : 'read_operation_evidence';
      return [
        ['Operation', operationId || 'none'],
        ['Scope', state.productScope],
        ['Status', operation.status || product.operation?.status || 'unknown'],
        ['Sessions', String(sessions.length)],
        ['Tasks', String(tasks.length)],
        ['Open Tasks', String(openTasks.length)],
        ['Attention', String(openAttention.length) + ' open / ' + String(attention.length) + ' total'],
        ['Evidence Events', String(events.length)],
        ['Authority Decisions', String(authorityDecisions.length)],
        ['Focused Session', state.sessionFocus?.carrier_session_id || el('sessionId').value.trim() || 'none'],
        ['Focused Task', state.taskFocus?.task_id || 'none'],
        ['Next Action', nextAction],
      ];
    }
    function renderOperationPath(operation = focusedOperation(), product = state.operationProduct || {}) {
      const target = el('operationPath');
      if (!target) return;
      if (!operation) {
        target.innerHTML = '<div class="empty">No operation path loaded.</div>';
        return;
      }
      target.replaceChildren(...operationPathContext(operation, product).map(([label, value]) => evidenceField(label, value)));
    }
    function focusOperationPathSession() {
      const targets = operationFlightDeckTargets();
      if (targets.session) selectOperationSession(targets.session);
    }
    function focusOperationPathTask() {
      const task = operationTasks(focusedOperation()).find((entry) => taskLifecycleStatus(entry) === 'open') || operationTasks(focusedOperation())[0] || null;
      if (task) selectTask(task);
    }
    function focusOperationPathAttention() {
      const attention = extractOperationAttention(state.operationProduct || {}).find((item) => item.status !== 'resolved') || state.attentionItems[0] || null;
      if (attention) selectAttentionItem(attention);
    }
    function focusOperationPathAuthority() {
      focusAuthorityPathDecision();
    }
    function focusOperationPathEvidence() {
      const operationId = focusedOperation()?.operation_id || el('operationId').value.trim();
      focusEvidenceFor((event) => (event.payload?.operation_id || event.payload?.target?.id || state.operationProduct?.operation?.operation_id) === operationId);
    }
    function selectOperationSession(session) {
      if (!session?.carrier_session_id) return;
      state.sessionFocus = session;
      setCurrentSession(session.carrier_session_id);
      focusEvidenceFor((event) => event.carrier_session_id === session.carrier_session_id);
      renderSessionActionSummary(session);
      renderSessionEvidencePath(session);
      updateControlRoom();
    }
    function renderSessionNavigator(sessions = []) {
      if (sessions.length === 0) {
        state.sessionFocus = null;
        el('sessionNavigator').innerHTML = '<div class="empty">No operation sessions loaded.</div>';
        renderSessionWorkQueue(sessions);
        renderSessionActionSummary();
        renderSessionFocusDetail();
        renderSessionEvidencePath();
        updateControlRoom();
        return;
      }
      const activeSession = el('sessionId').value.trim();
      state.sessionFocus = sessions.find((session) => session.carrier_session_id === activeSession) || null;
      el('sessionNavigator').replaceChildren(...sessions.map((session) => {
        const node = document.createElement('article');
        node.className = 'session-item' + (session.carrier_session_id === activeSession ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = session.carrier_session_id;
        const meta = document.createElement('span');
        meta.textContent = [session.binding_status || 'active', session.agent_id, session.operation_id].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectOperationSession(session));
        node.append(title, meta);
        return node;
      }));
      renderSessionWorkQueue(sessions);
      renderSessionActionSummary();
      renderSessionFocusDetail();
      renderSessionEvidencePath();
      updateControlRoom();
    }
    function sessionWorkQueueItems(sessions = state.operationProduct?.sessions || [], product = state.operationProduct || {}) {
      return sessions.map((session) => {
        const events = sessionEvidenceEvents(session, product);
        const tasks = sessionTasks(session, product);
        const openTasks = tasks.filter((task) => taskLifecycleStatus(task) === 'open');
        const failures = events.filter((event) => classifyEvidenceLane(event) === 'failures');
        const delivery = directiveDeliveryForSession(session, product);
        const command = classifyCloudflareSessionCommandState({
          session_id: session.carrier_session_id || '',
          is_active: session.carrier_session_id === el('sessionId').value.trim(),
          evidence_loaded: events.length > 0,
        });
        const ready = events.length > 0 && failures.length === 0 && openTasks.length === 0;
        const nextAction = events.length === 0 ? 'read_session_evidence'
          : failures.length > 0 ? 'inspect_session_failures'
          : openTasks.length > 0 ? 'inspect_open_task'
          : delivery ? 'inspect_directive_delivery'
          : command.next_action;
        return { session, command, events, tasks, open_tasks: openTasks, failures, delivery, status: ready ? 'ready' : 'needs_attention', next_action: nextAction };
      }).sort((left, right) => {
        if (left.status !== right.status) return left.status === 'needs_attention' ? -1 : 1;
        if (left.open_tasks.length !== right.open_tasks.length) return right.open_tasks.length - left.open_tasks.length;
        return String(right.session.updated_at || '').localeCompare(String(left.session.updated_at || ''));
      });
    }
    function sessionWorkQueueButtonId(session, suffix) {
      return ['sessionWorkQueue', session.carrier_session_id || 'session', suffix].join('_').replace(/[^a-z0-9_:-]+/gi, '_');
    }
    function renderSessionWorkQueue(sessions = state.operationProduct?.sessions || [], product = state.operationProduct || {}) {
      if (!sessions.length) {
        el('sessionWorkQueue').innerHTML = '<div class="empty">No session work loaded.</div>';
        return;
      }
      const items = sessionWorkQueueItems(sessions, product);
      el('sessionWorkQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (item.session.carrier_session_id === el('sessionId').value.trim() ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.session.carrier_session_id || 'unknown session';
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.command.command_state, item.next_action, String(item.events.length) + ' events', String(item.open_tasks.length) + ' open tasks', item.delivery?.delivery_state || 'no delivery'].join(' | ');
        node.addEventListener('click', () => selectOperationSession(item.session));
        node.append(
          title,
          meta,
          focusActionRow(
            focusActionButton(sessionWorkQueueButtonId(item.session, 'use'), 'Use', () => selectOperationSession(item.session)),
            focusActionButton(sessionWorkQueueButtonId(item.session, 'evidence'), 'Evidence', () => { selectOperationSession(item.session); focusFocusedSessionEvidence(); }),
            focusActionButton(sessionWorkQueueButtonId(item.session, 'task'), 'Task', () => { selectOperationSession(item.session); focusSessionPathTask(); }),
          ),
        );
        return node;
      }));
    }
    function focusedSession() {
      const activeSession = el('sessionId').value.trim();
      return state.sessionFocus
        || (state.operationProduct?.sessions || []).find((session) => session.carrier_session_id === activeSession)
        || (activeSession ? { carrier_session_id: activeSession } : null);
    }
    function sessionEvidenceLoaded(session = focusedSession()) {
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim();
      if (!sessionId) return false;
      return state.events.some((event) => event.carrier_session_id === sessionId)
        || (state.operationProduct?.carrier_evidence || []).some((entry) => entry.carrier_session_id === sessionId && (entry.events || []).length > 0);
    }
    function sessionActionContext(session = focusedSession()) {
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim() || '';
      const isActive = sessionId && sessionId === el('sessionId').value.trim();
      const hasEvidence = sessionEvidenceLoaded(session);
      const command = classifyCloudflareSessionCommandState({
        session_id: sessionId,
        is_active: Boolean(isActive),
        evidence_loaded: hasEvidence,
      });
      return [
        ['Session', sessionId || 'none'],
        ['Active', isActive ? 'yes' : 'no'],
        ['Status', session?.binding_status || session?.status || 'active'],
        ['Agent', session?.agent_id || 'none'],
        ['Operation', session?.operation_id || el('operationId').value.trim() || 'none'],
        ['Evidence Loaded', hasEvidence ? 'yes' : 'no'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
      ];
    }
    function renderSessionActionSummary(session = focusedSession()) {
      if (!session) {
        el('sessionActionSummary').innerHTML = '<div class="empty">No session action loaded.</div>';
        renderSessionEvidenceControl();
        return;
      }
      el('sessionActionSummary').replaceChildren(...sessionActionContext(session).map(([label, value]) => evidenceField(label, value)));
      renderSessionEvidenceControl(session);
    }
    function useFocusedSession() {
      const session = focusedSession();
      if (session?.carrier_session_id) selectOperationSession(session);
    }
    function focusFocusedSessionEvidence() {
      const session = focusedSession();
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim();
      if (sessionId) focusEvidenceFor((event) => event.carrier_session_id === sessionId);
    }
    function sessionFocusContext(session = {}) {
      const currentSession = session.carrier_session_id || el('sessionId').value.trim() || '';
      const hasEvidence = state.events.some((event) => event.carrier_session_id === currentSession)
        || (state.operationProduct?.carrier_evidence || []).some((entry) => entry.carrier_session_id === currentSession && (entry.events || []).length > 0);
      const followUp = currentSession
        ? (hasEvidence ? 'inspect_session_evidence' : 'read_session_evidence')
        : 'select_or_start_session';
      return [
        ['Session', currentSession || 'none'],
        ['Status', session.binding_status || session.status || 'active'],
        ['Agent', session.agent_id || 'none'],
        ['Operation', session.operation_id || el('operationId').value.trim() || 'none'],
        ['Site', session.site_id || el('siteId').value.trim() || 'none'],
        ['Site Ref', session.site_ref || 'none'],
        ['Site Root', session.site_root || 'none'],
        ['Started', session.started_at || session.created_at || 'none'],
        ['Updated', session.updated_at || 'none'],
        ['Follow Up', followUp],
      ];
    }
    function renderSessionFocusDetail(session = state.sessionFocus) {
      if (!session) {
        el('sessionFocusDetail').innerHTML = '<div class="empty">No session selected.</div>';
        renderSessionEvidenceControl();
        return;
      }
      renderSessionEvidenceControl(session);
      el('sessionFocusDetail').replaceChildren(
        ...sessionFocusContext(session).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('sessionFocusReadEvidenceAction', 'Read Evidence', () => run(readSelectedSessionEvidence)),
          focusActionButton('sessionFocusEvidenceAction', 'Focus Evidence', () => focusEvidenceFor((event) => event.carrier_session_id === (session.carrier_session_id || el('sessionId').value.trim()))),
        ),
      );
    }
    function sessionEvidenceEvents(session = focusedSession(), product = state.operationProduct || {}) {
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim();
      if (!sessionId) return [];
      const events = [...state.events, ...(product.carrier_evidence || []).flatMap((entry) => entry.events || [])];
      const seen = new Set();
      return events.filter((event) => {
        if (event.carrier_session_id !== sessionId) return false;
        const key = eventKey(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function sessionTasks(session = focusedSession(), product = state.operationProduct || {}) {
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim();
      if (!sessionId) return [];
      return (product.tasks || []).filter((task) => task.carrier_session_id === sessionId || taskEvidenceEvents(task, product).some((event) => event.carrier_session_id === sessionId));
    }
    function directiveDeliveryForSession(session = focusedSession(), product = state.operationProduct || {}) {
      const sessionId = session?.carrier_session_id || el('sessionId').value.trim();
      if (!sessionId) return null;
      return (product.webhook_delay_directive_deliveries || []).find((delivery) => delivery.carrier_session_id === sessionId) || null;
    }
    function sessionEvidencePathContext(session = focusedSession(), product = state.operationProduct || {}) {
      if (!session) return [];
      const sessionId = session.carrier_session_id || el('sessionId').value.trim();
      const events = sessionEvidenceEvents(session, product);
      const tasks = sessionTasks(session, product);
      const delivery = directiveDeliveryForSession(session, product);
      const providerEvents = events.filter((event) => classifyEvidenceLane(event) === 'provider');
      const toolEvents = events.filter((event) => classifyEvidenceLane(event) === 'tools');
      const failureEvents = events.filter((event) => classifyEvidenceLane(event) === 'failures');
      const nextAction = !sessionId ? 'select_or_start_session'
        : events.length === 0 ? 'read_session_evidence'
        : failureEvents.length > 0 ? 'inspect_session_failures'
        : tasks.some((task) => taskLifecycleStatus(task) === 'open') ? 'inspect_open_task'
        : delivery ? 'inspect_directive_delivery' : 'monitor_session_evidence';
      return [
        ['Session', sessionId || 'none'],
        ['Events', String(events.length)],
        ['Provider Events', String(providerEvents.length)],
        ['Tool Events', String(toolEvents.length)],
        ['Failure Events', String(failureEvents.length)],
        ['Tasks', String(tasks.length)],
        ['Open Tasks', String(tasks.filter((task) => taskLifecycleStatus(task) === 'open').length)],
        ['Directive Delivery', delivery?.delivery_id || delivery?.directive_delivery_id || 'none'],
        ['Delivery State', delivery?.delivery_state || 'unknown'],
        ['Agent', session.agent_id || 'none'],
        ['Operation', session.operation_id || el('operationId').value.trim() || 'none'],
        ['Next Action', nextAction],
      ];
    }
    function renderSessionEvidencePath(session = focusedSession(), product = state.operationProduct || {}) {
      if (!session) {
        el('sessionEvidencePath').innerHTML = '<div class="empty">No session evidence path loaded.</div>';
        renderSessionEvidenceControl();
        return;
      }
      el('sessionEvidencePath').replaceChildren(...sessionEvidencePathContext(session, product).map(([label, value]) => evidenceField(label, value)));
      renderSessionEvidenceControl(session, product);
    }
    function sessionEvidenceControlContext(session = focusedSession(), product = state.operationProduct || {}) {
      if (!session) return [];
      const path = Object.fromEntries(sessionEvidencePathContext(session, product));
      const events = Number(path.Events || 0);
      const failures = Number(path['Failure Events'] || 0);
      const openTasks = Number(path['Open Tasks'] || 0);
      const delivery = path['Directive Delivery'] || 'none';
      const nextAction = path['Next Action'] || 'select_or_start_session';
      const reviewAction = nextAction === 'read_session_evidence' ? 'read_session_evidence'
        : failures > 0 ? 'review_session_failures'
        : openTasks > 0 ? 'review_session_open_task'
        : delivery !== 'none' ? 'review_session_delivery'
        : 'monitor_session_evidence';
      return [
        ['Session', path.Session || session.carrier_session_id || 'none'],
        ['Events', String(events)],
        ['Provider Events', path['Provider Events'] || '0'],
        ['Tool Events', path['Tool Events'] || '0'],
        ['Failure Events', String(failures)],
        ['Open Tasks', String(openTasks)],
        ['Directive Delivery', delivery],
        ['Delivery State', path['Delivery State'] || 'unknown'],
        ['Next Action', nextAction],
        ['Review Action', reviewAction],
      ];
    }
    function renderSessionEvidenceControl(session = focusedSession(), product = state.operationProduct || {}) {
      const context = sessionEvidenceControlContext(session, product);
      if (!context.length) {
        el('sessionEvidenceControl').innerHTML = '<div class="empty">No session evidence control loaded.</div>';
        return;
      }
      el('sessionEvidenceControl').replaceChildren(...context.map(([label, value]) => evidenceField(label, value)));
    }
    async function applySessionEvidenceAction() {
      const session = focusedSession();
      if (!session) return;
      useFocusedSession();
      const action = contextValue(sessionEvidenceControlContext(session), 'Review Action');
      if (action === 'read_session_evidence') { await readSelectedSessionEvidence(); return; }
      if (action === 'review_session_open_task') { focusSessionPathTask(); return; }
      if (action === 'review_session_delivery') { focusSessionPathDelivery(); return; }
      focusSessionPathEvidence();
    }
    function focusSessionPathEvidence() {
      focusFocusedSessionEvidence();
    }
    function focusSessionPathTask() {
      const task = sessionTasks(focusedSession()).find((entry) => taskLifecycleStatus(entry) === 'open') || sessionTasks(focusedSession())[0] || null;
      if (task) selectTask(task);
    }
    function focusSessionPathDelivery() {
      const delivery = directiveDeliveryForSession(focusedSession());
      if (delivery) selectWebhookDelayDirectiveDelivery(delivery);
    }
    function focusSessionPathChain() {
      focusSessionPathDelivery();
      renderWebhookDelayEvidenceChain();
    }
    function activeSessionDetail() {
      const activeSession = el('sessionId').value.trim();
      if (!activeSession) return null;
      return (state.operationProduct?.sessions || []).find((session) => session.carrier_session_id === activeSession)
        || (state.sessionFocus?.carrier_session_id === activeSession ? state.sessionFocus : null)
        || { carrier_session_id: activeSession };
    }
    function renderActiveSessionDetail(session = activeSessionDetail()) {
      if (!session) {
        el('activeSessionDetail').innerHTML = '<div class="empty">No active session loaded.</div>';
        return;
      }
      el('activeSessionDetail').replaceChildren(...sessionFocusContext(session).map(([label, value]) => evidenceField(label, value)));
    }
    async function readSelectedSessionEvidence() {
      state.events = [];
      state.afterSequence = 0;
      state.evidenceFocus = null;
      renderEvents();
      const body = await api.readSessionEvidence();
      appendEvents(body.events || []);
      if ((body.events || []).length > 0) focusEvidence(body.events[0]);
      renderSessionActionSummary();
      renderSessionEvidencePath();
      await refreshStatus();
    }
    function membershipKey(membership = {}) {
      return membership.principal_id || membership.email || membership.member_principal_id || '';
    }
    function selectMembership(membership) {
      if (!membership) return;
      state.membershipFocus = membership;
      if (membership.principal_id) el('memberPrincipalId').value = membership.principal_id;
      if (membership.role) el('memberRole').value = membership.role;
      renderMembershipNavigator(currentMemberships(state.operationProduct || {}));
      renderSiteActionSummary();
      renderMembershipActionSummary();
      updateControlRoom();
    }
    function currentMemberships(product = {}) {
      const memberships = product.memberships || [];
      if (memberships.length > 0) return memberships;
      return [product.membership].filter(Boolean);
    }
    function renderMembershipNavigator(memberships = []) {
      if (memberships.length === 0) {
        state.membershipFocus = null;
        el('membershipNavigator').innerHTML = '<div class="empty">No memberships loaded.</div>';
        renderSiteActionSummary();
        renderMembershipActionSummary();
        renderMembershipFocusDetail();
        return;
      }
      if (state.membershipFocus) state.membershipFocus = memberships.find((membership) => membershipKey(membership) === membershipKey(state.membershipFocus)) || state.membershipFocus;
      if (!state.membershipFocus) state.membershipFocus = memberships[0];
      el('membershipNavigator').replaceChildren(...memberships.map((membership) => {
        const node = document.createElement('article');
        node.className = 'membership-item' + (membershipKey(membership) === membershipKey(state.membershipFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = membership.principal_id || membership.email || 'unknown principal';
        const meta = document.createElement('span');
        meta.textContent = [membership.role || 'unknown', membership.status || 'unknown'].join(' | ');
        node.addEventListener('click', () => selectMembership(membership));
        node.append(title, meta);
        return node;
      }));
      renderSiteActionSummary();
      renderMembershipActionSummary();
      renderMembershipFocusDetail();
    }
    function focusedMembership() {
      const principalId = el('memberPrincipalId').value.trim();
      return state.membershipFocus
        || currentMemberships(state.operationProduct || {}).find((membership) => membershipKey(membership) === principalId || membership.principal_id === principalId)
        || (principalId ? { principal_id: principalId, role: el('memberRole').value.trim() || 'viewer' } : null);
    }
    function membershipAuthorityLoaded(membership = focusedMembership()) {
      const principal = membership?.principal_id || membership?.email || el('memberPrincipalId').value.trim();
      if (!principal) return false;
      return (state.operationProduct?.authority_events || []).some((event) => JSON.stringify(event).includes(principal))
        || (state.operationProduct?.site_authority?.decisions || []).some((decision) => JSON.stringify(decision).includes(principal))
        || state.events.some((event) => classifyEvidenceLane(event) === 'authority' && JSON.stringify(event.payload || {}).includes(principal));
    }
    function membershipActionContext(membership = focusedMembership()) {
      const principal = membership?.principal_id || membership?.email || el('memberPrincipalId').value.trim() || '';
      const role = membership?.role || el('memberRole').value.trim() || 'viewer';
      const status = membership?.status || 'unknown';
      const memberships = currentMemberships(state.operationProduct || {});
      const known = Boolean(principal && memberships.some((item) => membershipKey(item) === membershipKey(membership) || item.principal_id === principal || item.email === principal));
      const isOperator = principal && (principal === state.operatorPrincipal?.principal_id || principal === state.operatorPrincipal?.email);
      const siteLoaded = siteScopeLoaded();
      const authorityLoaded = membershipAuthorityLoaded(membership);
      const command = classifyCloudflareMembershipCommandState({
        principal,
        site_loaded: siteLoaded,
        known,
        status,
        authority_loaded: authorityLoaded,
      });
      return [
        ['Principal', principal || 'none'],
        ['Role', role || 'unknown'],
        ['Status', status],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Known Membership', known ? 'yes' : 'no'],
        ['Operator Principal', isOperator ? 'yes' : 'no'],
        ['Site Scope Loaded', siteLoaded ? 'yes' : 'no'],
        ['Authority Loaded', authorityLoaded ? 'yes' : 'no'],
        ['Next Action', command.next_action],
      ];
    }
    function renderMembershipActionSummary(membership = focusedMembership()) {
      if (!membership) {
        el('membershipActionSummary').innerHTML = '<div class="empty">No membership action loaded.</div>';
        return;
      }
      el('membershipActionSummary').replaceChildren(...membershipActionContext(membership).map(([label, value]) => evidenceField(label, value)));
    }
    async function putFocusedMembership() {
      const principalId = el('memberPrincipalId').value.trim();
      const role = el('memberRole').value.trim();
      if (!principalId || !role) return;
      const result = await api.putMembership(principalId, role);
      renderLastAuthority(null, {
        event_kind: 'site.membership.put',
        principal_id: result.principal?.principal_id || result.reader_principal?.principal_id || result.principal?.email,
        action: result.action,
        reason: result.action,
        evidence: {
          member_principal_id: result.membership?.principal_id,
          role: result.membership?.role,
          status: result.membership?.status,
          actor_role: result.actor_membership?.role,
        },
      });
      await refreshOperation();
    }
    function focusMembershipAuthority() {
      const membership = focusedMembership();
      const principal = membership?.principal_id || membership?.email || el('memberPrincipalId').value.trim();
      if (!principal) { focusAuthorityEvidence(); return; }
      focusEvidenceFor((event) => classifyEvidenceLane(event) === 'authority' && JSON.stringify(event.payload || {}).includes(principal));
    }
    function membershipFocusContext(membership = {}) {
      return [
        ['Principal', membership.principal_id || membership.email || 'none'],
        ['Role', membership.role || 'unknown'],
        ['Status', membership.status || 'unknown'],
        ['Site', membership.site_id || el('siteId').value.trim() || 'none'],
        ['Created', membership.created_at || 'none'],
        ['Updated', membership.updated_at || 'none'],
      ];
    }
    function renderMembershipFocusDetail(membership = state.membershipFocus) {
      if (!membership) {
        el('membershipFocusDetail').innerHTML = '<div class="empty">No membership selected.</div>';
        renderMembershipActionSummary();
        return;
      }
      renderMembershipActionSummary(membership);
      el('membershipFocusDetail').replaceChildren(...membershipFocusContext(membership).map(([label, value]) => evidenceField(label, value)));
    }
    function renderTasks(tasks = []) {
      el('taskCount').textContent = String(tasks.length);
      if (tasks.length === 0) {
        state.taskFocus = null;
        el('tasks').innerHTML = '<div class="empty">No tasks yet.</div>';
        renderTaskWorkQueue(tasks);
        renderTaskLifecycleSummary(tasks);
        renderTaskFocusDetail();
        renderTaskEvidencePath();
        updateControlRoom();
        return;
      }
      if (state.taskFocus) state.taskFocus = tasks.find((task) => task.task_id === state.taskFocus.task_id) || state.taskFocus;
      el('tasks').replaceChildren(...tasks.map((task) => {
        const node = document.createElement('article');
        node.className = 'task' + (state.taskFocus?.task_id === task.task_id ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = task.task_id + ' ' + task.title;
        const meta = document.createElement('span');
        meta.textContent = [task.status, task.carrier_session_id, task.note].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectTask(task));
        node.append(title, meta);
        return node;
      }));
      renderTaskWorkQueue(tasks);
      renderTaskLifecycleSummary(tasks);
      renderTaskFocusDetail();
      renderTaskEvidencePath();
      renderTaskCommandPreview();
      updateControlRoom();
    }
    function taskWorkQueueItems(tasks = state.operationProduct?.tasks || []) {
      return tasks.map((task) => {
        const evidenceCount = taskEvidenceEvents(task).length;
        const command = classifyCloudflareTaskCommandState({ task_id: task.task_id || '', status: task.status, evidence_count: evidenceCount });
        const ready = command.lifecycle === 'closed' && evidenceCount > 0;
        return {
          task,
          lifecycle: command.lifecycle,
          command_state: command.command_state,
          command_action: command.command_action,
          next_action: command.next_action,
          evidence_count: evidenceCount,
          status: ready ? 'ready' : 'needs_attention',
        };
      }).sort((left, right) => {
        if (left.status !== right.status) return left.status === 'needs_attention' ? -1 : 1;
        if (left.lifecycle !== right.lifecycle) return left.lifecycle === 'open' ? -1 : 1;
        return String(right.task.updated_at || '').localeCompare(String(left.task.updated_at || ''));
      });
    }
    function taskWorkQueueButtonId(task, suffix) {
      return ['taskWorkQueue', task.task_id || 'task', suffix].join('_').replace(/[^a-z0-9_:-]+/gi, '_');
    }
    function renderTaskWorkQueue(tasks = state.operationProduct?.tasks || []) {
      if (!tasks.length) {
        el('taskWorkQueue').innerHTML = '<div class="empty">No task work loaded.</div>';
        return;
      }
      const items = taskWorkQueueItems(tasks);
      el('taskWorkQueue').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (state.taskFocus?.task_id === item.task.task_id ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.task.task_id, item.task.title || 'untitled'].filter(Boolean).join(' | ');
        const meta = document.createElement('span');
        meta.textContent = [item.status, item.lifecycle, item.command_state, item.next_action, String(item.evidence_count) + ' evidence'].join(' | ');
        node.addEventListener('click', () => selectTask(item.task));
        const markLabel = item.lifecycle === 'open' ? 'Mark Done' : 'Mark Open';
        const markStatus = item.lifecycle === 'open' ? 'done' : 'open';
        node.append(
          title,
          meta,
          focusActionRow(
            focusActionButton(taskWorkQueueButtonId(item.task, 'focus'), 'Focus', () => selectTask(item.task)),
            focusActionButton(taskWorkQueueButtonId(item.task, 'evidence'), 'Evidence', () => { selectTask(item.task); focusTaskPathEvidence(); }),
            focusActionButton(taskWorkQueueButtonId(item.task, 'mark'), markLabel, () => run(async () => { selectTask(item.task); await updateFocusedTask(markStatus, el('updateTaskNote').value.trim() || 'operator_route_task_queue'); })),
          ),
        );
        return node;
      }));
    }
    function taskCommandPreviewContext() {
      const newTitle = el('taskTitle').value.trim();
      const selectedTask = selectedTaskFromWorkbench();
      const status = el('updateTaskStatus').value.trim();
      const note = el('updateTaskNote').value.trim();
      const activeSession = el('sessionId').value.trim();
      const attention = selectedAttention();
      const directiveIntent = state.webhookDelayDirectiveFocus;
      const directiveDelivery = state.webhookDelayDirectiveDeliveryFocus;
      const directiveTask = taskForDirectiveIntent(directiveIntent);
      const command = newTitle
        ? '/task create ' + newTitle
        : selectedTask?.task_id && status
          ? ['/task update', selectedTask.task_id, status, note].filter(Boolean).join(' ')
          : 'none';
      const effect = newTitle
        ? 'create_task_for_operation'
        : selectedTask?.task_id && status
          ? 'update_task_lifecycle_state'
          : 'prepare_task_command';
      const followUp = newTitle
        ? 'create_then_select_task'
        : selectedTask?.task_id
          ? (taskLifecycleStatus(selectedTask) === 'open' ? 'mark_done_or_update' : 'inspect_task_evidence')
          : attention
            ? 'create_task_from_attention'
            : directiveIntent && !directiveTask
              ? 'create_task_from_directive_intent'
            : 'select_or_create_task';
      return [
        ['Command', command],
        ['Effect', effect],
        ['Task', selectedTask?.task_id || 'none'],
        ['Status', status || selectedTask?.status || 'none'],
        ['Session', selectedTask?.carrier_session_id || activeSession || 'none'],
        ['Attention', attention?.directive_id || 'none'],
        ['Directive Intent', directiveIntent?.directive_record_id || 'none'],
        ['Directive Delivery', directiveDelivery?.delivery_id || directiveDelivery?.directive_delivery_id || 'none'],
        ['Directive Delivery Session', directiveDelivery?.carrier_session_id || 'none'],
        ['Directive Task', directiveTask?.task_id || 'none'],
        ['Note', note || selectedTask?.note || 'none'],
        ['Follow Up', followUp],
      ];
    }
    function renderTaskCommandPreview() {
      el('taskCommandPreview').replaceChildren(...taskCommandPreviewContext().map(([label, value]) => evidenceField(label, value)));
    }
    async function createTaskFromWorkbench() {
      const title = el('taskTitle').value.trim();
      if (!title) return;
      const body = await api.createTask(title);
      appendEvents(body.events || []);
      el('taskTitle').value = '';
      await refreshStatus();
      await refreshOperation();
    }
    function taskLifecycleStatus(task = {}) {
      const status = String(task.status || '').toLowerCase();
      if (status === 'open' || status === 'todo' || status === 'pending') return 'open';
      if (status === 'done' || status === 'resolved' || status === 'closed') return 'closed';
      return status || 'unknown';
    }
    function taskLifecycleSummary(tasks = []) {
      const counts = tasks.reduce((next, task) => {
        const status = taskLifecycleStatus(task);
        if (status === 'open') next.open += 1;
        else if (status === 'closed') next.closed += 1;
        else next.other += 1;
        return next;
      }, { open: 0, closed: 0, other: 0 });
      const focusStatus = state.taskFocus ? taskLifecycleStatus(state.taskFocus) : 'none';
      const command = classifyCloudflareTaskCommandState({
        task_id: state.taskFocus?.task_id || '',
        lifecycle: focusStatus,
        evidence_count: taskEvidenceEvents(state.taskFocus).length,
      });
      const nextTask = tasks.find((task) => taskLifecycleStatus(task) === 'open') || state.taskFocus || tasks[0] || null;
      return [
        ['Open', counts.open],
        ['Closed', counts.closed],
        ['Other', counts.other],
        ['Focused Status', focusStatus],
        ['Next Task', nextTask?.task_id || 'none'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
      ];
    }
    function renderTaskLifecycleSummary(tasks = state.operationProduct?.tasks || []) {
      if (!tasks.length) {
        el('taskLifecycleSummary').innerHTML = '<div class="empty">No task lifecycle loaded.</div>';
        renderTaskLifecycleControl();
        return;
      }
      el('taskLifecycleSummary').replaceChildren(...taskLifecycleSummary(tasks).map(([label, value]) => evidenceField(label, value)));
      renderTaskLifecycleControl(selectedTaskFromWorkbench() || tasks.find((task) => taskLifecycleStatus(task) === 'open') || tasks[0] || null);
    }
    function taskLifecycleControlContext(task = selectedTaskFromWorkbench(), product = state.operationProduct || {}) {
      const target = task || (product.tasks || []).find((entry) => taskLifecycleStatus(entry) === 'open') || (product.tasks || [])[0] || null;
      if (!target) return [];
      const evidenceEvents = taskEvidenceEvents(target, product);
      const command = classifyCloudflareTaskCommandState({ task_id: target.task_id || '', status: target.status, evidence_count: evidenceEvents.length });
      const lifecycleAction = command.next_action === 'mark_done_or_update' ? 'mark_task_done'
        : command.next_action === 'reopen_or_inspect_evidence' ? (evidenceEvents.length > 0 ? 'inspect_task_evidence' : 'reopen_task')
        : command.next_action === 'normalize_status_or_update' ? 'normalize_task_open'
        : command.next_action === 'select_task' ? 'select_next_task'
        : command.next_action || 'inspect_task';
      return [
        ['Task', target.task_id || 'none'],
        ['Lifecycle', command.lifecycle],
        ['Status', target.status || 'unknown'],
        ['Evidence Events', String(evidenceEvents.length)],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
        ['Lifecycle Action', lifecycleAction],
        ['Session', target.carrier_session_id || directiveDeliveryForTask(target, product)?.carrier_session_id || 'none'],
        ['Note', target.note || 'none'],
      ];
    }
    function renderTaskLifecycleControl(task = selectedTaskFromWorkbench()) {
      const context = taskLifecycleControlContext(task);
      if (!context.length) {
        el('taskLifecycleControl').innerHTML = '<div class="empty">No task lifecycle control loaded.</div>';
        return;
      }
      el('taskLifecycleControl').replaceChildren(...context.map(([label, value]) => evidenceField(label, value)));
    }
    async function applyTaskLifecycleAction() {
      const product = state.operationProduct || {};
      const task = selectedTaskFromWorkbench() || (product.tasks || []).find((entry) => taskLifecycleStatus(entry) === 'open') || (product.tasks || [])[0] || null;
      if (!task) return;
      selectTask(task);
      const action = contextValue(taskLifecycleControlContext(task, product), 'Lifecycle Action');
      if (action === 'mark_task_done') { await updateFocusedTask('done', el('updateTaskNote').value.trim() || 'operator_lifecycle_mark_done'); return; }
      if (action === 'reopen_task' || action === 'normalize_task_open') { await updateFocusedTask('open', el('updateTaskNote').value.trim() || 'operator_lifecycle_mark_open'); return; }
      if (action === 'inspect_task_evidence') { focusTaskPathEvidence(); return; }
      focusTaskLifecyclePath();
    }
    function directiveIntentForTask(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) return null;
      return (product.webhook_delay_directive_records || []).find((record) => directiveIntentTaskPredicate(record)(task)) || null;
    }
    function directiveDeliveryForTask(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) return null;
      const directiveIntent = directiveIntentForTask(task, product);
      const directiveRecordId = directiveIntent?.directive_record_id || directiveIntent?.directive_intent?.directive_id || '';
      return (product.webhook_delay_directive_deliveries || []).find((delivery) => (
        (directiveRecordId && delivery.directive_record_id === directiveRecordId)
        || (task.carrier_session_id && delivery.carrier_session_id === task.carrier_session_id)
      )) || null;
    }
    function taskEvidenceEvents(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) return [];
      const predicate = taskEvidencePredicate(task);
      const events = [...state.events, ...(product.carrier_evidence || []).flatMap((entry) => entry.events || [])];
      const seen = new Set();
      return events.filter((event) => {
        if (!predicate(event)) return false;
        const key = eventKey(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function taskEvidencePathContext(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) return [];
      const directiveIntent = directiveIntentForTask(task, product);
      const directiveDelivery = directiveDeliveryForTask(task, product);
      const sessionId = task.carrier_session_id || directiveDelivery?.carrier_session_id || el('sessionId').value.trim();
      const session = (product.sessions || []).find((entry) => entry.carrier_session_id === sessionId) || null;
      const sessionEvidence = (product.carrier_evidence || []).find((entry) => entry.carrier_session_id === sessionId) || null;
      const evidenceEvents = taskEvidenceEvents(task, product);
      const command = classifyCloudflareTaskCommandState({ task_id: task.task_id || '', status: task.status, evidence_count: evidenceEvents.length });
      return [
        ['Task', task.task_id || 'none'],
        ['Lifecycle', command.lifecycle],
        ['Session', sessionId || 'none'],
        ['Session Status', session?.binding_status || session?.status || 'unknown'],
        ['Session Evidence Events', sessionEvidence ? String((sessionEvidence.events || []).length) : 'not loaded'],
        ['Task Evidence Events', String(evidenceEvents.length)],
        ['Directive Intent', directiveIntent?.directive_record_id || directiveIntent?.directive_intent?.directive_id || 'none'],
        ['Directive Delivery', directiveDelivery?.delivery_id || directiveDelivery?.directive_delivery_id || 'none'],
        ['Delivery State', directiveDelivery?.delivery_state || 'unknown'],
        ['Effect Scope', task.source || 'unknown'],
        ['Authority Path', [directiveIntent?.directive_authority, directiveDelivery?.dispatch_authority, directiveDelivery?.fallback_authority].filter(Boolean).join(' -> ') || 'unknown'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Next Action', command.next_action],
      ];
    }
    function renderTaskEvidencePath(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) {
        el('taskEvidencePath').innerHTML = '<div class="empty">No task evidence path loaded.</div>';
        return;
      }
      el('taskEvidencePath').replaceChildren(...taskEvidencePathContext(task, product).map(([label, value]) => evidenceField(label, value)));
    }
    function focusTaskPathSession() {
      const task = selectedTaskFromWorkbench();
      if (!task) return;
      const delivery = directiveDeliveryForTask(task);
      const sessionId = task.carrier_session_id || delivery?.carrier_session_id || '';
      const session = (state.operationProduct?.sessions || []).find((entry) => entry.carrier_session_id === sessionId) || null;
      if (session) selectOperationSession(session);
    }
    function focusTaskPathEvidence() {
      const task = selectedTaskFromWorkbench();
      if (task) focusEvidenceFor(taskEvidencePredicate(task));
    }
    function focusTaskPathDirective() {
      const directiveIntent = directiveIntentForTask(selectedTaskFromWorkbench());
      if (directiveIntent) selectWebhookDelayDirective(directiveIntent);
    }
    function focusTaskPathDelivery() {
      const delivery = directiveDeliveryForTask(selectedTaskFromWorkbench());
      if (delivery) selectWebhookDelayDirectiveDelivery(delivery);
    }
    function focusTaskPathChain() {
      focusTaskPathDirective();
      focusTaskPathDelivery();
      renderWebhookDelayEvidenceChain();
    }
    function taskLifecyclePathContext(task = state.taskFocus, product = state.operationProduct || {}) {
      if (!task) return [];
      const path = Object.fromEntries(taskEvidencePathContext(task, product));
      return [
        ['Lifecycle State', path.Lifecycle || taskLifecycleStatus(task)],
        ['Next Lifecycle Action', path['Next Action'] || 'normalize_status_or_update'],
        ['Evidence Events', path['Task Evidence Events'] || '0'],
        ['Directive Delivery', path['Directive Delivery'] || 'none'],
        ['Delivery State', path['Delivery State'] || 'unknown'],
        ['Authority Path', path['Authority Path'] || 'unknown'],
      ];
    }
    function focusTaskLifecyclePath() {
      const task = selectedTaskFromWorkbench();
      if (!task) return;
      renderTaskEvidencePath(task);
      focusEvidenceFor(taskEvidencePredicate(task));
      updateControlRoom();
    }
    function taskFocusContext(task = {}) {
      const command = classifyCloudflareTaskCommandState({ task_id: task.task_id || '', status: task.status, evidence_count: taskEvidenceEvents(task).length });
      return [
        ['Task', task.task_id || 'none'],
        ['Number', task.task_number ?? 'none'],
        ['Title', task.title || 'untitled'],
        ['Status', task.status || 'unknown'],
        ['Source', task.source || 'unknown'],
        ['Session', task.carrier_session_id || 'none'],
        ['Site', task.site_id || 'none'],
        ['Created', task.created_at || 'none'],
        ['Updated', task.updated_at || 'none'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Follow Up', command.next_action],
        ['Note', task.note || 'none'],
      ];
    }
    function renderTaskFocusDetail(task = state.taskFocus) {
      if (!task) {
        el('taskFocusDetail').innerHTML = '<div class="empty">No task selected.</div>';
        renderTaskLifecycleControl();
        return;
      }
      renderTaskLifecycleControl(task);
      el('taskFocusDetail').replaceChildren(
        ...taskFocusContext(task).map(([label, value]) => evidenceField(label, value)),
        ...taskLifecyclePathContext(task).map(([label, value]) => evidenceField(label, value)),
        focusActionRow(
          focusActionButton('taskFocusEvidenceAction', 'Focus Evidence', () => focusEvidenceFor(taskEvidencePredicate(task))),
          focusActionButton('taskFocusPathAction', 'Task Path', focusTaskLifecyclePath),
          focusActionButton('taskFocusOpenAction', 'Mark Open', () => run(async () => { await updateFocusedTask('open', el('updateTaskNote').value.trim() || 'operator_marked_open'); })),
          focusActionButton('taskFocusDoneAction', 'Mark Done', () => run(async () => { await updateFocusedTask('done', el('updateTaskNote').value.trim() || 'operator_marked_done'); })),
        ),
      );
    }
    function taskEvidencePredicate(task) {
      return (event) => {
        const payloadText = JSON.stringify(event.payload || {});
        return payloadText.includes(task.task_id) || (task.task_number != null && payloadText.includes('"task_number":' + task.task_number));
      };
    }
    function directiveIntentTaskTitle(record = {}) {
      const directiveId = record.directive_record_id || record.directive_intent?.directive_id || 'directive_intent';
      const classification = record.classification_state || record.classification?.state || 'unknown';
      const delay = record.latest_delay_minutes ?? record.classification?.latest_delay_minutes ?? 'unknown';
      return ['directive', directiveId, classification, 'webhook_delay', delay].filter(Boolean).join(' ');
    }
    function directiveIntentTaskPredicate(record = {}) {
      const tokens = [record.directive_record_id, record.directive_intent?.directive_id, record.directive_intent?.input_event_id].filter(Boolean);
      return (task = {}) => {
        const taskText = JSON.stringify(task);
        return tokens.some((token) => taskText.includes(token));
      };
    }
    function taskForDirectiveIntent(record = state.webhookDelayDirectiveFocus, product = state.operationProduct || {}) {
      if (!record) return null;
      return (product.tasks || []).find(directiveIntentTaskPredicate(record)) || null;
    }
    function selectedTaskFromWorkbench() {
      const taskId = el('updateTaskId').value.trim() || state.taskFocus?.task_id || '';
      if (!taskId) return null;
      if (state.taskFocus?.task_id === taskId) return state.taskFocus;
      return (state.operationProduct?.tasks || []).find((task) => task.task_id === taskId) || { task_id: taskId };
    }
    function selectTask(task) {
      if (!task?.task_id) return;
      state.taskFocus = task;
      el('updateTaskId').value = task.task_id;
      el('updateTaskStatus').value = task.status || 'done';
      el('updateTaskNote').value = task.note || '';
      if (task.carrier_session_id) setCurrentSession(task.carrier_session_id);
      focusEvidenceFor(taskEvidencePredicate(task));
      renderTasks(state.operationProduct?.tasks || []);
      renderTaskFocusDetail(task);
      renderTaskCommandPreview();
      renderTaskLifecycleControl(task);
      renderWebhookDelayEvidenceChain();
      updateControlRoom();
    }
    function selectSiteFileChangeProposal(proposal) {
      if (!proposal?.proposal_id) return;
      state.siteFileChangeProposalFocus = proposal;
      renderOperationControlBoard(state.operationProduct || {});
      renderOperationFlightDeck(state.operationProduct || {});
      updateControlRoom();
    }
    function selectMailboxDraftReplyProposal(proposal) {
      if (!proposal?.proposal_id) return;
      state.mailboxDraftReplyProposalFocus = proposal;
      renderOperationControlBoard(state.operationProduct || {});
      renderOperationFlightDeck(state.operationProduct || {});
      updateControlRoom();
    }
    function selectMailboxOutlookDraftCreate(draftCreate) {
      if (!draftCreate?.draft_create_id) return;
      state.mailboxOutlookDraftCreateFocus = draftCreate;
      renderOperationControlBoard(state.operationProduct || {});
      renderOperationFlightDeck(state.operationProduct || {});
      updateControlRoom();
    }
    function selectMailboxSendAccepted(sendAccepted) {
      if (!sendAccepted?.send_accepted_id) return;
      state.mailboxSendAcceptedFocus = sendAccepted;
      state.mailboxSendConfirmationFocus = null;
      renderMailboxSendReviewDetail(state.operationProduct || {});
      renderOperationControlBoard(state.operationProduct || {});
      renderOperationFlightDeck(state.operationProduct || {});
      updateControlRoom();
    }
    function selectMailboxSendConfirmation(confirmation) {
      if (!confirmation?.send_confirmation_id) return;
      state.mailboxSendConfirmationFocus = confirmation;
      state.mailboxSendAcceptedFocus = null;
      renderMailboxSendReviewDetail(state.operationProduct || {});
      renderOperationControlBoard(state.operationProduct || {});
      renderOperationFlightDeck(state.operationProduct || {});
      updateControlRoom();
    }
    function focusedMailboxDraftReplyProposal() {
      return state.mailboxDraftReplyProposalFocus || (state.operationProduct?.mailbox_draft_reply_proposals || [])[0] || null;
    }
    function mailboxDraftRecipientsFromInput() {
      return el('mailboxDraftRecipients').value
        .replaceAll(String.fromCharCode(13), ',')
        .replaceAll(String.fromCharCode(10), ',')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    function renderMailboxDraftCreateControl(product = state.operationProduct || {}) {
      const proposal = focusedMailboxDraftReplyProposal();
      if (!proposal?.proposal_id) {
        state.mailboxDraftCreateFormProposalId = null;
        el('mailboxDraftCreateControl').innerHTML = '<div class="empty">No mailbox proposal selected.</div>';
        return;
      }
      if (state.mailboxDraftCreateFormProposalId !== proposal.proposal_id) {
        state.mailboxDraftCreateFormProposalId = proposal.proposal_id;
        el('mailboxDraftAccountRef').value = proposal.account_ref || '';
        el('mailboxDraftRecipients').value = '';
        el('mailboxDraftSubject').value = proposal.subject || '';
        el('mailboxDraftBody').value = proposal.body_preview || '';
      }
      const draftCreates = product.mailbox_outlook_draft_creates || [];
      const linkedDraft = draftCreates.find((draft) => draft.proposal_id === proposal.proposal_id) || null;
      el('mailboxDraftCreateControl').replaceChildren(
        evidenceField('Focused Proposal', proposal.proposal_id),
        evidenceField('Source Message', proposal.source_message_ref || 'none'),
        evidenceField('Proposal Draft Admission', proposal.mailbox_outlook_draft_create_admission || 'not_observed'),
        evidenceField('Draft Create Admission', 'admitted'),
        evidenceField('Send Admission', 'not_admitted'),
        evidenceField('Mutation Admission', 'not_admitted'),
        evidenceField('Linked Draft Create', linkedDraft?.draft_create_id || 'none'),
      );
    }
    function renderMailboxSendReviewDetail(product = state.operationProduct || {}) {
      const confirmation = state.mailboxSendConfirmationFocus || (!state.mailboxSendAcceptedFocus ? (product.mailbox_send_confirmations || [])[0] || null : null);
      const accepted = confirmation
        ? (product.mailbox_send_accepted_records || []).find((entry) => entry.send_accepted_id === confirmation.send_accepted_id) || null
        : state.mailboxSendAcceptedFocus || (product.mailbox_send_accepted_records || [])[0] || null;
      if (!confirmation && !accepted) {
        el('mailboxSendReviewDetail').innerHTML = '<div class="empty">No mailbox send selected.</div>';
        return;
      }
      const fields = [];
      if (confirmation) {
        fields.push(
          evidenceField('Review Kind', 'mailbox_send_confirmation'),
          evidenceField('Send Confirmation', confirmation.send_confirmation_id),
          evidenceField('Send Accepted', confirmation.send_accepted_id || 'none'),
          evidenceField('Status', confirmation.status || 'unknown'),
          evidenceField('Delivery Admission', confirmation.delivery_confirmation_admission || 'not_observed'),
          evidenceField('Mutation Admission', confirmation.mailbox_mutation_admission || 'not_observed'),
          evidenceField('Sent Message', confirmation.sent_message_ref || 'none'),
          evidenceField('Internet Message', confirmation.internet_message_id || 'none'),
        );
      } else {
        fields.push(
          evidenceField('Review Kind', 'mailbox_send_accepted'),
          evidenceField('Send Accepted', accepted.send_accepted_id),
          evidenceField('Draft Create', accepted.draft_create_id || 'none'),
          evidenceField('Proposal', accepted.proposal_id || 'none'),
          evidenceField('Status', accepted.status || 'unknown'),
          evidenceField('Send Admission', accepted.mailbox_send_admission || 'not_observed'),
          evidenceField('Mutation Admission', accepted.mailbox_mutation_admission || 'not_observed'),
          evidenceField('Graph Status', accepted.graph_status || 'none'),
        );
      }
      const focusKind = confirmation ? 'mailbox_send_confirmation' : 'mailbox_send_accepted';
      const focusRef = confirmation?.send_confirmation_id || accepted?.send_accepted_id || '';
      const latestReview = (product.mailbox_send_reviews || []).find((review) => review.focus_kind === focusKind && review.focus_ref === focusRef) || null;
      if (accepted && confirmation) fields.push(evidenceField('Accepted Status', accepted.status || 'unknown'));
      fields.push(
        evidenceField('Review Status', latestReview?.review_status || 'not_acknowledged'),
        evidenceField('Review Record', latestReview?.review_id || 'none'),
        evidenceField('Review Operator', latestReview?.recorded_by_principal_id || 'none'),
      );
      el('mailboxSendReviewDetail').replaceChildren(...fields);
    }
    function focusOperationReviewFromRoute(route = operationWorkflowRouteStage(), product = state.operationProduct || {}) {
      if (!route?.focus_kind || !route?.focus_ref) throw new Error('Operation workflow route does not expose a review focus.');
      state.operationFocusReviewFocus = {
        focus_kind: route.focus_kind,
        focus_ref: route.focus_ref,
        action: route.next_action || route.command_action || 'review_operation_focus',
        target: route.target || route.focus_ref,
        reason: route.reason || 'operation_focus_needs_review',
      };
      renderOperationFocusReviewDetail(product);
    }
    function focusedOperationFocusReview(product = state.operationProduct || {}) {
      const route = operationWorkflowRouteStage(product);
      if (state.operationFocusReviewFocus?.focus_kind && state.operationFocusReviewFocus?.focus_ref) return state.operationFocusReviewFocus;
      if (route?.focus_kind && route?.focus_ref) {
        return {
          focus_kind: route.focus_kind,
          focus_ref: route.focus_ref,
          action: route.next_action || route.command_action || 'review_operation_focus',
          target: route.target || route.focus_ref,
          reason: route.reason || 'operation_focus_needs_review',
        };
      }
      return null;
    }
    function operationFocusRecordForReview(focus, product = state.operationProduct || {}) {
      if (!focus?.focus_kind || !focus?.focus_ref) return null;
      const focusRef = String(focus.focus_ref || '');
      if (focus.focus_kind === 'site_continuity_reconciliation_execution') {
        return (product.site_continuity_reconciliation_executions || []).find((entry) => String(entry.execution_id || '') === focusRef) || null;
      }
      return null;
    }
    function renderOperationFocusReviewDetail(product = state.operationProduct || {}) {
      const focus = focusedOperationFocusReview(product);
      if (!focus) {
        el('operationFocusReviewDetail').innerHTML = '<div class="empty">No operation focus selected.</div>';
        return;
      }
      const latestReview = (product.operation_focus_reviews || []).find((review) => review.focus_kind === focus.focus_kind && review.focus_ref === focus.focus_ref) || null;
      const focusRecord = operationFocusRecordForReview(focus, product);
      el('operationFocusReviewDetail').replaceChildren(
        evidenceField('Review Kind', focus.focus_kind),
        evidenceField('Review Focus', focus.focus_ref),
        evidenceField('Route Action', focus.action || 'review_operation_focus'),
        evidenceField('Route Reason', focus.reason || 'operation_focus_needs_review'),
        evidenceField('Focus Status', focusRecord?.status || focusRecord?.latest_status || 'unknown'),
        evidenceField('Review Status', latestReview?.review_status || 'not_acknowledged'),
        evidenceField('Review Record', latestReview?.review_id || 'none'),
        evidenceField('Review Operator', latestReview?.recorded_by_principal_id || 'none'),
      );
    }
    async function acknowledgeFocusedOperationFocusReview() {
      const focus = focusedOperationFocusReview();
      if (!focus?.focus_kind || !focus?.focus_ref) throw new Error('Operation focus review is required.');
      const body = await api.acknowledgeOperationFocusReview({
        focus_kind: focus.focus_kind,
        focus_ref: focus.focus_ref,
        review_action: 'acknowledge_operation_focus_review',
        note: 'operator_acknowledged_operation_focus_review',
      });
      state.operationFocusReviewFocus = null;
      await refreshOperation();
      return body;
    }
    async function acknowledgeFocusedMailboxSendReview() {
      const product = state.operationProduct || {};
      const confirmation = state.mailboxSendConfirmationFocus || (!state.mailboxSendAcceptedFocus ? (product.mailbox_send_confirmations || [])[0] || null : null);
      const accepted = confirmation
        ? (product.mailbox_send_accepted_records || []).find((entry) => entry.send_accepted_id === confirmation.send_accepted_id) || null
        : state.mailboxSendAcceptedFocus || (product.mailbox_send_accepted_records || [])[0] || null;
      if (!confirmation && !accepted) throw new Error('Mailbox send review focus is required.');
      const focusKind = confirmation ? 'mailbox_send_confirmation' : 'mailbox_send_accepted';
      const focusRef = confirmation?.send_confirmation_id || accepted?.send_accepted_id || '';
      const body = await api.acknowledgeMailboxSendReview({
        focus_kind: focusKind,
        focus_ref: focusRef,
        send_confirmation_id: confirmation?.send_confirmation_id || '',
        send_accepted_id: confirmation?.send_accepted_id || accepted?.send_accepted_id || '',
        review_action: 'acknowledge_mailbox_send_review',
        note: 'operator_acknowledged_mailbox_send_review',
      });
      await refreshOperation();
      return body;
    }
    async function createOutlookDraftFromFocusedProposal() {
      const proposal = focusedMailboxDraftReplyProposal();
      if (!proposal?.proposal_id) throw new Error('Mailbox proposal is required.');
      const accountRef = el('mailboxDraftAccountRef').value.trim() || proposal.account_ref || '';
      const subject = el('mailboxDraftSubject').value.trim() || proposal.subject || '';
      const bodyText = el('mailboxDraftBody').value.trim();
      const toRecipients = mailboxDraftRecipientsFromInput();
      if (!accountRef) throw new Error('Account Ref is required.');
      if (toRecipients.length === 0) throw new Error('At least one recipient is required.');
      if (!subject) throw new Error('Subject is required.');
      if (!bodyText) throw new Error('Body is required.');
      const sourcePayload = {
        schema: 'narada.sonar.mailbox_outlook_draft_create_request.v1',
        generated_at: new Date().toISOString(),
        operation_id: proposal.operation_id || el('operationId').value.trim() || null,
        account_ref: accountRef,
        source_message_ref: proposal.source_message_ref || null,
        proposal_id: proposal.proposal_id,
        proposal_ref: proposal.proposal_ref || null,
        subject,
        to_recipients: toRecipients,
        body_text: bodyText,
        mailbox_outlook_draft_create_admission: 'admitted',
        mailbox_send_admission: 'not_admitted',
        mailbox_mutation_admission: 'not_admitted',
        draft_create_posture: 'operator_admitted_cloudflare_created_outlook_draft_send_not_admitted',
      };
      await api.createOutlookDraft({ source_payload: sourcePayload });
      await refreshOperation();
      const draft = (state.operationProduct?.mailbox_outlook_draft_creates || []).find((entry) => entry.proposal_id === proposal.proposal_id) || null;
      if (draft) selectMailboxOutlookDraftCreate(draft);
    }
    async function updateFocusedTask(status, note = null) {
      const taskId = selectedTaskFromWorkbench()?.task_id || '';
      if (!taskId) return;
      const body = await api.updateTask(taskId, status, note ?? el('updateTaskNote').value.trim());
      appendEvents(body.events || []);
      await refreshStatus();
      await refreshOperation();
      const task = (state.operationProduct?.tasks || []).find((entry) => entry.task_id === taskId);
      if (task) selectTask(task);
    }
    function listItem(label, value) {
      const li = document.createElement('li');
      const key = document.createElement('b');
      key.textContent = label + ': ';
      li.append(key, document.createTextNode(value == null || value === '' ? 'none' : String(value)));
      return li;
    }
    function authoritySummary(event) {
      const evidence = event?.evidence || {};
      const parts = [
        'actor=' + (event?.principal_id || 'unknown'),
        'action=' + (event?.action || 'unknown'),
        'reason=' + (event?.reason || 'none'),
      ];
      if (evidence.member_principal_id) parts.push('target=' + evidence.member_principal_id);
      if (evidence.role) parts.push('role=' + evidence.role);
      if (evidence.status) parts.push('status=' + evidence.status);
      if (evidence.actor_role) parts.push('actor_role=' + evidence.actor_role);
      return parts.join(' | ');
    }
    function renderLastAuthority(event, fallback = null) {
      const authority = event || fallback;
      if (!authority) {
        el('lastAuthority').replaceChildren(
          Object.assign(document.createElement('strong'), { textContent: 'No authority action loaded.' }),
          Object.assign(document.createElement('span'), { textContent: 'Read Site or Put Membership to inspect evidence.' }),
        );
        return;
      }
      const title = document.createElement('strong');
      title.textContent = authority.event_kind || 'site.membership.put';
      const meta = document.createElement('span');
      meta.textContent = authoritySummary(authority);
      el('lastAuthority').replaceChildren(title, meta);
    }
    function renderListBlock(title, items) {
      const block = document.createElement('div');
      block.className = 'overview-block';
      const heading = document.createElement('h3');
      heading.textContent = title;
      const list = document.createElement('ul');
      if (items.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'None loaded.';
        list.append(empty);
      } else {
        list.append(...items);
      }
      block.append(heading, list);
      return block;
    }
    function authorityRouteSummary(decision) {
      return [
        'action=' + (decision.action || 'unknown'),
        'reason=' + (decision.reason || 'none'),
        'locus=' + (decision.authority_locus || 'unresolved'),
        'kind=' + (decision.authority_locus_kind || 'unknown'),
      ].join(' | ');
    }
    function continuitySummary(decision) {
      return [
        'action=' + (decision.action || 'unknown'),
        'reason=' + (decision.reason || 'none'),
        'source=' + (decision.source_embodiment_kind || 'unknown'),
        'target=' + (decision.target_embodiment_kind || 'unknown'),
      ].join(' | ');
    }
    function continuityKey(item = {}) {
      return [item.kind, item.report_id, item.packet_id, item.exchange_class, item.source, item.target].filter(Boolean).join('|');
    }
    function continuityItems(product = {}) {
      const decisions = (product.site_continuity?.decisions || []).map((decision) => ({ kind: 'decision', ...decision }));
      const packets = (product.site_continuity_packets || []).map((packet) => ({ kind: 'packet', ...packet }));
      const loopReports = (product.site_continuity_loop_reports || []).map((report) => ({ kind: 'loop_report', ...report }));
      return [...decisions, ...packets, ...loopReports];
    }
    function selectContinuity(item) {
      if (!item) return;
      state.continuityFocus = item;
      renderContinuityNavigator(continuityItems(state.operationProduct || {}));
      updateControlRoom();
    }
    function renderContinuityNavigator(items = []) {
      if (items.length === 0) {
        state.continuityFocus = null;
        el('continuityNavigator').innerHTML = '<div class="empty">No continuity loaded.</div>';
        renderContinuityFocusDetail();
        return;
      }
      if (state.continuityFocus) state.continuityFocus = items.find((item) => continuityKey(item) === continuityKey(state.continuityFocus)) || state.continuityFocus;
      if (!state.continuityFocus) state.continuityFocus = items[0];
      el('continuityNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'continuity-item' + (continuityKey(item) === continuityKey(state.continuityFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = item.kind + ' ' + (item.report_id || item.packet_id || item.exchange_class || item.reason || 'continuity');
        const meta = document.createElement('span');
        meta.textContent = item.kind === 'packet'
          ? [item.admission_action, item.imported_at, item.imported_by_principal_id].filter(Boolean).join(' | ')
          : item.kind === 'loop_report'
            ? [item.status, item.cloudflare_push_status, item.generated_at, item.recorded_at].filter(Boolean).join(' | ')
            : continuitySummary(item);
        node.addEventListener('click', () => selectContinuity(item));
        node.append(title, meta);
        return node;
      }));
      renderContinuityFocusDetail();
    }
    function continuityFocusContext(item = {}) {
      if (item.kind === 'packet') {
        return [
          ['Kind', 'packet'],
          ['Packet', item.packet_id || 'none'],
          ['Relation', item.relation_id || 'none'],
          ['Direction', [item.source_embodiment_kind || 'unknown', item.target_embodiment_kind || 'unknown'].join(' -> ')],
          ['Admission', item.admission_action || 'unknown'],
          ['Admission Reason', item.admission_reason || 'none'],
          ['Site', item.site_id || el('siteId').value.trim() || 'none'],
          ['Imported', item.imported_at || 'none'],
          ['Imported By', item.imported_by_principal_id || 'none'],
        ];
      }
      if (item.kind === 'loop_report') {
        return [
          ['Kind', 'loop_report'],
          ['Report', item.report_id || 'none'],
          ['Status', item.status || 'unknown'],
          ['Generated', item.generated_at || 'none'],
          ['Recorded', item.recorded_at || 'none'],
          ['Cloudflare Push', item.cloudflare_push_status || 'none'],
          ['Windows Packets', item.windows_packet_count ?? 0],
          ['Credential Source', item.cloudflare_credential_source || 'none'],
        ];
      }
      return [
        ['Kind', item.kind || 'decision'],
        ['Exchange', item.exchange_class || 'unknown'],
        ['Action', item.action || 'unknown'],
        ['Reason', item.reason || 'none'],
        ['Source', item.source_embodiment_kind || 'unknown'],
        ['Target', item.target_embodiment_kind || 'unknown'],
      ];
    }
    function renderContinuityFocusDetail(item = state.continuityFocus) {
      if (!item) {
        el('continuityFocusDetail').innerHTML = '<div class="empty">No continuity item selected.</div>';
        return;
      }
      el('continuityFocusDetail').replaceChildren(...continuityFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function webhookDelayDirectiveDeliveryKey(item = {}) {
      return item.delivery_id || item.directive_delivery_id || [item.directive_record_id, item.carrier_session_id, item.recorded_at].filter(Boolean).join('|');
    }
    function selectWebhookDelayDirectiveDelivery(item) {
      if (!item) return;
      state.webhookDelayDirectiveDeliveryFocus = item;
      if (item.carrier_session_id && (state.operationProduct?.sessions || []).some((session) => session.carrier_session_id === item.carrier_session_id)) {
        selectOperationSession((state.operationProduct?.sessions || []).find((session) => session.carrier_session_id === item.carrier_session_id));
      }
      renderWebhookDelayDirectiveDeliveryNavigator(state.operationProduct?.webhook_delay_directive_deliveries || []);
      setEvidenceLane('directives');
      focusEvidenceFor((event) => item.carrier_session_id && event.carrier_session_id === item.carrier_session_id && (event.event_kind === 'directive_receipt_recorded' || event.event_kind === 'input_admitted_to_turn' || event.event_kind === 'provider_request_recorded'));
      renderWebhookDelayEvidenceChain();
      updateControlRoom();
    }
    function focusWebhookDelayDirectiveDelivery(item = null) {
      const items = state.operationProduct?.webhook_delay_directive_deliveries || [];
      const focused = item || state.webhookDelayDirectiveDeliveryFocus || items[0] || null;
      if (focused) selectWebhookDelayDirectiveDelivery(focused);
    }
    function renderWebhookDelayDirectiveDeliveryNavigator(items = []) {
      if (items.length === 0) {
        state.webhookDelayDirectiveDeliveryFocus = null;
        el('webhookDelayDirectiveDeliveryNavigator').innerHTML = '<div class="empty">No webhook delay directive deliveries loaded.</div>';
        renderWebhookDelayDirectiveDeliveryFocusDetail();
        return;
      }
      if (state.webhookDelayDirectiveDeliveryFocus) state.webhookDelayDirectiveDeliveryFocus = items.find((item) => webhookDelayDirectiveDeliveryKey(item) === webhookDelayDirectiveDeliveryKey(state.webhookDelayDirectiveDeliveryFocus)) || state.webhookDelayDirectiveDeliveryFocus;
      if (!state.webhookDelayDirectiveDeliveryFocus) state.webhookDelayDirectiveDeliveryFocus = items[0];
      el('webhookDelayDirectiveDeliveryNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (webhookDelayDirectiveDeliveryKey(item) === webhookDelayDirectiveDeliveryKey(state.webhookDelayDirectiveDeliveryFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.delivery_state || 'unknown', item.delivery_id || item.directive_delivery_id || 'directive_delivery'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.carrier_session_id, item.directive_authority, item.dispatch_authority, item.fallback_status, item.delivery_action].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectWebhookDelayDirectiveDelivery(item));
        node.append(title, meta);
        return node;
      }));
      renderWebhookDelayDirectiveDeliveryFocusDetail();
    }
    function webhookDelayDirectiveDeliveryFocusContext(item = state.webhookDelayDirectiveDeliveryFocus) {
      const sessionEvidence = (state.operationProduct?.carrier_evidence || []).find((entry) => entry.carrier_session_id === item?.carrier_session_id);
      return [
        ['Directive Delivery', item?.delivery_id || item?.directive_delivery_id || 'none'],
        ['Directive Record', item?.directive_record_id || 'none'],
        ['Delivery State', item?.delivery_state || 'unknown'],
        ['Carrier Session', item?.carrier_session_id || 'none'],
        ['Classification', item?.classification_state || item?.classification?.state || 'unknown'],
        ['Latest Delay Minutes', item?.latest_delay_minutes ?? item?.classification?.latest_delay_minutes ?? 'none'],
        ['Directive Authority', item?.directive_authority || 'cloudflare_primary_directive_delivery'],
        ['Dispatch Authority', item?.dispatch_authority || 'cloudflare_primary_dispatcher'],
        ['Fallback Authority', item?.fallback_authority || 'windows_fallback_dispatcher'],
        ['Fallback Status', item?.fallback_status || 'unknown'],
        ['Delivery Action', item?.delivery_action || 'none'],
        ['Session Start OK', item?.session_start_ok ?? item?.record?.session_start_ok ?? 'unknown'],
        ['Delivery OK', item?.delivery_ok ?? item?.record?.delivery_ok ?? 'unknown'],
        ['Evidence Events', sessionEvidence ? String((sessionEvidence.events || []).length) : 'not loaded'],
        ['Recorded', item?.recorded_at || 'none'],
      ];
    }
    function renderWebhookDelayDirectiveDeliveryFocusDetail(item = state.webhookDelayDirectiveDeliveryFocus) {
      if (!item) {
        el('webhookDelayDirectiveDeliveryFocusDetail').innerHTML = '<div class="empty">No webhook delay directive delivery selected.</div>';
        return;
      }
      el('webhookDelayDirectiveDeliveryFocusDetail').replaceChildren(...webhookDelayDirectiveDeliveryFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function webhookDelayEvidenceChainContext(product = state.operationProduct || {}) {
      const observation = state.webhookDelayShadowFocus || (product.webhook_delay_shadow_observations || [])[0] || null;
      const intent = state.webhookDelayDirectiveFocus || (product.webhook_delay_directive_records || [])[0] || null;
      const delivery = state.webhookDelayDirectiveDeliveryFocus || (product.webhook_delay_directive_deliveries || [])[0] || null;
      const deliverySessionId = delivery?.carrier_session_id || el('sessionId').value.trim();
      const session = (product.sessions || []).find((entry) => entry.carrier_session_id === deliverySessionId) || state.sessionFocus || null;
      const sessionEvidence = (product.carrier_evidence || []).find((entry) => entry.carrier_session_id === deliverySessionId) || null;
      const task = taskForDirectiveIntent(intent, product) || state.taskFocus || null;
      const nextFocus = !observation ? 'observation'
        : !intent ? 'directive_intent'
        : !delivery ? 'directive_delivery'
        : !sessionEvidence ? 'session_evidence'
        : !task ? 'task'
        : 'chain_complete';
      return [
        ['Observation', observation?.observation_id || 'none'],
        ['Classification', observation?.classification_state || intent?.classification_state || delivery?.classification_state || 'unknown'],
        ['Directive Intent', intent?.directive_record_id || intent?.directive_intent?.directive_id || 'none'],
        ['Directive Visibility', intent?.carrier_admission?.directive_visibility || intent?.directive_intent?.input_event?.metadata?.directive?.visibility || 'unknown'],
        ['Directive Delivery', delivery?.delivery_id || delivery?.directive_delivery_id || 'none'],
        ['Delivery State', delivery?.delivery_state || 'unknown'],
        ['Carrier Session', deliverySessionId || session?.carrier_session_id || 'none'],
        ['Evidence Events', sessionEvidence ? String((sessionEvidence.events || []).length) : 'not loaded'],
        ['Task', task?.task_id || 'none'],
        ['Authority Path', [intent?.directive_authority, delivery?.dispatch_authority, delivery?.fallback_authority].filter(Boolean).join(' -> ') || 'unknown'],
        ['Fallback', delivery?.fallback_status || intent?.fallback_status || 'unknown'],
        ['Next Focus', nextFocus],
      ];
    }
    function renderWebhookDelayEvidenceChain(product = state.operationProduct || {}) {
      const target = el('webhookDelayEvidenceChain');
      if (!target) return;
      target.replaceChildren(...webhookDelayEvidenceChainContext(product).map(([label, value]) => evidenceField(label, value)));
    }
    function focusWebhookDelayChainObservation() {
      focusWebhookDelayShadow(state.webhookDelayShadowFocus || (state.operationProduct?.webhook_delay_shadow_observations || [])[0] || null);
      renderWebhookDelayEvidenceChain();
    }
    function focusWebhookDelayChainIntent() {
      focusWebhookDelayDirective(state.webhookDelayDirectiveFocus || (state.operationProduct?.webhook_delay_directive_records || [])[0] || null);
      renderWebhookDelayEvidenceChain();
    }
    function focusWebhookDelayChainDelivery() {
      focusWebhookDelayDirectiveDelivery(state.webhookDelayDirectiveDeliveryFocus || (state.operationProduct?.webhook_delay_directive_deliveries || [])[0] || null);
      renderWebhookDelayEvidenceChain();
    }
    function focusWebhookDelayChainSession() {
      const delivery = state.webhookDelayDirectiveDeliveryFocus || (state.operationProduct?.webhook_delay_directive_deliveries || [])[0] || null;
      const sessionId = delivery?.carrier_session_id || el('sessionId').value.trim();
      const session = (state.operationProduct?.sessions || []).find((entry) => entry.carrier_session_id === sessionId) || null;
      if (session) selectOperationSession(session);
      if (sessionId) focusEvidenceFor((event) => event.carrier_session_id === sessionId);
      renderWebhookDelayEvidenceChain();
    }
    function focusWebhookDelayChainTask() {
      const task = taskForDirectiveIntent(state.webhookDelayDirectiveFocus, state.operationProduct || {});
      if (task) selectTask(task);
      renderWebhookDelayEvidenceChain();
    }
    function webhookDelayShadowKey(item = {}) {
      return item.observation_id || [item.site_id, item.generated_at, item.latest_delay_minutes].filter(Boolean).join('|');
    }
    function selectWebhookDelayShadow(item) {
      if (!item) return;
      state.webhookDelayShadowFocus = item;
      renderWebhookDelayShadowNavigator(state.operationProduct?.webhook_delay_shadow_observations || []);
      renderWebhookDelayEvidenceChain();
      updateControlRoom();
    }
    function focusWebhookDelayShadow(item = null) {
      const items = state.operationProduct?.webhook_delay_shadow_observations || [];
      const focused = item || state.webhookDelayShadowFocus || items[0] || null;
      if (focused) selectWebhookDelayShadow(focused);
    }
    function renderWebhookDelayShadowNavigator(items = []) {
      if (items.length === 0) {
        state.webhookDelayShadowFocus = null;
        el('webhookDelayShadowNavigator').innerHTML = '<div class="empty">No webhook delay shadow reads loaded.</div>';
        renderWebhookDelayShadowFocusDetail();
        return;
      }
      if (state.webhookDelayShadowFocus) state.webhookDelayShadowFocus = items.find((item) => webhookDelayShadowKey(item) === webhookDelayShadowKey(state.webhookDelayShadowFocus)) || state.webhookDelayShadowFocus;
      if (!state.webhookDelayShadowFocus) state.webhookDelayShadowFocus = items[0];
      el('webhookDelayShadowNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (webhookDelayShadowKey(item) === webhookDelayShadowKey(state.webhookDelayShadowFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.classification_state || item.classification?.state || 'unknown', item.observation_id || item.generated_at || 'shadow_read'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = ['delay=' + (item.latest_delay_minutes ?? item.observation?.latest?.delay_minutes ?? 'unknown'), item.dispatch_authority || item.classification?.dispatch_authority, item.dispatch_action || item.classification?.dispatch_action || 'none'].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectWebhookDelayShadow(item));
        node.append(title, meta);
        return node;
      }));
      renderWebhookDelayShadowFocusDetail();
    }
    function webhookDelayShadowFocusContext(item = {}) {
      return [
        ['Observation', item.observation_id || 'none'],
        ['Classification', item.classification_state || item.classification?.state || 'unknown'],
        ['Latest Delay Minutes', item.latest_delay_minutes ?? item.observation?.latest?.delay_minutes ?? 'none'],
        ['Critical Minutes', item.critical_minutes ?? item.classification?.critical_minutes ?? 'none'],
        ['Shadow Mode', item.shadow_mode || item.classification?.shadow_mode || 'cloudflare_shadow_read'],
        ['Dispatch Authority', item.dispatch_authority || item.classification?.dispatch_authority || 'windows_primary_dispatcher'],
        ['Dispatch Action', item.dispatch_action || item.classification?.dispatch_action || 'none'],
        ['Source Locus', item.source_locus || 'windows_local_site'],
        ['Target Locus', item.target_locus || 'cloudflare_carrier_site'],
        ['Generated', item.generated_at || item.observation?.generated_at || 'none'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderWebhookDelayShadowFocusDetail(item = state.webhookDelayShadowFocus) {
      if (!item) {
        el('webhookDelayShadowFocusDetail').innerHTML = '<div class="empty">No webhook delay shadow read selected.</div>';
        return;
      }
      el('webhookDelayShadowFocusDetail').replaceChildren(...webhookDelayShadowFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function webhookDelayDirectiveKey(item = {}) {
      return item.directive_record_id || item.directive_intent?.directive_id || [item.site_id, item.operation_id, item.recorded_at].filter(Boolean).join('|');
    }
    function selectWebhookDelayDirective(item) {
      if (!item) return;
      state.webhookDelayDirectiveFocus = item;
      renderWebhookDelayDirectiveNavigator(state.operationProduct?.webhook_delay_directive_records || []);
      renderTaskCommandPreview();
      renderWebhookDelayEvidenceChain();
      updateControlRoom();
    }
    function focusWebhookDelayDirective(item = null) {
      const items = state.operationProduct?.webhook_delay_directive_records || [];
      const focused = item || state.webhookDelayDirectiveFocus || items[0] || null;
      if (focused) selectWebhookDelayDirective(focused);
    }
    function renderWebhookDelayDirectiveNavigator(items = []) {
      if (items.length === 0) {
        state.webhookDelayDirectiveFocus = null;
        el('webhookDelayDirectiveNavigator').innerHTML = '<div class="empty">No webhook delay directive records loaded.</div>';
        renderWebhookDelayDirectiveFocusDetail();
        return;
      }
      if (state.webhookDelayDirectiveFocus) state.webhookDelayDirectiveFocus = items.find((item) => webhookDelayDirectiveKey(item) === webhookDelayDirectiveKey(state.webhookDelayDirectiveFocus)) || state.webhookDelayDirectiveFocus;
      if (!state.webhookDelayDirectiveFocus) state.webhookDelayDirectiveFocus = items[0];
      el('webhookDelayDirectiveNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (webhookDelayDirectiveKey(item) === webhookDelayDirectiveKey(state.webhookDelayDirectiveFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.classification_state || item.classification?.state || 'unknown', item.directive_record_id || item.directive_intent?.directive_id || 'webhook_delay_directive'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.directive_authority, item.fallback_authority, item.fallback_status, item.directive_action, item.carrier_admission?.directive_visibility].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectWebhookDelayDirective(item));
        node.append(title, meta);
        return node;
      }));
      renderWebhookDelayDirectiveFocusDetail();
    }
    function webhookDelayDirectiveFocusContext(item = {}) {
      return [
        ['Directive Record', item.directive_record_id || 'none'],
        ['Classification', item.classification_state || item.classification?.state || 'unknown'],
        ['Latest Delay Minutes', item.latest_delay_minutes ?? item.classification?.latest_delay_minutes ?? 'none'],
        ['Critical Minutes', item.critical_minutes ?? item.classification?.critical_minutes ?? item.threshold_policy?.critical_minutes ?? 'none'],
        ['Directive Authority', item.directive_authority || 'cloudflare_directive_dual_recorded'],
        ['Fallback Authority', item.fallback_authority || 'windows_fallback_dispatcher'],
        ['Fallback Status', item.fallback_status || 'unknown'],
        ['Directive Action', item.directive_action || 'none'],
        ['Carrier Input Operation', item.directive_intent?.carrier_input_operation || 'none'],
        ['Directive Visibility', item.carrier_admission?.directive_visibility || item.directive_intent?.input_event?.metadata?.directive?.visibility || 'unknown'],
        ['Dispatch To Provider', item.carrier_admission?.dispatch_to_provider ?? 'unknown'],
        ['Complete Without Provider', item.carrier_admission?.complete_without_provider ?? 'unknown'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderWebhookDelayDirectiveFocusDetail(item = state.webhookDelayDirectiveFocus) {
      if (!item) {
        el('webhookDelayDirectiveFocusDetail').innerHTML = '<div class="empty">No webhook delay directive record selected.</div>';
        return;
      }
      el('webhookDelayDirectiveFocusDetail').replaceChildren(...webhookDelayDirectiveFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function residentLoopShadowKey(item = {}) {
      return item.loop_run_id || [item.site_id, item.operation_id, item.run_started_at].filter(Boolean).join('|');
    }
    function selectResidentLoopShadow(item) {
      if (!item) return;
      state.residentLoopShadowFocus = item;
      renderResidentLoopShadowNavigator(state.operationProduct?.resident_loop_shadow_runs || []);
      updateControlRoom();
    }
    function renderResidentLoopShadowNavigator(items = []) {
      if (items.length === 0) {
        state.residentLoopShadowFocus = null;
        el('residentLoopShadowNavigator').innerHTML = '<div class="empty">No resident loop shadow reads loaded.</div>';
        renderResidentLoopShadowFocusDetail();
        return;
      }
      if (state.residentLoopShadowFocus) state.residentLoopShadowFocus = items.find((item) => residentLoopShadowKey(item) === residentLoopShadowKey(state.residentLoopShadowFocus)) || state.residentLoopShadowFocus;
      if (!state.residentLoopShadowFocus) state.residentLoopShadowFocus = items[0];
      el('residentLoopShadowNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (residentLoopShadowKey(item) === residentLoopShadowKey(state.residentLoopShadowFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.loop_status || item.loop_run?.status || 'unknown', item.loop_run_id || item.run_started_at || 'resident_loop_shadow'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = ['steps=' + (item.step_count ?? item.loop_run?.step_count ?? 'unknown'), 'attention=' + (item.operator_attention_count ?? item.loop_run?.operator_attention_count ?? 'unknown'), item.dispatch_authority, item.dispatch_action || 'none'].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectResidentLoopShadow(item));
        node.append(title, meta);
        return node;
      }));
      renderResidentLoopShadowFocusDetail();
    }
    function residentLoopShadowFocusContext(item = {}) {
      const loopRun = item.loop_run || {};
      return [
        ['Loop Run', item.loop_run_id || 'none'],
        ['Status', item.loop_status || loopRun.status || 'unknown'],
        ['Site', item.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', item.operation_id || loopRun.operation_id || el('operationId').value.trim() || 'none'],
        ['Started', item.run_started_at || loopRun.run_started_at || 'none'],
        ['Finished', item.run_finished_at || loopRun.run_finished_at || 'none'],
        ['Steps', item.step_count ?? loopRun.step_count ?? 'unknown'],
        ['Operator Attention', item.operator_attention_count ?? loopRun.operator_attention_count ?? 'unknown'],
        ['Source Locus', item.source_locus || 'unknown'],
        ['Target Locus', item.target_locus || 'unknown'],
        ['Shadow Mode', item.shadow_mode || loopRun.shadow_mode || 'unknown'],
        ['Dispatch Authority', item.dispatch_authority || loopRun.dispatch_authority || 'none'],
        ['Dispatch Action', item.dispatch_action || loopRun.dispatch_action || 'none'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderResidentLoopShadowFocusDetail(item = state.residentLoopShadowFocus) {
      if (!item) {
        el('residentLoopShadowFocusDetail').innerHTML = '<div class="empty">No resident loop shadow read selected.</div>';
        return;
      }
      el('residentLoopShadowFocusDetail').replaceChildren(...residentLoopShadowFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function residentDispatchKey(item = {}) {
      return item.dispatch_decision_id || [item.site_id, item.operation_id, item.carrier_session_id].filter(Boolean).join('|');
    }
    function selectResidentDispatch(item) {
      if (!item) return;
      state.residentDispatchFocus = item;
      renderResidentDispatchNavigator(state.operationProduct?.resident_dispatch_decisions || []);
      updateControlRoom();
    }
    function focusResidentDispatch(decision = null) {
      const items = state.operationProduct?.resident_dispatch_decisions || [];
      const focused = decision || state.residentDispatchFocus || items[0] || null;
      if (focused) selectResidentDispatch(focused);
    }
    async function startResidentDispatchFromWorkbench() {
      const body = await api.startResidentDispatch();
      const carrierSessionId = body.carrier_session_id || body.decision?.carrier_session_id || body.session_start?.carrier_session_id;
      if (carrierSessionId) setCurrentSession(carrierSessionId);
      appendEvents([body.session_start?.event].filter(Boolean));
      await refreshStatus();
      await refreshOperation();
      const decisionId = body.decision?.dispatch_decision_id;
      const decisions = state.operationProduct?.resident_dispatch_decisions || [];
      focusResidentDispatch(decisions.find((item) => item.dispatch_decision_id === decisionId || item.carrier_session_id === carrierSessionId));
    }
    function renderResidentDispatchNavigator(items = []) {
      if (items.length === 0) {
        state.residentDispatchFocus = null;
        el('residentDispatchNavigator').innerHTML = '<div class="empty">No resident dispatch decisions loaded.</div>';
        renderResidentDispatchFocusDetail();
        return;
      }
      if (state.residentDispatchFocus) state.residentDispatchFocus = items.find((item) => residentDispatchKey(item) === residentDispatchKey(state.residentDispatchFocus)) || state.residentDispatchFocus;
      if (!state.residentDispatchFocus) state.residentDispatchFocus = items[0];
      el('residentDispatchNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (residentDispatchKey(item) === residentDispatchKey(state.residentDispatchFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.decision_state || 'unknown', item.dispatch_decision_id || item.carrier_session_id || 'resident_dispatch'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.dispatch_authority, item.fallback_authority, item.fallback_status, item.dispatch_action].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectResidentDispatch(item));
        node.append(title, meta);
        return node;
      }));
      renderResidentDispatchFocusDetail();
    }
    function residentDispatchFocusContext(item = {}) {
      return [
        ['Decision', item.dispatch_decision_id || 'none'],
        ['State', item.decision_state || 'unknown'],
        ['Site', item.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', item.operation_id || el('operationId').value.trim() || 'none'],
        ['Session', item.carrier_session_id || 'none'],
        ['Dispatch Authority', item.dispatch_authority || 'cloudflare_primary_dispatcher'],
        ['Fallback Authority', item.fallback_authority || 'windows_fallback_dispatcher'],
        ['Fallback Status', item.fallback_status || 'unknown'],
        ['Dispatch Action', item.dispatch_action || 'none'],
        ['Dispatch Scope', item.dispatch_scope || 'unknown'],
        ['Session Start Status', item.session_start_status ?? 'none'],
        ['Session Start OK', item.session_start_ok ?? 'unknown'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderResidentDispatchFocusDetail(item = state.residentDispatchFocus) {
      if (!item) {
        el('residentDispatchFocusDetail').innerHTML = '<div class="empty">No resident dispatch decision selected.</div>';
        return;
      }
      el('residentDispatchFocusDetail').replaceChildren(...residentDispatchFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function localIngressRequestKey(item = {}) {
      return item.local_ingress_request_id || [item.site_id, item.requested_action_ref, item.recorded_at].filter(Boolean).join('|');
    }
    function selectLocalIngressRequest(item) {
      if (!item) return;
      state.localIngressRequestFocus = item;
      renderLocalIngressRequestNavigator(state.operationProduct?.local_ingress_requests || []);
      updateControlRoom();
    }
    function renderLocalIngressRequestNavigator(items = []) {
      if (items.length === 0) {
        state.localIngressRequestFocus = null;
        el('localIngressRequestNavigator').innerHTML = '<div class="empty">No local ingress requests loaded.</div>';
        renderLocalIngressRequestFocusDetail();
        return;
      }
      if (state.localIngressRequestFocus) state.localIngressRequestFocus = items.find((item) => localIngressRequestKey(item) === localIngressRequestKey(state.localIngressRequestFocus)) || state.localIngressRequestFocus;
      if (!state.localIngressRequestFocus) state.localIngressRequestFocus = items[0];
      el('localIngressRequestNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (localIngressRequestKey(item) === localIngressRequestKey(state.localIngressRequestFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.local_execution_admission || 'pending_windows_admission', item.local_ingress_request_id || 'local_ingress_request'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.requested_action_ref, item.target_authority_locus, item.local_executor_authority, item.direct_cloudflare_filesystem_mutation_admission].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectLocalIngressRequest(item));
        node.append(title, meta);
        return node;
      }));
      renderLocalIngressRequestFocusDetail();
    }
    function localIngressRequestFocusContext(item = {}) {
      return [
        ['Request', item.local_ingress_request_id || 'none'],
        ['Site', item.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', item.operation_id || el('operationId').value.trim() || 'none'],
        ['Requested Action', item.requested_action_ref || 'none'],
        ['Request Authority', item.request_authority || 'cloudflare_local_ingress_request_queue'],
        ['Target Authority Locus', item.target_authority_locus || 'local-windows-site-authority'],
        ['Executor Authority', item.local_executor_authority || 'windows_local_ingress_executor'],
        ['Execution Admission', item.local_execution_admission || 'pending_windows_admission'],
        ['Direct Cloudflare Filesystem Mutation', item.direct_cloudflare_filesystem_mutation_admission || 'not_admitted'],
        ['Repository Publication', item.repository_publication_admission || 'not_admitted'],
        ['Authority Partition', item.authority_partition || 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderLocalIngressRequestFocusDetail(item = state.localIngressRequestFocus) {
      if (!item) {
        el('localIngressRequestFocusDetail').innerHTML = '<div class="empty">No local ingress request selected.</div>';
        return;
      }
      el('localIngressRequestFocusDetail').replaceChildren(...localIngressRequestFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function localIngressEvidenceKey(item = {}) {
      return item.local_ingress_evidence_id || [item.local_ingress_request_id, item.local_execution_id, item.recorded_at].filter(Boolean).join('|');
    }
    function selectLocalIngressEvidence(item) {
      if (!item) return;
      state.localIngressEvidenceFocus = item;
      const request = (state.operationProduct?.local_ingress_requests || []).find((entry) => entry.local_ingress_request_id === item.local_ingress_request_id);
      if (request) state.localIngressRequestFocus = request;
      renderLocalIngressEvidenceNavigator(state.operationProduct?.local_ingress_evidence || []);
      renderLocalIngressRequestNavigator(state.operationProduct?.local_ingress_requests || []);
      updateControlRoom();
    }
    function renderLocalIngressEvidenceNavigator(items = []) {
      if (items.length === 0) {
        state.localIngressEvidenceFocus = null;
        el('localIngressEvidenceNavigator').innerHTML = '<div class="empty">No local ingress evidence loaded.</div>';
        renderLocalIngressEvidenceFocusDetail();
        return;
      }
      if (state.localIngressEvidenceFocus) state.localIngressEvidenceFocus = items.find((item) => localIngressEvidenceKey(item) === localIngressEvidenceKey(state.localIngressEvidenceFocus)) || state.localIngressEvidenceFocus;
      if (!state.localIngressEvidenceFocus) state.localIngressEvidenceFocus = items[0];
      el('localIngressEvidenceNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (localIngressEvidenceKey(item) === localIngressEvidenceKey(state.localIngressEvidenceFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.local_execution_status || 'unknown', item.local_ingress_evidence_id || item.local_execution_id || 'local_ingress_evidence'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.local_ingress_request_id, item.local_executor_authority, item.local_filesystem_mutation_admission, item.repository_publication_admission].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectLocalIngressEvidence(item));
        node.append(title, meta);
        return node;
      }));
      renderLocalIngressEvidenceFocusDetail();
    }
    function localIngressEvidenceFocusContext(item = {}) {
      return [
        ['Evidence', item.local_ingress_evidence_id || 'none'],
        ['Request', item.local_ingress_request_id || 'none'],
        ['Local Execution', item.local_execution_id || 'none'],
        ['Status', item.local_execution_status || 'unknown'],
        ['Executor Authority', item.local_executor_authority || 'windows_local_ingress_executor'],
        ['Windows Admission', [item.windows_admission_action, item.windows_admission_reason].filter(Boolean).join(' / ') || 'none'],
        ['Local Filesystem Mutation', item.local_filesystem_mutation_admission || 'not_observed'],
        ['Changed Files', String(item.changed_file_count ?? item.evidence?.changed_files?.length ?? 0)],
        ['Rollback Evidence', item.rollback_evidence_ref || 'none'],
        ['Direct Cloudflare Filesystem Mutation', item.direct_cloudflare_filesystem_mutation_admission || 'not_admitted'],
        ['Repository Publication', item.repository_publication_admission || 'not_admitted'],
        ['Cloudflare Evidence Store', 'cloudflare_local_ingress_evidence_store'],
        ['Posture', item.evidence_posture || 'windows_local_ingress_executed_cloudflare_recorded_evidence'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderLocalIngressEvidenceFocusDetail(item = state.localIngressEvidenceFocus) {
      if (!item) {
        el('localIngressEvidenceFocusDetail').innerHTML = '<div class="empty">No local ingress evidence selected.</div>';
        return;
      }
      el('localIngressEvidenceFocusDetail').replaceChildren(...localIngressEvidenceFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function localIngressProviderHeartbeatKey(item = {}) {
      return item.local_ingress_provider_heartbeat_id || [item.provider_id, item.recorded_at, item.last_run_at].filter(Boolean).join('|');
    }
    function selectLocalIngressProviderHeartbeat(item) {
      if (!item) return;
      state.localIngressProviderHeartbeatFocus = item;
      renderLocalIngressProviderHeartbeatNavigator(state.operationProduct?.local_ingress_provider_heartbeats || []);
      updateControlRoom();
    }
    function renderLocalIngressProviderHeartbeatNavigator(items = []) {
      if (items.length === 0) {
        state.localIngressProviderHeartbeatFocus = null;
        el('localIngressProviderHeartbeatNavigator').innerHTML = '<div class="empty">No local ingress provider heartbeats loaded.</div>';
        renderLocalIngressProviderHeartbeatFocusDetail();
        return;
      }
      if (state.localIngressProviderHeartbeatFocus) state.localIngressProviderHeartbeatFocus = items.find((item) => localIngressProviderHeartbeatKey(item) === localIngressProviderHeartbeatKey(state.localIngressProviderHeartbeatFocus)) || state.localIngressProviderHeartbeatFocus;
      if (!state.localIngressProviderHeartbeatFocus) state.localIngressProviderHeartbeatFocus = items[0];
      el('localIngressProviderHeartbeatNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (localIngressProviderHeartbeatKey(item) === localIngressProviderHeartbeatKey(state.localIngressProviderHeartbeatFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.status || 'unknown', item.local_ingress_provider_heartbeat_id || item.provider_id || 'local_ingress_provider_heartbeat'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.provider_authority, item.direct_cloudflare_filesystem_mutation_admission, item.repository_publication_admission, item.recorded_at || item.last_run_at].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectLocalIngressProviderHeartbeat(item));
        node.append(title, meta);
        return node;
      }));
      renderLocalIngressProviderHeartbeatFocusDetail();
    }
    function localIngressProviderHeartbeatFocusContext(item = state.localIngressProviderHeartbeatFocus) {
      const product = state.operationProduct || {};
      const surface = product.operation_product_surface || {};
      const liveness = surface.local_ingress_provider_liveness || product.operation_lifecycle_status?.local_ingress_provider_liveness || {};
      return [
        ['Heartbeat', item?.local_ingress_provider_heartbeat_id || 'none'],
        ['Site', item?.site_id || product.site?.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', item?.operation_id || product.operation?.operation_id || el('operationId').value.trim() || 'none'],
        ['Provider', item?.provider_id || 'none'],
        ['Provider Authority', item?.provider_authority || 'windows_local_ingress_executor'],
        ['Provider Status', item?.status || 'unknown'],
        ['Last Run', item?.last_run_at || 'none'],
        ['Recorded', item?.recorded_at || 'none'],
        ['Liveness State', liveness.state || 'not_observed'],
        ['Liveness Reason', liveness.reason || 'not_observed'],
        ['Liveness Authority', surface.local_ingress_provider_liveness_authority || liveness.provider_liveness_authority || 'not_observed'],
        ['Heartbeat Count', String(surface.local_ingress_provider_heartbeat_count ?? (product.local_ingress_provider_heartbeats || []).length)],
        ['Direct Cloudflare Filesystem Mutation', item?.direct_cloudflare_filesystem_mutation_admission || surface.local_ingress_direct_cloudflare_filesystem_mutation_admission || 'not_admitted'],
        ['Repository Publication', item?.repository_publication_admission || surface.local_ingress_repository_publication_admission || 'not_admitted'],
        ['Authority Partition', item?.authority_partition || surface.local_ingress_authority_partition || 'cloudflare_records_windows_local_ingress_provider_liveness_without_direct_filesystem_authority'],
      ];
    }
    function renderLocalIngressProviderHeartbeatFocusDetail(item = state.localIngressProviderHeartbeatFocus) {
      if (!item && (state.operationProduct?.local_ingress_provider_heartbeats || []).length === 0) {
        el('localIngressProviderHeartbeatFocusDetail').innerHTML = '<div class="empty">No local ingress provider heartbeat selected.</div>';
        return;
      }
      el('localIngressProviderHeartbeatFocusDetail').replaceChildren(...localIngressProviderHeartbeatFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function repositoryPublicationRequestKey(item = {}) {
      return item.repository_publication_request_id || [item.site_id, item.publication_ref, item.recorded_at].filter(Boolean).join('|');
    }
    function selectRepositoryPublicationRequest(item) {
      if (!item) return;
      state.repositoryPublicationRequestFocus = item;
      renderRepositoryPublicationRequestNavigator(state.operationProduct?.repository_publication_requests || []);
      updateControlRoom();
    }
    function renderRepositoryPublicationRequestNavigator(items = []) {
      if (items.length === 0) {
        state.repositoryPublicationRequestFocus = null;
        el('repositoryPublicationRequestNavigator').innerHTML = '<div class="empty">No repository publication requests loaded.</div>';
        renderRepositoryPublicationRequestFocusDetail();
        return;
      }
      if (state.repositoryPublicationRequestFocus) state.repositoryPublicationRequestFocus = items.find((item) => repositoryPublicationRequestKey(item) === repositoryPublicationRequestKey(state.repositoryPublicationRequestFocus)) || state.repositoryPublicationRequestFocus;
      if (!state.repositoryPublicationRequestFocus) state.repositoryPublicationRequestFocus = items[0];
      el('repositoryPublicationRequestNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (repositoryPublicationRequestKey(item) === repositoryPublicationRequestKey(state.repositoryPublicationRequestFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.repository_publication_admission || 'pending_windows_publication_admission', item.repository_publication_request_id || 'repository_publication_request'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.publication_ref, item.repository_ref, item.branch_ref, item.cloudflare_git_push_admission].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectRepositoryPublicationRequest(item));
        node.append(title, meta);
        return node;
      }));
      renderRepositoryPublicationRequestFocusDetail();
    }
    function repositoryPublicationRequestFocusContext(item = {}) {
      return [
        ['Request', item.repository_publication_request_id || 'none'],
        ['Site', item.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', item.operation_id || el('operationId').value.trim() || 'none'],
        ['Task', item.task_id || 'none'],
        ['Publication Ref', item.publication_ref || 'none'],
        ['Requested Action', item.requested_action_ref || 'none'],
        ['Repository', item.repository_ref || 'none'],
        ['Branch', item.branch_ref || 'none'],
        ['Source Change', item.source_change_ref || 'none'],
        ['Request Authority', item.authority_locus || 'cloudflare_repository_publication_request_queue'],
        ['Executor Authority', item.repository_publication_executor_authority || 'windows_repository_publication_executor'],
        ['Publication Admission', item.repository_publication_admission || 'pending_windows_publication_admission'],
        ['Cloudflare Git Push', item.cloudflare_git_push_admission || 'not_admitted'],
        ['Direct Cloudflare Repository Mutation', item.direct_cloudflare_repository_mutation_admission || 'not_admitted'],
        ['Authority Partition', item.authority_partition || 'cloudflare_queues_governed_repository_publication_request_windows_admits_publishes_and_returns_evidence'],
        ['Rollback Plan', item.rollback_plan_ref || 'none'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderRepositoryPublicationRequestFocusDetail(item = state.repositoryPublicationRequestFocus) {
      const action = el('executeRepositoryPublication');
      const readinessAction = el('readRepositoryPublicationReadiness');
      if (!item) {
        el('repositoryPublicationRequestFocusDetail').innerHTML = '<div class="empty">No repository publication request selected.</div>';
        renderRepositoryPublicationReadinessDetail(null);
        if (action) action.disabled = true;
        if (readinessAction) readinessAction.disabled = true;
        return;
      }
      if (action) action.disabled = false;
      if (readinessAction) readinessAction.disabled = false;
      const readinessRequestId = state.repositoryPublicationReadinessFocus?.repository_publication_request_id || null;
      if (readinessRequestId && readinessRequestId !== item.repository_publication_request_id) renderRepositoryPublicationReadinessDetail(null);
      el('repositoryPublicationRequestFocusDetail').replaceChildren(...repositoryPublicationRequestFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function selectedRepositoryPublicationRequest() {
      return state.repositoryPublicationRequestFocus || (state.operationProduct?.repository_publication_requests || [])[0] || null;
    }
    function repositoryPublicationReadinessContext(item = {}) {
      return [
        ['Readiness', item.readiness_status || 'unknown'],
        ['Request', item.repository_publication_request_id || 'none'],
        ['Site', item.site_id || el('siteId').value.trim() || 'none'],
        ['Repository', item.requested_repository_ref || 'none'],
        ['Branch', item.requested_branch_ref || 'none'],
        ['GitHub Credential Mode', item.github_credential_mode || 'unknown'],
        ['GitHub Token Configured', String(Boolean(item.github_token_configured))],
        ['GitHub Token Secret', item.github_token_secret_ref || 'none'],
        ['GitHub App Configured', String(Boolean(item.github_app_configured))],
        ['Repository Allowed', String(item.requested_repository_allowed ?? 'unknown')],
        ['Branch Allowed', String(item.requested_branch_allowed ?? 'unknown')],
        ['Allowed Repositories', String(item.allowed_repository_count ?? 0)],
        ['Allowed Branches', String(item.allowed_branch_count ?? 0)],
        ['Missing Configuration', (item.missing_configuration || []).join(', ') || 'none'],
        ['Direct Cloudflare Repository Mutation', item.direct_cloudflare_repository_mutation_admission || 'not_admitted'],
        ['Authority Partition', item.authority_partition || 'unknown'],
      ];
    }
    function renderRepositoryPublicationReadinessDetail(item = state.repositoryPublicationReadinessFocus) {
      if (!item) {
        state.repositoryPublicationReadinessFocus = null;
        el('repositoryPublicationReadinessDetail').innerHTML = '<div class="empty">No repository publication readiness loaded.</div>';
        return;
      }
      state.repositoryPublicationReadinessFocus = item;
      el('repositoryPublicationReadinessDetail').replaceChildren(...repositoryPublicationReadinessContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    async function readFocusedRepositoryPublicationReadiness() {
      const request = selectedRepositoryPublicationRequest();
      if (!request) throw new Error('No repository publication request selected.');
      const body = await api.readRepositoryPublicationReadiness(request);
      const readiness = { ...body, repository_publication_request_id: request.repository_publication_request_id || null };
      renderRepositoryPublicationReadinessDetail(readiness);
      appendConsoleEvidence('repository_publication_cloudflare_execution_readiness_read', {
        repository_publication_request_id: request.repository_publication_request_id || null,
        readiness_status: readiness.readiness_status || 'unknown',
        github_credential_mode: readiness.github_credential_mode || 'unknown',
        github_token_configured: Boolean(readiness.github_token_configured),
        github_app_configured: Boolean(readiness.github_app_configured),
        github_token_secret_ref: readiness.github_token_secret_ref || 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN',
        missing_configuration: readiness.missing_configuration || [],
        direct_cloudflare_repository_mutation_admission: readiness.direct_cloudflare_repository_mutation_admission || 'not_admitted',
      });
    }
    async function executeFocusedRepositoryPublication() {
      const request = selectedRepositoryPublicationRequest();
      if (!request) throw new Error('No repository publication request selected.');
      const body = await api.executeRepositoryPublication(request);
      appendConsoleEvidence('repository_publication_cloudflare_execution_requested', {
        repository_publication_request_id: request.repository_publication_request_id,
        repository_publication_execution_id: body.execution?.repository_publication_execution_id || null,
        publication_status: body.publication_status || body.execution?.publication_status || 'unknown',
        repository_publication_executor_authority: body.repository_publication_executor_authority || body.execution?.repository_publication_executor_authority || 'cloudflare_github_repository_publication_executor',
        direct_cloudflare_repository_mutation_admission: body.direct_cloudflare_repository_mutation_admission || body.execution?.direct_cloudflare_repository_mutation_admission || 'admitted_by_cloudflare_github_repository_publication',
      });
      await refreshOperation();
      const executionId = body.execution?.repository_publication_execution_id;
      const execution = (state.operationProduct?.repository_publication_executions || []).find((entry) => entry.repository_publication_execution_id === executionId);
      if (execution) selectRepositoryPublicationExecution(execution);
    }
    function repositoryPublicationEvidenceKey(item = {}) {
      return item.repository_publication_evidence_id || [item.repository_publication_request_id, item.publication_execution_id, item.recorded_at].filter(Boolean).join('|');
    }
    function selectRepositoryPublicationEvidence(item) {
      if (!item) return;
      state.repositoryPublicationEvidenceFocus = item;
      const request = (state.operationProduct?.repository_publication_requests || []).find((entry) => entry.repository_publication_request_id === item.repository_publication_request_id);
      if (request) state.repositoryPublicationRequestFocus = request;
      renderRepositoryPublicationEvidenceNavigator(state.operationProduct?.repository_publication_evidence || []);
      renderRepositoryPublicationRequestNavigator(state.operationProduct?.repository_publication_requests || []);
      updateControlRoom();
    }
    function renderRepositoryPublicationEvidenceNavigator(items = []) {
      if (items.length === 0) {
        state.repositoryPublicationEvidenceFocus = null;
        el('repositoryPublicationEvidenceNavigator').innerHTML = '<div class="empty">No repository publication evidence loaded.</div>';
        renderRepositoryPublicationEvidenceFocusDetail();
        return;
      }
      if (state.repositoryPublicationEvidenceFocus) state.repositoryPublicationEvidenceFocus = items.find((item) => repositoryPublicationEvidenceKey(item) === repositoryPublicationEvidenceKey(state.repositoryPublicationEvidenceFocus)) || state.repositoryPublicationEvidenceFocus;
      if (!state.repositoryPublicationEvidenceFocus) state.repositoryPublicationEvidenceFocus = items[0];
      el('repositoryPublicationEvidenceNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (repositoryPublicationEvidenceKey(item) === repositoryPublicationEvidenceKey(state.repositoryPublicationEvidenceFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.publication_status || 'unknown', item.repository_publication_evidence_id || item.publication_execution_id || 'repository_publication_evidence'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.repository_publication_request_id, item.repository_ref, item.branch_ref, item.published_commit_ref].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectRepositoryPublicationEvidence(item));
        node.append(title, meta);
        return node;
      }));
      renderRepositoryPublicationEvidenceFocusDetail();
    }
    function repositoryPublicationEvidenceFocusContext(item = {}) {
      return [
        ['Evidence', item.repository_publication_evidence_id || 'none'],
        ['Request', item.repository_publication_request_id || 'none'],
        ['Publication Execution', item.publication_execution_id || 'none'],
        ['Publication Ref', item.publication_ref || 'none'],
        ['Requested Action', item.requested_action_ref || 'none'],
        ['Repository', item.repository_ref || 'none'],
        ['Branch', item.branch_ref || 'none'],
        ['Source Change', item.source_change_ref || 'none'],
        ['Windows Admission', item.windows_admission_action || 'unknown'],
        ['Publication Status', item.publication_status || 'unknown'],
        ['Published Commit', item.published_commit_ref || 'none'],
        ['Rollback Evidence', item.rollback_evidence_ref || 'none'],
        ['Cloudflare Git Push', item.cloudflare_git_push_admission || 'not_admitted'],
        ['Direct Cloudflare Repository Mutation', item.direct_cloudflare_repository_mutation_admission || 'not_admitted'],
        ['Cloudflare Evidence Store', 'cloudflare_repository_publication_evidence_store'],
        ['Posture', item.evidence_posture || 'windows_repository_publication_executed_cloudflare_recorded_evidence'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderRepositoryPublicationEvidenceFocusDetail(item = state.repositoryPublicationEvidenceFocus) {
      if (!item) {
        el('repositoryPublicationEvidenceFocusDetail').innerHTML = '<div class="empty">No repository publication evidence selected.</div>';
        return;
      }
      el('repositoryPublicationEvidenceFocusDetail').replaceChildren(...repositoryPublicationEvidenceFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function repositoryPublicationExecutionKey(item = {}) {
      return item.repository_publication_execution_id || [item.repository_publication_request_id, item.github_ref, item.recorded_at].filter(Boolean).join('|');
    }
    function selectRepositoryPublicationExecution(item) {
      if (!item) return;
      state.repositoryPublicationExecutionFocus = item;
      const request = (state.operationProduct?.repository_publication_requests || []).find((entry) => entry.repository_publication_request_id === item.repository_publication_request_id);
      if (request) state.repositoryPublicationRequestFocus = request;
      renderRepositoryPublicationExecutionNavigator(state.operationProduct?.repository_publication_executions || []);
      renderRepositoryPublicationRequestNavigator(state.operationProduct?.repository_publication_requests || []);
      updateControlRoom();
    }
    function renderRepositoryPublicationExecutionNavigator(items = []) {
      if (items.length === 0) {
        state.repositoryPublicationExecutionFocus = null;
        el('repositoryPublicationExecutionNavigator').innerHTML = '<div class="empty">No Cloudflare repository publication executions loaded.</div>';
        renderRepositoryPublicationExecutionFocusDetail();
        return;
      }
      if (state.repositoryPublicationExecutionFocus) state.repositoryPublicationExecutionFocus = items.find((item) => repositoryPublicationExecutionKey(item) === repositoryPublicationExecutionKey(state.repositoryPublicationExecutionFocus)) || state.repositoryPublicationExecutionFocus;
      if (!state.repositoryPublicationExecutionFocus) state.repositoryPublicationExecutionFocus = items[0];
      el('repositoryPublicationExecutionNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (repositoryPublicationExecutionKey(item) === repositoryPublicationExecutionKey(state.repositoryPublicationExecutionFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.publication_status || 'unknown', item.repository_publication_execution_id || 'repository_publication_execution'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.repository_publication_request_id, item.repository_ref, item.branch_ref, item.published_commit_ref || item.source_change_ref].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectRepositoryPublicationExecution(item));
        node.append(title, meta);
        return node;
      }));
      renderRepositoryPublicationExecutionFocusDetail();
    }
    function repositoryPublicationExecutionFocusContext(item = {}) {
      const product = state.operationProduct || {};
      const surface = product.operation_product_surface || {};
      return [
        ['Execution', item.repository_publication_execution_id || 'none'],
        ['Request', item.repository_publication_request_id || 'none'],
        ['Publication Ref', item.publication_ref || 'none'],
        ['Requested Action', item.requested_action_ref || 'none'],
        ['Repository', item.repository_ref || 'none'],
        ['Branch', item.branch_ref || 'none'],
        ['Source Change', item.source_change_ref || 'none'],
        ['Publication Status', item.publication_status || 'unknown'],
        ['Published Commit', item.published_commit_ref || 'none'],
        ['GitHub Ref', item.github_ref || 'none'],
        ['GitHub Status', item.github_status || 'none'],
        ['Executor Authority', item.repository_publication_executor_authority || 'cloudflare_github_repository_publication_executor'],
        ['Admission Authority', item.repository_publication_admission_authority || 'cloudflare_repository_publication_admission_controller'],
        ['Publication Admission', item.repository_publication_admission || 'admitted_by_cloudflare_repository_publication'],
        ['Cloudflare Git Push', item.cloudflare_git_push_admission || 'not_admitted'],
        ['Direct Cloudflare Repository Mutation', item.direct_cloudflare_repository_mutation_admission || 'admitted_by_cloudflare_github_repository_publication'],
        ['Execution Count', String(surface.repository_publication_execution_count ?? (product.repository_publication_executions || []).length)],
        ['Authority Partition', item.authority_partition || surface.repository_publication_authority_partition || 'cloudflare_admits_and_executes_github_repository_publication'],
        ['Recorded', item.recorded_at || 'none'],
      ];
    }
    function renderRepositoryPublicationExecutionFocusDetail(item = state.repositoryPublicationExecutionFocus) {
      if (!item) {
        el('repositoryPublicationExecutionFocusDetail').innerHTML = '<div class="empty">No Cloudflare repository publication execution selected.</div>';
        return;
      }
      el('repositoryPublicationExecutionFocusDetail').replaceChildren(...repositoryPublicationExecutionFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function repositoryPublicationProviderHeartbeatKey(item = {}) {
      return item.repository_publication_provider_heartbeat_id || [item.provider_id, item.recorded_at, item.last_run_at].filter(Boolean).join('|');
    }
    function selectRepositoryPublicationProviderHeartbeat(item) {
      if (!item) return;
      state.repositoryPublicationProviderHeartbeatFocus = item;
      renderRepositoryPublicationProviderHeartbeatNavigator(state.operationProduct?.repository_publication_provider_heartbeats || []);
      updateControlRoom();
    }
    function renderRepositoryPublicationProviderHeartbeatNavigator(items = []) {
      if (items.length === 0) {
        state.repositoryPublicationProviderHeartbeatFocus = null;
        el('repositoryPublicationProviderHeartbeatNavigator').innerHTML = '<div class="empty">No repository publication provider heartbeats loaded.</div>';
        renderRepositoryPublicationProviderHeartbeatFocusDetail();
        return;
      }
      if (state.repositoryPublicationProviderHeartbeatFocus) state.repositoryPublicationProviderHeartbeatFocus = items.find((item) => repositoryPublicationProviderHeartbeatKey(item) === repositoryPublicationProviderHeartbeatKey(state.repositoryPublicationProviderHeartbeatFocus)) || state.repositoryPublicationProviderHeartbeatFocus;
      if (!state.repositoryPublicationProviderHeartbeatFocus) state.repositoryPublicationProviderHeartbeatFocus = items[0];
      el('repositoryPublicationProviderHeartbeatNavigator').replaceChildren(...items.map((item) => {
        const node = document.createElement('article');
        node.className = 'shadow-read-item' + (repositoryPublicationProviderHeartbeatKey(item) === repositoryPublicationProviderHeartbeatKey(state.repositoryPublicationProviderHeartbeatFocus) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [item.status || 'unknown', item.repository_publication_provider_heartbeat_id || item.provider_id || 'repository_publication_provider_heartbeat'].join(' ');
        const meta = document.createElement('span');
        meta.textContent = [item.provider_authority, item.cloudflare_git_push_admission, item.direct_cloudflare_repository_mutation_admission, item.recorded_at || item.last_run_at].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectRepositoryPublicationProviderHeartbeat(item));
        node.append(title, meta);
        return node;
      }));
      renderRepositoryPublicationProviderHeartbeatFocusDetail();
    }
    function repositoryPublicationProviderHeartbeatFocusContext(item = state.repositoryPublicationProviderHeartbeatFocus) {
      const product = state.operationProduct || {};
      const surface = product.operation_product_surface || {};
      const liveness = surface.repository_publication_provider_liveness || product.operation_lifecycle_status?.repository_publication_provider_liveness || {};
      return [
        ['Heartbeat', item?.repository_publication_provider_heartbeat_id || 'none'],
        ['Site', item?.site_id || product.site?.site_id || el('siteId').value.trim() || 'none'],
        ['Operation', item?.operation_id || product.operation?.operation_id || el('operationId').value.trim() || 'none'],
        ['Provider', item?.provider_id || 'none'],
        ['Provider Authority', item?.provider_authority || 'windows_repository_publication_executor'],
        ['Provider Status', item?.status || 'unknown'],
        ['Last Run', item?.last_run_at || 'none'],
        ['Recorded', item?.recorded_at || 'none'],
        ['Liveness State', liveness.state || 'not_observed'],
        ['Liveness Reason', liveness.reason || 'not_observed'],
        ['Liveness Authority', surface.repository_publication_provider_liveness_authority || liveness.provider_liveness_authority || 'not_observed'],
        ['Heartbeat Count', String(surface.repository_publication_provider_heartbeat_count ?? (product.repository_publication_provider_heartbeats || []).length)],
        ['Cloudflare Git Push', item?.cloudflare_git_push_admission || surface.repository_publication_cloudflare_git_push_admission || 'not_admitted'],
        ['Direct Cloudflare Repository Mutation', item?.direct_cloudflare_repository_mutation_admission || surface.repository_publication_direct_cloudflare_repository_mutation_admission || 'not_admitted'],
        ['Authority Partition', item?.authority_partition || surface.repository_publication_authority_partition || 'cloudflare_records_windows_repository_publication_provider_liveness_without_direct_repository_authority'],
      ];
    }
    function renderRepositoryPublicationProviderHeartbeatFocusDetail(item = state.repositoryPublicationProviderHeartbeatFocus) {
      if (!item && (state.operationProduct?.repository_publication_provider_heartbeats || []).length === 0) {
        el('repositoryPublicationProviderHeartbeatFocusDetail').innerHTML = '<div class="empty">No repository publication provider heartbeat selected.</div>';
        return;
      }
      el('repositoryPublicationProviderHeartbeatFocusDetail').replaceChildren(...repositoryPublicationProviderHeartbeatFocusContext(item).map(([label, value]) => evidenceField(label, value)));
    }
    function siteProductStatusSummary(status) {
      const missing = (status?.missing || []).join(', ') || 'none';
      const attention = (status?.attention || []).join(', ') || 'none';
      return [
        status?.health || 'unknown',
        'next=' + (status?.next_action || 'none'),
        'missing=' + missing,
        'attention=' + attention,
      ].join(' | ');
    }
    function countMapSummary(counts = {}) {
      const entries = Object.entries(counts || {}).filter(([, value]) => Number(value) > 0);
      return entries.length > 0 ? entries.map(([key, value]) => key + '=' + value).join(' | ') : 'none';
    }
    function renderSitesProduct(product) {
      state.siteList = product.sites || [];
      state.siteProductStatuses = product.site_product_statuses || [];
      state.siteProductOverview = product.site_product_overview || null;
      state.sitePostureRoute = product.site_posture_route || null;
      renderOperatorIdentity(product.reader_principal || state.operatorPrincipal);
      const overview = state.siteProductOverview || {};
      const health = overview.health_counts || {};
      el('sitesOverview').replaceChildren(
        ...[
          ['Schema', overview.schema || 'none'],
          ['Sites', overview.site_count ?? state.siteList.length],
          ['Ready', health.ready ?? 0],
          ['Attention', health.attention ?? 0],
          ['Incomplete', health.incomplete ?? 0],
          ['Next Site', overview.next_site_id || 'none'],
          ['Next Health', overview.next_health || 'ready'],
          ['Next Action', overview.next_action || 'monitor_sites'],
          ['Next Reason', overview.next_reason || 'all_sites_monitoring'],
          ['Action Counts', countMapSummary(overview.action_counts)],
          ['Missing Counts', countMapSummary(overview.missing_counts)],
          ['Attention Counts', countMapSummary(overview.attention_counts)],
        ].map(([label, value]) => evidenceField(label, value)),
      );
      if (state.siteProductStatuses.length === 0) {
        el('sitesStatusList').innerHTML = '<div class="empty">No site statuses loaded.</div>';
      } else {
        el('sitesStatusList').replaceChildren(...state.siteProductStatuses.map((status) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'attention-item';
          item.textContent = (status.site_id || 'unknown-site') + ' / ' + siteProductStatusSummary(status);
          item.addEventListener('click', () => focusSiteFromStatus(status));
          return item;
        }));
      }
      updateControlRoom();
    }
    function focusSiteFromStatus(status) {
      const siteId = status?.site_id;
      if (!siteId) return;
      const site = state.siteList.find((entry) => entry.site_id === siteId) || { site_id: siteId, status: status.site_status };
      el('siteId').value = siteId;
      state.siteFocus = site;
      renderSiteFocusDetail(site);
      if (status.next_action === 'operation' || (status.missing || []).includes('operation')) prepareOperationDraftForSite(site, status);
      run(refreshSiteProduct);
    }
    function focusNextSiteFromOverview() {
      const nextSiteId = state.siteProductOverview?.next_site_id || state.siteProductStatuses[0]?.site_id;
      const status = state.siteProductStatuses.find((entry) => entry.site_id === nextSiteId) || state.siteProductStatuses[0];
      if (status) focusSiteFromStatus(status);
    }
    function renderSiteProduct(product) {
      state.operationProduct = product;
      state.productScope = 'site';
      state.operations = product.operations || [];
      renderOperatorIdentity(product.reader_principal || state.operatorPrincipal);
      renderSiteFocusDetail(product.site || state.siteFocus);
      el('siteStatus').textContent = product.site?.status || 'unknown';
      el('operationStatus').textContent = 'site scope';
      el('membershipRole').textContent = product.membership?.role || 'none';
      el('sessionCount').textContent = String((product.sessions || []).length);
      el('taskCount').textContent = String((product.tasks || []).length);
      el('evidenceCount').textContent = String((product.carrier_evidence || []).length);
      renderEvidenceReplayMetric(product);
      el('authorityCount').textContent = String((product.authority_events || []).length);
      el('continuityCount').textContent = String((product.site_continuity_packets || []).length);
      renderTasks(product.tasks || []);
      renderMembershipNavigator(currentMemberships(product));
      renderContinuityNavigator(continuityItems(product));
      renderWebhookDelayShadowNavigator(product.webhook_delay_shadow_observations || []);
      renderWebhookDelayDirectiveNavigator(product.webhook_delay_directive_records || []);
      renderWebhookDelayDirectiveDeliveryNavigator(product.webhook_delay_directive_deliveries || []);
      renderWebhookDelayEvidenceChain(product);
      renderResidentLoopShadowNavigator(product.resident_loop_shadow_runs || []);
      renderResidentDispatchNavigator(product.resident_dispatch_decisions || []);
      renderLocalIngressRequestNavigator(product.local_ingress_requests || []);
      renderLocalIngressEvidenceNavigator(product.local_ingress_evidence || []);
      renderLocalIngressProviderHeartbeatNavigator(product.local_ingress_provider_heartbeats || []);
      renderRepositoryPublicationRequestNavigator(product.repository_publication_requests || []);
      renderRepositoryPublicationEvidenceNavigator(product.repository_publication_evidence || []);
      renderRepositoryPublicationProviderHeartbeatNavigator(product.repository_publication_provider_heartbeats || []);
      renderAttentionQueue(extractOperationAttention(product));
      renderAuthorityState(product);
      renderAuthorityPath(product);
      renderProductScopeDetail(product);
      renderFocusedOperationLifecycle(product);
      renderOperationFlightDeck(product);
      renderPersistencePosture(product);
      renderRecoveryPosture(product);
      renderAuthorityTransfer(product);
      renderOperationActivityTimeline(product);
      renderOperationPath(focusedOperation(), product);
      updateControlRoom();
      const siteItems = [
        listItem('site_id', product.site?.site_id),
        listItem('display_name', product.site?.display_name),
        listItem('principal', product.reader_principal?.email || product.reader_principal?.principal_id),
      ];
      const operationItems = (product.operations || []).map((operation) => listItem(operation.operation_id, [operation.status, operation.operation_kind, operation.display_name].filter(Boolean).join(' | ')));
      const membershipItems = (product.memberships || []).map((membership) => listItem(membership.principal_id, membership.role + ' / ' + membership.status));
      const sessionItems = (product.sessions || []).map((session) => listItem(session.carrier_session_id, session.binding_status || session.agent_id));
      const authorityItems = (product.authority_events || []).map((event) => listItem(event.event_kind, authoritySummary(event)));
      const authorityRoutingItems = (product.site_authority?.decisions || []).map((decision) => listItem(decision.mutation_class, authorityRouteSummary(decision)));
      const continuityItems = (product.site_continuity?.decisions || []).map((decision) => listItem(decision.exchange_class, continuitySummary(decision)));
      const continuityPacketItems = (product.site_continuity_packets || []).map((packet) => listItem(packet.packet_id, packet.admission_action || packet.imported_at));
      const continuityLoopReportItems = (product.site_continuity_loop_reports || []).map((report) => listItem(report.report_id, [report.status, report.cloudflare_push_status, report.recorded_at].filter(Boolean).join(' | ')));
      const webhookDelayShadowItems = (product.webhook_delay_shadow_observations || []).map((entry) => listItem(entry.observation_id || entry.generated_at, [entry.classification_state, entry.latest_delay_minutes, entry.dispatch_action || 'none'].filter((value) => value != null && value !== '').join(' | ')));
      const webhookDelayDirectiveItems = (product.webhook_delay_directive_records || []).map((entry) => listItem(entry.directive_record_id || entry.directive_intent?.directive_id, [entry.classification_state, entry.directive_authority, entry.fallback_status, entry.directive_action, entry.carrier_admission?.directive_visibility].filter((value) => value != null && value !== '').join(' | ')));
      const webhookDelayDirectiveDeliveryItems = (product.webhook_delay_directive_deliveries || []).map((entry) => listItem(entry.delivery_id || entry.directive_delivery_id, [entry.delivery_state, entry.carrier_session_id, entry.directive_authority, entry.dispatch_authority, entry.fallback_status].filter((value) => value != null && value !== '').join(' | ')));
      const residentLoopShadowItems = (product.resident_loop_shadow_runs || []).map((entry) => listItem(entry.loop_run_id || entry.run_started_at, [entry.loop_status, 'steps=' + (entry.step_count ?? 'unknown'), 'attention=' + (entry.operator_attention_count ?? 'unknown'), entry.dispatch_action || 'none'].filter((value) => value != null && value !== '').join(' | ')));
      const residentDispatchItems = (product.resident_dispatch_decisions || []).map((entry) => listItem(entry.dispatch_decision_id || entry.carrier_session_id, [entry.decision_state, entry.dispatch_authority, entry.fallback_status, entry.dispatch_action].filter((value) => value != null && value !== '').join(' | ')));
      const localIngressRequestItems = (product.local_ingress_requests || []).map((entry) => listItem(entry.local_ingress_request_id, [entry.local_execution_admission, entry.requested_action_ref, entry.target_authority_locus].filter((value) => value != null && value !== '').join(' | ')));
      const localIngressEvidenceItems = (product.local_ingress_evidence || []).map((entry) => listItem(entry.local_ingress_evidence_id, [entry.local_execution_status, entry.local_ingress_request_id, entry.local_filesystem_mutation_admission].filter((value) => value != null && value !== '').join(' | ')));
      const repositoryPublicationRequestItems = (product.repository_publication_requests || []).map((entry) => listItem(entry.repository_publication_request_id, [entry.repository_publication_admission, entry.publication_ref, entry.repository_ref].filter((value) => value != null && value !== '').join(' | ')));
      const repositoryPublicationEvidenceItems = (product.repository_publication_evidence || []).map((entry) => listItem(entry.repository_publication_evidence_id, [entry.publication_status, entry.repository_publication_request_id, entry.published_commit_ref].filter((value) => value != null && value !== '').join(' | ')));
      const repositoryPublicationProviderHeartbeatItems = (product.repository_publication_provider_heartbeats || []).map((entry) => listItem(entry.repository_publication_provider_heartbeat_id, [entry.status, entry.provider_id, entry.provider_authority, entry.recorded_at].filter((value) => value != null && value !== '').join(' | ')));
      const productSurfaceReadiness = product.cloudflare_product_surface_readiness || {};
      const productSurfaceReadinessItems = [
        listItem('status', productSurfaceReadiness.status || 'unknown'),
        listItem('coverage', productSurfaceReadiness.coverage || 'unknown'),
        listItem('next', [productSurfaceReadiness.next_check, productSurfaceReadiness.next_action].filter(Boolean).join(' | ') || 'monitor_product_surface_readiness'),
        listItem('required_failures', productSurfaceReadiness.required_failure_count ?? 'unknown'),
        listItem('attention', productSurfaceReadiness.attention_count ?? 'unknown'),
        listItem('full_gate', productSurfaceReadiness.full_product_gate_command || 'pnpm cloudflare:product:readiness'),
        ...(productSurfaceReadiness.required_checks || []).map((check) => listItem(check.key, [check.status, check.next_action].filter(Boolean).join(' | '))),
      ];
      const evidenceItems = (product.carrier_evidence || []).map((entry) => {
        const kinds = (entry.events || []).slice(0, 5).map((event) => event.event_kind).join(', ');
        return listItem(entry.carrier_session_id, kinds || entry.error || 'no events');
      });
      renderOperationNavigator(product.operations || []);
      renderOperationSessions(product.sessions || []);
      el('productOverview').replaceChildren(
        renderListBlock('Site', siteItems),
        renderListBlock('Operations', operationItems),
        renderListBlock('Memberships', membershipItems),
        renderListBlock('Sessions', sessionItems),
        renderListBlock('Operation Attention', state.attentionItems.map((item) => listItem(item.directive_id, [item.reason, item.operation_id].filter(Boolean).join(' | ')))),
        renderListBlock('Tasks', (product.tasks || []).map((task) => listItem(task.task_id, [task.status, task.carrier_session_id].filter(Boolean).join(' | ')))),
        renderListBlock('Authority Events', authorityItems),
        renderListBlock('Authority Routing', authorityRoutingItems),
        renderListBlock('Site Continuity', continuityItems),
        renderListBlock('Continuity Packets', continuityPacketItems),
        renderListBlock('Continuity Loop Reports', continuityLoopReportItems),
        renderListBlock('Webhook Delay Shadow Reads', webhookDelayShadowItems),
        renderListBlock('Webhook Delay Directive Intents', webhookDelayDirectiveItems),
        renderListBlock('Webhook Delay Directive Deliveries', webhookDelayDirectiveDeliveryItems),
        renderListBlock('Resident Loop Shadow Reads', residentLoopShadowItems),
        renderListBlock('Resident Dispatch', residentDispatchItems),
        renderListBlock('Local Ingress Requests', localIngressRequestItems),
        renderListBlock('Local Ingress Evidence', localIngressEvidenceItems),
        renderListBlock('Repository Publication Requests', repositoryPublicationRequestItems),
        renderListBlock('Repository Publication Evidence', repositoryPublicationEvidenceItems),
        renderListBlock('Repository Publication Provider Heartbeats', repositoryPublicationProviderHeartbeatItems),
        renderListBlock('Product Surface Readiness', productSurfaceReadinessItems),
        renderListBlock('Carrier Evidence', evidenceItems),
      );
      renderLastAuthority((product.authority_events || [])[0]);
      updateControlRoom();
    }
    function renderOperationSessions(sessions = []) {
      const select = el('operationSessionSelect');
      const current = el('sessionId').value.trim();
      select.replaceChildren(...(sessions.length === 0
        ? [new Option('No operation sessions loaded', '')]
        : sessions.map((session) => new Option(session.carrier_session_id + ' / ' + (session.binding_status || session.agent_id || 'active'), session.carrier_session_id))));
      if (sessions.some((session) => session.carrier_session_id === current)) select.value = current;
      renderSessionNavigator(sessions);
      renderActiveSessionDetail();
    }
    function renderOperationProduct(product) {
      state.operationProduct = product;
      state.productScope = 'operation';
      if (Array.isArray(product.operations)) state.operations = product.operations;
      renderOperatorIdentity(product.reader_principal || state.operatorPrincipal);
      renderSiteFocusDetail(product.site || state.siteFocus);
      if (product.operation?.operation_id && !state.operations.some((operation) => operation.operation_id === product.operation.operation_id)) {
        state.operations = [product.operation, ...state.operations];
      }
      const surface = product.operation_product_surface || {};
      el('siteStatus').textContent = product.operation?.site_id || product.site?.status || 'unknown';
      el('operationStatus').textContent = product.operation?.status || 'unknown';
      el('membershipRole').textContent = product.membership?.role || 'none';
      el('sessionCount').textContent = String(surface.session_count ?? (product.sessions || []).length);
      el('taskCount').textContent = String(surface.task_count ?? (product.tasks || []).length);
      el('evidenceCount').textContent = String(surface.carrier_evidence_count ?? (product.carrier_evidence || []).length);
      renderEvidenceReplayMetric(product);
      el('authorityCount').textContent = String((product.authority_events || []).length + (product.site_authority?.decisions || []).length);
      el('continuityCount').textContent = String(surface.continuity_packet_count ?? (product.site_continuity_packets || []).length);
      renderTasks(product.tasks || []);
      renderMembershipNavigator(currentMemberships(product));
      renderContinuityNavigator(continuityItems(product));
      renderWebhookDelayShadowNavigator(product.webhook_delay_shadow_observations || []);
      renderWebhookDelayDirectiveNavigator(product.webhook_delay_directive_records || []);
      renderWebhookDelayDirectiveDeliveryNavigator(product.webhook_delay_directive_deliveries || []);
      renderWebhookDelayEvidenceChain(product);
      renderResidentLoopShadowNavigator(product.resident_loop_shadow_runs || []);
      renderResidentDispatchNavigator(product.resident_dispatch_decisions || []);
      renderLocalIngressRequestNavigator(product.local_ingress_requests || []);
      renderLocalIngressEvidenceNavigator(product.local_ingress_evidence || []);
      renderRepositoryPublicationRequestNavigator(product.repository_publication_requests || []);
      renderRepositoryPublicationEvidenceNavigator(product.repository_publication_evidence || []);
      renderRepositoryPublicationProviderHeartbeatNavigator(product.repository_publication_provider_heartbeats || []);
      renderOperationNavigator(state.operations || []);
      renderOperationSessions(product.sessions || []);
      renderAttentionQueue(extractOperationAttention(product));
      renderAuthorityState(product);
      renderAuthorityPath(product);
      renderProductScopeDetail(product);
      renderFocusedOperationLifecycle(product);
      renderOperationFlightDeck(product);
      renderPersistencePosture(product);
      renderRecoveryPosture(product);
      renderAuthorityTransfer(product);
      renderOperationActivityTimeline(product);
      renderOperationPath(focusedOperation(), product);
      updateControlRoom();
      const operationItems = [
        listItem('operation_id', product.operation?.operation_id),
        listItem('display_name', product.operation?.display_name),
        listItem('kind', product.operation?.operation_kind),
        listItem('status', product.operation?.status),
      ];
      const surfaceItems = [
        listItem('schema', surface.schema),
        listItem('sessions', surface.session_count),
        listItem('tasks', surface.task_count),
        listItem('evidence', surface.carrier_evidence_count),
        listItem('continuity_packets', surface.continuity_packet_count),
        listItem('continuity_loop_reports', surface.continuity_loop_report_count),
        listItem('webhook_delay_shadow_reads', surface.webhook_delay_shadow_observation_count),
        listItem('webhook_delay_directive_intents', surface.webhook_delay_directive_record_count),
        listItem('webhook_delay_directive_deliveries', surface.webhook_delay_directive_delivery_count),
        listItem('resident_loop_shadow_reads', surface.resident_loop_shadow_run_count),
        listItem('resident_dispatch_decisions', surface.resident_dispatch_decision_count),
        listItem('local_ingress_requests', surface.local_ingress_request_count),
        listItem('local_ingress_evidence', surface.local_ingress_evidence_count),
        listItem('dispatch_authority', surface.dispatch_authority),
      ];
      const sessionItems = (product.sessions || []).map((session) => listItem(session.carrier_session_id, session.binding_status || session.agent_id));
      const taskItems = (product.tasks || []).map((task) => listItem(task.task_id, [task.status, task.carrier_session_id].filter(Boolean).join(' | ')));
      const authorityDecisionItems = (product.site_authority?.decisions || []).map((decision) => listItem(decision.mutation_class, authorityRouteSummary(decision)));
      const authorityEventItems = (product.authority_events || []).map((event) => listItem(event.event_kind, authoritySummary(event)));
      const continuityDecisionItems = (product.site_continuity?.decisions || []).map((decision) => listItem(decision.exchange_class, continuitySummary(decision)));
      const continuityPacketItems = (product.site_continuity_packets || []).map((packet) => listItem(packet.packet_id, packet.admission_action || packet.imported_at));
      const continuityLoopReportItems = (product.site_continuity_loop_reports || []).map((report) => listItem(report.report_id, [report.status, report.cloudflare_push_status, report.recorded_at].filter(Boolean).join(' | ')));
      const webhookDelayShadowItems = (product.webhook_delay_shadow_observations || []).map((entry) => listItem(entry.observation_id || entry.generated_at, [entry.classification_state, entry.latest_delay_minutes, entry.dispatch_action || 'none'].filter((value) => value != null && value !== '').join(' | ')));
      const webhookDelayDirectiveItems = (product.webhook_delay_directive_records || []).map((entry) => listItem(entry.directive_record_id || entry.directive_intent?.directive_id, [entry.classification_state, entry.directive_authority, entry.fallback_status, entry.directive_action, entry.carrier_admission?.directive_visibility].filter((value) => value != null && value !== '').join(' | ')));
      const webhookDelayDirectiveDeliveryItems = (product.webhook_delay_directive_deliveries || []).map((entry) => listItem(entry.delivery_id || entry.directive_delivery_id, [entry.delivery_state, entry.carrier_session_id, entry.directive_authority, entry.dispatch_authority, entry.fallback_status].filter((value) => value != null && value !== '').join(' | ')));
      const residentLoopShadowItems = (product.resident_loop_shadow_runs || []).map((entry) => listItem(entry.loop_run_id || entry.run_started_at, [entry.loop_status, 'steps=' + (entry.step_count ?? 'unknown'), 'attention=' + (entry.operator_attention_count ?? 'unknown'), entry.dispatch_action || 'none'].filter((value) => value != null && value !== '').join(' | ')));
      const residentDispatchItems = (product.resident_dispatch_decisions || []).map((entry) => listItem(entry.dispatch_decision_id || entry.carrier_session_id, [entry.decision_state, entry.dispatch_authority, entry.fallback_status, entry.dispatch_action].filter((value) => value != null && value !== '').join(' | ')));
      const localIngressRequestItems = (product.local_ingress_requests || []).map((entry) => listItem(entry.local_ingress_request_id, [entry.local_execution_admission, entry.requested_action_ref, entry.target_authority_locus].filter((value) => value != null && value !== '').join(' | ')));
      const localIngressEvidenceItems = (product.local_ingress_evidence || []).map((entry) => listItem(entry.local_ingress_evidence_id, [entry.local_execution_status, entry.local_ingress_request_id, entry.local_filesystem_mutation_admission].filter((value) => value != null && value !== '').join(' | ')));
      const evidenceItems = (product.carrier_evidence || []).map((entry) => {
        const kinds = (entry.events || []).slice(0, 5).map((event) => event.event_kind).join(', ');
        return listItem(entry.carrier_session_id, kinds || entry.error || 'no events');
      });
      el('productOverview').replaceChildren(
        renderListBlock('Operation', operationItems),
        renderListBlock('Product Surface', surfaceItems),
        renderListBlock('Sessions', sessionItems),
        renderListBlock('Operation Attention', state.attentionItems.map((item) => listItem(item.directive_id, [item.reason, item.operation_id].filter(Boolean).join(' | ')))),
        renderListBlock('Tasks', taskItems),
        renderListBlock('Authority Decisions', authorityDecisionItems),
        renderListBlock('Authority Events', authorityEventItems),
        renderListBlock('Continuity Decisions', continuityDecisionItems),
        renderListBlock('Continuity Packets', continuityPacketItems),
        renderListBlock('Continuity Loop Reports', continuityLoopReportItems),
        renderListBlock('Webhook Delay Shadow Reads', webhookDelayShadowItems),
        renderListBlock('Webhook Delay Directive Intents', webhookDelayDirectiveItems),
        renderListBlock('Webhook Delay Directive Deliveries', webhookDelayDirectiveDeliveryItems),
        renderListBlock('Resident Loop Shadow Reads', residentLoopShadowItems),
        renderListBlock('Resident Dispatch', residentDispatchItems),
        renderListBlock('Local Ingress Requests', localIngressRequestItems),
        renderListBlock('Local Ingress Evidence', localIngressEvidenceItems),
        renderListBlock('Carrier Evidence', evidenceItems),
      );
      renderLastAuthority((product.authority_events || [])[0]);
      updateControlRoom();
    }
    function evidencePayload(event) {
      const payload = event.payload || {};
      const evidence = {
        code: payload.code,
        message: payload.message,
        operation: payload.operation,
        http_status: payload.http_status,
        site_registry_reason: payload.site_registry_reason,
        site_authority_decision: payload.site_authority_decision,
        provider: payload.provider_adapter_kind || payload.provider_request_status || payload.provider_execution_enabled,
        tool_name: payload.tool_name,
        status: payload.status,
        admission_action: payload.admission_action,
        admission_reason: payload.admission_reason,
        capability_ref: payload.capability_ref,
        effect_scope: payload.effect_scope,
        authority_ref: payload.authority_ref,
        directive_kind: payload.directive_kind,
        directive_id: payload.directive_id,
        input_event_id: payload.input_event_id,
        reason: payload.reason,
        target: payload.target,
        result_summary: payload.result_summary,
        text_delta: payload.text_delta,
      };
      return Object.fromEntries(Object.entries(evidence).filter(([, value]) => value !== undefined));
    }
    function compactEvidenceValue(value) {
      if (value == null || value === '') return 'none';
      if (typeof value === 'string') return value.length > 220 ? value.slice(0, 217) + '...' : value;
      return JSON.stringify(value);
    }
    function evidenceReplayStatus(product = state.operationProduct || {}) {
      return product.operation_product_surface?.carrier_evidence_read_status
        || product.carrier_evidence_read_status
        || product.site_product_status?.carrier_evidence_read_status
        || null;
    }
    function evidenceReplaySources(product = state.operationProduct || {}) {
      const sources = [...new Set((product.carrier_evidence || []).map((entry) => entry.source || 'cloudflare-durable-object'))];
      return sources.join(', ') || 'none';
    }
    function evidenceReplaySessionSummary(status = evidenceReplayStatus() || {}) {
      if (!status) return 'unknown';
      return [
        'offset=' + (status.session_read_offset ?? 0),
        'limit=' + (status.session_read_limit ?? 'unknown'),
        'readable=' + (status.readable_session_count ?? 0),
        'missing=' + (status.missing_session_count ?? 0),
        'failed=' + (status.failed_session_count ?? 0),
        'truncated=' + (status.truncated_session_count ?? 0),
        'next=' + (status.next_session_offset ?? 'none'),
      ].join(' / ');
    }
    function operationStatusHistory(product = state.operationProduct || {}) {
      return product.operation_product_surface?.status_history
        || product.operation_status_history
        || null;
    }
    function operationStatusTransitionSummary(history = operationStatusHistory()) {
      if (!history) return 'unknown';
      return String(history.transition_count ?? (history.transitions || []).length ?? 0) + ' transitions';
    }
    function operationLatestStatusTransitionLabel(history = operationStatusHistory()) {
      const transition = history?.latest_transition || (history?.transitions || []).at(-1) || null;
      if (!transition) return 'none';
      return [
        (transition.from_status || 'unknown') + ' -> ' + (transition.to_status || 'unknown'),
        transition.principal_id || 'unknown-principal',
        transition.recorded_at || 'unknown-time',
      ].join(' / ');
    }
    function operationActivityTimeline(product = state.operationProduct || {}) {
      return product.operation_product_surface?.activity_timeline
        || product.operation_activity_timeline
        || null;
    }
    function operationActivityTimelineSummary(product = state.operationProduct || {}) {
      const timeline = operationActivityTimeline(product);
      if (!timeline) return 'unknown';
      return String(timeline.activity_count ?? (timeline.items || []).length ?? 0) + ' activities';
    }
    function operationLatestActivityLabel(product = state.operationProduct || {}) {
      const activity = operationActivityTimeline(product)?.latest_activity || null;
      if (!activity) return 'none';
      return [activity.activity_kind, activity.title, activity.occurred_at || 'unknown-time'].filter(Boolean).join(' / ');
    }
    function operationActivityFocusContext(activity = state.operationActivityFocus) {
      if (!activity) return [];
      return [
        ['Activity', activity.activity_id || 'none'],
        ['Kind', activity.activity_kind || 'unknown'],
        ['Title', activity.title || 'none'],
        ['Summary', activity.summary || 'none'],
        ['Occurred', activity.occurred_at || 'unknown'],
        ['Source Ref', activity.source_ref || 'none'],
        ['Focus Kind', activity.focus_kind || 'unknown'],
        ['Focus Ref', activity.focus_ref || 'none'],
        ['Principal', activity.principal_id || 'none'],
        ['Next Action', activity.focus_kind ? 'apply_activity_focus' : 'inspect_activity'],
      ];
    }
    function renderOperationActivityFocusDetail(activity = state.operationActivityFocus) {
      const target = el('operationActivityFocusDetail');
      if (!target) return;
      const context = operationActivityFocusContext(activity);
      if (!context.length) {
        target.innerHTML = '<div class="empty">No operation activity selected.</div>';
        return;
      }
      target.replaceChildren(...context.map(([label, value]) => evidenceField(label, value)));
    }
    function applyFocusedOperationActivity() {
      if (state.operationActivityFocus) selectOperationActivity(state.operationActivityFocus);
    }
    function selectOperationActivity(activity) {
      if (!activity) return;
      state.operationActivityFocus = activity;
      const product = state.operationProduct || {};
      const ref = activity.focus_ref || activity.source_ref || '';
      if (activity.focus_kind === 'operation_session') {
        const session = (product.sessions || []).find((entry) => entry.carrier_session_id === ref);
        if (session) selectOperationSession(session);
      } else if (activity.focus_kind === 'operation_task') {
        const task = (product.tasks || []).find((entry) => entry.task_id === ref);
        if (task) selectTask(task);
      } else if (activity.focus_kind === 'site_continuity_packet') {
        const item = continuityItems(product).find((entry) => entry.packet_id === ref);
        if (item) selectContinuity(item);
      } else if (activity.focus_kind === 'webhook_delay_directive_record') {
        const directive = (product.webhook_delay_directive_records || []).find((entry) => entry.directive_record_id === ref || entry.directive_intent?.directive_id === ref);
        if (directive) selectWebhookDelayDirective(directive);
      } else if (activity.focus_kind === 'webhook_delay_directive_delivery') {
        const delivery = (product.webhook_delay_directive_deliveries || []).find((entry) => entry.delivery_id === ref || entry.directive_delivery_id === ref);
        if (delivery) selectWebhookDelayDirectiveDelivery(delivery);
      } else if (activity.focus_kind === 'resident_loop_shadow_read') {
        const run = (product.resident_loop_shadow_runs || []).find((entry) => entry.loop_run_id === ref);
        if (run) selectResidentLoopShadow(run);
      } else if (activity.focus_kind === 'resident_dispatch_decision') {
        const decision = (product.resident_dispatch_decisions || []).find((entry) => entry.dispatch_decision_id === ref || entry.carrier_session_id === ref);
        if (decision) selectResidentDispatch(decision);
      } else if (activity.focus_kind === 'local_ingress_request') {
        const request = (product.local_ingress_requests || []).find((entry) => entry.local_ingress_request_id === ref);
        if (request) selectLocalIngressRequest(request);
      } else if (activity.focus_kind === 'local_ingress_evidence') {
        const evidence = (product.local_ingress_evidence || []).find((entry) => entry.local_ingress_evidence_id === ref);
        if (evidence) selectLocalIngressEvidence(evidence);
      } else if (activity.focus_kind === 'operation_authority_event') {
        const event = (product.authority_events || []).find((entry) => entry.event_id === ref);
        if (event) renderLastAuthority(event);
        focusOperationPathAuthority();
      } else if (activity.focus_kind === 'carrier_evidence_event') {
        const [sessionId, sequenceOrKind] = String(ref).split(':');
        focusEvidenceFor((event) => event.carrier_session_id === sessionId && (String(event.sequence ?? event.event_id ?? event.event_kind ?? '') === sequenceOrKind || event.event_kind === activity.title));
      }
      renderOperationActivityTimeline(product);
      renderOperationActivityFocusDetail(activity);
      updateControlRoom();
    }
    function renderOperationActivityTimeline(product = state.operationProduct || {}) {
      const timeline = operationActivityTimeline(product);
      const target = el('operationActivityTimeline');
      if (!target) return;
      if (!timeline || !(timeline.items || []).length) {
        target.innerHTML = '<div class="empty">No operation activity loaded.</div>';
        renderOperationActivityFocusDetail();
        return;
      }
      if (state.operationActivityFocus) {
        state.operationActivityFocus = timeline.items.find((activity) => activity.activity_id === state.operationActivityFocus.activity_id) || state.operationActivityFocus;
      }
      target.replaceChildren(...timeline.items.slice(0, 30).map((activity) => {
        const node = document.createElement('article');
        node.className = 'attention-item' + (state.operationActivityFocus?.activity_id === activity.activity_id ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = [activity.occurred_at || 'unknown-time', activity.activity_kind].join(' | ');
        const meta = document.createElement('span');
        meta.textContent = [activity.title, activity.summary, activity.source_ref, activity.focus_kind].filter(Boolean).join(' | ');
        node.addEventListener('click', () => selectOperationActivity(activity));
        node.append(title, meta);
        return node;
      }));
    }
    function renderEvidenceReplayMetric(product = state.operationProduct || {}) {
      const status = evidenceReplayStatus(product);
      el('evidenceReplayStatus').textContent = status
        ? [status.state || 'unknown', evidenceReplaySources(product)].filter(Boolean).join(' / ')
        : 'unknown';
    }
    function evidenceField(label, value) {
      const node = document.createElement('div');
      node.className = 'evidence-field';
      const key = document.createElement('b');
      key.textContent = label;
      const body = document.createElement('span');
      body.textContent = compactEvidenceValue(value);
      node.append(key, body);
      return node;
    }
    function focusActionButton(id, label, action) {
      const button = document.createElement('button');
      button.id = id;
      button.className = 'secondary';
      button.textContent = label;
      button.addEventListener('click', action);
      return button;
    }
    function focusActionRow(...buttons) {
      const row = document.createElement('div');
      row.className = 'actions';
      row.style.gridColumn = '1 / -1';
      row.append(...buttons);
      return row;
    }
    function operatorPrincipalLabel(principal) {
      return principal?.email || principal?.name || principal?.principal_id || 'anonymous';
    }
    function operatorPrincipalContext(principal = {}) {
      return [
        ['Principal', operatorPrincipalLabel(principal)],
        ['Principal ID', principal.principal_id || 'none'],
        ['Auth Type', principal.auth_type || 'unknown'],
        ['Tenant', principal.tenant_id || 'none'],
        ['Object ID', principal.object_id || 'none'],
        ['Operator Session', principal.operator_session_id || 'none'],
        ['Controlled Actions', (principal.controlled_actions || []).join(', ') || 'none'],
      ];
    }
    function renderOperatorIdentity(principal = state.operatorPrincipal) {
      state.operatorPrincipal = principal || state.operatorPrincipal;
      if (!state.operatorPrincipal) {
        el('operatorIdentity').innerHTML = '<div class="empty">No operator session loaded.</div>';
        updateControlRoom();
        return;
      }
      el('operatorIdentity').replaceChildren(...operatorPrincipalContext(state.operatorPrincipal).map(([label, value]) => evidenceField(label, value)));
      updateControlRoom();
    }
    function runtimePostureContext(status = {}) {
      return [
        ['Provider', status.provider_adapter_posture || status.provider_adapter_kind || 'unknown'],
        ['Provider Kind', status.provider_adapter_kind || 'none'],
        ['Provider Execution', status.provider_execution_enabled ?? 'unknown'],
        ['Tool Effects', status.tool_effect_posture || 'unknown'],
        ['Tool Effect Kind', status.tool_effect_adapter_kind || 'none'],
        ['Supported Tools', (status.supported_tools || []).join(', ') || 'none'],
        ['Session', status.carrier_session_id || el('sessionId').value.trim() || 'none'],
        ['Tasks', (status.tasks || []).length],
        ['Events', status.event_count ?? state.events.length],
      ];
    }
    function renderRuntimePosture(status = state.runtimeStatus) {
      state.runtimeStatus = status || state.runtimeStatus;
      if (!state.runtimeStatus) {
        el('runtimePostureDetail').innerHTML = '<div class="empty">No runtime status loaded.</div>';
        return;
      }
      el('runtimePostureDetail').replaceChildren(...runtimePostureContext(state.runtimeStatus).map(([label, value]) => evidenceField(label, value)));
    }
    function siteFocusContext(site = {}) {
      return [
        ['Site', site.site_id || el('siteId').value.trim() || 'none'],
        ['Display Name', site.display_name || 'none'],
        ['Status', site.status || 'unknown'],
        ['Site Ref', site.site_ref || 'none'],
        ['Site Root', site.site_root || 'none'],
        ['Created', site.created_at || 'none'],
        ['Updated', site.updated_at || 'none'],
      ];
    }
    function focusedSite() {
      return state.siteFocus
        || state.operationProduct?.site
        || (el('siteId').value.trim() ? { site_id: el('siteId').value.trim() } : null);
    }
    function siteScopeLoaded(site = focusedSite()) {
      const siteId = site?.site_id || el('siteId').value.trim();
      return Boolean(siteId && state.productScope === 'site' && state.operationProduct?.site?.site_id === siteId);
    }
    function siteActionContext(site = focusedSite()) {
      const siteId = site?.site_id || el('siteId').value.trim() || '';
      const loaded = siteScopeLoaded(site);
      const operations = state.operationProduct?.operations || [];
      const memberships = currentMemberships(state.operationProduct || {});
      const authorityCount = (state.operationProduct?.authority_events || []).length + (state.operationProduct?.site_authority?.decisions || []).length;
      const command = classifyCloudflareSiteCommandState({
        site_id: siteId,
        scope_loaded: loaded,
        operation_count: operations.length,
        membership_count: memberships.length,
        authority_count: authorityCount,
      });
      return [
        ['Site', siteId || 'none'],
        ['Scope Loaded', loaded ? 'yes' : 'no'],
        ['Status', site?.status || state.operationProduct?.site?.status || 'unknown'],
        ['Command State', command.command_state],
        ['Command Action', command.command_action],
        ['Operations', operations.length],
        ['Memberships', memberships.length],
        ['Authority Items', authorityCount],
        ['Next Action', command.next_action],
      ];
    }
    function renderSiteActionSummary(site = focusedSite()) {
      if (!site) {
        el('siteActionSummary').innerHTML = '<div class="empty">No site action loaded.</div>';
        return;
      }
      el('siteActionSummary').replaceChildren(...siteActionContext(site).map(([label, value]) => evidenceField(label, value)));
    }
    function focusSiteOperation() {
      const operation = state.operationFocus || state.operations[0] || state.operationProduct?.operation || null;
      if (operation) run(() => selectOperation(operation));
      else prepareOperationDraftForSite(focusedSite(), focusedSiteProductStatus());
    }
    function siteOperationDraftId(site = focusedSite()) {
      const siteId = String(site?.site_id || el('siteId').value.trim() || 'site').replace(/[^A-Za-z0-9_]+/g, '_');
      return 'operation_' + siteId + '_control';
    }
    function siteOperationDraftDisplayName(site = focusedSite()) {
      const siteId = String(site?.site_id || el('siteId').value.trim() || 'site');
      const readable = siteId.replace(/^site_/, '').split(/[_\s-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
      return (readable || siteId) + ' Control Operation';
    }
    function focusedSiteProductStatus() {
      const siteId = focusedSite()?.site_id || el('siteId').value.trim();
      return state.siteProductStatuses.find((entry) => entry.site_id === siteId) || state.operationProduct?.site_product_status || null;
    }
    function prepareOperationDraftForSite(site = focusedSite(), status = focusedSiteProductStatus()) {
      const targetSite = site || (status?.site_id ? { site_id: status.site_id, status: status.site_status } : null);
      if (!targetSite?.site_id && !el('siteId').value.trim()) return;
      if (targetSite?.site_id) el('siteId').value = targetSite.site_id;
      el('newOperationId').value = siteOperationDraftId(targetSite);
      el('newOperationDisplayName').value = siteOperationDraftDisplayName(targetSite);
      el('newOperationKind').value = status?.next_action === 'operation' || (status?.missing || []).includes('operation') ? 'cloudflare_control' : (el('newOperationKind').value.trim() || 'cloudflare_control');
      renderSiteActionSummary(targetSite || focusedSite());
      updateControlRoom();
    }
    function focusSiteMembership() {
      const membership = state.membershipFocus || currentMemberships(state.operationProduct || {})[0] || null;
      if (membership) selectMembership(membership);
    }
    function renderSiteFocusDetail(site = state.siteFocus) {
      state.siteFocus = site || state.siteFocus;
      if (!state.siteFocus) {
        el('siteFocusDetail').innerHTML = '<div class="empty">No site loaded.</div>';
        renderSiteActionSummary();
        return;
      }
      renderSiteActionSummary(state.siteFocus);
      el('siteFocusDetail').replaceChildren(...siteFocusContext(state.siteFocus).map(([label, value]) => evidenceField(label, value)));
    }
    function evidenceMeaning(event) {
      const payload = event.payload || {};
      switch (event.event_kind) {
        case 'carrier_session_started': return 'Session admitted to the Cloudflare carrier runtime.';
        case 'carrier_command_executed': return 'Operator command entered the carrier command lane.';
        case 'input_admitted_to_turn': return 'Input entered a provider turn.';
        case 'turn_started': return 'Provider turn opened for the active session.';
        case 'provider_request_recorded': return 'Provider request recorded through ' + (payload.provider || payload.provider_adapter_kind || 'configured provider') + '.';
        case 'provider_text_delta_recorded': return 'Provider output recorded as carrier evidence.';
        case 'provider_tool_call_requested': return 'Provider requested tool ' + (payload.tool_name || 'unknown') + '.';
        case 'tool_call_requested': return 'Carrier requested tool execution for ' + (payload.tool_name || 'unknown') + '.';
        case 'tool_result_received': return 'Tool result recorded with status ' + (payload.status || 'unknown') + '.';
        case 'turn_completed': return 'Provider turn completed with posture ' + (payload.provider || payload.status || 'completed') + '.';
        case 'input_completed': return 'Input lifecycle reached a terminal state.';
        case 'directive_emitted': return 'Directive emitted for ' + (payload.directive_kind || 'unknown directive') + '.';
        case 'directive_receipt_recorded': return 'Directive receipt recorded by the carrier.';
        case 'directive_carrier_accepted_recorded': return 'Carrier accepted directive without provider work.';
        case 'directive_emission_authorized': return 'Directive emission was authorized.';
        case 'directive_emission_rule_recorded': return 'Directive emission rule was recorded.';
        case 'console_action_failed': return 'Console action failed before completing.';
        default: return 'Carrier evidence recorded for ' + (event.event_kind || 'unknown event') + '.';
      }
    }
    function evidenceActionContext(event) {
      const payload = event.payload || {};
      const siteAuthority = payload.site_authority_decision || {};
      const provider = payload.provider || payload.provider_adapter_kind || payload.provider_request_status || payload.provider_execution_enabled;
      const directive = payload.directive_kind || payload.directive_id || payload.input_event_id;
      const effect = payload.tool_name || payload.capability_ref || payload.effect_scope;
      const authority = payload.authority_ref || payload.admission_action || siteAuthority.action || siteAuthority.authority_locus;
      return [
        ['Meaning', evidenceMeaning(event)],
        ['Session', event.carrier_session_id || el('sessionId').value.trim() || 'none'],
        ['Event Kind', event.event_kind || 'unknown'],
        ['Authority', [authority, payload.admission_reason || siteAuthority.reason].filter(Boolean).join(' / ') || 'none'],
        ['Effect', [effect, payload.status].filter(Boolean).join(' / ') || 'none'],
        ['Provider', provider || 'none'],
        ['Directive', directive || 'none'],
        ['Result', payload.result_summary || payload.message || payload.code || 'none'],
      ];
    }
    function renderEvents() {
      el('eventCount').textContent = String(state.events.length);
      el('cursor').textContent = String(state.afterSequence);
      const events = visibleEvents();
      updateControlRoom();
      renderEvidenceFocus();
      renderEvidenceActionSummary();
      renderEvidenceLanes();
      renderEvidenceReviewQueue(events);
      if (events.length === 0) {
        el('events').innerHTML = '<div class="empty">No matching events read yet.</div>';
        return;
      }
      el('events').replaceChildren(...events.map((event) => {
        const node = document.createElement('article');
        node.className = 'event' + (state.evidenceFocus && eventKey(state.evidenceFocus) === eventKey(event) ? ' selected' : '');
        const title = document.createElement('strong');
        title.textContent = eventTitle(event);
        const summary = document.createElement('span');
        summary.textContent = evidenceMeaning(event);
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(evidencePayload(event), null, 2);
        node.addEventListener('click', () => { focusEvidence(event); renderEvents(); });
        node.append(title, summary, pre);
        return node;
      }));
      el('events').scrollTop = el('events').scrollHeight;
    }
    async function refreshStatus() {
      const status = await api.status();
      el('provider').textContent = status.provider_adapter_posture || status.provider_adapter_kind || 'unknown';
      el('effects').textContent = status.tool_effect_posture || 'unknown';
      renderRuntimePosture(status);
      renderTasks(status.tasks || []);
      return status;
    }
    function carrierEvidenceSessionLimit() {
      const parsed = Number.parseInt(el('carrierEvidenceSessionLimit').value, 10);
      if (!Number.isFinite(parsed)) return 10;
      return Math.max(1, Math.min(50, parsed));
    }
    function carrierEvidenceSessionOffset() {
      const parsed = Number.parseInt(el('carrierEvidenceSessionOffset').value, 10);
      if (!Number.isFinite(parsed)) return 0;
      return Math.max(0, parsed);
    }
    async function loadNextRecoveryEvidenceWindow() {
      const status = evidenceReplayStatus(state.operationProduct || {}) || {};
      if (status.next_session_offset == null) return refreshOperation();
      el('carrierEvidenceSessionOffset').value = String(status.next_session_offset);
      saveWorkbenchState();
      return refreshOperation();
    }
    async function refreshOperation() {
      saveWorkbenchState();
      const body = await api.readOperation();
      renderOperationProduct(body);
      appendEvents((body.carrier_evidence || []).flatMap((entry) => entry.events || []));
      return body;
    }
    async function refreshSiteProduct() {
      saveWorkbenchState();
      const body = await api.readSite();
      renderSiteProduct(body);
      appendEvents((body.carrier_evidence || []).flatMap((entry) => entry.events || []));
      return body;
    }
    async function refreshSitesProduct() {
      saveWorkbenchState();
      const body = await api.readSites();
      renderSitesProduct(body);
      return body;
    }
    async function createOperationFromWorkbench() {
      const operationId = el('newOperationId').value.trim();
      if (!operationId) throw new Error('Operation ID is required.');
      const displayName = el('newOperationDisplayName').value.trim() || operationId;
      const operationKind = el('newOperationKind').value.trim() || 'cloudflare_control';
      const body = await api.createOperation(operationId, displayName, operationKind);
      if (body.operation?.operation_id) setCurrentOperation(body.operation.operation_id);
      renderLastAuthority(null, {
        event_kind: 'operation.create',
        action: body.action || 'created',
        reason: body.action === 'updated' ? 'site_operation_updated' : 'site_operation_created',
        evidence: { operation_id: operationId, operation_kind: operationKind, status: body.operation?.status || 'active' },
      });
      await refreshOperation();
    }
    function selectedAttention() {
      if (state.attentionFocus) return state.attentionFocus;
      return state.attentionItems.find((item) => item.status !== 'resolved') || state.attentionItems[0] || null;
    }
    async function createTaskFromFocusedAttention() {
      const attention = selectedAttention();
      if (!attention) return;
      const body = await api.createTask(['attention', attention.directive_id, attention.reason].filter(Boolean).join(' '));
      appendEvents(body.events || []);
      await refreshStatus();
      await refreshOperation();
    }
    async function createTaskFromFocusedDirectiveIntent() {
      const directiveIntent = state.webhookDelayDirectiveFocus || (state.operationProduct?.webhook_delay_directive_records || [])[0] || null;
      if (!directiveIntent) return;
      const body = await api.createTask(directiveIntentTaskTitle(directiveIntent));
      appendEvents(body.events || []);
      await refreshStatus();
      await refreshOperation();
      const task = taskForDirectiveIntent(directiveIntent);
      if (task) selectTask(task);
    }
    async function resolveFocusedAttention() {
      const attention = selectedAttention();
      const taskId = el('updateTaskId').value.trim() || state.taskFocus?.task_id || '';
      if (!attention || !taskId) return;
      const note = ['resolved_attention', attention.directive_id, attention.input_event_id, attention.reason].filter(Boolean).join(' ');
      const body = await api.updateTask(taskId, 'done', note);
      appendEvents(body.events || []);
      await refreshStatus();
      await refreshOperation();
    }
    async function refreshOperatorSession() {
      const session = await api.session();
      if (session?.principal) {
        renderOperatorIdentity(session.principal);
        el('membershipRole').textContent = session.principal.email || session.principal.principal_id;
      }
    }
    async function run(action) {
      el('error').textContent = '';
      try { await action(); } catch (error) {
        el('error').textContent = error.message;
        appendConsoleEvidence('console_action_failed', {
          message: error.message,
          operation: error.details?.operation,
          http_status: error.details?.http_status,
          code: error.details?.body?.code,
          site_registry_reason: error.details?.body?.site_registry_reason,
          site_authority_decision: error.details?.body?.site_authority_decision,
        });
      }
    }
    function setAutoRefresh(enabled) {
      if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
      state.autoRefreshTimer = enabled ? setInterval(() => run(refreshOperation), 15000) : null;
      el('autoRefreshOperation').setAttribute('aria-pressed', enabled ? 'true' : 'false');
      el('autoRefreshOperation').textContent = enabled ? 'Auto Refresh On' : 'Auto Refresh';
    }
    el('signInMicrosoft').addEventListener('click', () => { window.location.href = '/auth/microsoft/login'; });
    el('siteId').addEventListener('change', saveWorkbenchState);
    el('operationId').addEventListener('change', saveWorkbenchState);
    el('sessionId').addEventListener('change', saveWorkbenchState);
    el('useSelectedSession').addEventListener('click', () => setCurrentSession(el('operationSessionSelect').value));
    el('operationSessionSelect').addEventListener('change', () => setCurrentSession(el('operationSessionSelect').value));
    el('readSessionEvidence').addEventListener('click', () => run(readSelectedSessionEvidence));
    el('sessionActionUseSession').addEventListener('click', useFocusedSession);
    el('sessionActionReadEvidence').addEventListener('click', () => run(readSelectedSessionEvidence));
    el('sessionActionFocusEvidence').addEventListener('click', focusFocusedSessionEvidence);
    el('focusSessionPathEvidence').addEventListener('click', focusSessionPathEvidence);
    el('focusSessionPathTask').addEventListener('click', focusSessionPathTask);
    el('focusSessionPathDelivery').addEventListener('click', focusSessionPathDelivery);
    el('focusSessionPathChain').addEventListener('click', focusSessionPathChain);
    el('sessionEvidenceApplyAction').addEventListener('click', () => run(applySessionEvidenceAction));
    el('sessionEvidenceFocusAction').addEventListener('click', focusSessionPathEvidence);
    el('sessionEvidenceTaskAction').addEventListener('click', focusSessionPathTask);
    el('eventKindFilter').addEventListener('change', renderEvents);
    el('eventSessionFilter').addEventListener('change', renderEvents);
    el('raiseAttention').addEventListener('click', () => run(async () => { const body = await api.emitAttention(); appendEvents(body.events || []); await refreshOperation(); }));
    el('taskFromAttention').addEventListener('click', () => run(createTaskFromFocusedAttention));
    el('taskFromDirectiveIntent').addEventListener('click', () => run(createTaskFromFocusedDirectiveIntent));
    el('focusWebhookDelayChainObservation').addEventListener('click', focusWebhookDelayChainObservation);
    el('focusWebhookDelayChainIntent').addEventListener('click', focusWebhookDelayChainIntent);
    el('focusWebhookDelayChainDelivery').addEventListener('click', focusWebhookDelayChainDelivery);
    el('focusWebhookDelayChainSession').addEventListener('click', focusWebhookDelayChainSession);
    el('focusWebhookDelayChainTask').addEventListener('click', focusWebhookDelayChainTask);
    el('resolveAttention').addEventListener('click', () => run(resolveFocusedAttention));
    el('start').addEventListener('click', () => run(async () => { const body = await api.start(); appendEvents([body.event].filter(Boolean)); await refreshStatus(); await refreshOperation(); }));
    el('refresh').addEventListener('click', () => run(refreshOperation));
    el('readOperation').addEventListener('click', () => run(refreshOperation));
    el('readOperationScope').addEventListener('click', () => run(refreshOperation));
    el('operationActionUseOperation').addEventListener('click', useFocusedOperation);
    el('operationActionReadOperation').addEventListener('click', () => run(refreshOperation));
    el('operationActionFocusSession').addEventListener('click', focusOperationSession);
    el('operationPostureNextAction').addEventListener('click', () => run(focusNextOperationFromPosture));
    el('focusOperationPathSession').addEventListener('click', focusOperationPathSession);
    el('focusOperationPathTask').addEventListener('click', focusOperationPathTask);
    el('focusOperationPathAttention').addEventListener('click', focusOperationPathAttention);
    el('focusOperationPathAuthority').addEventListener('click', focusOperationPathAuthority);
    el('focusOperationPathEvidence').addEventListener('click', focusOperationPathEvidence);
    el('controlRoomNextAction').addEventListener('click', applyControlRoomNextAction);
    el('operatorRouteNextAction').addEventListener('click', applyOperatorRouteNextAction);
    el('focusedOperationLifecycleNextAction').addEventListener('click', applyFocusedOperationLifecycleNextAction);
    el('workbenchReadinessNextAction').addEventListener('click', applyWorkbenchReadinessNextAction);
    el('operationControlBoardNextAction').addEventListener('click', applyControlRoomNextAction);
    el('operationControlBoardReadinessAction').addEventListener('click', applyWorkbenchReadinessNextAction);
    el('operationControlBoardEvidenceAction').addEventListener('click', focusFlightDeckEvidence);
    el('operationControlTargetNextAction').addEventListener('click', applyControlRoomNextAction);
    el('operationControlTargetEvidenceAction').addEventListener('click', focusFlightDeckEvidence);
    el('operationControlTargetReadinessAction').addEventListener('click', applyWorkbenchReadinessNextAction);
    el('operationActivityApplyFocus').addEventListener('click', applyFocusedOperationActivity);
    el('persistenceNextAction').addEventListener('click', applyPersistenceNextAction);
    el('recoveryNextAction').addEventListener('click', applyRecoveryNextAction);
    el('authorityTransferNextAction').addEventListener('click', applyAuthorityTransferNextAction);
    el('loadNextRecoveryEvidenceWindow').addEventListener('click', () => run(loadNextRecoveryEvidenceWindow));
    el('loadRecoveryEvidenceWindow').addEventListener('click', () => run(refreshOperation));
    el('carrierEvidenceSessionLimit').addEventListener('change', () => { el('carrierEvidenceSessionLimit').value = String(carrierEvidenceSessionLimit()); saveWorkbenchState(); });
    el('carrierEvidenceSessionOffset').addEventListener('change', () => { el('carrierEvidenceSessionOffset').value = String(carrierEvidenceSessionOffset()); saveWorkbenchState(); });
    el('startResidentDispatch').addEventListener('click', () => run(startResidentDispatchFromWorkbench));
    el('readRepositoryPublicationReadiness').addEventListener('click', () => run(readFocusedRepositoryPublicationReadiness));
    el('executeRepositoryPublication').addEventListener('click', () => run(executeFocusedRepositoryPublication));
    el('createOutlookDraftFromProposal').addEventListener('click', () => run(createOutlookDraftFromFocusedProposal));
    el('acknowledgeMailboxSendReview').addEventListener('click', () => run(acknowledgeFocusedMailboxSendReview));
    el('acknowledgeOperationFocusReview').addEventListener('click', () => run(acknowledgeFocusedOperationFocusReview));
    el('continuityWorkflowNextAction').addEventListener('click', applyContinuityWorkflowNextStep);
    el('authorityNextAction').addEventListener('click', applyAuthorityNextAction);
    el('authorityReadSiteAction').addEventListener('click', () => run(refreshSiteProduct));
    el('authorityActionEvidenceAction').addEventListener('click', focusAuthorityEvidence);
    el('authorityPathFocusDecision').addEventListener('click', focusAuthorityPathDecision);
    el('authorityPathFocusEvidence').addEventListener('click', focusAuthorityEvidence);
    el('authorityPathRefresh').addEventListener('click', refreshAuthorityPath);
    el('authorityDecisionApplyAction').addEventListener('click', applyAuthorityDecisionReview);
    el('authorityDecisionEvidenceAction').addEventListener('click', focusAuthorityEvidence);
    el('authorityDecisionRefreshAction').addEventListener('click', refreshAuthorityPath);
    el('prepareFocusedSiteOperation').addEventListener('click', () => prepareOperationDraftForSite(focusedSite(), focusedSiteProductStatus()));
    el('createOperation').addEventListener('click', () => run(createOperationFromWorkbench));
    el('autoRefreshOperation').addEventListener('click', () => setAutoRefresh(!state.autoRefreshTimer));
    el('readSites').addEventListener('click', () => run(refreshSitesProduct));
    el('sitesOverviewNextAction').addEventListener('click', focusNextSiteFromOverview);
    el('readSite').addEventListener('click', () => run(refreshSiteProduct));
    el('readSiteScope').addEventListener('click', () => run(refreshSiteProduct));
    el('siteActionReadSite').addEventListener('click', () => run(refreshSiteProduct));
    el('siteActionFocusOperation').addEventListener('click', focusSiteOperation);
    el('siteActionFocusMembership').addEventListener('click', focusSiteMembership);
    el('membershipActionPut').addEventListener('click', () => run(putFocusedMembership));
    el('membershipActionReadSite').addEventListener('click', () => run(refreshSiteProduct));
    el('membershipActionFocusAuthority').addEventListener('click', focusMembershipAuthority);
    el('putMembership').addEventListener('click', () => run(putFocusedMembership));
    el('read').addEventListener('click', () => run(async () => { const body = await api.readEvents(); appendEvents(body.events || []); await refreshStatus(); }));
    el('taskTitle').addEventListener('input', renderTaskCommandPreview);
    el('updateTaskId').addEventListener('input', () => { renderTaskCommandPreview(); renderTaskEvidencePath(selectedTaskFromWorkbench()); renderTaskLifecycleControl(selectedTaskFromWorkbench()); });
    el('updateTaskStatus').addEventListener('input', () => { renderTaskCommandPreview(); renderTaskEvidencePath(selectedTaskFromWorkbench()); renderTaskLifecycleControl(selectedTaskFromWorkbench()); });
    el('updateTaskNote').addEventListener('input', () => { renderTaskCommandPreview(); renderTaskLifecycleControl(selectedTaskFromWorkbench()); });
    el('memberPrincipalId').addEventListener('input', () => renderMembershipActionSummary());
    el('memberRole').addEventListener('input', () => renderMembershipActionSummary());
    el('createTask').addEventListener('click', () => run(createTaskFromWorkbench));
    el('focusTaskEvidence').addEventListener('click', () => run(async () => { const task = selectedTaskFromWorkbench(); if (task) focusEvidenceFor(taskEvidencePredicate(task)); }));
    el('focusTaskPathSession').addEventListener('click', focusTaskPathSession);
    el('focusTaskPathEvidence').addEventListener('click', focusTaskPathEvidence);
    el('focusTaskPathDirective').addEventListener('click', focusTaskPathDirective);
    el('focusTaskPathDelivery').addEventListener('click', focusTaskPathDelivery);
    el('focusTaskPathChain').addEventListener('click', focusTaskPathChain);
    el('taskLifecycleApplyAction').addEventListener('click', () => run(applyTaskLifecycleAction));
    el('taskLifecycleEvidenceAction').addEventListener('click', focusTaskPathEvidence);
    el('taskLifecycleSessionAction').addEventListener('click', focusTaskPathSession);
    el('markTaskOpen').addEventListener('click', () => run(async () => { await updateFocusedTask('open', el('updateTaskNote').value.trim() || 'operator_marked_open'); }));
    el('markTaskDone').addEventListener('click', () => run(async () => { await updateFocusedTask('done', el('updateTaskNote').value.trim() || 'operator_marked_done'); }));
    el('updateTask').addEventListener('click', () => run(async () => {
      const status = el('updateTaskStatus').value.trim();
      if (!status) return;
      await updateFocusedTask(status);
    }));
    el('send').addEventListener('click', () => run(async () => { const content = el('input').value.trim(); if (!content) return; const body = await api.deliver(content); appendEvents(body.events || []); el('input').value = ''; await refreshStatus(); await refreshOperation(); }));
    loadWorkbenchState();
    refreshOperatorSession().then(() => refreshOperation()).catch((error) => appendConsoleEvidence('console_operation_autoload_failed', { message: error.message }));
  </script>
</body>
</html>`;
}

