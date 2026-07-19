import type {
  CloudflareNarsAuthorityRuntimeExecutionInput,
  CloudflareNarsAuthorityRuntimeExecutionResult,
  CloudflareNarsAuthorityRuntimeExecutor,
} from './index.js';

export const CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE = 'cloudflare_provider_http_adapter';
export const CLOUDFLARE_NARS_PROVIDER_DEFAULT_TIMEOUT_MS = 120000;

export interface CloudflareNarsProviderBinding {
  provider: string;
  model: string | null;
  thinking: string | null;
  api_base_url: string;
  // Name of the environment/secret binding that holds the API key. The key
  // value itself is resolved from the provided env map and is never emitted
  // into events, diagnostics, or this binding record.
  api_key_env?: string | null;
  timeout_ms?: number | null;
}

export interface CloudflareNarsProviderExecutorOptions {
  binding: CloudflareNarsProviderBinding;
  fetch_impl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

interface ProviderTurnReply {
  content: string;
  tool_calls: Array<{ server_name?: string; tool_name: string; arguments?: Record<string, unknown> }>;
  raw: unknown;
}

function normalizeBinding(binding: CloudflareNarsProviderBinding): CloudflareNarsProviderBinding & { timeout_ms: number } {
  const provider = String(binding.provider ?? '').trim();
  const apiBaseUrl = String(binding.api_base_url ?? '').trim();
  if (!provider) throw new Error('provider_binding_provider_required');
  if (!apiBaseUrl) throw new Error('provider_binding_api_base_url_required');
  const timeout = Number(binding.timeout_ms);
  return {
    provider,
    model: binding.model?.trim() || null,
    thinking: binding.thinking?.trim() || null,
    api_base_url: apiBaseUrl,
    api_key_env: binding.api_key_env?.trim() || null,
    timeout_ms: Number.isFinite(timeout) && timeout >= 1000 ? Math.floor(timeout) : CLOUDFLARE_NARS_PROVIDER_DEFAULT_TIMEOUT_MS,
  };
}

function extractProviderReply(body: unknown): ProviderTurnReply {
  const root = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const toolCallsRaw = Array.isArray(root.tool_calls) ? root.tool_calls : [];
  const tool_calls = toolCallsRaw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const toolName = typeof record.tool_name === 'string' ? record.tool_name : typeof record.name === 'string' ? record.name : null;
    if (!toolName) return [];
    return [{
      server_name: typeof record.server_name === 'string' ? record.server_name : undefined,
      tool_name: toolName,
      arguments: record.arguments && typeof record.arguments === 'object' ? record.arguments as Record<string, unknown> : {},
    }];
  });
  const content = typeof root.content === 'string'
    ? root.content
    : typeof root.output_text === 'string'
      ? root.output_text
      : typeof root.message === 'string'
        ? root.message
        : '';
  return { content, tool_calls, raw: body };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message));
}

