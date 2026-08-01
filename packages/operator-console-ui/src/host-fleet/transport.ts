import {
  OPERATOR_CONSOLE_HOSTS_API_PATH,
} from '@narada2/operator-console-contract';
import type { HostFleetEnrollmentIntent, HostFleetLifecycleIntent } from '@narada2/host-fleet/contract';
import type { HostFleetEventConnection, HostFleetEventHandlers, HostFleetTarget } from './adapter';

export type HostFleetFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type HostFleetRouteShape = 'local-console' | 'cloudflare-projection';
export type HostFleetMutationScope = 'local-authority' | 'projection-only';

export interface HostFleetTransportOptions {
  basePath?: string;
  routeShape?: HostFleetRouteShape;
}

export interface HostFleetTransport {
  mutationScope?: HostFleetMutationScope;
  list(): Promise<unknown>;
  sessions?(): Promise<unknown>;
  resolveTarget?(target: HostFleetTarget): Promise<unknown>;
  openEvents?(target: HostFleetTarget, handlers: HostFleetEventHandlers): HostFleetEventConnection;
  preflightLifecycle?(intent: HostFleetLifecycleIntent): Promise<unknown>;
  applyLifecycle?(intent: HostFleetLifecycleIntent, actor: string): Promise<unknown>;
  applyEnrollment?(intent: HostFleetEnrollmentIntent, actor: string): Promise<unknown>;
}

export class HostFleetTransportError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'HostFleetTransportError';
    this.code = code;
    this.status = status;
  }
}

