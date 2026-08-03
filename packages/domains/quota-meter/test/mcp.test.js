import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { handleMessage } from '../src/mcp.js';

function overlayDirectory(stateRoot) {
  return path.join(stateRoot, 'quota-meter');
}

test('MCP advertises and invokes the generic overlay refresh tool', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'quota-meter-mcp-'));
  const stateDirectory = overlayDirectory(stateRoot);
  try {
    await mkdir(stateDirectory);
    await writeFile(path.join(stateDirectory, 'overlay.pid'), String(process.pid));
    const env = { NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT: stateRoot };

    const initialized = await handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25' },
    }, env);
    assert.equal(initialized.result.protocolVersion, '2025-11-25');
    assert.deepEqual(initialized.result.capabilities, { tools: {} });

    const listed = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, env);
    assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
      'start_overlay',
      'restart_overlay',
      'stop_overlay',
      'refresh_overlay',
      'overlay_status',
    ]);

    const status = await handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'overlay_status', arguments: {} },
    }, env);
    assert.equal(status.result.structuredContent.state, 'running');
    assert.equal(status.result.structuredContent.pid, process.pid);
    assert.equal(status.result.structuredContent.id, 'quota-meter');
    assert.equal(status.result.structuredContent.worker_running, false);

    const called = await handleMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'refresh_overlay', arguments: {} },
    }, env);
    assert.equal(called.result.isError, undefined);
    assert.match(called.result.content[0].text, /refresh requested/);
    assert.match(await readFile(path.join(stateDirectory, 'refresh.signal'), 'utf8'), /\S+/);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('MCP reports a missing overlay as a tool error', async () => {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'quota-meter-mcp-'));
  try {
    const response = await handleMessage({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'refresh_overlay' },
    }, { NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT: stateRoot });
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /not running/);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('MCP validates overlay start and restart arguments', async () => {
  for (const [id, name, arguments_] of [
    [6, 'start_overlay', { refreshSeconds: 4 }],
    [7, 'restart_overlay', { refreshSeconds: 3601 }],
  ]) {
    const response = await handleMessage({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: arguments_ },
    });
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /between 5 and 3600/);
  }
});
