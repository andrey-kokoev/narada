import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildLaunchPlanFromArgs,
  readAgentStartEvent,
  writeLaunchResult,
} from './start-agent.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-agent-start-'));
}

function tempPcSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-pc-site-'));
}

test('narada.architect real launch materializes carrier session env and discoverable start event', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const now = '2026-05-13T18:30:00.000Z';
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'codex',
    exec: true,
    dry_run: false,
  }, { siteRoot, pcSiteRoot, now });

  assert.equal(result.status, 'launching');
  assert.equal(result.agent_start_event_authoritative, true);
  assert.equal(result.carrier_session_authoritative, true);
  assert.equal(result.launch_environment.NARADA_AGENT_ID, 'narada.architect');
  assert.equal(result.launch_environment.NARADA_AGENT_START_EVENT_ID, result.agent_start_event);
  assert.equal(result.launch_environment.NARADA_CARRIER_SESSION_ID, result.carrier_session_id);
  assert.equal(result.launch_environment.NARADA_SITE_ROOT, siteRoot);
  assert.equal(result.launch_environment.NARADA_AGENT_CONTEXT_DB, result.agent_context_db_path);
  assert.equal(result.launch_environment.NARADA_PC_SITE_ROOT, pcSiteRoot);
  assert.ok(result.carrier_session_id.startsWith('carrier_session_'));
  assert.equal(result.pc_carrier_session.status, 'registered');
  assert.equal(result.pc_carrier_session.carrier_session_id, result.carrier_session_id);
  assert.equal(fs.existsSync(result.pc_carrier_session.record_path), true);
  const pcCarrierRecord = JSON.parse(fs.readFileSync(result.pc_carrier_session.record_path, 'utf8'));
  assert.equal(pcCarrierRecord.schema, 'narada.pc_runtime.carrier_session.v0');
  assert.equal(pcCarrierRecord.carrier_session_id, result.carrier_session_id);
  assert.equal(pcCarrierRecord.agent_start_event_id, result.agent_start_event);
  assert.equal(pcCarrierRecord.verified_agent_identity, 'narada.architect');
  assert.equal(result.startup_command_name, 'agent_context_hydrate_current');
  assert.ok(result.runtime_args.includes('mcp_servers."narada-andrey-agent-context".default_tools_approval_mode="approve"'));
  assert.ok(result.runtime_args.includes('mcp_servers."narada-andrey-shell".default_tools_approval_mode="approve"'));
  assert.ok(!result.runtime_args.includes('mcp_servers."narada-andrey-task-lifecycle".default_tools_approval_mode="approve"'));
  assert.ok(result.runtime_args.includes('--disable'));
  assert.ok(result.runtime_args.includes('shell_tool'));
  assert.equal(result.mcp_tool_approval.status, 'approved_by_launcher_config');
  assert.equal(result.mcp_tool_approval.provider_locus, 'user_site_mcp');
  assert.equal(result.mcp_tool_approval.target_locus, 'narada_proper');
  assert.deepEqual(result.mcp_tool_approval.approved_servers.map((server) => server.name), [
    'narada-andrey-agent-context',
    'narada-andrey-shell',
  ]);
  assert.ok(result.mcp_tool_approval.explicitly_not_approved.includes('narada-andrey-task-lifecycle'));
  assert.deepEqual(result.startup_command, {
    name: 'agent_context_hydrate_current',
    arguments: {},
    display: 'agent_context_hydrate_current({})',
  });
  assert.deepEqual(result.startup_sequence, [
    {
      tool: 'agent_context_hydrate_current',
      arguments: {},
      purpose: 'hydrate the launched carrier session from inherited NARADA_* environment before operational work',
    },
  ]);

  const row = readAgentStartEvent(result.agent_context_db_path, result.agent_start_event);
  assert.equal(row.event_id, result.agent_start_event);
  assert.equal(row.identity, 'narada.architect');
  assert.equal(row.agent_id, 'narada.architect');
  assert.equal(row.runtime, 'codex');
  assert.equal(row.site_root, siteRoot);
});

test('dry run reports planned non-authoritative env without durable event claim', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'codex',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-13T18:31:00.000Z' });

  assert.equal(result.status, 'planned');
  assert.equal(result.agent_start_event_authoritative, false);
  assert.equal(result.carrier_session_authoritative, false);
  assert.equal(result.launch_environment, null);
  assert.equal(result.planned_environment.NARADA_AGENT_START_EVENT_ID, result.agent_start_event);
  assert.equal(result.planned_environment.NARADA_CARRIER_SESSION_ID, result.carrier_session_id);
  assert.equal(result.planned_environment.NARADA_PC_SITE_ROOT, pcSiteRoot);
  assert.equal(result.pc_carrier_session.status, 'planned');
  assert.equal(fs.existsSync(result.pc_carrier_session.record_path), false);
  assert.equal(result.startup_command_name, 'agent_context_hydrate_current');
  assert.ok(result.runtime_args.includes('mcp_servers."narada-andrey-agent-context".default_tools_approval_mode="approve"'));
  assert.ok(result.runtime_args.includes('mcp_servers."narada-andrey-shell".default_tools_approval_mode="approve"'));
  assert.ok(!result.runtime_args.includes('mcp_servers."narada-andrey-task-lifecycle".default_tools_approval_mode="approve"'));
  assert.equal(result.startup_sequence[0].tool, 'agent_context_hydrate_current');
  assert.deepEqual(result.startup_sequence[0].arguments, {});
  assert.match(result.dry_run_notice, /non-authoritative/);
  assert.equal(fs.existsSync(result.agent_context_db_path), false);
});

test('launch result file records its own authoritative path', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'codex',
    exec: true,
    dry_run: false,
  }, { siteRoot, pcSiteRoot, now: '2026-05-13T18:32:00.000Z' });

  const launchResultPath = writeLaunchResult(result, siteRoot);
  const persisted = JSON.parse(fs.readFileSync(launchResultPath, 'utf8'));

  assert.equal(result.launch_result_path, launchResultPath);
  assert.equal(persisted.launch_result_path, launchResultPath);
  assert.equal(persisted.startup_sequence[0].tool, 'agent_context_hydrate_current');
});
