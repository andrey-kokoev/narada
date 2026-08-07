import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildCanonicalLocalTestSeed, CANONICAL_LOCAL_TEST_IDS, canonicalSha256 } from '@narada-core/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada-core/invokable-intelligence-registry';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const runtimeEntrypoint = fileURLToPath(new URL('../dist/bin/narada-agent-runtime-server.js', import.meta.url));
const nativeBinary = join(
  packageRoot,
  '..',
  'native',
  'target',
  'release',
  process.platform === 'win32' ? 'narada-agent-runtime-server-rust.exe' : 'narada-agent-runtime-server-rust',
);

const requests = [
  { id: 'health-1', method: 'session.health', params: {} },
  { id: 'recovery-1', method: 'session.recovery', params: {} },
  { id: 'legacy-1', method: 'session.resume', params: {} },
  { id: 'close-1', method: 'session.close', params: {} },
];

async function seedIntelligenceRegistry(siteRoot: string): Promise<string> {
  const dbPath = join(siteRoot, '.ai', 'intelligence-registry.db');
  await mkdir(join(siteRoot, '.ai'), { recursive: true });
  const store: any = await SqliteRegistryStore.open(dbPath);
  try {
    const now = new Date().toISOString();
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const seed: any = JSON.parse(JSON.stringify(buildCanonicalLocalTestSeed({
      adapterProtocol: { family: 'codex-subscription', operation: 'responses', version: '1' },
      credentialStore: 'none',
      credentialReference: 'codex-subscription-session',
      invocationModelKey: 'gpt-5.5',
      now,
      validUntil,
    })));
    const replacements = new Map([
      ['model-provider:kimi', 'model-provider:openai'],
      ['model:kimi-k2-thinking', 'model:openai-gpt-5.5'],
      ['model-offering:kimi-via-local-api', 'model-offering:gpt-5.5-via-codex-subscription'],
      ['route:kimi-local-api', 'route:gpt-5.5-codex-subscription'],
      ['adapter:openai-compatible-http', 'adapter:codex-subscription'],
      ['inference-endpoint:remote-default', 'inference-endpoint:codex-subscription'],
      ['inference-provider:remote-api', 'inference-provider:codex-subscription'],
      ['local-api', 'codex-subscription'],
      ['Kimi K2 Thinking', 'GPT-5.5'],
      ['model-owner:kimi', 'model-owner:openai'],
    ]);
    for (const record of seed.records) {
      let serialized = JSON.stringify(record.document);
      for (const [from, to] of replacements) serialized = serialized.replaceAll(from, to);
      record.document = JSON.parse(serialized);
      record.record_id = record.document.id;
      if (record.document.schema === 'narada.invokable-intelligence.adapter.v1') {
        record.document.protocol = { family: 'codex-subscription', operation: 'responses', version: '1' };
      }
      if (record.document.schema === 'narada.invokable-intelligence.inference-endpoint.v1') {
        record.document.address = { kind: 'runtime-service', service: 'codex-subscription' };
      }
      if (record.document.schema === 'narada.invokable-intelligence.model-offering.v1') {
        record.document.invocation_model_key = 'gpt-5.5';
      }
      if (record.document.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1') {
        record.document.topology.nodes = record.document.topology.nodes.map((node: any) => ({ ...node, required_feasibility: [] }));
        record.document.topology.edges = record.document.topology.edges.map((edge: any) => ({ ...edge, required_feasibility: [] }));
      }
      if (record.document.schema === 'narada.invokable-intelligence.access-grant.v1') {
        record.document.scope.purposes = [...new Set([...record.document.scope.purposes, 'agent-session'])];
      }
      if (record.document.schema === 'narada.invokable-intelligence.data-governance-requirement.v1') {
        record.document.purposes = [...new Set([...record.document.purposes, 'agent-session'])];
      }
      if (record.document.schema === 'narada.invokable-intelligence.authority-statement.v1') {
        record.authority = {
          ...record.authority,
          locus: record.document.origin.locus,
          site_id: record.document.origin.site_id,
          authority_ref: record.document.origin.authority_ref,
        };
      }
      record.source.digest = canonicalSha256(record.document);
    }
    await store.loadCatalogSeed(seed);
  } finally {
    await store.close();
  }
  return dbPath;
}

