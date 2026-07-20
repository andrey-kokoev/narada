import { resolve } from 'node:path';
import {
  buildAnthropicMessagesRequest,
  buildCodexMcpRequest,
  buildOpenAiChatRequest,
  parseAnthropicMessagesResponse,
  parseCodexMcpResponse,
} from './canonical-protocol-adapters.mjs';
import { sendCodex, sendHttp } from './canonical-transports.mjs';
import { CredentialLocatorResolutionError, resolveCredentialLocator } from './credential-locator.mjs';
import { assertNarsProviderInvocationTransition, isNarsProviderInvocationTerminalState } from './provider-invocation-state.mjs';

function protocolKey(protocol) {
  return `${protocol?.family ?? ''}/${protocol?.operation ?? ''}/${protocol?.version ?? ''}`;
}

function providerSlug(inferenceProvider) {
  return String(inferenceProvider.id).replace(/^inference-provider:/, '');
}

function thinkingOption(plan) {
  return typeof plan.options?.thinking === 'string' ? plan.options.thinking : undefined;
}

function normalizedUsage(response, elapsedMs) {
  const usage = response?.usage ?? {};
  return {
    ...(Number.isFinite(usage.prompt_tokens ?? usage.input_tokens) ? { input_tokens: usage.prompt_tokens ?? usage.input_tokens } : {}),
    ...(Number.isFinite(usage.completion_tokens ?? usage.output_tokens) ? { output_tokens: usage.completion_tokens ?? usage.output_tokens } : {}),
    ...(Number.isFinite(usage.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens) ? { cached_tokens: usage.cached_tokens ?? usage.prompt_tokens_details.cached_tokens } : {}),
    latency_ms: elapsedMs,
  };
}

function refusal(code, message) {
  return {
    admission: 'not-acknowledged',
    transportSubmitted: false,
    error: { code, message, retryable: false },
  };
}

function transportFailure(error) {
  return {
    admission: error?.admission ?? 'uncertain',
    transportSubmitted: error?.transportSubmitted !== false,
    error: {
      code: error?.code ?? 'provider-transport-failed',
      message: error instanceof Error ? error.message : String(error),
      retryable: error?.admission !== 'acknowledged',
    },
  };
}

