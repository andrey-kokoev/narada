import { normalizeIntelligenceInvocationControl } from '@narada2/invokable-intelligence-contract';
import { createCarrierIntelligenceGateway } from './cloudflare-intelligence-resolution.mjs';
import { createCloudflareCarrierConfig } from './cloudflare-carrier-config.mjs';

/**
 * Workers AI transport adapter.
 *
 * This module owns the provider-facing request envelope and the translation
 * between canonical intelligence outcomes and carrier provider posture. The
 * Worker supplies normalized configuration and capability definitions only.
 */
export function createCloudflareProviderAdapter(
  env = {},
  { config = createCloudflareCarrierConfig(env), toolEffectConfig = { tool_definitions: [] } } = {},
) {
  const aiBinding = config.bindings.ai ?? env.AI;
  if (!aiBinding || typeof aiBinding.run !== 'function') return null;
  const intelligenceDiagnosticsEnabled = config.capabilities.intelligenceDiagnostics;
  const workersAiTools = (toolEffectConfig.tool_definitions ?? []).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
  const workersAiRequest = (input, toolResults) => toolResults.length > 0
    ? {
        messages: createWorkersAiToolResultMessages(input, toolResults),
        tools: workersAiTools,
      }
    : {
        messages: createWorkersAiInitialMessages(input),
        tools: workersAiTools,
      };
  let gatewayPromise = null;
  const ensureGateway = () => {
    gatewayPromise ??= createCarrierIntelligenceGateway(env, (store) => ({
      async invoke({ plan, offering, messages, invocationScope }) {
        const modelSlug = offering.invocation_model_key;
        const timeoutMs = clampInteger(plan.options.timeout_ms, 1000, 30000, 15000);
        const { input, tool_results = [] } = messages ?? {};
        const intelligenceDiagnostic = invocationScope?.intelligence_diagnostic ?? null;
        if (intelligenceDiagnostic === 'provider-failure') {
          return {
            error: {
              code: 'cloudflare_workers_ai_provider_failed',
              message: 'cloudflare_live_diagnostic_provider_failure',
              retryable: true,
            },
            admission: 'acknowledged',
            transportSubmitted: false,
          };
        }
        if (intelligenceDiagnostic === 'provider-recovery') {
          return {
            response: {
              text: 'cloudflare_live_diagnostic_provider_recovered',
              tool_calls: [],
            },
            admission: 'acknowledged',
            transportSubmitted: false,
          };
        }
        if (intelligenceDiagnostic === 'acknowledgment-uncertain') {
          return {
            error: {
              code: 'cloudflare_workers_ai_timeout',
              message: 'cloudflare_live_diagnostic_acknowledgment_uncertain',
              retryable: true,
            },
            admission: 'uncertain',
            transportSubmitted: false,
          };
        }
        try {
          const result = await withTimeout(aiBinding.run(modelSlug, workersAiRequest(input, tool_results)), timeoutMs);
          return {
            response: {
              text: extractWorkersAiText(result),
              tool_calls: extractWorkersAiToolCalls(result),
            },
            admission: 'acknowledged',
            transportSubmitted: true,
            providerRequestRef: result?.request_id ?? result?.requestId ?? undefined,
          };
        } catch (error) {
          const timedOut = error instanceof Error && error.message === 'cloudflare_workers_ai_provider_timeout';
          return {
            error: {
              code: timedOut ? 'cloudflare_workers_ai_timeout' : 'cloudflare_workers_ai_provider_failed',
              message: error instanceof Error ? error.message : String(error),
              retryable: true,
            },
            admission: timedOut ? 'uncertain' : 'acknowledged',
            transportSubmitted: true,
          };
        }
      },
    }));
    return gatewayPromise;
  };
  return {
    posture: 'cloudflare-workers-ai',
    adapter_kind: 'cloudflare-workers-ai',
    provider: 'cloudflare-workers-ai',
    model: null,
    resolution: 'invokable-intelligence',
    async run({
      input,
      tool_results = [],
      turn_id = null,
      carrier_session_id = null,
      site_id = null,
      operation_id = null,
      carrier_context = null,
      intelligence_invocation = null,
      intelligence_diagnostic = null,
    }) {
      if (intelligence_diagnostic && !intelligenceDiagnosticsEnabled) {
        const error = new Error('cloudflare_intelligence_diagnostic_disabled');
        error.code = 'cloudflare_intelligence_diagnostic_disabled';
        throw error;
      }
      const { gateway } = await ensureGateway();
      const normalizedIntelligenceInvocation = intelligence_invocation === null
        ? null
        : normalizeIntelligenceInvocationControl(intelligence_invocation);
      const invocationOperationId = normalizedIntelligenceInvocation?.operation_id
        ?? `${carrier_session_id ?? 'unbound'}:${turn_id ?? input?.event_id ?? 'turn'}:${tool_results.length > 0 ? 'tool-results' : 'initial'}`;
      const result = await gateway.invoke({
        purpose: 'carrier-turn',
        ...(normalizedIntelligenceInvocation?.intent_id ? { intentId: normalizedIntelligenceInvocation.intent_id } : {}),
        ...(intelligence_diagnostic === 'resolver-refusal'
          ? { requestedModel: { kind: 'model', id: 'model:cloudflare-live-diagnostic-missing' } }
          : {}),
        operationId: invocationOperationId,
        mode: normalizedIntelligenceInvocation?.mode ?? 'immediate',
        allowReplan: normalizedIntelligenceInvocation?.allow_replan !== false,
        messages: { input, tool_results },
        turnId: turn_id ?? undefined,
        inputEventId: input?.event_id ?? undefined,
        requestId: input?.event_id ?? undefined,
        invocationScope: {
          carrier_session_id,
          site_id,
          operation_id,
          ...(intelligence_diagnostic ? { intelligence_diagnostic } : {}),
        },
        carrierContext: carrier_context,
      });
      if (result.kind === 'refusal') {
        const error = new Error('intelligence_resolution_refused:' + result.refusal.reason_code + ':' + result.refusal.explanation);
        error.code = `intelligence_resolver_${result.refusal.reason_code.replaceAll('-', '_')}`;
        error.refusal = result.refusal;
        error.intelligence = {
          intent_id: result.intent.id,
          outcome_id: result.outcome.id,
          outcome_kind: result.outcome.kind,
          audit_evidence_ids: result.auditEvidence.map(({ id }) => id),
        };
        throw error;
      }
      const intelligence = {
        intent_id: result.intent.id,
        plan_id: result.plan.id,
        attempt_id: result.attempt.id,
        result_id: result.result?.id ?? null,
        outcome_id: result.outcome.id,
        outcome_kind: result.outcome.kind,
        selection: result.plan.selected,
        offering_id: result.plan.route.offering.id,
        route_id: result.plan.route.route_id,
        topology_id: result.plan.route.topology_id,
        access: result.plan.access,
        audit_evidence_ids: result.auditEvidence.map(({ id }) => id),
        observation_ids: result.observations.map(({ id }) => id),
        telemetry_ids: result.telemetry.map(({ id }) => id),
        replayed: result.replayed,
        authority_binding: result.intent.authority_binding ?? null,
      };
      if (result.replayed && !result.adapterOutcome) {
        return {
          response_available: false,
          intelligence: {
            schema: 'narada.invokable-intelligence.metadata-only-result.v1',
            response_available: false,
            ...intelligence,
          },
        };
      }
      if (result.adapterOutcome.error) {
        const error = new Error(result.adapterOutcome.error.message);
        error.code = result.adapterOutcome.error.code;
        error.intelligence = intelligence;
        throw error;
      }
      return {
        ...result.adapterOutcome.response,
        intelligence,
      };
    },
  };
}

