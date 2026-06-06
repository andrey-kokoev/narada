import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandRecords, commandTokens, loadCommandContract } from './carrier-command-contract.mjs';

test('command contract exposes carrier command vocabulary', () => {
  const contract = loadCommandContract();
  assert.equal(contract.schema, 'narada.carrier.command_contract.v1');
  assert.deepEqual(commandRecords(contract).map((command) => command.name), [
    'help',
    'status',
    'goal',
    'stats',
    'model',
    'thinking',
    'tool_output',
    'tools',
    'observers',
    'observer_mute',
    'observer_unmute',
    'queue_show',
    'queue_clear',
    'queue_drop',
    'clear',
    'exit',
  ]);
  assert.deepEqual(commandTokens(contract), [
    '/help',
    '/status',
    '/goal',
    '/stats',
    '/model',
    '/thinking',
    '/tool-output',
    '/tool-outputs',
    '/tools',
    '/tool',
    '/observers',
    '/observer mute',
    '/observer unmute',
    '/queue',
    '/queue clear',
    '/queue drop <index>',
    '/clear',
    '/exit',
    '/quit',
    'exit',
  ]);
});
