import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandRecords, commandTokens, loadCommandContract, resolveCommandInput } from './carrier-command-contract.mjs';

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
    '/tools',
    '/observers',
    '/observer mute',
    '/observer unmute',
    '/queue',
    '/queue clear',
    '/queue drop <index>',
    '/clear',
    '/exit',
  ]);
  const goal = commandRecords(contract).find((command) => command.name === 'goal');
  assert.equal(goal.argument, 'text|pause|resume|clear');
  assert.equal(goal.effect, 'show_set_pause_resume_or_clear_carrier_goal');
});

test('command resolver handles aliases and multi-word commands', () => {
  assert.equal(resolveCommandInput('/queue', 'clear')?.name, 'queue_clear');
  const drop = resolveCommandInput('/queue', 'drop 2');
  assert.equal(drop?.name, 'queue_drop');
  assert.equal(drop.argument, '2');
  assert.equal(resolveCommandInput('/model', 'GPT-5.5')?.argument, 'GPT-5.5');
  assert.equal(resolveCommandInput('/tool', ''), null);
  assert.equal(resolveCommandInput('exit', ''), null);
  assert.equal(resolveCommandInput('/missing', ''), null);
});
