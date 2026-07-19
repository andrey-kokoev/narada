import {
  buildOpenAiChatRequest,
  extractOpenAiChatReply,
} from '@narada2/carrier-provider-contract/openai-compatible-chat';
import type {
  CloudflareNarsAuthorityRuntimeExecutionInput,
  CloudflareNarsAuthorityRuntimeExecutionResult,
  CloudflareNarsAuthorityRuntimeExecutor,
} from './index.js';

export const CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE = 'cloudflare_provider_http_adapter';
export const CLOUDFLARE_NARS_PROVIDER_DEFAULT_TIMEOUT_MS = 120000;
export const CLOUDFLARE_NARS_PROVIDER_SUPPORTED_ADAPTER_KIND = 'openai-compatible-chat-completions';

export interface CloudflareNarsProviderBinding {
  provider: string;
  // Registry adapter kind; only CLOUDFLARE_NARS_PROVIDER_SUPPORTED_ADAPTER_KIND
  // is dispatched on this surface, others refuse turns with typed evidence.
  adapter_kind?: string | null;
  model: string | null;
  thinking: string | null;
  api_base_url: string;
  // Provider chat-completions path relative to api_base_url when it deviates
  // from the OpenAI convention (e.g. GLM: 'chat/completions'). Registry-sourced.
  chat_path?: string | null;
  // Resolved API key. Sent only as the provider Authorization header and never
  // emitted into events, diagnostics, or this binding record.
  api_key?: string | null;
  // Canonical Narada credential reference (`narada/provider/<provider>/api-key`)
  // naming the pwsh SecretStore entry this binding mirrors. Metadata only.
  credential_secret_ref?: string | null;
  timeout_ms?: number | null;
}

export interface CloudflareNarsProviderExecutorOptions {
  binding: CloudflareNarsProviderBinding;
  fetch_impl?: typeof fetch;
}

interface ProviderTurnReply {
  content: string;
  tool_calls: Array<{ server_name?: string; tool_name: string; arguments?: Record<string, unknown> }>;
  raw: unknown;
}

function normalizeBinding(binding: CloudflareNarsProviderBinding): CloudflareNarsProviderBinding & { adapter_kind: string; timeout_ms: number } {
  const provider = String(binding.provider ?? '').trim();
  const apiBaseUrl = String(binding.api_base_url ?? '').trim();
  if (!provider) throw new Error('provider_binding_provider_required');
  if (!apiBaseUrl) throw new Error('provider_binding_api_base_url_required');
  const timeout = Number(binding.timeout_ms);
  return {
    provider,
    adapter_kind: binding.adapter_kind?.trim() || CLOUDFLARE_NARS_PROVIDER_SUPPORTED_ADAPTER_KIND,
    model: binding.model?.trim() || null,
    thinking: binding.thinking?.trim() || null,
    api_base_url: apiBaseUrl,
    chat_path: binding.chat_path?.trim() || null,
    api_key: binding.api_key?.trim() || null,
    credential_secret_ref: binding.credential_secret_ref?.trim() || null,
    timeout_ms: Number.isFinite(timeout) && timeout >= 1000 ? Math.floor(timeout) : CLOUDFLARE_NARS_PROVIDER_DEFAULT_TIMEOUT_MS,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message));
}

