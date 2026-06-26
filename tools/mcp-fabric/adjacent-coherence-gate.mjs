#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCarrierConformanceMatrix } from '../operator-surface-carriers/carrier-conformance-matrix.mjs';
import { auditLaunchIdentities } from './launch-identity-projection.mjs';
import { runCoherenceGate } from './coherence-gate.mjs';
import { auditLauncherKnownSites } from './site-fabric-audit.mjs';

const DEFAULT_LAUNCH_REGISTRY = 'C:/Users/Andrey/Narada/config/launch/agents.psd1';

const REQUIRED_STARTUP_TOOLS = [
  'agent_context_startup_sequence',
  'mcp_output_show',
];

function runAdjacentCoherenceGate({ launchRegistryPath = DEFAULT_LAUNCH_REGISTRY, repoRoot = process.cwd() } = {}) {
  const failures = [];
  const warnings = [];
  const baseGate = runCoherenceGate({ launchRegistryPath });
  if (baseGate.status !== 'ok') failures.push({ code: 'base_coherence_gate_failed', failures: baseGate.failures });

  const identityAudit = auditLaunchIdentities(launchRegistryPath);
  if (identityAudit.status !== 'ok') failures.push({ code: 'launch_identity_gate_failed', failures: identityAudit.failures });
  warnings.push(...(identityAudit.warnings ?? []));

  const siteAudit = auditLauncherKnownSites(launchRegistryPath);
  const startup = auditStartupContract(siteAudit);
  failures.push(...startup.failures);
  warnings.push(...startup.warnings);

  const mailbox = auditMailboxPosture(siteAudit, repoRoot);
  failures.push(...mailbox.failures);
  warnings.push(...mailbox.warnings);

  const docs = auditRequiredDocs(repoRoot);
  failures.push(...docs.failures);

  const auth = auditAuthSecretPosture(siteAudit, launchRegistryPath, repoRoot);
  failures.push(...auth.failures);
  warnings.push(...auth.warnings);

  const carrierMatrix = buildCarrierConformanceMatrix({ launchRegistryPath });
  const piRuntimeCount = carrierMatrix.launch_registry_summary?.runtime_counts?.pi ?? 0;

  return {
    schema: 'narada.mcp_fabric.adjacent_coherence_gate.v1',
    status: failures.length > 0 ? 'fail' : (warnings.length > 0 ? 'warn' : 'ok'),
    launch_registry_path: launchRegistryPath,
    failures,
    warnings,
    checks: {
      base_gate_status: baseGate.status,
      identity_gate_status: identityAudit.status,
      startup_declaration_status: startup.status,
      startup_runtime_verified: startup.runtime_verified,
      mailbox_posture_status: mailbox.status,
      mailbox_evidence_level: mailbox.evidence_level,
      required_docs_status: docs.status,
      auth_secret_posture_status: auth.status,
      pi_runtime_count: piRuntimeCount,
    },
    mutation_performed: false,
  };
}

function auditStartupContract(siteAudit) {
  const failures = [];
  const warnings = [];
  const sites = siteAudit.sites.map((site) => {
    const registryPath = site.registry?.path;
    const registry = registryPath && existsSync(registryPath)
      ? JSON.parse(readFileSync(registryPath, 'utf8'))
      : { surfaces: [] };
    const tools = new Set();
    for (const surface of registry.surfaces ?? registry.mcp_surfaces ?? []) {
      for (const tool of surface.tool_contract?.read_only_tools ?? []) tools.add(tool);
      for (const tool of surface.registered_live_tools ?? []) tools.add(tool);
    }
    const missingTools = REQUIRED_STARTUP_TOOLS.filter((tool) => !tools.has(tool));
    if (missingTools.length > 0) {
      failures.push({ code: 'startup_contract_tools_missing', site_root: site.site_root, missing_tools: missingTools });
    }
    warnings.push({
      code: 'startup_contract_runtime_not_verified_by_static_gate',
      site_root: site.site_root,
      evidence_level: 'registry_declaration_only',
    });
    return {
      site_root: site.site_root,
      required_tools: REQUIRED_STARTUP_TOOLS,
      missing_tools: missingTools,
      evidence_level: 'registry_declaration_only',
      runtime_verified: false,
    };
  });
  return {
    status: failures.length === 0 ? 'ok' : 'fail',
    evidence_level: 'registry_declaration_only',
    runtime_verified: false,
    sites,
    failures,
    warnings,
  };
}

