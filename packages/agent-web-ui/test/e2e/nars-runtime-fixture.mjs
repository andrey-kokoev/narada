import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { createSessionCoreRuntimeService } from '@narada2/agent-runtime-server/session-core-runtime-service';
import { createEventHub, startEventStreamProjection, startHealthProjection } from '@narada2/agent-runtime-server/test-fixtures';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { startAgentWebUiServer } from '../../src/server.js';

export function waitFor(predicate, timeoutMs, evidence = () => ({})) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const result = await predicate();
        if (result) {
          resolve(result);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          reject(new Error(JSON.stringify(await evidence())));
          return;
        }
        setTimeout(tick, 50);
      } catch (error) {
        reject(error);
      }
    };
    tick();
  });
}

async function closeServer(server) {
  if (!server?.listening) return;
  await Promise.race([
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ]);
}

export async function startSessionCoreRuntime({
  identity = 'narada.e2e.resident',
  sessionId = 'web-ui-playwright-e2e',
  siteId = 'narada.e2e',
  responseContent = 'web-ui playwright test response',
  toolGateway = null,
  startWeb = true,
  providerDelayMs = 0,
  providerError = null,
  swallowInputFrames = false,
} = {}) {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-web-ui-session-core-'));
  const sessionPaths = resolveNaradaSitePaths({ siteRoot, sessionId });
  mkdirSync(sessionPaths.narsSessionDir, { recursive: true });
  const runtimeInput = new PassThrough();
  let shouldSwallowInputFrames = Boolean(swallowInputFrames);
  let controlInputBuffer = '';
  const outboundFrames = [];
  const inputFrameAttempts = [];
  const controlInput = new Writable({
    write(chunk, encoding, callback) {
      controlInputBuffer += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
      const lines = controlInputBuffer.split(/\r?\n/);
      controlInputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let frame = null;
        try {
          frame = JSON.parse(line);
        } catch {
          // Forward malformed or partial control input to the real runtime.
        }
        if (frame) outboundFrames.push(frame);
        const isOperatorInput = ['session.submit', 'conversation.send', 'conversation.enqueue', 'conversation.steer'].includes(frame?.method);
        const swallowed = shouldSwallowInputFrames && isOperatorInput;
        if (isOperatorInput) inputFrameAttempts.push({ frame, swallowed });
        if (!swallowed) runtimeInput.write(`${line}\n`);
      }
      callback();
    },
  });
  const runtimeOutput = new PassThrough();
  const eventHub = createEventHub();
  const events = [];
  const providerCalls = [];
  let outputBuffer = '';
  let runtimePromise = null;
  let healthProjection = null;
  let eventProjection = null;
  let localWeb = null;
  const runtimeContext = {
    identity,
    session: sessionId,
    siteRoot,
    siteId,
    operatorSurfaceKind: 'agent-web-ui',
    sessionPath: sessionPaths.narsSessionPath,
    eventsPath: sessionPaths.narsEventsPath,
    intelligenceProvider: 'codex-subscription',
    providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
  };
  const gateway = toolGateway ?? {
    toolCatalog: async () => [],
    invoke: async ({ toolName }) => ({ tool_name: toolName, content: 'fixture' }),
    operationalState: () => 'healthy',
    close() {},
  };
  const healthRuntimeContext = { ...runtimeContext, eventHub };
  try {
    healthProjection = await startHealthProjection({
      childStdin: () => runtimeInput,
      host: '127.0.0.1',
      port: 0,
      runtimeContext: healthRuntimeContext,
    });
    eventProjection = await startEventStreamProjection({
      childStdin: () => controlInput,
      eventHub,
      host: '127.0.0.1',
      port: 0,
      eventsPath: runtimeContext.eventsPath,
    });
    const runtimeWithEndpoints = {
      ...runtimeContext,
      healthUrl: healthProjection.url,
      eventStreamUrl: eventProjection.url,
    };
    const service = createSessionCoreRuntimeService({
      runtimeContext: runtimeWithEndpoints,
      invokeIntelligenceFn: async (messages, tools) => {
        providerCalls.push({ messages, tools });
        if (providerDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, providerDelayMs));
        if (providerError) throw new Error(providerError);
        return {
          choices: [{ message: { role: 'assistant', content: responseContent } }],
          fixture: { messages, tools },
        };
      },
      toolGateway: gateway,
    });
    healthRuntimeContext.sessionCore = service.supervisor.core;
    runtimeOutput.setEncoding('utf8');
    runtimeOutput.on('data', (chunk) => {
      outputBuffer += String(chunk);
      const lines = outputBuffer.split(/\r?\n/);
      outputBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        events.push(event);
        healthProjection?.observe(event);
        eventHub.publish(event);
      }
    });
    runtimePromise = service.run({ input: runtimeInput, output: runtimeOutput });
    await waitFor(() => events.some((event) => event.event === 'session_started'), 5_000, () => ({ events: events.map((event) => event.event) }));
    if (startWeb) {
      localWeb = await startAgentWebUiServer({
        host: '127.0.0.1',
        port: 0,
        eventEndpoint: eventProjection.url,
        healthEndpoint: healthProjection.url,
        sessionId,
      });
    }
    return {
      eventProjection,
      eventHub,
      events,
      outboundFrames,
      providerCalls,
      inputFrameAttempts,
      healthProjection,
      localWeb,
      runtimeInput,
      runtimePromise,
      siteRoot,
      sessionId,
      eventsPath: runtimeContext.eventsPath,
      setSwallowInputFrames(value) {
        shouldSwallowInputFrames = Boolean(value);
      },
      get outputText() {
        return outputBuffer;
      },
      async close() {
        await closeServer(this.localWeb?.server);
        runtimeInput.end();
        await Promise.race([runtimePromise, new Promise((resolve) => setTimeout(resolve, 1_000))]);
        await closeServer(healthProjection?.server);
        await closeServer(eventProjection?.server);
        rmSync(siteRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    runtimeInput.destroy();
    await closeServer(localWeb?.server);
    await closeServer(healthProjection?.server);
    await closeServer(eventProjection?.server);
    rmSync(siteRoot, { recursive: true, force: true });
    throw error;
  }
}

export const startSharedRuntime = startSessionCoreRuntime;
