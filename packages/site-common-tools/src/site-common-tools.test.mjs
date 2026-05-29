import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

async function listScripts(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await listScripts(path));
    } else if (/\.(mjs|ps1|py)$/i.test(entry.name)) {
      result.push(path);
    }
  }
  return result;
}

test('site common tools package owns remaining shared site tool scripts', async () => {
  const scripts = await listScripts(root);
  assert.ok(scripts.length >= 80, `expected common site tools, got ${scripts.length}`);
  for (const required of [
    'inbox/inbox-index.mjs',
    'site-config/validate-site-config.mjs',
    'site-identity/site-identity-mcp-server.mjs',
    'mcp-payload-file.mjs',
  ]) {
    assert.ok(scripts.some((path) => path.replace(/\\/g, '/').endsWith(required)), `${required} is packaged`);
  }
  for (const script of scripts) {
    const text = await readFile(script, 'utf8');
    assert.notEqual(text.trim(), '', `${script} has content`);
  }
});
