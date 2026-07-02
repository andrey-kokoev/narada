import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admitAiProcessInvocation, runAiProcessInvocationSync, spawnAiProcessInvocation } from './ai-process-invocation.mjs';

function invocation(root) {
  return {
    adapterKind: 'codex',
    projection: 'codex-subscription',
    purpose: 'auth_probe',
    siteRoot: root,
    workspaceRoot: join(root, 'workspace'),
    cwd: root,
    agentId: 'sonar.resident',
    sessionId: 'carrier_test_session',
    threadId: 'thread_test',
    command: 'codex',
    argv: ['exec', '--json', 'Return exactly: ok'],
    env: { OPENAI_API_KEY: 'secret', CODEX_HOME: join(root, '.codex') },
  };
}

test('admits first invocation and refuses duplicate live lease before spawn', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-ai-invocation-'));
  const first = admitAiProcessInvocation(invocation(root), { ownerPid: 123, isPidAlive: (pid) => pid === 123 });
  assert.equal(first.admitted, true);
  const second = admitAiProcessInvocation(invocation(root), { ownerPid: 456, isPidAlive: (pid) => pid === 123 });
  assert.equal(second.admitted, false);
  assert.equal(second.reason, 'duplicate_live_invocation');
  assert.equal(second.existing_invocation.owner_pid, 123);
  assert.equal(second.env.OPENAI_API_KEY, '<redacted>');
  assert.equal(second.key_parts.agent_id, 'sonar.resident');
  assert.equal(second.key_parts.session_id, 'carrier_test_session');
  assert.equal(second.key_parts.thread_id, 'thread_test');
  assert.equal(second.key_parts.workspace_root.endsWith('workspace'), true);
});

test('launch and refusal artifacts are structured, redacted, and actionable', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-ai-invocation-'));
  const first = admitAiProcessInvocation(invocation(root), { ownerPid: 123, isPidAlive: (pid) => pid === 123 });
  const launchArtifact = JSON.parse(readFileSync(first.artifact_path, 'utf8'));
  assert.equal(launchArtifact.schema, 'narada.ai_process_invocation.v1');
  assert.equal(launchArtifact.event, 'launch');
  assert.equal(launchArtifact.lifecycle_state, 'admitted');
  assert.equal(launchArtifact.env.OPENAI_API_KEY, '<redacted>');

  const second = admitAiProcessInvocation(invocation(root), { ownerPid: 456, isPidAlive: (pid) => pid === 123 });
  const refusalArtifact = JSON.parse(readFileSync(second.artifact_path, 'utf8'));
  assert.equal(refusalArtifact.event, 'refusal');
  assert.equal(refusalArtifact.lifecycle_state, 'refused');
  assert.equal(refusalArtifact.reason, 'duplicate_live_invocation');
  assert.equal(refusalArtifact.existing_invocation.owner_pid, 123);
  assert.match(refusalArtifact.cleanup_hint, /Stop the existing invocation/);
  assert.equal(refusalArtifact.env.OPENAI_API_KEY, '<redacted>');
});

test('codex site/session live cap refuses a different command before spawn', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-ai-invocation-'));
  const first = admitAiProcessInvocation(invocation(root), { ownerPid: 123, isPidAlive: (pid) => pid === 123 });
  assert.equal(first.admitted, true);
  const secondInvocation = {
    ...invocation(root),
    purpose: 'provider_request',
    argv: ['exec', '--json', 'Different prompt'],
  };
  const second = admitAiProcessInvocation(secondInvocation, { ownerPid: 456, isPidAlive: (pid) => pid === 123 });
  assert.equal(second.admitted, false);
  assert.equal(second.reason, 'codex_live_invocation_cap_exceeded');
  assert.equal(second.existing_invocations.length, 1);
  assert.match(second.cleanup_hint, /existing Codex invocation/);
});

test('runAiProcessInvocationSync refuses duplicate without calling spawnSync', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-ai-invocation-'));
  admitAiProcessInvocation(invocation(root), { ownerPid: 123, isPidAlive: (pid) => pid === 123 });
  let called = false;
  const result = runAiProcessInvocationSync(invocation(root), {
    ownerPid: 456,
    isPidAlive: (pid) => pid === 123,
    spawnSync: () => { called = true; return { status: 0, signal: null, stdout: '', stderr: '' }; },
  });
  assert.equal(called, false);
  assert.equal(result.status, 1);
  assert.equal(result.error.code, 'ai_process_invocation_refused');
});

test('spawnAiProcessInvocation supports explicit duplicate override', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-ai-invocation-'));
  admitAiProcessInvocation(invocation(root), { ownerPid: 123, isPidAlive: (pid) => pid === 123 });
  let called = false;
  const child = { once() {} };
  const owner = spawnAiProcessInvocation(invocation(root), {
    ownerPid: 456,
    isPidAlive: (pid) => pid === 123,
    allowDuplicate: true,
    spawnProcess: () => { called = true; return { child, terminateTree() {} }; },
  });
  assert.equal(called, true);
  assert.equal(owner.aiProcessInvocation.admitted, true);
});

test('spawnAiProcessInvocation writes exit evidence when the child closes', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-ai-invocation-'));
  let closeHandler = null;
  const child = { once(event, handler) { if (event === 'close') closeHandler = handler; } };
  const owner = spawnAiProcessInvocation(invocation(root), {
    ownerPid: 456,
    isPidAlive: (pid) => pid === 456,
    spawnProcess: () => ({ child, terminateTree() {} }),
  });
  assert.equal(owner.aiProcessInvocation.event, 'launch');
  closeHandler(0, null);
  const artifactDir = join(root, '.ai', 'runtime', 'ai-process-invocation', 'artifacts');
  const exitArtifactName = readdirSync(artifactDir).find((name) => name.includes('-exit-'));
  assert.ok(exitArtifactName);
  const exitArtifact = JSON.parse(readFileSync(join(artifactDir, exitArtifactName), 'utf8'));
  assert.equal(exitArtifact.event, 'exit');
  assert.equal(exitArtifact.lifecycle_state, 'exited');
  assert.equal(exitArtifact.exit_code, 0);
});
