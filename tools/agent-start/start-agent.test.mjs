import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildLaunchPlanFromArgs,
  compactLaunchSummary,
  materializeAgentTuiLaunchFiles,
  parseAgentTuiLaunchSliceContract,
  parseAgentTuiMcpRuntimeContract,
  parseAgentTuiProviderAdapterContract,
  parseAgentTuiTerminalRuntimeContract,
  readAgentStartEvent,
  writeCompactResult,
  writeClaudeCodeProcessAttempt,
  writeLaunchResult,
} from './start-agent.mjs';
import {
  buildAgentTuiRolloutAcceptanceReport,
  defaultOutputPath as defaultAgentTuiRolloutOutputPath,
  parseArgs as parseAgentTuiRolloutArgs,
  parseKnownSiteRoot,
  parseSiteEvidence,
  validateEvidenceJson,
  writeReport as writeAgentTuiRolloutReport,
} from './agent-tui-rollout-acceptance.mjs';
const AGENT_TUI_MCP_RUNTIME_CONTRACT = parseAgentTuiMcpRuntimeContract(fs.readFileSync(
  path.join(process.cwd(), 'packages', 'agent-tui', 'contracts', 'mcp-runtime.json'),
  'utf8',
));
const AGENT_TUI_PROVIDER_ADAPTER_CONTRACT = parseAgentTuiProviderAdapterContract(fs.readFileSync(
  path.join(process.cwd(), 'packages', 'agent-tui', 'contracts', 'provider-adapters.json'),
  'utf8',
));
const AGENT_TUI_TERMINAL_RUNTIME_CONTRACT = parseAgentTuiTerminalRuntimeContract(fs.readFileSync(
  path.join(process.cwd(), 'packages', 'agent-tui', 'contracts', 'terminal-runtime.json'),
  'utf8',
));
const AGENT_TUI_LAUNCH_SLICE_CONTRACT = parseAgentTuiLaunchSliceContract(fs.readFileSync(
  path.join(process.cwd(), 'packages', 'agent-tui', 'contracts', 'launch-slice.json'),
  'utf8',
));

test('agent-tui provider adapter contract parser rejects invalid contracts', () => {
  assert.throws(
    () => parseAgentTuiProviderAdapterContract('{'),
    /provider_adapter_contract_parse_failed/,
  );
  assert.throws(
    () => parseAgentTuiProviderAdapterContract(JSON.stringify({
      schema: 'narada.agent_tui.wrong_provider_contract.v0',
      provider_execution_env_var: 'NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION',
      provider_adapter_kind_env_var: 'NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND',
      scripted_provider_adapter_kind: 'scripted_provider_adapter',
      production_provider_adapter_kind: 'codex_subscription_adapter',
      production_provider_adapter_implemented: false,
    })),
    /provider_adapter_contract_invalid:schema/,
  );
  assert.throws(
    () => parseAgentTuiProviderAdapterContract(JSON.stringify({
      schema: 'narada.agent_tui.provider_adapter_contract.v0',
      provider_execution_env_var: 'NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION',
      provider_adapter_kind_env_var: 'NARADA_AGENT_TUI_PROVIDER_ADAPTER_KIND',
      scripted_provider_adapter_kind: 'scripted_provider_adapter',
      production_provider_adapter_kind: 'codex_subscription_adapter',
      production_provider_adapter_implemented: true,
    })),
    /provider_adapter_contract_invalid:production_provider_adapter_implemented/,
  );
});

test('agent-tui MCP runtime contract parser rejects invalid contracts', () => {
  assert.throws(
    () => parseAgentTuiMcpRuntimeContract('{'),
    /mcp_runtime_contract_parse_failed/,
  );
  assert.throws(
    () => parseAgentTuiMcpRuntimeContract(JSON.stringify({
      schema: 'narada.agent_tui.wrong_mcp_runtime_contract.v0',
      mcp_fabric_env_var: 'NARADA_AGENT_TUI_ENABLE_MCP_FABRIC',
      mcp_config_path_policy: 'inside_site_mcp_fabric_without_parent_traversal',
    })),
    /mcp_runtime_contract_invalid:schema/,
  );
  assert.throws(
    () => parseAgentTuiMcpRuntimeContract(JSON.stringify({
      schema: 'narada.agent_tui.mcp_runtime_contract.v0',
      mcp_fabric_env_var: 'NARADA_AGENT_TUI_ENABLE_MCP_FABRIC',
      mcp_config_path_policy: 'inside_prefix_only',
    })),
    /mcp_runtime_contract_invalid:mcp_config_path_policy/,
  );
});

test('agent-tui terminal runtime contract parser rejects invalid contracts', () => {
  assert.throws(
    () => parseAgentTuiTerminalRuntimeContract('{'),
    /terminal_runtime_contract_parse_failed/,
  );
  assert.throws(
    () => parseAgentTuiTerminalRuntimeContract(JSON.stringify({
      schema: 'narada.agent_tui.terminal_runtime_contract.v0',
      terminal_rendering_env_var: 'NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING',
      terminal_mode_env_var: 'NARADA_AGENT_TUI_TERMINAL_MODE',
      required_terminal_mode: 'render_once',
    })),
    /terminal_runtime_contract_invalid:required_terminal_mode/,
  );
});

