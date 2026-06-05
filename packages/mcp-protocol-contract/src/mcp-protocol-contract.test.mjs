import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMcpJsonRpcContract } from './mcp-protocol-contract.mjs';

test('MCP JSON-RPC contract exposes version and method names', () => {
  const contract = loadMcpJsonRpcContract();
  assert.equal(contract.schema, 'narada.mcp.json_rpc_contract.v1');
  assert.equal(contract.jsonrpc_version, '2.0');
  assert.equal(contract.methods.initialize, 'initialize');
  assert.equal(contract.methods.initialized_notification, 'notifications/initialized');
  assert.equal(contract.methods.tools_list, 'tools/list');
  assert.equal(contract.methods.tools_call, 'tools/call');
});
