import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildLaunchPlanFromArgs,
  codexHomeConfigContent,
  readAgentStartEvent,
  writeLaunchResult,
} from './start-agent.mjs';

function tempSite(options = {}) {
  const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'narada-agent-start-'));
  if (options.policy !== false) {
    writeMcpPolicy(siteRoot);
  }
  return siteRoot;
}

function writeMcpPolicy(siteRoot, overrides = {}) {
  const policy = {
    schema: 'narada.site_mcp.policy.v0',
    site_id: 'narada-proper',
    servers: {
      'narada-proper': {
        command: '${siteRoot}/node_modules/.bin/narada-mcp.cmd',
        args: ['--site-root', '${siteRoot}', '--site-id', 'narada-proper'],
        provider_locus: 'target_site_mcp',
        target_locus: 'narada_proper',
        purpose: 'target-local Narada proper MCP facade',
      },
      ...(overrides.servers ?? {}),
    },
    known_tools: overrides.known_tools ?? {
      'narada-proper': [
        'narada_site_context',
        'narada_mcp_fabric_context',
        'site_task_lifecycle.plan_init',
        'site_task_lifecycle.admit_task',
        'site_task_lifecycle.open_admitted_task',
        'site_task_lifecycle.read_task',
        'agent_context_memory.plan_hydration',
        'agent_context_memory.record_checkpoint',
        'agent_context_memory.read_checkpoint_summary',
        'narada_inbox_doctor',
        'narada_inbox_work_next',
        'narada_task_work_next',
        'narada_inbox_list',
        'narada_inbox_show',
        'narada_inbox_submit_observation',
        'narada_ee_mcp_doctor',
      ],
    },
    role_policies: overrides.role_policies ?? {
      architect: {
        servers: {
          'narada-proper': {
            allowed_tools: [
              'narada_site_context',
              'narada_mcp_fabric_context',
              'site_task_lifecycle.plan_init',
              'site_task_lifecycle.admit_task',
              'site_task_lifecycle.open_admitted_task',
              'site_task_lifecycle.read_task',
              'agent_context_memory.plan_hydration',
              'agent_context_memory.record_checkpoint',
              'agent_context_memory.read_checkpoint_summary',
              'narada_inbox_doctor',
              'narada_inbox_work_next',
              'narada_task_work_next',
              'narada_inbox_list',
              'narada_inbox_show',
              'narada_inbox_submit_observation',
              'narada_ee_mcp_doctor',
            ],
          },
        },
      },
    },
    admitted_agents: overrides.admitted_agents ?? { 'narada.architect': { role: 'architect' } },
  };
  const policyDir = path.join(siteRoot, 'tools', 'agent-start');
  fs.mkdirSync(policyDir, { recursive: true });
  fs.writeFileSync(path.join(policyDir, 'narada-proper.mcp-policy.json'), JSON.stringify(policy, null, 2));
}

function tempPcSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-pc-site-'));
}