function auditMailboxPosture(siteAudit, repoRoot) {
  const postureDoc = join(repoRoot, 'docs', 'product', 'mailbox-to-task-admission-standard.md');
  const failures = [];
  const warnings = [];
  if (!existsSync(postureDoc)) failures.push({ code: 'mailbox_standard_doc_missing', path: postureDoc });
  const sites = siteAudit.sites.map((site) => {
    const mailboxServers = site.servers.filter((server) => /mail|mailbox|inbox/i.test(server.name));
    const hasMailboxSurface = mailboxServers.some((server) => /mail|mailbox/i.test(server.name));
    const hasInboxSurface = mailboxServers.some((server) => /inbox/i.test(server.name));
    const hasTaskSurface = site.servers.some((server) => /task-lifecycle/i.test(server.name));
    const status = hasMailboxSurface
      ? (hasInboxSurface ? 'bounded_pipeline_surfaces_present' : 'mailbox_without_inbox_surface')
      : 'no_mailbox_surface';
    if (hasMailboxSurface && !hasInboxSurface) failures.push({ code: 'mailbox_without_inbox_surface', site_root: site.site_root });
    if (hasMailboxSurface && !hasTaskSurface) warnings.push({ code: 'mailbox_without_task_lifecycle_surface', site_root: site.site_root });
    if (hasMailboxSurface) {
      const unclassifiedMailboxServers = mailboxServers.filter((server) => /mail|mailbox/i.test(server.name) && server.registry_tool_count === 0);
      if (unclassifiedMailboxServers.length > 0) {
        warnings.push({
          code: 'mailbox_tool_contract_unclassified',
          site_root: site.site_root,
          servers: unclassifiedMailboxServers.map((server) => server.name),
          evidence_level: 'surface_presence_only',
        });
      }
    }
    return {
      site_root: site.site_root,
      status,
      evidence_level: hasMailboxSurface ? 'surface_presence_only' : 'not_mailbox_enabled',
      runtime_verified: false,
      mailbox_servers: mailboxServers.map((server) => server.name),
    };
  });
  return {
    status: failures.length === 0 ? 'ok' : 'fail',
    evidence_level: 'surface_presence_only',
    runtime_verified: false,
    standard_doc: postureDoc,
    sites,
    failures,
    warnings,
  };
}

function auditAuthSecretPosture(siteAudit, launchRegistryPath, repoRoot) {
  const failures = [];
  const warnings = [];
  const paths = new Set([launchRegistryPath]);
  for (const site of siteAudit.sites) {
    if (site.registry?.path) paths.add(site.registry.path);
    const identityPath = join(site.site_root, 'operator-surfaces', 'identities.json');
    if (existsSync(identityPath)) paths.add(identityPath);
  }
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    const markers = secretMarkers(text);
    if (markers.length > 0) {
      failures.push({
        code: 'raw_secret_marker_in_control_artifact',
        path,
        markers,
      });
    }
  }
  warnings.push({
    code: 'auth_secret_scan_scope_limited',
    evidence_level: 'control_artifact_marker_scan_only',
    scanned_artifact_count: paths.size,
    repo_root: repoRoot,
  });
  return {
    status: failures.length === 0 ? 'ok' : 'fail',
    evidence_level: 'control_artifact_marker_scan_only',
    scanned_artifact_count: paths.size,
    failures,
    warnings,
  };
}

function secretMarkers(text) {
  const markers = [];
  const assignment = /(?:api[_-]?key|secret|token|refresh[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["']?([^"',\r\n}\s]+)/ig;
  for (const match of text.matchAll(assignment)) {
    const value = String(match[1] ?? '');
    if (/^(false|true|null|none|missing|configured|redacted|ref|reference)$/i.test(value)) continue;
    if (/^(env|secret_ref|credential_ref|capability_ref):/i.test(value)) continue;
    const key = match[0].split(/[:=]/)[0].trim();
    markers.push(`${key}: <redacted>`);
  }
  return markers;
}

function auditRequiredDocs(repoRoot) {
  const required = [
    join(repoRoot, 'docs', 'operations', 'coherence-closure-ledger.md'),
    join(repoRoot, 'docs', 'product', 'mailbox-to-task-admission-standard.md'),
    join(repoRoot, 'docs', 'concepts', 'central-launch-registry-boundary.md'),
    join(repoRoot, 'docs', 'concepts', 'startup-sequence-contract.md'),
    join(repoRoot, 'docs', 'concepts', 'auth-secret-posture.md'),
  ];
  const missing = required.filter((path) => !existsSync(path));
  return {
    status: missing.length === 0 ? 'ok' : 'fail',
    required,
    failures: missing.map((path) => ({ code: 'required_coherence_doc_missing', path })),
  };
}

function parseArgs(argv) {
  const options = { launchRegistryPath: DEFAULT_LAUNCH_REGISTRY, repoRoot: process.cwd(), pretty: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--registry' && argv[i + 1]) options.launchRegistryPath = argv[++i];
    else if (argv[i] === '--repo-root' && argv[i + 1]) options.repoRoot = normalize(argv[++i]);
    else if (argv[i] === '--pretty') options.pretty = true;
    else if (argv[i] === '--help' || argv[i] === '-h') options.help = true;
  }
  return options;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: node tools/mcp-fabric/adjacent-coherence-gate.mjs [--registry <agents.psd1>] [--repo-root <root>] [--pretty]');
    return 0;
  }
  const result = runAdjacentCoherenceGate(options);
  console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
  return result.status === 'fail' ? 1 : 0;
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

export {
  REQUIRED_STARTUP_TOOLS,
  auditMailboxPosture,
  auditRequiredDocs,
  auditAuthSecretPosture,
  auditStartupContract,
  runAdjacentCoherenceGate,
  secretMarkers,
};

if (isEntrypoint) {
  process.exitCode = runCli();
}
