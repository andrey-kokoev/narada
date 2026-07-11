import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNarsSessionCore } from './session-core.mjs';

test('session core owns journal sequencing, queue persistence, artifacts, health, and recovery', async () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'nars-session-core-'));
  const sessionDirectory = join(siteRoot, '.narada', 'crew', 'nars-sessions', 'session_core_test');
  const sessionPath = join(sessionDirectory, 'session.jsonl');
  const eventsPath = join(sessionDirectory, 'events.jsonl');
  const artifactPath = join(siteRoot, 'briefing.txt');
  writeFileSync(artifactPath, 'NARS session core artifact\n', 'utf8');
  try {
    const core = createNarsSessionCore({
      sessionId: 'session_core_test',
      agentId: 'narada.test',
      sessionPath,
      eventsPath,
      siteRoot,
      now: () => '2026-07-10T00:00:00.000Z',
    });
    assert.equal(core.lifecycleState, 'starting');
    assert.equal(core.transition('ready').event_sequence, 1);
    assert.equal(core.appendEvent({ event: 'assistant_message', content: 'ready' }).event_sequence, 2);

    const queue = core.createQueue({ drain: async () => ({ terminal_state: 'completed' }) });
    await queue.enqueue({ source: 'programmatic_operator', content: 'queued' });
    assert.equal(core.recoverySnapshot().operator_input_queue.pending_count, 1);

    const artifact = core.registerArtifact({ sourcePath: artifactPath, kind: 'text', title: 'Briefing' });
    assert.equal(artifact.public_record.source_path, undefined);
    assert.equal(core.healthSnapshot({ mcpOperationalState: 'healthy' }).lifecycle_state, 'ready');

    core.transition('closing');
    core.transition('closed');
    assert.equal(core.lifecycleState, 'closed');
    assert.throws(() => core.appendEvent({ event: 'late_event' }), /nars_session_closed/);
    const persisted = readFileSync(eventsPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.deepEqual(persisted.map((event) => event.event_sequence), [1, 2, 3, 4, 5, 6]);
    assert.equal(core.recoverySnapshot().artifacts.artifacts.length, 1);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('provider completion without queue completion evidence leaves one durable replay', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-crash-window-'));
  const sessionPath = join(root, 'session.json');
  const eventsPath = join(root, 'events.jsonl');
  try {
    const first = createNarsSessionCore({ sessionId: 'crash-window-1', sessionPath, eventsPath, siteRoot: root });
    first.transition('ready');
    let providerCompletions = 0;
    const queue = first.createQueue({
      drain: async () => { providerCompletions += 1; return { terminal_state: 'completed' }; },
      appendSessionFn: (event) => {
        if (event.event === 'input_event_completed') throw new Error('crash_before_queue_completion_evidence');
        return first.appendEvent(event);
      },
    });
    await assert.rejects(
      queue.enqueue({ event_id: 'input_crash_window', content: 'finish then crash' }, { drain: true }),
      /crash_before_queue_completion_evidence/,
    );
    assert.equal(providerCompletions, 1);
    assert.equal(first.recoverySnapshot().operator_input_queue.pending_count, 1);

    const second = createNarsSessionCore({ sessionId: 'crash-window-1', sessionPath, eventsPath, siteRoot: root });
    let replayCount = 0;
    const recoveredQueue = second.createQueue({ drain: async () => { replayCount += 1; return { terminal_state: 'completed' }; } });
    await recoveredQueue.drainUntilIdle();
    assert.equal(replayCount, 1);
    assert.equal(second.recoverySnapshot().operator_input_queue.pending_count, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recovery tolerates corrupt queue state and truncated event journal lines', () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-corrupt-recovery-'));
  const sessionPath = join(root, 'session.json');
  const eventsPath = join(root, 'events.jsonl');
  try {
    writeFileSync(eventsPath, `${JSON.stringify({ event: 'durable', event_sequence: 7, sequence: 7 })}\n{"event":`, 'utf8');
    writeFileSync(join(root, 'operator-input-queue.json'), '{"schema":"truncated"', 'utf8');
    const core = createNarsSessionCore({ sessionId: 'corrupt-recovery-1', sessionPath, eventsPath, siteRoot: root });
    const recovery = core.recoverySnapshot();
    assert.equal(recovery.event_count, 1);
    assert.equal(recovery.corrupt_event_line_count, 1);
    assert.equal(recovery.operator_input_queue.corrupt, true);
    assert.equal(recovery.operator_input_queue.pending_count, 0);
    assert.equal(core.appendEvent({ event: 'after_recovery' }).event_sequence, 8);
    assert.equal(core.createQueue({ drain: async () => ({}) }).pendingCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recreated session core preserves queued input and continues durable event sequencing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nars-session-recovery-'));
  const sessionPath = join(root, 'session.json');
  const eventsPath = join(root, 'events.jsonl');
  try {
    const first = createNarsSessionCore({ sessionId: 'recover-1', sessionPath, eventsPath, siteRoot: root });
    first.transition('ready');
    const queue = first.createQueue({ drain: async () => ({ terminal_state: 'completed' }) });
    await queue.enqueue({ content: 'resume me' });
    const second = createNarsSessionCore({ sessionId: 'recover-1', sessionPath, eventsPath, siteRoot: root });
    assert.equal(second.recoverySnapshot().operator_input_queue.pending_count, 1);
    assert.equal(second.appendEvent({ event: 'recovery_observed' }).event_sequence, 3);
    const events = readFileSync(eventsPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.deepEqual(events.map((event) => event.event_sequence), [1, 2, 3]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
