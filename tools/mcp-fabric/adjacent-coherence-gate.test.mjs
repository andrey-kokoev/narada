import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMcpSurfaceRegistry } from './generate-mcp-surface-registry.mjs';
import { writeMissingIdentityProjections } from './launch-identity-projection.mjs';
import { runAdjacentCoherenceGate, secretMarkers } from './adjacent-coherence-gate.mjs';

const workspace = mkdtempSync(join(tmpdir(), 'narada-adjacent-gate-'));
const siteRoot = join(workspace, 'site');
mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
writeFileSync(join(siteRoot, 'narada-site.ps1'), '# launcher\n', 'utf8');
writeFileSync(join(siteRoot, '.ai', 'mcp', 'site-agent-context-mcp.json'), `${JSON.stringify({
  mcpServers: {
    'site-agent-context': {
      command: 'node',
      args: ['server.mjs'],
      surface_id: 'agent-context-mcp.local',
    },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(siteRoot, '.ai', 'mcp', 'site-inbox-mcp.json'), `${JSON.stringify({
  mcpServers: {
    'site-inbox': {
      command: 'node',
      args: ['server.mjs'],
      surface_id: 'inbox-mcp.local',
    },
  },
}, null, 2)}\n`, 'utf8');

const registryPath = join(workspace, 'agents.psd1');
writeFileSync(registryPath, `@{
  Agents = @(
    @{
      Agent = "site.architect"
      NaradaRoot = "${siteRoot}"
      Launcher = "narada-site.ps1"
      Runtime = "codex"
      EnableNativeShell = $false
    }
  )
}
`, 'utf8');

writeMcpSurfaceRegistry(siteRoot, { generatedAt: '2026-01-01T00:00:00.000Z' });
writeMissingIdentityProjections(registryPath, { generatedAt: '2026-01-01T00:00:00.000Z' });

let result = runAdjacentCoherenceGate({ launchRegistryPath: registryPath, repoRoot: workspace });
assert.equal(result.status, 'fail');
assert.equal(result.failures.some((failure) => failure.code === 'required_coherence_doc_missing'), true);

mkdirSync(join(workspace, 'docs', 'operations'), { recursive: true });
mkdirSync(join(workspace, 'docs', 'product'), { recursive: true });
mkdirSync(join(workspace, 'docs', 'concepts'), { recursive: true });
for (const path of [
  join(workspace, 'docs', 'operations', 'coherence-closure-ledger.md'),
  join(workspace, 'docs', 'product', 'mailbox-to-task-admission-standard.md'),
  join(workspace, 'docs', 'concepts', 'central-launch-registry-boundary.md'),
  join(workspace, 'docs', 'concepts', 'startup-sequence-contract.md'),
  join(workspace, 'docs', 'concepts', 'auth-secret-posture.md'),
]) {
  writeFileSync(path, '# Fixture\n', 'utf8');
}

result = runAdjacentCoherenceGate({ launchRegistryPath: registryPath, repoRoot: workspace });
assert.equal(result.status, 'warn');
assert.deepEqual(result.failures, []);
assert.equal(result.checks.startup_declaration_status, 'ok');
assert.equal(result.checks.startup_runtime_verified, false);
assert.equal(result.warnings.some((warning) => warning.code === 'startup_contract_runtime_not_verified_by_static_gate'), true);
assert.deepEqual(secretMarkers('api_key = "sk-live-value"'), ['api_key: <redacted>']);
assert.deepEqual(secretMarkers('credential_ref: env:GRAPH_CLIENT_SECRET'), []);

rmSync(workspace, { recursive: true, force: true });
console.log('adjacent-coherence-gate tests PASSED.');
