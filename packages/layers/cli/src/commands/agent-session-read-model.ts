import { discoverNarsSessions } from '@narada2/nars-session-core/session-index';
import type {
  OperatorSessionDisplayState,
  OperatorSessionListWireResponse,
  OperatorSessionWireRecord,
} from '@narada2/operator-console-contract';
import type { SiteRegistryReadModel } from './site-registry-read-model.js';
import { probeNarsSessionHealth } from '../lib/nars-session-health.js';

const AGENT_SESSION_LIST_SCHEMA = 'narada.operator_console.agent_sessions.v1' as const;
const MAX_SITES = 100;
const MAX_SESSIONS = 500;

export interface AgentSessionReadModel {
  list(): Promise<OperatorSessionListWireResponse>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function siteRows(result: unknown): Array<Record<string, unknown>> | null {
  if (!isRecord(result) || !Array.isArray(result.sites)) return null;
  return result.sites.filter(isRecord).slice(0, MAX_SITES);
}

function sessionProjection(
  entry: Record<string, unknown>,
  siteId: string | null,
): OperatorSessionWireRecord | null {
  const record = isRecord(entry.record) ? entry.record : entry;
  const sessionId = optionalString(entry.session_id) ?? optionalString(record.session_id);
  const state = displayState(entry.display_state);
  if (!sessionId || !state) return null;
  return {
    session_id: sessionId,
    site_id: siteId ?? optionalString(entry.site_id) ?? optionalString(record.site_id),
    agent_id: optionalString(entry.agent_id) ?? optionalString(record.agent_id),
    runtime_kind: optionalString(entry.runtime_kind) ?? optionalString(record.runtime_kind),
    launch_operator_surface_kind: optionalString(entry.launch_operator_surface_kind)
      ?? optionalString(record.launch_operator_surface_kind),
    started_at: optionalString(entry.started_at) ?? optionalString(record.started_at),
    last_seen_at: optionalString(entry.last_seen_at) ?? optionalString(record.last_seen_at),
    terminal_state: optionalString(entry.terminal_state) ?? optionalString(record.terminal_state),
    display_state: state,
    display_state_reason: optionalString(entry.display_state_reason) ?? 'discovery_projection_only',
    heartbeat_fresh: entry.heartbeat_fresh === true,
    heartbeat_age_ms: optionalNumber(entry.heartbeat_age_ms),
    health_status: optionalString(entry.health_status) ?? 'not_checked',
  };
}

function refused(refusals: string[]): OperatorSessionListWireResponse {
  return {
    schema: AGENT_SESSION_LIST_SCHEMA,
    status: 'refused',
    generated_at: new Date().toISOString(),
    count: 0,
    sessions: [],
    refusals,
  };
}

export function createAgentSessionReadModel(
  registryReadModel: SiteRegistryReadModel,
): AgentSessionReadModel {
  return {
    async list(): Promise<OperatorSessionListWireResponse> {
      let registryEnvelope: { exitCode: number; result: unknown };
      try {
        registryEnvelope = await registryReadModel.list();
      } catch {
        return refused(['site_registry_read_failed']);
      }
      if (registryEnvelope.exitCode !== 0) return refused(['site_registry_read_refused']);
      const sites = siteRows(registryEnvelope.result);
      if (!sites) return refused(['site_registry_response_invalid']);

      const sessions: OperatorSessionWireRecord[] = [];
      const refusals: string[] = [];
      for (const site of sites) {
        const siteId = optionalString(site.site_id);
        const siteRoot = optionalString(site.site_root);
        if (!siteRoot) {
          refusals.push(`site_root_missing:${siteId ?? 'unknown'}`);
          continue;
        }
        try {
          const discovery = discoverNarsSessions({ siteRoot });
          const healthBySessionId = await probeNarsSessionHealth(discovery.sessions);
          const refreshedDiscovery = discoverNarsSessions({ siteRoot, healthBySessionId });
          for (const entry of refreshedDiscovery.sessions) {
            if (sessions.length >= MAX_SESSIONS) break;
            const projection = isRecord(entry) ? sessionProjection(entry, siteId) : null;
            if (projection) sessions.push(projection);
            else refusals.push(`session_projection_invalid:${siteId ?? 'unknown'}`);
          }
        } catch {
          refusals.push(`session_discovery_failed:${siteId ?? 'unknown'}`);
        }
        if (sessions.length >= MAX_SESSIONS) break;
      }

      return {
        schema: AGENT_SESSION_LIST_SCHEMA,
        status: 'success',
        generated_at: new Date().toISOString(),
        count: sessions.length,
        sessions,
        refusals,
      };
    },
  };
}
