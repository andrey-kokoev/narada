#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseLaunchRegistry } from '../mcp-fabric/site-fabric-audit.mjs';

const DEFAULT_LAUNCH_REGISTRY = 'C:/Users/Andrey/Narada/config/launch/agents.psd1';

const EVIDENCE_LEVELS = Object.freeze({
  CODE_ENFORCED: 'code_enforced',
  CONFIG_ENFORCED: 'config_enforced',
  STARTUP_ENFORCED: 'startup_enforced',
  DOCUMENTED_ADVISORY: 'documented_advisory',
  UNVERIFIED: 'unverified',
});

const CARRIER_ROWS = Object.freeze([
  {
    carrier: 'agent-cli',
    launch_supported: true,
    default_intelligence_auth_path: 'codex-subscription through local Codex MCP server unless another admitted provider is selected',
    mcp_fabric_source: 'tools/mcp-fabric/loadSiteMcpFabric at runtime',
    native_shell_posture: 'not exposed as native carrier shell in NARS server mode; shell-like effects must be MCP tools and then admitted',
    mutating_call_handling: 'code-mediated Carrier Action Admission; read-only executes, mutating/unknown/credential-bearing routes or refuses',
    startup_sequence_availability: 'MCP tool if present in site fabric',
    evidence_level: EVIDENCE_LEVELS.CODE_ENFORCED,
    known_gaps: [
      'Full owner-side canonical materialization remains outside this carrier boundary slice.',
    ],
  },
  {
    carrier: 'codex',
    launch_supported: true,
    default_intelligence_auth_path: 'Codex subscription/auth handled by Codex CLI',
    mcp_fabric_source: 'Narada launcher projects Site MCP fabric into Codex -c mcp_servers.* arguments',
    native_shell_posture: 'launcher passes --disable shell_tool unless break-glass EnableNativeShell is set',
    mutating_call_handling: 'configuration limits available Narada MCP surfaces; Codex itself is not a Narada code-mediated admission loop',
    startup_sequence_availability: 'MCP tool if present in projected fabric',
    evidence_level: EVIDENCE_LEVELS.CONFIG_ENFORCED,
    known_gaps: [
      'Tool execution provenance is carrier-native unless routed through Narada-owned MCP/admission surfaces.',
      'Codex approval settings are launcher configuration, not NARS code mediation.',
    ],
  },
  {
    carrier: 'pi',
    launch_supported: true,
    coherent_launch_supported: true,
    support_posture: 'narada_owned_extension_bridge',
    default_intelligence_auth_path: 'openai-codex provider/model via Pi CLI by launcher default',
    mcp_fabric_source: 'Narada-owned Pi extension loads Site MCP tools declared in .ai/mcp',
    native_shell_posture: 'depends on Pi runtime; Narada launch attaches only Site-local MCP bridge and governed prompt posture',
    mutating_call_handling: 'configuration/adapter-mediated through Site MCP surfaces; not NARS code-mediated',
    startup_sequence_availability: 'MCP tool through Narada Pi extension when bridge loads correctly',
    evidence_level: EVIDENCE_LEVELS.CONFIG_ENFORCED,
    known_gaps: [
      'Pi native carrier behavior is not universally intercepted by NARS; only Narada MCP bridge calls are governed by the projected Site surfaces.',
      'Bridge startup should be smoke-tested per installed Pi version.',
    ],
  },
  {
    carrier: 'claude-code',
    launch_supported: true,
    default_intelligence_auth_path: 'Claude Code local auth/runtime',
    mcp_fabric_source: 'Narada launcher passes strict MCP config generated from Site fabric',
    native_shell_posture: 'launcher disallows Bash/Edit/Write/MultiEdit/NotebookEdit/WebFetch/WebSearch',
    mutating_call_handling: 'Claude Code effect mediation exists for explicit effect requests; native MCP calls are config-mediated unless adapter-mediated',
    startup_sequence_availability: 'MCP tool if present in generated strict MCP config',
    evidence_level: EVIDENCE_LEVELS.CONFIG_ENFORCED,
    known_gaps: [
      'Not all Claude Code native tool behavior is Narada code-mediated.',
      'Effect mediation is explicit artifact flow, not universal interception of all carrier actions.',
    ],
  },
]);