function createWorkersAiInitialMessages(input) {
  return [
    {
      role: 'system',
      content: 'You are Narada running inside a Cloudflare carrier. Answer the operator input concisely. Use available tools only when needed; tool effects are carrier-admitted and may be denied.',
    },
    {
      role: 'user',
      content: input.content,
    },
  ];
}

function createWorkersAiToolResultMessages(input, toolResults) {
  return [
    ...createWorkersAiInitialMessages(input),
    {
      role: 'assistant',
      content: 'Tool calls were evaluated by the Cloudflare carrier boundary.',
    },
    {
      role: 'user',
      content: `Carrier tool results:\n${JSON.stringify(toolResults.map((result) => ({
        tool_name: result.tool_name,
        status: result.status,
        admission_action: result.admission_action,
        admission_reason: result.admission_reason,
        capability_ref: result.capability_ref,
        effect_scope: result.effect_scope,
        result_summary: result.result_summary,
        authority_ref: result.authority_ref,
      })))}`,
    },
  ];
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('cloudflare_workers_ai_provider_timeout')),
      timeoutMs,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function extractWorkersAiText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.result?.response === 'string') return result.result.response;
  if (typeof result?.response?.content === 'string') return result.response.content;
  if (typeof result?.result?.response?.content === 'string') return result.result.response.content;
  if (typeof result?.choices?.[0]?.message?.content === 'string') return result.choices[0].message.content;
  if (typeof result?.result?.choices?.[0]?.message?.content === 'string') return result.result.choices[0].message.content;
  if (Array.isArray(result?.response)) return result.response.map(String).join('\n');
  return JSON.stringify(result);
}

function extractWorkersAiToolCalls(result) {
  if (Array.isArray(result?.tool_calls)) return result.tool_calls;
  if (Array.isArray(result?.toolCalls)) return result.toolCalls;
  if (Array.isArray(result?.response?.tool_calls)) return result.response.tool_calls;
  if (Array.isArray(result?.response?.toolCalls)) return result.response.toolCalls;
  if (Array.isArray(result?.result?.tool_calls)) return result.result.tool_calls;
  if (Array.isArray(result?.result?.response?.tool_calls)) return result.result.response.tool_calls;
  if (Array.isArray(result?.choices?.[0]?.message?.tool_calls)) return result.choices[0].message.tool_calls;
  if (Array.isArray(result?.result?.choices?.[0]?.message?.tool_calls)) return result.result.choices[0].message.tool_calls;
  return [];
}
