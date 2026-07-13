import assert from 'node:assert/strict';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createControlInputRecord, createInputEvent } from '@narada2/carrier-protocol';
import { createControlInputBridge } from '../src/control-input-bridge.mjs';

function waitFor(predicate, timeoutMs = 1500) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error('timed_out_waiting_for_control_input'));
      setTimeout(check, 10);
    };
    check();
  });
}

test('control input bridge keeps sideband exhaustion open and delivers appended records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-control-input-'));
  const controlPath = join(root, 'control.jsonl');
  const output = new PassThrough();
  const lines = [];
  output.setEncoding('utf8');
  output.on('data', (chunk) => {
    lines.push(...chunk.split('\n').map((line) => line.trim()).filter(Boolean));
  });
  const errors = [];
  const bridge = createControlInputBridge({
    path: controlPath,
    output,
    pollIntervalMs: 10,
    maxReadBytes: 32,
    onError: (error) => errors.push(error),
  });
  try {
    const initialInput = createInputEvent({
      event_id: 'input_control_bridge_initial',
      source_kind: 'system',
      source_id: 'system.test',
      transport: 'startup_injection',
      delivery_mode: 'admit_for_current_turn',
      content: 'already present at startup',
      authority_ref: 'test-authority',
    });
    await writeFile(controlPath, `${JSON.stringify(createControlInputRecord({
      control_event_id: 'control_control_bridge_initial',
      input: initialInput,
    }))}\n`, 'utf8');
    await bridge.start();
    await waitFor(() => lines.length === 1);
    assert.equal(JSON.parse(lines[0]).content, initialInput.content);
    assert.equal(output.writableEnded, false);

    const input = createInputEvent({
      event_id: 'input_control_bridge_test',
      source_kind: 'operator',
      source_id: 'operator.test',
      transport: 'control_jsonl',
      delivery_mode: 'admit_after_active_turn',
      content: 'continue from sideband',
      authority_ref: 'test-authority',
    });
    const record = createControlInputRecord({
      control_event_id: 'control_control_bridge_test',
      input,
    });
    const serialized = `${JSON.stringify(record)}\n`;
    await appendFile(controlPath, serialized.slice(0, -1), 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(lines.length, 1);
    await appendFile(controlPath, serialized.slice(-1), 'utf8');
    await waitFor(() => lines.length === 2);

    const request = JSON.parse(lines[1]);
    assert.equal(request.id, input.event_id);
    assert.equal(request.method, 'session.submit');
    assert.equal(request.content, input.content);
    assert.equal(request.directive_id, null);
    assert.deepEqual(errors, []);
    assert.equal(output.writableEnded, false);

    const lifecycleRequest = {
      id: 'close_control_bridge_test',
      method: 'session.close',
      params: { source: 'test' },
    };
    await appendFile(controlPath, `${JSON.stringify(lifecycleRequest)}\n`, 'utf8');
    await waitFor(() => lines.length === 3);
    assert.deepEqual(JSON.parse(lines[2]), lifecycleRequest);
    assert.deepEqual(errors, []);
  } finally {
    bridge.close();
    output.destroy();
    await rm(root, { recursive: true, force: true });
  }
});
