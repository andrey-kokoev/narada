import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  directRoutingPhrases,
  directToolRoutes,
  loadOperatorRoutingContract,
  readerRoutingPhrases,
  readerRoutes,
  toolAliasGroups,
} from './carrier-routing-contract.mjs';

test('operator routing contract exposes direct and reader routing vocabulary', () => {
  const contract = loadOperatorRoutingContract();
  assert.equal(contract.schema, 'narada.carrier.operator_routing_contract.v1');
  assert.equal(contract.tool_call_envelope.field, 'narada_tool_call');
  assert.equal(contract.tool_call_envelope.fenced_json_admitted, true);
  assert.deepEqual(
    directToolRoutes(contract).map((route) => route.id),
    ['startup_sequence'],
  );
  assert.deepEqual(directRoutingPhrases(contract), ['run startup sequence', 'startup sequence']);
  assert.deepEqual(
    readerRoutes(contract).map((route) => route.id),
    ['mcp_output_reader'],
  );
  assert.deepEqual(readerRoutingPhrases(contract), [
    'mcp_output_show',
    'output reader',
    'startup output reader',
    'read startup output',
    'read the startup output',
    'read the output ref',
  ]);
  assert.deepEqual(toolAliasGroups(contract), [
    {
      id: 'startup_sequence',
      tools: ['agent_context_startup_sequence', 'startup_sequence'],
    },
    {
      id: 'mcp_payload_reader',
      tools: ['mcp_payload_show', 'mcp_payload_read'],
    },
  ]);
});
