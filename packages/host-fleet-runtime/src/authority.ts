import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  HOST_FLEET_HEARTBEAT_SCHEMA,
  HOST_FLEET_HOST_SCHEMA,
  HOST_FLEET_READ_RESPONSE_SCHEMA,
  HOST_FLEET_SNAPSHOT_SCHEMA,
  validateHostFleetHeartbeat,
  validateHostFleetReadResponse,
  type HostFleetHeartbeat,
  type HostFleetHost,
  type HostFleetReadResponse,
  type HostFleetSnapshot,
} from '@narada-core/host-fleet';
import type { HostFleetRuntimeConfig, HostFleetRosterEntry } from './config.js';
import {
  HOST_FLEET_KEY_ID_HEADER,
  HOST_FLEET_NONCE_HEADER,
  HOST_FLEET_SIGNATURE_HEADER,
  HOST_FLEET_TIMESTAMP_HEADER,
  hostFleetSigningRequestHeaders,
  loadHostFleetCredential,
  signHostFleetBody,
  verifyHostFleetBody,
  type HostFleetSigningHeaders,
  type LoadedHostFleetCredential,
} from './security.js';
import { HostFleetReplayRefusal, HostFleetSqliteStore } from './store.js';
import {
  createHostFleetRuntimeHealth,
  type HostFleetPublishState,
  type HostFleetRuntimeHealth,
} from './health.js';
import { readLocalHealth } from './local-health.js';

export const HOST_FLEET_ADMISSION_RESULT_SCHEMA = 'narada.host_fleet.admission_result.v1' as const;

type FetchFunction = typeof fetch;

export interface HostFleetAuthorityOptions {
  config: HostFleetRuntimeConfig;
  state_path: string;
  fetch_fn?: FetchFunction;
  now?: () => Date;
}

export interface HostFleetAuthorityServer {
  url: string;
  stop(): Promise<void>;
}