function assertTargetLocalMcpBinding(result, siteRoot) {
  const joinedArgs = result.runtime_args.join('\n');
  const expectedCommand = result.resolved_mcp_servers[0].command;
  const expectedSiteRoot = result.resolved_mcp_servers[0].args[1];

  assert.ok(result.runtime_args.includes(`mcp_servers.\"narada-proper\".command=${JSON.stringify(expectedCommand)}`));
  assert.ok(result.runtime_args.includes('mcp_servers.\"narada-proper\".args[0]=\"--site-root\"'));
  assert.ok(result.runtime_args.includes(`mcp_servers.\"narada-proper\".args[1]=${JSON.stringify(expectedSiteRoot)}`));
  assert.ok(result.runtime_args.includes('mcp_servers.\"narada-proper\".args[2]=\"--site-id\"'));
  assert.ok(result.runtime_args.includes('mcp_servers.\"narada-proper\".args[3]=\"narada-proper\"'));
  assert.ok(result.runtime_args.includes('mcp_servers.\"narada-proper\".default_tools_approval_mode=\"approve\"'));
  assert.ok(!joinedArgs.includes('narada-andrey-agent-context'));
  assert.ok(!joinedArgs.includes('narada-andrey-task-lifecycle'));
  assert.ok(!joinedArgs.includes('narada-andrey-shell'));
  assert.equal(result.mcp_tool_approval.status, 'approved_by_launcher_config');
  assert.equal(result.mcp_tool_approval.provider_locus, 'target_site_mcp');
  assert.equal(result.mcp_tool_approval.target_locus, 'narada_proper');
  assert.deepEqual(result.mcp_tool_approval.approved_servers.map((server) => server.name), [
    'narada-proper',
  ]);
  assert.ok(result.mcp_tool_approval.explicitly_not_approved.includes('narada-andrey-task-lifecycle'));
  assert.equal(result.mcp_policy_enforcement.launch, 'hard_fail');
  assert.equal(result.mcp_policy_enforcement.runtime, 'mcp_server');
  assert.deepEqual(result.resolved_mcp_servers.map((server) => server.name), ['narada-proper']);
  assert.ok(result.resolved_tool_policy.servers['narada-proper'].allowed_tools.includes('narada_site_context'));
  assert.ok(!result.resolved_tool_policy.servers['narada-proper'].allowed_tools.includes('narada_ee_run'));
}

test('narada.architect real launch materializes carrier session env and target-local MCP binding', () => {
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
  assert.equal(result.launch_environment.CODEX_HOME, result.codex_home_path);
  assert.equal(JSON.parse(result.launch_environment.NARADA_MCP_TOOL_POLICY).agent_id, 'narada.architect');
  assert.equal(result.codex_config_authoritative, true);
  assert.equal(fs.existsSync(result.codex_config_path), true);
  const codexConfig = fs.readFileSync(result.codex_config_path, 'utf8');
  assert.equal(codexConfig, codexHomeConfigContent(siteRoot));
  assert.ok(codexConfig.includes('[mcp_servers."narada-proper"]'));
  assert.ok(!codexConfig.includes('narada-andrey-shell'));
  assert.equal(result.mcp_config_isolation.mechanism, 'CODEX_HOME');
  assert.deepEqual(result.mcp_config_isolation.allowed_servers, ['narada-proper']);
  assert.ok(result.carrier_session_id.startsWith('carrier_session_'));
  assert.equal(result.pc_carrier_session.status, 'registered');
  assert.equal(result.pc_carrier_session.carrier_session_id, result.carrier_session_id);
  assert.equal(fs.existsSync(result.pc_carrier_session.record_path), true);
  const pcCarrierRecord = JSON.parse(fs.readFileSync(result.pc_carrier_session.record_path, 'utf8'));
  assert.equal(pcCarrierRecord.schema, 'narada.pc_runtime.carrier_session.v0');
  assert.equal(pcCarrierRecord.carrier_session_id, result.carrier_session_id);
  assert.equal(pcCarrierRecord.agent_start_event_id, result.agent_start_event);
  assert.equal(pcCarrierRecord.verified_agent_identity, 'narada.architect');
  assert.equal(result.startup_command_name, 'narada_site_context');
  assertTargetLocalMcpBinding(result, siteRoot);
  assert.ok(result.runtime_args.includes('--disable'));
  assert.ok(result.runtime_args.includes('shell_tool'));
  assert.deepEqual(result.startup_command, {
    name: 'narada_site_context',
    arguments: {},
    display: 'narada_site_context({})',
  });
  assert.deepEqual(result.startup_sequence, [
    {
      tool: 'narada_site_context',
      arguments: {},
      purpose: 'verify the launched carrier is using the target-local Narada proper MCP facade',
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
  assert.equal(result.planned_environment.CODEX_HOME, result.codex_home_path);
  assert.equal(JSON.parse(result.planned_environment.NARADA_MCP_TOOL_POLICY).role, 'architect');
  assert.equal(result.codex_config_authoritative, false);
  assert.equal(fs.existsSync(result.codex_config_path), false);
  assert.equal(result.mcp_config_isolation.status, 'planned');
  assert.equal(result.mcp_config_isolation.mechanism, 'CODEX_HOME');
  assert.equal(result.pc_carrier_session.status, 'planned');
  assert.equal(fs.existsSync(result.pc_carrier_session.record_path), false);
  assert.equal(result.startup_command_name, 'narada_site_context');
  assertTargetLocalMcpBinding(result, siteRoot);
  assert.equal(result.startup_sequence[0].tool, 'narada_site_context');
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
  assert.equal(persisted.startup_sequence[0].tool, 'narada_site_context');
});


test('launch hard-fails when tracked Site MCP policy file is absent', () => {
  const siteRoot = tempSite({ policy: false });
  assert.throws(() => buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'codex',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot: tempPcSite() }), /mcp_policy_source_missing:/);
});

test('launch hard-fails when Site MCP role policy references an unknown server', () => {
  const siteRoot = tempSite({ policy: false });
  writeMcpPolicy(siteRoot, {
    servers: {},
    role_policies: {
      architect: { servers: { missing: { allowed_tools: ['narada_site_context'] } } },
    },
  });

  assert.throws(() => buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'codex',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot: tempPcSite() }), /mcp_policy_unknown_server:missing/);
});


