import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RUNTIME_HANDLE_KINDS,
  buildFixtureRuntimeHandle,
  buildLocalProcessRuntimeHandle,
  buildMcpSessionRuntimeHandle,
  buildMissingRuntimeHandle,
  validateRuntimeHandle,
} from './runtime-handle.mjs';

function assertBoundedNonAuthority(handle) {
  assert.equal(handle.raw_transcript_recorded, false);
  assert.equal(handle.raw_prompt_recorded, false);
  assert.equal(handle.raw_provider_output_recorded, false);
  assert.equal(handle.raw_secret_values_recorded, false);
  assert.equal(handle.task_lifecycle_authority_granted, false);
  assert.equal(handle.inbox_authority_granted, false);
  assert.equal(handle.outbox_authority_granted, false);
  assert.equal(handle.effect_authority_granted, false);
  assert.equal(handle.publication_authority_granted, false);
  assert.equal(handle.identity_authority_granted, false);
  assert.equal(handle.capability_authority_granted, false);
  assert.deepEqual(validateRuntimeHandle(handle), []);
}

test('runtime handle schema covers fixture local process MCP session and missing states', () => {
  assert.deepEqual(RUNTIME_HANDLE_KINDS, ['fixture', 'local_process', 'mcp_session', 'missing']);

  const fixture = buildFixtureRuntimeHandle({
    handleId: 'runtime:fixture:test',
    startedAt: '2026-05-16T03:00:00.000Z',
    heartbeatDueAt: '2026-05-16T03:05:00.000Z',
  });
  const process = buildLocalProcessRuntimeHandle({
    processPid: 12345,
    startedAt: '2026-05-16T03:00:00.000Z',
    heartbeatDueAt: '2026-05-16T03:05:00.000Z',
    checkedAt: '2026-05-16T03:01:00.000Z',
  });
  const mcp = buildMcpSessionRuntimeHandle({
    sessionId: 'mcp-session-1',
    startedAt: '2026-05-16T03:00:00.000Z',
    heartbeatDueAt: '2026-05-16T03:05:00.000Z',
  });
  const missing = buildMissingRuntimeHandle({ checkedAt: '2026-05-16T03:01:00.000Z' });

  assert.equal(fixture.kind, 'fixture');
  assert.equal(fixture.handle_present, true);
  assert.equal(process.kind, 'local_process');
  assert.equal(process.process.present, true);
  assert.equal(process.process.pid, 12345);
  assert.equal(mcp.kind, 'mcp_session');
  assert.equal(mcp.session.present, true);
  assert.equal(mcp.session.session_id, 'mcp-session-1');
  assert.equal(missing.kind, 'missing');
  assert.equal(missing.handle_present, false);
  for (const handle of [fixture, process, mcp, missing]) assertBoundedNonAuthority(handle);
});

test('runtime handle evidence is bounded and omits raw transcripts secrets and values', () => {
  const handle = buildMcpSessionRuntimeHandle({
    sessionId: 'mcp-session-secret-input',
    reachable: false,
    checkedAt: '2026-05-16T03:01:00.000Z',
    evidenceRefs: ['supervisor:start'],
  });
  const text = JSON.stringify(handle);

  assert.equal(handle.reachability_summary.status, 'unreachable');
  assert.equal(handle.reachability_summary.values_omitted, true);
  assert.deepEqual(handle.reachability_summary.evidence_refs, ['supervisor:start']);
  assert.doesNotMatch(text, /raw transcript|provider output|sk-testsecretvalue/);
  assertBoundedNonAuthority(handle);
});

test('runtime liveness validation rejects authority and raw-value claims', () => {
  const bad = {
    ...buildLocalProcessRuntimeHandle({ processPid: 999 }),
    raw_secret_values_recorded: true,
    task_lifecycle_authority_granted: true,
  };

  assert.deepEqual(validateRuntimeHandle(bad), [
    'raw_secret_values_recorded_must_be_false',
    'task_lifecycle_authority_granted_must_be_false',
  ]);
}
);
