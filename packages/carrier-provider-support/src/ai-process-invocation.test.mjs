import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
  assert.equal(launchArtifact.schema, 'narada.ai_process_invocation.v2');
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

test('codex runtime-session live cap refuses a different command before spawn', () => {
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

test('runtime-session scope allows a live Codex invocation in a different session', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-ai-invocation-'));
  const first = admitAiProcessInvocation(invocation(root), { ownerPid: 123, isPidAlive: (pid) => pid === 123 || pid === 456 });
  assert.equal(first.admitted, true);
  const second = admitAiProcessInvocation({
    ...invocation(root),
    sessionId: 'carrier_other_session',
    purpose: 'provider_request',
  }, {
    ownerPid: 456,
    isPidAlive: (pid) => pid === 123 || pid === 456,
  });
  assert.equal(second.admitted, true);
  assert.equal(second.invocation_scope.runtime_session_id, 'carrier_other_session');
});

test('PID reuse with a different process-start identity is reported as unverified and does not block admission', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-ai-invocation-'));
  const invocationRoot = join(root, '.ai', 'runtime', 'ai-process-invocation');
  const leaseDir = join(invocationRoot, 'leases');
  const processDir = join(invocationRoot, 'processes');
  mkdirSync(leaseDir, { recursive: true });
  mkdirSync(processDir, { recursive: true });
  writeFileSync(join(processDir, '123.json'), JSON.stringify({
    schema: 'narada.ai_process_process_identity.v1',
    pid: 123,
    start_identity: 'process-start-new',
  }));
  writeFileSync(join(leaseDir, 'reused-pid.json'), JSON.stringify({
    schema: 'narada.ai_process_invocation.v2',
    id: 'reused-pid',
    owner_pid: 123,
    owner_process_start_identity: 'process-start-old',
    adapter_kind: 'codex',
    site_root: root,
    invocation_scope: {
      schema: 'narada.ai_process_invocation_scope.v1',
      kind: 'narada_runtime_session',
      site_root: root,
      runtime_session_id: 'carrier_test_session',
    },
    admitted: true,
  }));

  const admitted = admitAiProcessInvocation(invocation(root), {
    ownerPid: 456,
    isPidAlive: (pid) => pid === 123 || pid === 456,
  });
  assert.equal(admitted.admitted, true);
  assert.equal(admitted.admission_diagnostics.unverified_live_invocation_count, 1);
});

test('legacy live leases are reported as unverified and do not block a scoped admission', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-ai-invocation-'));
  const leaseDir = join(root, '.ai', 'runtime', 'ai-process-invocation', 'leases');
  mkdirSync(leaseDir, { recursive: true });
  writeFileSync(join(leaseDir, 'legacy.json'), JSON.stringify({
    schema: 'narada.ai_process_invocation.v1',
    id: 'legacy-live',
    owner_pid: 999,
    adapter_kind: 'codex',
    site_root: root,
    invocation_scope: null,
    admitted: true,
  }));
  const admitted = admitAiProcessInvocation(invocation(root), {
    ownerPid: 123,
    isPidAlive: (pid) => pid === 123 || pid === 999,
  });
  assert.equal(admitted.admitted, true);
  assert.equal(admitted.admission_diagnostics.unverified_live_invocation_count, 1);
});

test('Codex admission refuses when the runtime-session scope is absent', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-ai-invocation-'));
  const refused = admitAiProcessInvocation({ ...invocation(root), sessionId: null }, {
    ownerPid: 123,
    isPidAlive: () => true,
  });
  assert.equal(refused.admitted, false);
  assert.equal(refused.reason, 'invocation_scope_missing');
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
  assert.equal(owner.aiProcessInvocation.lifecycle_state, 'spawned');
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
  assert.equal(owner.aiProcessInvocation.event, 'spawn');
  closeHandler(0, null);
  const artifactDir = join(root, '.ai', 'runtime', 'ai-process-invocation', 'artifacts');
  const exitArtifactName = readdirSync(artifactDir).find((name) => name.includes('-exit-'));
  assert.ok(exitArtifactName);
  const exitArtifact = JSON.parse(readFileSync(join(artifactDir, exitArtifactName), 'utf8'));
  assert.equal(exitArtifact.event, 'exit');
  assert.equal(exitArtifact.lifecycle_state, 'exited');
  assert.equal(exitArtifact.exit_code, 0);
  assert.equal(owner.aiProcessInvocation.lifecycle_state, 'released');
});
