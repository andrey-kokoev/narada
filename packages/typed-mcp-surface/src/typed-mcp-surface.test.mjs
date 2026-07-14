import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { assertCanonicalSiteLocus } from '../../site-common-tools/src/site-locus-shim.mjs';

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

test('legacy User Site loci are hard-rejected', () => {
  for (const value of ['narada-andrey', 'narada-user-site']) {
    assert.throws(
      () => assertCanonicalSiteLocus(value, 'test.site_id'),
      /legacy_site_locus_rejected:test\.site_id/,
    );
  }
  assert.equal(assertCanonicalSiteLocus('andrey-user', 'test.site_id'), 'andrey-user');
});

test('carrier projections derive only from registry authority', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-carrier-projection-'));
  try {
    mkdirSync(join(siteRoot, '.narada', 'capabilities'), { recursive: true });
    mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
    const registry = {
      schema: 'narada.site.capabilities.mcp_surfaces.v1',
      site_id: 'andrey-user',
      surfaces: [{
        surface_id: 'fixture-surface',
        runtime_binding: {
          owner_site_id: 'andrey-user',
          transport: { type: 'stdio', command: 'node', args: ['D:/canonical/fixture-server.mjs', '--site-root', '{site_root}'] },
        },
        client_config: { generated_path: '.ai/mcp/stale-fixture-mcp.json' },
        authority_boundary: { posture: 'site_local' },
        tool_contract: { read_only_tools: ['fixture_read'], mutating_tools: [] },
      }],
    };
    writeFileSync(join(siteRoot, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    writeFileSync(join(siteRoot, '.ai', 'mcp', 'stale-fixture-mcp.json'), `${JSON.stringify({
      mcpServers: { 'stale-fixture': { command: 'node', args: ['C:/removed/legacy-server.mjs'] } },
    }, null, 2)}\n`, 'utf8');

    const generator = join(root, 'generate-carrier-mcp-config.mjs');
    const writeResult = spawnSync(process.execPath, [generator, '--site-root', siteRoot, '--carrier', 'all', '--write'], { encoding: 'utf8' });
    assert.equal(writeResult.status, 0, writeResult.stderr);
    for (const carrier of ['kimi', 'codex']) {
      const projection = JSON.parse(readFileSync(join(siteRoot, '.ai', 'mcp', 'carriers', `narada-andrey-user-${carrier}.mcp.json`), 'utf8'));
      const text = JSON.stringify(projection);
      assert.match(text, /D:\/canonical\/fixture-server\.mjs/);
      assert.doesNotMatch(text, /removed\/legacy-server/);
      assert.match(projection.generated_from.registry_sha256, /^[a-f0-9]{64}$/);
      assert.equal(projection.snippet_policy.default, 'registry_only');
    }
    const checkResult = spawnSync(process.execPath, [generator, '--site-root', siteRoot, '--carrier', 'all', '--check'], { encoding: 'utf8' });
    assert.equal(checkResult.status, 0, checkResult.stderr);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});