function header(headers: IncomingHttpHeaders | Headers | Record<string, string | string[] | undefined>, name: string): string {
  if (headers instanceof Headers) return headers.get(name) ?? '';
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function signingHeaders(headers: IncomingHttpHeaders | Headers | Record<string, string | string[] | undefined>): HostFleetSigningHeaders {
  return {
    key_id: header(headers, HOST_FLEET_KEY_ID_HEADER),
    timestamp: header(headers, HOST_FLEET_TIMESTAMP_HEADER),
    nonce: header(headers, HOST_FLEET_NONCE_HEADER),
    signature: header(headers, HOST_FLEET_SIGNATURE_HEADER),
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += next.byteLength;
    if (total > limit) return null;
    chunks.push(next);
  }
  return Buffer.concat(chunks, total);
}

function effectiveHealth(observation: HostFleetHeartbeat | undefined, freshness: 'fresh' | 'stale' | 'unknown') {
  const reported = observation?.health.status ?? 'unknown';
  return {
    status: freshness === 'fresh' ? reported : 'unknown' as const,
    reported_status: reported,
    observed_at: observation?.observed_at ?? null,
    detail: freshness === 'stale' ? 'stale_heartbeat' : observation?.health.detail ?? null,
  };
}

export class HostFleetAuthority {
  readonly config: HostFleetRuntimeConfig;
  readonly store: HostFleetSqliteStore;
  private readonly fetchFn: FetchFunction;
  private readonly now: () => Date;
  private credentials: LoadedHostFleetCredential[] = [];
  private server: Server | null = null;
  private probeTimer: NodeJS.Timeout | null = null;
  private publisherTimer: NodeJS.Timeout | null = null;
  private probeOperation: Promise<void> | null = null;
  private publishOperation: Promise<void> | null = null;
  private publishState: HostFleetPublishState = {
    last_publish_attempt_at: null,
    last_publish_success_at: null,
    last_publish_failure_code: null,
  };

  constructor(options: HostFleetAuthorityOptions) {
    if (options.config.mode !== 'authority') throw new Error('host_fleet_authority_mode_required');
    this.config = options.config;
    this.store = new HostFleetSqliteStore(options.state_path);
    this.fetchFn = options.fetch_fn ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async initialize(): Promise<void> {
    const refs = [this.config.credentials.active, this.config.credentials.previous].filter((value) => value !== null);
    this.credentials = await Promise.all(refs.map((value) => loadHostFleetCredential(value)));
  }

  admit(body: Buffer, headers: IncomingHttpHeaders | Headers | Record<string, string | string[] | undefined>): { host_id: string; received_at: string } {
    if (body.byteLength > this.config.heartbeat.max_body_bytes) throw new Error('host_fleet_heartbeat_body_too_large');
    const received = this.now();
    const signed = signingHeaders(headers);
    const credential = verifyHostFleetBody({
      body,
      headers: signed,
      credentials: this.credentials,
      now_ms: received.getTime(),
      max_clock_skew_ms: this.config.heartbeat.max_clock_skew_ms,
    });
    let parsed: unknown;
    try { parsed = JSON.parse(body.toString('utf8')); }
    catch { throw new Error('host_fleet_heartbeat_json_invalid'); }
    const heartbeat = validateHostFleetHeartbeat(parsed);
    if (heartbeat.fleet_id !== this.config.fleet_id) throw new Error('host_fleet_id_mismatch');
    if (!this.config.roster.some((entry) => entry.host_id === heartbeat.host_id)) throw new Error('host_fleet_host_not_rostered');
    const observedMs = Date.parse(heartbeat.observed_at);
    if (Math.abs(received.getTime() - observedMs) > this.config.heartbeat.max_clock_skew_ms) {
      throw new Error('host_fleet_heartbeat_observed_at_invalid');
    }
    const receivedAt = received.toISOString();
    this.store.admit({
      heartbeat,
      key_id: credential.key_id,
      nonce: signed.nonce,
      received_at: receivedAt,
      nonce_cutoff: new Date(received.getTime() - this.config.heartbeat.max_clock_skew_ms * 2).toISOString(),
    });
    return { host_id: heartbeat.host_id, received_at: receivedAt };
  }

  snapshot(): HostFleetSnapshot {
    const now = this.now();
    const observations = this.store.observations();
    const probes = this.store.probes();
    const hosts: HostFleetHost[] = this.config.roster.map((entry) => {
      const storedObservation = observations.get(entry.host_id);
      const observation = storedObservation?.heartbeat.fleet_id === this.config.fleet_id
        ? storedObservation
        : undefined;
      const receivedMs = observation ? Date.parse(observation.received_at) : Number.NaN;
      const freshness = !observation
        ? 'unknown' as const
        : now.getTime() - receivedMs <= this.config.heartbeat.stale_after_ms
          ? 'fresh' as const
          : 'stale' as const;
      const probe = probes.get(entry.host_id);
      return {
        schema: HOST_FLEET_HOST_SCHEMA,
        identity: { host_id: entry.host_id, display_name: entry.display_name, platform: entry.platform },
        reachability: {
          status: probe?.status ?? 'unknown',
          observed_at: probe?.observed_at ?? null,
          publisher_freshness: freshness,
          heartbeat_received_at: observation?.received_at ?? null,
        },
        health: effectiveHealth(observation?.heartbeat, freshness),
        operator_console: {
          status: entry.operator_console_url ? 'available' : 'unknown',
          url: entry.operator_console_url,
        },
      };
    });
    hosts.sort((left, right) => left.identity.host_id.localeCompare(right.identity.host_id));
    return { schema: HOST_FLEET_SNAPSHOT_SCHEMA, generated_at: now.toISOString(), hosts };
  }

  read(): HostFleetReadResponse {
    return validateHostFleetReadResponse({
      schema: HOST_FLEET_READ_RESPONSE_SCHEMA,
      runtime: {
        status: 'ready',
        authority_host_id: this.config.authority_host_id,
        checked_at: this.now().toISOString(),
        detail_code: null,
        correlation_id: null,
      },
      snapshot: this.snapshot(),
    });
  }

  health(): HostFleetRuntimeHealth {
    return createHostFleetRuntimeHealth(this.config, this.publishState, this.now());
  }

  async probeHosts(): Promise<void> {
    await Promise.all(this.config.roster.map(async (entry) => {
      const observedAt = this.now().toISOString();
      if (!entry.operator_console_health_url) {
        this.store.recordProbe({ host_id: entry.host_id, status: 'unknown', observed_at: observedAt });
        return;
      }
      let status: 'reachable' | 'unreachable' = 'unreachable';
      try {
        const response = await this.fetchFn(entry.operator_console_health_url, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(this.config.probe.timeout_ms),
        });
        status = response.ok ? 'reachable' : 'unreachable';
        await response.body?.cancel().catch(() => undefined);
      } catch {
        status = 'unreachable';
      }
      this.store.recordProbe({ host_id: entry.host_id, status, observed_at: observedAt });
    }));
  }

  async publishLocalHeartbeat(): Promise<void> {
    const attemptedAt = this.now().toISOString();
    this.publishState = { ...this.publishState, last_publish_attempt_at: attemptedAt };
    try {
      const health = await readLocalHealth(this.config.local_health_url, this.config.probe.timeout_ms, this.fetchFn);
      const body = Buffer.from(JSON.stringify({
        schema: HOST_FLEET_HEARTBEAT_SCHEMA,
        fleet_id: this.config.fleet_id,
        host_id: this.config.host_id,
        observed_at: this.now().toISOString(),
        health,
      } satisfies HostFleetHeartbeat));
      const credential = this.credentials.find((candidate) => candidate.key_id === this.config.credentials.active.key_id);
      if (!credential) throw new Error('host_fleet_active_credential_unavailable');
      const signed = signHostFleetBody(body, credential, this.now().toISOString());
      this.admit(body, hostFleetSigningRequestHeaders(signed));
      this.publishState = {
        last_publish_attempt_at: attemptedAt,
        last_publish_success_at: this.now().toISOString(),
        last_publish_failure_code: null,
      };
    } catch (error) {
      this.publishState = {
        ...this.publishState,
        last_publish_failure_code: hostFleetFailureCode(error, 'host_fleet_local_publish_failed'),
      };
      throw error;
    }
  }

  async start(): Promise<HostFleetAuthorityServer> {
    if (this.server) throw new Error('host_fleet_authority_already_started');
    if (this.credentials.length === 0) await this.initialize();
    await this.publishLocalHeartbeat();
    await this.probeHosts();
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res).catch(() => {
        if (!res.headersSent) json(res, 500, { status: 'refused', code: 'host_fleet_internal_error', correlation_id: randomUUID() });
        else res.destroy();
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.config.listener.port, this.config.listener.host, resolve);
    });
    const address = this.server.address();
    const port = typeof address === 'object' && address ? address.port : this.config.listener.port;
    const host = this.config.listener.host === '::1' ? '[::1]' : this.config.listener.host;
    const url = `http://${host}:${port}`;
    this.probeTimer = setInterval(() => {
      if (this.probeOperation) return;
      this.probeOperation = this.probeHosts().finally(() => { this.probeOperation = null; });
    }, this.config.probe.interval_ms);
    this.publisherTimer = setInterval(() => {
      if (this.publishOperation) return;
      this.publishOperation = this.publishLocalHeartbeat()
        .catch(() => undefined)
        .finally(() => { this.publishOperation = null; });
    }, this.config.heartbeat.interval_ms);
    this.probeTimer.unref?.();
    this.publisherTimer.unref?.();
    return { url, stop: () => this.stop() };
  }

  async stop(): Promise<void> {
    if (this.probeTimer) clearInterval(this.probeTimer);
    if (this.publisherTimer) clearInterval(this.publisherTimer);
    this.probeTimer = null;
    this.publisherTimer = null;
    await Promise.allSettled([this.probeOperation, this.publishOperation].filter((value): value is Promise<void> => value !== null));
    this.probeOperation = null;
    this.publishOperation = null;
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
    this.store.close();
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && pathname === '/health') {
      const health = this.health();
      json(res, health.status === 'healthy' ? 200 : 503, health);
      return;
    }
    if (req.method === 'GET' && pathname === '/v1/snapshot') {
      json(res, 200, this.read());
      return;
    }
    if (req.method === 'POST' && pathname === '/v1/observations') {
      const body = await readBody(req, this.config.heartbeat.max_body_bytes);
      if (body === null) {
        json(res, 413, { status: 'refused', code: 'host_fleet_heartbeat_body_too_large' });
        return;
      }
      try {
        const admitted = this.admit(body, req.headers);
        json(res, 202, { schema: HOST_FLEET_ADMISSION_RESULT_SCHEMA, status: 'accepted', ...admitted });
      } catch (error) {
        const code = error instanceof HostFleetReplayRefusal
          ? error.code
          : error instanceof Error && /^host_fleet_[a-z0-9_]+$/.test(error.message)
            ? error.message
            : 'host_fleet_admission_refused';
        json(res, code === 'host_fleet_heartbeat_replay' ? 409 : 401, { status: 'refused', code });
      }
      return;
    }
    json(res, 404, { status: 'refused', code: 'host_fleet_route_not_found' });
  }
}

function hostFleetFailureCode(error: unknown, fallback: string): string {
  return error instanceof Error && /^host_fleet_[a-z0-9_]+$/.test(error.message) ? error.message : fallback;
}
