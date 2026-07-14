import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMcpFabricRuntimeLifecycle,
  transitionMcpFabricRuntime,
} from './mcp-fabric-runtime-state.mjs';

test('MCP fabric runtime records recovery without conflating server probe state', () => {
  let lifecycle = createMcpFabricRuntimeLifecycle();
  for (const state of ['loading', 'ready', 'degraded', 'restarting', 'loading', 'ready']) {
    lifecycle = transitionMcpFabricRuntime(lifecycle, state);
  }
  assert.equal(lifecycle.state, 'ready');
  assert.deepEqual(lifecycle.history, ['declared', 'loading', 'ready', 'degraded', 'restarting', 'loading', 'ready']);
});

test('MCP fabric runtime rejects direct declaration-to-ready jumps', () => {
  assert.throws(
    () => transitionMcpFabricRuntime(createMcpFabricRuntimeLifecycle(), 'ready'),
    /invalid_mcp_fabric_runtime_transition: declared->ready/,
  );
});
