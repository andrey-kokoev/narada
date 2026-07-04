import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { discoverNarsSessions } from '@narada2/carrier-runtime/nars-session-index';
import { listKnownSiteRootsForCli, resolveSiteRootForCli, type ResolvedSiteRoot } from '../lib/site-root-resolver.js';

const NARS_AUTHORITY_RUNTIME_HOST_KINDS = ['local', 'cloudflare-host'];
const NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_SCHEMA = 'narada.nars.authority_runtime_host_transition.v1';

export interface NarsSessionsOptions {
  siteRoot?: string;
  site?: string;
  health?: boolean;
  healthTimeoutMs?: number;
  limit?: number;
  format?: CliFormat;
  launchRegistryPath?: string;
}

function formatAuthorityTransitionPlan(plan: Record<string, unknown>): string {
  const lines = [
    'NARS authority host transition plan',
    `  session: ${plan.session_id ?? ''}`,
    `  from: ${plan.source_authority_runtime_host ?? 'unknown'} epoch ${plan.source_authority_epoch ?? 'unknown'}`,
    `  to: ${plan.target_authority_runtime_host ?? 'unknown'} epoch ${plan.target_authority_epoch ?? 'unknown'}`,
    `  state: ${plan.status ?? 'unknown'}`,
  ];
  const checks = Array.isArray(plan.checks) ? plan.checks as Array<Record<string, unknown>> : [];
  if (checks.length > 0) {
    lines.push('  checks:');
    for (const entry of checks) lines.push(`    ${entry.name}: ${entry.status} - ${entry.summary}`);
  }
  const refusals = Array.isArray(plan.refusals) ? plan.refusals as Array<Record<string, unknown>> : [];
  if (refusals.length > 0) {
    lines.push('  refusals:');
    for (const entry of refusals) lines.push(`    ${entry.reason_code}: ${entry.reason}`);
  }
  const warnings = Array.isArray(plan.warnings) ? plan.warnings as Array<Record<string, unknown>> : [];
  if (warnings.length > 0) {
    lines.push('  warnings:');
    for (const entry of warnings) lines.push(`    ${entry.code}: ${entry.message}`);
  }
  lines.push(`  next: ${plan.recommended_next_action ?? 'unknown'}`);
  return lines.join('\n');
}

export async function narsAuthorityTransitionPlanCommand(
  options: NarsAuthorityTransitionPlanOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const sessionId = options.session;
  if (!sessionId) throw new Error('nars_session_required: pass --session <session-id>');
  const targetHost = options.targetHost;
  if (!targetHost) throw new Error('nars_authority_target_host_required: pass --target-host <host-kind>');
  const siteResolutions = await resolveNarsSiteRoots(options);
  const matched = findSessionInSites(siteResolutions, sessionId);
  const plan = buildAuthorityTransitionPlan({ matched, sessionId, targetHost });
  return {
    exitCode: plan.status === 'feasible' ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: formattedResult(plan, formatAuthorityTransitionPlan(plan), options.format ?? 'auto'),
  };
}

async function resolveNarsSiteRoots(options: NarsSessionsOptions): Promise<ResolvedSiteRoot[]> {
  if (options.siteRoot || options.site) return [await resolveSiteRootForCli(options)];
  return listKnownSiteRootsForCli({ launchRegistryPath: options.launchRegistryPath });
}

async function probeSelectedSessionsBySiteRoot(
  selected: Array<{ siteResolution: ResolvedSiteRoot; session: Record<string, unknown> }>,
  timeoutMs: number,
): Promise<Map<string, Record<string, string>>> {
  const bySiteRoot = new Map<string, Record<string, unknown>[]>();
  for (const item of selected) {
    const entries = bySiteRoot.get(item.siteResolution.site_root) ?? [];
    entries.push(item.session);
    bySiteRoot.set(item.siteResolution.site_root, entries);
  }
  const result = new Map<string, Record<string, string>>();
  await Promise.all(Array.from(bySiteRoot.entries()).map(async ([siteRoot, sessions]) => {
    result.set(siteRoot, await probeSessionHealth(sessions, timeoutMs));
  }));
  return result;
}

function findSessionInSites(siteResolutions: ResolvedSiteRoot[], sessionId: string): { siteResolution: ResolvedSiteRoot; session: Record<string, unknown> } | null {
  for (const siteResolution of siteResolutions) {
    const discovery = discoverNarsSessions({ siteRoot: siteResolution.site_root });
    const session = discovery.sessions.find((candidate: Record<string, unknown>) => candidate.session_id === sessionId || candidate.carrier_session_id === sessionId);
    if (session) return { siteResolution, session };
  }
  return null;
}

