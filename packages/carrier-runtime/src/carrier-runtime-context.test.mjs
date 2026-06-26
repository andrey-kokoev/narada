import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildCarrierRuntimePaths,
  createCarrierRuntimeContext,
} from '../src/carrier-runtime-context.mjs';

function makeTempSiteRoot() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'nars-context-test-'));
  return siteRoot;
}

function cleanupTempSiteRoot(siteRoot) {
  try { rmSync(siteRoot, { recursive: true, force: true }); } catch {}
}

test('buildCarrierRuntimePaths computes canonical paths from siteRoot and session', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const paths = buildCarrierRuntimePaths(siteRoot, 'test-session');
    assert.equal(paths.naradaDir, join(siteRoot, '.narada'));
    assert.equal(paths.sessionDir, join(siteRoot, '.narada', 'crew', 'nars-sessions', 'test-session'));
    assert.equal(paths.sessionPath, join(siteRoot, '.narada', 'crew', 'nars-sessions', 'test-session', 'session.jsonl'));
    assert.equal(paths.eventsPath, join(siteRoot, '.narada', 'crew', 'nars-sessions', 'test-session', 'events.jsonl'));
  } finally {
    cleanupTempSiteRoot(siteRoot);
  }
});

test('createCarrierRuntimeContext leaves codex model unset without explicit model env', () => {
  const originalCodeModel = process.env.CODEX_MODEL;
  const originalNaradaModel = process.env.NARADA_CODEX_MODEL;
  delete process.env.CODEX_MODEL;
  delete process.env.NARADA_CODEX_MODEL;
  try {
    const ctx = createCarrierRuntimeContext({
      identity: 'narada.test',
      session: 'test-session',
    });
    assert.equal(ctx.providerSettings.model, null);
  } finally {
    if (originalCodeModel !== undefined) process.env.CODEX_MODEL = originalCodeModel;
    else delete process.env.CODEX_MODEL;
    if (originalNaradaModel !== undefined) process.env.NARADA_CODEX_MODEL = originalNaradaModel;
    else delete process.env.NARADA_CODEX_MODEL;
  }
});

test('buildCarrierRuntimePaths uses .narada directly when siteRoot basename is .narada', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const naradaDir = join(siteRoot, '.narada');
    const paths = buildCarrierRuntimePaths(naradaDir, 'test-session');
    assert.equal(paths.naradaDir, naradaDir);
  } finally {
    cleanupTempSiteRoot(siteRoot);
  }
});

test('createCarrierRuntimeContext requires identity and session', () => {
  assert.throws(() => createCarrierRuntimeContext({}), /identity is required/);
  assert.throws(() => createCarrierRuntimeContext({ identity: 'narada.test' }), /session is required/);
});

test('createCarrierRuntimeContext constructs without importing agent-cli globals', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const ctx = createCarrierRuntimeContext({
      identity: 'narada.test',
      session: 'test-session',
      siteRoot,
      intelligenceProvider: 'openai',
      providerSettings: { model: 'gpt-4', thinking: 'high', stream: false, goal: 'test-goal' },
      displaySettings: { toolOutputs: false, observerMuted: true },
      operationHeartbeatDirectiveEnabled: true,
      operationHeartbeatDirectiveIntervalMs: 30000,
      operationHeartbeatDirectiveInitialDelayMs: 5000,
      healthUrl: 'http://127.0.0.1:9000/health',
      eventStreamUrl: 'ws://127.0.0.1:9001/events',
    });

    assert.equal(ctx.identity, 'narada.test');
    assert.equal(ctx.session, 'test-session');
    assert.equal(ctx.siteRoot, siteRoot);
    assert.equal(ctx.intelligenceProvider, 'openai');
    assert.equal(ctx.narsDelegatedAuthorityHandoff, null);

    assert.equal(ctx.providerSettings.model, 'gpt-4');
    assert.equal(ctx.providerSettings.thinking, 'high');
    assert.equal(ctx.providerSettings.stream, false);
    assert.equal(ctx.providerSettings.goal, 'test-goal');

    assert.equal(ctx.displaySettings.toolOutputs, false);
    assert.equal(ctx.displaySettings.observerMuted, true);

    assert.equal(ctx.operationHeartbeatDirectiveEnabled, true);
    assert.equal(ctx.operationHeartbeatDirectiveIntervalMs, 30000);
    assert.equal(ctx.operationHeartbeatDirectiveInitialDelayMs, 5000);
    assert.equal(ctx.healthUrl, 'http://127.0.0.1:9000/health');
    assert.equal(ctx.eventStreamUrl, 'ws://127.0.0.1:9001/events');

    assert.equal(ctx.sessionPath, join(siteRoot, '.narada', 'crew', 'nars-sessions', 'test-session', 'session.jsonl'));
    assert.equal(ctx.eventsPath, join(siteRoot, '.narada', 'crew', 'nars-sessions', 'test-session', 'events.jsonl'));

    assert.equal(Object.isFrozen(ctx), true);
    assert.equal(Object.isFrozen(ctx.providerSettings), true);
    assert.equal(Object.isFrozen(ctx.displaySettings), true);
  } finally {
    cleanupTempSiteRoot(siteRoot);
  }
});

test('createCarrierRuntimeContext uses provided explicit paths when both sessionPath and eventsPath are given', () => {
  const ctx = createCarrierRuntimeContext({
    identity: 'narada.test',
    session: 'test-session',
    sessionPath: '/custom/session.jsonl',
    eventsPath: '/custom/events.jsonl',
  });
  assert.equal(ctx.sessionPath, '/custom/session.jsonl');
  assert.equal(ctx.eventsPath, '/custom/events.jsonl');
  assert.equal(ctx.naradaDir, null);
});

test('createCarrierRuntimeContext uses env default for siteRoot when omitted', () => {
  const original = process.env.NARADA_SITE_ROOT;
  process.env.NARADA_SITE_ROOT = '/tmp/narada-env-root';
  try {
    const ctx = createCarrierRuntimeContext({
      identity: 'narada.test',
      session: 'test-session',
    });
    assert.equal(ctx.siteRoot, '/tmp/narada-env-root');
  } finally {
    if (original !== undefined) process.env.NARADA_SITE_ROOT = original;
    else delete process.env.NARADA_SITE_ROOT;
  }
});

