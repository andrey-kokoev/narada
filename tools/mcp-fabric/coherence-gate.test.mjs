import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMcpSurfaceRegistry } from './generate-mcp-surface-registry.mjs';
import { runCoherenceGate } from './coherence-gate.mjs';

const workspace = mkdtempSync(join(tmpdir(), 'narada-coherence-gate-'));
const siteRoot = join(workspace, 'site');
mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
writeFileSync(join(siteRoot, '.ai', 'mcp', 'fixture-mcp.json'), `${JSON.stringify({
  mcpServers: {
    'fixture-agent-context': {
      command: 'node',
      args: ['agent-context.mjs'],
      surface_id: 'fixture-agent-context.local',
      tools: ['agent_context_startup_sequence', 'mcp_output_show'],
    },
    'fixture-task-lifecycle': {
      command: 'node',
      args: ['task-lifecycle.mjs'],
      surface_id: 'fixture-task-lifecycle.local',
    },
  },
}, null, 2)}\n`, 'utf8');

const registryPath = join(workspace, 'agents.psd1');
writeFileSync(registryPath, `@{
  Agents = @(
    @{
      Agent = "fixture.architect"
      NaradaRoot = "${siteRoot}"
      Runtime = "codex"
      EnableNativeShell = $true
    }
  )
}
`, 'utf8');

const failing = runCoherenceGate({ launchRegistryPath: registryPath });
assert.equal(failing.status, 'fail');
assert.equal(failing.failures.some((failure) => failure.code === 'site_not_authoritatively_registered'), true);
assert.equal(failing.failures.some((failure) => failure.code === 'codex_native_shell_enabled'), true);

writeMcpSurfaceRegistry(siteRoot, { generatedAt: '2026-01-01T00:00:00.000Z' });
writeFileSync(registryPath, `@{
  Agents = @(
    @{
      Agent = "fixture.architect"
      NaradaRoot = "${siteRoot}"
      Runtime = "codex"
      EnableNativeShell = $false
    }
  )
}
`, 'utf8');

const passing = runCoherenceGate({ launchRegistryPath: registryPath });
assert.equal(passing.status, 'ok');
assert.deepEqual(passing.failures, []);

writeFileSync(registryPath, `@{
  Agents = @(
    @{
      Agent = "fixture.architect"
      NaradaRoot = "${siteRoot}"
      Runtime = "pi"
      EnableNativeShell = $false
    }
  )
}
`, 'utf8');
const advisory = runCoherenceGate({ launchRegistryPath: registryPath });
assert.equal(advisory.status, 'ok');
assert.deepEqual(advisory.failures, []);

rmSync(workspace, { recursive: true, force: true });
