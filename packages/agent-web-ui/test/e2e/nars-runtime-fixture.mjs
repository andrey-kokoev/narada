import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { createEventHub, startEventStreamProjection, startHealthProjection } from '@narada2/agent-runtime-server';
import { createCarrierRuntimeContext } from '../../../carrier-runtime/src/carrier-runtime-context.mjs';
import { createCarrierRuntimeDependencies } from '../../../carrier-runtime/src/runtime-dependencies.mjs';
import { runCarrierServerMode } from '../../../carrier-runtime/src/server-mode.mjs';
import { writeFixtureMcpSurface } from '../../../carrier-runtime/src/server-mode-test-helpers.mjs';
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
  await Promise.race([
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ]);
}

export async function startSharedRuntime() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-agent-web-ui-playwright-'));
  mkdirSync(siteRoot, { recursive: true });
  writeFixtureMcpSurface(siteRoot);
  const envPatch = {
    OPENAI_API_KEY: 'fixture-openai-key',
    ANTHROPIC_API_KEY: 'fixture-anthropic-key',
    KIMI_API_KEY: 'fixture-kimi-key',
    KIMI_CODE_API_KEY: 'fixture-kimi-code-key',
    DEEPSEEK_API_KEY: 'fixture-deepseek-key',
    GLM_API_KEY: 'fixture-glm-key',
    OPENROUTER_API_KEY: 'fixture-openrouter-key',
  };
  const envSnapshot = new Map(Object.keys(envPatch).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(envPatch)) process.env[key] = value;
  const eventHub = createEventHub();
  const runtimeInput = new PassThrough();
  const runtimeOutput = new PassThrough();
  const events = [];
  let outputBuffer = '';

  const runtimeContext = createCarrierRuntimeContext({
    identity: 'narada.e2e.resident',
    session: 'web-ui-playwright-e2e',
    siteRoot,
    siteId: 'narada.e2e',
    operatorSurfaceKind: 'agent-web-ui',
    sessionPath: join(siteRoot, 'session.jsonl'),
    eventsPath: join(siteRoot, 'events.jsonl'),
    intelligenceProvider: 'codex-subscription',
    providerSettings: { provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'medium', stream: false },
  });
  const fullRuntimeContext = {
    ...runtimeContext,
    env: { ...envPatch },
  };

  const healthProjection = await startHealthProjection({
    childStdin: () => runtimeInput,
    host: '127.0.0.1',
    port: 0,
    runtimeContext: { ...fullRuntimeContext, eventHub },
  });
  const eventProjection = await startEventStreamProjection({
    childStdin: () => runtimeInput,
    eventHub,
    host: '127.0.0.1',
    port: 0,
    eventsPath: runtimeContext.eventsPath,
  });
  const runtimeWithEndpoints = { ...fullRuntimeContext, healthUrl: healthProjection.url, eventStreamUrl: eventProjection.url };
  const { dependencies } = createCarrierRuntimeDependencies({ runtimeContext: runtimeWithEndpoints });

  runtimeOutput.setEncoding('utf8');
  runtimeOutput.on('data', (chunk) => {
    outputBuffer += String(chunk);
    const lines = outputBuffer.split(/\r?\n/);
    outputBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      events.push(event);
      healthProjection.observe(event);
      eventHub.publish(event);
    }
  });

  const runtimePromise = runCarrierServerMode({
    input: runtimeInput,
    output: runtimeOutput,
    callChatApiFn: async () => ({ choices: [{ message: { role: 'assistant', content: 'web-ui playwright test response' } }] }),
    runtimeContext: runtimeWithEndpoints,
    dependencies: { ...dependencies, readMcpPreflightArtifact: () => null },
  });

  await waitFor(() => events.some((event) => event.event === 'session_started'), 5_000, () => ({ events: events.map((event) => event.event) }));

  const localWeb = await startAgentWebUiServer({
    host: '127.0.0.1',
    port: 0,
    eventEndpoint: eventProjection.url,
    healthEndpoint: healthProjection.url,
  });

  return {
    eventProjection,
    events,
    healthProjection,
    localWeb,
    runtimeInput,
    runtimePromise,
    siteRoot,
    get outputText() {
      return outputBuffer;
    },
    async close() {
      runtimeInput.end();
      await Promise.race([runtimePromise, new Promise((resolve) => setTimeout(resolve, 1_000))]);
      await closeServer(localWeb.server);
      await closeServer(healthProjection.server);
      await closeServer(eventProjection.server);
      for (const [key, value] of envSnapshot.entries()) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(siteRoot, { recursive: true, force: true });
    },
  };
}
