import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { createCarrierRuntimeContext } from '@narada2/carrier-runtime/carrier-runtime-context';
import { createCarrierRuntimeDependencies } from '@narada2/carrier-runtime/runtime-dependencies';
import { runCarrierServerMode } from '@narada2/carrier-runtime/server-mode';
import { createProjectedTerminalBridge } from '@narada2/carrier-terminal-projection/projected-terminal';
import {
  formatPreflightWorkflowEvent,
  formatPreflightWorkflowSummary,
  formatHostStatusEvent,
  formatRuntimeMcpFaultEvent,
  formatRuntimeMcpFaultSummary,
  formatSessionOperationsEvent,
  formatSessionOperationsSummary,
  formatSessionWorkflowEvent,
  formatSessionWorkflowSummary,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
} from './runtime-server-events.mjs';
import {
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  lifecycleBindingFromArgs,
  lifecycleHookFailureLine,
} from './lifecycle-hooks.mjs';
import { startEventStreamProjection, parseEventStreamOptions } from './runtime-server-event-stream.mjs';
import { createEventHub } from './runtime-server-event-hub.mjs';
import { createDelegatedAuthorityHandoff } from './runtime-server-authority.mjs';
import { handleArtifactHttpRequest } from './runtime-server-artifacts.mjs';

export { formatHostStatusEvent } from './runtime-server-events.mjs';

function valueAfterFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return null;
  const value = args[index + 1];
  return value && !String(value).startsWith('--') ? String(value) : null;
}

function encodeWebSocketTextFrame(payload) {
  const body = Buffer.from(String(payload), 'utf8');
  if (body.length < 126) return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  if (body.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

function decodeWebSocketFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;
    let payload = buffer.subarray(offset + headerLength + maskLength, frameEnd);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }
    frames.push({ opcode, text: payload.toString('utf8') });
    offset = frameEnd;
  }
  return { frames, rest: buffer.subarray(offset) };
}

async function loadRuntimeDependencies(runtimeContext = {}) {
  const runtimeDependencies = createCarrierRuntimeDependencies({ runtimeContext });
  return {
    ...runtimeDependencies,
    createProjectedTerminalBridge,
  };
}

function parseHealthOptions(args, env = process.env) {
  const forwardedArgs = [];
  let enabled = env.NARADA_AGENT_RUNTIME_HEALTH_ENABLED !== '0';
  let host = env.NARADA_AGENT_RUNTIME_HEALTH_HOST || '127.0.0.1';
  let port = Number.parseInt(env.NARADA_AGENT_RUNTIME_HEALTH_PORT || '0', 10);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--no-health') {
      enabled = false;
      continue;
    }
    if (arg === '--health-host') {
      host = args[index + 1] || host;
      index += 1;
      continue;
    }
    if (arg === '--health-port') {
      port = Number.parseInt(args[index + 1] || '0', 10);
      index += 1;
      continue;
    }
    forwardedArgs.push(arg);
  }
  return {
    forwardedArgs,
    health: {
      enabled,
      host,
      port: Number.isFinite(port) && port >= 0 ? port : 0,
    },
  };
}

function parseSiteConfigEnv(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function startHealthProjection({ childStdin, host, port, timeoutMs = 2000, runtimeContext }) {
  const pending = new Map();
  let sequence = 0;
  const requestHealth = () => new Promise((resolve, reject) => {
    const stdin = typeof childStdin === 'function' ? childStdin() : childStdin;
    if (!stdin?.writable) {
      reject(new Error('child_stdin_unavailable'));
      return;
    }
    sequence += 1;
    const requestId = `http-health-${Date.now()}-${sequence}`;
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('session_health_timeout'));
    }, timeoutMs);
    pending.set(requestId, { resolve, reject, timer });
    stdin.write(`${JSON.stringify({ id: requestId, method: 'session.health', params: {} })}\n`);
  });
  const server = createServer(async (request, response) => {
    if (await handleArtifactHttpRequest({ request, response, runtimeContext })) return;
    if (request.method !== 'GET' || request.url?.split('?')[0] !== '/health') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ error: 'not_found' })}\n`);
      return;
    }
    try {
      const health = await requestHealth();
      response.writeHead(health.status === 'unhealthy' ? 503 : 200, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify(health)}\n`);
    } catch (error) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ schema: 'narada.nars.health.v1', status: 'unhealthy', error: error instanceof Error ? error.message : String(error) })}\n`);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      const boundPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        url: `http://${host}:${boundPort}/health`,
        observe(event) {
          if (event?.event !== 'session_health' || !pending.has(event.request_id)) return;
          const entry = pending.get(event.request_id);
          pending.delete(event.request_id);
          clearTimeout(entry.timer);
          entry.resolve(event);
        },
        rejectAll(error) {
          for (const [requestId, entry] of pending.entries()) {
            pending.delete(requestId);
            clearTimeout(entry.timer);
            entry.reject(error);
          }
        },
      });
    });
  });
}

