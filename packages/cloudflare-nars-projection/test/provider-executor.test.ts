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

function chatReply(content: string, tool_calls: Array<{ name: string; arguments?: Record<string, unknown> }> = []) {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content,
        tool_calls: tool_calls.map((call, index) => ({
          id: `call_${index + 1}`,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
        })),
      },
      finish_reason: 'stop',
    }],
  };
}

let server: Server;
let baseUrl: string;
let behavior: FixtureBehavior = {};
const requests: Array<{ body: Record<string, any>; authorization: string | null }> = [];

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
      res.end(JSON.stringify(behavior.body ?? chatReply('provider reply')));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/provider`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function providerService(options: { timeout_ms?: number; api_key?: string } = {}) {
  const executor = createCloudflareNarsProviderRuntimeExecutor({
    binding: {
      provider: 'fixture-provider',
      adapter_kind: 'openai-compatible-chat-completions',
      model: 'fixture-model',
      thinking: 'low',
      api_base_url: baseUrl,
      api_key: options.api_key ?? null,
      credential_secret_ref: 'narada/provider/fixture-provider/api-key',
      timeout_ms: options.timeout_ms ?? null,
    },
  });
  return createCloudflareNarsAuthorityService({ max_events: 50, runtime_executor: executor, mcp_fabric: { scope: 'all' } });
}

describe('cloudflare provider http adapter', () => {
  test('provider capability is declared (not present) from configuration alone, and graduates only on executed turn evidence', async () => {
    behavior = { body: chatReply('hello from provider') };
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

  test('provider request uses the canonical chat-completions wire shape with binding metadata on the event, never the api key', async () => {
    behavior = { body: chatReply('secret check') };
    requests.length = 0;
    const service = providerService({ api_key: 'sk-fixture-secret-value' });
    service.createSession({ session_id: 'cf_provider_secret', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    const admitted = await service.submitInput({ session_id: 'cf_provider_secret', method: 'conversation.send', payload: { message: 'check secret handling' }, now });
    expect(admitted.status).toBe('admitted');
    expect(requests).toHaveLength(1);
    expect(requests[0].authorization).toBe('Bearer sk-fixture-secret-value');
    expect(requests[0].body.model).toBe('fixture-model');
    expect(requests[0].body.messages).toEqual([{ role: 'user', content: 'check secret handling' }]);
    const providerRequest = admitted.events?.find((event) => event.payload.event === 'provider_request');
    expect(providerRequest?.payload).toMatchObject({
      idempotency_key: admitted.input_id,
      request_id: `provider_${admitted.input_id}`,
      provider: 'fixture-provider',
      adapter_kind: 'openai-compatible-chat-completions',
      credential_secret_ref: 'narada/provider/fixture-provider/api-key',
    });
    const serializedEvents = JSON.stringify(admitted.events ?? []);
    expect(serializedEvents).not.toContain('sk-fixture-secret-value');
  });

  test('provider-driven tool calls execute only through the session fabric; unknown tools are refused', async () => {
    behavior = {
      body: chatReply('used tools', [
        { name: 'session_context_read', arguments: {} },
        { name: 'local_shell_exec', arguments: { cmd: 'rm -rf /' } },
      ]),
    };
    requests.length = 0;
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
    const offeredTools = (requests[0].body.tools ?? []).map((tool: any) => tool.function?.name);
    expect(offeredTools).toContain('session_context_read');
    expect(requests[0].body.tool_choice).toBe('auto');
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

  test('providers with unsupported adapter kinds refuse turns with typed evidence', async () => {
    const executor = createCloudflareNarsProviderRuntimeExecutor({
      binding: {
        provider: 'anthropic-api',
        adapter_kind: 'anthropic-messages',
        model: 'claude-fixture',
        thinking: 'medium',
        api_base_url: baseUrl,
        api_key: 'sk-unused',
        credential_secret_ref: 'narada/provider/anthropic-api/api-key',
      },
    });
    const service = createCloudflareNarsAuthorityService({ max_events: 50, runtime_executor: executor, mcp_fabric: { scope: 'all' } });
    service.createSession({ session_id: 'cf_provider_unsupported', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    const admitted = await service.submitInput({ session_id: 'cf_provider_unsupported', method: 'conversation.send', payload: { message: 'turn' }, now });
    const providerError = admitted.events?.find((event) => event.payload.event === 'provider_error');
    expect(providerError?.payload).toMatchObject({
      error_code: 'provider_adapter_unsupported_on_cloudflare',
      adapter_kind: 'anthropic-messages',
    });
    expect(admitted.events?.find((event) => event.payload.event === 'turn_complete')?.payload.terminal_state).toBe('failed');
  });

  test('operator interrupt aborts an in-flight provider call with interrupted evidence', async () => {
    behavior = { body: chatReply('too late'), delay_ms: 500 };
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
