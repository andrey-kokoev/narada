import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { redactProviderRuntimeBinding, resolveProviderRuntimeBinding } from '@narada2/carrier-provider-contract';
import { AiProcessInvocationRefusalError, spawnAiProcessInvocation } from '@narada2/carrier-provider-support/ai-process-invocation';
import { REQUEST_ADAPTERS, accumulateCodexExecEvent, buildCodexExecArgs, buildCodexSubprocessEnv, codexExecPrompt, codexRequestMcpServers, configureProviderAdapterContext, createCodexExecTextAccumulator, parseAnthropicMessagesResponse, parseCodexExecJsonLine, parseCodexMcpResponse } from './provider-adapters.mjs';
import { PROVIDER_SUPPORT_STATES, loadProviderMetadata } from './provider-resolution.mjs';
import { resolveProviderRuntimeDefaults } from './provider-runtime-defaults.mjs';
import { spawnOwnedProcess } from './process-supervisor.mjs';
import {
  assertNarsProviderInvocationTransition,
  createNarsProviderInvocationId,
  isNarsProviderInvocationTerminalState,
  NarsProviderInvocationRefusalError,
  normalizeNarsProviderInvocationRecord,
} from './provider-invocation-state.mjs';
import { codexCliSpawnError, codexCommand, isAbortError } from './runtime-tail-utils.mjs';

const PROVIDER_METADATA = loadProviderMetadata();

export function createProviderCall({ runtimeContext = {}, env = process.env, invocationEventSink = null, invocationIdFn = null } = {}) {
  const provider = runtimeContext.intelligenceProvider ?? env.NARADA_INTELLIGENCE_PROVIDER;
  if (!provider) throw new Error('provider_runtime_provider_required');
  const defaults = resolveProviderRuntimeDefaults(provider, env);
  const explicitSettings = runtimeContext.providerSettings ?? {};
  const binding = resolveProviderRuntimeBinding(provider, {
    env,
    overrides: {
      apiKey: explicitSettings.apiKey,
      baseUrl: explicitSettings.baseUrl,
      model: explicitSettings.model ?? (provider === 'codex-subscription' ? defaults.model : undefined),
      thinking: explicitSettings.thinking,
    },
  });
  const settings = {
    provider: binding.provider_id,
    apiKey: binding.api_key,
    baseUrl: binding.base_url,
    siteRoot: resolve(runtimeContext.siteRoot ?? env.NARADA_SITE_ROOT ?? process.cwd()),
    model: binding.model,
    thinking: binding.reasoning_effort,
    stream: explicitSettings.stream !== false,
    providerRuntimeBinding: redactProviderRuntimeBinding(binding),
    codexSessionState: { threadId: null },
  };
  configureProviderAdapterContext(settings);
  return (messages, tools, overrides = {}) => callProvider(messages, tools, {
    ...settings,
    ...overrides,
    invocationEventSink: overrides.invocationEventSink ?? invocationEventSink,
    invocationIdFn: overrides.invocationIdFn ?? invocationIdFn,
  });
}

async function callProvider(messages, tools, settings) {
  const invocationId = settings.invocationId
    ?? settings.invocation_id
    ?? settings.providerInvocationId
    ?? createNarsProviderInvocationId(typeof settings.invocationIdFn === 'function' ? settings.invocationIdFn : undefined);
  const baseRecord = {
    invocation_id: invocationId,
    provider: settings.provider ?? null,
    adapter_kind: null,
    transport: null,
    turn_id: settings.turnId ?? settings.turn_id ?? null,
    input_event_id: settings.inputEventId ?? settings.input_event_id ?? null,
    request_id: settings.requestId ?? settings.request_id ?? null,
    thread_id: null,
  };
  let record = null;
  const transition = async (nextState, evidence = {}) => {
    const previousState = record?.invocation_state ?? null;
    assertNarsProviderInvocationTransition(previousState, nextState);
    record = normalizeNarsProviderInvocationRecord({
      ...baseRecord,
      ...record,
      ...evidence,
      invocation_state: nextState,
      updated_at: new Date().toISOString(),
    });
    if (typeof settings.invocationEventSink === 'function') {
      await settings.invocationEventSink({
        kind: 'provider_invocation_state_transition',
        previous_state: previousState,
        next_state: record.invocation_state,
        ...record,
      });
    }
    return record;
  };

  try {
    await transition('requested');
    if (settings.abortSignal?.aborted) throw new Error('provider_request_aborted');

    const metadata = PROVIDER_METADATA[settings.provider];
    if (!metadata) throw new NarsProviderInvocationRefusalError(`Unsupported intelligence provider: ${settings.provider}`);
    const adapter = REQUEST_ADAPTERS[metadata.adapter_kind];
    const supportState = metadata.support_state ?? metadata.support_status;
    if (!adapter || ![PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED, PROVIDER_SUPPORT_STATES.DEPRECATED, 'supported'].includes(supportState)) {
      throw new NarsProviderInvocationRefusalError(`Unsupported intelligence provider adapter for ${settings.provider}`);
    }
    if (settings.provider !== 'codex-subscription' && !settings.apiKey) {
      throw new NarsProviderInvocationRefusalError(`Missing API key for ${settings.provider}`);
    }
    await transition('validated', { adapter_kind: metadata.adapter_kind });

    const request = adapter.buildRequest(messages, tools, settings);
    await transition('shaped', { adapter_kind: metadata.adapter_kind });
    const transport = metadata.adapter_kind === 'codex-mcp-server' ? 'codex_subprocess' : 'http';
    await transition('dispatched', { adapter_kind: metadata.adapter_kind, transport });
    await transition('receiving', { adapter_kind: metadata.adapter_kind, transport });

    if (metadata.adapter_kind === 'codex-mcp-server') {
      const response = await sendCodex(request, settings);
      if (response?.threadId && settings.codexSessionState) settings.codexSessionState.threadId = response.threadId;
      const result = parseCodexMcpResponse(response);
      await transition('completed', { transport, thread_id: response?.threadId ?? null });
      return result;
    }
    const response = await sendHttp(request, settings);
    const result = metadata.adapter_kind === 'anthropic-messages' ? parseAnthropicMessagesResponse(response) : response;
    await transition('completed', { transport });
    return result;
  } catch (error) {
    const terminalState = providerInvocationTerminalState(error, settings);
    if (!isNarsProviderInvocationTerminalState(record?.invocation_state)) {
      await transition(terminalState, {
        reason: providerInvocationTerminalReason(terminalState),
        error: providerInvocationErrorMessage(error),
      });
    }
    throw error;
  }
}

