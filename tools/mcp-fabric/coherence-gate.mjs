#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { buildCarrierConformanceMatrix } from '../operator-surface-carriers/carrier-conformance-matrix.mjs';
import { auditLauncherKnownSites } from './site-fabric-audit.mjs';

const DEFAULT_LAUNCH_REGISTRY = 'C:/Users/Andrey/Narada/config/launch/agents.psd1';

function runCoherenceGate({ launchRegistryPath = DEFAULT_LAUNCH_REGISTRY } = {}) {
  const siteAudit = auditLauncherKnownSites(launchRegistryPath);
  const carrierMatrix = buildCarrierConformanceMatrix({ launchRegistryPath });
  const failures = [];

  for (const site of siteAudit.sites) {
    if (site.tolerant_load?.status !== 'ok') {
      failures.push({
        code: 'site_fabric_load_error',
        site_root: site.site_root,
        recommendation: site.recommendation,
      });
    }
    if (site.strict_validation?.status === 'mismatch' || site.strict_validation?.status === 'error') {
      failures.push({
        code: 'site_registry_strict_validation_failed',
        site_root: site.site_root,
        strict_validation_status: site.strict_validation.status,
        missing: site.strict_validation.missing ?? [],
      });
    }
    if (site.mcp_server_count > 0 && site.recommendation !== 'ok') {
      failures.push({
        code: 'site_not_authoritatively_registered',
        site_root: site.site_root,
        recommendation: site.recommendation,
        live_unbound_servers: site.live_unbound_servers,
      });
    }
    if (site.agent_tui?.status !== 'ok') {
      failures.push({
        code: 'agent_tui_mcp_projection_not_coherent',
        site_root: site.site_root,
        agent_tui_status: site.agent_tui?.status ?? 'missing',
        failure_codes: site.agent_tui?.failure_codes ?? [],
      });
    }
  }

  const codexNativeShellEnabled = carrierMatrix.launch_registry_summary?.native_shell_enabled_counts?.codex ?? 0;
  if (codexNativeShellEnabled > 0) {
    failures.push({
      code: 'codex_native_shell_enabled',
      count: codexNativeShellEnabled,
      launch_registry_path: launchRegistryPath,
    });
  }

  for (const row of carrierMatrix.rows) {
    const count = carrierMatrix.launch_registry_summary?.runtime_counts?.[row.carrier] ?? 0;
    if (count > 0 && row.evidence_level === 'documented_advisory') {
      failures.push({
        code: 'advisory_carrier_in_coherent_launch_registry',
        carrier: row.carrier,
        count,
      });
    }
  }

  return {
    schema: 'narada.mcp_fabric.coherence_gate.v1',
    status: failures.length === 0 ? 'ok' : 'fail',
    generated_at: new Date().toISOString(),
    launch_registry_path: launchRegistryPath,
    failures,
    site_count: siteAudit.site_count,
    carrier_runtime_counts: carrierMatrix.launch_registry_summary?.runtime_counts ?? {},
    mutation_performed: false,
  };
}

function parseArgs(argv) {
  const options = { launchRegistryPath: DEFAULT_LAUNCH_REGISTRY, pretty: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--registry' && argv[i + 1]) {
      options.launchRegistryPath = argv[++i];
    } else if (argv[i] === '--pretty') {
      options.pretty = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      options.help = true;
    }
  }
  return options;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: node tools/mcp-fabric/coherence-gate.mjs [--registry <agents.psd1>] [--pretty]');
    return 0;
  }
  const result = runCoherenceGate({ launchRegistryPath: options.launchRegistryPath });
  console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
  return result.status === 'ok' ? 0 : 1;
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

export {
  runCoherenceGate,
};

if (isEntrypoint) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(JSON.stringify({
      schema: 'narada.mcp_fabric.coherence_gate_error.v1',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      mutation_performed: false,
    }));
    process.exitCode = 1;
  }
}
