import type { CloudflareHostFleetRequestObservation } from './cloudflare-host-fleet.js';

export const CLOUDFLARE_HOST_FLEET_AUDIT_SCHEMA = 'narada.cloudflare.host_fleet_audit.v1' as const;
const STORAGE_KEY = 'narada.cloudflare.host_fleet_audit.observations.v1';
const MAX_OBSERVATIONS = 10_000;
const MAX_READ = 1_000;

interface DurableObjectStateLike {
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined> | T | undefined;
    put(key: string, value: unknown): Promise<void> | void;
  };
  blockConcurrencyWhile?(callback: () => Promise<void> | void): Promise<void> | void;
}

interface AuditEnvelope {
  schema: typeof CLOUDFLARE_HOST_FLEET_AUDIT_SCHEMA;
  observations: CloudflareHostFleetRequestObservation[];
}

function metrics(observations: readonly CloudflareHostFleetRequestObservation[]): Record<string, unknown> {
  const byHost = new Map<string, number>();
  const byOutcome = new Map<string, number>();
  for (const observation of observations) {
    const host = `${observation.host.host_id}@${observation.host.host_instance_id}`;
    byHost.set(host, (byHost.get(host) ?? 0) + 1);
    byOutcome.set(observation.outcome, (byOutcome.get(observation.outcome) ?? 0) + 1);
  }
  return {
    total: observations.length,
    by_host: Object.fromEntries([...byHost.entries()].sort(([left], [right]) => left.localeCompare(right))),
    by_outcome: Object.fromEntries([...byOutcome.entries()].sort(([left], [right]) => left.localeCompare(right))),
    oldest_observed_at: observations[0]?.observed_at ?? null,
    newest_observed_at: observations.at(-1)?.observed_at ?? null,
  };
}

function isObservation(value: unknown): value is CloudflareHostFleetRequestObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const host = candidate.host;
  return candidate.schema === 'narada.cloudflare.host_fleet.gateway_request_observation.v1'
    && typeof candidate.request_id === 'string'
    && typeof candidate.method === 'string'
    && typeof candidate.path === 'string'
    && typeof candidate.outcome === 'string'
    && typeof candidate.duration_ms === 'number'
    && typeof candidate.observed_at === 'string'
    && !!host && typeof host === 'object' && !Array.isArray(host)
    && typeof (host as Record<string, unknown>).host_id === 'string'
    && typeof (host as Record<string, unknown>).host_instance_id === 'string';
}

function boundedObservations(value: unknown): CloudflareHostFleetRequestObservation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObservation).slice(-MAX_OBSERVATIONS);
}

export class CloudflareHostFleetAuditState {
  private initialized: Promise<void> | null = null;

  constructor(private readonly state: DurableObjectStateLike) {}

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = Promise.resolve(this.state.blockConcurrencyWhile?.(async () => {
        const existing = await this.state.storage.get<AuditEnvelope>(STORAGE_KEY);
        if (!existing || existing.schema !== CLOUDFLARE_HOST_FLEET_AUDIT_SCHEMA || !Array.isArray(existing.observations)) {
          await this.state.storage.put(STORAGE_KEY, { schema: CLOUDFLARE_HOST_FLEET_AUDIT_SCHEMA, observations: [] } satisfies AuditEnvelope);
        }
      }));
    }
    await this.initialized;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();
    const url = new URL(request.url);
    const stored = await this.state.storage.get<AuditEnvelope>(STORAGE_KEY);
    const observations = boundedObservations(stored?.observations);
    if (request.method === 'POST' && url.pathname === '/internal/host-fleet/audit') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const incoming = boundedObservations(body?.observations);
      const seen = new Set(observations.map((entry) => `${entry.host.host_id}@${entry.host.host_instance_id}:${entry.request_id}`));
      for (const entry of incoming) {
        const key = `${entry.host.host_id}@${entry.host.host_instance_id}:${entry.request_id}`;
        if (!seen.has(key)) {
          observations.push(entry);
          seen.add(key);
        }
      }
      await this.state.storage.put(STORAGE_KEY, { schema: CLOUDFLARE_HOST_FLEET_AUDIT_SCHEMA, observations: observations.slice(-MAX_OBSERVATIONS) } satisfies AuditEnvelope);
      return Response.json({ schema: CLOUDFLARE_HOST_FLEET_AUDIT_SCHEMA, status: 'stored', count: incoming.length });
    }
    if (request.method === 'GET' && url.pathname === '/internal/host-fleet/audit') {
      const rawLimit = Number(url.searchParams.get('limit') ?? '100');
      const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= MAX_READ ? rawLimit : 100;
      return Response.json({
        schema: CLOUDFLARE_HOST_FLEET_AUDIT_SCHEMA,
        status: 'success',
        count: Math.min(limit, observations.length),
        retention_limit: MAX_OBSERVATIONS,
        metrics: metrics(observations),
        observations: observations.slice(-limit).reverse(),
      });
    }
    return Response.json({ schema: CLOUDFLARE_HOST_FLEET_AUDIT_SCHEMA, status: 'refused', reason: 'route_not_found' }, { status: 404 });
  }
}

export interface CloudflareHostFleetAuditNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> | Response };
}

export async function appendCloudflareHostFleetObservations(
  namespace: CloudflareHostFleetAuditNamespace | undefined,
  observations: readonly CloudflareHostFleetRequestObservation[],
): Promise<void> {
  if (!namespace || observations.length === 0) return;
  await namespace.get(namespace.idFromName('fleet')).fetch(new Request('https://host-fleet-audit.internal/internal/host-fleet/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ observations }),
  }));
}

export async function readCloudflareHostFleetObservations(
  namespace: CloudflareHostFleetAuditNamespace | undefined,
  limit: number,
): Promise<unknown | null> {
  if (!namespace) return null;
  const response = await namespace.get(namespace.idFromName('fleet')).fetch(new Request(`https://host-fleet-audit.internal/internal/host-fleet/audit?limit=${encodeURIComponent(String(limit))}`));
  return response.json().catch(() => null);
}
