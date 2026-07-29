import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  findLegacySessionConflicts,
  buildSessionAuthorityEnvironment,
  createSessionAuthorityRuntimeBinding,
  isSessionLive,
  normalizeSessionPrincipal,
  openLocalSessionAuthority,
  SessionAuthorityError,
  SESSION_AUTHORITY_REFUSAL_CODES,
} from './index.js';

test('normalizes site-qualified identities to one principal', () => {
  const a = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'resident' });
  const b = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'sonar.resident' });
  assert.equal(a.principal_key, b.principal_key);
  assert.equal(a.local_agent_id, 'resident');
});

test('atomically admits one session per principal and fences the second', () => {
  const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'narada-session-authority-'));
  const dbPath = join(root, 'authority.sqlite');
  const first = openLocalSessionAuthority({ dbPath });
  const second = openLocalSessionAuthority({ dbPath });
  const principal = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'resident' });
  const admission = first.admitSession({ principal, sessionId: 'carrier_one' });
  assert.equal(admission.status, 'admitted');
  assert.throws(
    () => second.admitSession({ principal, sessionId: 'carrier_two' }),
    (error: any) => error?.code === SESSION_AUTHORITY_REFUSAL_CODES.STARTING,
  );
  first.close();
  second.close();
  rmSync(root, { recursive: true, force: true });
});

test('authority conflict reports the exact lease, process, heartbeat, and health decision inputs', () => {
  const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'narada-session-authority-'));
  const dbPath = join(root, 'authority.sqlite');
  const authority = openLocalSessionAuthority({ dbPath });
  const principal = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'resident' });
  authority.admitSession({
    principal,
    sessionId: 'carrier_one',
    launchSessionId: 'launch_one',
    pid: 49152,
    now: new Date('2026-01-01T00:00:00Z'),
  });
  assert.throws(
    () => authority.admitSession({
      principal,
      sessionId: 'carrier_two',
      now: new Date('2026-01-01T00:00:01Z'),
      processProbe: () => true,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SessionAuthorityError);
      assert.equal(error.code, SESSION_AUTHORITY_REFUSAL_CODES.STARTING);
      assert.deepEqual(error.details.decision_evidence, {
        schema: 'narada.nars.session_authority_decision_evidence.v1',
        evaluated_at: '2026-01-01T00:00:01.000Z',
        governing_rule: 'reclaim_when_lease_expired_and_no_live_process_is_observed',
        existing_owner: {
          session_id: 'carrier_one',
          launch_session_id: 'launch_one',
          authority_epoch: 1,
          state: 'starting',
          runtime_kind: 'narada-agent-runtime-server',
          operator_surface_kind: 'agent-cli',
          pid: 49152,
          started_at: '2026-01-01T00:00:00.000Z',
          activated_at: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        observations: {
          process: { pid: 49152, status: 'alive' },
          lease: {
            status: 'fresh',
            expires_at: '2026-01-01T00:00:30.000Z',
            remaining_ms: 29_000,
          },
          heartbeat: {
            last_at: '2026-01-01T00:00:00.000Z',
            age_ms: 1_000,
          },
          health: {
            status: 'not_consulted',
            reason: 'runtime_health_is_not_an_authority_admission_input',
          },
        },
        reclamation: {
          evaluated: true,
          eligible: false,
          blockers: ['lease_fresh', 'process_alive'],
        },
        outcome: 'refused_existing_owner',
      });
      assert.equal('owner_token' in error.details.decision_evidence.existing_owner, false);
      return true;
    },
  );
  authority.close();
  rmSync(root, { recursive: true, force: true });
});

