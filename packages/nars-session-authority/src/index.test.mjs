import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  findLegacySessionConflicts,
  buildSessionAuthorityEnvironment,
  createSessionAuthorityRuntimeBinding,
  normalizeSessionPrincipal,
  openLocalSessionAuthority,
  SESSION_AUTHORITY_REFUSAL_CODES,
} from './index.mjs';

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
    (error) => error?.code === SESSION_AUTHORITY_REFUSAL_CODES.STARTING,
  );
  first.close();
  second.close();
  rmSync(root, { recursive: true, force: true });
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
    (error) => error?.code === SESSION_AUTHORITY_REFUSAL_CODES.FENCED,
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
    (error) => error?.code === SESSION_AUTHORITY_REFUSAL_CODES.PROCESS_ALIVE,
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
  assert.equal(authority.inspectSession({ principal }).state, 'starting');
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
  assert.deepEqual(conflicts.map((entry) => entry.session_id), ['carrier_old']);
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
