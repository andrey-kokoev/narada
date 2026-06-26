import test from 'node:test';
import assert from 'node:assert/strict';
import { delimiter, join } from 'node:path';
import { codexCommand } from './codex-subscription-command.mjs';

function existsFactory(paths) {
  const normalized = new Set(paths.map((path) => path.toLowerCase()));
  return (path) => normalized.has(String(path).toLowerCase());
}

test('codexCommand prefers NARADA_CODEX_EXEC_COMMAND and parses prefix args', () => {
  const result = codexCommand({
    processEnv: {
      NARADA_CODEX_EXEC_COMMAND: 'node',
      NARADA_CODEX_EXEC_PREFIX_ARGS: '["D:/tools/codex.js"]',
      NARADA_CODEX_COMMAND: 'ignored-codex',
      CODEX_COMMAND: 'ignored-code-command',
    },
    platform: 'win32',
  });
  assert.deepEqual(result, {
    command: 'node',
    prefixArgs: ['D:/tools/codex.js'],
    source: 'NARADA_CODEX_EXEC_COMMAND',
  });
});

test('codexCommand resolves Windows codex.ps1 through sibling node shim', () => {
  const fakeBin = 'C:/fake/bin';
  const script = join(fakeBin, 'codex.ps1');
  const node = join(fakeBin, 'node.exe');
  const codexJs = join(fakeBin, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  const result = codexCommand({
    processEnv: { PATH: fakeBin },
    platform: 'win32',
    exists: existsFactory([script, node, codexJs]),
  });
  assert.equal(result.command, node);
  assert.deepEqual(result.prefixArgs, [codexJs]);
  assert.equal(result.source, 'path_ps1_node_shim');
});

test('codexCommand falls back to noninteractive pwsh when ps1 sibling node shim is unavailable', () => {
  const fakeBin = 'C:/fake/bin';
  const script = join(fakeBin, 'codex.ps1');
  const result = codexCommand({
    processEnv: { PATH: fakeBin },
    platform: 'win32',
    exists: existsFactory([script]),
  });
  assert.equal(result.command, 'pwsh');
  assert.deepEqual(result.prefixArgs, ['-NoProfile', '-NonInteractive', '-File', script]);
  assert.equal(result.source, 'path_ps1');
});

test('codexCommand resolves Windows codex.cmd directly', () => {
  const fakeBin = 'C:/fake/bin';
  const command = join(fakeBin, 'codex.cmd');
  const result = codexCommand({
    processEnv: { PATH: fakeBin },
    platform: 'win32',
    exists: existsFactory([command]),
  });
  assert.equal(result.command, command);
  assert.deepEqual(result.prefixArgs, []);
  assert.equal(result.source, 'path_executable');
});

test('codexCommand searches multiple PATH entries on Windows', () => {
  const first = 'C:/empty/bin';
  const second = 'C:/fake/bin';
  const command = join(second, 'codex.exe');
  const result = codexCommand({
    processEnv: { PATH: `${first}${delimiter}${second}` },
    platform: 'win32',
    exists: existsFactory([command]),
  });
  assert.equal(result.command, command);
  assert.equal(result.source, 'path_executable');
});

test('codexCommand falls back to bare codex outside Windows', () => {
  const result = codexCommand({ processEnv: { PATH: '' }, platform: 'linux' });
  assert.deepEqual(result, { command: 'codex', prefixArgs: [], source: 'default' });
});
