import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadSiteMcpFabric,
  mcpServerNames,
  projectServerEnvironment,
} from './mcp-fabric.mjs';

const siteRoot = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-'));
mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(siteRoot, '.narada', 'capabilities'), { recursive: true });
writeFileSync(join(siteRoot, '.ai', 'mcp', 'fixture-mcp.json'), `${JSON.stringify({
  schema: 'narada.mcp.client_config.v0',
  mcpServers: {
    fixture: {
      command: 'node',
      args: ['{site_root}/tools/fixture.mjs'],
      env_vars: ['NARADA_AGENT_ID'],
      env: { FIXTURE_STATIC: 'yes' },
      surface_id: 'fixture.surface',
      target_site_root: '{site_root}',
      authority_posture: 'facade_only',
    },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(siteRoot, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.mcp_surfaces.v1',
  surfaces: [{
    surface_id: 'fixture.surface',
    client_config: { generated_path: '.ai/mcp/fixture-mcp.json' },
    tool_contract: {
      read_only_tools: ['fixture_read'],
      mutating_tools: ['task_lifecycle_claim'],
      refused_tools: ['fixture_refused'],
    },
  }],
}, null, 2)}\n`, 'utf8');

const fabric = loadSiteMcpFabric(siteRoot, { required: true });
assert.deepEqual(mcpServerNames(fabric), ['fixture']);
assert.equal(fabric.registry_validation.status, 'ok');
assert.equal(fabric.servers.fixture.command, process.execPath);
assert.equal(fabric.servers.fixture.args[0].includes(siteRoot.replaceAll('\\', '/')), true);
assert.equal(fabric.servers.fixture.target_site_root, siteRoot.replaceAll('\\', '/'));
assert.deepEqual(projectServerEnvironment(fabric.servers.fixture, {
  NARADA_AGENT_ID: 'narada.test',
}), {
  NARADA_AGENT_ID: 'narada.test',
  FIXTURE_STATIC: 'yes',
});
assert.equal(fabric.servers.fixture.registry_tools.fixture_read.read_only, true);
assert.equal(fabric.servers.fixture.registry_tools.task_lifecycle_claim.family, 'task_lifecycle_mutation');
assert.equal(fabric.servers.fixture.registry_tools.fixture_refused.refused, true);
assert.equal(fabric.servers.fixture.registry_metadata_authoritative, true);

rmSync(siteRoot, { recursive: true, force: true });

const legacyRegistrySite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-legacy-registry-'));
mkdirSync(join(legacyRegistrySite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(legacyRegistrySite, '.narada', 'capabilities'), { recursive: true });
writeFileSync(join(legacyRegistrySite, '.ai', 'mcp', 'legacy-mcp.json'), `${JSON.stringify({
  mcpServers: {
    legacy: {
      command: 'node',
      args: ['server.mjs'],
    },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(legacyRegistrySite, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.v0',
  mcp_surfaces: [{
    surface_id: 'legacy.surface',
    package: '@narada2/legacy-mcp',
    registered_live_tools: [
      'agent_context_hydrate_current',
      'agent_context_memory.record_checkpoint',
      'custom_registered_effect',
    ],
  }, {
    surface_id: 'stale.surface',
    client_config: { generated_path: '.ai/mcp/stale-mcp.json' },
    tool_contract: { read_only_tools: ['stale_read'] },
  }],
}, null, 2)}\n`, 'utf8');

const legacyFabric = loadSiteMcpFabric(legacyRegistrySite, { required: true });
assert.deepEqual(mcpServerNames(legacyFabric), ['legacy']);
assert.equal(legacyFabric.servers.legacy.registry_tools.agent_context_hydrate_current.read_only, true);
assert.equal(legacyFabric.servers.legacy.registry_tools['agent_context_memory.record_checkpoint'].read_only, false);
assert.equal(legacyFabric.servers.legacy.registry_tools.custom_registered_effect.read_only, false);
assert.equal(legacyFabric.servers.legacy.registry_metadata_authoritative, true);
assert.equal(legacyFabric.registry_validation.status, 'mismatch');
assert.equal(legacyFabric.registry_validation.missing[0].surface_id, 'stale.surface');
assert.throws(
  () => loadSiteMcpFabric(legacyRegistrySite, { required: true, validateRegistry: true }),
  /MCP fabric does not match registry/,
);
rmSync(legacyRegistrySite, { recursive: true, force: true });