function sessionKey(siteRoot: string, session: Record<string, unknown>): string {
  return `${siteRoot}\u0000${String(session.session_id ?? session.carrier_session_id ?? '')}`;
}

function toCommandSession(session: Record<string, unknown>, siteResolution: ResolvedSiteRoot): Record<string, unknown> {
  const record = session.record && typeof session.record === 'object' ? session.record as Record<string, unknown> : null;
  const heartbeat = session.heartbeat && typeof session.heartbeat === 'object' ? session.heartbeat as Record<string, unknown> : null;
  return {
    session_id: session.session_id,
    runtime_session_id: session.runtime_session_id,
    nars_session_id: session.nars_session_id,
    carrier_session_id: session.carrier_session_id,
    site_root: siteResolution.site_root,
    site_root_source: siteResolution.source,
    agent_id: session.agent_id,
    site_id: session.site_id ?? siteResolution.site_id,
    site_id_source: session.site_id_source,
    runtime_kind: record?.runtime_kind ?? null,
    launch_operator_surface_kind: session.launch_operator_surface_kind,
    started_at: session.started_at,
    last_seen_at: session.last_seen_at,
    terminal_state: session.terminal_state,
    status_hint: session.status_hint,
    status_hint_authority: session.status_hint_authority,
    display_state: session.display_state,
    display_state_reason: session.display_state_reason,
    heartbeat_fresh: session.heartbeat_fresh,
    heartbeat_age_ms: session.heartbeat_age_ms,
    heartbeat_at: heartbeat?.heartbeat_at ?? heartbeat?.timestamp ?? null,
    health_status: session.health_status,
    authority_runtime_host: session.authority_runtime_host,
    authority_epoch: session.authority_epoch,
    authority_runtime_id: session.authority_runtime_id,
    authority_transition_state: session.authority_transition_state,
    superseded_by_session_id: session.superseded_by_session_id,
    authority_locator_ref: session.authority_locator_ref,
    event_endpoint: session.event_endpoint,
    health_endpoint: session.health_endpoint,
    session_dir: session.session_dir,
    record_path: session.record_path,
    heartbeat_path: session.heartbeat_path,
    attached_projections_status: session.attached_projections_status,
  };
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 20;
  return Math.min(Math.trunc(limit), 200);
}

