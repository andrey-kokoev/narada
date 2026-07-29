import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readNarsEventLog } from './event-log.js';
import { createNarsSessionCore } from './session-core.js';
import {
  NARS_SURFACE_ATTACHMENT_REFUSAL_CODES,
  canTransitionNarsSurfaceAttachment,
  createNarsSurfaceAttachment,
  createNarsSurfaceAttachmentRefusal,
  summarizeNarsSurfaceAttachments,
  transitionNarsSurfaceAttachment,
} from './surface-attachment.js';
import {
  listNarsSurfaceAttachments,
  narsSurfaceAttachmentRegistryPathFromSessionPath,
  readNarsSurfaceAttachmentRegistry,
  registerNarsSurfaceAttachment,
  transitionNarsSurfaceAttachmentInRegistry,
} from './surface-attachment-registry.js';

const NOW = '2026-07-28T00:00:00.000Z';
const LATER = '2026-07-28T00:00:01.000Z';

function attachment() {
  return createNarsSurfaceAttachment({
    attachment_id: 'attachment_web_1',
    session_id: 'carrier_test',
    authority_runtime_id: 'local-nars:carrier_test',
    surface_kind: 'agent-web-ui',
    surface_instance_id: 'browser-tab-1',
    event_endpoint: 'ws://127.0.0.1/events',
    health_endpoint: 'http://127.0.0.1/health',
    attach_source: 'discovery',
    view_policy: 'conversation',
    permission_set: ['session.events.read', 'session.submit'],
    now: NOW,
  });
}

test('SurfaceAttachment keeps lifecycle separate from transport health', () => {
  const requested = attachment();
  assert.equal(requested.attachment_state, 'requested');
  assert.equal(requested.health_state, 'unknown');
  const attached = transitionNarsSurfaceAttachment(requested, 'discovering', { now: LATER, reason: 'session_selected' }).record;
  const probing = transitionNarsSurfaceAttachment(attached, 'probing_health', { now: LATER, reason: 'endpoints_resolved' }).record;
  const live = transitionNarsSurfaceAttachment(probing, 'attached', { now: LATER, health_state: 'healthy' }).record;
  const degraded = transitionNarsSurfaceAttachment(live, 'stale', { now: LATER, health_state: 'degraded', reason: 'heartbeat_gap' }).record;
  assert.equal(degraded.attachment_state, 'stale');
  assert.equal(degraded.health_state, 'degraded');
  assert.equal(degraded.attached_at, LATER);
  assert.equal(canTransitionNarsSurfaceAttachment('stale', 'reconnecting'), true);
  assert.equal(canTransitionNarsSurfaceAttachment('detached', 'attached'), false);
});

test('SurfaceAttachment refusal is structured and bounded', () => {
  const refusal = createNarsSurfaceAttachmentRefusal({
    code: NARS_SURFACE_ATTACHMENT_REFUSAL_CODES.SESSION_AMBIGUOUS,
    message: 'More than one session matched the requested agent.',
    surfaceKind: 'agent-cli',
    candidates: [{ session_id: 'carrier_a' }, { session_id: 'carrier_b' }],
  });
  assert.equal(refusal.schema, 'narada.nars.surface_attachment_refusal.v1');
  assert.equal(refusal.code, 'surface_attachment_session_ambiguous');
  assert.equal(refusal.candidates.length, 2);
});

test('SurfaceAttachment registry survives rehydration and rejects mismatched sessions', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-surface-attachment-'));
  const sessionPath = join(root, 'session.jsonl');
  try {
    const created = registerNarsSurfaceAttachment({ sessionPath, sessionId: 'carrier_test', attachment: attachment(), now: NOW });
    transitionNarsSurfaceAttachmentInRegistry({
      sessionPath,
      sessionId: 'carrier_test',
      attachmentId: created.attachment_id,
      nextState: 'discovering',
      evidence: { now: LATER, reason: 'socket_opened' },
    });
    const registry = readNarsSurfaceAttachmentRegistry({ sessionPath, sessionId: 'carrier_test', now: LATER });
    assert.equal(registry.attachments[0]?.attachment_state, 'discovering');
    assert.equal(listNarsSurfaceAttachments({ sessionPath, sessionId: 'carrier_test' }).length, 1);
    assert.match(readFileSync(narsSurfaceAttachmentRegistryPathFromSessionPath(sessionPath), 'utf8'), /surface_attachment_registry\.v1/);
    assert.throws(() => readNarsSurfaceAttachmentRegistry({ sessionPath, sessionId: 'other' }), /does not match/);
    assert.deepEqual(summarizeNarsSurfaceAttachments(registry.attachments).health_counts, {
      unknown: 1,
      healthy: 0,
      degraded: 0,
      unavailable: 0,
      stale: 0,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('NARS session core owns attachment events, health, and recovery projection', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-surface-attachment-core-'));
  const sessionPath = join(root, 'session.json');
  const eventsPath = join(root, 'events.jsonl');
  try {
    const core = createNarsSessionCore({
      sessionId: 'carrier_core',
      sessionPath,
      eventsPath,
      now: () => NOW,
    });
    const registered = core.registerSurfaceAttachment(createNarsSurfaceAttachment({
      attachment_id: 'attachment_core_1',
      session_id: 'carrier_core',
      authority_runtime_id: 'local-nars:carrier_core',
      surface_kind: 'agent-web-ui',
      surface_instance_id: 'browser-tab-core',
      event_endpoint: 'ws://127.0.0.1/core-events',
      health_endpoint: 'http://127.0.0.1/core-health',
      attach_source: 'discovery',
      now: NOW,
    }));
    const transitioned = core.transitionSurfaceAttachment(registered.attachment_id, 'discovering', {
      now: LATER,
      reason: 'socket_opened',
    });
    assert.equal(transitioned.record.attachment_state, 'discovering');
    assert.equal(core.healthSnapshot().surface_attachment_summary.count, 1);
    assert.equal(core.healthSnapshot().surface_attachment_summary.reconnecting_count, 0);
    assert.equal(core.recoverySnapshot().surface_attachments.attachments[0]?.attachment_state, 'discovering');
    const events = readNarsEventLog(eventsPath).events;
    assert.equal(events.filter((event) => event.event === 'session_surface_attachment_state_transition').length, 2);
    const lastEvent = events.at(-1) as Record<string, unknown> | undefined;
    const lastAttachment = lastEvent?.surface_attachment as Record<string, unknown> | undefined;
    assert.equal(lastAttachment?.attachment_id, 'attachment_core_1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