test('launch hard-fails when narada-proper known tool universe is absent', () => {
  const siteRoot = tempSite({ policy: false });
  writeMcpPolicy(siteRoot, { known_tools: {} });

  assert.throws(() => buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'codex',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot: tempPcSite() }), /mcp_policy_known_tools_missing:narada-proper/);
});

test('launch hard-fails when Site MCP role policy names an unknown narada-proper tool', () => {
  const siteRoot = tempSite({ policy: false });
  writeMcpPolicy(siteRoot, {
    role_policies: {
      architect: { servers: { 'narada-proper': { allowed_tools: ['not_a_tool'] } } },
    },
  });

  assert.throws(() => buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'codex',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot: tempPcSite() }), /mcp_policy_unknown_tool:narada-proper:not_a_tool/);
});

test('launch resolves role from roster before tracked admitted-agent fallback', () => {
  const siteRoot = tempSite({ policy: false });
  writeMcpPolicy(siteRoot, {
    role_policies: {
      reviewer: { servers: { 'narada-proper': { allowed_tools: ['narada_site_context'] } } },
      architect: { servers: { 'narada-proper': { allowed_tools: ['narada_site_context', 'narada_task_work_next'] } } },
    },
  });
  const rosterDir = path.join(siteRoot, '.ai', 'agents');
  fs.mkdirSync(rosterDir, { recursive: true });
  fs.writeFileSync(path.join(rosterDir, 'roster.json'), JSON.stringify({
    agents: [{ agent_id: 'narada.architect', role: 'reviewer' }],
  }, null, 2));

  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.architect',
    runtime: 'codex',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot: tempPcSite() });

  assert.equal(result.resolved_tool_policy.role, 'reviewer');
  assert.ok(result.agent_role_source.endsWith(path.join('.ai', 'agents', 'roster.json')));
  assert.deepEqual(result.resolved_tool_policy.servers['narada-proper'].allowed_tools, ['narada_site_context']);
});

test('launch hard-fails when role is absent from roster and tracked admitted agents', () => {
  const siteRoot = tempSite({ policy: false });
  writeMcpPolicy(siteRoot, { admitted_agents: {} });

  assert.throws(() => buildLaunchPlanFromArgs({
    identity: 'narada.unknown',
    runtime: 'codex',
    exec: true,
    dry_run: true,
  }, { siteRoot, pcSiteRoot: tempPcSite() }), /agent_role_unresolved:narada\.unknown/);
});
