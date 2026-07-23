import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanonicalLocalTestSeed, CANONICAL_LOCAL_TEST_IDS, canonicalSha256 } from '@narada2/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));

async function seedIntelligenceRegistry(siteRoot, providerId, endpointBaseUrl) {
  const dbPath = join(siteRoot, '.ai', 'intelligence-registry.db');
  mkdirSync(join(siteRoot, '.ai'), { recursive: true });
  const store = await SqliteRegistryStore.open(dbPath);
  try {
    const now = new Date().toISOString();
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const seed = JSON.parse(JSON.stringify(buildCanonicalLocalTestSeed({
      endpointBaseUrl,
      adapterProtocol: { family: 'openai', operation: 'chat-completions', version: '1' },
      credentialStore: 'env',
      credentialReference: 'OPENAI_API_KEY',
      now,
      validUntil,
    })));
    for (const record of seed.records) {
      const serialized = JSON.stringify(record.document).replaceAll('inference-provider:remote-api', `inference-provider:${providerId}`);
      record.document = JSON.parse(serialized);
      record.record_id = record.document.id;
      if (record.document.schema === 'narada.invokable-intelligence.adapter.v1') {
        record.document.protocol = { family: 'openai', operation: 'chat-completions', version: '1' };
      }
      if (record.document.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1') {
        record.document.topology.nodes = record.document.topology.nodes.map((node) => ({ ...node, required_feasibility: [] }));
        record.document.topology.edges = record.document.topology.edges.map((edge) => ({ ...edge, required_feasibility: [] }));
      }
      if (record.document.schema === 'narada.invokable-intelligence.access-grant.v1') {
        record.document.scope.purposes = [...new Set([...record.document.scope.purposes, 'agent-session'])];
      }
      if (record.document.schema === 'narada.invokable-intelligence.data-governance-requirement.v1') {
        record.document.purposes = [...new Set([...record.document.purposes, 'agent-session'])];
      }
      record.source.digest = canonicalSha256(record.document);
    }
    await store.loadCatalogSeed(seed);
  } finally {
    await store.close();
  }
  Object.assign(process.env, {
    NARADA_INTELLIGENCE_REGISTRY_DB: dbPath,
    NARADA_INTELLIGENCE_TARGET_SITE: CANONICAL_LOCAL_TEST_IDS.targetSite,
    NARADA_INTELLIGENCE_USER_SITE: CANONICAL_LOCAL_TEST_IDS.userSite,
    NARADA_INTELLIGENCE_HOST_SITE: CANONICAL_LOCAL_TEST_IDS.hostSite,
    NARADA_INTELLIGENCE_PRINCIPAL_ID: CANONICAL_LOCAL_TEST_IDS.principal,
    NARADA_INTELLIGENCE_PRINCIPAL_BINDING: JSON.stringify({
      schema: 'narada.intelligence.principal_binding.v1',
      actor: { principal_id: CANONICAL_LOCAL_TEST_IDS.principal, auth_type: 'user-site-session' },
      memberships: [{
        registry: 'site-roster',
        site_id: CANONICAL_LOCAL_TEST_IDS.targetSite,
        role: 'resident',
        evidence_ref: 'evidence:pty-principal-membership',
      }],
      evidence_refs: ['evidence:pty-principal-membership'],
    }),
  });
}

let ptyModule;
try {
  ptyModule = await import('node-pty');
} catch (error) {
  if (process.env.NARADA_AGENT_RUNTIME_PTY_E2E === 'skip') process.exit(0);
  throw new Error(`node-pty unavailable; run pnpm install or set NARADA_AGENT_RUNTIME_PTY_E2E=skip to opt out: ${error?.message ?? error}`);
}

const pty = ptyModule.default ?? ptyModule;

function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error(`runtime_server_pty_e2e_timeout:${label}`));
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    promise.finally(() => { if (timer) clearTimeout(timer); }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`runtime_server_pty_e2e_timeout:${label}`)), timeoutMs);
    }),
  ]);
}

async function runPtyE2E() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-server-pty-e2e-'));
  const provider = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('connection', 'close');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'real pty response' } }] }));
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  provider.unref();
  const providerAddress = provider.address();
  await seedIntelligenceRegistry(siteRoot, 'openai-api', `http://127.0.0.1:${providerAddress.port}`);
  let terminal = null;
  let terminalExited = false;
  let terminalReleased = false;
  let output = '';
  const terminateTerminal = () => {
    if (!terminal || terminalReleased) return;
    terminalReleased = true;
    try { terminal.kill(); } catch {}
  };
  const disposeExitedTerminal = () => {
    if (!terminal || !terminalExited || terminalReleased) return;
    terminalReleased = true;
    // node-pty's normal ConPTY exit leaves its drain worker alive; close the
    // version-pinned handles after exit while keeping public kill() for failures.
    const agent = terminal._agent;
    try { agent?._inSocket?.destroy(); } catch {}
    try { agent?._outSocket?.destroy(); } catch {}
    try { agent?._conoutSocketWorker?.dispose(); } catch {}
  };
  try {
    terminal = pty.spawn(process.execPath, [
      binPath,
      '--no-health',
      '--no-events',
      '--identity', 'narada.test',
      '--session', 'real-pty-e2e',
    ], {
      cwd: packageRoot,
      cols: 100,
      rows: 30,
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        OPENAI_API_KEY: 'real-pty-e2e-key',
        NARADA_AGENT_CLI_COLOR: '0',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });
    terminal.onData((chunk) => {
      output += chunk;
    });
    const exit = new Promise((resolve) => terminal.onExit((event) => {
      terminalExited = true;
      resolve(event);
    }));

    try {
      await waitFor(() => output.includes('operator >'), 7000, 'interactive_prompt');
    } catch (error) {
      throw new Error(`${error.message}\\npty_output:${JSON.stringify(output)}`);
    }
    terminal.write('hello\r');
    await waitFor(() => output.includes('real pty response'), 7000, 'provider_response');
    assert.equal(output.includes('runtime_output_failure'), false);
    assert.equal(output.includes('"method"'), false);

    terminal.write('/exit\r');
    let exitEvent;
    try {
      exitEvent = await withTimeout(exit, 7000, 'runtime_exit');
    } catch (error) {
      throw new Error(`${error.message}\npty_output:${JSON.stringify(output)}`);
    }
    disposeExitedTerminal();
    assert.equal(exitEvent.exitCode, 0, output);
    assert.equal(output.includes('session closed'), true);
  } finally {
    provider.closeAllConnections?.();
    provider.closeIdleConnections?.();
    if (provider.listening) {
      await Promise.race([
        new Promise((resolve) => provider.close(resolve)),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
    if (terminalExited) disposeExitedTerminal();
    else terminateTerminal();
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
}

await runPtyE2E();
console.log('runtime server PTY E2E passed');
