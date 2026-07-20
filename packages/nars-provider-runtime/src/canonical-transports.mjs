import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  AiProcessInvocationRefusalError,
  spawnAiProcessInvocation,
} from '@narada2/carrier-provider-support/ai-process-invocation';
import {
  accumulateCodexExecEvent,
  buildCodexExecArgs,
  buildCodexSubprocessEnv,
  codexExecPrompt,
  codexRequestMcpServers,
  createCodexExecTextAccumulator,
  parseCodexExecJsonLine,
} from './canonical-protocol-adapters.mjs';
import { spawnOwnedProcess } from './process-supervisor.mjs';
import { codexCliSpawnError, codexCommand } from './runtime-tail-utils.mjs';

function transportError(message, {
  admission = 'uncertain',
  transportSubmitted = true,
  code = 'provider-transport-failed',
  evidence,
} = {}) {
  const error = new Error(message);
  error.code = code;
  error.admission = admission;
  error.transportSubmitted = transportSubmitted;
  if (evidence !== undefined) error.evidence = evidence;
  return error;
}

export function sendHttp({ url, body, headers }, settings) {
  const payload = JSON.stringify(body);
  return new Promise((resolveRequest, rejectRequest) => {
    if (settings.abortSignal?.aborted) {
      return rejectRequest(transportError('provider_request_aborted', {
        admission: 'not-acknowledged',
        transportSubmitted: false,
        code: 'provider-request-aborted',
      }));
    }
    const secure = url.protocol === 'https:';
    const request = (secure ? httpsRequest : httpRequest)({
      hostname: url.hostname,
      port: url.port || (secure ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) },
    }, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (response.statusCode < 200 || response.statusCode >= 300 || parsed?.error) {
            rejectRequest(transportError(`API error ${response.statusCode}: ${JSON.stringify(parsed).slice(0, 1000)}`, {
              admission: 'acknowledged',
              code: 'provider-response-error',
            }));
          } else {
            resolveRequest(parsed);
          }
        } catch {
          rejectRequest(transportError(`Invalid JSON from API: ${data.slice(0, 200)}`, {
            admission: 'acknowledged',
            code: 'provider-response-invalid-json',
          }));
        }
      });
    });
    request.on('error', (error) => rejectRequest(transportError(error instanceof Error ? error.message : String(error))));
    settings.abortSignal?.addEventListener?.('abort', () => request.destroy(transportError('provider_request_aborted', {
      code: 'provider-request-aborted',
    })), { once: true });
    request.end(payload);
  });
}

export async function sendCodex(request, settings, onAdmitted = null) {
  if (settings.abortSignal?.aborted) {
    throw transportError('provider_request_aborted', {
      admission: 'not-acknowledged',
      transportSubmitted: false,
      code: 'provider-request-aborted',
    });
  }
  const command = codexCommand();
  const cwd = request.arguments?.cwd ?? settings.siteRoot;
  let owner;
  try {
    const spawnInvocation = settings.spawnAiProcessInvocation ?? spawnAiProcessInvocation;
    owner = spawnInvocation({
      adapterKind: 'codex',
      projection: 'codex-subscription',
      purpose: 'provider_request',
      siteRoot: settings.siteRoot,
      cwd,
      workspaceRoot: settings.siteRoot,
      agentId: settings.identity,
      command: command.command,
      argv: [...command.prefixArgs, ...buildCodexExecArgs(request, settings)],
      env: buildCodexSubprocessEnv(codexRequestMcpServers(request, settings), settings),
      sessionId: settings.runtimeSessionId,
      agentIdentityRef: settings.agentIdentityRef,
      launchSessionId: settings.launchSessionId,
      invocationScope: settings.invocationScope,
    }, {
      spawnProcess: settings.spawnProcess ?? spawnOwnedProcess,
      spawnOptions: { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    });
  } catch (error) {
    if (error instanceof AiProcessInvocationRefusalError) {
      throw transportError(`codex ai process invocation refused: ${error.admission.reason}`, {
        admission: 'not-acknowledged',
        transportSubmitted: false,
        code: 'provider-invocation-refused',
        evidence: error.admission,
      });
    }
    throw error;
  }
  try {
    await onAdmitted?.(owner.aiProcessInvocation ?? owner);
  } catch (error) {
    owner.terminateTree?.('codex_provider_admission_transition_failed');
    throw error;
  }
  return new Promise((resolveRequest, rejectRequest) => {
    const abortChild = () => owner.terminateTree('codex_provider_abort');
    settings.abortSignal?.addEventListener?.('abort', abortChild, { once: true });
    owner.child.stdin.end(codexExecPrompt(request));
    let stdout = '';
    let stderr = '';
    owner.child.stdout.setEncoding('utf8');
    owner.child.stderr.setEncoding('utf8');
    owner.child.stdout.on('data', (chunk) => { stdout += chunk; });
    owner.child.stderr.on('data', (chunk) => { stderr += chunk; });
    owner.child.on('error', (error) => rejectRequest(codexCliSpawnError(error, command)));
    owner.child.on('exit', (code) => {
      settings.abortSignal?.removeEventListener?.('abort', abortChild);
      if (settings.abortSignal?.aborted) {
        return rejectRequest(transportError('provider_request_aborted', {
          code: 'provider-request-aborted',
        }));
      }
      if (code !== 0) {
        return rejectRequest(transportError(`codex exec --json failed with exit ${code}${stderr.trim() ? `; ${stderr.trim().slice(0, 1000)}` : ''}`, {
          admission: 'acknowledged',
          code: 'provider-process-failed',
        }));
      }
      let state = createCodexExecTextAccumulator();
      let threadId = null;
      let parsedEvents = 0;
      for (const line of stdout.split(/\r?\n/)) {
        const event = parseCodexExecJsonLine(line);
        if (!event) continue;
        parsedEvents += 1;
        if (event.type === 'thread.started') threadId = event.thread_id ?? threadId;
        state = accumulateCodexExecEvent(state, event).state;
      }
      if (stdout.trim() && parsedEvents === 0) {
        return rejectRequest(transportError('Invalid JSONL from codex exec', {
          admission: 'acknowledged',
          code: 'provider-response-invalid-jsonl',
        }));
      }
      resolveRequest({ threadId, content: state.content, streaming_rendered: false });
    });
  });
}