test('agent-tui launch slice contract parser rejects invalid contracts', () => {
  assert.throws(
    () => parseAgentTuiLaunchSliceContract('{'),
    /launch_slice_contract_parse_failed/,
  );
  assert.throws(
    () => parseAgentTuiLaunchSliceContract(JSON.stringify({
      schema: 'narada.agent_tui.launch_slice_contract.v0',
      admitted_runtime_slice: 'terminal_interactive_loop',
      carrier_flag: '--interactive-step-once',
      tool_fabric_adapter_kind: 'narada-agent-tui-interactive-step',
      capability_policy_smoke_step: 'bounded_non_terminal_control_jsonl',
      terminal_mode: false,
    })),
    /launch_slice_contract_invalid:admitted_runtime_slice/,
  );
});
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

test('agent-runtime-server launch reports JSONL stdio runtime and Site-local session paths', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'agent-runtime-server',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-26T23:00:00.000Z' });

  assert.equal(result.runtime, 'agent-runtime-server');
  assert.equal(result.runtime_kind, 'agent_runtime_server_carrier');
  assert.equal(result.runtime_substrate_kind, 'agent-runtime-server');
  assert.equal(result.transport, 'jsonl_stdio');
  assert.equal(result.planned_environment.NARADA_AGENT_RUNTIME_SERVER_SESSION_DIR, result.agent_runtime_server_session_dir);
  assert.match(result.agent_runtime_server_session_dir, /[\\/]\.narada[\\/]crew[\\/]nars-sessions[\\/]/);
  assert.equal(result.agent_runtime_server_launch.transport, 'jsonl_stdio');
  assert.equal(result.agent_runtime_server_launch.exec_stdout_contract, 'agent_runtime_server_protocol_only');
  assert.equal(result.agent_runtime_server_launch.launch_packet_stream_when_exec, 'stderr');
  assert.equal(result.agent_runtime_server_launch.reads_only_target_site_mcp_fabric, true);
  assert.equal(result.agent_runtime_server_launch.user_site_mcp_injected, false);
  assert.equal(result.agent_runtime_server_launch.native_shell_authority_admitted, false);
  assert.deepEqual(result.runtime_args.slice(0, 3), [
    result.agent_runtime_server_launch.argv[0],
    '--identity',
    'narada.architect',
  ]);
  assert.equal(result.runtime_args.includes('--session'), true);
  assert.equal(result.runtime_args.includes(result.carrier_session_id), true);
});

test('legacy nars runtime input canonicalizes to agent-runtime-server', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'nars',
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-26T23:00:00.000Z' });

  assert.equal(result.runtime, 'agent-runtime-server');
  assert.equal(result.runtime_kind, 'agent_runtime_server_carrier');
  assert.equal(result.agent_runtime_server_launch.transport, 'jsonl_stdio');
});

