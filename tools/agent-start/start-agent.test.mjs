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
  assert.equal(result.mcp_runtime.package_name, '@narada2/narada-proper-mcp');
  assert.equal(result.mcp_runtime.surface_id, 'narada-proper.surface.agent-facing-mcp.v1');
  assert.equal(result.mcp_runtime.depends_on_cli_dist, false);
  assert.match(result.mcp_runtime.entrypoint, /packages[\\/]narada-proper-mcp[\\/]src[\\/]main\.ts$/);
  assert.ok(!result.runtime_args.some((arg) => arg.includes('mcp_servers.')));
  assert.ok(!result.runtime_args.some((arg) => arg.includes('narada-andrey-agent-context')));
  assert.ok(!result.runtime_args.some((arg) => arg.includes('narada-andrey-task-lifecycle')));
  assert.ok(!result.runtime_args.some((arg) => arg.includes('narada-andrey-shell')));
  assert.ok(result.runtime_args.includes('--disable'));
  assert.ok(result.runtime_args.includes('shell_tool'));
  assert.equal(result.mcp_tool_approval.status, 'approved_by_launcher_config');
  assert.equal(result.mcp_tool_approval.provider_locus, 'target_site_mcp');
  assert.equal(result.mcp_tool_approval.target_locus, 'narada_proper');
  assert.deepEqual(result.mcp_tool_approval.approved_servers.map((server) => server.name), [
    'narada-proper',
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
  assert.equal(result.mcp_runtime.package_name, '@narada2/narada-proper-mcp');
  assert.equal(result.mcp_runtime.depends_on_cli_dist, false);
  assert.ok(!result.runtime_args.some((arg) => arg.includes('mcp_servers.')));
  assert.ok(!result.runtime_args.some((arg) => arg.includes('narada-andrey-agent-context')));
  assert.ok(!result.runtime_args.some((arg) => arg.includes('narada-andrey-task-lifecycle')));
  assert.ok(!result.runtime_args.some((arg) => arg.includes('narada-andrey-shell')));
  assert.equal(result.startup_sequence[0].tool, 'agent_context_hydrate_current');
  assert.deepEqual(result.startup_sequence[0].arguments, {});
  assert.match(result.dry_run_notice, /non-authoritative/);
  assert.equal(fs.existsSync(result.agent_context_db_path), false);
});

test('builder launch binds codex home and config path to builder identity', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { event, result } = buildLaunchPlanFromArgs({
    identity: 'narada.builder',
    runtime: 'codex',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-13T18:31:15.000Z' });

  assert.equal(event.identity, 'narada.builder');
  assert.equal(event.role, 'builder');
  assert.match(result.codex_config_path, /narada-builder[\\/]config\.toml$/);
  assert.match(result.planned_environment.CODEX_HOME, /narada-builder$/);
  assert.doesNotMatch(result.codex_config_path, /narada-architect/);
  assert.doesNotMatch(result.planned_environment.CODEX_HOME, /narada-architect/);
});

test('claude-code dry run represents a carrier session without native execution authority', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.builder',
    runtime: 'claude-code',
    exec: false,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-15T15:30:00.000Z' });

  assert.equal(result.status, 'planned');
  assert.equal(result.runtime, 'claude-code');
  assert.equal(result.runtime_kind, 'claude_code_carrier');
  assert.equal(result.agent_start_event_authoritative, false);
  assert.equal(result.carrier_session_authoritative, false);
  assert.equal(result.claude_code_launch.schema, 'narada.agent_start.claude_code_carrier.v0');
  assert.equal(result.claude_code_launch.status, 'represented_not_executed');
  assert.equal(result.claude_code_launch.execution_admitted, false);
  assert.equal(result.claude_code_launch.startup_hydration.name, 'agent_context_hydrate_current');
  assert.equal(result.codex_config_path, null);
  assert.equal(result.planned_environment.CODEX_HOME, undefined);
  assert.equal(result.planned_environment.NARADA_AGENT_ID, 'narada.builder');
  assert.equal(result.planned_environment.NARADA_AGENT_START_EVENT_ID, result.agent_start_event);
  assert.equal(result.planned_environment.NARADA_CARRIER_SESSION_ID, result.carrier_session_id);
  assert.equal(result.mcp_tool_approval.status, 'approved_by_launcher_config');
  assert.match(result.mcp_tool_approval.note, /Claude Code native execution and tool permissions are not admitted/);
  assert.equal(result.native_execution_policy.native_shell.status, 'not_admitted_for_runtime_slice');
  assert.equal(result.native_execution_policy.policy_aware_shell_mcp.status, 'withheld');
  assert.ok(result.not_claimed.includes('task_activation_authority'));
  assert.ok(result.not_claimed.includes('inbox_authority'));
  assert.ok(result.not_claimed.includes('outbox_authority'));
  assert.ok(result.not_claimed.includes('repository_publication_authority'));
});

