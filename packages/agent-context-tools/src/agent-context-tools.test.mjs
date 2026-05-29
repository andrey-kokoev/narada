import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

test('agent context tool package owns site agent-context scripts', async () => {
  const files = (await readdir(root)).filter((name) => name.endsWith('.mjs'));
  assert.ok(files.length >= 10, `expected agent-context scripts, got ${files.length}`);
  assert.ok(files.includes('agent-context-mcp-server.mjs'));
  assert.ok(files.includes('session-start.mjs'));
  for (const file of files) {
    const text = await readFile(join(root, file), 'utf8');
    assert.notEqual(text.trim(), '', `${file} has content`);
  }
});
