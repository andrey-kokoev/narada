import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAgentStartResult, formatAgentStartWaitPrompt } from './agent-start-renderer.mjs';

test('formats agent-start preamble with redacted API keys and startup sequence', () => {
  const text = formatAgentStartResult({
    agent_start_event: 'evt_1',
    identity: 'site.builder',
    role: 'builder',
    carrier_kind: 'agent-cli',
    runtime: 'narada-agent-runtime-server',
    runtime_substrate_kind: 'narada-agent-runtime-server',
    resume_command: 'agent-cli',
    capability_policy: {
      direct_substrate_script_execution: 'forbidden',
      script_execution_surface: 'mcp_only',
      shell_access: 'mcp_only',
      lifecycle_mutations: 'mcp_only',
    },
    mcp_fabric: {
      source: '.ai/mcp',
      site_root: 'D:/code/site',
      files: ['narada-site-mcp.json'],
      server_names: [
        'narada-site-agent-context',
        'narada-site-local-filesystem',
      ],
      skipped: [],
    },
    required_environment: {
      NARADA_AGENT_ID: 'site.builder',
      KIMI_API_KEY: 'secret',
    },
    startup_command: { name: 'agent_context_startup_sequence', arguments: {}, display: 'agent_context_startup_sequence({})' },
    launcher_contracts: {
      launch_result_artifact: { status: 'materialized', artifact_path: 'x.result.json' },
      operator_projection_open_request: { status: 'opened', projection_kind: 'browser_url', target_ref: 'http://127.0.0.1:4545' },
      authority_runtime_host_selection: { operator_surface_kind: 'agent-cli', runtime_host_kind: 'narada-agent-runtime-server' },
      operator_surface_attachment: { operator_surface_kind: 'agent-cli', tool_fabric_adapter_kind: 'narada-agent-runtime-server-mcp-client' },
      runtime_health_posture: {
        status: 'projected_for_runtime',
        dimensions: {
          health: { status: 'projected', http_path: '/health' },
          events: { status: 'projected', websocket_path: '/events' },
        },
      },
      mcp_fabric_injection_plan: { requested_scope: 'all', isolation: { status: 'materialized' } },
      launch_selection_session: { carrier_kind: 'agent-cli', runtime: 'narada-agent-runtime-server', intelligence_provider: 'kimi-code-api' },
      intelligence_provider_readiness_check: { intelligence_provider: 'kimi-code-api', status: 'ready' },
      operator_terminal_projection_plan: { terminal_kind: 'agent-cli', wait_for_enter: true },
      launch_failure_rendering: null,
    },
    runtime_health_posture: {
      status: 'projected_for_runtime',
      dimensions: {
        health: { status: 'projected', http_path: '/health' },
        events: { status: 'projected', websocket_path: '/events' },
      },
    },
    startup_sequence: [{ tool: 'agent_context_startup_sequence', arguments: {} }],
    exec: true,
    launch_result_path: 'x.result.json',
  }, { colorEnabled: false });

  assert.match(text, /agent_start_event: evt_1/);
  assert.match(text, /identity: site\.builder/);
  assert.match(text, /KIMI_API_KEY=<set>/);
  assert.doesNotMatch(text, /secret/);
  assert.match(text, /mcp_fabric:/);
  assert.match(text, /launcher_contracts:/);
  assert.match(text, /launch_result_artifact=/);
  assert.match(text, /operator_projection_open_request=/);
  assert.match(text, /authority_runtime_host_selection=/);
  assert.match(text, /operator_surface_attachment=/);
  assert.match(text, /runtime_health_posture:/);
  assert.match(text, /health=projected \/health/);
  assert.match(text, /events=projected \/events/);
  assert.match(text, /launch_selection_session=/);
  assert.match(text, /intelligence_provider_readiness_check=/);
  assert.match(text, /source=\.ai\/mcp/);
  assert.match(text, /files=narada-site-mcp\.json/);
  assert.match(text, /server_count=2/);
  assert.match(text, /narada-site-agent-context/);
  assert.match(text, /narada-site-local-filesystem/);
  assert.match(text, /startup_command: agent_context_startup_sequence\(\{\}\)/);
  assert.match(text, /agent_context_startup_sequence \{\}/);
  assert.match(text, /agent_start_result_end: evt_1/);
});

test('formats wait prompt', () => {
  assert.equal(formatAgentStartWaitPrompt('site.builder', 'narada-agent-runtime-server'), 'Press Enter to start narada-agent-runtime-server for site.builder...');
});

test('handles sparse result without optional sections', () => {
  const text = formatAgentStartResult({
    identity: 'site.architect',
    role: null,
    runtime: 'codex',
    required_environment: {},
    startup_sequence: [],
    exec: false,
  }, { colorEnabled: false });

  assert.match(text, /agent_start_event: <dry-run>/);
  assert.match(text, /role: /);
  assert.match(text, /runtime_substrate_kind: codex/);
  assert.match(text, /required_environment:/);
  assert.match(text, /startup_sequence:/);
  assert.doesNotMatch(text, /capability_policy:/);
  assert.doesNotMatch(text, /agent_start_result_end:/);
});

test('does not redact empty API key values', () => {
  const text = formatAgentStartResult({
    identity: 'site.builder',
    role: 'builder',
    runtime: 'narada-agent-runtime-server',
    required_environment: {
      KIMI_API_KEY: '',
    },
    startup_sequence: [],
  }, { colorEnabled: false });

  assert.match(text, /KIMI_API_KEY=/);
  assert.doesNotMatch(text, /<set>/);
});

test('emits ANSI color only when enabled', () => {
  const result = {
    identity: 'site.builder',
    role: 'builder',
    carrier_kind: 'agent-cli',
    runtime: 'narada-agent-runtime-server',
    runtime_substrate_kind: 'narada-agent-runtime-server',
    required_environment: {},
    startup_sequence: [],
  };

  assert.doesNotMatch(formatAgentStartResult(result, { colorEnabled: false }), /\x1b\[/);
  assert.match(formatAgentStartResult(result, { colorEnabled: true }), /\x1b\[/);
});
