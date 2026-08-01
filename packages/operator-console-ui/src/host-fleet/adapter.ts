import type {
  OperatorHostFleetHealthStatus,
  OperatorHostFleetOverviewWireResponse,
  OperatorHostFleetWireRecord,
} from '@narada-core/operator-console-contract';
import type {
  HostFleetEnrollmentIntent,
  HostFleetLifecycleIntent,
  HostFleetLifecycleOperation,
} from '@narada-core/host-fleet/contract';
import { createHostFleetTransport, type HostFleetMutationScope, type HostFleetTransport } from './transport';

export interface HostFleetTarget {
  hostId: string;
  hostInstanceId: string;
  siteId: string;
  agentId: string;
  runtimeSessionId: string;
}

export interface HostFleetSessionRecord {
  target: HostFleetTarget;
  state: 'active' | 'starting' | 'degraded' | 'closed' | 'stale';
  healthStatus: OperatorHostFleetHealthStatus;
  startedAt: string | null;
  lastSeenAt: string | null;
}

export interface HostFleetSessionHost {
  hostId: string;
  hostInstanceId: string;
  displayName: string;
  platform: string;
  lifecycleState: OperatorHostFleetWireRecord['lifecycle_state'];
  status: 'success' | 'refused';
  sessions: HostFleetSessionRecord[];
  refusals: string[];
}

export interface HostFleetSessionsOverview {
  schema: 'narada.operator_console.host_fleet_sessions.v1';
  status: 'success' | 'refused';
  generatedAt: string;
  count: number;
  hosts: HostFleetSessionHost[];
  refusals: string[];
}

export interface HostFleetTargetResolution {
  schema: 'narada.operator_console.host_fleet_target.v1';
  status: 'resolved' | 'refused';
  target: HostFleetTarget | null;
  session: HostFleetSessionRecord | null;
  refusal: string | null;
}

export interface HostFleetRecord {
  hostId: string;
  hostInstanceId: string;
  displayName: string;
  platform: string;
  naradaVersion: string | null;
  transport: string;
  admittedPathCount: number;
  capabilities: string[];
  admittedSites: string[];
  lifecycleState: OperatorHostFleetWireRecord['lifecycle_state'];
  healthStatus: OperatorHostFleetHealthStatus;
  healthObservedAt: string | null;
  healthDetail: string | null;
  lastSeenAt: string | null;
  revision: number;
}

export interface HostFleetOverview {
  schema: OperatorHostFleetOverviewWireResponse['schema'];
  status: OperatorHostFleetOverviewWireResponse['status'];
  generatedAt: string;
  count: number;
  hosts: HostFleetRecord[];
  refusals: string[];
}

export interface HostFleetClient {
  mutationScope?: HostFleetMutationScope;
  hostConsolePath?(host: Pick<HostFleetTarget, 'hostId' | 'hostInstanceId'>): string | null;
  list(): Promise<HostFleetOverview>;
  sessions(): Promise<HostFleetSessionsOverview>;
  resolveTarget(target: HostFleetTarget): Promise<HostFleetTargetResolution>;
  openEvents(target: HostFleetTarget, handlers: HostFleetEventHandlers): HostFleetEventConnection;
  preflightLifecycle?(intent: HostFleetLifecycleIntent): Promise<HostFleetLifecyclePreflight>;
  applyLifecycle?(intent: HostFleetLifecycleIntent, actor: string): Promise<HostFleetMutationResult>;
  applyEnrollment?(intent: HostFleetEnrollmentIntent, actor: string): Promise<HostFleetMutationResult>;
}

export interface HostFleetMutationResult {
  schema: 'narada.host_fleet.lifecycle_result.v1' | 'narada.host_fleet.enrollment_result.v1';
  status: 'applied' | 'replayed' | 'unchanged' | 'refused';
  mutationPerformed: boolean;
  requestId: string;
  operation: HostFleetLifecycleOperation | null;
  host: { hostId: string; hostInstanceId: string } | null;
  lifecycleState: HostFleetRecord['lifecycleState'] | null;
  revision: number | null;
  reason: string | null;
}