test('authority conflict distinguishes absent, live, and unobserved process evidence', () => {
  const cases = [
    {
      name: 'fresh absent process',
      pid: 49152,
      now: '2026-01-01T00:00:01Z',
      processProbe: () => false,
      processStatus: 'absent',
      leaseStatus: 'fresh',
      blockers: ['lease_fresh'],
      admitted: false,
    },
    {
      name: 'expired live process',
      pid: 49152,
      now: '2026-01-01T00:00:31Z',
      processProbe: () => true,
      processStatus: 'alive',
      leaseStatus: 'expired',
      blockers: ['process_alive'],
      admitted: false,
    },
    {
      name: 'unknown process',
      pid: null,
      now: '2026-01-01T00:00:01Z',
      processProbe: () => false,
      processStatus: 'not_observed',
      leaseStatus: 'fresh',
      blockers: ['lease_fresh'],
      admitted: false,
    },
    {
      name: 'expired absent process',
      pid: 49152,
      now: '2026-01-01T00:00:31Z',
      processProbe: () => false,
      processStatus: 'absent',
      leaseStatus: 'expired',
      blockers: [],
      admitted: true,
    },
    {
      name: 'expired process not observed',
      pid: null,
      now: '2026-01-01T00:00:31Z',
      processProbe: () => false,
      processStatus: 'not_observed',
      leaseStatus: 'expired',
      blockers: [],
      admitted: true,
    },
  ] as const;
  for (const scenario of cases) {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'narada-session-authority-'));
    const authority = openLocalSessionAuthority({ dbPath: join(root, 'authority.sqlite') });
    const principal = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'resident' });
    authority.admitSession({
      principal,
      sessionId: 'carrier_one',
      pid: scenario.pid,
      now: new Date('2026-01-01T00:00:00Z'),
    });
    if (scenario.admitted) {
      const replacement = authority.admitSession({
        principal,
        sessionId: 'carrier_two',
        now: new Date(scenario.now),
        processProbe: scenario.processProbe,
      });
      assert.equal(replacement.session_id, 'carrier_two', scenario.name);
    } else {
      assert.throws(
        () => authority.admitSession({
          principal,
          sessionId: 'carrier_two',
          now: new Date(scenario.now),
          processProbe: scenario.processProbe,
        }),
        (error: unknown) => {
          assert.ok(error instanceof SessionAuthorityError);
          const evidence = error.details.decision_evidence;
          assert.equal(evidence.observations.process.status, scenario.processStatus, scenario.name);
          assert.equal(evidence.observations.lease.status, scenario.leaseStatus, scenario.name);
          assert.deepEqual(evidence.reclamation.blockers, scenario.blockers, scenario.name);
          return true;
        },
      );
    }
    authority.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('activates, heartbeats, closes, and rejects a fenced owner', () => {
  const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'narada-session-authority-'));
  const dbPath = join(root, 'authority.sqlite');
  const authority = openLocalSessionAuthority({ dbPath });
  const principal = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'resident' });
  const admission = authority.admitSession({ principal, sessionId: 'carrier_one' });
  const active = authority.activateSession({ principal, sessionId: 'carrier_one', ownerToken: admission.owner_token, authorityEpoch: admission.authority_epoch });
  assert.equal(active.state, 'active');
  const beat = authority.heartbeatSession({ principal, sessionId: 'carrier_one', ownerToken: admission.owner_token, authorityEpoch: admission.authority_epoch });
  assert.equal(beat.state, 'active');
  assert.throws(
    () => authority.heartbeatSession({ principal, sessionId: 'carrier_one', ownerToken: 'wrong', authorityEpoch: admission.authority_epoch }),
    (error: any) => error?.code === SESSION_AUTHORITY_REFUSAL_CODES.FENCED,
  );
  const closed = authority.closeSession({ principal, sessionId: 'carrier_one', ownerToken: admission.owner_token, authorityEpoch: admission.authority_epoch, terminalReason: 'test' });
  assert.equal(closed.state, 'closed');
  authority.close();
  rmSync(root, { recursive: true, force: true });
});

