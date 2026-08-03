import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveCodexCommand } from '../src/codex.js';

test('configured Codex command takes precedence', () => {
  assert.equal(
    resolveCodexCommand({ CODEX_COMMAND: '  C:\\tools\\codex.cmd  ' }, 'win32', 'C:\\node\\node.exe'),
    'C:\\tools\\codex.cmd',
  );
});

test('Windows falls back to codex.cmd beside the active Node executable', () => {
  const executablePath = path.join('C:\\Users\\user', 'fnm', 'node.exe');
  const expected = path.join(path.dirname(executablePath), 'codex.cmd');
  assert.equal(resolveCodexCommand({}, 'win32', executablePath, (candidate) => candidate === expected), expected);
});

test('non-Windows keeps the PATH-resolved Codex command', () => {
  assert.equal(resolveCodexCommand({}, 'linux', '/usr/bin/node', () => true), 'codex');
});