export function createCloudflareNarsProviderRuntimeExecutor(options: CloudflareNarsProviderExecutorOptions): CloudflareNarsAuthorityRuntimeExecutor & { provider_binding_summary: string } {
  const binding = normalizeBinding(options.binding);
  const fetchImpl = options.fetch_impl ?? fetch;
  // Per-session map of input_id -> AbortController: concurrent turns in one
  // session never clobber each other's abort handles.
  const inflight = new Map<string, Map<string, AbortController>>();
  const bindingSummary = `${binding.provider}:${binding.model ?? 'default'}:${binding.thinking ?? 'default'}`;

  function registerInflight(sessionId: string, inputId: string, controller: AbortController): Map<string, AbortController> {
    let sessionInflight = inflight.get(sessionId);
    if (!sessionInflight) {
      sessionInflight = new Map();
      inflight.set(sessionId, sessionInflight);
    }
    sessionInflight.set(inputId, controller);
    return sessionInflight;
  }

  function releaseInflight(sessionId: string, inputId: string): void {
    const sessionInflight = inflight.get(sessionId);
    if (!sessionInflight) return;
    sessionInflight.delete(inputId);
    if (sessionInflight.size === 0) inflight.delete(sessionId);
  }

  function abortInflight(sessionId: string, error: Error): boolean {
    const sessionInflight = inflight.get(sessionId);
    if (!sessionInflight || sessionInflight.size === 0) return false;
    for (const controller of sessionInflight.values()) controller.abort(error);
    return true;
  }

  interface FabricToolEntry {
    qualified: string;
    server_name: string;
    tool_name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
  }

  // Advertise tools under qualified `<server>__<tool_name>` function names so
  // provider tool_calls resolve to the owning server deterministically.
  // Qualified names stay identifier-safe for provider function-name rules.
  function fabricTools(input: CloudflareNarsAuthorityRuntimeExecutionInput): FabricToolEntry[] {
    const seen = new Set<string>();
    const entries: FabricToolEntry[] = [];
    for (const serverName of input.tool_registry.listServers()) {
      for (const tool of input.tool_registry.listTools(serverName)) {
        const qualified = `${serverName}__${tool.tool_name}`;
        if (seen.has(qualified)) continue;
        seen.add(qualified);
        entries.push({
          qualified,
          server_name: serverName,
          tool_name: tool.tool_name,
          description: tool.description,
          input_schema: tool.input_schema,
        });
      }
    }
    return entries;
  }

  // session_id is authority identity, never model input: it is stripped from
  // advertised schemas and injected by the executor at call time.
  function advertisedSchema(entry: FabricToolEntry): Record<string, unknown> {
    const schema = entry.input_schema;
    if (!schema || typeof schema !== 'object') return { type: 'object' };
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties as Record<string, unknown> : {};
    const required = Array.isArray(schema.required) ? schema.required : null;
    if (!('session_id' in properties) && !(required && required.includes('session_id'))) return schema;
    const { session_id: _dropped, ...restProperties } = properties;
    return {
      ...schema,
      properties: restProperties,
      ...(required ? { required: required.filter((name) => name !== 'session_id') } : {}),
    };
  }

  function schemaDeclaresSessionId(entry: FabricToolEntry): boolean {
    const properties = entry.input_schema?.properties;
    return Boolean(properties && typeof properties === 'object' && 'session_id' in properties);
  }

  function advertisedToolDescriptors(entries: FabricToolEntry[]) {
    return entries.map((entry) => ({
      type: 'function' as const,
      function: {
        name: entry.qualified,
        description: `${entry.server_name}.${entry.tool_name}: ${entry.description ?? 'Cloudflare session fabric tool'}${schemaDeclaresSessionId(entry) ? ' Session identity is injected by the authority runtime; do not supply session_id.' : ''}`,
        parameters: advertisedSchema(entry),
      },
    }));
  }

  async function executeProviderTurn(input: CloudflareNarsAuthorityRuntimeExecutionInput): Promise<CloudflareNarsAuthorityRuntimeExecutionResult> {
    const requestId = `provider_${input.input_id}`;
    if (binding.adapter_kind !== CLOUDFLARE_NARS_PROVIDER_SUPPORTED_ADAPTER_KIND) {
      const refused: Record<string, unknown>[] = [
        { event: 'turn_started', type: 'turn.started', input_id: input.input_id },
        {
          event: 'provider_error',
          type: 'provider.error',
          input_id: input.input_id,
          request_id: requestId,
          provider: binding.provider,
          adapter_kind: binding.adapter_kind,
          error: `provider_adapter_unsupported_on_cloudflare:${binding.adapter_kind}`,
          error_code: 'provider_adapter_unsupported_on_cloudflare',
          authority_origin: 'cloudflare',
        },
        { event: 'turn_complete', type: 'turn.completed', input_id: input.input_id, terminal_state: 'failed', request_id: requestId },
      ];
      return { execution_kind: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE, event_payloads: refused, provider_turn: { request_id: requestId, terminal_state: 'failed' } } as CloudflareNarsAuthorityRuntimeExecutionResult;
    }
    const controller = new AbortController();
    registerInflight(input.session.session_id, input.input_id, controller);
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
        adapter_kind: binding.adapter_kind,
        model: binding.model,
        thinking: binding.thinking,
        credential_secret_ref: binding.credential_secret_ref,
        authority_origin: 'cloudflare',
      },
    ];
    try {
      const fabricToolEntries = fabricTools(input);
      const fabricToolByQualified = new Map(fabricToolEntries.map((entry) => [entry.qualified, entry]));
      const request = buildOpenAiChatRequest(
        [{ role: 'user', content: input.message }],
        advertisedToolDescriptors(fabricToolEntries),
        {
          baseUrl: binding.api_base_url,
          model: binding.model ?? undefined,
          apiKey: binding.api_key ?? '',
          thinking: binding.thinking ?? undefined,
          provider: binding.provider,
          chatPath: binding.chat_path ?? undefined,
        },
      );
      const response = await fetchImpl(request.url, {
        method: 'POST',
        headers: request.headers as Record<string, string>,
        body: JSON.stringify(request.body),
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
      const reply: ProviderTurnReply = extractOpenAiChatReply(await response.json().catch(() => null));
      const registry = input.tool_registry;
      for (const call of reply.tool_calls) {
        // Resolve through the advertised qualified names first; fall back to a
        // first-server match on bare tool names the provider may emit anyway.
        const mapped = fabricToolByQualified.get(call.tool_name)
          ?? fabricToolEntries.find((entry) => entry.tool_name === call.tool_name)
          ?? null;
        const serverName = mapped?.server_name ?? null;
        const toolName = mapped?.tool_name ?? call.tool_name;
        const admitted = mapped != null;
        const effectiveArguments: Record<string, unknown> = { ...(call.arguments ?? {}) };
        let sessionIdInjected = false;
        if (mapped && schemaDeclaresSessionId(mapped)) {
          // Authority identity is injected, never trusted from the model.
          effectiveArguments.session_id = input.session.session_id;
          sessionIdInjected = true;
        }
        payloads.push({
          event: 'tool_call',
          type: 'tool.call',
          input_id: input.input_id,
          request_id: requestId,
          server_name: serverName,
          tool_name: toolName,
          tool: serverName ? `${serverName}.${toolName}` : toolName,
          decision: admitted ? (toolName.startsWith('artifact_') ? 'authority_mutation_admitted' : 'read_only_admitted') : 'refused',
          argument_summary: effectiveArguments,
          ...(sessionIdInjected ? { session_id_injected: true } : {}),
          authority_origin: 'cloudflare',
          mcp_fabric_scope: input.mcp_fabric.requested_scope,
        });
        if (admitted && serverName) {
          const result = registry.callTool({ server_name: serverName, tool_name: toolName, tool: `${serverName}.${toolName}`, arguments: effectiveArguments });
          payloads.push({
            event: 'tool_result',
            type: 'tool.result',
            input_id: input.input_id,
            request_id: requestId,
            server_name: serverName,
            tool_name: toolName,
            tool: `${serverName}.${toolName}`,
            status: result.status,
            ...(result.error ? { error: result.error } : {}),
            ...(result.error_code ? { error_code: result.error_code } : {}),
            ...(result.content !== undefined ? { content: result.content } : {}),
            duration_ms: result.duration_ms ?? 0,
            decision: toolName.startsWith('artifact_') ? 'authority_mutation_admitted' : 'read_only_admitted',
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
            tool_name: toolName,
            tool: serverName ? `${serverName}.${toolName}` : toolName,
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
      releaseInflight(input.session.session_id, input.input_id);
    }
  }

  return {
    execution_mode: CLOUDFLARE_NARS_PROVIDER_EXECUTION_MODE,
    provider_binding_summary: bindingSummary,
    execute(input: CloudflareNarsAuthorityRuntimeExecutionInput) {
      if (input.method === 'conversation.interrupt') {
        if (abortInflight(input.session.session_id, new Error('operator_interrupt'))) {
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
        abortInflight(input.session.session_id, new Error('session_close'));
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