test('agent-tui launch reports bounded non-terminal interactive smoke step', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.resident',
    runtime: 'agent-tui',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot, now: '2026-05-30T12:00:00.000Z' });

  assert.equal(result.runtime, 'agent-tui');
  assert.equal(result.runtime_kind, 'agent_tui_carrier');
  assert.equal(result.runtime_substrate_kind, 'agent-tui');
  assert.equal(result.transport, 'control_jsonl_session_jsonl');
  assert.equal(result.tool_fabric_adapter_kind, AGENT_TUI_LAUNCH_SLICE_CONTRACT.tool_fabric_adapter_kind);
  assert.equal(result.capability_policy.smoke_step, AGENT_TUI_LAUNCH_SLICE_CONTRACT.capability_policy_smoke_step);
  assert.equal(result.planned_environment.NARADA_AGENT_TUI_SESSION_DIR, result.agent_tui_session_dir);
  assert.equal(result.planned_environment.NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION, 'false');
  assert.equal(result.planned_environment.NARADA_AGENT_TUI_ENABLE_MCP_FABRIC, 'false');
  assert.equal(result.planned_environment.NARADA_AGENT_TUI_ENABLE_TERMINAL_RENDERING, 'false');
  assert.equal(result.agent_tui_session_dir.includes(`${path.sep}.narada${path.sep}crew${path.sep}nars-sessions${path.sep}`), true);
  assert.equal(result.agent_tui_launch.schema, 'narada.agent_start.agent_tui.v0');
  assert.equal(result.agent_tui_launch.transport, 'control_jsonl_session_jsonl');
  assert.equal(result.agent_tui_launch.session_dir, result.agent_tui_session_dir);
  assert.equal(result.agent_tui_launch.session_path, path.join(result.agent_tui_session_dir, 'session.jsonl'));
  assert.equal(result.agent_tui_launch.control_path, path.join(result.agent_tui_session_dir, 'control.jsonl'));
  assert.equal(result.agent_tui_launch.admitted_runtime_slice, AGENT_TUI_LAUNCH_SLICE_CONTRACT.admitted_runtime_slice);
  assert.equal(result.agent_tui_launch.rust_toolchain_readiness.schema, 'narada.agent_tui.rust_toolchain_readiness.command.v0');
  assert.equal(result.agent_tui_launch.rust_toolchain_readiness.status, 'operator_preflight_available');
  assert.equal(result.agent_tui_launch.rust_toolchain_readiness.command, 'node');
  assert.deepEqual(result.agent_tui_launch.rust_toolchain_readiness.argv, [
    path.join(siteRoot, 'tools', 'agent-start', 'check-agent-tui-rust-toolchain.mjs'),
  ]);
  assert.equal(result.agent_tui_launch.rust_toolchain_readiness.working_directory, siteRoot);
  assert.equal(result.agent_tui_launch.rust_toolchain_readiness.expected_blocker, 'missing_msvc_link_exe_or_windows_sdk_lib_not_loaded');
  assert.equal(result.agent_tui_launch.rust_toolchain_readiness.success_exit_code, 0);
  assert.equal(result.agent_tui_launch.rust_toolchain_readiness.blocked_exit_code, 1);
  assert.equal(result.agent_tui_launch.smoke_step.terminal_mode, AGENT_TUI_LAUNCH_SLICE_CONTRACT.terminal_mode);
  assert.equal(result.agent_tui_launch.interactive_loop.mode, 'interactive_loop');
  assert.equal(result.agent_tui_launch.interactive_loop.admitted, false);
  assert.equal(result.agent_tui_launch.interactive_loop.required_flag, '--interactive-loop');
  assert.deepEqual(result.agent_tui_launch.interactive_loop.environment_gate, {
    variable: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.terminal_rendering_env_var,
    value: 'false',
    mode_variable: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.terminal_mode_env_var,
    required_mode: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.required_terminal_mode,
    operator_override_admitted: false,
  });
  assert.equal(result.agent_tui_launch.interactive_loop.promotion_gate, 'agent_tui_terminal_interactive_loop_promotion_gate');
  assert.equal(result.agent_tui_launch.promotion_gate.status, 'not_satisfied');
  assert.deepEqual(result.agent_tui_launch.promotion_gate.checklist.map((item) => item.id), [
    'rust_tests_available',
    'terminal_interactive_loop_acceptance',
    'carrier_command_acceptance',
    'rendering_diagnostic_boundary_acceptance',
    'payload_reference_policy_acceptance',
    'provider_adapter_admission',
    'mcp_fabric_client_admission',
    'site_rollout_acceptance',
    'launch_metadata_runtime_slice',
  ]);
  assert.equal(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'rust_tests_available').status, 'partial');
  assert.equal(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'terminal_interactive_loop_acceptance').status, 'partial');
  assert.equal(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'carrier_command_acceptance').status, 'satisfied');
  assert.equal(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'rendering_diagnostic_boundary_acceptance').status, 'satisfied');
  assert.equal(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'payload_reference_policy_acceptance').status, 'satisfied');
  assert.equal(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'provider_adapter_admission').status, 'partial');
  assert.match(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'provider_adapter_admission').current_evidence, /scripted_provider_adapter/);
  assert.equal(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'site_rollout_acceptance').status, 'satisfied');
  assert.match(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'site_rollout_acceptance').current_evidence, /All launcher-registry Sites/);
  assert.match(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'rendering_diagnostic_boundary_acceptance').source_contract, /rendering contract/);
  assert.equal(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'launch_metadata_runtime_slice').status, 'satisfied');
  assert.match(result.agent_tui_launch.promotion_gate.reason, /bounded non-terminal smoke/);
  assert.match(result.agent_tui_launch.promotion_gate.reason, /Rust tests/);
  assert.match(result.agent_tui_launch.promotion_gate.reason, /explicit terminal-mode promotion/);
  assert.equal(result.agent_tui_launch.terminal_rendering.status, 'not_admitted_for_runtime_slice');
  assert.equal(result.agent_tui_launch.terminal_rendering.admitted, false);
  assert.deepEqual(result.agent_tui_launch.terminal_rendering.gated_modes, ['--render-once', '--interactive-loop']);
  assert.deepEqual(result.agent_tui_launch.terminal_rendering.environment_gate, {
    variable: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.terminal_rendering_env_var,
    value: 'false',
    mode_variable: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.terminal_mode_env_var,
    required_mode: AGENT_TUI_TERMINAL_RUNTIME_CONTRACT.required_terminal_mode,
    operator_override_admitted: false,
  });
  assert.deepEqual(result.agent_tui_launch.terminal_rendering.required_before_admission, [
    'provider_adapter_admission',
    'mcp_fabric_client_admission',
    'explicit_terminal_mode_promotion',
  ]);
  assert.match(result.agent_tui_launch.terminal_rendering.current_evidence, /live composer/);
  assert.match(result.agent_tui_launch.terminal_rendering.reason, /without alternate screen/);
  assert.equal(result.agent_tui_launch.terminal_rendering.promotion_gate, 'agent_tui_terminal_rendering_promotion_gate');
  assert.equal(result.agent_tui_launch.provider_execution_enabled, false);
  assert.equal(result.agent_tui_launch.provider_execution.status, 'not_admitted_for_runtime_slice');
  assert.equal(result.agent_tui_launch.provider_execution.adapter_contract, 'implemented_but_not_admitted_for_production_runtime_slice');
  assert.equal(result.agent_tui_launch.provider_execution.dispatch_authority, 'withheld');
  assert.deepEqual(result.agent_tui_launch.provider_execution.environment_gate, {
    variable: AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.provider_execution_env_var,
    value: 'false',
    operator_override_admitted: false,
  });
  assert.equal(result.agent_tui_launch.provider_execution.promotion_gate, 'agent_tui_provider_adapter_promotion_gate');
  assert.equal(result.agent_tui_launch.provider_execution.scripted_provider_adapter_kind, AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.scripted_provider_adapter_kind);
  assert.equal(result.agent_tui_launch.provider_execution.production_provider_adapter_kind, AGENT_TUI_PROVIDER_ADAPTER_CONTRACT.production_provider_adapter_kind);
  assert.equal(result.agent_tui_launch.provider_execution.production_provider_adapter_implemented, false);
  assert.match(result.agent_tui_launch.provider_execution.current_evidence, /provider-adapters.json/);
  assert.match(result.agent_tui_launch.provider_execution.current_evidence, /streaming contract status/);
  assert.match(result.agent_tui_launch.provider_execution.current_evidence, /provider adapter factory/);
  assert.deepEqual(result.agent_tui_launch.provider_execution.required_before_admission, [
    'production_provider_adapter_implementation_and_admission',
    'provider_boundary_evidence_contract',
    'streaming_turn_output_contract',
    'tool_call_boundary_contract',
  ]);
  assert.match(result.agent_tui_launch.provider_execution.reason, /without dispatching provider work/);
  assert.equal(result.agent_tui_launch.mcp_fabric_access_enabled, false);
  assert.equal(result.agent_tui_launch.mcp_fabric_access.status, 'not_admitted_for_runtime_slice');
  assert.equal(result.agent_tui_launch.mcp_fabric_access.client_contract, 'implemented_but_not_admitted_for_production_runtime_slice');
  assert.equal(result.agent_tui_launch.mcp_fabric_access.tool_visibility_authority, 'withheld');
  assert.deepEqual(result.agent_tui_launch.mcp_fabric_access.environment_gate, {
    variable: AGENT_TUI_MCP_RUNTIME_CONTRACT.mcp_fabric_env_var,
    value: 'false',
    operator_override_admitted: false,
  });
  assert.equal(result.agent_tui_launch.mcp_fabric_access.promotion_gate, 'agent_tui_rust_mcp_fabric_client_promotion_gate');
  assert.equal(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'mcp_fabric_client_admission').status, 'partial');
  assert.match(result.agent_tui_launch.promotion_gate.checklist.find((item) => item.id === 'mcp_fabric_client_admission').current_evidence, /runtime-config executor construction/);
  assert.deepEqual(result.agent_tui_launch.mcp_fabric_access.required_before_admission, [
    'production_site_mcp_exposure_admission',
    'site_mcp_policy_visibility_contract',
    'tool_call_request_response_contract',
    'tool_call_evidence_contract',
  ]);
  assert.equal(result.agent_tui_launch.mcp_fabric_access.site_mcp_fabric, path.join(siteRoot, '.ai', 'mcp'));
  assert.equal(result.agent_tui_launch.mcp_fabric_access.mcp_config_path_policy, AGENT_TUI_MCP_RUNTIME_CONTRACT.mcp_config_path_policy);
  assert.match(result.agent_tui_launch.mcp_fabric_access.current_evidence, /config path containment without parent traversal/);
  assert.match(result.agent_tui_launch.mcp_fabric_access.current_evidence, /runtime-config executor construction/);
  assert.match(result.agent_tui_launch.mcp_fabric_access.reason, /withholds Site MCP tool exposure/);
  assert.equal(result.agent_tui_launch.site_rollout_acceptance.schema, 'narada.agent_tui.site_rollout_acceptance.v0');
  assert.equal(result.agent_tui_launch.site_rollout_acceptance.status, 'defined_not_executed');
  assert.equal(result.agent_tui_launch.site_rollout_acceptance.default_promotion_allowed, false);
  assert.deepEqual(result.agent_tui_launch.site_rollout_acceptance.known_sites.map((site) => site.site_id), [
    'narada-proper',
    'narada-andrey',
    'narada-staccato',
    'narada-revolution',
    'narada-timour-marketing-agent',
    'narada-utz',
    'narada-sonar',
    'smart-scheduling',
    'thoughts-project',
  ]);
  assert.equal(result.agent_tui_launch.site_rollout_acceptance.known_sites[0].launch_root, siteRoot);
  assert.ok(result.agent_tui_launch.site_rollout_acceptance.required_common_evidence.includes('agent-cli baseline launch result'));
  assert.ok(result.agent_tui_launch.site_rollout_acceptance.not_admitted_until.includes('agent-tui remains non-default while any known Site is pending or blocked'));
  assert.equal(result.runtime_args[0], 'run');
  assert.equal(result.runtime_args.includes('--manifest-path'), true);
  assert.equal(result.runtime_args.includes(path.join(siteRoot, 'packages', 'agent-tui', 'Cargo.toml')), true);
  assert.equal(result.runtime_args.includes(AGENT_TUI_LAUNCH_SLICE_CONTRACT.carrier_flag), true);
  assert.equal(result.runtime_args.includes('--interactive-smoke-loop'), false);
  assert.equal(result.runtime_args.includes('--persistent-smoke-session'), false);
  assert.equal(result.runtime_args.includes('--runtime-loop'), false);
  assert.equal(result.runtime_args.includes('--max-steps'), false);
  assert.equal(result.runtime_args.includes('1'), false);
  assert.equal(result.runtime_args.includes(result.agent_tui_launch.control_path), true);
  assert.equal(result.runtime_args.includes('--session-jsonl'), true);
  assert.equal(result.runtime_args.includes(result.agent_tui_launch.session_path), true);
  assert.match(result.exec_command, /^cargo run /);
  assert.equal(result.native_execution_policy.native_shell.status, 'not_admitted_for_runtime_slice');
  assert.equal(result.native_execution_policy.policy_aware_shell_mcp.status, 'not_admitted_for_runtime_slice');
  assert.match(result.mcp_tool_approval.note, /bounded non-terminal smoke step/);
});

