import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ensureSiteLoopTables, getLoopStatus, recordLoopRuntimeEvent } from '../src/site-loop-store.mjs';
import { startSiteOperatingLoopRuntime } from '../src/runtime.mjs';
import { createSiteOperatingLoopHttpServer, listenSiteOperatingLoopHttpServer } from '../src/server.mjs';

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

test('HTTP server exposes health status runs and events for a loop', async () => {
  const store = openTestStore();
  const server = createSiteOperatingLoopHttpServer(store, { loopId: 'test.loop' });
  try {
    await startSiteOperatingLoopRuntime(store, {
      loopId: 'test.loop',
      maxCycles: 1,
      createSteps: () => [{ stepId: 'http-step', execute: () => ({ ok: true }) }],
    });
    const listening = await listenSiteOperatingLoopHttpServer(server, { port: 0 });

    const health = await getJson(`${listening.base_url}/health`);
    assert.equal(health.status, 'healthy');

    const status = await getJson(`${listening.base_url}/status`);
    assert.equal(status.latest.status, 'ok');
    assert.equal(status.counts.ok, 1);
    assert.equal(status.runtime_host.runtime_host_state, 'stopped');
    assert.deepEqual(status.runtime_host.lifecycle_history, ['created', 'binding', 'ready', 'serving', 'closing', 'stopped']);

    const events = await getJson(`${listening.base_url}/events`);
    const runtimeEvents = events.events.filter((event) => [
      'runtime_started',
      'cycle_started',
      'cycle_completed',
      'runtime_stopped',
    ].includes(event.event));
    assert.deepEqual(runtimeEvents.map((event) => event.event), [
      'runtime_started',
      'cycle_started',
      'cycle_completed',
      'runtime_stopped',
    ]);

    const runs = await getJson(`${listening.base_url}/runs`);
    assert.equal(runs.runs.length, 1);

    const run = await getJson(`${listening.base_url}/runs/${encodeURIComponent(runs.runs[0].run_id)}`);
    assert.equal(run.run.steps[0].step_id, 'http-step');

    const stream = await fetch(`${listening.base_url}/events/stream?snapshot=1`);
    assert.equal(stream.status, 200);
    assert.equal(stream.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const body = await stream.text();
    assert.match(body, /event: runtime_started/);
    assert.match(body, /event: runtime_stopped/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

test('HTTP live event stream stays open and emits newly recorded events', async () => {
  const store = openTestStore();
  const server = createSiteOperatingLoopHttpServer(store, {
    loopId: 'test.loop',
    streamPollMs: 25,
    streamHeartbeatMs: 50,
  });
  const controller = new AbortController();
  try {
    const listening = await listenSiteOperatingLoopHttpServer(server, { port: 0 });
    const response = await fetch(`${listening.base_url}/events/stream?poll_ms=25&heartbeat_ms=50`, {
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const reader = response.body.getReader();
    const firstChunk = await readChunkText(reader);
    assert.match(firstChunk, /: connected/);

    recordLoopRuntimeEvent(store, {
      schema: 'narada.site_operating_loop.runtime_event.v1',
      event: 'test_event',
      loop_id: 'test.loop',
      timestamp: new Date().toISOString(),
    });

    const streamed = await readUntil(reader, /event: test_event/, 2000);
    assert.match(streamed, /event: test_event/);
  } finally {
    controller.abort();
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

test('HTTP server admits triggers and controls pause state', async () => {
  const store = openTestStore();
  const server = createSiteOperatingLoopHttpServer(store, { loopId: 'test.loop' });
  try {
    const listening = await listenSiteOperatingLoopHttpServer(server, { port: 0 });

    const triggerResponse = await fetch(`${listening.base_url}/triggers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'webhook',
        source: 'test',
        source_ref: 'evt-1',
        payload: { ok: true },
      }),
    });
    assert.equal(triggerResponse.status, 202);
    const trigger = await triggerResponse.json();
    assert.equal(trigger.status, 'pending');

    const triggers = await getJson(`${listening.base_url}/triggers`);
    assert.equal(triggers.count, 1);
    assert.equal(triggers.triggers[0].trigger_id, trigger.trigger_id);

    const pauseResponse = await fetch(`${listening.base_url}/control/pause`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'test_pause' }),
    });
    assert.equal(pauseResponse.status, 200);
    assert.equal((await pauseResponse.json()).paused, true);

    const statusAfterPause = await getJson(`${listening.base_url}/status`);
    assert.equal(statusAfterPause.control.paused, true);

    const resumeResponse = await fetch(`${listening.base_url}/control/resume`, { method: 'POST' });
    assert.equal(resumeResponse.status, 200);
    assert.equal((await resumeResponse.json()).paused, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

test('HTTP server returns 404 for unknown paths', async () => {
  const store = openTestStore();
  const server = createSiteOperatingLoopHttpServer(store, { loopId: 'test.loop' });
  try {
    const listening = await listenSiteOperatingLoopHttpServer(server, { port: 0 });
    const response = await fetch(`${listening.base_url}/missing`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.status, 'not_found');
    assert.equal(getLoopStatus(store, { loopId: 'test.loop' }).latest, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

async function getJson(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200, `${url} returned ${response.status}`);
  return await response.json();
}

async function readChunkText(reader) {
  const { value } = await reader.read();
  return Buffer.from(value ?? new Uint8Array()).toString('utf8');
}

async function readUntil(reader, pattern, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let text = '';
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    text += Buffer.from(value ?? new Uint8Array()).toString('utf8');
    if (pattern.test(text)) return text;
  }
  throw new Error(`stream did not match ${pattern}: ${text}`);
}
