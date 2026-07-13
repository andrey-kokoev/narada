import type {
  OperatorSessionDisplayState,
  OperatorSessionListWireResponse,
  OperatorSessionWireRecord,
} from '@narada2/operator-console-contract';
import { createAgentSessionsTransport, type AgentSessionsTransport } from './transport';

export interface AgentSessionRecord {
  sessionId: string;
  siteId: string | null;
  agentId: string | null;
  runtimeKind: string | null;
  launchOperatorSurfaceKind: string | null;
  startedAt: string | null;
  lastSeenAt: string | null;
  terminalState: string | null;
  displayState: OperatorSessionDisplayState;
  displayStateReason: string;
  heartbeatFresh: boolean;
  heartbeatAgeMs: number | null;
  healthStatus: string;
}

export interface AgentSessionListResponse {
  schema: OperatorSessionListWireResponse['schema'];
  status: OperatorSessionListWireResponse['status'];
  generatedAt: string;
  count: number;
  sessions: AgentSessionRecord[];
  refusals: string[];
}

export interface AgentSessionsClient {
  list(): Promise<AgentSessionListResponse>;
}

export class AgentSessionsApiError extends Error {
  readonly code: string;
  readonly refusals: string[];

  constructor(code: string, message: string, refusals: string[] = []) {
    super(message);
    this.name = 'AgentSessionsApiError';
    this.code = code;
    this.refusals = refusals;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function displayState(value: unknown): OperatorSessionDisplayState | null {
  return value === 'active'
    || value === 'starting_or_degraded'
    || value === 'closed'
    || value === 'stale'
    || value === 'historical'
    ? value
    : null;
}

function parseSession(value: unknown): AgentSessionRecord | null {
  if (!isRecord(value)) return null;
  const sessionId = stringValue(value.session_id);
  const state = displayState(value.display_state);
  if (!sessionId || !state || typeof value.heartbeat_fresh !== 'boolean') return null;
  return {
    sessionId,
    siteId: stringValue(value.site_id),
    agentId: stringValue(value.agent_id),
    runtimeKind: stringValue(value.runtime_kind),
    launchOperatorSurfaceKind: stringValue(value.launch_operator_surface_kind),
    startedAt: stringValue(value.started_at),
    lastSeenAt: stringValue(value.last_seen_at),
    terminalState: stringValue(value.terminal_state),
    displayState: state,
    displayStateReason: stringValue(value.display_state_reason) ?? 'discovery_projection_only',
    heartbeatFresh: value.heartbeat_fresh,
    heartbeatAgeMs: typeof value.heartbeat_age_ms === 'number' && Number.isFinite(value.heartbeat_age_ms)
      ? value.heartbeat_age_ms
      : null,
    healthStatus: stringValue(value.health_status) ?? 'not_checked',
  };
}

function parseResponse(value: unknown): AgentSessionListResponse | null {
  if (!isRecord(value)
    || value.schema !== 'narada.operator_console.agent_sessions.v1'
    || (value.status !== 'success' && value.status !== 'refused')
    || typeof value.generated_at !== 'string'
    || !Array.isArray(value.sessions)
    || !Array.isArray(value.refusals)
    || !value.refusals.every((item) => typeof item === 'string')) {
    return null;
  }
  const sessions = value.sessions.map(parseSession);
  if (sessions.some((session) => session === null)) return null;
  return {
    schema: value.schema,
    status: value.status,
    generatedAt: value.generated_at,
    count: typeof value.count === 'number' ? value.count : sessions.length,
    sessions: sessions.filter((session): session is AgentSessionRecord => session !== null),
    refusals: value.refusals,
  };
}

export function createAgentSessionsAdapter(
  transport: AgentSessionsTransport = createAgentSessionsTransport(),
): AgentSessionsClient {
  return {
    async list(): Promise<AgentSessionListResponse> {
      const response = parseResponse(await transport.list());
      if (!response) throw new AgentSessionsApiError('invalid_response', 'Agent Sessions response did not match its contract.');
      return response;
    },
  };
}
