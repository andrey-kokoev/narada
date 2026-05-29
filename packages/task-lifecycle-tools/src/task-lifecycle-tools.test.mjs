import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

test('task lifecycle tool package owns executable lifecycle scripts', async () => {
  const files = (await readdir(root)).filter((name) => /\.(mjs|ps1)$/i.test(name));
  assert.ok(files.length >= 60, `expected task lifecycle scripts, got ${files.length}`);
  assert.ok(files.includes('task-mcp-server.mjs'));
  assert.ok(files.includes('task-create.mjs'));
  assert.ok(files.includes('task-finish.mjs'));
  for (const file of files) {
    const text = await readFile(join(root, file), 'utf8');
    assert.notEqual(text.trim(), '', `${file} has content`);
  }
});