function runtimeEnvironment(siteRoot: string, dbPath: string, engine: 'node' | 'rust'): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NARADA_SITE_ROOT: siteRoot,
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
        evidence_ref: 'evidence:runtime-engine-nars-conformance',
      }],
      evidence_refs: ['evidence:runtime-engine-nars-conformance'],
    }),
    NARADA_AUTHORITY_REF: 'task:runtime-engine-nars-conformance',
    NARADA_MCP_SCOPE: 'none',
    NARADA_AGENT_RUNTIME_HEALTH_ENABLED: '0',
    NARADA_AGENT_RUNTIME_EVENTS_ENABLED: '0',
    NARADA_RUNTIME_ENGINE: engine,
    ...(engine === 'rust'
      ? {
          NARADA_RUNTIME_SERVER_SCRIPT: runtimeEntrypoint,
          NARADA_RUNTIME_NODE_COMMAND: process.execPath,
        }
      : {}),
  };
}

async function runEngine(engine: 'node' | 'rust'): Promise<Record<string, any>[]> {
  const siteRoot = await mkdtemp(join(tmpdir(), `narada-runtime-engine-${engine}-`));
  try {
    const dbPath = await seedIntelligenceRegistry(siteRoot);
    const command = engine === 'node' ? process.execPath : nativeBinary;
    const args = [
      ...(engine === 'node' ? [runtimeEntrypoint] : []),
      '--raw-jsonl',
      '--no-health',
      '--no-events',
      '--identity',
      'narada.test',
      '--session',
      `runtime-engine-${engine}`,
    ];
    const child = spawn(command, args, {
      cwd: packageRoot,
      env: runtimeEnvironment(siteRoot, dbPath, engine),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.stdin.end(`${requests.map((request) => JSON.stringify(request)).join('\n')}\n`);
    const exitCode = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`runtime_engine_nars_timeout:${engine}:${stderr.slice(-500)}`));
      }, 20_000);
      child.once('error', reject);
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve(code ?? 1);
      });
    });
    assert.equal(exitCode, 0, `${engine}: ${stderr}`);
    return stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } finally {
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

function semanticTrace(events: Record<string, any>[]): Record<string, any>[] {
  return events.map((event) => ({
    event: event.event,
    request_id: event.request_id ?? null,
    method: event.method ?? null,
    runtime_host_state: event.runtime_host_state?.runtime_host_state ?? null,
    mcp_scope: event.mcp_scope ?? null,
    mcp_operational_state: event.mcp_operational_state ?? null,
    terminal_state: event.terminal_state ?? null,
    reason: event.reason ?? null,
  }));
}

test('Rust runs the real NARS entrypoint with Node-equivalent session authority and control semantics', {
  skip: !existsSync(nativeBinary),
  timeout: 45_000,
}, async () => {
  const [nodeEvents, rustEvents] = await Promise.all([runEngine('node'), runEngine('rust')]);
  assert.deepEqual(semanticTrace(rustEvents), semanticTrace(nodeEvents));
  assert.equal(nodeEvents[0]?.runtime_engine_kind, 'node');
  assert.equal(rustEvents[0]?.runtime_engine_kind, 'rust');
  assert.equal(rustEvents[0]?.event, 'session_started');
  assert.equal(rustEvents[0]?.mcp_scope, 'none');
  assert.equal(rustEvents[0]?.mcp_operational_state, 'disabled');
  assert.equal(rustEvents.some((event) => event.event === 'session_health' && event.request_id === 'health-1'), true);
  assert.equal(rustEvents.some((event) => event.event === 'session_recovery' && event.request_id === 'recovery-1'), true);
  assert.equal(rustEvents.some((event) => event.event === 'session_control_rejected' && event.request_id === 'legacy-1'), true);
  assert.equal(rustEvents.some((event) => event.event === 'session_closed' && event.request_id === 'close-1'), true);
});