function buildAuthorityTransitionPlan({
  matched,
  sessionId,
  targetHost,
}: {
  matched: { siteResolution: ResolvedSiteRoot; session: Record<string, unknown> } | null;
  sessionId: string;
  targetHost: string;
}): Record<string, unknown> {
  const generatedAt = new Date().toISOString();
  const checks: Array<Record<string, unknown>> = [];
  const refusals: Array<Record<string, unknown>> = [];
  const warnings: Array<Record<string, unknown>> = [];
  if (!NARS_AUTHORITY_RUNTIME_HOST_KINDS.includes(targetHost)) {
    refusals.push(refusal('invalid_target_host', `Target host must be one of: ${NARS_AUTHORITY_RUNTIME_HOST_KINDS.join(', ')}`));
  }
  if (!matched) {
    refusals.push(refusal('session_not_found', `No NARS session index record found for ${sessionId}.`));
  }

  const session = matched?.session ?? null;
  const sourceHostRaw = session?.authority_runtime_host;
  const sourceEpochRaw = session?.authority_epoch;
  const sourceRuntimeIdRaw = session?.authority_runtime_id;
  const sourceHost = typeof sourceHostRaw === 'string' ? sourceHostRaw : 'unknown_legacy';
  const sourceEpoch = Number.isInteger(sourceEpochRaw) ? sourceEpochRaw as number : null;
  const sourceRuntimeId = typeof sourceRuntimeIdRaw === 'string' ? sourceRuntimeIdRaw : null;
  const feasibility = feasibilityEvidenceFromSession(session);
  if (matched) {
    checks.push(check('session_discovery', 'ok', `found ${sessionId} in ${matched.siteResolution.site_root}`));
    if (session?.display_state === 'stale' || session?.display_state === 'historical' || session?.heartbeat_fresh === false) {
      checks.push(check('stale_discovery', 'refused', 'session discovery is stale or historical'));
      refusals.push(refusal('session_discovery_stale', 'Session discovery is stale; rebuild or verify the live authority before planning.'));
    }
    if (!NARS_AUTHORITY_RUNTIME_HOST_KINDS.includes(sourceHost)) {
      refusals.push(refusal('authority_host_unknown_legacy', 'Session index record lacks comparable authority_runtime_host metadata.'));
    }
    if (sourceEpoch === null) {
      refusals.push(refusal('authority_epoch_unavailable', 'Session index record lacks comparable authority_epoch metadata.'));
    }
    if (sourceHost === targetHost) {
      refusals.push(refusal('target_host_matches_source', 'Target authority host must differ from source authority host.'));
    }
    checks.push(check('source_authority_metadata', sourceEpoch === null ? 'refused' : 'ok', `${sourceHost} epoch ${sourceEpoch ?? 'unknown'}`));
    applyFeasibilityChecks({ feasibility, targetHost, checks, refusals });
  }

  const status = refusals.length === 0 ? 'feasible' : 'refused';
  const targetEpoch = sourceEpoch === null ? null : sourceEpoch + 1;
  const sourceLastSequence = asNonNegativeInteger(feasibility?.event_cursor?.last_sequence);
  const queuePendingAtSeal = asNonNegativeInteger(feasibility?.operator_input_queue?.pending_count_at_seal) ?? asNonNegativeInteger(feasibility?.operator_input_queue?.pending_count) ?? 0;
  const queuePendingAtRequest = asNonNegativeInteger(feasibility?.operator_input_queue?.pending_count_at_request) ?? queuePendingAtSeal;
  const artifactMode = asNonEmptyString(feasibility?.artifacts?.mode) ?? 'registry_plus_admitted_content';
  const mcpFabricMode = asNonEmptyString(feasibility?.mcp_fabric?.mode) ?? 'compatibility_report_required';
  const mcpFabricStatus = asNonEmptyString(feasibility?.mcp_fabric?.status) ?? 'pending';
  const transitionRecordCandidate = status === 'feasible' && matched && sourceEpoch !== null
    ? {
      schema: NARS_AUTHORITY_RUNTIME_HOST_TRANSITION_SCHEMA,
      transition_id: `arht_plan_${String(sessionId).replace(/[^A-Za-z0-9_]+/g, '_')}_${targetHost.replace(/[^A-Za-z0-9]+/g, '_')}`,
      session_id: sessionId,
      session_lineage_id: `nars_lineage_${sessionId}`,
      agent_id: session?.agent_id ?? null,
      site_id: session?.site_id ?? matched.siteResolution.site_id ?? null,
      requested_by: 'operator',
      requested_at: generatedAt,
      state: 'proposed',
      source_authority_runtime: {
        authority_runtime_id: sourceRuntimeId,
        host_kind: sourceHost,
        authority_epoch: sourceEpoch,
        health_ref: session?.health_endpoint ?? 'session.health',
        authority_role: 'canonical_session_runtime',
        event_cursor: { last_sequence: sourceLastSequence ?? 0 },
      },
      target_authority_runtime: {
        authority_runtime_id: `auth_${targetHost.replace(/[^A-Za-z0-9]+/g, '_')}_${String(sessionId).replace(/[^A-Za-z0-9_]+/g, '_')}`,
        host_kind: targetHost,
        authority_epoch: targetEpoch,
        health_ref: `${targetHost}.session.health`,
        authority_role: 'canonical_session_runtime',
        event_cursor: { last_sequence: sourceLastSequence ?? 0 },
      },
      handoff: {
        event_log: { mode: 'checkpoint_plus_cursor', source_last_sequence: sourceLastSequence ?? 0, target_first_sequence: (sourceLastSequence ?? 0) + 1 },
        operator_input_queue: { mode: 'drain_before_seal', pending_count_at_request: queuePendingAtRequest, pending_count_at_seal: queuePendingAtSeal },
        artifacts: { mode: artifactMode, source_paths_exposed: false },
        health: { source_health_until: 'source_sealed', target_health_required_before: 'target_activating' },
        mcp_fabric: { mode: mcpFabricMode, status: mcpFabricStatus },
        provider_state: { mode: 'unsupported_for_synthetic_slice' },
      },
      fencing: {
        source_write_admission: 'active',
        target_write_admission: 'not_before_source_seal',
        split_brain_guard: 'authority_epoch_token_required',
      },
      evidence_refs: [],
      completed_at: null,
      terminal_reason: null,
    }
    : null;
  if (status === 'feasible') warnings.push({ code: 'read_only_planner_slice', message: 'Planning is read-only; execute remains a separate governed command.' });
  return {
    schema: 'narada.nars.authority_runtime_host_transition_plan.v1',
    status,
    mutation_performed: false,
    generated_at: generatedAt,
    session_id: sessionId,
    site_root: matched?.siteResolution.site_root ?? null,
    site_root_source: matched?.siteResolution.source ?? null,
    site_id: matched?.siteResolution.site_id ?? session?.site_id ?? null,
    source_authority_runtime_host: matched ? sourceHost : null,
    source_authority_epoch: sourceEpoch,
    target_authority_runtime_host: targetHost,
    target_authority_epoch: targetEpoch,
    transition_record_candidate: transitionRecordCandidate,
    checks,
    warnings,
    refusals,
    recommended_next_action: status === 'feasible' ? 'run_feasibility_checks_before_execute' : 'repair_refusals_and_rerun_plan',
  };
}

