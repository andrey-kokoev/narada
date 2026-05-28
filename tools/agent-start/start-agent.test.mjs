import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildLaunchPlanFromArgs,
  compactLaunchSummary,
  readAgentStartEvent,
  writeCompactResult,
  writeClaudeCodeProcessAttempt,
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
  assert.equal(result.startup_command_name, 'agent_context_startup_sequence');
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
    name: 'agent_context_startup_sequence',
    arguments: {},
    display: 'agent_context_startup_sequence({})',
  });
  assert.deepEqual(result.startup_sequence, [
    {
      tool: 'agent_context_hydrate_current',
      arguments: {},
      purpose: 'hydrate launcher/site/identity evidence',
      output_key: 'hydrate_current',
      authority_posture: 'launcher_evidence_only',
      runtime_hydration_attempted: false,
    },
    {
      tool: 'agent_context_memory.plan_hydration',
      arguments: {
        named_agent_id: {
          from_step: 'hydrate_current',
          field: 'agent_id',
          rule: 'use verified agent_id returned by agent_context_hydrate_current',
        },
        requested_by: 'startup-sequence',
      },
      purpose: 'plan checkpoint continuity without mutating runtime',
      depends_on: 'hydrate_current',
      checkpoint_hydration_planned: true,
      checkpoint_summary_loaded: false,
      runtime_hydration_attempted: false,
      advisory_only: true,
      optional_next: {
        tool: 'agent_context_memory.read_checkpoint_summary',
        arguments: {
          checkpoint_id: {
            from_step: 'agent_context_memory.plan_hydration',
            field: 'selectedCheckpoint.checkpointId',
            rule: 'read only when a local checkpoint candidate is selected',
          },
        },
        purpose: 'load compact advisory continuity summary',
        advisory_only: true,
        runtime_hydration_attempted: false,
      },
    },
    {
      tool: 'narada_task_work_next',
      arguments: {
        agent: {
          from_step: 'hydrate_current',
          field: 'agent_id',
          rule: 'use verified agent_id returned by agent_context_hydrate_current',
        },
        claim: false,
      },
      purpose: 'peek governed next work for launched agent without claiming',
      depends_on: 'agent_context_memory.plan_hydration',
      output_key: 'first_work_orientation',
      first_work_orientation: {
        schema: 'narada.agent_start.first_work_orientation.v0',
        target_locus: 'narada_proper',
        agent_id: 'narada.architect',
        role: 'architect',
        advisory_only: true,
        mutation_attempted: false,
        claim_attempted: false,
        publish_or_deploy_authority_admitted: false,
        authority_limits: [
          'startup_orientation_does_not_claim_task',
          'startup_orientation_does_not_publish_or_deploy',
          'startup_orientation_does_not_grant_credential_access',
        ],
        mode: 'work_next_peek',
        read_tool: {
          name: 'narada_task_work_next',
          arguments: {
            agent: 'narada.architect',
            claim: false,
          },
        },
        claim_guidance: {
          command: 'narada task work-next --agent narada.architect --claim',
          rule: 'Use only when the peeked governed next work remains appropriate for this role and no explicit handoff target was provided.',
        },
      },
      explicit_handoff_target: false,
      mutation_attempted: false,
      claim_attempted: false,
      advisory_only: true,
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
  assert.equal(result.startup_command_name, 'agent_context_startup_sequence');
  assert.equal(result.mcp_runtime.package_name, '@narada2/narada-proper-mcp');
  assert.equal(result.mcp_runtime.depends_on_cli_dist, false);
  assert.ok(!result.runtime_args.some((arg) => arg.includes('mcp_servers.')));
  assert.ok(!result.runtime_args.some((arg) => arg.includes('narada-andrey-agent-context')));
  assert.ok(!result.runtime_args.some((arg) => arg.includes('narada-andrey-task-lifecycle')));
  assert.ok(!result.runtime_args.some((arg) => arg.includes('narada-andrey-shell')));
  assert.equal(result.startup_sequence[0].tool, 'agent_context_hydrate_current');
  assert.deepEqual(result.startup_sequence[0].arguments, {});
  assert.equal(result.startup_sequence[1].tool, 'agent_context_memory.plan_hydration');
  assert.deepEqual(result.startup_sequence[1].arguments.named_agent_id, {
    from_step: 'hydrate_current',
    field: 'agent_id',
    rule: 'use verified agent_id returned by agent_context_hydrate_current',
  });
  assert.equal(result.startup_sequence[1].runtime_hydration_attempted, false);
  assert.equal(result.startup_sequence[1].advisory_only, true);
  assert.equal(result.startup_sequence[1].optional_next.tool, 'agent_context_memory.read_checkpoint_summary');
  assert.deepEqual(result.startup_sequence[1].optional_next.arguments.checkpoint_id, {
    from_step: 'agent_context_memory.plan_hydration',
    field: 'selectedCheckpoint.checkpointId',
    rule: 'read only when a local checkpoint candidate is selected',
  });
  assert.equal(result.startup_sequence[2].tool, 'narada_task_work_next');
  assert.equal(result.startup_sequence[2].arguments.claim, false);
  assert.equal(result.startup_sequence[2].mutation_attempted, false);
  assert.equal(result.startup_sequence[2].first_work_orientation.mode, 'work_next_peek');
  assert.equal(result.startup_sequence[2].first_work_orientation.agent_id, 'narada.architect');
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

test('second builder launch binds codex home and config path to builder2 identity', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { event, result } = buildLaunchPlanFromArgs({
    identity: 'narada.builder2',
    runtime: 'codex',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-16T20:07:00.000Z' });

  assert.equal(event.identity, 'narada.builder2');
  assert.equal(event.role, 'builder');
  assert.match(result.codex_config_path, /narada-builder2[\\/]config\.toml$/);
  assert.match(result.planned_environment.CODEX_HOME, /narada-builder2$/);
  assert.equal(result.planned_environment.NARADA_AGENT_ID, 'narada.builder2');
  assert.doesNotMatch(result.codex_config_path, /narada-builder[\\/]config\.toml$/);
  assert.doesNotMatch(result.codex_config_path, /narada-architect/);
});

test('second builder launch can carry explicit startup task handoff without claiming', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { event, result } = buildLaunchPlanFromArgs({
    identity: 'narada.builder2',
    runtime: 'codex',
    exec: true,
    dry_run: true,
    startup_task_number: 1406,
  }, { siteRoot, pcSiteRoot, now: '2026-05-16T20:18:00.000Z' });

  assert.equal(event.identity, 'narada.builder2');
  assert.equal(event.role, 'builder');
  assert.equal(result.startup_sequence[0].tool, 'agent_context_hydrate_current');
  assert.equal(result.startup_sequence[1].tool, 'agent_context_memory.plan_hydration');
  assert.equal(result.startup_sequence[2].tool, 'narada_task_read');
  assert.deepEqual(result.startup_sequence[2].arguments, { task_number: 1406 });
  assert.equal(result.startup_sequence[2].explicit_handoff_target, true);
  assert.equal(result.startup_sequence[2].mutation_attempted, false);
  assert.equal(result.startup_sequence[2].claim_attempted, false);
  assert.equal(result.startup_sequence[2].advisory_only, true);
  assert.equal(result.startup_first_work_orientation.mode, 'explicit_task_handoff');
  assert.equal(result.startup_first_work_orientation.agent_id, 'narada.builder2');
  assert.equal(result.startup_first_work_orientation.role, 'builder');
  assert.equal(result.startup_first_work_orientation.target_locus, 'narada_proper');
  assert.equal(result.startup_first_work_orientation.task_number, 1406);
  assert.deepEqual(result.startup_first_work_orientation.read_tool, {
    name: 'narada_task_read',
    arguments: {
      task_number: 1406,
    },
  });
  assert.match(result.startup_first_work_orientation.claim_guidance.command, /narada task claim 1406 --agent narada\.builder2/);
  assert.equal(result.startup_first_work_orientation.publish_or_deploy_authority_admitted, false);
  assert.ok(result.startup_first_work_orientation.authority_limits.includes('startup_orientation_does_not_publish_or_deploy'));
  assert.ok(result.not_claimed.includes('task_activation_authority'));
  assert.ok(result.not_claimed.includes('startup_sequence_claim_authority'));
  assert.ok(result.not_claimed.includes('repository_publication_authority'));
});

test('nars launch reports JSONL stdio runtime and Site-local session paths', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'nars',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-26T23:00:00.000Z' });

  assert.equal(result.runtime, 'nars');
  assert.equal(result.runtime_kind, 'nars');
  assert.equal(result.runtime_substrate_kind, 'nars');
  assert.equal(result.transport, 'jsonl_stdio');
  assert.equal(result.planned_environment.NARADA_NARS_SESSION_DIR, result.nars_session_dir);
  assert.match(result.nars_session_dir, /[\\/]\.narada[\\/]crew[\\/]nars-sessions[\\/]/);
  assert.equal(result.nars_launch.transport, 'jsonl_stdio');
  assert.equal(result.nars_launch.exec_stdout_contract, 'nars_protocol_only');
  assert.equal(result.nars_launch.launch_packet_stream_when_exec, 'stderr');
  assert.equal(result.nars_launch.reads_only_target_site_mcp_fabric, true);
  assert.equal(result.nars_launch.user_site_mcp_injected, false);
  assert.equal(result.nars_launch.native_shell_authority_admitted, false);
  assert.deepEqual(result.runtime_args.slice(0, 4), [
    result.nars_launch.argv[0],
    '--server',
    '--identity',
    'narada.architect',
  ]);
  assert.equal(result.runtime_args.includes('--session'), true);
  assert.equal(result.runtime_args.includes(result.carrier_session_id), true);
});

test('agent-cli launch reports interactive runtime and Site-local session paths', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'agent-cli',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-27T21:15:00.000Z' });

  assert.equal(result.runtime, 'agent-cli');
  assert.equal(result.runtime_kind, 'agent_cli_carrier');
  assert.equal(result.runtime_substrate_kind, 'agent-cli');
  assert.equal(result.transport, null);
  assert.match(result.agent_cli_session_dir, /[\\/]\.narada[\\/]crew[\\/]nars-sessions[\\/]/);
  assert.equal(result.agent_cli_launch.transport, 'interactive_stdio');
  assert.equal(result.agent_cli_launch.reads_only_target_site_mcp_fabric, true);
  assert.equal(result.agent_cli_launch.user_site_mcp_injected, false);
  assert.equal(result.agent_cli_launch.native_shell_authority_admitted, false);
  assert.deepEqual(result.runtime_args.slice(0, 3), [
    result.agent_cli_launch.argv[0],
    '--identity',
    'narada.architect',
  ]);
  assert.equal(result.runtime_args.includes('--server'), false);
  assert.equal(result.runtime_args.includes('--session'), true);
  assert.equal(result.runtime_args.includes(result.carrier_session_id), true);
  assert.equal(result.native_execution_policy.native_shell.status, 'not_admitted_for_runtime_slice');
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
  assert.equal(result.claude_code_launch.startup_hydration.name, 'agent_context_startup_sequence');
  assert.equal(result.claude_code_readiness.schema, 'narada.agent_start.claude_code_readiness.v0');
  assert.equal(result.claude_code_readiness.readiness_state, 'represented_only');
  assert.equal(result.claude_code_readiness.direct_sqlite_inspection_required, false);
  assert.ok(result.claude_code_readiness.withheld_authorities.includes('repository_publication_authority'));
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

test('claude-code execution policy admits process launch while withholding Narada authorities', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  fs.mkdirSync(path.join(siteRoot, '.narada', 'agent-carriers'), { recursive: true });
  fs.writeFileSync(
    path.join(siteRoot, '.narada', 'agent-carriers', 'claude-code-execution-policy.v0.json'),
    `${JSON.stringify({
      schema: 'narada.agent_start.claude_code_execution_policy.v0',
      carrier_kind: 'claude_code_carrier',
      target_locus: 'narada_proper',
      process_launch_admitted: true,
      authority_basis: 'task:1282',
      withheld_authorities: [
        'task_lifecycle_mutation_authority',
        'inbox_mutation_authority',
        'outbox_transport_authority',
        'repository_publication_authority',
        'site_mutation_authority',
        'credential_access',
        'native_shell_authority',
        'external_site_authority',
      ],
    }, null, 2)}\n`,
    'utf8',
  );

  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.builder',
    runtime: 'claude-code',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-15T15:31:30.000Z' });

  assert.equal(result.status, 'planned');
  assert.equal(result.exec, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.exec_command, 'claude');
  assert.equal(result.claude_code_launch.status, 'process_launch_policy_admitted');
  assert.equal(result.claude_code_launch.execution_admitted, true);
  assert.equal(result.claude_code_launch.execution_blocker, null);
  assert.equal(result.claude_code_process_adapter.status, 'ready');
  assert.equal(result.claude_code_process_adapter.environment_source, 'canonical_launch_packet_required_environment');
  assert.equal(result.claude_code_process_attempt.status, 'planned_not_spawned');
  assert.equal(result.claude_code_process_attempt.command, 'claude');
  assert.deepEqual(result.claude_code_process_attempt.argv, []);
  assert.ok(result.claude_code_process_attempt.environment_projection.recorded_keys.includes('NARADA_AGENT_ID'));
  assert.ok(result.claude_code_process_attempt.environment_projection.recorded_keys.includes('NARADA_CARRIER_SESSION_ID'));
  assert.equal(result.claude_code_process_attempt.environment_projection.raw_secret_values_recorded, false);
  assert.equal(result.claude_code_readiness.readiness_state, 'process_launch_policy_admitted');
  assert.ok(result.claude_code_readiness.smoke_proof_commands.includes('node --test tools\\agent-start\\start-agent.test.mjs'));
  assert.ok(result.claude_code_readiness.process_launch_is_not_authority.includes('Process launch readiness does not admit task'));
  assert.equal(result.claude_code_launch.execution_policy.process_launch.admitted, true);
  assert.equal(result.claude_code_launch.execution_policy.effectful_narada_authority.admitted, false);
  assert.ok(result.claude_code_launch.execution_policy.effectful_narada_authority.withheld_authorities.includes('task_lifecycle_mutation_authority'));
  assert.ok(result.claude_code_launch.execution_policy.effectful_narada_authority.withheld_authorities.includes('credential_access'));
  assert.equal(result.claude_code_launch.execution_policy.source_site_runtime_imported, false);
  assert.equal(result.claude_code_launch.execution_policy.pc_runtime_authority_imported, false);
  assert.equal(result.native_execution_policy.policy_aware_shell_mcp.status, 'withheld');
  assert.ok(result.not_claimed.includes('task_activation_authority'));
  assert.ok(result.not_claimed.includes('repository_publication_authority'));
});

test('claude-code launch writes process attempt evidence before spawn handoff', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  fs.mkdirSync(path.join(siteRoot, '.narada', 'agent-carriers'), { recursive: true });
  fs.writeFileSync(
    path.join(siteRoot, '.narada', 'agent-carriers', 'claude-code-execution-policy.v0.json'),
    `${JSON.stringify({
      schema: 'narada.agent_start.claude_code_execution_policy.v0',
      carrier_kind: 'claude_code_carrier',
      target_locus: 'narada_proper',
      process_launch_admitted: true,
      authority_basis: 'task:1283',
      withheld_authorities: [
        'task_lifecycle_mutation_authority',
        'inbox_mutation_authority',
        'outbox_transport_authority',
        'repository_publication_authority',
        'site_mutation_authority',
        'credential_access',
        'native_shell_authority',
        'external_site_authority',
      ],
    }, null, 2)}\n`,
    'utf8',
  );

  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.builder',
    runtime: 'claude-code',
    exec: true,
    dry_run: false,
  }, { siteRoot, pcSiteRoot, now: '2026-05-15T15:31:45.000Z' });
  const launchResultPath = writeLaunchResult(result, siteRoot);
  const processAttemptPath = writeClaudeCodeProcessAttempt(result, siteRoot);
  const attempt = JSON.parse(fs.readFileSync(processAttemptPath, 'utf8'));
  const readback = buildLaunchPlanFromArgs({
    identity: 'narada.builder',
    runtime: 'claude-code',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-15T15:31:46.000Z' }).result;

  assert.equal(fs.existsSync(launchResultPath), true);
  assert.equal(attempt.schema, 'narada.agent_start.claude_code_process_attempt.v0');
  assert.equal(attempt.status, 'recorded_before_spawn');
  assert.equal(attempt.launch_result_path, launchResultPath);
  assert.equal(attempt.agent_start_event_id, result.agent_start_event);
  assert.equal(attempt.carrier_session_id, result.carrier_session_id);
  assert.equal(attempt.process_launch_admitted, true);
  assert.equal(attempt.environment_projection.values.NARADA_AGENT_ID, 'narada.builder');
  assert.equal(attempt.environment_projection.values.NARADA_CARRIER_SESSION_ID, result.carrier_session_id);
  assert.equal(attempt.environment_projection.raw_secret_values_recorded, false);
  assert.ok(attempt.withheld_authorities.includes('repository_publication_authority'));
  assert.ok(attempt.withheld_authorities.includes('credential_access'));
  assert.equal(readback.claude_code_readiness.latest_launch_evidence_path, launchResultPath);
  assert.equal(readback.claude_code_readiness.latest_process_attempt_evidence_path, processAttemptPath);
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
  assert.equal(result.narada_native_launch.startup_hydration.name, 'agent_context_startup_sequence');
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

test('compact launch summary avoids full JSON packet for interactive exec', async () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'agent-cli',
    exec: true,
    dry_run: false,
  }, { siteRoot, pcSiteRoot, now: '2026-05-27T21:30:00.000Z' });
  writeLaunchResult(result, siteRoot);

  const summary = compactLaunchSummary(result);
  assert.match(summary, /agent-start: narada\.architect \(agent-cli\)/);
  assert.match(summary, /carrier_session:/);
  assert.match(summary, /launch_result:/);
  assert.equal(summary.includes('"schema"'), false);

  let written = '';
  await writeCompactResult(result, {
    write(chunk, callback) {
      written += chunk;
      callback();
    },
  });
  assert.equal(written, summary);
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
