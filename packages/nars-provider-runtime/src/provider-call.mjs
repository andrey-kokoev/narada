import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { redactProviderRuntimeBinding, resolveProviderRuntimeBinding } from '@narada2/carrier-provider-contract';
import { AiProcessInvocationRefusalError, spawnAiProcessInvocation } from '@narada2/carrier-provider-support/ai-process-invocation';
import { REQUEST_ADAPTERS, accumulateCodexExecEvent, buildCodexExecArgs, buildCodexSubprocessEnv, codexExecPrompt, codexRequestMcpServers, configureProviderAdapterContext, createCodexExecTextAccumulator, parseAnthropicMessagesResponse, parseCodexExecJsonLine, parseCodexMcpResponse } from './provider-adapters.mjs';
import { PROVIDER_SUPPORT_STATES, loadProviderMetadata } from './provider-resolution.mjs';
import { resolveProviderRuntimeDefaults } from './provider-runtime-defaults.mjs';
import { spawnOwnedProcess } from './process-supervisor.mjs';
import { codexCliSpawnError, codexCommand } from './runtime-tail-utils.mjs';

const PROVIDER_METADATA = loadProviderMetadata();

export function createProviderCall({ runtimeContext = {}, env = process.env } = {}) {
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
  };
  configureProviderAdapterContext(settings);
  return (messages, tools, overrides = {}) => callProvider(messages, tools, { ...settings, ...overrides });
}

async function callProvider(messages, tools, settings) {
  const metadata = PROVIDER_METADATA[settings.provider];
  if (!metadata) throw new Error(`Unsupported intelligence provider: ${settings.provider}`);
  const adapter = REQUEST_ADAPTERS[metadata.adapter_kind];
  const state = metadata.support_state ?? metadata.support_status;
  if (!adapter || ![PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED, PROVIDER_SUPPORT_STATES.DEPRECATED, 'supported'].includes(state)) throw new Error(`Unsupported intelligence provider adapter for ${settings.provider}`);
  if (settings.provider !== 'codex-subscription' && !settings.apiKey) throw new Error(`Missing API key for ${settings.provider}`);
  const request = adapter.buildRequest(messages, tools, settings);
  if (metadata.adapter_kind === 'codex-mcp-server') return parseCodexMcpResponse(await sendCodex(request, settings));
  const response = await sendHttp(request, settings);
  return metadata.adapter_kind === 'anthropic-messages' ? parseAnthropicMessagesResponse(response) : response;
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
    try { owner = spawnAiProcessInvocation({ adapterKind: 'codex', projection: 'codex-subscription', purpose: 'provider_request', siteRoot: cwd, cwd, command: command.command, argv: [...command.prefixArgs, ...buildCodexExecArgs(request, settings)], env: buildCodexSubprocessEnv(codexRequestMcpServers(request, settings), settings) }, { spawnProcess: spawnOwnedProcess, spawnOptions: { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] } }); } catch (error) { return rejectRequest(error instanceof AiProcessInvocationRefusalError ? new Error(`codex ai process invocation refused: ${error.admission.reason}`) : error); }
    const abortChild = () => owner.terminateTree('codex_provider_abort');
    settings.abortSignal?.addEventListener?.('abort', abortChild, { once: true });
    owner.child.stdin.end(codexExecPrompt(request)); let stdout = ''; let stderr = '';
    owner.child.stdout.setEncoding('utf8'); owner.child.stderr.setEncoding('utf8'); owner.child.stdout.on('data', (chunk) => { stdout += chunk; }); owner.child.stderr.on('data', (chunk) => { stderr += chunk; }); owner.child.on('error', (error) => rejectRequest(codexCliSpawnError(error, command)));
    owner.child.on('exit', (code) => { settings.abortSignal?.removeEventListener?.('abort', abortChild); if (settings.abortSignal?.aborted) return rejectRequest(new Error('provider_request_aborted')); if (code !== 0) return rejectRequest(new Error(`codex exec --json failed with exit ${code}${stderr.trim() ? `; ${stderr.trim().slice(0, 1000)}` : ''}`)); let state = createCodexExecTextAccumulator(); let threadId = null; let parsedEvents = 0; for (const line of stdout.split(/\r?\n/)) { const event = parseCodexExecJsonLine(line); if (!event) continue; parsedEvents += 1; if (event.type === 'thread.started') threadId = event.thread_id ?? threadId; state = accumulateCodexExecEvent(state, event).state; } if (stdout.trim() && parsedEvents === 0) return rejectRequest(new Error('Invalid JSONL from codex exec')); resolveRequest({ threadId, content: state.content, streaming_rendered: false }); });
  });
}
