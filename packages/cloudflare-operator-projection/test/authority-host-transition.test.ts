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
} from '@narada-core/nars-session-core/authority-transition-state';
import {
  createCloudflareNarsAuthorityService as createCloudflareNarsAuthorityServiceCore,
  createCloudflareNarsTestRuntimeExecutor,
} from '../src/index.js';

const now = '2026-07-19T00:00:00.000Z';
const SOURCE_EPOCH = 1;
const TARGET_EPOCH = 2;
const SOURCE_LAST_SEQUENCE = 7;

function createCloudflareNarsAuthorityService(
  options: Parameters<typeof createCloudflareNarsAuthorityServiceCore>[0] = {},
) {
  return createCloudflareNarsAuthorityServiceCore({
    ...options,
    runtime_executor: createCloudflareNarsTestRuntimeExecutor(),
  });
}

function driveLocalSourceToSealed(root: string) {
  const sessionPath = join(root, 'sessions', 'carrier_local_1', 'session.jsonl');
  const path = authorityTransitionStatePathFromSessionPath(sessionPath);
  const plan = planTargetAuthorityTransition({
    sourceAuthorityRuntimeHost: 'local',
    sourceAuthorityEpoch: SOURCE_EPOCH,
    sourceAuthorityRuntimeId: 'auth_local_carrier_local_1',
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
  expect(sealed.source_authority_epoch).toBe(SOURCE_EPOCH);
  expect(sealed.source_authority_runtime_id).toBe('auth_local_carrier_local_1');
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

      const admitted = await service.submitInput({
        session_id: 'cf_transition_1',
        method: 'conversation.send',
        authority_epoch: TARGET_EPOCH,
        authority_runtime_id: 'cloudflare-nars-authority:cf_transition_1',
        payload: { message: 'post-transfer input' },
        now,
      });
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

  test('refuses a second target for the same source runtime and epoch', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 20 });
    expect(service.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_competing_a',
      source_authority_runtime: { authority_runtime_id: 'auth_local_competing', authority_epoch: SOURCE_EPOCH },
      now,
    }).status).toBe('prepared');
    const refused = service.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_competing_b',
      source_authority_runtime: { authority_runtime_id: 'auth_local_competing', authority_epoch: SOURCE_EPOCH },
      now,
    });
    expect(refused).toMatchObject({ status: 'refused', code: 'dual_host_authority_conflict' });
    expect((refused as { conflict?: { existing_target_session_id?: string } }).conflict?.existing_target_session_id).toBe('cf_competing_a');
  });

  test('refuses activation while a source turn is active and records provider transfer limits', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 20 });
    service.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_active_turn',
      source_authority_runtime: { authority_runtime_id: 'auth_local_active_turn', authority_epoch: SOURCE_EPOCH },
      now,
    });
    const activeTurnRefusal = service.activateTransitionTarget({
      session_id: 'cf_active_turn',
      authority_epoch_token: { source_authority_epoch: SOURCE_EPOCH, target_authority_epoch: TARGET_EPOCH },
      source_seal: { sealed_at: now, source_last_sequence: SOURCE_LAST_SEQUENCE },
      target_first_sequence: SOURCE_LAST_SEQUENCE + 1,
      handoff: { active_turn: { mode: 'refuse_if_active', state: 'running', active_turn_id: 'turn-1', disposition: 'refused' } },
      now,
    });
    expect(activeTurnRefusal).toMatchObject({ status: 'refused', code: 'target_activation_refused', missing: ['active_turn_in_progress'] });
    expect(service.snapshot().sessions.find((session) => session.session_id === 'cf_active_turn')?.authority_transition?.refusals.at(-1)?.code).toBe('active_turn_in_progress');

    const providerService = createCloudflareNarsAuthorityService({ max_events: 20 });
    providerService.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_provider_transfer',
      source_authority_runtime: { authority_runtime_id: 'auth_local_provider', authority_epoch: SOURCE_EPOCH },
      now,
    });
    const providerRefusal = providerService.activateTransitionTarget({
      session_id: 'cf_provider_transfer',
      authority_epoch_token: { source_authority_epoch: SOURCE_EPOCH, target_authority_epoch: TARGET_EPOCH },
      source_seal: { sealed_at: now, source_last_sequence: SOURCE_LAST_SEQUENCE },
      target_first_sequence: SOURCE_LAST_SEQUENCE + 1,
      handoff: { provider_state: { mode: 'not_present', source_state: 'present', target_state: 'absent' } },
      now,
    });
    expect(providerRefusal).toMatchObject({ status: 'refused', missing: ['provider_execution_transfer_evidence'] });
  });

  test('persists queue, interrupted-turn, artifact, MCP, replay, and reconciliation evidence across activation and transport loss', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 30 });
    service.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_evidence',
      source_authority_runtime: { authority_runtime_id: 'auth_local_evidence', authority_epoch: SOURCE_EPOCH },
      now,
    });
    const activated = service.activateTransitionTarget({
      session_id: 'cf_evidence',
      authority_epoch_token: { source_authority_epoch: SOURCE_EPOCH, target_authority_epoch: TARGET_EPOCH },
      source_seal: { sealed_at: now, source_last_sequence: SOURCE_LAST_SEQUENCE },
      target_first_sequence: SOURCE_LAST_SEQUENCE + 1,
      handoff: {
        event_log: { mode: 'checkpoint_plus_cursor', source_last_sequence: SOURCE_LAST_SEQUENCE, target_first_sequence: SOURCE_LAST_SEQUENCE + 1, replay_status: 'verified' },
        operator_input_queue: { mode: 'transfer_after_seal', pending_count_at_request: 2, pending_count_at_seal: 0, disposition: 'transferred' },
        active_turn: { mode: 'interrupted', state: 'interrupted', active_turn_id: 'turn-2', disposition: 'interrupted' },
        artifacts: { mode: 'registry_only_lazy_content', registry_count: 2, admitted_content_count: 0, source_paths_exposed: false },
        health: { source_health_until: 'source_sealed', target_health_required_before: 'target_active', target_health_observed: true },
        mcp_fabric: { mode: 'compatibility_report_required', status: 'compatible', source_status: 'compatible', target_status: 'ok', report_ref: 'mcp-report-1' },
        provider_state: { mode: 'unsupported_for_synthetic_slice', source_state: 'present', target_state: 'absent', transfer_status: 'not_attempted' },
        transport: { state: 'reconnected', outcome: 'known', unknown_outcome: false },
        reconciliation: { status: 'verified', replay_status: 'verified', source_last_sequence: SOURCE_LAST_SEQUENCE, target_first_sequence: SOURCE_LAST_SEQUENCE + 1 },
      },
      now,
    });
    expect(activated.status).toBe('activated');
    const transition = service.snapshot().sessions.find((session) => session.session_id === 'cf_evidence')?.authority_transition;
    expect(transition?.handoff).toMatchObject({
      operator_input_queue: { pending_count_at_request: 2, pending_count_at_seal: 0, disposition: 'transferred' },
      active_turn: { state: 'interrupted', active_turn_id: 'turn-2' },
      artifacts: { registry_count: 2, source_paths_exposed: false },
      provider_state: { mode: 'unsupported_for_synthetic_slice' },
      event_log: { replay_status: 'verified' },
    });
    expect(transition?.reconciliation).toMatchObject({ status: 'reconciled', replay_status: 'verified' });

    const lost = service.reconcileTransitionOutcome({ session_id: 'cf_evidence', transport_state: 'lost', outcome: 'unknown', replay_status: 'pending', now });
    expect(lost).toMatchObject({ status: 'unknown', code: 'transition_outcome_unknown', source_remains_canonical: false });
    const recovered = service.reconcileTransitionOutcome({ session_id: 'cf_evidence', transport_state: 'reconnected', outcome: 'known', replay_status: 'verified', now });
    expect(recovered).toMatchObject({ status: 'reconciled', source_remains_canonical: false, reconciliation: { replay_status: 'verified' } });
    expect(service.snapshot().sessions.find((session) => session.session_id === 'cf_evidence')?.authority_transition?.reconciliation?.status).toBe('reconciled');
  });

  test('keeps an unknown prepared transition fenced until explicit recovery evidence is supplied', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 30 });
    service.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_unknown_recovery',
      source_authority_runtime: { authority_runtime_id: 'auth_local_unknown_recovery', authority_epoch: SOURCE_EPOCH },
      now,
    });
    const activationArgs = {
      session_id: 'cf_unknown_recovery',
      authority_epoch_token: { source_authority_epoch: SOURCE_EPOCH, target_authority_epoch: TARGET_EPOCH },
      source_seal: { sealed_at: now, source_last_sequence: SOURCE_LAST_SEQUENCE },
      target_first_sequence: SOURCE_LAST_SEQUENCE + 1,
      now,
    };
    const unknown = service.activateTransitionTarget({
      ...activationArgs,
      handoff: {
        transport: { state: 'lost', outcome: 'unknown', unknown_outcome: true },
        event_log: { replay_status: 'pending' },
        reconciliation: { status: 'unknown', replay_status: 'pending' },
      },
    });
    expect(unknown).toMatchObject({ status: 'unknown', code: 'transition_outcome_unknown', source_remains_canonical: true });

    const stillFenced = service.activateTransitionTarget(activationArgs);
    expect(stillFenced).toMatchObject({ status: 'unknown', code: 'transition_outcome_unknown', source_remains_canonical: true });

    const recovered = service.activateTransitionTarget({
      ...activationArgs,
      handoff: {
        transport: { state: 'reconnected', outcome: 'known', unknown_outcome: false },
        event_log: { mode: 'checkpoint_plus_cursor', source_last_sequence: SOURCE_LAST_SEQUENCE, target_first_sequence: SOURCE_LAST_SEQUENCE + 1, replay_status: 'verified' },
        reconciliation: { status: 'verified', replay_status: 'verified' },
      },
    });
    expect(recovered.status).toBe('activated');
  });

  test('requires the target epoch and runtime identity for post-handoff writes', async () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 20 });
    service.prepareTransitionTarget({
      site_id: 'narada.test',
      agent_id: 'cloudflare.resident',
      session_id: 'cf_input_fence',
      source_authority_runtime: { authority_runtime_id: 'auth_local_input_fence', authority_epoch: SOURCE_EPOCH },
      now,
    });
    service.activateTransitionTarget({
      session_id: 'cf_input_fence',
      authority_epoch_token: { source_authority_epoch: SOURCE_EPOCH, target_authority_epoch: TARGET_EPOCH },
      source_seal: { sealed_at: now, source_last_sequence: SOURCE_LAST_SEQUENCE },
      target_first_sequence: SOURCE_LAST_SEQUENCE + 1,
      now,
    });
    expect(await service.submitInput({ session_id: 'cf_input_fence', method: 'conversation.send', payload: { message: 'stale' }, now })).toMatchObject({ status: 'refused', code: 'authority_epoch_required' });
    expect(await service.submitInput({ session_id: 'cf_input_fence', method: 'conversation.send', authority_epoch: SOURCE_EPOCH, authority_runtime_id: 'cloudflare-nars-authority:cf_input_fence', payload: { message: 'stale' }, now })).toMatchObject({ status: 'refused', code: 'authority_epoch_mismatch' });
  });
});
