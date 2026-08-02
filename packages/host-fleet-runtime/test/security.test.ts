import assert from 'node:assert/strict';
import test from 'node:test';
import { signHostFleetBody, verifyHostFleetBody } from '../src/security.js';

const BODY = Buffer.from('{"schema":"example"}');
const NOW = Date.parse('2026-08-01T12:00:00.000Z');

test('active and bounded previous credentials verify by key id', () => {
  const active = { key_id: 'active', secret: 'a'.repeat(32), accept_until: null };
  const previous = { key_id: 'previous', secret: 'b'.repeat(32), accept_until: '2026-08-01T12:01:00.000Z' };
  for (const credential of [active, previous]) {
    const signed = signHostFleetBody(BODY, credential, new Date(NOW).toISOString(), 'abcdefghijklmnop');
    assert.equal(verifyHostFleetBody({ body: BODY, headers: signed, credentials: [active, previous], now_ms: NOW, max_clock_skew_ms: 60_000 }).key_id, credential.key_id);
  }
});

test('expired previous credentials and altered bodies fail closed', () => {
  const previous = { key_id: 'previous', secret: 'b'.repeat(32), accept_until: '2026-08-01T11:59:59.000Z' };
  const signed = signHostFleetBody(BODY, previous, new Date(NOW).toISOString(), 'abcdefghijklmnop');
  assert.throws(() => verifyHostFleetBody({ body: BODY, headers: signed, credentials: [previous], now_ms: NOW, max_clock_skew_ms: 60_000 }), /key_expired/);
  const active = { key_id: 'active', secret: 'a'.repeat(32), accept_until: null };
  const activeSigned = signHostFleetBody(BODY, active, new Date(NOW).toISOString(), 'abcdefghijklmnop');
  assert.throws(() => verifyHostFleetBody({ body: Buffer.from('{}'), headers: activeSigned, credentials: [active], now_ms: NOW, max_clock_skew_ms: 60_000 }), /signature_invalid/);
});