export interface HostFleetLifecyclePreflight {
  schema: 'narada.host_fleet.lifecycle_preflight.v1';
  status: 'ready' | 'refused';
  mutationPerformed: false;
  currentRevision: number | null;
  currentLifecycleState: HostFleetRecord['lifecycleState'] | null;
  refusals: string[];
}

export interface HostFleetEventHandlers {
  open?: () => void;
  message?: (payload: unknown) => void;
  error?: (message: string) => void;
  close?: (message: string) => void;
}

export interface HostFleetEventConnection {
  get readyState(): number;
  send(payload: unknown): boolean;
  close(): void;
}

export class HostFleetApiError extends Error {
  readonly code: string;
  readonly refusals: string[];

  constructor(code: string, message: string, refusals: string[] = []) {
    super(message);
    this.name = 'HostFleetApiError';
    this.code = code;
    this.refusals = refusals;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function healthStatus(value: unknown): OperatorHostFleetHealthStatus | null {
  return value === 'unknown'
    || value === 'online'
    || value === 'degraded'
    || value === 'offline'
    || value === 'stale'
    || value === 'unauthenticated'
    || value === 'revoked'
    ? value
    : null;
}

function sessionState(value: unknown): HostFleetSessionRecord['state'] | null {
  return value === 'active' || value === 'starting' || value === 'degraded' || value === 'closed' || value === 'stale'
    ? value
    : null;
}

function parseTarget(value: unknown): HostFleetTarget | null {
  if (!record(value)
    || typeof value.host_id !== 'string'
    || typeof value.host_instance_id !== 'string'
    || typeof value.site_id !== 'string'
    || typeof value.agent_id !== 'string'
    || typeof value.runtime_session_id !== 'string') return null;
  return {
    hostId: value.host_id,
    hostInstanceId: value.host_instance_id,
    siteId: value.site_id,
    agentId: value.agent_id,
    runtimeSessionId: value.runtime_session_id,
  };
}

function parseSession(value: unknown): HostFleetSessionRecord | null {
  if (!record(value)) return null;
  const target = parseTarget(value.target);
  const state = sessionState(value.state);
  const health = healthStatus(value.health_status);
  if (!target || !state || !health) return null;
  return {
    target,
    state,
    healthStatus: health,
    startedAt: stringValue(value.started_at),
    lastSeenAt: stringValue(value.last_seen_at),
  };
}

function parseSessions(value: unknown): HostFleetSessionsOverview | null {
  if (record(value) && value.schema === 'narada.cloudflare.host_fleet.sessions.v1') {
    return parseCloudflareSessions(value);
  }
  if (record(value) && value.schema === 'narada.host_fleet.refusal.v1' && value.status === 'refused' && typeof value.reason === 'string') {
    return {
      schema: 'narada.operator_console.host_fleet_sessions.v1',
      status: 'refused',
      generatedAt: new Date().toISOString(),
      count: 0,
      hosts: [],
      refusals: [value.reason],
    };
  }
  if (!record(value)
    || value.schema !== 'narada.operator_console.host_fleet_sessions.v1'
    || (value.status !== 'success' && value.status !== 'refused')
    || typeof value.generated_at !== 'string'
    || !Array.isArray(value.hosts)
    || !Array.isArray(value.refusals)
    || !value.refusals.every((item) => typeof item === 'string')) return null;
  const hosts: HostFleetSessionHost[] = [];
  for (const item of value.hosts) {
    if (!record(item) || !record(item.host) || !Array.isArray(item.sessions) || !Array.isArray(item.refusals)) return null;
    const hostId = stringValue(item.host.host_id);
    const instanceId = stringValue(item.host.host_instance_id);
    const displayName = stringValue(item.host.display_name);
    const platform = stringValue(item.host.platform);
    const lifecycleState = item.host.lifecycle_state;
    if (!hostId || !instanceId || !displayName || !platform
      || (lifecycleState !== 'pending' && lifecycleState !== 'active' && lifecycleState !== 'revoked' && lifecycleState !== 'retired')
      || (item.status !== 'success' && item.status !== 'refused')
      || !item.refusals.every((refusal) => typeof refusal === 'string')) return null;
    const sessions = item.sessions.map(parseSession);
    if (sessions.some((session) => session === null)) return null;
    hosts.push({
      hostId,
      hostInstanceId: instanceId,
      displayName,
      platform,
      lifecycleState,
      status: item.status,
      sessions: sessions.filter((session): session is HostFleetSessionRecord => session !== null),
      refusals: item.refusals,
    });
  }
  return {
    schema: 'narada.operator_console.host_fleet_sessions.v1',
    status: value.status,
    generatedAt: value.generated_at,
    count: typeof value.count === 'number' ? value.count : hosts.reduce((count, host) => count + host.sessions.length, 0),
    hosts,
    refusals: value.refusals,
  };
}

function parseCloudflareSessions(value: Record<string, unknown>): HostFleetSessionsOverview | null {
  if ((value.status !== 'success' && value.status !== 'refused')
    || typeof value.generated_at !== 'string'
    || !record(value.host)
    || !Array.isArray(value.sessions)
    || !Array.isArray(value.refusals)
    || !value.refusals.every((item) => typeof item === 'string')) return null;
  const host = value.host;
  const hostId = stringValue(host.host_id);
  const instanceId = stringValue(host.host_instance_id);
  const displayName = stringValue(host.display_name);
  const platform = stringValue(host.platform);
  const lifecycleState = host.lifecycle_state;
  if (!hostId || !instanceId || !displayName || !platform
    || (lifecycleState !== 'pending' && lifecycleState !== 'active' && lifecycleState !== 'revoked' && lifecycleState !== 'retired')) return null;
  const sessions = value.sessions.map(parseSession);
  if (sessions.some((session) => session === null)) return null;
  return {
    schema: 'narada.operator_console.host_fleet_sessions.v1',
    status: value.status,
    generatedAt: value.generated_at,
    count: typeof value.count === 'number' ? value.count : sessions.length,
    hosts: [{
      hostId,
      hostInstanceId: instanceId,
      displayName,
      platform,
      lifecycleState,
      status: value.status === 'success' ? 'success' : 'refused',
      sessions: sessions.filter((session): session is HostFleetSessionRecord => session !== null),
      refusals: value.refusals,
    }],
    refusals: value.refusals,
  };
}

function parseTargetResolution(value: unknown): HostFleetTargetResolution | null {
  if (record(value) && value.schema === 'narada.host_fleet.refusal.v1' && value.status === 'refused' && typeof value.reason === 'string') {
    return {
      schema: 'narada.operator_console.host_fleet_target.v1',
      status: 'refused',
      target: null,
      session: null,
      refusal: value.reason,
    };
  }
  if (!record(value)
    || (value.schema !== 'narada.operator_console.host_fleet_target.v1' && value.schema !== 'narada.cloudflare.host_fleet.target.v1')
    || (value.status !== 'resolved' && value.status !== 'refused')
    || (value.refusal !== null && typeof value.refusal !== 'string')) return null;
  const target = value.target === null ? null : parseTarget(value.target);
  const session = value.session === null ? null : parseSession(value.session);
  if (value.status === 'resolved' && (!target || !session)) return null;
  if (value.status === 'refused' && (target || session)) return null;
  return {
    schema: 'narada.operator_console.host_fleet_target.v1',
    status: value.status,
    target,
    session,
    refusal: typeof value.refusal === 'string' ? value.refusal : null,
  };
}

function parseMutationResult(value: unknown): HostFleetMutationResult | null {
  if (!record(value)
    || (value.schema !== 'narada.host_fleet.lifecycle_result.v1' && value.schema !== 'narada.host_fleet.enrollment_result.v1')
    || (value.status !== 'applied' && value.status !== 'replayed' && value.status !== 'unchanged' && value.status !== 'refused')
    || typeof value.mutation_performed !== 'boolean'
    || typeof value.request_id !== 'string'
    || (value.operation !== null && value.operation !== 'revoke' && value.operation !== 'retire')
    || (value.host !== null && !record(value.host))
    || (value.host !== null && (typeof value.host.host_id !== 'string' || typeof value.host.host_instance_id !== 'string'))
    || (value.lifecycle_state !== null && value.lifecycle_state !== 'pending' && value.lifecycle_state !== 'active' && value.lifecycle_state !== 'revoked' && value.lifecycle_state !== 'retired')
    || (value.revision !== null && (!Number.isInteger(value.revision) || Number(value.revision) < 1))
    || (value.reason !== null && typeof value.reason !== 'string')) return null;
  return {
    schema: value.schema,
    status: value.status,
    mutationPerformed: value.mutation_performed,
    requestId: value.request_id,
    operation: value.operation,
    host: value.host === null ? null : { hostId: value.host.host_id as string, hostInstanceId: value.host.host_instance_id as string },
    lifecycleState: value.lifecycle_state,
    revision: value.revision as number | null,
    reason: value.reason,
  };
}

function parseLifecyclePreflight(value: unknown): HostFleetLifecyclePreflight | null {
  if (!record(value)
    || value.schema !== 'narada.host_fleet.lifecycle_preflight.v1'
    || (value.status !== 'ready' && value.status !== 'refused')
    || value.mutation_performed !== false
    || (value.current_revision !== null && (!Number.isInteger(value.current_revision) || Number(value.current_revision) < 1))
    || (value.current_lifecycle_state !== null && value.current_lifecycle_state !== 'pending' && value.current_lifecycle_state !== 'active' && value.current_lifecycle_state !== 'revoked' && value.current_lifecycle_state !== 'retired')
    || !Array.isArray(value.refusals)
    || !value.refusals.every((item) => typeof item === 'string')) return null;
  return {
    schema: 'narada.host_fleet.lifecycle_preflight.v1',
    status: value.status,
    mutationPerformed: false,
    currentRevision: value.current_revision as number | null,
    currentLifecycleState: value.current_lifecycle_state,
    refusals: [...value.refusals],
  };
}

function requiredTransportMethod<T extends keyof HostFleetTransport>(transport: HostFleetTransport, method: T): NonNullable<HostFleetTransport[T]> {
  const value = transport[method];
  if (typeof value !== 'function') throw new HostFleetApiError('unsupported', `Host Fleet transport does not implement ${String(method)}.`);
  return value as NonNullable<HostFleetTransport[T]>;
}

function parseHost(value: unknown): HostFleetRecord | null {
  if (!record(value) || !record(value.gateway) || !record(value.health)) return null;
  const hostId = stringValue(value.host_id);
  const instanceId = stringValue(value.host_instance_id);
  const displayName = stringValue(value.display_name);
  const health = healthStatus(value.health.status);
  if (!hostId || !instanceId || !displayName || !health || typeof value.platform !== 'string') return null;
  if (value.lifecycle_state !== 'pending' && value.lifecycle_state !== 'active' && value.lifecycle_state !== 'revoked' && value.lifecycle_state !== 'retired') return null;
  if (!Array.isArray(value.capabilities) || !value.capabilities.every((item) => typeof item === 'string')) return null;
  if (!Array.isArray(value.admitted_sites) || !value.admitted_sites.every((item) => typeof item === 'string')) return null;
  if (typeof value.gateway.admitted_path_count !== 'number' || !Number.isInteger(value.gateway.admitted_path_count)) return null;
  if (typeof value.revision !== 'number' || !Number.isInteger(value.revision)) return null;
  return {
    hostId,
    hostInstanceId: instanceId,
    displayName,
    platform: value.platform,
    naradaVersion: stringValue(value.narada_version),
    transport: stringValue(value.gateway.transport) ?? 'unknown',
    admittedPathCount: value.gateway.admitted_path_count,
    capabilities: [...value.capabilities],
    admittedSites: [...value.admitted_sites],
    lifecycleState: value.lifecycle_state,
    healthStatus: health,
    healthObservedAt: stringValue(value.health.observed_at),
    healthDetail: stringValue(value.health.detail),
    lastSeenAt: stringValue(value.last_seen_at),
    revision: value.revision,
  };
}

function parseOverview(value: unknown): HostFleetOverview | null {
  if (record(value) && value.schema === 'narada.cloudflare.host_fleet.overview.v1') {
    return parseCloudflareOverview(value);
  }
  if (record(value) && value.schema === 'narada.host_fleet.refusal.v1' && value.status === 'refused' && typeof value.reason === 'string') {
    return {
      schema: 'narada.operator_console.host_fleet.v1',
      status: 'refused',
      generatedAt: new Date().toISOString(),
      count: 0,
      hosts: [],
      refusals: [value.reason],
    };
  }
  if (!record(value)
    || value.schema !== 'narada.operator_console.host_fleet.v1'
    || (value.status !== 'success' && value.status !== 'refused')
    || typeof value.generated_at !== 'string'
    || !Array.isArray(value.hosts)
    || !Array.isArray(value.refusals)
    || !value.refusals.every((item) => typeof item === 'string')) return null;
  const hosts = value.hosts.map(parseHost);
  if (hosts.some((host) => host === null)) return null;
  return {
    schema: value.schema,
    status: value.status,
    generatedAt: value.generated_at,
    count: typeof value.count === 'number' ? value.count : hosts.length,
    hosts: hosts.filter((host): host is HostFleetRecord => host !== null),
    refusals: value.refusals,
  };
}

function parseCloudflareOverview(value: Record<string, unknown>): HostFleetOverview | null {
  if ((value.status !== 'success' && value.status !== 'refused')
    || typeof value.generated_at !== 'string'
    || !Array.isArray(value.hosts)
    || !Array.isArray(value.refusals)
    || !value.refusals.every((item) => typeof item === 'string')
    || typeof value.registry_revision !== 'number'
    || !Number.isInteger(value.registry_revision)) return null;
  const hosts = value.hosts.map((item) => parseCloudflareHost(item, value.registry_revision as number));
  if (hosts.some((host) => host === null)) return null;
  return {
    schema: 'narada.operator_console.host_fleet.v1',
    status: value.status,
    generatedAt: value.generated_at,
    count: typeof value.count === 'number' ? value.count : hosts.length,
    hosts: hosts.filter((host): host is HostFleetRecord => host !== null),
    refusals: value.refusals,
  };
}

function parseCloudflareHost(value: unknown, revision: number): HostFleetRecord | null {
  if (!record(value) || !record(value.gateway)) return null;
  const hostId = stringValue(value.host_id);
  const instanceId = stringValue(value.host_instance_id);
  const displayName = stringValue(value.display_name);
  if (!hostId || !instanceId || !displayName || typeof value.platform !== 'string'
    || (value.lifecycle_state !== 'pending' && value.lifecycle_state !== 'active' && value.lifecycle_state !== 'revoked' && value.lifecycle_state !== 'retired')
    || !Array.isArray(value.capabilities) || !value.capabilities.every((item) => typeof item === 'string')
    || !Array.isArray(value.admitted_sites) || !value.admitted_sites.every((item) => typeof item === 'string')
    || typeof value.gateway.admitted_path_count !== 'number' || !Number.isInteger(value.gateway.admitted_path_count)) return null;
  const health = record(value.health) ? healthStatus(value.health.status) : 'unknown';
  if (!health) return null;
  return {
    hostId,
    hostInstanceId: instanceId,
    displayName,
    platform: value.platform,
    naradaVersion: null,
    transport: stringValue(value.gateway.transport) ?? 'unknown',
    admittedPathCount: value.gateway.admitted_path_count,
    capabilities: [...value.capabilities],
    admittedSites: [...value.admitted_sites],
    lifecycleState: value.lifecycle_state,
    healthStatus: health,
    healthObservedAt: record(value.health) ? stringValue(value.health.observed_at) : null,
    healthDetail: record(value.health) ? stringValue(value.health.detail) : null,
    lastSeenAt: null,
    revision,
  };
}

export function createHostFleetAdapter(
  transport: HostFleetTransport = createHostFleetTransport(),
): HostFleetClient {
  return {
    mutationScope: transport.mutationScope,
    hostConsolePath: transport.hostConsolePath?.bind(transport),
    async list(): Promise<HostFleetOverview> {
      const response = parseOverview(await transport.list());
      if (!response) throw new HostFleetApiError('invalid_response', 'Host Fleet response did not match its contract.');
      if (response.status === 'refused') throw new HostFleetApiError('refused', `Host Fleet refused the list request: ${response.refusals.join(', ') || 'unknown refusal'}.`, response.refusals);
      return response;
    },
    async sessions(): Promise<HostFleetSessionsOverview> {
      const response = parseSessions(await requiredTransportMethod(transport, 'sessions').call(transport));
      if (!response) throw new HostFleetApiError('invalid_response', 'Host Fleet session response did not match its contract.');
      if (response.status === 'refused') throw new HostFleetApiError('refused', `Host Fleet refused session discovery: ${response.refusals.join(', ') || 'unknown refusal'}.`, response.refusals);
      return response;
    },
    async resolveTarget(target: HostFleetTarget): Promise<HostFleetTargetResolution> {
      const response = parseTargetResolution(await requiredTransportMethod(transport, 'resolveTarget').call(transport, target));
      if (!response) throw new HostFleetApiError('invalid_response', 'Host Fleet target response did not match its contract.');
      if (response.status === 'refused') throw new HostFleetApiError('refused', response.refusal ? `Host Fleet refused the target: ${response.refusal}.` : 'Host Fleet refused the target.', response.refusal ? [response.refusal] : []);
      return response;
    },
    async preflightLifecycle(intent: HostFleetLifecycleIntent): Promise<HostFleetLifecyclePreflight> {
      const response = parseLifecyclePreflight(await requiredTransportMethod(transport, 'preflightLifecycle').call(transport, intent));
      if (!response) throw new HostFleetApiError('invalid_response', 'Host Fleet lifecycle preflight did not match its contract.');
      return response;
    },
    async applyLifecycle(intent: HostFleetLifecycleIntent, actor: string): Promise<HostFleetMutationResult> {
      const response = parseMutationResult(await requiredTransportMethod(transport, 'applyLifecycle').call(transport, intent, actor));
      if (!response) throw new HostFleetApiError('invalid_response', 'Host Fleet lifecycle response did not match its contract.');
      return response;
    },
    async applyEnrollment(intent: HostFleetEnrollmentIntent, actor: string): Promise<HostFleetMutationResult> {
      const response = parseMutationResult(await requiredTransportMethod(transport, 'applyEnrollment').call(transport, intent, actor));
      if (!response) throw new HostFleetApiError('invalid_response', 'Host Fleet enrollment response did not match its contract.');
      return response;
    },
    openEvents(target: HostFleetTarget, handlers: HostFleetEventHandlers): HostFleetEventConnection {
      return requiredTransportMethod(transport, 'openEvents').call(transport, target, handlers);
    },
  };
}