function renderWrapperEvents({ event, wrapperEventsJsonl, state }) {
  if (wrapperEventsJsonl) {
    const statusEvent = formatWrapperStatusEvent(event);
    if (statusEvent) console.error(JSON.stringify(statusEvent));
  }
  const summary = formatStartupMcpSummary(event);
  if (summary && !state.startupSummaryPrinted) {
    console.error(summary);
    if (wrapperEventsJsonl) {
      const wrapperEvent = formatStartupMcpEvent(event);
      if (wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    }
    state.startupSummaryPrinted = true;
  }
  const runtimeFaultSummary = formatRuntimeMcpFaultSummary(event);
  if (runtimeFaultSummary && !state.runtimeFaultSummaries.has(runtimeFaultSummary)) {
    console.error(runtimeFaultSummary);
    if (wrapperEventsJsonl) {
      const wrapperEvent = formatRuntimeMcpFaultEvent(event);
      if (wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    }
    state.runtimeFaultSummaries.add(runtimeFaultSummary);
  }
  for (const [workflowSummary, wrapperEvent] of [
    [formatSessionWorkflowSummary(event), formatSessionWorkflowEvent(event)],
    [formatSessionOperationsSummary(event), formatSessionOperationsEvent(event)],
    [formatPreflightWorkflowSummary(event), formatPreflightWorkflowEvent(event)],
  ]) {
    if (!workflowSummary || state.workflowSummaries.has(workflowSummary)) continue;
    console.error(workflowSummary);
    if (wrapperEventsJsonl && wrapperEvent) console.error(JSON.stringify(wrapperEvent));
    state.workflowSummaries.add(workflowSummary);
  }
}

async function main() {
  const requestedArgs = process.argv.slice(2);
  const wrapperEventsJsonl = requestedArgs.includes('--wrapper-events-jsonl');
  const rawJsonl = requestedArgs.includes('--raw-jsonl');
  const parsedHealth = parseHealthOptions(requestedArgs.filter((arg) => arg !== '--wrapper-events-jsonl' && arg !== '--raw-jsonl'));
  const parsedEvents = parseEventStreamOptions(parsedHealth.forwardedArgs);
  const args = parsedEvents.forwardedArgs;
  const operatorSurfaceKind = valueAfterFlag(args, '--operator-surface') ?? process.env.NARADA_OPERATOR_SURFACE_KIND ?? 'agent-cli';
  const lifecycleDispatcher = createNarsLifecycleHookDispatcher();
  const lifecycleBinding = lifecycleBindingFromArgs(args, process.env);
  const delegatedAuthorityHandoff = createDelegatedAuthorityHandoff({ args, env: process.env });
  try {
    const result = await dispatchNarsLifecycleHook(lifecycleDispatcher, 'beforeSessionBind', lifecycleBinding);
    for (const failure of result.failures) console.error(lifecycleHookFailureLine(failure));
  } catch (error) {
    console.error(`[agent-runtime-server] lifecycle hook dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  let healthProjection = null;
  let eventStreamProjection = null;
  const eventHub = createEventHub();
  const runtimeInput = new PassThrough();
  const runtimeOutput = new PassThrough();
  const preliminaryRuntimeContext = createCarrierRuntimeContext({
    identity: lifecycleBinding.agent_id,
    session: lifecycleBinding.session_id,
    siteRoot: lifecycleBinding.metadata.site_root,
    siteConfig: parseSiteConfigEnv(process.env.NARADA_SITE_CONFIG),
    operatorSurfaceKind,
  });
  if (parsedHealth.health.enabled) {
    healthProjection = await startHealthProjection({
      childStdin: () => runtimeInput,
      host: parsedHealth.health.host,
      port: parsedHealth.health.port,
      runtimeContext: { ...preliminaryRuntimeContext, eventHub },
    });
    process.env.NARADA_HEALTH_URL = healthProjection.url;
  }
  if (parsedEvents.events.enabled) {
    eventStreamProjection = await startEventStreamProjection({
      childStdin: () => runtimeInput,
      eventHub,
      host: parsedEvents.events.host,
      port: parsedEvents.events.port,
      eventsPath: preliminaryRuntimeContext.eventsPath,
    });
    process.env.NARADA_EVENT_STREAM_URL = eventStreamProjection.url;
    process.env.NARADA_WEBSOCKET_URL = eventStreamProjection.url;
  }
  process.env.NARADA_NARS_AUTHORITY_HANDOFF = JSON.stringify(delegatedAuthorityHandoff);

  const runtimeContext = createCarrierRuntimeContext({
    identity: lifecycleBinding.agent_id,
    session: lifecycleBinding.session_id,
    siteRoot: lifecycleBinding.metadata.site_root,
    siteConfig: parseSiteConfigEnv(process.env.NARADA_SITE_CONFIG),
    operatorSurfaceKind,
    intelligenceProvider: process.env.NARADA_INTELLIGENCE_PROVIDER,
    narsDelegatedAuthorityHandoff: delegatedAuthorityHandoff,
    providerSettings: {
      model: process.env.NARADA_AI_MODEL ?? process.env.CODEX_MODEL,
      thinking: process.env.NARADA_AI_THINKING,
      stream: process.env.NARADA_AGENT_CLI_STREAM !== '0',
    },
    displaySettings: {
      toolOutputs: process.env.NARADA_AGENT_CLI_TOOL_OUTPUTS !== '0',
    },
    operationHeartbeatDirectiveEnabled: process.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_ENABLED === '1',
    operationHeartbeatDirectiveIntervalMs: Number.parseInt(process.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_INTERVAL_MS ?? '60000', 10),
    operationHeartbeatDirectiveInitialDelayMs: Number.parseInt(process.env.NARADA_OPERATION_HEARTBEAT_DIRECTIVE_INITIAL_DELAY_MS ?? '60000', 10),
    healthUrl: process.env.NARADA_HEALTH_URL ?? null,
    eventStreamUrl: process.env.NARADA_EVENT_STREAM_URL ?? null,
    eventsPath: preliminaryRuntimeContext.eventsPath,
    sessionPath: preliminaryRuntimeContext.sessionPath,
  });
  const runtimeDependencies = await loadRuntimeDependencies(runtimeContext);

  const state = {
    startupSummaryPrinted: false,
    runtimeFaultSummaries: new Set(),
    workflowSummaries: new Set(),
  };
  let stdoutBuffer = '';
  let writeProjectedOutput = (text) => process.stdout.write(text);
  let renderProjectedEvent = () => [];
  const useInteractiveTerminalProjection = !rawJsonl && operatorSurfaceKind === 'agent-cli';

  if (useInteractiveTerminalProjection) {
    const projectedTerminal = runtimeDependencies.createProjectedTerminalBridge({
      input: process.stdin,
      output: process.stdout,
      childStdin: runtimeInput,
    });
    writeProjectedOutput = projectedTerminal.writeProjectedOutput;
    renderProjectedEvent = projectedTerminal.renderEvent;
  } else {
    if (rawJsonl) process.stdin.pipe(runtimeInput);
    else process.stdin.resume?.();
  }
  runtimeOutput.on('data', (chunk) => {
    const text = String(chunk);
    if (rawJsonl) process.stdout.write(text);
    stdoutBuffer += text;
    while (true) {
      const newlineIndex = stdoutBuffer.indexOf('\n');
      if (newlineIndex === -1) break;
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        healthProjection?.observe(event);
        eventHub.publish(event);
        dispatchNarsLifecycleHooksForEvent(lifecycleDispatcher, event)
          .then((result) => {
            for (const failure of result.failures) console.error(lifecycleHookFailureLine(failure));
          })
          .catch((error) => console.error(`[agent-runtime-server] lifecycle hook dispatch failed: ${error instanceof Error ? error.message : String(error)}`));
        if (useInteractiveTerminalProjection) {
          for (const rendered of renderProjectedEvent(event)) {
            if (typeof rendered === 'string') {
              writeProjectedOutput(`${rendered}\n`, { preserveCurrentLine: rendered.startsWith('\n') });
            } else if (rendered?.raw) {
              writeProjectedOutput(rendered.raw, { preserveCurrentLine: rendered.raw.startsWith('\n'), prompt: rendered.newline !== false });
              if (rendered.newline) writeProjectedOutput('\n', { preserveCurrentLine: true });
            }
          }
        } else if (!rawJsonl) {
          for (const rendered of formatHostStatusEvent(event)) process.stdout.write(`${rendered}\n`);
        }
        renderWrapperEvents({ event, wrapperEventsJsonl, state });
      } catch {}
    }
  });

  try {
    await runCarrierServerMode({
      input: runtimeInput,
      output: runtimeOutput,
      callChatApiFn: runtimeDependencies.callChatApiFn,
      runtimeContext,
      dependencies: runtimeDependencies.dependencies,
    });
    healthProjection?.rejectAll(new Error('carrier_closed'));
    healthProjection?.server.close();
    eventStreamProjection?.server.close();
    process.exit(0);
  } catch (error) {
    healthProjection?.rejectAll(error);
    healthProjection?.server.close();
    eventStreamProjection?.server.close();
    console.error(`[agent-runtime-server] carrier runtime failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

export {
  parseHealthOptions,
  parseEventStreamOptions,
  loadRuntimeDependencies,
  createDelegatedAuthorityHandoff,
  createEventHub,
  startHealthProjection,
  startEventStreamProjection,
  formatPreflightWorkflowEvent,
  formatPreflightWorkflowSummary,
  formatRuntimeMcpFaultEvent,
  formatRuntimeMcpFaultSummary,
  formatSessionOperationsEvent,
  formatSessionOperationsSummary,
  formatSessionWorkflowEvent,
  formatSessionWorkflowSummary,
  formatStartupMcpEvent,
  formatStartupMcpSummary,
  formatWrapperStatusEvent,
  createNarsLifecycleHookDispatcher,
  dispatchNarsLifecycleHook,
  dispatchNarsLifecycleHooksForEvent,
  lifecycleBindingFromArgs,
  lifecycleHookFailureLine,
  main,
};