test('agent-tui exec materializes session and control files before runtime spawn', () => {
  const siteRoot = tempSite();
  const pcSiteRoot = tempPcSite();
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.resident',
    runtime: 'agent-tui',
    exec: true,
    dry_run: false,
  }, { siteRoot, pcSiteRoot, now: '2026-05-30T12:05:00.000Z' });

  const materialized = materializeAgentTuiLaunchFiles(result);

  assert.equal(materialized.status, 'materialized');
  assert.equal(fs.existsSync(result.agent_tui_launch.session_dir), true);
  assert.equal(fs.existsSync(result.agent_tui_launch.control_path), true);
  assert.equal(fs.existsSync(result.agent_tui_launch.session_path), true);
  assert.equal(fs.readFileSync(result.agent_tui_launch.control_path, 'utf8'), '');
  assert.equal(fs.readFileSync(result.agent_tui_launch.session_path, 'utf8'), '');

  fs.writeFileSync(result.agent_tui_launch.control_path, '{"kind":"test"}\n', 'utf8');
  materializeAgentTuiLaunchFiles(result);
  assert.equal(fs.readFileSync(result.agent_tui_launch.control_path, 'utf8'), '{"kind":"test"}\n');
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

test('agent-tui rollout acceptance command reports known Site blockers without launching carriers', () => {
  const siteRoot = tempSite();
  const report = buildAgentTuiRolloutAcceptanceReport({
    siteRoot,
    now: '2026-05-30T13:00:00.000Z',
  });

  assert.equal(report.schema, 'narada.agent_tui.site_rollout_acceptance_report.v0');
  assert.equal(report.status, 'blocked');
  assert.equal(report.source_launch_runtime, 'agent-tui');
  assert.equal(report.source_launch_status, 'planned');
  assert.equal(report.default_promotion_allowed, false);
  assert.equal(report.sites[0].agent_cli_evidence_status, 'not_recorded');
  assert.equal(report.sites[0].agent_tui_evidence_status, 'not_recorded');
  assert.deepEqual(report.sites.map((site) => site.site_id), [
    'narada-proper',
    'narada-andrey',
    'narada-staccato',
    'narada-revolution',
    'narada-timour-marketing-agent',
    'narada-utz',
    'narada-sonar',
    'smart-scheduling',
    'thoughts-project',
  ]);
  assert.equal(report.sites[0].status, 'pending_live_acceptance');
  assert.equal(report.sites[0].blocker, 'side_by_side_launch_evidence_not_recorded');
  assert.equal(report.sites[0].launch_root_source, 'primary_site_root');
  assert.equal(report.sites[1].status, 'pending_site_root_resolution');
  assert.equal(report.sites[1].blocker, 'launch_root_not_known_to_narada_proper_acceptance_command');
  assert.equal(report.summary.accepted, 0);
  assert.equal(report.summary.pending, 9);
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.summary.total, 9);

  const outputPath = defaultAgentTuiRolloutOutputPath(siteRoot);
  assert.match(outputPath, /agent-tui-rollout-acceptance[\\/]latest\.json$/);
  const writtenPath = writeAgentTuiRolloutReport(report, outputPath);
  assert.equal(writtenPath, outputPath);
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).schema, report.schema);
});

