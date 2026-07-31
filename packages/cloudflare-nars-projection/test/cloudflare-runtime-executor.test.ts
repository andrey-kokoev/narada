import { describe, expect, it } from 'vitest';
import { createCloudflareNarsAuthorityService } from '../src/index.js';
import { createCloudflareNarsAuthorityRuntimeExecutor } from '../src/cloudflare-runtime-executor.js';
import { createCloudflareNarsProjectionWorker } from '../src/worker.js';

describe('Cloudflare NARS provider runtime admission', () => {
  it('does not infer provider availability from a global fetch alone', () => {
    const executor = createCloudflareNarsAuthorityRuntimeExecutor({
      INTELLIGENCE_REGISTRY_DB: {} as any,
    });
    expect(executor.availability).toBe('unavailable');
  });

  it('requires a principal before creating an available production session', () => {
    const executor = createCloudflareNarsAuthorityRuntimeExecutor({
      INTELLIGENCE_REGISTRY_DB: {} as any,
      AI: { run: async () => ({ text: 'unused' }) } as any,
    });
    expect(executor.availability).toBe('available');

    const service = createCloudflareNarsAuthorityService({ runtime_executor: executor });
    const refused = service.createSession({ site_id: 'site:test', agent_id: 'agent:test' });
    expect(refused).toMatchObject({
      status: 'refused',
      code: 'cloudflare_nars_principal_binding_required',
    });

    const created = service.createSession({
      site_id: 'site:test',
      agent_id: 'agent:test',
      principal_id: 'principal:test',
    });
    expect(created).toMatchObject({
      status: 'created',
      session: {
        principal_id: 'principal:test',
        provider_execution_state: 'declared',
      },
    });
  });

  it('records an aborted production turn as interrupted rather than provider failure', async () => {
    const executor = createCloudflareNarsAuthorityRuntimeExecutor({});
    const controller = new AbortController();
    controller.abort();
    const result = await executor.execute({
      session: { session_id: 'aborted-session', site_id: 'site:test', agent_id: 'agent:test', lifecycle_state: 'active' } as any,
      input_id: 'input-aborted',
      method: 'conversation.send',
      payload: {},
      message: 'aborted',
      now: '2026-07-30T00:00:00.000Z',
      tool_registry: { listTools: () => [] } as any,
      mcp_fabric: {} as any,
      session_control: { signal: controller.signal, isActive: () => false },
    });
    expect(result.invocation?.terminal_state).toBe('interrupted');
    expect(result.event_payloads.map((event) => event.event)).toContain('turn_interrupted');
    expect(result.event_payloads).toContainEqual(expect.objectContaining({ event: 'turn_complete', terminal_state: 'interrupted' }));
  });

  it('binds authority HTTP sessions and subsequent routes to the browser credential', async () => {
    const worker = createCloudflareNarsProjectionWorker({
      require_authority_credential: true,
      authority_runtime_executor: {
        execution_mode: 'cloudflare_test_fixture',
        availability: 'available',
        execute: () => ({ execution_kind: 'cloudflare_test_fixture', event_payloads: [] }),
      },
    });

    const collection = 'https://projection.example.test/api/nars/authority/sessions';
    const base = `${collection}/auth-bound`;
    const missing = await worker.fetch(new Request(collection, {
      method: 'POST',
      body: JSON.stringify({ site_id: 'site:test', agent_id: 'agent:test' }),
    }));
    expect(missing.status).toBe(401);

    const created = await worker.fetch(new Request(collection, {
      method: 'POST',
      headers: { 'x-narada-browser-token-fingerprint': 'fingerprint:browser-a' },
      body: JSON.stringify({ session_id: 'auth-bound', site_id: 'site:test', agent_id: 'agent:test' }),
    }));
    expect(created.status).toBe(200);
    await created.arrayBuffer();

    const wrongCredential = await worker.fetch(new Request(`${base}/health`, {
      headers: { 'x-narada-browser-token-fingerprint': 'fingerprint:browser-b' },
    }));
    expect(wrongCredential.status).toBe(403);
    await wrongCredential.arrayBuffer();

    const matchingCredential = await worker.fetch(new Request(`${base}/health`, {
      headers: { 'x-narada-browser-token-fingerprint': 'fingerprint:browser-a' },
    }));
    expect(matchingCredential.status).toBe(200);

    const revoked = await worker.fetch(new Request(base, {
      method: 'DELETE',
      headers: { 'x-narada-browser-token-fingerprint': 'fingerprint:browser-a' },
    }));
    expect(revoked.status).toBe(200);
    await revoked.arrayBuffer();

    const wrongTerminalReplay = await worker.fetch(new Request(`${base}/events?since_sequence=0`, {
      headers: { 'x-narada-browser-token-fingerprint': 'fingerprint:browser-b' },
    }));
    expect(wrongTerminalReplay.status).toBe(403);
    await wrongTerminalReplay.arrayBuffer();

    const matchingTerminalReplay = await worker.fetch(new Request(`${base}/events?since_sequence=0`, {
      headers: { 'x-narada-browser-token-fingerprint': 'fingerprint:browser-a' },
    }));
    expect(matchingTerminalReplay.status).toBe(200);
    const terminalReplay = await matchingTerminalReplay.json() as { status: string; terminal: boolean; events: Array<{ payload?: { event?: string } }> };
    expect(terminalReplay).toMatchObject({ status: 'ok', terminal: true });
    expect(terminalReplay.events.some((event) => event.payload?.event === 'authority_session_revoked')).toBe(true);
  });

  it('releases a completed turn controller before the next turn', async () => {
    const signals: AbortSignal[] = [];
    const worker = createCloudflareNarsProjectionWorker({
      require_authority_credential: true,
      authority_runtime_executor: {
        execution_mode: 'cloudflare_test_fixture',
        availability: 'available',
        execute: (input) => {
          signals.push(input.session_control.signal);
          return { execution_kind: 'cloudflare_test_fixture', event_payloads: [{ event: 'turn_complete', terminal_state: 'completed' }] };
        },
      },
    });
    const collection = 'https://projection.example.test/api/nars/authority/sessions';
    const base = `${collection}/controller-lifecycle`;
    const headers = { 'x-narada-browser-token-fingerprint': 'fingerprint:browser-a' };
    const created = await worker.fetch(new Request(collection, {
      method: 'POST',
      headers,
      body: JSON.stringify({ session_id: 'controller-lifecycle', site_id: 'site:test', agent_id: 'agent:test' }),
    }));
    expect(created.status).toBe(200);
    await created.arrayBuffer();

    const first = await worker.fetch(new Request(`${base}/input`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method: 'conversation.send', payload: { message: 'first' } }),
    }));
    expect(first.status).toBe(200);
    await first.arrayBuffer();
    const second = await worker.fetch(new Request(`${base}/input`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method: 'conversation.send', payload: { message: 'second' } }),
    }));
    expect(second.status).toBe(200);
    await second.arrayBuffer();

    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
  });

  it('emits admission events through the live authority sink before execution', async () => {
    const liveEvents: Array<{ payload: Record<string, unknown> }> = [];
    const service = createCloudflareNarsAuthorityService({
      on_event: (event) => liveEvents.push(event),
      runtime_executor: {
        execution_mode: 'cloudflare_test_fixture',
        availability: 'available',
        execute: () => ({
          execution_kind: 'cloudflare_test_fixture',
          event_payloads: [{ event: 'turn_complete', terminal_state: 'completed' }],
        }),
      },
    });
    const created = service.createSession({ site_id: 'site:test', agent_id: 'agent:test' });
    expect(created.status).toBe('created');
    await service.submitInput({
      session_id: created.session?.session_id ?? '',
      method: 'conversation.send',
      payload: { message: 'hello' },
    });
    const liveKinds = liveEvents.map((event) => event.payload.event);
    expect(liveKinds).toContain('session_started');
    expect(liveKinds.indexOf('operator_input_admitted')).toBeLessThan(liveKinds.indexOf('user_message'));
    expect(liveKinds.indexOf('user_message')).toBeLessThan(liveKinds.indexOf('turn_complete'));
  });

  it('reports a live sink delivery failure through health instead of claiming healthy delivery', async () => {
    const service = createCloudflareNarsAuthorityService({
      on_event: async () => {
        throw new Error('sink unavailable');
      },
      runtime_executor: {
        execution_mode: 'cloudflare_test_fixture',
        availability: 'available',
        execute: () => ({ execution_kind: 'cloudflare_test_fixture', event_payloads: [] }),
      },
    });
    const created = service.createSession({ session_id: 'sink-failure', site_id: 'site:test', agent_id: 'agent:test' });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(service.readHealth(created.session_id)).toMatchObject({
      status: 'degraded',
      code: 'live_event_sink_failed',
      live_event_sink_configured: true,
      live_event_sink_status: 'failed',
      live_event_sink_error: { code: 'live_event_sink_failed' },
    });
  });
});
