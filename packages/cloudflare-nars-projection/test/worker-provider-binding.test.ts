import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCloudflareNarsProjectionWorker, NarsProjectionState } from '../src/worker.js';

const now = '2026-07-19T00:00:00.000Z';

async function jsonOf(response: Response) {
  return JSON.parse(await response.text());
}

describe('worker provider env binding', () => {
  test('authority service health reports provider adapter when NARADA_AI_* env is bound', async () => {
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const health = await jsonOf(await worker.fetch(new Request('https://authority.example.test/api/nars/authority/health'), {
      NARADA_AI_BASE_URL: 'https://provider.example.test/v1/chat',
      NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
      NARADA_AI_MODEL: 'gpt-5.5',
    }));
    expect(health).toMatchObject({ status: 'healthy', execution: 'cloudflare_provider_http_adapter' });
  });

  test('authority service health reports the synthetic default when no provider env is bound', async () => {
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const health = await jsonOf(await worker.fetch(new Request('https://authority.example.test/api/nars/authority/health'), {}));
    expect(health).toMatchObject({ status: 'healthy', execution: 'cloudflare_runtime_tool_adapter' });
  });

  test('provider-bound worker declares provider capability on created sessions without exposing the key', async () => {
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const env = {
      NARADA_AI_BASE_URL: 'https://provider.example.test/v1/chat',
      NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
      NARADA_AI_API_KEY: 'sk-should-not-leak',
    };
    const created = await jsonOf(await worker.fetch(new Request('https://authority.example.test/api/nars/authority/sessions', {
      method: 'POST',
      body: JSON.stringify({ session_id: 'cf_env_provider', site_id: 'narada.test', agent_id: 'cloudflare.resident' }),
    }), env));
    expect(created.status).toBe('created');
    expect(created.session.execution_mode).toBe('cloudflare_provider_http_adapter');
    expect(created.session.provider_execution_state).toBe('declared');
    expect(JSON.stringify(created)).not.toContain('sk-should-not-leak');
  });

  test('durable object path binds the provider executor from its env', async () => {
    const storage = new Map<string, unknown>();
    const object = new NarsProjectionState({
      storage: {
        get<T = unknown>(key: string) { return storage.get(key) as T | undefined; },
        put(key: string, value: unknown) { storage.set(key, value); },
      },
    }, { NARADA_AI_BASE_URL: 'https://provider.example.test/v1/chat' });
    const response = await object.fetch(new Request('https://authority.example.test/api/nars/authority/sessions', {
      method: 'POST',
      body: JSON.stringify({ session_id: 'cf_do_provider', site_id: 'narada.test', agent_id: 'cloudflare.resident' }),
    }));
    const created = await jsonOf(response);
    expect(created.status).toBe('created');
    expect(created.session.execution_mode).toBe('cloudflare_provider_http_adapter');
  });
});

describe('provider-capable live smoke planning mode', () => {
  test('runs safe planning mode without mutation and prints the required live arguments', () => {
    const packageRoot = fileURLToPath(new URL('..', import.meta.url));
    const output = execFileSync(process.execPath, ['scripts/cloudflare-nars-provider-live-smoke.mjs', '--format', 'json'], {
      cwd: packageRoot,
      encoding: 'utf8',
    });
    const result = JSON.parse(output);
    expect(result.status).toBe('planned');
    expect(result.code).toBe('live_flag_required');
    expect(result.smoke_lineage).toBe('provider-capable-live');
    expect(result.suggested_command).toContain('smoke:provider-capable-live');
    expect(result.suggested_command).toContain('--live');
  });
});