test('agent-tui rollout acceptance resolves operator supplied known Site roots', () => {
  const siteRoot = tempSite();
  const sonarRoot = tempSite();
  const smartSchedulingRoot = path.join(os.tmpdir(), 'narada-missing-smart-scheduling-root');
  const parsed = parseKnownSiteRoot(`narada-sonar=${sonarRoot}`);
  assert.deepEqual(parsed, {
    siteId: 'narada-sonar',
    root: sonarRoot,
  });
  const args = parseAgentTuiRolloutArgs([
    '--site-root', siteRoot,
    '--known-site-root', `narada-sonar=${sonarRoot}`,
    '--known-site-root', `smart-scheduling=${smartSchedulingRoot}`,
    '--json',
  ]);

  const report = buildAgentTuiRolloutAcceptanceReport({
    siteRoot: args.siteRoot,
    knownSiteRoots: args.knownSiteRoots,
    now: '2026-05-30T13:15:00.000Z',
  });

  const sonar = report.sites.find((site) => site.site_id === 'narada-sonar');
  const smartScheduling = report.sites.find((site) => site.site_id === 'smart-scheduling');
  assert.equal(sonar.launch_root, sonarRoot);
  assert.equal(sonar.launch_root_source, 'operator_known_site_root');
  assert.equal(sonar.status, 'pending_live_acceptance');
  assert.equal(smartScheduling.launch_root, smartSchedulingRoot);
  assert.equal(smartScheduling.launch_root_source, 'operator_known_site_root');
  assert.equal(smartScheduling.status, 'blocked_site_root_missing');
  assert.equal(smartScheduling.blocker, 'launch_root_does_not_exist');
  assert.equal(report.summary.pending, 8);
  assert.equal(report.summary.blocked, 1);
});