test('reclaims expired authority when process evidence is absent', () => {
  const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'narada-session-authority-'));
  const dbPath = join(root, 'authority.sqlite');
  const authority = openLocalSessionAuthority({ dbPath });
  const principal = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'resident' });
  const admission = authority.admitSession({ principal, sessionId: 'carrier_one', leaseMs: 1, now: new Date('2026-01-01T00:00:00Z') });
  authority.activateSession({ principal, sessionId: 'carrier_one', ownerToken: admission.owner_token, authorityEpoch: admission.authority_epoch, now: new Date('2026-01-01T00:00:00Z') });
  const result = authority.reclaimSession({ principal, now: new Date('2026-01-01T00:01:00Z'), processProbe: () => false });
  assert.equal(result.status, 'reclaimed');
  authority.close();
  rmSync(root, { recursive: true, force: true });
});

test('explicitly replaces an abandoned authority before lease expiry only with absent-process evidence', () => {
  const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'narada-session-authority-'));
  const dbPath = join(root, 'authority.sqlite');
  const authority = openLocalSessionAuthority({ dbPath });
  const principal = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'resident' });
  const first = authority.admitSession({ principal, sessionId: 'carrier_one', pid: 49152 });
  assert.throws(
    () => authority.admitSession({
      principal,
      sessionId: 'carrier_one',
      replaceAbandoned: true,
      processProbe: () => true,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SessionAuthorityError);
      assert.equal(error.code, SESSION_AUTHORITY_REFUSAL_CODES.PROCESS_ALIVE);
      assert.equal(error.details.decision_evidence.observations.process.status, 'alive');
      assert.equal(error.details.decision_evidence.reclamation.eligible, false);
      return true;
    },
  );
  const replacement = authority.admitSession({
    principal,
    sessionId: 'carrier_one',
    replaceAbandoned: true,
    processProbe: () => false,
    recoveryReason: 'live_production_crash_recovery',
  });
  assert.equal(replacement.session_id, 'carrier_one');
  assert.equal(replacement.authority_epoch, first.authority_epoch + 1);
  assert.equal(authority.inspectSession({ principal })?.state, 'starting');
  authority.close();
  rmSync(root, { recursive: true, force: true });
});

test('legacy live sessions are explicit conflicts', () => {
  const principal = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'resident' });
  const conflicts = findLegacySessionConflicts({
    principal,
    sessions: [
      { session_id: 'carrier_old', site_id: 'sonar', agent_id: 'sonar.resident', display_state: 'active' },
      { session_id: 'carrier_history', site_id: 'sonar', agent_id: 'resident', display_state: 'historical' },
    ],
  });
  assert.deepEqual(conflicts.map((entry: any) => entry.session_id), ['carrier_old']);
});

test('explicitly unavailable health overrides heartbeat-only liveness', () => {
  assert.equal(isSessionLive({
    display_state: 'starting_or_degraded',
    heartbeat_fresh: true,
    health_status: 'unavailable',
  }), false);
  assert.equal(isSessionLive({
    display_state: 'active',
    heartbeat_fresh: true,
    health_status: 'healthy',
  }), true);
});

test('runtime binding activates only with launcher-issued authority environment', () => {
  const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'narada-session-authority-'));
  const dbPath = join(root, 'authority.sqlite');
  const authority = openLocalSessionAuthority({ dbPath });
  const principal = normalizeSessionPrincipal({ siteId: 'sonar', localAgentId: 'resident' });
  const admission = authority.admitSession({ principal, sessionId: 'carrier_one' });
  const env = buildSessionAuthorityEnvironment(admission);
  const binding = createSessionAuthorityRuntimeBinding({
    env,
    runtimeContext: { siteId: 'sonar', identity: 'resident', session: 'carrier_one' },
  });
  assert.ok(binding);
  assert.equal(binding.activate().state, 'active');
  assert.equal(binding.heartbeat().state, 'active');
  assert.equal(binding.close({ reason: 'test' }).state, 'closed');
  binding.dispose();
  authority.close();
  rmSync(root, { recursive: true, force: true });
});
