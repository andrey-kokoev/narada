import { describe, expect, test } from 'vitest';
import { createCloudflareNarsProjectionWorker, NarsProjectionState } from '../src/worker.js';

const now = '2026-07-19T00:00:00.000Z';

async function jsonOf(response: Response) {
  return JSON.parse(await response.text());
}

const retiredProviderBindings = {
  NARADA_AI_BASE_URL: 'https://provider.example.test/v1/chat',
  NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
  NARADA_AI_MODEL: 'gpt-5.5',
  NARADA_AI_THINKING: 'high',
  NARADA_AI_API_KEY: 'sk-must-be-ignored',
};

describe('worker invokable-intelligence authority boundary', () => {
  test('retired provider/model bindings cannot select projection execution', async () => {
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const health = await jsonOf(await worker.fetch(
      new Request('https://authority.example.test/api/nars/authority/health'),
      retiredProviderBindings as never,
    ));

    expect(health).toEqual({
      schema: 'narada.cloudflare_nars_authority.service_health.v1',
      status: 'degraded',
      execution: 'canonical_invokable_intelligence_gateway',
      execution_availability: 'unavailable',
      code: 'canonical_invokable_intelligence_gateway_required',
    });
    expect(JSON.stringify(health)).not.toContain('openai-api');
    expect(JSON.stringify(health)).not.toContain('gpt-5.5');
    expect(JSON.stringify(health)).not.toContain('sk-must-be-ignored');
  });

  test('projection authority refuses input before admission when no canonical gateway is injected', async () => {
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const env = retiredProviderBindings as never;
    const created = await jsonOf(await worker.fetch(new Request('https://authority.example.test/api/nars/authority/sessions', {
      method: 'POST',
      body: JSON.stringify({ session_id: 'cf_no_duplicate_authority', site_id: 'narada.test', agent_id: 'cloudflare.resident' }),
    }), env));

    expect(created).toMatchObject({
      status: 'created',
      session: {
        execution_mode: 'canonical_invokable_intelligence_gateway',
        provider_execution_state: 'absent',
      },
    });

    const sessionHealth = await jsonOf(await worker.fetch(new Request(
      'https://authority.example.test/api/nars/authority/sessions/cf_no_duplicate_authority/health',
    ), env));
    expect(sessionHealth).toMatchObject({
      status: 'degraded',
      code: 'canonical_invokable_intelligence_gateway_required',
      execution_mode: 'canonical_invokable_intelligence_gateway',
      execution_availability: 'unavailable',
    });

    const refused = await jsonOf(await worker.fetch(new Request(
      'https://authority.example.test/api/nars/authority/sessions/cf_no_duplicate_authority/input',
      {
        method: 'POST',
        body: JSON.stringify({ method: 'conversation.send', payload: { message: 'must not execute here' } }),
      },
    ), env));
    expect(refused).toMatchObject({
      status: 'refused',
      code: 'canonical_invokable_intelligence_gateway_required',
      session_id: 'cf_no_duplicate_authority',
      method: 'conversation.send',
    });

    const replay = await jsonOf(await worker.fetch(new Request(
      'https://authority.example.test/api/nars/authority/sessions/cf_no_duplicate_authority/events',
    ), env));
    expect(replay.events.map((event: { payload?: { event?: string } }) => event.payload?.event)).toEqual(['session_started']);
  });

  test('durable-object restoration keeps the same fail-closed boundary', async () => {
    const storage = new Map<string, unknown>();
    const object = new NarsProjectionState({
      storage: {
        get<T = unknown>(key: string) { return storage.get(key) as T | undefined; },
        put(key: string, value: unknown) { storage.set(key, value); },
      },
    }, retiredProviderBindings as never);

    const created = await jsonOf(await object.fetch(new Request('https://authority.example.test/api/nars/authority/sessions', {
      method: 'POST',
      body: JSON.stringify({ session_id: 'cf_do_no_duplicate_authority', site_id: 'narada.test', agent_id: 'cloudflare.resident' }),
    })));
    expect(created.session.execution_mode).toBe('canonical_invokable_intelligence_gateway');

    const refused = await jsonOf(await object.fetch(new Request(
      'https://authority.example.test/api/nars/authority/sessions/cf_do_no_duplicate_authority/input',
      {
        method: 'POST',
        body: JSON.stringify({ method: 'conversation.send', payload: { message: 'must still refuse' } }),
      },
    )));
    expect(refused).toMatchObject({
      status: 'refused',
      code: 'canonical_invokable_intelligence_gateway_required',
    });
  });
});