test('agent-tui rollout acceptance admits side-by-side evidence paths per Site', () => {
  const siteRoot = tempSite();
  const sonarRoot = tempSite();
  const agentCliEvidencePath = path.join(sonarRoot, 'agent-cli-launch-result.json');
  const agentTuiEvidencePath = path.join(sonarRoot, 'agent-tui-launch-result.json');
  fs.writeFileSync(agentCliEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'launching',
    dry_run: false,
    exec: true,
    agent_start_event_authoritative: true,
    carrier_session_authoritative: true,
    runtime: 'agent-cli',
    runtime_kind: 'agent_cli_carrier',
    agent_start_event: 'agent_start_test_cli',
    carrier_session_id: 'carrier_test_cli',
    required_environment: {
      NARADA_SITE_ROOT: sonarRoot,
    },
    agent_cli_launch: {
      session_path: path.join(sonarRoot, '.narada', 'crew', 'nars-sessions', 'cli', 'session.jsonl'),
      control_path: path.join(sonarRoot, '.narada', 'crew', 'nars-sessions', 'cli', 'control.jsonl'),
    },
  })}\n`, 'utf8');
  fs.writeFileSync(agentTuiEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'launching',
    dry_run: false,
    exec: true,
    agent_start_event_authoritative: true,
    carrier_session_authoritative: true,
    runtime: 'agent-tui',
    runtime_kind: 'agent_tui_carrier',
    agent_start_event: 'agent_start_test_tui',
    carrier_session_id: 'carrier_test_tui',
    required_environment: {
      NARADA_SITE_ROOT: sonarRoot,
    },
    agent_tui_launch: {
      admitted_runtime_slice: 'bounded_non_terminal_interactive_step_once',
      session_path: path.join(sonarRoot, '.narada', 'crew', 'nars-sessions', 'tui', 'session.jsonl'),
      control_path: path.join(sonarRoot, '.narada', 'crew', 'nars-sessions', 'tui', 'control.jsonl'),
    },
  })}\n`, 'utf8');
  assert.deepEqual(parseSiteEvidence(`narada-sonar=${agentCliEvidencePath}`, 'invalid_agent_cli_evidence'), {
    siteId: 'narada-sonar',
    path: agentCliEvidencePath,
  });
  assert.equal(validateEvidenceJson(agentCliEvidencePath, 'agent-cli').status, 'valid');
  assert.equal(validateEvidenceJson(agentTuiEvidencePath, 'agent-tui').status, 'valid');

  const args = parseAgentTuiRolloutArgs([
    '--site-root', siteRoot,
    '--known-site-root', `narada-sonar=${sonarRoot}`,
    '--agent-cli-evidence', `narada-sonar=${agentCliEvidencePath}`,
    '--agent-tui-evidence', `narada-sonar=${agentTuiEvidencePath}`,
  ]);
  const report = buildAgentTuiRolloutAcceptanceReport({
    siteRoot: args.siteRoot,
    knownSiteRoots: args.knownSiteRoots,
    agentCliEvidence: args.agentCliEvidence,
    agentTuiEvidence: args.agentTuiEvidence,
    now: '2026-05-30T13:30:00.000Z',
  });

  const sonar = report.sites.find((site) => site.site_id === 'narada-sonar');
  assert.equal(sonar.status, 'accepted');
  assert.equal(sonar.blocker, null);
  assert.equal(sonar.agent_cli_evidence_status, 'valid');
  assert.equal(sonar.agent_tui_evidence_status, 'valid');
  assert.equal(sonar.agent_cli_evidence_validation.agent_start_event, 'agent_start_test_cli');
  assert.equal(sonar.agent_tui_evidence_validation.agent_start_event, 'agent_start_test_tui');
  assert.equal(sonar.agent_cli_evidence_validation.site_root, sonarRoot);
  assert.equal(sonar.agent_cli_evidence_path, agentCliEvidencePath);
  assert.equal(sonar.agent_tui_evidence_path, agentTuiEvidencePath);
  assert.equal(report.summary.accepted, 1);
  assert.equal(report.status, 'blocked');
  assert.equal(report.default_promotion_allowed, false);
});

test('agent-tui rollout acceptance admits Site launcher session-start evidence for agent-cli baseline', () => {
  const siteRoot = tempSite();
  const sonarRoot = tempSite();
  const agentCliEvidencePath = path.join(sonarRoot, 'agent-cli-session-start.json');
  fs.writeFileSync(agentCliEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_context.session_start.v0',
    status: 'materialized',
    agent_start_event: 'evt-2026-05-31_00-04-25_28290811',
    identity: 'sonar.resident',
    runtime: 'agent-cli',
    runtime_substrate_kind: 'agent-cli',
    required_environment: {
      NARADA_SITE_ROOT: sonarRoot,
      NARADA_CARRIER_SESSION_ID: 'carrier_20260531000426_a1bbafaa0f22',
    },
    runtime_args: [
      'D:\\code\\narada\\packages\\agent-cli\\bin\\narada-agent-cli.mjs',
      '--identity',
      'sonar.resident',
      '--session',
      'carrier_20260531000426_a1bbafaa0f22',
      '--control-jsonl',
      path.join(sonarRoot, '.narada', 'crew', 'nars-sessions', 'carrier_20260531000426_a1bbafaa0f22', 'control.jsonl'),
    ],
  })}\n`, 'utf8');

  const validation = validateEvidenceJson(agentCliEvidencePath, 'agent-cli', sonarRoot);

  assert.equal(validation.status, 'valid');
  assert.equal(validation.launch_schema, 'narada.agent_context.session_start.v0');
  assert.equal(validation.carrier_session_id, 'carrier_20260531000426_a1bbafaa0f22');
});

test('agent-tui rollout acceptance infers agent-cli control path for wrapped Site launcher evidence', () => {
  const siteRoot = tempSite();
  const agentCliEvidencePath = path.join(siteRoot, 'agent-cli-wrapped-session-start.json');
  fs.writeFileSync(agentCliEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_context.session_start.v0',
    status: 'materialized',
    agent_start_event: 'evt-2026-05-31_00-04-19_e5147cef',
    identity: 'narada-andrey.resident',
    runtime: 'agent-cli',
    runtime_substrate_kind: 'agent-cli',
    required_environment: {
      NARADA_SITE_ROOT: siteRoot,
      NARADA_CARRIER_SESSION_ID: 'carrier_20260531000419_abc123',
    },
    runtime_args: [
      '-File',
      path.join(siteRoot, 'tools', 'operator-surface-carriers', 'Start-AgentCliSession.ps1'),
      '-IdentityName',
      'narada-andrey.resident',
    ],
  })}\n`, 'utf8');

  const validation = validateEvidenceJson(agentCliEvidencePath, 'agent-cli', siteRoot);

  assert.equal(validation.status, 'valid');
  assert.equal(validation.launch_schema, 'narada.agent_context.session_start.v0');
  assert.equal(validation.carrier_session_id, 'carrier_20260531000419_abc123');
});

