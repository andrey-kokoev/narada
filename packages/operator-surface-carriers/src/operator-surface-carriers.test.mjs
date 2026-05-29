import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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

test('operator surface carrier package owns executable carrier scripts', async () => {
  assert.equal(existsSync(join(root, 'windows-glue', 'Start-AgentOperatorSurfaceCarrierChild.ps1')), true);
  const scripts = await listScripts(root);
  assert.ok(scripts.length >= 50, `expected substantial carrier surface, got ${scripts.length}`);
  for (const script of scripts) {
    const text = await readFile(script, 'utf8');
    assert.notEqual(text.trim(), '', `${script} has content`);
  }
});
