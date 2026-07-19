import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  authorityTransitionStatePathFromSessionPath,
  beginSourceDrain,
  planTargetAuthorityTransition,
  prepareTargetAuthority,
  sealSourceAuthority,
} from '@narada2/nars-session-core/authority-transition-state';
import { createCloudflareNarsAuthorityService } from '../src/index.js';

const now = '2026-07-19T00:00:00.000Z';
const SOURCE_EPOCH = 1;
const TARGET_EPOCH = 2;
const SOURCE_LAST_SEQUENCE = 7;

function driveLocalSourceToSealed(root: string) {
  const sessionPath = join(root, 'sessions', 'carrier_local_1', 'session.jsonl');
  const path = authorityTransitionStatePathFromSessionPath(sessionPath);
  const plan = planTargetAuthorityTransition({
    sourceAuthorityRuntimeHost: 'local',
    currentSiteRoot: root,
    currentSessionId: 'carrier_local_1',
    targetAuthorityLocator: { kind: 'cloudflare-host', site_id: 'narada.test', session_id: 'cf_transition_1' },
  });
  expect(plan.status).toBe('ready');
  expect(plan.direction).toBe('local_to_cloudflare-host');
  const prepared = prepareTargetAuthority({
    path,
    sessionPath,
    targetAuthorityLocator: plan.target_authority_locator,
    transitionPlan: plan as unknown as Record<string, unknown>,
    reason: 'task_2114_harness',
    now: new Date(now),
  });
  expect(prepared.authority_transition_state).toBe('preparing_target');
  const draining = beginSourceDrain({ path, sessionPath, reason: 'task_2114_harness', now: new Date(now) });
  expect(draining.source_write_admission).toBe('draining');
  const sealed = sealSourceAuthority({ path, sessionPath, sourceLastSequence: SOURCE_LAST_SEQUENCE, reason: 'task_2114_harness', now: new Date(now) });
  expect(sealed.source_write_admission).toBe('sealed');
  expect(sealed.source_last_sequence).toBe(SOURCE_LAST_SEQUENCE);
  return sealed;
}

