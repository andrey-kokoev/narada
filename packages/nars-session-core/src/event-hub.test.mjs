import assert from 'node:assert/strict';
import test from 'node:test';

import { createNarsEventHub } from './event-hub.mjs';

test('event hub attachment exposes replay, live, and closed states', () => {
  const hub = createNarsEventHub();
  const received = [];
  const subscription = hub.subscribe({
    subscriptionId: 'sub-test',
    send: (envelope) => received.push(envelope),
  });
  assert.equal(subscription.state, 'requested');
  subscription.beginReplay({ source: 'memory' });
  subscription.markLive();
  hub.publish({ event: 'session_status', session_id: 'session-1' });
  assert.equal(received.length, 1);
  assert.equal(subscription.state, 'live');
  subscription.unsubscribe();
  assert.equal(subscription.state, 'closed');
  assert.equal(hub.subscriberCount(), 0);
});

test('event hub marks a failed sender attachment as failed and removes it', () => {
  const hub = createNarsEventHub();
  const subscription = hub.subscribe({
    subscriptionId: 'sub-failing',
    send: () => { throw new Error('socket_closed'); },
  });
  subscription.markLive();
  hub.publish({ event: 'session_status', session_id: 'session-1' });
  assert.equal(subscription.state, 'failed');
  assert.equal(hub.subscriberCount(), 0);
});

