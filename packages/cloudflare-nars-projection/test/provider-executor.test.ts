import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { validateNarsRuntimeSurfaceContract } from '@narada2/nars-runtime-contract/runtime-surface-contract';
import {
  createCloudflareNarsAuthorityService,
  createCloudflareNarsProviderRuntimeExecutor,
} from '../src/index.js';

const now = '2026-07-19T00:00:00.000Z';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FixtureBehavior {
  status?: number;
  body?: Record<string, unknown>;
  delay_ms?: number;
  never_respond?: boolean;
}

let server: Server;
let baseUrl: string;
let behavior: FixtureBehavior = {};
const requests: Array<{ body: Record<string, unknown>; authorization: string | null }> = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', async () => {
      requests.push({ body: raw ? JSON.parse(raw) : {}, authorization: typeof req.headers.authorization === 'string' ? req.headers.authorization : null });
      if (behavior.never_respond) return;
      if (behavior.delay_ms) await sleep(behavior.delay_ms);
      const status = behavior.status ?? 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(behavior.body ?? { content: 'provider reply', tool_calls: [] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/provider`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function providerService(options: { timeout_ms?: number; env?: Record<string, string> } = {}) {
  const executor = createCloudflareNarsProviderRuntimeExecutor({
    binding: {
      provider: 'fixture-provider',
      model: 'fixture-model',
      thinking: 'low',
      api_base_url: baseUrl,
      api_key_env: 'FIXTURE_PROVIDER_KEY',
      timeout_ms: options.timeout_ms ?? null,
    },
    env: options.env ?? {},
  });
  return createCloudflareNarsAuthorityService({ max_events: 50, runtime_executor: executor, mcp_fabric: { scope: 'all' } });
}

describe('cloudflare provider http adapter', () => {
  test('provider capability is declared (not present) from configuration alone, and graduates only on executed turn evidence', async () => {
    behavior = { body: { content: 'hello from provider', tool_calls: [] } };
    const service = providerService();
    const created = service.createSession({ session_id: 'cf_provider_1', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    expect(created.status).toBe('created');
    expect(created.session!.execution_mode).toBe('cloudflare_provider_http_adapter');
    expect(created.session!.provider_execution_state).toBe('declared');
    expect(created.session!.capability_evidence).toMatchObject({
      provider_execution: { state: 'declared', evidence_ref: 'provider-binding:fixture-provider:fixture-model:low' },
    });
    expect(created.session!.runtime_surface_contract.capability_profile.provider_execution).toBe('declared');
    expect(validateNarsRuntimeSurfaceContract(created.session!.runtime_surface_contract)).toEqual({ ok: true, violations: [] });

    const admitted = await service.submitInput({ session_id: 'cf_provider_1', method: 'conversation.send', payload: { message: 'run a provider turn' }, now });
    expect(admitted.status).toBe('admitted');
    expect(admitted.execution_kind).toBe('cloudflare_provider_http_adapter');
    expect(admitted.events?.map((event) => event.payload.event)).toEqual([
      'operator_input_admitted',
      'user_message',
      'turn_started',
      'provider_request',
      'provider_response',
      'assistant_message',
      'turn_complete',
    ]);
    const assistant = admitted.events?.find((event) => event.payload.event === 'assistant_message');
    expect(assistant?.payload.content).toBe('hello from provider');

    const graduated = service.readHealth('cf_provider_1');
    expect(graduated.runtime_surface_contract!.capability_profile.provider_execution).toBe('present');
    expect(graduated.runtime_surface_contract!.capability_evidence).toMatchObject({
      provider_execution: { state: 'present', evidence_ref: `provider_${admitted.input_id}`, graduated_at: now },
    });
    expect(validateNarsRuntimeSurfaceContract(graduated.runtime_surface_contract)).toEqual({ ok: true, violations: [] });
  });

  test('provider request carries idempotency key and binding metadata but never the api key', async () => {
    behavior = { body: { content: 'secret check', tool_calls: [] } };
    requests.length = 0;
    const service = providerService({ env: { FIXTURE_PROVIDER_KEY: 'sk-fixture-secret-value' } });
    service.createSession({ session_id: 'cf_provider_secret', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    const admitted = await service.submitInput({ session_id: 'cf_provider_secret', method: 'conversation.send', payload: { message: 'check secret handling' }, now });
    expect(admitted.status).toBe('admitted');
    expect(requests).toHaveLength(1);
    expect(requests[0].authorization).toBe('Bearer sk-fixture-secret-value');
    expect(requests[0].body.idempotency_key).toBe(admitted.input_id);
    expect(requests[0].body.request_id).toBe(`provider_${admitted.input_id}`);
    const serializedEvents = JSON.stringify(admitted.events ?? []);
    expect(serializedEvents).not.toContain('sk-fixture-secret-value');
  });

  test('provider-driven tool calls execute only through the session fabric; unknown tools are refused', async () => {
    behavior = {
      body: {
        content: 'used tools',
        tool_calls: [
          { server_name: 'cf-authority', tool_name: 'session_context_read', arguments: {} },
          { server_name: 'cf-authority', tool_name: 'local_shell_exec', arguments: { cmd: 'rm -rf /' } },
        ],
      },
    };
    const service = providerService();
    service.createSession({ session_id: 'cf_provider_tools', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    const admitted = await service.submitInput({ session_id: 'cf_provider_tools', method: 'conversation.send', payload: { message: 'call tools' }, now });
    const toolCalls = admitted.events?.filter((event) => event.payload.event === 'tool_call');
    expect(toolCalls?.map((event) => [event.payload.tool_name, event.payload.decision])).toEqual([
      ['session_context_read', 'read_only_admitted'],
      ['local_shell_exec', 'refused'],
    ]);
    const refusedResult = admitted.events?.find((event) => event.payload.event === 'tool_result' && event.payload.tool_name === 'local_shell_exec');
    expect(refusedResult?.payload).toMatchObject({ status: 'refused', error_code: 'cloudflare_tool_not_admitted' });
    const admittedResult = admitted.events?.find((event) => event.payload.event === 'tool_result' && event.payload.tool_name === 'session_context_read');
    expect(admittedResult?.payload.status).toBe('ok');
  });

  test('provider http failure completes the turn as failed and does not graduate capability', async () => {
    behavior = { status: 500, body: { error: 'upstream broken' } };
    const service = providerService();
    service.createSession({ session_id: 'cf_provider_fail', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    const admitted = await service.submitInput({ session_id: 'cf_provider_fail', method: 'conversation.send', payload: { message: 'fail please' }, now });
    expect(admitted.status).toBe('admitted');
    expect(admitted.events?.map((event) => event.payload.event)).toEqual([
      'operator_input_admitted',
      'user_message',
      'turn_started',
      'provider_request',
      'provider_error',
      'turn_complete',
    ]);
    expect(admitted.events?.find((event) => event.payload.event === 'provider_error')?.payload.status).toBe(500);
    expect(admitted.events?.find((event) => event.payload.event === 'turn_complete')?.payload.terminal_state).toBe('failed');
    expect(service.readHealth('cf_provider_fail').runtime_surface_contract!.capability_profile.provider_execution).toBe('declared');
  });

  test('operator interrupt aborts an in-flight provider call with interrupted evidence', async () => {
    behavior = { body: { content: 'too late', tool_calls: [] }, delay_ms: 500 };
    const service = providerService();
    service.createSession({ session_id: 'cf_provider_interrupt', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    const sendPromise = service.submitInput({ session_id: 'cf_provider_interrupt', method: 'conversation.send', payload: { message: 'slow turn' }, now });
    await sleep(50);
    const interrupt = await service.submitInput({ session_id: 'cf_provider_interrupt', method: 'conversation.interrupt', payload: { message: 'stop' }, now });
    expect(interrupt.events?.map((event) => event.payload.event)).toContain('operator_interrupt_admitted');
    const send = await sendPromise;
    expect(send.events?.find((event) => event.payload.event === 'provider_error')?.payload.error_code).toBe('provider_request_aborted');
    expect(send.events?.find((event) => event.payload.event === 'turn_interrupted')).toBeDefined();
    expect(send.events?.find((event) => event.payload.event === 'turn_complete')?.payload.terminal_state).toBe('interrupted');
  });

  test('provider call timeout aborts with provider_request_timeout evidence', async () => {
    behavior = { never_respond: true };
    const service = providerService({ timeout_ms: 1000 });
    service.createSession({ session_id: 'cf_provider_timeout', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    const admitted = await service.submitInput({ session_id: 'cf_provider_timeout', method: 'conversation.send', payload: { message: 'hang' }, now });
    expect(admitted.events?.find((event) => event.payload.event === 'provider_error')?.payload.error_code).toBe('provider_request_timeout');
    expect(admitted.events?.find((event) => event.payload.event === 'turn_complete')?.payload.terminal_state).toBe('interrupted');
    expect(service.readHealth('cf_provider_timeout').runtime_surface_contract!.capability_profile.provider_execution).toBe('declared');
  }, 10000);
});
