import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const scripts = [
  'adr-mcp-server.mjs',
  'ee-mcp-server.mjs',
  'generate-carrier-mcp-config.mjs',
  'inbox-admission-log.mjs',
  'inbox-admit.mjs',
  'inbox-mcp-server.mjs',
  'Invoke-EeMcpPrototype.ps1',
  'Invoke-InboxMcpPrototype.ps1',
  'validate-mcp-surface-registry.mjs',
];

test('typed MCP package owns the historical surface scripts', async () => {
  for (const script of scripts) {
    const path = join(root, script);
    assert.equal(existsSync(path), true, `${script} is packaged`);
    const text = await readFile(path, 'utf8');
    assert.notEqual(text.trim(), '', `${script} has content`);
  }
});
