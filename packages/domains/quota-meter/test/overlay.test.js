import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createQuotaMeterOverlayDocument,
  overlayWorkerPidPath,
  publishQuotaMeterOverlayDocument,
} from '../src/overlay.js';

test('quota projection maps provider windows into the generic overlay document', () => {
  const document = createQuotaMeterOverlayDocument({
    generatedAt: '2026-08-03T22:00:00.000Z',
    providers: [{
      displayName: 'Codex',
      status: 'ok',
      windows: [{
        label: '5h',
        usedPercent: 25,
        remainingPercent: 75,
        glidePath: { glidePathFactor: 0.5, status: 'on-track' },
      }],
    }],
  });

  assert.equal(document.schema, 'narada.window_surface_overlay.document.v1');
  assert.equal(document.id, 'quota-meter');
  assert.equal(document.title, 'Quota Meter');
  assert.equal(document.rows.length, 1);
  assert.equal(document.rows[0].label, 'Codex 5h');
  assert.match(document.rows[0].value, /25\.0% used/);
  assert.equal(document.actions[0].id, 'refresh');
});

test('quota projection preserves the one-reset glide scenario as a second row', () => {
  const document = createQuotaMeterOverlayDocument({
    providers: [{
      displayName: 'Codex',
      status: 'ok',
      windows: [{
        label: '7d',
        usedPercent: 63,
        remainingPercent: 37,
        glidePath: {
          glidePathFactor: 1.53,
          status: 'over',
          withOneReset: {
            capacityMultiplier: 2,
            glidePathFactor: 0.76,
            status: 'under',
          },
        },
      }],
    }],
  });

  assert.deepEqual(document.rows.map((row) => row.label), ['Codex 7d', 'Codex 7d@1 reset']);
  assert.match(document.rows[1].value, /31\.5% used/);
  assert.match(document.rows[1].value, /68\.5% left/);
  assert.match(document.rows[1].value, /left · 0\.76$/);
  assert.doesNotMatch(document.rows[1].value, /glide|\((?:over|under)\)/);
  assert.match(document.rows[1].tooltip, /glide factor/);
  assert.equal(document.rows[1].tone, 'success');
});

test('quota projection publishes through window-overlay-core state paths', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'quota-meter-overlay-'));
  try {
    const env = { NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT: stateRoot };
    await publishQuotaMeterOverlayDocument({ providers: [] }, env);
    const documentPath = path.join(stateRoot, 'quota-meter', 'document.json');
    const document = JSON.parse(await readFile(documentPath, 'utf8'));
    assert.equal(document.id, 'quota-meter');
    assert.equal(document.rows[0].value, 'Loading provider quotas...');
    assert.equal(overlayWorkerPidPath(env), path.join(stateRoot, 'quota-meter', 'quota-worker.pid'));
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});
