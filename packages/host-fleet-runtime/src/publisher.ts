import { HOST_FLEET_HEARTBEAT_SCHEMA, type HostFleetHeartbeat } from '@narada-core/host-fleet';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { HostFleetRuntimeConfig } from './config.js';
import { readLocalHealth } from './local-health.js';
import { hostFleetSigningRequestHeaders, loadHostFleetCredential, signHostFleetBody, type LoadedHostFleetCredential } from './security.js';
import {
  createHostFleetRuntimeHealth,
  type HostFleetPublishState,
  type HostFleetRuntimeHealth,
} from './health.js';

type FetchFunction = typeof fetch;

export interface HostFleetPublisher {
  publish(): Promise<void>;
  health(): HostFleetRuntimeHealth;
  start(): Promise<string>;
  stop(): Promise<void>;
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

export function createHostFleetPublisher(input: {
  config: HostFleetRuntimeConfig;
  fetch_fn?: FetchFunction;
  now?: () => Date;
}): HostFleetPublisher {
  if (input.config.mode !== 'publisher' || !input.config.ingress_url) throw new Error('host_fleet_publisher_mode_required');
  const config = input.config;
  const fetchFn = input.fetch_fn ?? fetch;
  const now = input.now ?? (() => new Date());
  let timer: NodeJS.Timeout | null = null;
  let publishOperation: Promise<void> | null = null;
  let server: Server | null = null;
  let credential: LoadedHostFleetCredential | null = null;
  let publishState: HostFleetPublishState = {
    last_publish_attempt_at: null,
    last_publish_success_at: null,
    last_publish_failure_code: null,
  };

  function health(): HostFleetRuntimeHealth {
    return createHostFleetRuntimeHealth(config, publishState, now());
  }

  async function publish(): Promise<void> {
    const attemptedAt = now().toISOString();
    publishState = { ...publishState, last_publish_attempt_at: attemptedAt };
    try {
      credential ??= await loadHostFleetCredential(config.credentials.active);
      const heartbeat: HostFleetHeartbeat = {
        schema: HOST_FLEET_HEARTBEAT_SCHEMA,
        fleet_id: config.fleet_id,
        host_id: config.host_id,
        observed_at: now().toISOString(),
        health: await readLocalHealth(config.local_health_url, config.probe.timeout_ms, fetchFn),
      };
      const body = Buffer.from(JSON.stringify(heartbeat));
      const signed = signHostFleetBody(body, credential, now().toISOString());
      const response = await fetchFn(config.ingress_url!, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...hostFleetSigningRequestHeaders(signed) },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(config.probe.timeout_ms),
      });
      await response.body?.cancel().catch(() => undefined);
      if (response.status !== 202) throw new Error(`host_fleet_publish_refused_${response.status}`);
      publishState = {
        last_publish_attempt_at: attemptedAt,
        last_publish_success_at: now().toISOString(),
        last_publish_failure_code: null,
      };
    } catch (error) {
      publishState = {
        ...publishState,
        last_publish_failure_code: publisherFailureCode(error),
      };
      throw error;
    }
  }

  return {
    publish,
    health,
    async start(): Promise<string> {
      if (timer || server) throw new Error('host_fleet_publisher_already_started');
      credential = await loadHostFleetCredential(config.credentials.active);
      server = createServer((req, res) => {
        const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
        if (req.method === 'GET' && pathname === '/health') {
          const current = health();
          json(res, current.status === 'healthy' ? 200 : 503, current);
          return;
        }
        json(res, 404, { status: 'refused', code: 'host_fleet_route_not_found' });
      });
      await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(config.listener.port, config.listener.host, resolve);
      });
      await publish().catch(() => undefined);
      timer = setInterval(() => {
        if (publishOperation) return;
        publishOperation = publish().catch(() => undefined).finally(() => { publishOperation = null; });
      }, config.heartbeat.interval_ms);
      timer.unref?.();
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : config.listener.port;
      const host = config.listener.host === '::1' ? '[::1]' : config.listener.host;
      return `http://${host}:${port}`;
    },
    async stop(): Promise<void> {
      if (timer) clearInterval(timer);
      timer = null;
      await Promise.allSettled([publishOperation].filter((value): value is Promise<void> => value !== null));
      publishOperation = null;
      const current = server;
      server = null;
      if (current) {
        await new Promise<void>((resolve, reject) => {
          current.close((error) => error ? reject(error) : resolve());
          current.closeAllConnections();
        });
      }
    },
  };
}

function publisherFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'host_fleet_publish_failed';
  if (/^host_fleet_[a-z0-9_]+$/.test(error.message)) return error.message;
  if (/^host_fleet_publish_refused_[1-5][0-9]{2}$/.test(error.message)) return error.message;
  return 'host_fleet_publish_failed';
}