export function createHostFleetTransport(
  optionsOrBasePath: HostFleetTransportOptions | string = {},
  fetchLike: HostFleetFetch = (input, init) => fetch(input, init),
): HostFleetTransport {
  const runtimeOptions = readRuntimeOptions();
  const options = typeof optionsOrBasePath === 'string'
    ? { basePath: optionsOrBasePath, routeShape: 'local-console' as const }
    : { ...runtimeOptions, ...optionsOrBasePath };
  const basePath = normalizeBasePath(options.basePath ?? OPERATOR_CONSOLE_HOSTS_API_PATH);
  const routeShape = options.routeShape ?? 'local-console';

  async function jsonRequest(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetchLike(path, { headers: { Accept: 'application/json', ...(init?.headers ?? {}) }, ...init });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HostFleetTransportError('invalid_json', response.status, `Host Fleet returned HTTP ${response.status} without valid JSON.`);
    }
    // Let the adapter inspect typed refusal envelopes from both the local and
    // Cloudflare boundaries. A non-JSON error remains a transport failure.
    return payload;
  }

  function targetQuery(target: HostFleetTarget): string {
    const query = new URLSearchParams({
      host_id: target.hostId,
      host_instance_id: target.hostInstanceId,
      site_id: target.siteId,
      agent_id: target.agentId,
      runtime_session_id: target.runtimeSessionId,
    });
    return query.toString();
  }

  function hostPath(target: HostFleetTarget): string {
    if (routeShape === 'local-console') return basePath;
    return `${basePath}/${encodeURIComponent(target.hostId)}/${encodeURIComponent(target.hostInstanceId)}`;
  }

  function sessionsPath(target?: Pick<HostFleetTarget, 'hostId' | 'hostInstanceId'>): string {
    if (routeShape === 'local-console') return `${basePath}/sessions`;
    if (!target) return `${basePath}`;
    return `${basePath}/${encodeURIComponent(target.hostId)}/${encodeURIComponent(target.hostInstanceId)}/sessions`;
  }

  function targetPath(target: HostFleetTarget): string {
    if (routeShape === 'local-console') return `${basePath}/target?${targetQuery(target)}`;
    return `${hostPath(target)}/target?${new URLSearchParams({
      site_id: target.siteId,
      agent_id: target.agentId,
      runtime_session_id: target.runtimeSessionId,
    }).toString()}`;
  }

  function eventsPath(target: HostFleetTarget): string {
    const path = routeShape === 'local-console'
      ? `${basePath}/sessions/${encodeURIComponent(target.hostId)}/${encodeURIComponent(target.hostInstanceId)}/${encodeURIComponent(target.runtimeSessionId)}/events`
      : `${hostPath(target)}/sessions/${encodeURIComponent(target.runtimeSessionId)}/events`;
    return `${path}?${new URLSearchParams({ site_id: target.siteId, agent_id: target.agentId }).toString()}`;
  }

  async function postMutation(path: string, intent: unknown, actor: string): Promise<unknown> {
    const response = await fetchLike(path, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent, actor, operator_confirmed: true }),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HostFleetTransportError('invalid_json', response.status, `Host Fleet mutation returned HTTP ${response.status} without valid JSON.`);
    }
    return payload;
  }

  function lifecyclePreflightPath(intent: HostFleetLifecycleIntent): string {
    const path = `${basePath}/lifecycle/preflight`;
    const query = new URLSearchParams({
      request_id: intent.request_id,
      operation: intent.operation,
      host_id: intent.host.host_id,
      host_instance_id: intent.host.host_instance_id,
      expected_revision: String(intent.expected_revision),
      confirmation: intent.confirmation,
      ...(intent.reason === null ? {} : { reason: intent.reason }),
    });
    return `${path}?${query.toString()}`;
  }

  function localOnlyRefusal(kind: 'lifecycle' | 'enrollment', intent: HostFleetLifecycleIntent | HostFleetEnrollmentIntent): Record<string, unknown> {
    if (kind === 'lifecycle') {
      const lifecycle = intent as HostFleetLifecycleIntent;
      return {
        schema: 'narada.host_fleet.lifecycle_result.v1',
        status: 'refused',
        mutation_performed: false,
        request_id: lifecycle.request_id,
        operation: lifecycle.operation,
        host: lifecycle.host,
        lifecycle_state: null,
        revision: null,
        reason: 'host_fleet_authority_local_only',
      };
    }
    const enrollment = intent as HostFleetEnrollmentIntent;
    return {
      schema: 'narada.host_fleet.enrollment_result.v1',
      status: 'refused',
      mutation_performed: false,
      request_id: enrollment.request_id,
      operation: null,
      host: { host_id: enrollment.host.host_id, host_instance_id: enrollment.host.host_instance_id },
      lifecycle_state: null,
      revision: null,
      reason: 'host_fleet_authority_local_only',
    };
  }

  async function readCloudflareRegistryOverview(): Promise<unknown> {
    return jsonRequest(basePath);
  }

  async function readOverviewWithHealth(overview: unknown): Promise<unknown> {
    if (!isRecord(overview)
      || (overview.schema !== 'narada.cloudflare.host_fleet.overview.v1' && overview.schema !== 'narada.operator_console.host_fleet.v1')
      || overview.status !== 'success'
      || !Array.isArray(overview.hosts)) return overview;
    const hosts = await Promise.all(overview.hosts.map(async (candidate: unknown) => {
      if (!isRecord(candidate) || typeof candidate.host_id !== 'string' || typeof candidate.host_instance_id !== 'string') return candidate;
      const path = `${basePath}/${encodeURIComponent(candidate.host_id)}/${encodeURIComponent(candidate.host_instance_id)}/health`;
      try {
        const payload = await jsonRequest(path);
        if (isRecord(payload) && payload.schema === 'narada.host_fleet.gateway_health.v1') {
          return {
            ...candidate,
            health: {
              status: payload.status === 'online' ? 'online' : 'degraded',
              observed_at: typeof payload.observed_at === 'string' ? payload.observed_at : overview.generated_at,
              detail: typeof payload.detail === 'string' ? payload.detail : null,
            },
          };
        }
        if (isRecord(payload) && payload.schema === 'narada.host_fleet.refusal.v1' && typeof payload.reason === 'string') {
          return {
            ...candidate,
            health: { status: 'offline', observed_at: overview.generated_at, detail: payload.reason },
          };
        }
        return {
          ...candidate,
          health: { status: 'degraded', observed_at: overview.generated_at, detail: 'host_fleet_health_contract_invalid' },
        };
      } catch (cause) {
        return {
          ...candidate,
          health: {
            status: 'offline',
            observed_at: overview.generated_at,
            detail: cause instanceof Error ? cause.message : 'host_fleet_health_unavailable',
          },
        };
      }
    }));
    return { ...overview, hosts };
  }

  async function readCloudflareOverview(): Promise<unknown> {
    return readOverviewWithHealth(await readCloudflareRegistryOverview());
  }

  async function readCloudflareSessions(): Promise<unknown> {
    // Cloudflare deliberately scopes session reads to one registered HostKey;
    // the browser receives an aggregate only after every declared host has
    // been queried independently.
    const overview = await readCloudflareRegistryOverview();
    if (!isRecord(overview) || overview.schema !== 'narada.cloudflare.host_fleet.overview.v1' || overview.status !== 'success' || !Array.isArray(overview.hosts)) return overview;
    const hostResults = await Promise.all(overview.hosts.map(async (candidate) => {
      if (!isRecord(candidate) || typeof candidate.host_id !== 'string' || typeof candidate.host_instance_id !== 'string') {
        return { status: 'refused', host: candidate, sessions: [], refusals: ['host_fleet_host_invalid'] };
      }
      const host = { hostId: candidate.host_id, hostInstanceId: candidate.host_instance_id };
      try {
        const payload = await jsonRequest(`${basePath}/${encodeURIComponent(host.hostId)}/${encodeURIComponent(host.hostInstanceId)}/sessions`);
        if (isRecord(payload) && payload.schema === 'narada.cloudflare.host_fleet.sessions.v1' && Array.isArray(payload.sessions) && Array.isArray(payload.refusals)) {
          return {
            status: payload.status === 'success' ? 'success' : 'refused',
            host: isRecord(payload.host) ? payload.host : candidate,
            sessions: payload.sessions,
            refusals: payload.refusals,
          };
        }
        if (isRecord(payload) && payload.schema === 'narada.host_fleet.refusal.v1' && typeof payload.reason === 'string') {
          return { status: 'refused', host: candidate, sessions: [], refusals: [payload.reason] };
        }
        return { status: 'refused', host: candidate, sessions: [], refusals: ['host_fleet_sessions_contract_invalid'] };
      } catch (cause) {
        return { status: 'refused', host: candidate, sessions: [], refusals: [cause instanceof Error ? cause.message : 'host_fleet_sessions_unavailable'] };
      }
    }));
    return {
      schema: 'narada.operator_console.host_fleet_sessions.v1',
      status: 'success',
      generated_at: typeof overview.generated_at === 'string' ? overview.generated_at : new Date().toISOString(),
      count: hostResults.reduce((count, host) => count + host.sessions.length, 0),
      hosts: hostResults,
      refusals: [],
    };
  }

  return {
    mutationScope: routeShape === 'local-console' ? 'local-authority' : 'projection-only',
    async list(): Promise<unknown> {
      return routeShape === 'local-console'
        ? readOverviewWithHealth(await jsonRequest(basePath))
        : readCloudflareOverview();
    },
    async sessions(): Promise<unknown> {
      return routeShape === 'local-console' ? jsonRequest(sessionsPath()) : readCloudflareSessions();
    },
    async resolveTarget(target: HostFleetTarget): Promise<unknown> {
      return jsonRequest(targetPath(target));
    },
    async preflightLifecycle(intent: HostFleetLifecycleIntent): Promise<unknown> {
      return jsonRequest(lifecyclePreflightPath(intent));
    },
    async applyLifecycle(intent: HostFleetLifecycleIntent, actor: string): Promise<unknown> {
      return routeShape === 'local-console'
        ? postMutation(`${basePath}/lifecycle`, intent, actor)
        : localOnlyRefusal('lifecycle', intent);
    },
    async applyEnrollment(intent: HostFleetEnrollmentIntent, actor: string): Promise<unknown> {
      return routeShape === 'local-console'
        ? postMutation(`${basePath}/enrollment`, intent, actor)
        : localOnlyRefusal('enrollment', intent);
    },
    openEvents(target: HostFleetTarget, handlers: HostFleetEventHandlers): HostFleetEventConnection {
      const WebSocketCtor = globalThis.WebSocket;
      if (!WebSocketCtor) throw new Error('host_fleet_websocket_unavailable');
      const url = new URL(eventsPath(target), globalThis.location?.href ?? 'http://127.0.0.1');
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocketCtor(url.toString());
      socket.addEventListener('open', () => handlers.open?.());
      socket.addEventListener('message', (event) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        try { handlers.message?.(JSON.parse(raw)); }
        catch { handlers.message?.({ event: 'raw_message', data: raw }); }
      });
      socket.addEventListener('error', () => handlers.error?.('host_fleet_websocket_error'));
      socket.addEventListener('close', (event) => handlers.close?.(event.reason || `websocket_closed:${event.code}`));
      return {
        get readyState() { return socket.readyState; },
        send(payload: unknown): boolean {
          if (socket.readyState !== WebSocketCtor.OPEN) return false;
          socket.send(JSON.stringify(payload));
          return true;
        },
        close(): void { socket.close(); },
      };
    },
  };
}

