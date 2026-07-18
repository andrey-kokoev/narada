import { describe, expect, test } from 'vitest';
import {
  buildNarsRuntimeSurfaceContract,
  validateNarsRuntimeSurfaceContract,
} from '@narada2/nars-runtime-contract/runtime-surface-contract';
import {
  buildCloudflareNarsAuthorityRuntimeSurfaceContract,
  classifyCloudflareInputRelay,
  createCloudflareNarsAuthorityService,
  createCloudflareNarsProjectionIntent,
  createCloudflareNarsRemoteAccessRecord,
  validateProjectionCredential,
} from '../src/index.js';

const now = '2026-07-18T00:00:00.000Z';

describe('four-quadrant runtime/surface contract conformance', () => {
  test('local/local: canonical local authority contract validates without projection', () => {
    const contract = buildNarsRuntimeSurfaceContract({
      runtime_origin: 'local',
      surface_origin: 'local',
      authority: {
        authority_runtime_host: 'local',
        authority_epoch: 1,
        authority_runtime_id: 'auth_local_session-1',
        canonicity: 'canonical',
        authority_transition_state: 'not_requested',
        source_write_admission: 'active',
      },
      generated_at: now,
    });
    expect(contract.quadrant).toBe('local/local');
    expect(contract.evidence_class).toBe('genuine');
    expect(validateNarsRuntimeSurfaceContract(contract)).toEqual({ ok: true, violations: [] });
  });

  test('local/cloudflare: projection intent and remote access record report non-canonical posture', () => {
    const intent = createCloudflareNarsProjectionIntent({
      site_id: 'narada.test',
      nars_session_id: 'carrier_session_1',
      created_by: 'operator',
      created_at: now,
    });
    expect(intent.runtime_surface_contract).toBeDefined();
    expect(intent.runtime_surface_contract!.quadrant).toBe('local/cloudflare');
    expect(intent.runtime_surface_contract!.evidence_class).toBe('projected');
    expect(intent.runtime_surface_contract!.projection?.posture).toBe('non_canonical_projection');
    expect(intent.runtime_surface_contract!.authority.canonicity).toBe('canonical');
    expect(validateNarsRuntimeSurfaceContract(intent.runtime_surface_contract)).toEqual({ ok: true, violations: [] });

    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    expect(access.runtime_surface_contract!.projection?.posture).toBe('non_canonical_projection');
    expect(validateNarsRuntimeSurfaceContract(access.runtime_surface_contract)).toEqual({ ok: true, violations: [] });
  });

  test('cloudflare/local and cloudflare/cloudflare: synthetic authority contract validates with explicit capability absence', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 10 });
    const created = service.createSession({ session_id: 'cf_quadrant_1', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    expect(created.status).toBe('created');
    const session = created.session!;

    for (const surfaceOrigin of ['local', 'cloudflare'] as const) {
      const contract = buildCloudflareNarsAuthorityRuntimeSurfaceContract(session, surfaceOrigin);
      expect(contract.quadrant).toBe(`cloudflare/${surfaceOrigin}`);
      expect(contract.evidence_class).toBe('synthetic');
      expect(contract.authority.canonicity).toBe('synthetic_canonical');
      expect(contract.capability_profile.provider_execution).toBe('absent');
      expect(contract.capability_profile.local_tool_execution).toBe('absent');
      expect(contract.capability_profile.local_mcp).toBe('absent');
      expect(contract.capability_profile.local_filesystem_authority).toBe('absent');
      expect(validateNarsRuntimeSurfaceContract(contract)).toEqual({ ok: true, violations: [] });
    }

    const health = service.readHealth(session.session_id);
    expect(health.status).toBe('healthy');
    expect(health.runtime_surface_contract!.capability_profile.provider_execution).toBe('absent');
    expect(validateNarsRuntimeSurfaceContract(health.runtime_surface_contract)).toEqual({ ok: true, violations: [] });
  });
});

