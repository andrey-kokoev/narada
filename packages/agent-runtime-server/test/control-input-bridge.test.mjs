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
    assert.equal(bridge.state.started, true);
    assert.equal(bridge.state.path, controlPath);
    assert.equal(bridge.state.last_read_status, 'available');
    assert.equal(bridge.state.emitted_count, 1);
    assert.equal(bridge.state.error_count, 0);

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
    assert.equal(bridge.state.emitted_count, 3);
  } finally {
    bridge.close();
    output.destroy();
    await rm(root, { recursive: true, force: true });
  }
});

test('control input bridge translates delivered system directives into admitted session input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-control-input-directive-'));
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
    onError: (error) => errors.push(error),
  });
  try {
    await writeFile(controlPath, `${JSON.stringify({
      id: 'directive-dir_control_bridge_test',
      method: 'system_directive.deliver',
      params: {
        directive_id: 'dir_control_bridge_test',
        directive: {
          source: { kind: 'system', id: 'site-loop.test' },
          content: { kind: 'work_ref', text: 'inspect the resident backlog' },
          directive_id: 'dir_control_bridge_test',
        },
        message: 'Directive id: dir_control_bridge_test\n\ninspect the resident backlog',
        authority_ref: 'dir_control_bridge_test',
      },
    })}\n`, 'utf8');
    await bridge.start();
    await waitFor(() => lines.length === 1);

    const request = JSON.parse(lines[0]);
    assert.equal(request.id, 'directive-dir_control_bridge_test');
    assert.equal(request.event_id, 'input_dir_control_bridge_test');
    assert.equal(request.method, 'session.submit');
    assert.equal(request.source_kind, 'system');
    assert.equal(request.source_id, 'site-loop.test');
    assert.equal(request.transport, 'control_jsonl');
    assert.equal(request.delivery_mode, 'admit_after_active_turn');
    assert.equal(request.directive_id, 'dir_control_bridge_test');
    assert.equal(request.authority_ref, 'dir_control_bridge_test');
    assert.match(request.content, /inspect the resident backlog/);
    assert.deepEqual(errors, []);
  } finally {
    bridge.close();
    output.destroy();
    await rm(root, { recursive: true, force: true });
  }
});

test('control input bridge exposes bounded diagnostics for malformed records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-control-input-invalid-'));
  const controlPath = join(root, 'control.jsonl');
  const output = new PassThrough();
  const errors = [];
  const diagnostics = [];
  const bridge = createControlInputBridge({
    path: controlPath,
    output,
    pollIntervalMs: 10,
    onError: (error, _line, diagnostic) => {
      errors.push(error);
      diagnostics.push(diagnostic);
    },
  });
  try {
    await writeFile(controlPath, 'not-json\n', 'utf8');
    await bridge.start();
    await waitFor(() => bridge.state.error_count === 1);
    assert.equal(errors.length, 1);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].code, 'control_input_record_invalid');
    assert.equal(diagnostics[0].message, 'control_input_record_invalid');
    assert.equal(bridge.state.last_error.code, 'control_input_record_invalid');
    assert.equal(bridge.state.last_error.message, 'control_input_record_invalid');
    assert.equal(bridge.state.emitted_count, 0);
  } finally {
    bridge.close();
    output.destroy();
    await rm(root, { recursive: true, force: true });
  }
});
