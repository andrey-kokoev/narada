import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REQUIRED_EVENT_KINDS,
  buildAcceptanceDirective,
  defaultAcceptancePaths,
  parseArgs,
  parseLaunchLog,
  runAgentTuiLiveTurnAcceptance,
  validateLiveTurnEvidence,
} from './agent-tui-live-turn-acceptance.mjs';

function tempSite() {
  const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'narada-agent-tui-live-turn-'));
  fs.mkdirSync(path.join(siteRoot, 'tools', 'agent-start'), { recursive: true });
  return siteRoot;
}

function writeJson(pathname, value) {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  fs.writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeSession(pathname, eventKinds = REQUIRED_EVENT_KINDS) {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  const lines = eventKinds.map((kind) => JSON.stringify({
    schema: 'narada.carrier.session_event.v1',
    event_kind: kind,
    payload: kind === 'tool_result_received'
      ? {
        status: 'ok',
        tool_name: 'site_loop_status',
        server_name: 'narada-sonar-site-ops',
        mcp_runtime_execution: 'supervised_stdio',
      }
      : { status: 'recorded' },
  }));
  fs.writeFileSync(pathname, `${lines.join('\n')}\n`, 'utf8');
}

test('buildAcceptanceDirective asks provider for one visible MCP site_loop_status tool call', () => {
  const directive = buildAcceptanceDirective({ resultRelativePath: '.narada/crew/live/result.json' });
  assert.match(directive, /Respond with only this JSON object/);
  assert.match(directive, /"name":"site_loop_status"/);
  assert.doesNotMatch(directive, /```/);
});

test('parseArgs accepts bounded live-run controls and rejects invalid timeout', () => {
  const parsed = parseArgs(['--identity', 'narada.builder', '--max-steps', '1200', '--timeout-ms', '90000', '--json', '--normal-launch-defaults']);
  assert.equal(parsed.identity, 'narada.builder');
  assert.equal(parsed.maxSteps, '1200');
  assert.equal(parsed.timeoutMs, 90000);
  assert.equal(parsed.json, true);
  assert.equal(parsed.normalLaunchDefaults, true);
  const providerOnly = parseArgs(['--provider-admission-only']);
  assert.equal(providerOnly.providerAdmissionOnly, true);
  assert.throws(() => parseArgs(['--timeout-ms', '0']), /invalid_timeout_ms/);
  assert.throws(() => parseArgs(['--max-steps', 'x']), /invalid_max_steps/);
});

test('parseLaunchLog derives carrier session paths from compact launch output', () => {
  const siteRoot = tempSite();
  const parsed = parseLaunchLog([
    'agent-start: narada.resident (agent-tui)',
    'carrier_session: carrier_session_20260601_034530713_narada_resident',
    `launch_result: ${path.join(siteRoot, '.narada', 'crew', 'agent-start-results', 'x.result.json')}`,
  ].join('\n'), siteRoot);
  assert.equal(parsed.carrier_session_id, 'carrier_session_20260601_034530713_narada_resident');
  assert.equal(parsed.session_jsonl_path, path.join(siteRoot, '.narada', 'crew', 'nars-sessions', parsed.carrier_session_id, 'session.jsonl'));
  assert.match(parsed.launch_result_path, /x\.result\.json$/);
});

test('validateLiveTurnEvidence passes complete result artifact and session chain', () => {
  const siteRoot = tempSite();
  const resultPath = path.join(siteRoot, '.narada', 'crew', 'agent-tui-live-turn-acceptance', 'result.json');
  const sessionPath = path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'carrier_session_test', 'session.jsonl');
  writeJson(resultPath, {
    schema: 'narada.agent_tui.live_turn_result.v0',
    status: 'provider_requested_mcp_write_file',
  });
  writeSession(sessionPath);
  const validation = validateLiveTurnEvidence({ resultPath, sessionPath });
  assert.equal(validation.status, 'passed');
  assert.deepEqual(validation.missing_event_kinds, []);
  assert.equal(validation.tool_result_summary.tool_name, 'site_loop_status');
  assert.equal(validation.tool_result_summary.mcp_runtime_execution, 'supervised_stdio');
});

test('validateLiveTurnEvidence fails when required session events are missing', () => {
  const siteRoot = tempSite();
  const resultPath = path.join(siteRoot, '.narada', 'crew', 'agent-tui-live-turn-acceptance', 'result.json');
  const sessionPath = path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'carrier_session_test', 'session.jsonl');
  writeJson(resultPath, {
    schema: 'narada.agent_tui.live_turn_result.v0',
    status: 'provider_requested_mcp_write_file',
  });
  writeSession(sessionPath, ['input_admitted_to_turn', 'turn_completed']);
  const validation = validateLiveTurnEvidence({ resultPath, sessionPath });
  assert.equal(validation.status, 'failed');
  assert(validation.failures.includes('missing_session_event:provider_tool_call_requested'));
  assert(validation.failures.includes('missing_session_event:tool_result_received'));
});

test('runAgentTuiLiveTurnAcceptance writes compact proof with injected spawn runner', () => {
  const siteRoot = tempSite();
  const paths = defaultAcceptancePaths(siteRoot);
  const sessionId = 'carrier_session_20260601_111111111_narada_resident';
  const sessionPath = path.join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId, 'session.jsonl');
  const report = runAgentTuiLiveTurnAcceptance({
    siteRoot,
    now: new Date('2026-06-01T11:11:11.000Z'),
    spawnAgentStart: ({ resultPath, timeoutMs }) => {
      assert.equal(timeoutMs, 300000);
      writeJson(resultPath, {
        schema: 'narada.agent_tui.live_turn_result.v0',
        status: 'provider_requested_mcp_write_file',
        evidence: 'test',
      });
      writeSession(sessionPath);
      return {
        status: 0,
        signal: null,
        stdout: [
          'agent-start: narada.resident (agent-tui)',
          `carrier_session: ${sessionId}`,
          `launch_result: ${path.join(siteRoot, '.narada', 'crew', 'agent-start-results', 'test.result.json')}`,
        ].join('\n'),
        stderr: '',
      };
    },
  });

  assert.equal(report.status, 'passed');
  assert.equal(fs.existsSync(paths.directivePath), true);
  assert.equal(fs.existsSync(paths.runLogPath), true);
  assert.equal(fs.existsSync(report.proof_path), true);
  assert.equal(fs.existsSync(report.timestamped_proof_path), true);
  const persisted = JSON.parse(fs.readFileSync(report.proof_path, 'utf8'));
  assert.equal(persisted.schema, 'narada.agent_tui.live_turn_acceptance_report.v0');
  assert.equal(persisted.validation.status, 'passed');
});