function check(name: string, status: string, summary: string): Record<string, unknown> {
  return { name, status, summary };
}

function refusal(reasonCode: string, reason: string): Record<string, unknown> {
  return { reason_code: reasonCode, reason };
}

function feasibilityEvidenceFromSession(session: Record<string, unknown> | null): Record<string, any> | null {
  const record = session?.record && typeof session.record === 'object' ? session.record as Record<string, any> : null;
  const evidence = record?.authority_transition_feasibility ?? session?.authority_transition_feasibility;
  return evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence as Record<string, any> : null;
}

function applyFeasibilityChecks({
  feasibility,
  targetHost,
  checks,
  refusals,
}: {
  feasibility: Record<string, any> | null;
  targetHost: string;
  checks: Array<Record<string, unknown>>;
  refusals: Array<Record<string, unknown>>;
}): void {
  const activeTurnClear = feasibility?.active_turn?.status === 'clear' || feasibility?.active_turn?.active === false;
  addMatrixCheck(checks, refusals, 'active_turn', activeTurnClear, 'active turn is clear', 'active_turn_in_progress', 'The source authority cannot be sealed while a provider turn is active or unknown.');
  const queuePending = asNonNegativeInteger(feasibility?.operator_input_queue?.pending_count_at_seal) ?? asNonNegativeInteger(feasibility?.operator_input_queue?.pending_count);
  addMatrixCheck(checks, refusals, 'operator_input_queue', queuePending === 0, `pending at seal: ${queuePending ?? 'unknown'}`, 'queue_not_drainable', 'Operator input queue is not proven drainable before source seal.');
  const sourceLastSequence = asNonNegativeInteger(feasibility?.event_cursor?.last_sequence);
  addMatrixCheck(checks, refusals, 'event_cursor', sourceLastSequence !== null, `source cursor: ${sourceLastSequence ?? 'unknown'}`, 'event_cursor_unavailable', 'Source event cursor is unavailable.');
  const targetHealth = feasibility?.target_health_by_host?.[targetHost] ?? feasibility?.target_health;
  addMatrixCheck(checks, refusals, 'target_health', targetHealth?.status === 'healthy' || targetHealth === 'healthy', `target health: ${targetHealth?.status ?? targetHealth ?? 'unknown'}`, 'target_health_unavailable', 'Target authority health is unavailable.');
  addMatrixCheck(checks, refusals, 'source_seal', feasibility?.source_seal?.available === true || feasibility?.source_seal?.status === 'available', 'source seal gate is available', 'source_seal_unavailable', 'Source seal gate is unavailable.');
  const mcpStatus = feasibility?.mcp_fabric?.status;
  addMatrixCheck(checks, refusals, 'mcp_fabric', mcpStatus === 'compatible' || mcpStatus === 'degraded_explicit', `mcp fabric: ${mcpStatus ?? 'unknown'}`, 'mcp_fabric_incompatible', 'MCP fabric compatibility is not proven.');
  const artifacts = feasibility?.artifacts;
  addMatrixCheck(checks, refusals, 'artifacts', Boolean(artifacts?.mode) && artifacts?.source_paths_exposed === false, `artifact handoff: ${artifacts?.mode ?? 'unknown'}`, 'artifact_handoff_policy_refused', 'Artifact handoff policy is not proven or exposes source paths.');
  const credentials = feasibility?.credentials;
  addMatrixCheck(checks, refusals, 'credentials', credentials?.status === 'available' || credentials?.available === true, `credentials: ${credentials?.status ?? 'unknown'}`, 'transition_credentials_unavailable', 'Transition credentials or capability refs are unavailable.');
  const targetDescriptor = feasibility?.target_descriptor;
  addMatrixCheck(checks, refusals, 'projection_authority_guard', targetDescriptor?.authority_role !== 'projection_store', `target role: ${targetDescriptor?.authority_role ?? 'canonical_session_runtime'}`, 'projection_cache_is_not_authority', 'Projection cache cannot be promoted to authority.');
}

