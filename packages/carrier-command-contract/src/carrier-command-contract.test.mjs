import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandRecords, commandTokens, loadCommandContract } from './carrier-command-contract.mjs';

test('command contract exposes carrier command vocabulary', () => {
  const contract = loadCommandContract();
  assert.equal(contract.schema, 'narada.carrier.command_contract.v1');
  assert.deepEqual(commandRecords(contract).map((command) => command.name), [
    'help',
    'status',
    'stats',
    'model',
    'thinking',
    'tool_output',
    'tools',
    'queue_show',
    'queue_clear',
    'queue_drop',
    'clear',
    'exit',
  ]);
  assert.deepEqual(commandTokens(contract), [
    '/help',
    '/status',
    '/stats',
    '/model',
    '/thinking',
    '/tool-output',
    '/tool-outputs',
    '/tools',
    '/tool',
    '/queue',
    '/queue clear',
    '/queue drop <index>',
    '/clear',
    '/exit',
    '/quit',
    'exit',
  ]);
});