test('agent-tui rollout acceptance blocks missing recorded evidence paths', () => {
  const siteRoot = tempSite();
  const missingEvidencePath = path.join(siteRoot, 'missing-agent-tui-evidence.json');
  const report = buildAgentTuiRolloutAcceptanceReport({
    siteRoot,
    agentCliEvidence: { 'narada-proper': missingEvidencePath },
    agentTuiEvidence: { 'narada-proper': missingEvidencePath },
    now: '2026-05-30T13:35:00.000Z',
  });

  const proper = report.sites.find((site) => site.site_id === 'narada-proper');
  assert.equal(proper.status, 'blocked_evidence_path_missing');
  assert.equal(proper.blocker, 'recorded_evidence_path_does_not_exist');
  assert.equal(proper.agent_cli_evidence_status, 'missing');
  assert.equal(proper.agent_tui_evidence_status, 'missing');
  assert.equal(report.summary.blocked, 1);
});

test('agent-tui rollout acceptance blocks evidence from a different Site root', () => {
  const siteRoot = tempSite();
  const wrongRoot = tempSite();
  const agentCliEvidencePath = path.join(siteRoot, 'agent-cli-wrong-root.json');
  const agentTuiEvidencePath = path.join(siteRoot, 'agent-tui-wrong-root.json');
  fs.writeFileSync(agentCliEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'launching',
    dry_run: false,
    exec: true,
    agent_start_event_authoritative: true,
    carrier_session_authoritative: true,
    runtime: 'agent-cli',
    runtime_kind: 'agent_cli_carrier',
    agent_start_event: 'agent_start_wrong_root_cli',
    carrier_session_id: 'carrier_wrong_root_cli',
    required_environment: {
      NARADA_SITE_ROOT: wrongRoot,
    },
    agent_cli_launch: {
      session_path: path.join(wrongRoot, '.narada', 'crew', 'nars-sessions', 'cli', 'session.jsonl'),
      control_path: path.join(wrongRoot, '.narada', 'crew', 'nars-sessions', 'cli', 'control.jsonl'),
    },
  })}\n`, 'utf8');
  fs.writeFileSync(agentTuiEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'launching',
    dry_run: false,
    exec: true,
    agent_start_event_authoritative: true,
    carrier_session_authoritative: true,
    runtime: 'agent-tui',
    runtime_kind: 'agent_tui_carrier',
    agent_start_event: 'agent_start_wrong_root_tui',
    carrier_session_id: 'carrier_wrong_root_tui',
    required_environment: {
      NARADA_SITE_ROOT: siteRoot,
    },
    agent_tui_launch: {
      admitted_runtime_slice: 'bounded_non_terminal_interactive_step_once',
      session_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'tui', 'session.jsonl'),
      control_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'tui', 'control.jsonl'),
    },
  })}\n`, 'utf8');

  const report = buildAgentTuiRolloutAcceptanceReport({
    siteRoot,
    agentCliEvidence: { 'narada-proper': agentCliEvidencePath },
    agentTuiEvidence: { 'narada-proper': agentTuiEvidencePath },
    now: '2026-05-30T13:45:00.000Z',
  });

  const proper = report.sites.find((site) => site.site_id === 'narada-proper');
  assert.equal(proper.status, 'blocked_evidence_invalid');
  assert.equal(proper.agent_cli_evidence_status, 'invalid_site_root');
  assert.equal(proper.agent_cli_evidence_validation.reason, 'site_root_mismatch');
  assert.equal(proper.agent_cli_evidence_validation.expected_site_root, siteRoot);
  assert.equal(proper.agent_cli_evidence_validation.actual_site_root, wrongRoot);
});

test('agent-tui rollout acceptance blocks incomplete launch evidence', () => {
  const siteRoot = tempSite();
  const agentCliEvidencePath = path.join(siteRoot, 'agent-cli-incomplete.json');
  const agentTuiEvidencePath = path.join(siteRoot, 'agent-tui-complete.json');
  fs.writeFileSync(agentCliEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'launching',
    dry_run: false,
    exec: true,
    agent_start_event_authoritative: true,
    carrier_session_authoritative: true,
    runtime: 'agent-cli',
    runtime_kind: 'agent_cli_carrier',
    carrier_session_id: 'carrier_incomplete_cli',
    required_environment: {
      NARADA_SITE_ROOT: siteRoot,
    },
    agent_cli_launch: {
      session_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'cli', 'session.jsonl'),
      control_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'cli', 'control.jsonl'),
    },
  })}\n`, 'utf8');
  fs.writeFileSync(agentTuiEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'launching',
    dry_run: false,
    exec: true,
    agent_start_event_authoritative: true,
    carrier_session_authoritative: true,
    runtime: 'agent-tui',
    runtime_kind: 'agent_tui_carrier',
    agent_start_event: 'agent_start_complete_tui',
    carrier_session_id: 'carrier_complete_tui',
    required_environment: {
      NARADA_SITE_ROOT: siteRoot,
    },
    agent_tui_launch: {
      admitted_runtime_slice: 'bounded_non_terminal_interactive_step_once',
      session_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'tui', 'session.jsonl'),
      control_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'tui', 'control.jsonl'),
    },
  })}\n`, 'utf8');

  const report = buildAgentTuiRolloutAcceptanceReport({
    siteRoot,
    agentCliEvidence: { 'narada-proper': agentCliEvidencePath },
    agentTuiEvidence: { 'narada-proper': agentTuiEvidencePath },
    now: '2026-05-30T13:50:00.000Z',
  });

  const proper = report.sites.find((site) => site.site_id === 'narada-proper');
  assert.equal(proper.status, 'blocked_evidence_invalid');
  assert.equal(proper.agent_cli_evidence_status, 'invalid_launch_identity');
  assert.equal(proper.agent_cli_evidence_validation.reason, 'agent_start_event_required');
});