describe('negative authority cases', () => {
  test('browser token cannot publish projected events or artifacts', () => {
    const intent = createCloudflareNarsProjectionIntent({ site_id: 'narada.test', nars_session_id: 'carrier_session_1', created_by: 'operator', created_at: now });
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    const browserFingerprint = access.browser_access_tokens[0].token_fingerprint;
    for (const action of ['publish_event', 'publish_artifact', 'deliver_input'] as const) {
      const validation = validateProjectionCredential(access, { credential_kind: 'browser', token_fingerprint: browserFingerprint, action, now });
      expect(validation).toMatchObject({ ok: false, code: 'credential_kind_not_authorized_for_action' });
    }
  });

  test('projection input relay acknowledgement confirms only the crossing, not NARS admission', () => {
    const intent = createCloudflareNarsProjectionIntent({
      site_id: 'narada.test',
      nars_session_id: 'carrier_session_1',
      created_by: 'operator',
      created_at: now,
      operator_input_policy: ['conversation.send', 'conversation.enqueue', 'conversation.interrupt', 'session.close'],
    });
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    const relay = classifyCloudflareInputRelay(access, {
      token_fingerprint: access.browser_access_tokens[0].token_fingerprint,
      method: 'conversation.send',
      now,
    });
    expect(relay).toMatchObject({
      ok: true,
      acknowledgement: 'requires_nars_admission',
      semantic_success_point: 'nars_admission',
    });
  });

  test('ambiguous dual-host authority creation is durably refused and preserves the existing event log', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 10 });
    const first = service.createSession({ session_id: 'cf_dual_host', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    expect(first.status).toBe('created');
    service.submitInput({ session_id: 'cf_dual_host', method: 'conversation.send', payload: { message: 'durable evidence' }, now });
    const before = service.readEvents({ session_id: 'cf_dual_host' });
    expect(before.events.length).toBeGreaterThan(1);

    const second = service.createSession({ session_id: 'cf_dual_host', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    expect(second).toMatchObject({
      status: 'refused',
      code: 'dual_host_authority_conflict',
      conflict: {
        existing_authority_runtime_id: first.session!.authority_runtime_id,
        existing_authority_epoch: first.session!.authority_epoch,
        existing_lifecycle_state: 'active',
      },
    });

    const after = service.readEvents({ session_id: 'cf_dual_host' });
    expect(after.events.map((event) => event.event_sequence)).toEqual(before.events.map((event) => event.event_sequence));

    service.revokeSession('cf_dual_host', now);
    const afterRevoke = service.createSession({ session_id: 'cf_dual_host', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    expect(afterRevoke).toMatchObject({ status: 'refused', code: 'dual_host_authority_conflict', conflict: { existing_lifecycle_state: 'revoked' } });
  });

  test('cloudflare-origin authority session reports explicit provider/tool/local authority absence', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 10 });
    const created = service.createSession({ session_id: 'cf_capability_1', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    const contract = created.session!.runtime_surface_contract;
    expect(contract.runtime_origin).toBe('cloudflare');
    expect(contract.authority.authority_runtime_host).toBe('cloudflare-host');
    expect(contract.capability_profile).toMatchObject({
      provider_execution: 'absent',
      local_tool_execution: 'absent',
      local_mcp: 'absent',
      local_filesystem_authority: 'absent',
      local_artifact_authority: 'absent',
      replay: 'present',
      input_admission: 'present',
      revocation: 'present',
    });
  });

  test('cloudflare-origin revocation blocks health, replay, and input with typed refusals', () => {
    const service = createCloudflareNarsAuthorityService({ max_events: 10 });
    const created = service.createSession({ session_id: 'cf_revoke_1', site_id: 'narada.test', agent_id: 'cloudflare.resident' }, now);
    expect(service.revokeSession(created.session_id, now)).toMatchObject({ status: 'revoked' });
    expect(service.readHealth(created.session_id)).toMatchObject({ status: 'refused', code: 'session_revoked' });
    expect(service.readEvents({ session_id: created.session_id })).toMatchObject({ status: 'refused', code: 'session_revoked' });
    expect(service.submitInput({ session_id: created.session_id, method: 'conversation.send', payload: {}, now })).toMatchObject({ status: 'refused', code: 'session_revoked' });
  });
});