function addMatrixCheck(
  checks: Array<Record<string, unknown>>,
  refusals: Array<Record<string, unknown>>,
  name: string,
  ok: boolean,
  summary: string,
  refusalCode: string,
  refusalReason: string,
): void {
  checks.push(check(name, ok ? 'ok' : 'refused', summary));
  if (!ok) refusals.push(refusal(refusalCode, refusalReason));
}

function asNonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export interface NarsAttachCommandOptions extends NarsSessionsOptions {
  session?: string;
  surface?: string;
}

export interface NarsAuthorityTransitionPlanOptions extends NarsSessionsOptions {
  session?: string;
  targetHost?: string;
}

export async function narsSessionsCommand(
  options: NarsSessionsOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const limit = normalizeLimit(options.limit ?? 20);
  const explicitSiteSelector = Boolean(options.siteRoot || options.site);
  const siteResolutions = await resolveNarsSiteRoots(options);
  const initialDiscoveries = siteResolutions.map((siteResolution) => ({
    siteResolution,
    discovery: discoverNarsSessions({ siteRoot: siteResolution.site_root }),
  }));
  const initialSessions = initialDiscoveries.flatMap(({ siteResolution, discovery }) => discovery.sessions.map((session: Record<string, unknown>) => ({ siteResolution, session })));
  const selected = initialSessions
    .sort((a, b) => String(b.session.started_at ?? '').localeCompare(String(a.session.started_at ?? '')))
    .slice(0, limit);
  const healthBySiteRoot = options.health === false
    ? new Map<string, Record<string, string>>()
    : await probeSelectedSessionsBySiteRoot(selected, options.healthTimeoutMs ?? 500);
  const refreshedBySiteRoot = new Map(initialDiscoveries.map(({ siteResolution }) => [
    siteResolution.site_root,
    discoverNarsSessions({ siteRoot: siteResolution.site_root, healthBySessionId: healthBySiteRoot.get(siteResolution.site_root) ?? null }),
  ]));
  const selectedKeys = new Set(selected.map(({ siteResolution, session }) => sessionKey(siteResolution.site_root, session)));
  const sessions = siteResolutions
    .flatMap((siteResolution) => (refreshedBySiteRoot.get(siteResolution.site_root)?.sessions ?? [])
      .filter((session: Record<string, unknown>) => selectedKeys.has(sessionKey(siteResolution.site_root, session)))
      .map((session: Record<string, unknown>) => ({ siteResolution, session })))
    .sort((a, b) => String(b.session.started_at ?? '').localeCompare(String(a.session.started_at ?? '')))
    .map(({ siteResolution, session }) => toCommandSession(session, siteResolution));
  const selectedSite = explicitSiteSelector && siteResolutions.length === 1 ? siteResolutions[0] : null;
  const result = {
    schema: 'narada.nars.sessions_command_result.v1',
    discovery_scope: explicitSiteSelector ? 'site' : 'known_sites',
    site_root: selectedSite?.site_root ?? null,
    site_root_source: selectedSite?.source ?? null,
    site_id: selectedSite?.site_id ?? null,
    site_count: siteResolutions.length,
    sites: siteResolutions,
    sessions_root: selectedSite ? refreshedBySiteRoot.get(selectedSite.site_root)?.sessions_root ?? null : null,
    generated_at: new Date().toISOString(),
    index_generated_at: selectedSite ? (refreshedBySiteRoot.get(selectedSite.site_root)?.index as { generated_at?: unknown } | null)?.generated_at ?? null : null,
    sessions,
    session_count: sessions.length,
    total_session_count: initialSessions.length,
    limit,
    health_probe_enabled: options.health !== false,
    health_timeout_ms: options.healthTimeoutMs ?? 500,
  };
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, formatNarsSessions(result), options.format ?? 'auto'),
  };
}

