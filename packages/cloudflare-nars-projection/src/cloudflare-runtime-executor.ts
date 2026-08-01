import {
  createCloudflareInvocationGateway,
  createCloudflareProviderAdapter,
  type CloudflareAiBinding,
  type CloudflareD1Binding,
  type CloudflareInvocationAdmission,
} from "@narada-core/invokable-intelligence-runtime";
import type {
  CloudflareNarsAuthorityRuntimeExecutionInput,
  CloudflareNarsAuthorityRuntimeExecutionResult,
  CloudflareNarsAuthorityRuntimeExecutor,
  CloudflareNarsAuthoritySession,
  CloudflareToolAdapterRegistry,
} from "./index.js";

export interface CloudflareNarsRuntimeEnvironment {
  [binding: string]: unknown;
  INTELLIGENCE_REGISTRY_DB?: CloudflareD1Binding;
  AI?: CloudflareAiBinding;
  NARS_OUTBOUND_PROVIDER_ENABLED?: string | boolean;
}

interface SessionWithInvocationBinding extends CloudflareNarsAuthoritySession {
  principal_id?: string;
  user_site_id?: string;
  host_site_id?: string;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

type RequestedResourceKind = "model" | "inference-provider";

function resourceRef(value: unknown, kind: RequestedResourceKind): { kind: RequestedResourceKind; id: string } | undefined {
  if (typeof value === "string" && value.trim()) return { kind, id: value.trim() };
  const candidate = record(value);
  return typeof candidate.id === "string" && candidate.id.trim()
    ? { kind: candidate.kind === kind ? kind : kind, id: candidate.id.trim() }
    : undefined;
}

function toolsForProvider(registry: CloudflareToolAdapterRegistry): unknown[] {
  return registry.listTools().map((tool) => ({
    type: "function",
    function: {
      name: tool.tool,
      description: tool.description ?? "Governed Cloudflare-hosted NARS tool",
      parameters: tool.input_schema ?? { type: "object", properties: {} },
    },
  }));
}

function normalizeToolCall(value: unknown): { name: string; arguments: Record<string, unknown>; id?: string } | null {
  const item = record(value);
  const functionCall = record(item.function);
  const name = typeof functionCall.name === "string"
    ? functionCall.name
    : typeof item.name === "string" ? item.name : "";
  if (!name) return null;
  const rawArguments = functionCall.arguments ?? item.arguments;
  let args: Record<string, unknown> = {};
  if (typeof rawArguments === "string") {
    try {
      const parsed = JSON.parse(rawArguments);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      args = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (rawArguments && typeof rawArguments === "object") {
    args = rawArguments as Record<string, unknown>;
  }
  return { name, arguments: args, ...(typeof item.id === "string" ? { id: item.id } : {}) };
}

function requestedResource(payload: Record<string, unknown>, key: string, kind: RequestedResourceKind): { kind: RequestedResourceKind; id: string } | undefined {
  return resourceRef(payload[key], kind);
}

function sessionAdmission(session: SessionWithInvocationBinding, store: { listResources(): Promise<any[]>; listCatalogRecords(): Promise<any[]> }, request: Record<string, any>): Promise<CloudflareInvocationAdmission> {
  return Promise.all([store.listResources(), store.listCatalogRecords()]).then(([resources, catalogRecords]) => {
    if (session.lifecycle_state !== "active") {
      throw new Error(`cloudflare_nars_session_not_active:${session.session_id}`);
    }
    const targetSiteId = session.site_id;
    const userSiteId = session.user_site_id ?? session.site_id;
    const hostSiteId = session.host_site_id ?? session.site_id;
    const site = (id: string) => resources.find((candidate: any) => candidate.schema === "narada.invokable-intelligence.site.v1" && candidate.id === id);
    if (!site(targetSiteId) || !site(userSiteId) || !site(hostSiteId)) {
      throw new Error(`cloudflare_nars_site_binding_missing:${targetSiteId}:${userSiteId}:${hostSiteId}`);
    }
    const principalId = session.principal_id
      ?? record(request.invocationScope).principal_id
      ?? "";
    if (typeof principalId !== "string" || !principalId.trim()) {
      throw new Error("cloudflare_nars_principal_binding_required");
    }
    return {
      principalId: principalId.trim(),
      authorityBinding: {
        actor_id: principalId.trim(),
        auth_type: "cloudflare-nars-session",
        principal_id: principalId.trim(),
        binding_ref: session.session_id,
        evidence_refs: [`cloudflare-nars-session:${session.session_id}`],
      },
      targetSite: { kind: "site", id: targetSiteId },
      userSite: { kind: "site", id: userSiteId },
      hostSite: { kind: "site", id: hostSiteId },
      access: {
        action: "invoke",
        requested_region: "global",
        data_classification: "internal",
        requested_retention_days: 0,
        provider_training: "prohibited",
        expected_usage: { amount: 1, unit: "requests" },
        expected_cost: { amount: 0, currency: "USD" },
      },
      catalogRecords,
    };
  });
}

function eventPayload(event: string, input: CloudflareNarsAuthorityRuntimeExecutionInput, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { event, type: event.replaceAll("_", "."), input_id: input.input_id, ...fields };
}

function toolEvent(input: CloudflareNarsAuthorityRuntimeExecutionInput, call: { name: string; arguments: Record<string, unknown>; id?: string }): Record<string, unknown> {
  return eventPayload("tool_call", input, { tool: call.name, tool_name: call.name, arguments: call.arguments, ...(call.id ? { tool_call_id: call.id } : {}), authority_origin: "cloudflare" });
}

/**
 * Production NARS executor. It owns no provider selection: the shared
 * gateway resolves the immutable D1 plan and the adapter executes that plan.
 */
export function createCloudflareNarsAuthorityRuntimeExecutor(
  env: CloudflareNarsRuntimeEnvironment,
): CloudflareNarsAuthorityRuntimeExecutor {
  const outboundProviderEnabled = env.NARS_OUTBOUND_PROVIDER_ENABLED === true
    || env.NARS_OUTBOUND_PROVIDER_ENABLED === "true";
  const aiBindingAvailable = Boolean(env.AI && typeof env.AI.run === "function");
  const outboundFetchAvailable = outboundProviderEnabled && typeof globalThis.fetch === "function";
  const configured = Boolean(env.INTELLIGENCE_REGISTRY_DB && (aiBindingAvailable || outboundFetchAvailable));
  const sessions = new Map<string, SessionWithInvocationBinding>();
  let gatewayPromise: ReturnType<typeof createCloudflareInvocationGateway> | null = null;
  const ensureGateway = () => {
    if (!env.INTELLIGENCE_REGISTRY_DB) throw new Error("cloudflare_nars_intelligence_registry_binding_missing");
    gatewayPromise ??= createCloudflareInvocationGateway({
      registryDb: env.INTELLIGENCE_REGISTRY_DB,
      runtimeCapabilities: {
        aiBinding: aiBindingAvailable,
        outboundFetch: outboundFetchAvailable,
      },
      adapterFor: (adapter) => adapter.runtime_family === "workers"
        ? createCloudflareProviderAdapter({
            ai: env.AI,
            resolveCredential: async (credential) => {
              // Cloudflare secret bindings are exposed through the Worker
              // environment, but the catalog still records who owns the
              // locator. File-backed credentials never cross this boundary.
              if (credential.store !== "env" && credential.store !== "site-secret" && credential.store !== "operator-secret") return null;
              const prefixes = ["env:", "site-secret:", "operator-secret:"];
              const reference = prefixes.reduce((current, prefix) => current.startsWith(prefix) ? current.slice(prefix.length) : current, credential.reference);
              const value = env[reference];
              return typeof value === "string" && value.length > 0 ? value : null;
            },
          })
        : null,
      admitRequest: (store, request) => {
        const sessionId = record(request.invocationScope).session_id;
        const session = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
        if (!session) throw new Error("cloudflare_nars_session_binding_missing");
        return sessionAdmission(session, store, request as Record<string, any>);
      },
      auditAuthority: { admittedBy: "runtime:cloudflare-nars-authority", admissionRef: "runtime-boundary:cloudflare-nars-authority" },
    });
    return gatewayPromise;
  };

  return {
    execution_mode: "canonical_invokable_intelligence_gateway",
    availability: configured ? "available" : "unavailable",
    unavailable_code: configured ? undefined : "canonical_invokable_intelligence_gateway_required",
    intelligence_authority_ref: configured ? "runtime:cloudflare-nars-authority:d1-gateway" : undefined,
    abortSession(sessionId) {
      return sessions.delete(sessionId);
    },
    async execute(input) {
      const session = input.session as SessionWithInvocationBinding;
      sessions.set(session.session_id, session);
      if (input.method === "conversation.interrupt") {
        return {
          execution_kind: "canonical_invokable_intelligence_gateway",
          event_payloads: [eventPayload("turn_interrupted", input, { reason: input.message || "operator_interrupt" }), eventPayload("turn_complete", input, { terminal_state: "interrupted" })],
          invocation: { invocation_id: `nars:${session.session_id}:${input.input_id}`, terminal_state: "interrupted" },
        };
      }
      if (input.method === "conversation.steer") {
        return {
          execution_kind: "canonical_invokable_intelligence_gateway",
          event_payloads: [eventPayload("operator_steer_admitted", input, { method: input.method, payload: input.payload }), eventPayload("turn_complete", input, { terminal_state: "steered" })],
          invocation: { invocation_id: `nars:${session.session_id}:${input.input_id}`, terminal_state: "interrupted" },
        };
      }
      if (input.method === "session.close") {
        sessions.delete(session.session_id);
        return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: [eventPayload("session_closed", input, { reason: input.message || "operator_close" })] };
      }
      if (input.method !== "conversation.send" && input.method !== "conversation.enqueue") {
        return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: [eventPayload("turn_complete", input, { terminal_state: "completed_without_provider" })] };
      }
      const payload = input.payload;
      const requestedOptions = record(payload.requested_options ?? payload.options);
      const requestedModel = requestedResource(payload, "requested_model", "model") ?? requestedResource(payload, "model", "model");
      const requestedInferenceProvider = requestedResource(payload, "requested_inference_provider", "inference-provider");
      const initialMessages = Array.isArray(payload.messages)
        ? payload.messages
        : [{ role: "user", content: input.message }];
      const toolDefinitions = toolsForProvider(input.tool_registry);
      const eventPayloads: Record<string, unknown>[] = [];
      const emitEvent = async (payload: Record<string, unknown>) => {
        eventPayloads.push(payload);
        await input.emit_event?.(payload);
      };
      await emitEvent(eventPayload("turn_started", input, { execution_kind: "canonical_invokable_intelligence_gateway" }));
      const invocationId = `nars:${session.session_id}:${input.input_id}`;
      let messages: unknown[] = [...initialMessages];
      let lastResult: any = null;
      const executionPolicy = record(payload.execution_policy);
      const requestedMaxRounds = Number(payload.max_tool_rounds ?? record(executionPolicy.tool_loop).max_rounds);
      const maxToolRounds = Number.isInteger(requestedMaxRounds)
        ? Math.max(1, Math.min(500, requestedMaxRounds))
        : 200;
      const requestedProviderRetries = Number(payload.max_provider_retries ?? record(executionPolicy.retry).max_attempts);
      const maxProviderRetries = Number.isInteger(requestedProviderRetries)
        ? Math.max(0, Math.min(3, requestedProviderRetries))
        : 2;
      const requestedMaxToolCalls = Number(payload.max_tool_calls_per_round ?? record(executionPolicy.tool_loop).max_calls_per_round);
      const maxToolCallsPerRound = Number.isInteger(requestedMaxToolCalls)
        ? Math.max(1, Math.min(128, requestedMaxToolCalls))
        : 32;
      try {
        for (let round = 0; round < maxToolRounds; round += 1) {
          const gatewayHandle = await ensureGateway();
          let result: any = null;
          for (let retry = 0; retry <= maxProviderRetries; retry += 1) {
            if (input.session_control.signal.aborted || !input.session_control.isActive()) throw new Error("cloudflare_nars_session_aborted");
            const operationId = `${invocationId}:round:${round}:attempt:${retry}`;
            await emitEvent(eventPayload("provider_request", input, {
              invocation_id: invocationId,
              round,
              retry,
              requested_model: requestedModel ?? null,
              requested_inference_provider: requestedInferenceProvider ?? null,
              requested_options: requestedOptions,
              message_count: messages.length,
              tool_count: toolDefinitions.length,
            }));
            result = await gatewayHandle.gateway.invoke({
              purpose: "nars-turn",
              intentId: `intent:${session.session_id}:${input.input_id}`,
              operationId,
              mode: round === 0 && retry === 0 ? "immediate" : retry > 0 ? "retry" : "resume",
              allowReplan: true,
              principal: session.principal_id,
              requestedModel,
              requestedInferenceProvider,
              requestedOptions,
              requiredCapabilities: Array.isArray(payload.required_capabilities) ? payload.required_capabilities as any : [],
              messages,
              tools: toolDefinitions,
              abortSignal: input.session_control.signal,
              turnId: input.input_id,
              inputEventId: input.input_id,
              requestId: input.input_id,
              idempotencyKey: operationId,
              turnAttempt: round + retry + 1,
              executionPolicy: { scope: "session", tool_loop: { max_rounds: maxToolRounds, max_calls_per_round: maxToolCallsPerRound }, retry: { max_attempts: maxProviderRetries } },
              invocationScope: { session_id: session.session_id, site_id: session.site_id, principal_id: session.principal_id },
            });
            const retryableBeforeAdmission = result.adapterOutcome?.error?.retryable === true
              && result.adapterOutcome?.admission === "not-acknowledged";
            if (!retryableBeforeAdmission || retry >= maxProviderRetries) break;
            await emitEvent(eventPayload("provider_retry", input, { round, retry: retry + 1, reason: result.adapterOutcome.error.code }));
          }
          lastResult = result;
          if (input.session_control.signal.aborted) {
            await emitEvent(eventPayload("turn_interrupted", input, { reason: "operator_interrupt" }));
            await emitEvent(eventPayload("turn_complete", input, { terminal_state: "interrupted" }));
            return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: eventPayloads, events_emitted: Boolean(input.emit_event), invocation: { invocation_id: result?.intent?.id ?? invocationId, terminal_state: "interrupted" } };
          }
          if (result.kind === "refusal") {
            await emitEvent(eventPayload("intelligence_refusal", input, { reason_code: result.refusal.reason_code, explanation: result.refusal.explanation, intent_id: result.intent.id, outcome_id: result.outcome.id }));
            await emitEvent(eventPayload("turn_complete", input, { terminal_state: "failed", error_code: result.refusal.reason_code }));
            return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: eventPayloads, events_emitted: Boolean(input.emit_event), invocation: { invocation_id: result.intent.id, terminal_state: "failed" } };
          }
          await emitEvent(eventPayload("intelligence_plan", input, { intent_id: result.intent.id, plan_id: result.plan.id, attempt_id: result.attempt.id, selection: result.plan.selected, replayed: result.replayed }));
          if (!result.adapterOutcome || result.adapterOutcome.error) {
            await emitEvent(eventPayload("provider_error", input, { code: result.adapterOutcome?.error?.code ?? result.outcome.kind, message: result.adapterOutcome?.error?.message ?? "Provider returned no response.", admission: result.adapterOutcome?.admission ?? "uncertain" }));
            await emitEvent(eventPayload("turn_complete", input, { terminal_state: "failed", error_code: result.adapterOutcome?.error?.code ?? result.outcome.kind }));
            return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: eventPayloads, events_emitted: Boolean(input.emit_event), invocation: { invocation_id: result.intent.id, terminal_state: "failed" } };
          }
          const response = record(result.adapterOutcome.response);
          await emitEvent(eventPayload("provider_response", input, { intent_id: result.intent.id, plan_id: result.plan.id, attempt_id: result.attempt.id, outcome_id: result.outcome.id, response: { text: response.text ?? "", tool_calls: response.tool_calls ?? [] }, usage: result.adapterOutcome.usage ?? null }));
          const rawToolCalls = Array.isArray(response.tool_calls) ? response.tool_calls : [];
          const toolCalls = rawToolCalls.map(normalizeToolCall).filter((call): call is { name: string; arguments: Record<string, unknown>; id?: string } => call !== null);
          if (rawToolCalls.length > 0 && toolCalls.length === 0) {
            await emitEvent(eventPayload("provider_error", input, { code: "cloudflare_nars_invalid_tool_call", message: "The provider returned tool calls, but none had a valid function name and JSON object arguments." }));
            await emitEvent(eventPayload("turn_complete", input, { terminal_state: "failed", error_code: "cloudflare_nars_invalid_tool_call" }));
            return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: eventPayloads, events_emitted: Boolean(input.emit_event), invocation: { invocation_id: result.intent.id, terminal_state: "failed" } };
          }
          if (toolCalls.length > maxToolCallsPerRound) {
            await emitEvent(eventPayload("tool_call_limit", input, { max_calls_per_round: maxToolCallsPerRound, requested_calls: toolCalls.length }));
            await emitEvent(eventPayload("turn_complete", input, { terminal_state: "failed", error_code: "cloudflare_nars_tool_call_limit" }));
            return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: eventPayloads, events_emitted: Boolean(input.emit_event), invocation: { invocation_id: result.intent.id, terminal_state: "failed" } };
          }
          if (toolCalls.length === 0) {
            await emitEvent(eventPayload("assistant_message", input, { content: response.text ?? "", execution_kind: "canonical_invokable_intelligence_gateway" }));
            await emitEvent(eventPayload("turn_complete", input, { terminal_state: "completed", invocation_id: result.intent.id }));
            return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: eventPayloads, events_emitted: Boolean(input.emit_event), invocation: { invocation_id: result.intent.id, terminal_state: "completed" } };
          }
          if (round === maxToolRounds - 1) {
            await emitEvent(eventPayload("tool_loop_limit", input, { max_rounds: maxToolRounds }));
            await emitEvent(eventPayload("turn_complete", input, { terminal_state: "failed", error_code: "tool_loop_limit" }));
            return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: eventPayloads, events_emitted: Boolean(input.emit_event), invocation: { invocation_id: result.intent.id, terminal_state: "failed" } };
          }
          messages.push({ role: "assistant", tool_calls: response.tool_calls });
          for (const call of toolCalls) {
            await emitEvent(toolEvent(input, call));
            const descriptor = input.tool_registry.listTools().find((candidate) => candidate.tool === call.name);
            const toolResult = descriptor
              ? input.tool_registry.callTool({ server_name: descriptor.server_name, tool_name: descriptor.tool_name, tool: descriptor.tool, arguments: call.arguments, idempotency_key: `${invocationId}:tool:${round}:${call.id ?? call.name}` })
              : { status: "failed" as const, error: "tool_not_admitted", error_code: "tool_not_admitted" };
            await emitEvent(eventPayload("tool_result", input, { tool: descriptor?.tool ?? call.name, tool_name: descriptor?.tool ?? call.name, server_name: descriptor?.server_name ?? null, status: toolResult.status, content: toolResult.content, error: toolResult.error, error_code: toolResult.error_code }));
            messages.push({ role: "tool", tool_call_id: call.id ?? call.name, name: call.name, content: JSON.stringify(toolResult.content ?? { status: toolResult.status, error: toolResult.error, error_code: toolResult.error_code }) });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (input.session_control.signal.aborted || message === "cloudflare_nars_session_aborted" || message === "cloudflare_provider_aborted") {
          await emitEvent(eventPayload("turn_interrupted", input, { reason: message === "cloudflare_provider_aborted" ? "provider_aborted" : "operator_interrupt" }));
          await emitEvent(eventPayload("turn_complete", input, { terminal_state: "interrupted" }));
          return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: eventPayloads, events_emitted: Boolean(input.emit_event), invocation: { invocation_id: lastResult?.intent?.id ?? invocationId, terminal_state: "interrupted" } };
        }
        await emitEvent(eventPayload("provider_error", input, { code: "cloudflare_nars_execution_failed", message }));
        await emitEvent(eventPayload("turn_complete", input, { terminal_state: "failed", error_code: "cloudflare_nars_execution_failed" }));
        return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: eventPayloads, events_emitted: Boolean(input.emit_event), invocation: { invocation_id: lastResult?.intent?.id ?? invocationId, terminal_state: "failed" } };
      }
      return { execution_kind: "canonical_invokable_intelligence_gateway", event_payloads: eventPayloads, events_emitted: Boolean(input.emit_event), invocation: { invocation_id: invocationId, terminal_state: "failed" } };
    },
  };
}
