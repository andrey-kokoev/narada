import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root: any = dirname(fileURLToPath(import.meta.url));

async function listScripts(dir: any) : Promise<any>{
  const result: any = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path: any = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await listScripts(path));
    } else if (/\.(ts|ps1|py)$/i.test(entry.name)) {
      result.push(path);
    }
  }
  return result;
}

test('site common tools package owns remaining shared site tool scripts', async () => {
  const scripts: any = await listScripts(root);
  assert.ok(scripts.length >= 60, `expected common site tools, got ${scripts.length}`);
  for (const required of [
    'inbox/inbox-index.ts',
    'site-config/validate-site-config.ts',
    'site-identity/site-identity-mcp-server.ts',
    'mcp-payload-file.ts',
  ]) {
    assert.ok(scripts.some((path: any) => path.replace(/\\/g, '/').endsWith(required)), `${required} is packaged`);
  }
  for (const script of scripts) {
    const text: any = await readFile(script, 'utf8');
    assert.notEqual(text.trim(), '', `${script} has content`);
  }
});
