import assert from 'node:assert/strict';
import {
  createMcpFabricLifecycle,
  transitionMcpFabricLifecycle,
} from './mcp-fabric-state.mjs';

let machine = createMcpFabricLifecycle();
machine = transitionMcpFabricLifecycle(machine, 'loaded');
machine = transitionMcpFabricLifecycle(machine, 'starting');
machine = transitionMcpFabricLifecycle(machine, 'ready');
machine = transitionMcpFabricLifecycle(machine, 'closing');
machine = transitionMcpFabricLifecycle(machine, 'closed');

assert.deepEqual(machine.history, [
  'discovered',
  'loaded',
  'starting',
  'ready',
  'closing',
  'closed',
]);
assert.throws(
  () => transitionMcpFabricLifecycle(createMcpFabricLifecycle(), 'ready'),
  /invalid_mcp_fabric_lifecycle_transition/,
);
assert.throws(
  () => transitionMcpFabricLifecycle(machine, 'starting'),
  /invalid_mcp_fabric_lifecycle_transition/,
);