function providerInvocationTerminalState(error, settings) {
  if (settings.abortSignal?.aborted || isAbortError(error)) return 'interrupted';
  if (error instanceof NarsProviderInvocationRefusalError || error?.code === 'provider_invocation_refused') return 'refused';
  return 'failed';
}

function providerInvocationTerminalReason(state) {
  if (state === 'refused') return 'admission_refused';
  if (state === 'interrupted') return 'aborted';
  return 'provider_failure';
}

function providerInvocationErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 1000 ? `${message.slice(0, 997)}...` : message;
}

function sendHttp({ url, body, headers }, settings) {
  const payload = JSON.stringify(body);
  return new Promise((resolveRequest, rejectRequest) => {
    if (settings.abortSignal?.aborted) return rejectRequest(new Error('provider_request_aborted'));
    const secure = url.protocol === 'https:';
    const request = (secure ? httpsRequest : httpRequest)({ hostname: url.hostname, port: url.port || (secure ? 443 : 80), path: `${url.pathname}${url.search}`, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) } }, (response) => {
      let data = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { data += chunk; }); response.on('end', () => { try { const parsed = JSON.parse(data); if (response.statusCode < 200 || response.statusCode >= 300 || parsed?.error) rejectRequest(new Error(`API error ${response.statusCode}: ${JSON.stringify(parsed).slice(0, 1000)}`)); else resolveRequest(parsed); } catch { rejectRequest(new Error(`Invalid JSON from API: ${data.slice(0, 200)}`)); } });
    });
    request.on('error', rejectRequest); settings.abortSignal?.addEventListener?.('abort', () => request.destroy(new Error('provider_request_aborted')), { once: true }); request.end(payload);
  });
}

function sendCodex(request, settings) {
  return new Promise((resolveRequest, rejectRequest) => {
    if (settings.abortSignal?.aborted) return rejectRequest(new Error('provider_request_aborted'));
    const command = codexCommand(); const cwd = request.arguments?.cwd ?? settings.siteRoot;
    let owner;
    try { owner = spawnAiProcessInvocation({ adapterKind: 'codex', projection: 'codex-subscription', purpose: 'provider_request', siteRoot: cwd, cwd, command: command.command, argv: [...command.prefixArgs, ...buildCodexExecArgs(request, settings)], env: buildCodexSubprocessEnv(codexRequestMcpServers(request, settings), settings) }, { spawnProcess: spawnOwnedProcess, spawnOptions: { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] } }); } catch (error) { return rejectRequest(error instanceof AiProcessInvocationRefusalError ? new NarsProviderInvocationRefusalError(`codex ai process invocation refused: ${error.admission.reason}`) : error); }
    const abortChild = () => owner.terminateTree('codex_provider_abort');
    settings.abortSignal?.addEventListener?.('abort', abortChild, { once: true });
    owner.child.stdin.end(codexExecPrompt(request)); let stdout = ''; let stderr = '';
    owner.child.stdout.setEncoding('utf8'); owner.child.stderr.setEncoding('utf8'); owner.child.stdout.on('data', (chunk) => { stdout += chunk; }); owner.child.stderr.on('data', (chunk) => { stderr += chunk; }); owner.child.on('error', (error) => rejectRequest(codexCliSpawnError(error, command)));
    owner.child.on('exit', (code) => { settings.abortSignal?.removeEventListener?.('abort', abortChild); if (settings.abortSignal?.aborted) return rejectRequest(new Error('provider_request_aborted')); if (code !== 0) return rejectRequest(new Error(`codex exec --json failed with exit ${code}${stderr.trim() ? `; ${stderr.trim().slice(0, 1000)}` : ''}`)); let state = createCodexExecTextAccumulator(); let threadId = null; let parsedEvents = 0; for (const line of stdout.split(/\r?\n/)) { const event = parseCodexExecJsonLine(line); if (!event) continue; parsedEvents += 1; if (event.type === 'thread.started') threadId = event.thread_id ?? threadId; state = accumulateCodexExecEvent(state, event).state; } if (stdout.trim() && parsedEvents === 0) return rejectRequest(new Error('Invalid JSONL from codex exec')); resolveRequest({ threadId, content: state.content, streaming_rendered: false }); });
  });
}