test('agent-tui rollout acceptance blocks dry-run launch evidence', () => {
  const siteRoot = tempSite();
  const agentCliEvidencePath = path.join(siteRoot, 'agent-cli-dry-run.json');
  const agentTuiEvidencePath = path.join(siteRoot, 'agent-tui-live.json');
  fs.writeFileSync(agentCliEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'planned',
    dry_run: true,
    exec: true,
    agent_start_event_authoritative: false,
    carrier_session_authoritative: false,
    runtime: 'agent-cli',
    runtime_kind: 'agent_cli_carrier',
    agent_start_event: 'agent_start_dry_run_cli',
    carrier_session_id: 'carrier_dry_run_cli',
    required_environment: {
      NARADA_SITE_ROOT: siteRoot,
    },
    agent_cli_launch: {
      session_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'cli', 'session.jsonl'),
      control_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'cli', 'control.jsonl'),
    },
  })}\n`, 'utf8');
  fs.writeFileSync(agentTuiEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'launching',
    dry_run: false,
    exec: true,
    agent_start_event_authoritative: true,
    carrier_session_authoritative: true,
    runtime: 'agent-tui',
    runtime_kind: 'agent_tui_carrier',
    agent_start_event: 'agent_start_live_tui',
    carrier_session_id: 'carrier_live_tui',
    required_environment: {
      NARADA_SITE_ROOT: siteRoot,
    },
    agent_tui_launch: {
      admitted_runtime_slice: 'bounded_non_terminal_interactive_step_once',
      session_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'tui', 'session.jsonl'),
      control_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'tui', 'control.jsonl'),
    },
  })}\n`, 'utf8');

  const report = buildAgentTuiRolloutAcceptanceReport({
    siteRoot,
    agentCliEvidence: { 'narada-proper': agentCliEvidencePath },
    agentTuiEvidence: { 'narada-proper': agentTuiEvidencePath },
    now: '2026-05-30T13:55:00.000Z',
  });

  const proper = report.sites.find((site) => site.site_id === 'narada-proper');
  assert.equal(proper.status, 'blocked_evidence_invalid');
  assert.equal(proper.agent_cli_evidence_status, 'invalid_launch_status');
  assert.equal(proper.agent_cli_evidence_validation.reason, 'launch_status_planned_not_accepted');
});

test('agent-tui rollout acceptance blocks invalid evidence shape', () => {
  const siteRoot = tempSite();
  const badAgentCliEvidencePath = path.join(siteRoot, 'bad-agent-cli-evidence.json');
  const agentTuiEvidencePath = path.join(siteRoot, 'agent-tui-evidence.json');
  fs.writeFileSync(badAgentCliEvidencePath, '{"schema":"wrong"}\n', 'utf8');
  fs.writeFileSync(agentTuiEvidencePath, `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'launching',
    dry_run: false,
    exec: true,
    agent_start_event_authoritative: true,
    carrier_session_authoritative: true,
    runtime: 'agent-tui',
    runtime_kind: 'agent_tui_carrier',
    agent_start_event: 'agent_start_invalid_shape_tui',
    carrier_session_id: 'carrier_invalid_shape_tui',
    required_environment: {
      NARADA_SITE_ROOT: siteRoot,
    },
    agent_tui_launch: {
      admitted_runtime_slice: 'bounded_non_terminal_interactive_step_once',
      session_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'tui', 'session.jsonl'),
      control_path: path.join(siteRoot, '.narada', 'crew', 'nars-sessions', 'tui', 'control.jsonl'),
    },
  })}\n`, 'utf8');

  const report = buildAgentTuiRolloutAcceptanceReport({
    siteRoot,
    agentCliEvidence: { 'narada-proper': badAgentCliEvidencePath },
    agentTuiEvidence: { 'narada-proper': agentTuiEvidencePath },
    now: '2026-05-30T13:40:00.000Z',
  });

  const proper = report.sites.find((site) => site.site_id === 'narada-proper');
  assert.equal(proper.status, 'blocked_evidence_invalid');
  assert.equal(proper.blocker, 'recorded_evidence_shape_invalid');
  assert.equal(proper.agent_cli_evidence_status, 'invalid_shape');
  assert.equal(proper.agent_cli_evidence_validation.reason, 'unsupported_launch_evidence_schema');
  assert.equal(report.summary.blocked, 1);
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

test('interactive exec summary uses normalized agent-start renderer', async () => {
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
  assert.match(summary, /agent_start_event:/);
  assert.match(summary, /identity: narada\.architect/);
  assert.match(summary, /role: architect/);
  assert.match(summary, /tool_fabric_adapter_kind: narada-agent-cli-mcp-client/);
  assert.match(summary, /capability_policy:/);
  assert.match(summary, /launch_result_path:/);
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
