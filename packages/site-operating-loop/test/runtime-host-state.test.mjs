import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  assertSiteOperatingLoopRuntimeHostAuthority,
  claimSiteOperatingLoopRuntimeHost,
  ensureSiteLoopTables,
  getLoopStatus,
  getSiteOperatingLoopRuntimeHost,
  heartbeatSiteOperatingLoopRuntimeHost,
  transitionSiteOperatingLoopRuntimeHost,
} from '../src/site-loop-store.mjs';
import {
  assertSiteOperatingLoopRuntimeHostTransition,
  canTransitionSiteOperatingLoopRuntimeHost,
  createSiteOperatingLoopRuntimeHostStateMachine,
} from '../src/runtime-host-state.mjs';

function openTestStore() {
  const db = new DatabaseSync(':memory:');
  const store = {
    db,
    close() {
      db.close();
    },
  };
  ensureSiteLoopTables(db);
  return store;
}

test('Site Operating Runtime Host FSM is distinct from Loop Run lifecycle', () => {
  const records = [];
  const host = createSiteOperatingLoopRuntimeHostStateMachine({
    runtimeId: 'site-runtime-test',
    authorityEpoch: 7,
    now: () => '2026-07-23T00:00:00.000Z',
    onTransition: (record) => records.push(record),
  });

  assert.equal(host.snapshot().runtime_host_state, 'created');
  host.transition('binding');
  host.transition('ready', { projection_attachment: 'external' });
  host.transition('serving');
  host.transition('closing');
  host.transition('stopped');
  assert.deepEqual(host.snapshot().lifecycle_history, ['created', 'binding', 'ready', 'serving', 'closing', 'stopped']);
  assert.equal(host.snapshot().runtime_id, 'site-runtime-test');
  assert.equal(host.snapshot().authority_epoch, 7);
  assert.deepEqual(records.map((record) => record.runtime_host_state), [
    'binding',
    'ready',
    'serving',
    'closing',
    'stopped',
  ]);
  assert.equal(canTransitionSiteOperatingLoopRuntimeHost('serving', 'failed'), true);
  assert.throws(
    () => assertSiteOperatingLoopRuntimeHostTransition('created', 'serving'),
    /invalid_site_operating_loop_runtime_host_transition/,
  );
});

test('Site Operating Runtime Host lease prevents duplicate authorities and records takeover epochs', () => {
  const store = openTestStore();
  try {
    const firstClaim = claimSiteOperatingLoopRuntimeHost(store, {
      loopId: 'test.loop',
      ownerId: 'owner-a',
      leaseTtlMs: 1_000,
      metadata: { source: 'test' },
      at: '2026-07-23T00:00:00.000Z',
    });
    const first = firstClaim.host;
    assert.equal(firstClaim.schema, 'narada.site_operating_loop.runtime_host_claim.v1');
    assert.equal(firstClaim.event.event, 'runtime_host_claimed');
    assert.ok(firstClaim.event.event_id);
    assert.equal(first.runtime_host_state, 'created');
    assert.equal(first.authority_epoch, 1);
    assert.equal(first.metadata.source, 'test');

    transitionSiteOperatingLoopRuntimeHost(store, {
      loopId: 'test.loop',
      runtimeId: first.runtime_id,
      authorityEpoch: first.authority_epoch,
      ownerId: 'owner-a',
      nextState: 'binding',
      leaseTtlMs: 1_000,
      at: '2026-07-23T00:00:00.010Z',
    });
    transitionSiteOperatingLoopRuntimeHost(store, {
      loopId: 'test.loop',
      runtimeId: first.runtime_id,
      authorityEpoch: first.authority_epoch,
      ownerId: 'owner-a',
      nextState: 'ready',
      leaseTtlMs: 1_000,
      at: '2026-07-23T00:00:00.020Z',
    });
    transitionSiteOperatingLoopRuntimeHost(store, {
      loopId: 'test.loop',
      runtimeId: first.runtime_id,
      authorityEpoch: first.authority_epoch,
      ownerId: 'owner-a',
      nextState: 'serving',
      leaseTtlMs: 1_000,
      at: '2026-07-23T00:00:00.030Z',
    });

    assert.throws(
      () => claimSiteOperatingLoopRuntimeHost(store, {
        loopId: 'test.loop',
        ownerId: 'owner-b',
        leaseTtlMs: 1_000,
        at: '2026-07-23T00:00:00.100Z',
      }),
      /site_operating_loop_runtime_host_already_owned/,
    );
    assert.throws(
      () => assertSiteOperatingLoopRuntimeHostAuthority(store, {
        loopId: 'test.loop',
        runtimeId: first.runtime_id,
        authorityEpoch: first.authority_epoch,
        ownerId: 'owner-b',
        at: '2026-07-23T00:00:00.100Z',
      }),
      /site_operating_loop_runtime_host_authority_lost/,
    );

    heartbeatSiteOperatingLoopRuntimeHost(store, {
      loopId: 'test.loop',
      runtimeId: first.runtime_id,
      authorityEpoch: first.authority_epoch,
      ownerId: 'owner-a',
      leaseTtlMs: 1_000,
      at: '2026-07-23T00:00:00.500Z',
    });

    const secondClaim = claimSiteOperatingLoopRuntimeHost(store, {
      loopId: 'test.loop',
      ownerId: 'owner-b',
      leaseTtlMs: 1_000,
      at: '2026-07-23T00:00:02.000Z',
    });
    const second = secondClaim.host;
    assert.equal(second.runtime_id, first.runtime_id);
    assert.equal(second.authority_epoch, 2);
    assert.equal(second.owner_id, 'owner-b');
    assert.equal(second.runtime_host_state, 'created');
    assert.deepEqual(second.lifecycle_history, ['created']);

    const status = getLoopStatus(store, { loopId: 'test.loop' });
    assert.equal(status.runtime_host.authority_epoch, 2);
    assert.equal(getSiteOperatingLoopRuntimeHost(store, 'test.loop').owner_id, 'owner-b');
  } finally {
    store.close();
  }
});