describe('authority host transition target activation', () => {
  test('prepared target refuses input until activated and reports transition state in health', async () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 20 });
    const prepared = service.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_transition_1',
      source_authority_runtime: { authority_runtime_id: 'auth_local_carrier_local_1', authority_epoch: SOURCE_EPOCH },
      now,
    });
    expect(prepared.status).toBe('prepared');
    expect(prepared.session!.transition_state).toBe('target_prepared');
    expect(prepared.session!.authority_epoch).toBe(SOURCE_EPOCH);

    const refused = await service.submitInput({ session_id: 'cf_transition_1', method: 'conversation.send', payload: { message: 'too early' }, now });
    expect(refused).toMatchObject({ status: 'refused', code: 'target_not_activated' });

    const health = service.readHealth('cf_transition_1');
    expect(health.status).toBe('healthy');
    expect(health.transition_state).toBe('target_prepared');
    expect(health.authority_epoch).toBe(SOURCE_EPOCH);
  });

  test('local source driven to sealed activates the cloudflare target at the replay boundary with epoch token', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nars-transition-harness-'));
    try {
      const sealed = driveLocalSourceToSealed(root);
      const service = createCloudflareNarsAuthorityService({ max_events: 20 });
      service.prepareTransitionTarget({
        site_id: 'narada.test',
        agent_id: 'cloudflare.resident',
        session_id: 'cf_transition_1',
        source_authority_runtime: { authority_runtime_id: 'auth_local_carrier_local_1', authority_epoch: SOURCE_EPOCH },
        now,
      });
      const activated = service.activateTransitionTarget({
        session_id: 'cf_transition_1',
        authority_epoch_token: { source_authority_epoch: SOURCE_EPOCH, target_authority_epoch: TARGET_EPOCH },
        source_seal: { sealed_at: String(sealed.sealed_at), source_last_sequence: Number(sealed.source_last_sequence) },
        target_first_sequence: SOURCE_LAST_SEQUENCE + 1,
        now,
      });
      expect(activated).toMatchObject({
        status: 'activated',
        session_id: 'cf_transition_1',
        authority_epoch: TARGET_EPOCH,
        target_first_sequence: SOURCE_LAST_SEQUENCE + 1,
      });

      const replay = service.readEvents({ session_id: 'cf_transition_1' });
      expect(replay.status).toBe('ok');
      expect(replay.events.map((event) => event.event_sequence)).toEqual([
        SOURCE_LAST_SEQUENCE + 1,
        SOURCE_LAST_SEQUENCE + 2,
        SOURCE_LAST_SEQUENCE + 3,
      ]);
      expect(replay.events.map((event) => event.payload.event)).toEqual([
        'authority_target_prepared',
        'authority_target_active',
        'session_started',
      ]);
      const activeEvent = replay.events[1];
      expect(activeEvent.payload.authority_epoch_token).toEqual({ source_authority_epoch: SOURCE_EPOCH, target_authority_epoch: TARGET_EPOCH });
      expect(activeEvent.payload.target_first_sequence).toBe(SOURCE_LAST_SEQUENCE + 1);

      const health = service.readHealth('cf_transition_1');
      expect(health.transition_state).toBe('target_active');
      expect(health.authority_epoch).toBe(TARGET_EPOCH);
      expect(health.runtime_surface_contract!.authority.authority_epoch).toBe(TARGET_EPOCH);

      const admitted = await service.submitInput({ session_id: 'cf_transition_1', method: 'conversation.send', payload: { message: 'post-transfer input' }, now });
      expect(admitted.status).toBe('admitted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('activation without seal evidence or epoch token is durably refused and preserves prepared state', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 20 });
    service.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_transition_2',
      source_authority_runtime: { authority_runtime_id: 'auth_local_carrier_local_1', authority_epoch: SOURCE_EPOCH },
      now,
    });
    const refused = service.activateTransitionTarget({ session_id: 'cf_transition_2', now });
    expect(refused.status).toBe('refused');
    expect(refused.code).toBe('target_activation_refused');
    expect(refused.missing).toEqual(expect.arrayContaining(['authority_epoch_token', 'source_seal_evidence', 'target_first_sequence']));
    const health = service.readHealth('cf_transition_2');
    expect(health.transition_state).toBe('target_prepared');
    const snapshot = service.snapshot();
    const transition = snapshot.sessions.find((session) => session.session_id === 'cf_transition_2')?.authority_transition;
    expect(transition?.refusals).toHaveLength(1);
    expect(transition?.refusals[0].code).toBe('target_activation_evidence_missing');
  });

  test('activation refuses epoch-order and replay-boundary violations', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 20 });
    service.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_transition_3',
      source_authority_runtime: { authority_runtime_id: 'auth_local_carrier_local_1', authority_epoch: SOURCE_EPOCH },
      now,
    });
    const epochViolation = service.activateTransitionTarget({
      session_id: 'cf_transition_3',
      authority_epoch_token: { source_authority_epoch: 2, target_authority_epoch: 2 },
      source_seal: { sealed_at: now, source_last_sequence: SOURCE_LAST_SEQUENCE },
      target_first_sequence: SOURCE_LAST_SEQUENCE + 1,
      now,
    });
    expect(epochViolation.missing).toContain('authority_epoch_order');

    const boundaryViolation = service.activateTransitionTarget({
      session_id: 'cf_transition_3',
      authority_epoch_token: { source_authority_epoch: SOURCE_EPOCH, target_authority_epoch: TARGET_EPOCH },
      source_seal: { sealed_at: now, source_last_sequence: SOURCE_LAST_SEQUENCE },
      target_first_sequence: SOURCE_LAST_SEQUENCE + 2,
      now,
    });
    expect(boundaryViolation.missing).toContain('target_first_sequence_boundary');
    expect(service.readHealth('cf_transition_3').transition_state).toBe('target_prepared');
  });

  test('cloudflare-host as a transition source is durably refused (direction not implemented)', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 20 });
    const refusal = service.refuseTransitionSource({ session_id: 'cf_any', reason: null, now });
    expect(refusal).toMatchObject({
      status: 'refused',
      code: 'transition_direction_refused',
      direction: 'cloudflare_host_to_local',
    });
    expect(String(refusal.reason)).toContain('not implemented');
  });

  test('prepared transition state survives snapshot/load and can still activate', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 20 });
    service.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_transition_4',
      source_authority_runtime: { authority_runtime_id: 'auth_local_carrier_local_1', authority_epoch: SOURCE_EPOCH },
      now,
    });
    const restored = createCloudflareNarsAuthorityService({ max_events: 20, initial_state: service.snapshot() });
    expect(restored.readHealth('cf_transition_4').transition_state).toBe('target_prepared');
    const activated = restored.activateTransitionTarget({
      session_id: 'cf_transition_4',
      authority_epoch_token: { source_authority_epoch: SOURCE_EPOCH, target_authority_epoch: TARGET_EPOCH },
      source_seal: { sealed_at: now, source_last_sequence: SOURCE_LAST_SEQUENCE },
      target_first_sequence: SOURCE_LAST_SEQUENCE + 1,
      now,
    });
    expect(activated.status).toBe('activated');
    expect(restored.readEvents({ session_id: 'cf_transition_4' }).events[0].event_sequence).toBe(SOURCE_LAST_SEQUENCE + 1);
  });
});
