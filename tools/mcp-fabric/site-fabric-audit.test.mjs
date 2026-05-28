import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  agentBlocks,
  auditLauncherKnownSites,
  auditSiteFabric,
  effectiveSiteRoot,
  launcherKnownSites,
  parseLaunchRegistry,
  parseLaunchRegistryText,
  registryPathForSite,
  siteRecommendation,
} from './site-fabric-audit.mjs';

const workspace = mkdtempSync(join(tmpdir(), 'narada-site-fabric-audit-'));
const projectSite = join(workspace, 'project-site');
mkdirSync(join(projectSite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(projectSite, '.narada', 'capabilities'), { recursive: true });
writeFileSync(join(projectSite, '.ai', 'mcp', 'fixture-mcp.json'), `${JSON.stringify({
  mcpServers: {
    fixture: {
      command: 'node',
      args: ['server.mjs'],
      surface_id: 'fixture.surface',
    },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(projectSite, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.mcp_surfaces.v1',
  surfaces: [{
    surface_id: 'fixture.surface',
    client_config: { generated_path: '.ai/mcp/fixture-mcp.json' },
    tool_contract: { read_only_tools: ['fixture_read'], mutating_tools: [] },
  }],
}, null, 2)}\n`, 'utf8');

const projectAudit = auditSiteFabric(projectSite);
assert.equal(projectAudit.registry.shape, 'surfaces');
assert.equal(projectAudit.tolerant_load.status, 'ok');
assert.equal(projectAudit.strict_validation.status, 'ok');
assert.equal(projectAudit.mcp_server_count, 1);
assert.equal(projectAudit.authoritative_server_count, 1);
assert.equal(projectAudit.recommendation, 'ok');

const dotNaradaSite = join(workspace, 'dot-site', '.narada');
mkdirSync(join(dotNaradaSite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(dotNaradaSite, 'capabilities'), { recursive: true });
writeFileSync(join(dotNaradaSite, '.ai', 'mcp', 'legacy-mcp.json'), `${JSON.stringify({
  mcpServers: {
    legacy: {
      command: 'node',
      args: ['server.mjs'],
    },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(dotNaradaSite, 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.v0',
  mcp_surfaces: [{
    surface_id: 'legacy.surface',
    package: '@narada2/legacy-mcp',
    registered_live_tools: ['agent_context_hydrate_current'],
  }, {
    surface_id: 'stale.surface',
    client_config: { generated_path: '.ai/mcp/stale-mcp.json' },
    tool_contract: { read_only_tools: ['stale_read'] },
  }],
}, null, 2)}\n`, 'utf8');
assert.equal(registryPathForSite(dotNaradaSite), join(dotNaradaSite, 'capabilities', 'mcp-surfaces.json'));
assert.equal(effectiveSiteRoot(join(workspace, 'dot-site')), dotNaradaSite);
const legacyAudit = auditSiteFabric(dotNaradaSite);
assert.equal(legacyAudit.registry.shape, 'mcp_surfaces');
assert.equal(legacyAudit.tolerant_load.status, 'ok');
assert.equal(legacyAudit.strict_validation.status, 'mismatch');
assert.equal(legacyAudit.stale_registry_surfaces[0].surface_id, 'stale.surface');
assert.equal(legacyAudit.recommendation, 'remove_stale_surfaces');

const noRegistrySite = join(workspace, 'no-registry-site');
mkdirSync(join(noRegistrySite, '.ai', 'mcp'), { recursive: true });
writeFileSync(join(noRegistrySite, '.ai', 'mcp', 'unbound-mcp.json'), `${JSON.stringify({
  mcpServers: {
    unbound: {
      command: 'node',
      args: ['server.mjs'],
    },
  },
}, null, 2)}\n`, 'utf8');
const noRegistryAudit = auditSiteFabric(noRegistrySite);
assert.equal(noRegistryAudit.registry.status, 'absent');
assert.equal(noRegistryAudit.recommendation, 'no_registry_claim');
assert.equal(siteRecommendation({
  registry: { status: 'loaded', authoritative_claim: false },
  tolerantLoad: { status: 'ok' },
  strictValidation: { status: 'ok' },
  serverCount: 0,
  liveUnboundServers: [],
}), 'no_registry_claim');

const registryPath = join(workspace, 'agents.psd1');
writeFileSync(registryPath, `@{
  NaradaRoot = "${projectSite}"
  Launcher = "narada-default.ps1"
  Runtime = "codex"
  EnableNativeShell = $true

  Agents = @(
    @{
      Agent = "narada.test.architect"
      Title = "Test Architect"
      Launcher = "narada-test.ps1"
    }
    @{
      Agent = "narada.test.builder"
      Runtime = "pi"
      EnableNativeShell = $false
    }
  )
}
`, 'utf8');
const records = parseLaunchRegistry(registryPath);
assert.equal(records.length, 2);
assert.equal(agentBlocks(`@{
  NaradaRoot = "C:\\Narada"
  Agents = @(
    @{
      Agent = "a"
    }
    @{
      Agent = "b"
    }
  )
}`).length, 2);
assert.equal(records[0].agent, 'narada.test.architect');
assert.equal(records[0].narada_root, projectSite);
assert.equal(records[0].launcher, 'narada-test.ps1');
assert.equal(records[0].runtime, 'codex');
assert.equal(records[0].enable_native_shell, true);
assert.equal(records[1].launcher, 'narada-default.ps1');
assert.equal(records[1].enable_native_shell, false);
const knownSites = launcherKnownSites(registryPath);
assert.equal(knownSites.length, 1);
assert.deepEqual(knownSites[0].runtimes.sort(), ['codex', 'pi']);
const launcherAudit = auditLauncherKnownSites(registryPath);
assert.equal(launcherAudit.site_count, 1);
assert.equal(launcherAudit.sites[0].recommendation, 'ok');
assert.equal(launcherAudit.mutation_performed, false);

assert.deepEqual(parseLaunchRegistryText('@{ Agents = @() }'), []);

rmSync(workspace, { recursive: true, force: true });
console.log('site-fabric-audit tests PASSED.');