export function createCloudflareNarsProviderRuntimeExecutor(options: CloudflareNarsProviderExecutorOptions): CloudflareNarsAuthorityRuntimeExecutor & { provider_binding_summary: string } {
  const binding = normalizeBinding(options.binding);
  const fetchImpl = options.fetch_impl ?? fetch;
  const env = options.env ?? {};
  const inflight = new Map<string, AbortController>();
  const bindingSummary = `${binding.provider}:${binding.model ?? 'default'}:${binding.thinking ?? 'default'}`;

  function authorizationHeaders(): Record<string, string> {
    if (!binding.api_key_env) return {};
    const key = env[binding.api_key_env];
    if (typeof key !== 'string' || !key.trim()) return {};
    return { authorization: `Bearer ${key.trim()}` };
  }

  async function executeProviderTurn(input: CloudflareNarsAuthorityRuntimeExecutionInput): Promise<CloudflareNarsAuthorityRuntimeExecutionResult> {
    const requestId = `provider_${input.input_id}`;
    const controller = new AbortController();
    inflight.set(input.session.session_id, controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('provider_request_timeout'));
    }, binding.timeout_ms);
    const payloads: Record<string, unknown>[] = [
      { event: 'turn_started', type: 'turn.started', input_id: input.input_id },
      {
        event: 'provider_request',
        type: 'provider.request',
        input_id: input.input_id,
        request_id: requestId,
        idempotency_key: input.input_id,
        provider: binding.provider,
        model: binding.model,
        thinking: binding.thinking,
        authority_origin: 'cloudflare',
      },
    ];
    try {
      const response = await fetchImpl(binding.api_base_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({
          model: binding.model,
          thinking: binding.thinking,
          input: input.message,
          request_id: requestId,
          idempotency_key: input.input_id,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        payloads.push({
          event: 'provider_error',
          type: 'provider.error',
          input_id: input.input_id,
          request_id: requestId,
          provider: binding.provider,
          status: response.status,
          error: `provider_http_${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
          authority_origin: 'cloudflare',
        });
        payloads.push({ event: 'turn_complete', type: 'turn.completed', input_id: input.input_id, terminal_state: 'failed', request_id: requestId });
        return { execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE, event_payloads: payloads, provider_turn: { request_id: requestId, terminal_state: 'failed' } } as CloudflareNarsAuthorityRuntimeExecutionResult;
      }
      const reply = extractProviderReply(await response.json().catch(() => null));
      const registry = input.tool_registry;
      for (const call of reply.tool_calls) {
        const serverName = call.server_name ?? registry.listServers()[0] ?? null;
        const admitted = serverName != null && registry.listTools(serverName).some((tool) => tool.tool_name === call.tool_name);
        payloads.push({
          event: 'tool_call',
          type: 'tool.call',
          input_id: input.input_id,
          request_id: requestId,
          server_name: serverName,
          tool_name: call.tool_name,
          tool: serverName ? `${serverName}.${call.tool_name}` : call.tool_name,
          decision: admitted ? (call.tool_name.startsWith('artifact_') ? 'authority_mutation_admitted' : 'read_only_admitted') : 'refused',
          argument_summary: call.arguments ?? {},
          authority_origin: 'cloudflare',
          mcp_fabric_scope: input.mcp_fabric.requested_scope,
        });
        if (admitted && serverName) {
          const result = registry.callTool({ server_name: serverName, tool_name: call.tool_name, tool: `${serverName}.${call.tool_name}`, arguments: call.arguments ?? {} });
          payloads.push({
            event: 'tool_result',
            type: 'tool.result',
            input_id: input.input_id,
            request_id: requestId,
            server_name: serverName,
            tool_name: call.tool_name,
            tool: `${serverName}.${call.tool_name}`,
            status: result.status,
            ...(result.error ? { error: result.error } : {}),
            ...(result.error_code ? { error_code: result.error_code } : {}),
            ...(result.content !== undefined ? { content: result.content } : {}),
            duration_ms: result.duration_ms ?? 0,
            decision: call.tool_name.startsWith('artifact_') ? 'authority_mutation_admitted' : 'read_only_admitted',
            authority_origin: 'cloudflare',
            mcp_fabric_scope: input.mcp_fabric.requested_scope,
          });
        } else {
          payloads.push({
            event: 'tool_result',
            type: 'tool.result',
            input_id: input.input_id,
            request_id: requestId,
            server_name: serverName,
            tool_name: call.tool_name,
            tool: serverName ? `${serverName}.${call.tool_name}` : call.tool_name,
            status: 'refused',
            error: 'cloudflare_tool_not_admitted',
            error_code: 'cloudflare_tool_not_admitted',
            duration_ms: 0,
            decision: 'refused',
            authority_origin: 'cloudflare',
            mcp_fabric_scope: input.mcp_fabric.requested_scope,
          });
        }
      }
      payloads.push({
        event: 'provider_response',
        type: 'provider.response',
        input_id: input.input_id,
        request_id: requestId,
        provider: binding.provider,
        model: binding.model,
        status: 'ok',
        authority_origin: 'cloudflare',
      });
      payloads.push({
        event: 'assistant_message',
        type: 'assistant_message',
        input_id: input.input_id,
        request_id: requestId,
        content: reply.content,
        execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE,
      });
      payloads.push({ event: 'turn_complete', type: 'turn.completed', input_id: input.input_id, terminal_state: 'completed', request_id: requestId });
      return { execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE, event_payloads: payloads, provider_turn: { request_id: requestId, terminal_state: 'completed' } } as CloudflareNarsAuthorityRuntimeExecutionResult;
    } catch (error) {
      const aborted = isAbortError(error) || controller.signal.aborted;
      const code = timedOut ? 'provider_request_timeout' : aborted ? 'provider_request_aborted' : 'provider_request_failed';
      payloads.push({
        event: 'provider_error',
        type: 'provider.error',
        input_id: input.input_id,
        request_id: requestId,
        provider: binding.provider,
        error: error instanceof Error ? error.message : String(error),
        error_code: code,
        authority_origin: 'cloudflare',
      });
      if (aborted) {
        payloads.push({ event: 'turn_interrupted', type: 'turn.interrupted', input_id: input.input_id, reason: timedOut ? 'provider_request_timeout' : 'operator_interrupt', request_id: requestId });
        payloads.push({ event: 'turn_complete', type: 'turn.completed', input_id: input.input_id, terminal_state: 'interrupted', request_id: requestId });
      } else {
        payloads.push({ event: 'turn_complete', type: 'turn.completed', input_id: input.input_id, terminal_state: 'failed', request_id: requestId });
      }
      return { execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE, event_payloads: payloads, provider_turn: { request_id: requestId, terminal_state: aborted ? 'interrupted' : 'failed' } } as CloudflareNarsAuthorityRuntimeExecutionResult;
    } finally {
      clearTimeout(timeout);
      inflight.delete(input.session.session_id);
    }
  }

  return {
    execution_mode: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE,
    provider_binding_summary: bindingSummary,
    execute(input: CloudflareNarsAuthorityRuntimeExecutionInput) {
      if (input.method === 'conversation.interrupt') {
        const controller = inflight.get(input.session.session_id);
        if (controller) {
          controller.abort(new Error('operator_interrupt'));
          return {
            execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE,
            event_payloads: [
              { event: 'operator_interrupt_admitted', type: 'operator_input.interrupt_admitted', input_id: input.input_id, method: input.method },
            ],
          };
        }
        return {
          execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE,
          event_payloads: [
            { event: 'turn_interrupted', type: 'turn.interrupted', input_id: input.input_id, reason: input.message || 'operator_interrupt' },
            { event: 'turn_complete', type: 'turn.completed', input_id: input.input_id, terminal_state: 'interrupted' },
          ],
        };
      }
      if (input.method === 'conversation.steer') {
        return {
          execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE,
          event_payloads: [
            { event: 'operator_steer_admitted', type: 'operator_input.steer_admitted', input_id: input.input_id, method: input.method, payload: input.payload },
            { event: 'turn_complete', type: 'turn.completed', input_id: input.input_id, terminal_state: 'steered' },
          ],
        };
      }
      if (input.method === 'session.close') {
        const controller = inflight.get(input.session.session_id);
        controller?.abort(new Error('session_close'));
        return {
          execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE,
          event_payloads: [
            { event: 'session_closed', type: 'session.closed', input_id: input.input_id, reason: input.message || 'operator_close' },
          ],
        };
      }
      if (input.method !== 'conversation.send' && input.method !== 'conversation.enqueue') {
        return {
          execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE,
          event_payloads: [
            { event: 'turn_started', type: 'turn.started', input_id: input.input_id },
            { event: 'assistant_message', type: 'assistant_message', input_id: input.input_id, content: `Cloudflare provider adapter handled ${input.method}.`, execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE },
            { event: 'turn_complete', type: 'turn.completed', input_id: input.input_id, terminal_state: 'completed' },
          ],
        };
      }
      return executeProviderTurn(input);
    },
  } as CloudflareNarsAuthorityRuntimeExecutor & { provider_binding_summary: string };
}