function currentLaunchRegistrySummary(launchRegistryPath = DEFAULT_LAUNCH_REGISTRY) {
  if (!existsSync(launchRegistryPath)) {
    return {
      launch_registry_path: launchRegistryPath,
      status: 'missing',
      runtime_counts: {},
      native_shell_enabled_counts: {},
    };
  }
  const records = parseLaunchRegistry(launchRegistryPath);
  const runtimeCounts = {};
  const nativeShellEnabledCounts = {};
  for (const record of records) {
    const runtime = record.runtime ?? 'codex';
    runtimeCounts[runtime] = (runtimeCounts[runtime] ?? 0) + 1;
    if (record.enable_native_shell === true) {
      nativeShellEnabledCounts[runtime] = (nativeShellEnabledCounts[runtime] ?? 0) + 1;
    }
  }
  return {
    launch_registry_path: launchRegistryPath,
    status: 'loaded',
    agent_count: records.length,
    runtime_counts: runtimeCounts,
    native_shell_enabled_counts: nativeShellEnabledCounts,
  };
}

function buildCarrierRows(launchRegistrySummary) {
  const codexCount = launchRegistrySummary.runtime_counts?.codex ?? 0;
  const codexNativeShellEnabledCount = launchRegistrySummary.native_shell_enabled_counts?.codex ?? 0;
  const codexConfiguredNativeShellPosture = codexCount === 0
    ? 'no_codex_agents_in_launch_registry'
    : (codexNativeShellEnabledCount > 0
      ? `native_shell_enabled_by_launch_registry_for_${codexNativeShellEnabledCount}_of_${codexCount}_codex_agents`
      : `native_shell_disabled_by_launch_registry_for_${codexCount}_codex_agents`);
  return CARRIER_ROWS.map((row) => {
    if (row.carrier !== 'codex') return { ...row, known_gaps: [...row.known_gaps] };
    return {
      ...row,
      native_shell_posture: 'launcher can pass --disable shell_tool when EnableNativeShell is false; current registry posture is reported separately',
      configured_default_native_shell_posture: codexConfiguredNativeShellPosture,
      launch_registry_path: launchRegistrySummary.launch_registry_path,
      known_gaps: [
        ...row.known_gaps,
        ...(codexNativeShellEnabledCount > 0
          ? ['Current launch registry enables native shell for at least one Codex agent; this is break-glass posture, not default-deny posture.']
          : []),
      ],
    };
  });
}

function buildCarrierConformanceMatrix({ launchRegistryPath = DEFAULT_LAUNCH_REGISTRY } = {}) {
  const launchRegistrySummary = currentLaunchRegistrySummary(launchRegistryPath);
  return {
    schema: 'narada.carrier_conformance_matrix.v1',
    generated_at: new Date().toISOString(),
    launch_registry_summary: launchRegistrySummary,
    evidence_levels: {
      code_enforced: 'Narada code mediates execution and can block, route, or refuse the requested action.',
      config_enforced: 'Narada-generated client config constrains available surfaces, but the carrier owns execution mechanics.',
      startup_enforced: 'Launcher/runtime arguments establish expected posture at process start.',
      documented_advisory: 'Prompt, doctrine, extension description, or operator instruction only.',
      unverified: 'No current evidence for the claimed behavior.',
    },
    rows: buildCarrierRows(launchRegistrySummary),
    mutation_performed: false,
  };
}

function parseArgs(argv) {
  const options = { launchRegistryPath: DEFAULT_LAUNCH_REGISTRY };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--registry' && argv[i + 1]) {
      options.launchRegistryPath = argv[++i];
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      options.help = true;
    }
  }
  return options;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: node tools/operator-surface-carriers/carrier-conformance-matrix.mjs [--registry <agents.psd1>]');
    return 0;
  }
  console.log(JSON.stringify(buildCarrierConformanceMatrix({ launchRegistryPath: options.launchRegistryPath }), null, 2));
  return 0;
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

export {
  EVIDENCE_LEVELS,
  buildCarrierConformanceMatrix,
  currentLaunchRegistrySummary,
};

if (isEntrypoint) {
  process.exitCode = runCli();
}
