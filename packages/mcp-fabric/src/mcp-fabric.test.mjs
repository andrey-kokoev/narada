import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  McpFabricError,
  loadSiteMcpFabric,
  mcpServerNames,
  projectFabricForAgentTui,
  projectServerEnvironment,
  renderMcpFabricDoctorTable,
  runMcpFabricDoctor,
} from './mcp-fabric.mjs';

const carrierClientFixture = JSON.parse(readFileSync(new URL('../fixtures/agent-tui-carrier-client-config.json', import.meta.url), 'utf8'));
assert.equal(carrierClientFixture.schema, 'narada.mcp.carrier_client_config.v0');
assert.deepEqual(carrierClientFixture.mcpServers['sonar-site-loop'].tools, ['site_loop_run_once', 'site_loop_status']);

const missingSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-missing-'));
try {
  assert.throws(
    () => loadSiteMcpFabric(missingSite, { required: true }),
    (error) => {
      assert.equal(error instanceof McpFabricError, true);
      assert.equal(error.code, 'mcp_fabric_missing');
      assert.equal(error.details.siteRoot, missingSite);
      assert.equal(error.details.mcpDir, join(missingSite, '.ai', 'mcp'));
      assert.deepEqual(error.details.candidate_mcp_dirs, [
        join(missingSite, '.ai', 'mcp'),
        join(missingSite, '.narada', '.ai', 'mcp'),
      ]);
      return true;
    },
  );
} finally {
  rmSync(missingSite, { recursive: true, force: true });
}

const containedSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-contained-'));
mkdirSync(join(containedSite, '.narada', '.ai', 'mcp'), { recursive: true });
try {
  writeFileSync(join(containedSite, '.narada', '.ai', 'mcp', 'contained-mcp.json'), `${JSON.stringify({
    mcpServers: {
      contained: { command: 'node', args: ['contained.mjs'] },
    },
  }, null, 2)}\n`, 'utf8');
  const containedFabric = loadSiteMcpFabric(containedSite, { required: true });
  assert.equal(containedFabric.source, '.narada/.ai/mcp');
  assert.equal(containedFabric.mcp_dir, join(containedSite, '.narada', '.ai', 'mcp'));
  assert.deepEqual(mcpServerNames(containedFabric), ['contained']);
} finally {
  rmSync(containedSite, { recursive: true, force: true });
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

const duplicateSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-duplicate-'));
mkdirSync(join(duplicateSite, '.ai', 'mcp'), { recursive: true });
try {
  writeFileSync(join(duplicateSite, '.ai', 'mcp', 'one-mcp.json'), `${JSON.stringify({
    mcpServers: {
      duplicate: { command: 'node', args: ['one.mjs'] },
    },
  }, null, 2)}\n`, 'utf8');
  writeFileSync(join(duplicateSite, '.ai', 'mcp', 'two-mcp.json'), `${JSON.stringify({
    mcpServers: {
      duplicate: { command: 'node', args: ['two.mjs'] },
    },
  }, null, 2)}\n`, 'utf8');
  assert.throws(
    () => loadSiteMcpFabric(duplicateSite, { required: true }),
    (error) => {
      assert.equal(error instanceof McpFabricError, true);
      assert.equal(error.code, 'mcp_fabric_duplicate_server_conflict');
      assert.equal(error.details.repair_plan.kind, 'duplicate_server_conflict');
      assert.deepEqual(error.details.repair_plan.conflicting_files.map((item) => item.file), ['one-mcp.json', 'two-mcp.json']);
      assert.match(error.details.repair_plan.recommended_actions.join('\n'), /Keep exactly one canonical MCP server definition/);
      return true;
    },
  );
} finally {
  rmSync(duplicateSite, { recursive: true, force: true });
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
    empty_authority: {
      command: 'node',
      args: ['{site_root}/tools/empty.mjs'],
      surface_id: 'empty.surface',
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
  }, {
    surface_id: 'empty.surface',
    client_config: { generated_path: '.ai/mcp/fixture-mcp.json' },
    tool_contract: {
      read_only_tools: [],
      mutating_tools: [],
      refused_tools: [],
    },
  }],
}, null, 2)}\n`, 'utf8');

const fabric = loadSiteMcpFabric(siteRoot, { required: true });
assert.deepEqual(mcpServerNames(fabric), ['empty_authority', 'fixture']);
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
const agentTuiProjection = projectFabricForAgentTui(fabric, { NARADA_AGENT_ID: 'narada.test' });
assert.deepEqual(Object.keys(agentTuiProjection.mcpServers), ['fixture']);
assert.deepEqual(agentTuiProjection.mcpServers.fixture.tools, ['fixture_read', 'task_lifecycle_claim']);
assert.equal(agentTuiProjection.mcpServers.fixture.target_site_root, siteRoot.replaceAll('\\', '/'));
assert.equal(agentTuiProjection.mcpServers.fixture.env.NARADA_AGENT_ID, 'narada.test');

rmSync(siteRoot, { recursive: true, force: true });

const startupAliasSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-startup-alias-'));
mkdirSync(join(startupAliasSite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(startupAliasSite, '.narada', 'capabilities'), { recursive: true });
writeFileSync(join(startupAliasSite, '.ai', 'mcp', 'agent-context-mcp.json'), `${JSON.stringify({
  mcpServers: {
    agent_context: {
      command: 'node',
      args: ['server.mjs'],
      surface_id: 'agent-context-mcp.local',
    },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(startupAliasSite, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.mcp_surfaces.v1',
  surfaces: [{
    surface_id: 'agent-context-mcp.local',
    client_config: { generated_path: '.ai/mcp/agent-context-mcp.json' },
    tool_contract: {
      read_only_tools: ['agent_context_startup_sequence', 'mcp_output_show'],
      mutating_tools: [],
      refused_tools: [],
    },
  }],
}, null, 2)}\n`, 'utf8');
const startupAliasFabric = loadSiteMcpFabric(startupAliasSite, { required: true });
const startupAliasProjection = projectFabricForAgentTui(startupAliasFabric, {});
assert.equal(startupAliasProjection.mcpServers.agent_context.target_site_root, startupAliasSite.replaceAll('\\', '/'));
assert.deepEqual(startupAliasProjection.mcpServers.agent_context.tools, [
  'agent_context_startup_sequence',
  'mcp_output_show',
]);
rmSync(startupAliasSite, { recursive: true, force: true });

const splitOutputReaderSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-split-output-reader-'));
mkdirSync(join(splitOutputReaderSite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(splitOutputReaderSite, '.narada', 'capabilities'), { recursive: true });
writeFileSync(join(splitOutputReaderSite, '.ai', 'mcp', 'split-output-reader-mcp.json'), `${JSON.stringify({
  mcpServers: {
    agent_context: { command: 'node', args: ['agent-context.mjs'], surface_id: 'agent-context.surface' },
    task_lifecycle: { command: 'node', args: ['task-lifecycle.mjs'], surface_id: 'task-lifecycle.surface' },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(splitOutputReaderSite, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.mcp_surfaces.v1',
  surfaces: [{
    surface_id: 'agent-context.surface',
    client_config: { generated_path: '.ai/mcp/split-output-reader-mcp.json' },
    tool_contract: { read_only_tools: ['agent_context_startup_sequence', 'mcp_output_show'] },
  }, {
    surface_id: 'task-lifecycle.surface',
    client_config: { generated_path: '.ai/mcp/split-output-reader-mcp.json' },
    tool_contract: { read_only_tools: ['mcp_output_show', 'task_lifecycle_next'] },
  }],
}, null, 2)}\n`, 'utf8');
const splitOutputReaderFabric = loadSiteMcpFabric(splitOutputReaderSite, { required: true });
const splitOutputReaderProjection = projectFabricForAgentTui(splitOutputReaderFabric, {});
assert.deepEqual(splitOutputReaderProjection.mcpServers.agent_context.tools, [
  'agent_context_startup_sequence',
  'mcp_output_show',
]);
assert.deepEqual(splitOutputReaderProjection.mcpServers.task_lifecycle.tools, [
  'mcp_output_show',
  'task_lifecycle_next',
]);
rmSync(splitOutputReaderSite, { recursive: true, force: true });

const rawToolSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-raw-tools-'));
mkdirSync(join(rawToolSite, '.ai', 'mcp'), { recursive: true });
writeFileSync(join(rawToolSite, '.ai', 'mcp', 'raw-tools-mcp.json'), `${JSON.stringify({
  mcpServers: {
    raw_tools: {
      command: 'node',
      args: ['server.mjs'],
      tools: ['raw_read', 'raw_write'],
    },
    no_tools: {
      command: 'node',
      args: ['empty.mjs'],
    },
  },
}, null, 2)}\n`, 'utf8');
const rawToolFabric = loadSiteMcpFabric(rawToolSite, { required: true });
const rawToolProjection = projectFabricForAgentTui(rawToolFabric, {});
assert.deepEqual(Object.keys(rawToolProjection.mcpServers), ['raw_tools']);
assert.deepEqual(rawToolProjection.mcpServers.raw_tools.tools, ['raw_read', 'raw_write']);
rmSync(rawToolSite, { recursive: true, force: true });

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
  (error) => {
    assert.equal(error instanceof McpFabricError, true);
    assert.equal(error.code, 'mcp_fabric_registry_mismatch');
    assert.equal(error.details.repair_plan.kind, 'registry_generated_file_mismatch');
    assert.equal(error.details.repair_plan.missing[0].surface_id, 'stale.surface');
    assert.equal(error.details.repair_plan.missing[0].generated_file, 'stale-mcp.json');
    return true;
  },
);
rmSync(legacyRegistrySite, { recursive: true, force: true });

const namedServerSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-server-name-'));
mkdirSync(join(namedServerSite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(namedServerSite, '.narada', 'capabilities'), { recursive: true });
writeFileSync(join(namedServerSite, '.ai', 'mcp', 'multi-server-mcp.json'), `${JSON.stringify({
  mcpServers: {
    one: { command: 'node', args: ['one.mjs'] },
    two: { command: 'node', args: ['two.mjs'] },
  },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(namedServerSite, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.mcp_surfaces.v1',
  surfaces: [
    {
      surface_id: 'surface.one',
      server_name: 'one',
      client_config: { generated_path: '.ai/mcp/multi-server-mcp.json' },
      tool_contract: { read_only_tools: ['one_read'] },
    },
    {
      surface_id: 'surface.two',
      server_name: 'two',
      client_config: { generated_path: '.ai/mcp/multi-server-mcp.json' },
      tool_contract: { read_only_tools: ['two_read'] },
    },
  ],
}, null, 2)}\n`, 'utf8');
const namedServerFabric = loadSiteMcpFabric(namedServerSite, { required: true });
assert.equal(namedServerFabric.servers.one.registry_tools.one_read.read_only, true);
assert.equal(namedServerFabric.servers.one.registry_tools.two_read, undefined);
assert.equal(namedServerFabric.servers.two.registry_tools.two_read.read_only, true);
assert.equal(namedServerFabric.servers.two.registry_tools.one_read, undefined);
rmSync(namedServerSite, { recursive: true, force: true });

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

const missingEntrypointSite = mkdtempSync(join(tmpdir(), 'narada-mcp-fabric-missing-entry-'));
mkdirSync(join(missingEntrypointSite, '.ai', 'mcp'), { recursive: true });
mkdirSync(join(missingEntrypointSite, '.narada', 'capabilities'), { recursive: true });
writeFileSync(join(missingEntrypointSite, '.gitignore'), '.ai/mcp/*.json\n', 'utf8');
writeFileSync(join(missingEntrypointSite, '.ai', 'mcp', 'missing-mcp.json'), `${JSON.stringify({
  mcpServers: { missing: { command: 'node', args: ['missing-server.mjs'], surface_id: 'missing.surface' } },
}, null, 2)}\n`, 'utf8');
writeFileSync(join(missingEntrypointSite, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
  schema: 'narada.site.capabilities.mcp_surfaces.v1',
  surfaces: [{
    surface_id: 'missing.surface',
    server_name: 'missing',
    client_config: {
      generated_path: '.ai/mcp/missing-mcp.json',
      source_file: 'packages/site-common-tools/src/missing-surface.mjs',
      generated_by: 'surface-registry-test',
      regeneration_command: 'pnpm --filter @narada2/typed-mcp-surface generate:test --write',
    },
    tool_contract: { read_only_tools: ['missing_read'] },
  }],
}, null, 2)}\n`, 'utf8');
const missingReport = await runMcpFabricDoctor(missingEntrypointSite, { timeoutMs: 1000 });
assert.equal(missingReport.status, 'failed');
assert.equal(missingReport.rows[0].diagnostics[0].code, 'entry_missing');
assert.equal(missingReport.generated_config_diagnostics.status, 'stale_entrypoints');
assert.equal(missingReport.generated_config_diagnostics.generated_configs[0].config_ignored, true);
assert.equal(missingReport.generated_config_diagnostics.generated_configs[0].repair_scope, 'ignored_local_projection_repair');
assert.equal(missingReport.generated_config_diagnostics.stale_entrypoints[0].provenance.generated_by, 'surface-registry-test');
assert.equal(missingReport.generated_config_diagnostics.stale_entrypoints[0].regeneration.command, 'pnpm --filter @narada2/typed-mcp-surface generate:test --write');
assert.equal(missingReport.rows[0].diagnostics[0].details.config_provenance.source_file, 'packages/site-common-tools/src/missing-surface.mjs');
assert.equal(missingReport.rows[0].diagnostics[0].repair_plan.repair_scope, 'ignored_local_projection_repair');
assert.match(missingReport.rows[0].diagnostics[0].repair_plan.recommended_actions.join('\n'), /ignored local MCP client config/);
rmSync(missingEntrypointSite, { recursive: true, force: true });

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
