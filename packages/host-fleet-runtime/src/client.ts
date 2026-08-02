import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  HOST_FLEET_READ_RESPONSE_SCHEMA,
  validateHostFleetReadResponse,
  type HostFleetReadResponse,
} from '@narada-core/host-fleet';
import {
  HOST_FLEET_KEY_ID_HEADER,
  HOST_FLEET_NONCE_HEADER,
  HOST_FLEET_SIGNATURE_HEADER,
  HOST_FLEET_TIMESTAMP_HEADER,
} from './security.js';
import {
  defaultHostFleetMachinePaths,
  readHostFleetRuntimeConfig,
  type HostFleetRuntimeConfig,
} from './config.js';
import { validateHostFleetRuntimeHealth, type HostFleetRuntimeHealth } from './health.js';

type FetchFunction = typeof fetch;

export interface HostFleetRuntimeClient {
  health(): Promise<HostFleetRuntimeHealth>;
  read(): Promise<HostFleetReadResponse>;
  forwardHeartbeat(body: Buffer, headers: Record<string, string | undefined>): Promise<{ status: number; body: unknown }>;
}

export interface HostFleetProjectionReader {
  read(): Promise<HostFleetReadResponse>;
  forwardHeartbeat(body: Buffer, headers: Record<string, string | undefined>): Promise<{ status: number; body: unknown }>;
}

export function createHostFleetRuntimeClient(input: {
  base_url?: string;
  timeout_ms?: number;
  fetch_fn?: FetchFunction;
} = {}): HostFleetRuntimeClient {
  const baseUrl = normalizeBaseUrl(input.base_url ?? 'http://127.0.0.1:61732');
  const timeoutMs = normalizeTimeout(input.timeout_ms ?? 3_000);
  const fetchFn = input.fetch_fn ?? fetch;
  return {
    async health(): Promise<HostFleetRuntimeHealth> {
      const response = await fetchFn(`${baseUrl}/health`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return validateHostFleetRuntimeHealth(await response.json().catch(() => null));
    },
    async read(): Promise<HostFleetReadResponse> {
      const response = await fetchFn(`${baseUrl}/v1/snapshot`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error('host_fleet_authority_read_unavailable');
      return validateHostFleetReadResponse(payload);
    },
    async forwardHeartbeat(body, headers): Promise<{ status: number; body: unknown }> {
      const forwarded: Record<string, string> = { 'content-type': 'application/json' };
      for (const name of [HOST_FLEET_KEY_ID_HEADER, HOST_FLEET_TIMESTAMP_HEADER, HOST_FLEET_NONCE_HEADER, HOST_FLEET_SIGNATURE_HEADER]) {
        const value = headers[name];
        if (value) forwarded[name] = value;
      }
      const response = await fetchFn(`${baseUrl}/v1/observations`, {
        method: 'POST',
        headers: forwarded,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: response.status, body: await response.json().catch(() => ({ status: 'refused', code: 'host_fleet_authority_response_invalid' })) };
    },
  };
}

export function createDefaultHostFleetProjectionReader(input: {
  config_path?: string;
  base_url?: string;
  timeout_ms?: number;
  fetch_fn?: FetchFunction;
  exists_fn?: (path: string) => boolean;
  now?: () => Date;
} = {}): HostFleetProjectionReader {
  const configPath = input.config_path ?? defaultHostFleetMachinePaths().config_path;
  const exists = input.exists_fn ?? existsSync;
  const now = input.now ?? (() => new Date());

  async function machineConfig(): Promise<HostFleetRuntimeConfig> {
    let config: HostFleetRuntimeConfig;
    try { config = await readHostFleetRuntimeConfig(configPath); }
    catch { throw new Error('host_fleet_runtime_config_invalid'); }
    return config;
  }

  function authorityClient(config: HostFleetRuntimeConfig): HostFleetRuntimeClient {
    return createHostFleetRuntimeClient({
      ...input,
      base_url: input.base_url ?? hostFleetRuntimeBaseUrl(config),
    });
  }

  return {
    async read(): Promise<HostFleetReadResponse> {
      if (!exists(configPath)) return unavailableHostFleetReadResponse('host_fleet_runtime_unconfigured', now());
      let config: HostFleetRuntimeConfig;
      try { config = await machineConfig(); }
      catch { return unavailableHostFleetReadResponse('host_fleet_runtime_config_invalid', now()); }
      if (config.mode !== 'authority') {
        return unavailableHostFleetReadResponse('host_fleet_runtime_not_authority', now(), config.authority_host_id);
      }
      try { return await authorityClient(config).read(); }
      catch { return unavailableHostFleetReadResponse('host_fleet_runtime_unavailable', now(), config.authority_host_id); }
    },
    async forwardHeartbeat(body, headers): Promise<{ status: number; body: unknown }> {
      if (!exists(configPath)) throw new Error('host_fleet_runtime_unconfigured');
      const config = await machineConfig();
      if (config.mode !== 'authority') throw new Error('host_fleet_runtime_not_authority');
      return authorityClient(config).forwardHeartbeat(body, headers);
    },
  };
}

export function unavailableHostFleetReadResponse(
  detailCode:
    | 'host_fleet_runtime_unconfigured'
    | 'host_fleet_runtime_config_invalid'
    | 'host_fleet_runtime_not_authority'
    | 'host_fleet_runtime_unavailable',
  now = new Date(),
  authorityHostId: string | null = null,
): HostFleetReadResponse {
  return {
    schema: HOST_FLEET_READ_RESPONSE_SCHEMA,
    runtime: {
      status: detailCode === 'host_fleet_runtime_unconfigured' ? 'unconfigured' : 'degraded',
      authority_host_id: authorityHostId,
      checked_at: now.toISOString(),
      detail_code: detailCode,
      correlation_id: randomUUID(),
    },
    snapshot: null,
  };
}

export function hostFleetRuntimeBaseUrl(config: HostFleetRuntimeConfig): string {
  const host = config.listener.host === '::1' ? '[::1]' : config.listener.host;
  return `http://${host}:${config.listener.port}`;
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('host_fleet_runtime_url_invalid'); }
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('host_fleet_runtime_url_not_loopback');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new Error('host_fleet_runtime_url_invalid');
  }
  return parsed.toString().replace(/\/$/, '');
}

function normalizeTimeout(value: number): number {
  if (!Number.isInteger(value) || value < 100 || value > 30_000) throw new Error('host_fleet_runtime_timeout_invalid');
  return value;
}