export async function narsAttachCommandCommand(
  options: NarsAttachCommandOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const sessionId = options.session;
  if (!sessionId) throw new Error('nars_session_required: pass --session <session-id>');
  const siteResolutions = await resolveNarsSiteRoots(options);
  const matched = findSessionInSites(siteResolutions, sessionId);
  const surface = normalizeSurface(options.surface ?? 'agent-web-ui');
  const command = matched ? attachCommandForSession(matched.session, surface) : null;
  const result = {
    schema: 'narada.nars.attach_command.v1',
    status: command ? 'resolved' : 'not_available',
    site_root: matched?.siteResolution.site_root ?? null,
    site_root_source: matched?.siteResolution.source ?? null,
    site_id: matched?.siteResolution.site_id ?? null,
    session_id: sessionId,
    surface,
    command,
    session: matched?.session ?? null,
    reason: matched ? null : 'session_not_found',
  };
  return {
    exitCode: command ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: formattedResult(
      result,
      command ?? `No attach command found for ${sessionId} on ${surface}`,
      options.format ?? 'auto',
    ),
  };
}

async function probeSessionHealth(sessions: Array<Record<string, unknown>>, timeoutMs: number): Promise<Record<string, string>> {
  const entries = await Promise.all(sessions.map(async (session) => {
    const sessionId = String(session.session_id ?? '');
    const healthEndpoint = typeof session.health_endpoint === 'string' ? session.health_endpoint : null;
    if (!sessionId || !healthEndpoint) return [sessionId, 'not_checked'] as const;
    return [sessionId, await probeHealthEndpoint(healthEndpoint, timeoutMs)] as const;
  }));
  return Object.fromEntries(entries.filter(([sessionId]) => sessionId));
}

async function probeHealthEndpoint(endpoint: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) return 'unhealthy';
    return 'healthy';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
}

function formatNarsSessions(discovery: { site_root?: unknown; sessions?: Array<Record<string, unknown>> }): string {
  const sessions = discovery.sessions ?? [];
  const heading = discovery.site_root ? `NARS sessions for ${discovery.site_root}` : 'NARS sessions across known Sites';
  if (sessions.length === 0) return `No ${heading.toLowerCase()}`;
  const rows = sessions.map((session) => [
    String(session.display_state ?? 'unknown').padEnd(20),
    String(session.session_id ?? '').padEnd(34),
    String(session.site_id ?? '').padEnd(14),
    String(session.agent_id ?? '').padEnd(24),
    String(session.launch_operator_surface_kind ?? '').padEnd(10),
    formatSessionAuthority(session).padEnd(28),
    String(session.started_at ?? ''),
  ].join('  '));
  return [
    heading,
    ['state'.padEnd(20), 'session'.padEnd(34), 'site'.padEnd(14), 'agent'.padEnd(24), 'surface'.padEnd(10), 'authority'.padEnd(28), 'started'].join('  '),
    ...rows,
  ].join('\n');
}

function formatSessionAuthority(session: Record<string, unknown>): string {
  const host = String(session.authority_runtime_host ?? 'unknown');
  const epoch = Number.isInteger(session.authority_epoch) ? ` e${session.authority_epoch}` : '';
  const transition = typeof session.authority_transition_state === 'string' && session.authority_transition_state
    ? ` ${session.authority_transition_state}`
    : '';
  const superseded = typeof session.superseded_by_session_id === 'string' && session.superseded_by_session_id
    ? ` -> ${session.superseded_by_session_id}`
    : '';
  return `${host}${epoch}${transition}${superseded}`;
}

function normalizeSurface(surface: string): string {
  if (surface === 'web' || surface === 'agent-web-ui') return 'agent_web_ui';
  if (surface === 'cli' || surface === 'agent-cli') return 'agent_cli';
  if (surface === 'tui' || surface === 'agent-tui') return 'agent_tui';
  return surface.replace(/-/g, '_');
}

function attachCommandForSession(session: Record<string, unknown>, surface: string): string | null {
  const attachCommands = session.record && typeof session.record === 'object'
    ? (session.record as { attach_commands?: Record<string, string> }).attach_commands
    : null;
  const recorded = attachCommands?.[surface];
  if (recorded) return recorded;
  const eventEndpoint = typeof session.event_endpoint === 'string' ? session.event_endpoint : null;
  const healthEndpoint = typeof session.health_endpoint === 'string' ? session.health_endpoint : null;
  if (!eventEndpoint) return null;
  if (surface === 'agent_web_ui') {
    return `narada-agent-web-ui --event-endpoint ${eventEndpoint}${healthEndpoint ? ` --health-endpoint ${healthEndpoint}` : ''}`;
  }
  return null;
}