function readRuntimeOptions(): HostFleetTransportOptions {
  if (typeof document === 'undefined') return {};
  const element = document.getElementById('operator-console-config');
  if (!element) return {};
  try {
    const parsed: unknown = JSON.parse(element.textContent ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const hostFleet = (parsed as { hostFleet?: unknown }).hostFleet;
    if (!hostFleet || typeof hostFleet !== 'object' || Array.isArray(hostFleet)) return {};
    const config = hostFleet as { apiBasePath?: unknown; routeShape?: unknown };
    return {
      ...(typeof config.apiBasePath === 'string' ? { basePath: config.apiBasePath } : {}),
      ...(config.routeShape === 'cloudflare-projection' || config.routeShape === 'local-console'
        ? { routeShape: config.routeShape }
        : {}),
    };
  } catch {
    return {};
  }
}

function normalizeBasePath(value: string): string {
  const candidate = value.trim();
  if (!candidate || candidate.includes('..') || candidate.includes('\\') || candidate.includes('?') || candidate.includes('#')) {
    return OPERATOR_CONSOLE_HOSTS_API_PATH;
  }
  try {
    const parsed = new URL(candidate, typeof window === 'undefined' ? 'http://127.0.0.1' : window.location.href);
    if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) return OPERATOR_CONSOLE_HOSTS_API_PATH;
    if (!parsed.pathname.startsWith('/') || parsed.pathname.includes('..')) return OPERATOR_CONSOLE_HOSTS_API_PATH;
    return parsed.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return OPERATOR_CONSOLE_HOSTS_API_PATH;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
