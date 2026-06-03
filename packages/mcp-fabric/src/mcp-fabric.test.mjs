import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  McpFabricError,
  loadSiteMcpFabric,
  mcpServerNames,
  projectServerEnvironment,
  renderMcpFabricDoctorTable,
  runMcpFabricDoctor,
} from './mcp-fabric.mjs';

const missingSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-missing-'));
try {
  assert.throws(
    () => loadSiteMcpFabric(missingSite, { required: true }),
    (error) => {
      assert.equal(error instanceof McpFabricError, true);
      assert.equal(error.code, 'mcp_fabric_missing');
      assert.equal(error.details.siteRoot, missingSite);
      assert.equal(error.details.mcpDir, join(missingSite, '.ai', 'mcp'));
      return true;
    },
  );
} finally {
  rmSync(missingSite, { recursive: true, force: true });
}

const emptySite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-empty-'));
mkdirSync(join(emptySite, '.ai', 'mcp'), { recursive: true });
try {
  assert.throws(
    () => loadSiteMcpFabric(emptySite, { required: true }),
    (error) => {
      assert.equal(error instanceof McpFabricError, true);
      assert.equal(error.code, 'mcp_fabric_empty');
      assert.deepEqual(error.details.files, []);
      return true;
    },
  );
} finally {
  rmSync(emptySite, { recursive: true, force: true });
}

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

const windowsPathSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-windows-paths-'));
mkdirSync(join(windowsPathSite, '.ai', 'mcp'), { recursive: true });
writeFileSync(join(windowsPathSite, '.ai', 'mcp', 'windows-mcp.json'), `${JSON.stringify({
  mcpServers: {
    windows: {
      command: 'node',
      args: ['D:\\code\\narada.sonar\\tools\\server.mjs', '{site_root}\\tools\\fixture.mjs'],
      target_site_root: '{site_root}\\subdir',
    },
  },
}, null, 2)}\n`, 'utf8');

const windowsFabric = loadSiteMcpFabric(windowsPathSite, { required: true });
assert.equal(windowsFabric.servers.windows.args[0], 'D:/code/narada.sonar/tools/server.mjs');
assert.equal(windowsFabric.servers.windows.args[1], `${windowsPathSite.replaceAll('\\', '/')}/tools/fixture.mjs`);
assert.equal(windowsFabric.servers.windows.target_site_root, `${windowsPathSite.replaceAll('\\', '/')}/subdir`);
rmSync(windowsPathSite, { recursive: true, force: true });

const doctorSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-doctor-'));
mkdirSync(join(doctorSite, '.ai', 'mcp'), { recursive: true });
const doctorServerPath = join(doctorSite, 'doctor-server.mjs');
writeFileSync(doctorServerPath, `
import readline from 'node:readline';
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') {
    console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05' } }));
    return;
  }
  if (request.method === 'tools/list') {
    console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { tools: [
      { name: 'fixture_read', description: 'read', inputSchema: { type: 'object', properties: {} } },
      { name: 'fixture_write', description: 'write', inputSchema: { type: 'object', properties: {} } }
    ] } }));
  }
});
`, 'utf8');
writeFileSync(join(doctorSite, '.ai', 'mcp', 'doctor-mcp.json'), `${JSON.stringify({
  mcpServers: {
    doctor: {
      command: 'node',
      args: [doctorServerPath],
    },
  },
}, null, 2)}\n`, 'utf8');
const doctorReport = await runMcpFabricDoctor(doctorSite, { timeoutMs: 1000 });
assert.equal(doctorReport.status, 'ok');
assert.equal(doctorReport.rows[0].file, 'doctor-mcp.json');
assert.equal(doctorReport.rows[0].server, 'doctor');
assert.equal(doctorReport.rows[0].path_normalization, 'ok');
assert.equal(doctorReport.rows[0].initialize_status, 'ok');
assert.equal(doctorReport.rows[0].tools_list_count, 2);
const doctorTable = renderMcpFabricDoctorTable(doctorReport);
assert.match(doctorTable, /file\s+server\s+command\s+paths\s+init\s+tools\s+first diagnostic/);
assert.match(doctorTable, /doctor-mcp\.json\s+doctor/);
const doctorCli = spawnSync(process.execPath, [
  fileURLToPath(new URL('./mcp-fabric.mjs', import.meta.url)),
  '--site-root',
  doctorSite,
  '--timeout-ms',
  '1000',
], { encoding: 'utf8' });
assert.equal(doctorCli.status, 0, doctorCli.stderr);
assert.match(doctorCli.stdout, /file\s+server\s+command\s+paths\s+init\s+tools\s+first diagnostic/);
assert.match(doctorCli.stdout, /doctor-mcp\.json\s+doctor/);
rmSync(doctorSite, { recursive: true, force: true });

const failingDoctorSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-doctor-fail-'));
mkdirSync(join(failingDoctorSite, '.ai', 'mcp'), { recursive: true });
const failingServerPath = join(failingDoctorSite, 'failing-server.mjs');
writeFileSync(failingServerPath, 'setInterval(() => {}, 1000);\\n', 'utf8');
writeFileSync(join(failingDoctorSite, '.ai', 'mcp', 'failing-mcp.json'), `${JSON.stringify({
  mcpServers: {
    failing: {
      command: 'node',
      args: [failingServerPath],
    },
  },
}, null, 2)}\n`, 'utf8');
const failingReport = await runMcpFabricDoctor(failingDoctorSite, { timeoutMs: 25 });
assert.equal(failingReport.status, 'failed');
assert.equal(failingReport.rows[0].initialize_status, 'timeout');
assert.match(failingReport.rows[0].first_diagnostic, /initialize_timeout/);
rmSync(failingDoctorSite, { recursive: true, force: true });

console.log('mcp-fabric tests PASSED.');
