import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaRoot = join(__dirname, '..', '..');
const packagedAgentStart = join(naradaRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');

function runJson(entrypoint, extraArgs = [], siteRoot = naradaRoot, identity = 'narada.architect') {
  const result = spawnSync(process.execPath, [
    '--import',
    'tsx',
    entrypoint,
    identity,
    '--site-root', siteRoot,
    '--target-site-root', siteRoot,
    '--carrier', 'agent-cli',
    '--runtime', 'narada-agent-runtime-server',
    '--dry-run',
    '--json',
    ...extraArgs,
  ], {
    cwd: naradaRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NARADA_PROPER_ROOT: naradaRoot,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createTemporarySiteWithMcpServer(serverName) {
  const siteRoot = mkdtempSync(join(naradaRoot, '.ai', 'tmp', 'agent-start-prefix-gate-'));
  mkdirSync(join(siteRoot, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  writeJson(join(siteRoot, '.ai', 'agents', 'roster.json'), {
    agents: [
      {
        agent_id: 'sonar.resident',
        role: 'resident',
        capabilities: [],
      },
    ],
  });
  writeJson(join(siteRoot, '.ai', 'mcp', 'fixture.json'), {
    mcpServers: {
      [serverName]: {
        command: 'node',
        args: ['-e', 'process.exit(0)'],
        tools: ['fixture_tool'],
      },
    },
  });
  return siteRoot;
}

function assertModernAgentCliLaunch(result) {
  assert.equal(result.schema, 'narada.agent_start.result.v0');
  assert.equal(result.carrier_kind, 'agent-cli');
  assert.equal(result.runtime, 'narada-agent-runtime-server');
  assert.equal(result.runtime_substrate_kind, 'narada-agent-runtime-server');
  assert.equal(result.tool_fabric_adapter_kind, 'narada-agent-runtime-server-mcp-client');
  assert.equal(result.nars_launch.schema, 'narada.agent_start.nars_launch.v1');
  assert.equal(result.nars_launch.carrier_runtime_kind, 'narada-agent-runtime-server');
  assert.equal(result.nars_launch.operator_surface_kind, 'agent-cli');
  assert.equal(result.nars_launch.control_transport, 'jsonl_sideband_file');
  assert.equal(result.nars_launch.carrier_relation, 'narada_agent_runtime_server');
  assert.equal(result.nars_launch.runtime_server.package, '@narada2/agent-runtime-server');
  assert.equal(result.nars_launch.runtime_server.entrypoint, 'narada-agent-runtime-server');
  assert.equal(Object.hasOwn(result.nars_launch, 'private_carrier_substrate'), false);
  assert.equal(result.nars_launch.command, process.execPath);
  assert.equal(result.nars_events.attach_commands.registry_schema, 'narada.nars.client_projection_registry.v1');
  assert.equal(result.nars_events.attach_commands.agent_tui, 'agent-tui --attach <session_started.event_endpoint>');
  assert.equal(result.nars_events.attach_commands.agent_web_ui, 'narada-agent-web-ui --event-endpoint <session_started.event_endpoint> --health-endpoint <session_started.health_endpoint>');
  assert.match(result.nars_events.attach_commands.operator_input_protocol, /conversation\.send/);
  assert.match(result.nars_events.attach_commands.slash_command_protocol, /carrier\.command\.execute/);
  assert.equal(result.runtime_args[0].endsWith('agent-runtime-server.mjs'), true);
  assert.equal(result.runtime_args.includes('--session'), true);
  assert.equal(result.runtime_args.includes(result.carrier_session.carrier_session_id), true);
  assert.equal(result.runtime_args.includes('--control-jsonl'), false);
  assert.match(result.nars_launch.control_path, /[\\/]\.narada[\\/]crew[\\/]nars-sessions[\\/]carrier_/);
}

test('packaged agent-start emits modern Narada proper agent-cli launch evidence', () => {
  const siteRoot = createTemporarySiteWithMcpServer('narada-sonar-sop');
  try {
    assertModernAgentCliLaunch(runJson(packagedAgentStart, [], siteRoot, 'sonar.resident'));
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('packaged agent-start refuses MCP fabric that does not match registry', () => {
  const siteRoot = createTemporarySiteWithMcpServer('narada-sonar-sop');
  try {
    mkdirSync(join(siteRoot, '.narada', 'capabilities'), { recursive: true });
    writeJson(join(siteRoot, '.narada', 'capabilities', 'mcp-surfaces.json'), {
      schema: 'narada.site.capabilities.mcp_surfaces.v1',
      surfaces: [{
        surface_id: 'expected.surface',
        client_config: { generated_path: '.ai/mcp/expected-mcp.json' },
        tool_contract: {
          read_only_tools: ['agent_context_startup_sequence'],
          mutating_tools: [],
          refused_tools: [],
        },
      }],
    });
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      packagedAgentStart,
      'sonar.resident',
      '--site-root', siteRoot,
      '--target-site-root', siteRoot,
      '--carrier', 'agent-cli',
      '--runtime', 'narada-agent-runtime-server',
      '--dry-run',
      '--json',
    ], {
      cwd: naradaRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NARADA_PROPER_ROOT: naradaRoot,
      },
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const refusal = JSON.parse(result.stdout);
    assert.equal(refusal.status, 'refused');
    assert.equal(refusal.reason_code, 'mcp_fabric_registry_mismatch');
    assert.equal(refusal.details.repair_plan.kind, 'registry_generated_file_mismatch');
    assert.equal(refusal.details.missing[0].surface_id, 'expected.surface');
    assert.equal(refusal.details.missing[0].generated_file, 'expected-mcp.json');
    assert.equal(refusal.required_next_step.includes('matches the Site surface registry'), true);
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});

test('packaged agent-start defaults Narada proper startup to agent-cli', () => {
  const siteRoot = createTemporarySiteWithMcpServer('narada-sonar-sop');
  try {
    const launch = runJson(packagedAgentStart, [], siteRoot, 'sonar.resident');
    assert.equal(launch.carrier_kind, 'agent-cli');
    assert.equal(launch.runtime, 'narada-agent-runtime-server');
    assert.equal(launch.runtime_substrate_kind, 'narada-agent-runtime-server');
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});
