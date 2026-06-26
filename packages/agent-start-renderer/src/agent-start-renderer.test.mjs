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
    required_environment: {
      NARADA_AGENT_ID: 'site.builder',
      KIMI_API_KEY: 'secret',
    },
    startup_command: { name: 'agent_context_startup_sequence', arguments: {}, display: 'agent_context_startup_sequence({})' },
    startup_sequence: [{ tool: 'agent_context_startup_sequence', arguments: {} }],
    exec: true,
    launch_result_path: 'x.result.json',
  }, { colorEnabled: false });

  assert.match(text, /agent_start_event: evt_1/);
  assert.match(text, /identity: site\.builder/);
  assert.match(text, /KIMI_API_KEY=<set>/);
  assert.doesNotMatch(text, /secret/);
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
