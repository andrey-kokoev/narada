import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  auditAgentTuiProjection,
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
assert.equal(projectAudit.agent_tui.status, 'ok');
assert.equal(projectAudit.agent_tui.projected_server_count, 1);
assert.equal(projectAudit.agent_tui.stale_global_config_present, false);

const agentContextSite = join(workspace, 'agent-context-site');
mkdirSync(join(agentContextSite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(agentContextSite, '.narada', 'capabilities'), { recursive: true });
writeFileSync(join(agentContextSite, '.ai', 'mcp', 'agent-context-mcp.json'), `${JSON.stringify({
  mcpServers: {
    agent_context: {
      command: 'node',
      args: ['server.mjs'],
      surface_id: 'agent-context-mcp.local',
    },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(agentContextSite, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.mcp_surfaces.v1',
  surfaces: [{
    surface_id: 'agent-context-mcp.local',
    client_config: { generated_path: '.ai/mcp/agent-context-mcp.json' },
    tool_contract: { read_only_tools: ['agent_context_startup_sequence', 'mcp_output_show'], mutating_tools: [] },
  }],
}, null, 2)}\n`, 'utf8');
const agentContextAudit = auditSiteFabric(agentContextSite);
assert.equal(agentContextAudit.agent_tui.status, 'ok');
assert.deepEqual(agentContextAudit.agent_tui.missing_startup_tools, []);
assert.equal(agentContextAudit.agent_tui.output_reader_singular, true);
assert.equal(agentContextAudit.agent_tui.startup_tool_server, 'agent_context');
assert.equal(agentContextAudit.agent_tui.output_reader_server, 'agent_context');
assert.deepEqual(agentContextAudit.agent_tui.duplicate_projected_tools, []);
assert.deepEqual(agentContextAudit.agent_tui.projected_servers[0].tools, [
  'agent_context_startup_sequence',
  'mcp_output_show',
]);
mkdirSync(join(agentContextSite, '.ai', 'mcp', 'agent-tui'), { recursive: true });
writeFileSync(join(agentContextSite, '.ai', 'mcp', 'agent-tui', 'mcp-config.json'), '{}\n', 'utf8');
const staleAgentTuiAudit = auditAgentTuiProjection(agentContextSite, agentContextAudit.servers ? null : null);
assert.equal(staleAgentTuiAudit.status, 'not_checked');
const staleSiteAudit = auditSiteFabric(agentContextSite);
assert.equal(staleSiteAudit.agent_tui.status, 'fail');
assert.equal(staleSiteAudit.agent_tui.failure_codes.includes('agent_tui_stale_global_config_present'), true);

const splitStartupSite = join(workspace, 'split-startup-site');
mkdirSync(join(splitStartupSite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(splitStartupSite, '.narada', 'capabilities'), { recursive: true });
writeFileSync(join(splitStartupSite, '.ai', 'mcp', 'split-mcp.json'), `${JSON.stringify({
  mcpServers: {
    agent_context: { command: 'node', args: ['agent-context.mjs'], surface_id: 'agent-context-mcp.local' },
    output_reader: { command: 'node', args: ['output-reader.mjs'], surface_id: 'output-reader-mcp.local' },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(splitStartupSite, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.mcp_surfaces.v1',
  surfaces: [{
    surface_id: 'agent-context-mcp.local',
    client_config: { generated_path: '.ai/mcp/split-mcp.json' },
    tool_contract: { read_only_tools: ['agent_context_startup_sequence'], mutating_tools: [] },
  }, {
    surface_id: 'output-reader-mcp.local',
    client_config: { generated_path: '.ai/mcp/split-mcp.json' },
    tool_contract: { read_only_tools: ['mcp_output_show'], mutating_tools: [] },
  }],
}, null, 2)}\n`, 'utf8');
const splitStartupAudit = auditSiteFabric(splitStartupSite);
assert.equal(splitStartupAudit.agent_tui.status, 'ok');
assert.equal(splitStartupAudit.agent_tui.output_reader_singular, true);
assert.equal(splitStartupAudit.agent_tui.startup_tool_server, 'agent_context');
assert.equal(splitStartupAudit.agent_tui.output_reader_server, 'output_reader');

const duplicateToolSite = join(workspace, 'duplicate-tool-site');
mkdirSync(join(duplicateToolSite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(duplicateToolSite, '.narada', 'capabilities'), { recursive: true });
writeFileSync(join(duplicateToolSite, '.ai', 'mcp', 'duplicate-mcp.json'), `${JSON.stringify({
  mcpServers: {
    first: { command: 'node', args: ['first.mjs'], surface_id: 'first.surface' },
    second: { command: 'node', args: ['second.mjs'], surface_id: 'second.surface' },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(duplicateToolSite, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.mcp_surfaces.v1',
  surfaces: [{
    surface_id: 'first.surface',
    client_config: { generated_path: '.ai/mcp/duplicate-mcp.json' },
    tool_contract: { read_only_tools: ['shared_read'], mutating_tools: [] },
  }, {
    surface_id: 'second.surface',
    client_config: { generated_path: '.ai/mcp/duplicate-mcp.json' },
    tool_contract: { read_only_tools: ['shared_read'], mutating_tools: [] },
  }],
}, null, 2)}\n`, 'utf8');
const duplicateToolAudit = auditSiteFabric(duplicateToolSite);
assert.equal(duplicateToolAudit.agent_tui.status, 'fail');
assert.equal(duplicateToolAudit.agent_tui.failure_codes.includes('agent_tui_duplicate_projected_tool_names'), true);
assert.deepEqual(duplicateToolAudit.agent_tui.duplicate_projected_tools, [{ tool: 'shared_read', owners: ['first', 'second'] }]);

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
