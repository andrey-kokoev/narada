#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseLaunchRegistry } from '../mcp-fabric/site-fabric-audit.mjs';
import {
  ADMITTED_LAUNCH_SELECTION_KINDS,
  OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA,
  operatorSurfaceLaunchMatrixRow,
} from '../../packages/operator-surface-runtime-contract/src/operator-surface-runtime-selection.mjs';

const DEFAULT_LAUNCH_REGISTRY = 'C:/Users/Andrey/Narada/config/launch/agents.psd1';

const EVIDENCE_LEVELS = Object.freeze({
  CODE_ENFORCED: 'code_enforced',
  CONFIG_ENFORCED: 'config_enforced',
  STARTUP_ENFORCED: 'startup_enforced',
  DOCUMENTED_ADVISORY: 'documented_advisory',
  UNVERIFIED: 'unverified',
});

const CANONICAL_CARRIER_ROWS = Object.freeze(ADMITTED_LAUNCH_SELECTION_KINDS.map((launchSelectionKind) => {
  const matrixRow = operatorSurfaceLaunchMatrixRow(launchSelectionKind);
  if (!matrixRow) throw new Error(`carrier_launch_matrix_row_missing:${launchSelectionKind}`);
  return Object.freeze({
    carrier: matrixRow.launch_selection_kind,
    launch_selection_kind: matrixRow.launch_selection_kind,
    operator_surface_kind: matrixRow.operator_surface_kind,
    carrier_implementation_kind: matrixRow.carrier_implementation_kind,
    runtime_host_kind: matrixRow.runtime_host_kind,
    runtime_substrate_kind: matrixRow.runtime_substrate_kind,
    tool_fabric_adapter_kind: matrixRow.tool_fabric_adapter_kind,
    tool_fabric_source: matrixRow.tool_fabric_source,
    adapter_entrypoint: matrixRow.adapter_entrypoint,
    projection_capabilities: [...matrixRow.projection_capabilities],
    expected_tools: [...matrixRow.expected_tools],
    launch_supported: true,
    ...matrixRow.conformance,
    known_gaps: Object.freeze([...matrixRow.conformance.known_gaps]),
    states: [...matrixRow.states],
    matrix_states: [...matrixRow.states],
    expected_tools_scope: matrixRow.expected_tools_scope,
    ...(matrixRow.admission_basis ? { admission_basis: matrixRow.admission_basis } : {}),
  });
}));

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
  return CANONICAL_CARRIER_ROWS.map((row) => {
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
    carrier_launch_matrix_schema: OPERATOR_SURFACE_LAUNCH_MATRIX_CONTRACT_SCHEMA,
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
