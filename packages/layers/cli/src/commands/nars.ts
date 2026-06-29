import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { discoverNarsSessions } from '@narada2/carrier-runtime/nars-session-index';
import { listKnownSiteRootsForCli, resolveSiteRootForCli, type ResolvedSiteRoot } from '../lib/site-root-resolver.js';

export interface NarsSessionsOptions {
  siteRoot?: string;
  site?: string;
  health?: boolean;
  healthTimeoutMs?: number;
  limit?: number;
  format?: CliFormat;
  launchRegistryPath?: string;
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

export interface NarsAttachCommandOptions extends NarsSessionsOptions {
  session?: string;
  surface?: string;
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
    String(session.started_at ?? ''),
  ].join('  '));
  return [
    heading,
    ['state'.padEnd(20), 'session'.padEnd(34), 'site'.padEnd(14), 'agent'.padEnd(24), 'surface'.padEnd(10), 'started'].join('  '),
    ...rows,
  ].join('\n');
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