/** Node adapter driven exclusively by immutable resources attached to an InvocationPlan. */
export function createCanonicalInvocationAdapter({
  runtimeContext = {},
  env = process.env,
  credentialResolver = (locator) => resolveCredentialLocator(locator, { env }),
  httpTransport = sendHttp,
  codexTransport = sendCodex,
  nowMs = () => Date.now(),
} = {}) {
  const codexSessions = new Map();
  return Object.freeze({
    async invoke(input) {
      const { plan, model, modelProvider, offering, inferenceProvider, endpoint, adapter, credential } = input;
      const invocationSink = input.invocationEventSink;
      let invocationState = null;
      const provider = providerSlug(inferenceProvider);
      const adapterKind = String(adapter.kind ?? adapter.id ?? '').replace(/^adapter:/, '') || null;
      const transport = adapter.protocol?.family === 'codex-subscription' ? 'codex_subprocess' : 'http';
      const invocationId = input.invocationId ?? `provider-invocation:${plan.id}`;
      const transition = async (nextState, evidence = {}) => {
        if (typeof invocationSink !== 'function') return;
        const previousState = invocationState;
        assertNarsProviderInvocationTransition(previousState, nextState);
        invocationState = nextState;
        await invocationSink({
          kind: 'provider_invocation_state_transition',
          previous_state: previousState,
          next_state: nextState,
          invocation_state: nextState,
          invocation_id: invocationId,
          provider,
          adapter_kind: adapterKind,
          transport,
          turn_id: input.turnId ?? null,
          input_event_id: input.inputEventId ?? null,
          request_id: input.requestId ?? null,
          invocation_scope: input.invocationScope ?? runtimeContext.invocationScope ?? null,
          ...evidence,
        });
      };
      const refuse = async (code, message) => {
        await transition('refused', { reason: code, error: { code, message, retryable: false } });
        return refusal(code, message);
      };
      await transition('requested');
      if (model.provider?.id !== modelProvider.id
        || offering.model?.id !== model.id
        || offering.model_provider?.id !== modelProvider.id
        || offering.inference_provider?.id !== inferenceProvider.id
        || offering.endpoint?.id !== endpoint.id) {
        return refuse('canonical-coordinate-mismatch', 'planned invocation coordinates do not form one offering graph');
      }
      if (adapter.runtime_family !== 'node') {
        return refuse('adapter-runtime-mismatch', `adapter '${adapter.id}' is not a Node runtime adapter`);
      }
      let secret;
      try {
        secret = await credentialResolver(credential);
      } catch (error) {
        if (error instanceof CredentialLocatorResolutionError || error?.code) {
          return refuse(error.code ?? 'credential-unavailable', error instanceof Error ? error.message : String(error));
        }
        return refuse('credential-resolution-failed', error instanceof Error ? error.message : String(error));
      }
      await transition('validated', { adapter_kind: adapterKind });

      const messages = Array.isArray(input.messages) ? input.messages : [];
      const tools = Array.isArray(input.tools) ? input.tools : [];
      const thinking = thinkingOption(plan);
      const siteRoot = runtimeContext.siteRoot ?? process.cwd();
      const settings = {
        siteRoot,
        identity: runtimeContext.identity ?? null,
        model: offering.invocation_model_key,
        thinking,
        abortSignal: input.abortSignal ?? null,
        sessionDir: runtimeContext.sessionDir ?? resolve(siteRoot, '.ai', 'runtime', 'ai-process-invocation'),
        runtimeSessionId: runtimeContext.session ?? runtimeContext.runtimeSessionId ?? null,
        launchSessionId: runtimeContext.launchSessionId ?? null,
        agentIdentityRef: runtimeContext.agentIdentityRef ?? null,
        invocationScope: runtimeContext.invocationScope ?? null,
        mcpServers: runtimeContext.mcpServers ?? {},
        buildChildProcessEnv: runtimeContext.buildChildProcessEnv,
        writeDurableTextFile: runtimeContext.writeDurableTextFile,
        codexAuthHome: runtimeContext.codexAuthHome,
      };
      const startedAt = nowMs();
      try {
        let response;
        const key = protocolKey(adapter.protocol);
        if (key === 'openai/chat-completions/1') {
          if (endpoint.address?.kind !== 'url') return await refuse('endpoint-address-mismatch', 'OpenAI chat completions require an explicit URL endpoint');
          if (!secret) return await refuse('credential-unavailable', `endpoint '${endpoint.id}' requires an admitted credential`);
          const request = buildOpenAiChatRequest(messages, tools, {
            baseUrl: endpoint.address.url,
            model: offering.invocation_model_key,
            apiKey: secret,
            thinking,
            provider: providerSlug(inferenceProvider),
          });
          request.url = new URL(endpoint.address.url);
          await transition('shaped', { adapter_kind: adapterKind });
          await transition('dispatched', { adapter_kind: adapterKind, transport });
          await transition('admitting', { adapter_kind: adapterKind, transport });
          await transition('admitted', { adapter_kind: adapterKind, transport, admission: { kind: 'provider_transport', admitted: true, reason: 'transport_ready' } });
          await transition('receiving', { adapter_kind: adapterKind, transport });
          response = await httpTransport(request, settings);
        } else if (key === 'anthropic/messages/1') {
          if (endpoint.address?.kind !== 'url') return await refuse('endpoint-address-mismatch', 'Anthropic messages require an explicit URL endpoint');
          if (!secret) return await refuse('credential-unavailable', `endpoint '${endpoint.id}' requires an admitted credential`);
          const request = buildAnthropicMessagesRequest(messages, tools, {
            baseUrl: endpoint.address.url,
            model: offering.invocation_model_key,
            apiKey: secret,
            thinking,
          });
          request.url = new URL(endpoint.address.url);
          await transition('shaped', { adapter_kind: adapterKind });
          await transition('dispatched', { adapter_kind: adapterKind, transport });
          await transition('admitting', { adapter_kind: adapterKind, transport });
          await transition('admitted', { adapter_kind: adapterKind, transport, admission: { kind: 'provider_transport', admitted: true, reason: 'transport_ready' } });
          await transition('receiving', { adapter_kind: adapterKind, transport });
          response = parseAnthropicMessagesResponse(await httpTransport(request, settings));
        } else if (key === 'codex-subscription/responses/1') {
          if (endpoint.address?.kind !== 'runtime-service' || endpoint.address.service !== 'codex-subscription') {
            return await refuse('endpoint-address-mismatch', 'Codex subscription requires runtime-service:codex-subscription');
          }
          const codexSessionState = codexSessions.get(offering.id) ?? { threadId: null };
          codexSessions.set(offering.id, codexSessionState);
          const request = buildCodexMcpRequest(messages, tools, { ...settings, codexSessionState });
          await transition('shaped', { adapter_kind: adapterKind });
          await transition('dispatched', { adapter_kind: adapterKind, transport });
          await transition('admitting', { adapter_kind: adapterKind, transport });
          await transition('admitted', { adapter_kind: adapterKind, transport, admission: { kind: 'provider_transport', admitted: true, reason: 'transport_ready' } });
          await transition('receiving', { adapter_kind: adapterKind, transport });
          const raw = await codexTransport(request, { ...settings, codexSessionState });
          if (raw?.threadId) codexSessionState.threadId = raw.threadId;
          response = parseCodexMcpResponse(raw);
        } else {
          return await refuse('protocol-not-supported', `unsupported canonical protocol '${key}'`);
        }
        await transition('completed', { adapter_kind: adapterKind, transport });
        return {
          response,
          admission: 'acknowledged',
          transportSubmitted: true,
          providerRequestRef: response?.id ?? undefined,
          usage: normalizedUsage(response, Math.max(0, nowMs() - startedAt)),
        };
      } catch (error) {
        if (!isNarsProviderInvocationTerminalState(invocationState)) {
          const terminalState = input.abortSignal?.aborted ? 'interrupted' : 'failed';
          await transition(terminalState, {
            reason: terminalState === 'interrupted' ? 'aborted' : 'provider_failure',
            error: {
              code: error?.code ?? 'provider-transport-failed',
              message: error instanceof Error ? error.message : String(error),
              retryable: error?.admission !== 'acknowledged',
            },
          });
        }
        return transportFailure(error);
      }
    },
  });
}