test('claude-code exec is refused until runtime tool policy is admitted', () => {
  assert.throws(
    () => buildLaunchPlanFromArgs({
      identity: 'narada.builder',
      runtime: 'claude-code',
      exec: true,
      dry_run: false,
    }, { siteRoot: tempSite(), pcSiteRoot: tempPcSite(), now: '2026-05-15T15:31:00.000Z' }),
    /runtime_exec_not_admitted:claude-code/,
  );
});

test('narada-native dry run plans the minimum native carrier lifecycle without authority collapse', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.builder',
    runtime: 'narada-native',
    exec: false,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-15T15:32:00.000Z' });

  assert.equal(result.status, 'planned');
  assert.equal(result.runtime, 'narada-native');
  assert.equal(result.runtime_kind, 'narada_native_carrier');
  assert.equal(result.narada_native_launch.schema, 'narada.agent_start.narada_native_carrier.v0');
  assert.equal(result.narada_native_launch.status, 'planned_not_executed');
  assert.equal(result.narada_native_launch.session_identity_model.agent_id, 'narada.builder');
  assert.equal(result.narada_native_launch.session_identity_model.carrier_session_id, result.carrier_session_id);
  assert.equal(result.narada_native_launch.session_identity_model.identity_mutable_after_start, false);
  assert.equal(result.narada_native_launch.startup_hydration.name, 'agent_context_hydrate_current');
  assert.equal(result.narada_native_launch.capability_posture.status, 'facade_only');
  assert.ok(result.narada_native_launch.capability_posture.withheld_capabilities.includes('task_lifecycle_mutation_authority'));
  assert.ok(result.narada_native_launch.capability_posture.withheld_capabilities.includes('repository_publication_authority'));
  assert.equal(result.narada_native_launch.readiness.direct_sqlite_inspection_required, false);
  assert.deepEqual(result.narada_native_launch.lifecycle_plan.minimum_vertical.map((step) => step.phase), [
    'start',
    'hydrate',
    'project_capabilities',
    'record_evidence',
    'close',
  ]);
  assert.equal(result.native_execution_policy.native_shell.status, 'not_admitted_for_runtime_slice');
  assert.equal(result.planned_environment.NARADA_AGENT_ID, 'narada.builder');
  assert.match(result.result_sentinel, /agent_start_result_end:/);
  assert.ok(result.not_claimed.includes('task_activation_authority'));
  assert.ok(result.not_claimed.includes('inbox_authority'));
  assert.ok(result.not_claimed.includes('outbox_authority'));
  assert.ok(result.not_claimed.includes('repository_publication_authority'));
});

test('narada-native exec is refused until an execution carrier is admitted', () => {
  assert.throws(
    () => buildLaunchPlanFromArgs({
      identity: 'narada.builder',
      runtime: 'narada-native',
      exec: true,
      dry_run: false,
    }, { siteRoot: tempSite(), pcSiteRoot: tempPcSite(), now: '2026-05-15T15:33:00.000Z' }),
    /runtime_exec_not_admitted:narada-native/,
  );
});

test('break-glass native shell flag leaves codex shell_tool enabled with authority ref evidence', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const previousRef = process.env.NARADA_NATIVE_SHELL_AUTHORITY_REF;
  process.env.NARADA_NATIVE_SHELL_AUTHORITY_REF = 'env_test_break_glass';
  try {
    const { result } = buildLaunchPlanFromArgs({
      identity: 'narada.architect',
      runtime: 'codex',
      exec: true,
      dry_run: true,
      enable_native_shell: true,
    }, { siteRoot, pcSiteRoot, now: '2026-05-13T18:31:30.000Z' });

    assert.ok(!result.runtime_args.includes('--disable'));
    assert.ok(!result.runtime_args.includes('shell_tool'));
    assert.equal(result.native_shell_exception.status, 'enabled_by_break_glass_flag');
    assert.equal(result.native_shell_exception.authority_basis, 'env_test_break_glass');
    assert.equal(result.native_shell_exception.scope.identity, 'narada.architect');
    assert.match(result.mcp_tool_approval.note, /break-glass/);
  } finally {
    if (previousRef === undefined) {
      delete process.env.NARADA_NATIVE_SHELL_AUTHORITY_REF;
    } else {
      process.env.NARADA_NATIVE_SHELL_AUTHORITY_REF = previousRef;
    }
  }
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


test('codex config includes explicit startup identity args', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'codex',
    exec: true,
    dry_run: false,
  }, { siteRoot, pcSiteRoot, now: '2026-05-13T18:34:00.000Z' });

  const config = fs.readFileSync(result.codex_config_path, 'utf8');
  assert.match(config, /narada-proper-mcp/);
  assert.match(config, /--import/);
  assert.match(config, /tsx/);
  assert.match(config, /--agent-id/);
  assert.match(config, /narada.architect/);
  assert.match(config, /--agent-start-event-id/);
  assert.match(config, /agent_start_20260513_183400000_narada_architect/);
  assert.match(config, /--carrier-session-id/);
  assert.match(config, /--agent-context-db/);
});
