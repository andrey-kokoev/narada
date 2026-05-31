#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentTuiSiteRolloutAcceptance, buildLaunchPlanFromArgs } from './start-agent.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRootDir = resolve(__dirname, '..', '..');
const REPORT_SCHEMA = 'narada.agent_tui.site_rollout_acceptance_report.v0';
const VALID_LAUNCH_STATUSES = new Set(['launching']);
const VALID_SITE_SESSION_START_STATUSES = new Set(['materialized']);

function parseEqualsPair(value, errorName) {
  const separatorIndex = value.indexOf('=');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(`${errorName}:expected_site_id_equals_path`);
  }
  return {
    siteId: value.slice(0, separatorIndex),
    path: resolve(value.slice(separatorIndex + 1)),
  };
}

function parseKnownSiteRoot(value) {
  const parsed = parseEqualsPair(value, 'invalid_known_site_root');
  return {
    siteId: parsed.siteId,
    root: parsed.path,
  };
}

function parseSiteEvidence(value, errorName) {
  return parseEqualsPair(value, errorName);
}

function parseArgs(argv) {
  const result = {
    siteRoot: defaultRootDir,
    knownSiteRoots: {},
    agentCliEvidence: {},
    agentTuiEvidence: {},
    write: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--site-root') result.siteRoot = resolve(argv[++i]);
    else if (arg === '--known-site-root') {
      const parsed = parseKnownSiteRoot(argv[++i]);
      result.knownSiteRoots[parsed.siteId] = parsed.root;
    } else if (arg === '--agent-cli-evidence') {
      const parsed = parseSiteEvidence(argv[++i], 'invalid_agent_cli_evidence');
      result.agentCliEvidence[parsed.siteId] = parsed.path;
    } else if (arg === '--agent-tui-evidence') {
      const parsed = parseSiteEvidence(argv[++i], 'invalid_agent_tui_evidence');
      result.agentTuiEvidence[parsed.siteId] = parsed.path;
    } else if (arg === '--write') result.write = true;
    else if (arg === '--json') result.json = true;
    else if (arg === '--output') result.output = resolve(argv[++i]);
    else throw new Error(`unsupported_argument:${arg}`);
  }
  return result;
}

function resolveSiteRoot(site, siteRoot, knownSiteRoots = {}) {
  if (site.site_id === 'narada-proper') return siteRoot;
  return knownSiteRoots[site.site_id] ?? site.launch_root ?? null;
}

function recordSiteRoot(record) {
  return record.required_environment?.NARADA_SITE_ROOT
    ?? record.launch_environment?.NARADA_SITE_ROOT
    ?? record.planned_environment?.NARADA_SITE_ROOT
    ?? record.site_root
    ?? null;
}

function carrierSessionId(record) {
  return record.carrier_session_id
    ?? record.required_environment?.NARADA_CARRIER_SESSION_ID
    ?? record.carrier_session?.carrier_session_id
    ?? record.carrier_session?.record?.carrier_session_id
    ?? null;
}

function runtimeKind(record) {
  return record.runtime_kind ?? record.runtime_substrate_kind ?? null;
}

function runtimeControlPath(record) {
  if (record.agent_cli_launch?.control_path) return record.agent_cli_launch.control_path;
  if (record.agent_tui_launch?.control_path) return record.agent_tui_launch.control_path;
  const args = Array.isArray(record.runtime_args) ? record.runtime_args : [];
  const index = args.indexOf('--control-jsonl');
  if (index >= 0) return args[index + 1];
  const siteRoot = recordSiteRoot(record);
  const sessionId = carrierSessionId(record);
  if (record.runtime === 'agent-cli' && siteRoot && sessionId) {
    return join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId, 'control.jsonl');
  }
  return null;
}

function runtimeSessionPath(record) {
  if (record.agent_cli_launch?.session_path) return record.agent_cli_launch.session_path;
  if (record.agent_tui_launch?.session_path) return record.agent_tui_launch.session_path;
  const args = Array.isArray(record.runtime_args) ? record.runtime_args : [];
  const index = args.indexOf('--session-jsonl');
  return index >= 0 ? args[index + 1] : null;
}

function samePath(left, right) {
  if (!left || !right) return false;
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateCommonLaunchEvidence(record) {
  if (!VALID_LAUNCH_STATUSES.has(record.status)) {
    return { status: 'invalid_launch_status', reason: `launch_status_${record.status ?? 'missing'}_not_accepted` };
  }
  if (record.dry_run !== false) {
    return { status: 'invalid_launch_authority', reason: 'dry_run_false_required' };
  }
  if (record.exec !== true) {
    return { status: 'invalid_launch_authority', reason: 'exec_true_required' };
  }
  if (record.agent_start_event_authoritative !== true || record.carrier_session_authoritative !== true) {
    return { status: 'invalid_launch_authority', reason: 'authoritative_agent_start_and_carrier_session_required' };
  }
  if (!hasNonEmptyString(record.agent_start_event)) {
    return { status: 'invalid_launch_identity', reason: 'agent_start_event_required' };
  }
  if (!hasNonEmptyString(record.carrier_session_id)) {
    return { status: 'invalid_launch_identity', reason: 'carrier_session_id_required' };
  }
  return null;
}

function validateRuntimeLaunchMetadata(record, expectedRuntime) {
  if (expectedRuntime === 'agent-cli') {
    if (!record.agent_cli_launch || typeof record.agent_cli_launch !== 'object') {
      return { status: 'invalid_launch_metadata', reason: 'agent_cli_launch_required' };
    }
    if (!hasNonEmptyString(record.agent_cli_launch.session_path) || !hasNonEmptyString(record.agent_cli_launch.control_path)) {
      return { status: 'invalid_launch_metadata', reason: 'agent_cli_session_and_control_paths_required' };
    }
  }
  if (expectedRuntime === 'agent-tui') {
    if (!record.agent_tui_launch || typeof record.agent_tui_launch !== 'object') {
      return { status: 'invalid_launch_metadata', reason: 'agent_tui_launch_required' };
    }
    if (!hasNonEmptyString(record.agent_tui_launch.session_path) || !hasNonEmptyString(record.agent_tui_launch.control_path)) {
      return { status: 'invalid_launch_metadata', reason: 'agent_tui_session_and_control_paths_required' };
    }
  }
  return null;
}

function validateEvidenceJson(path, expectedRuntime, expectedSiteRoot = null) {
  if (!path) return { status: 'not_recorded', reason: 'evidence_path_not_recorded' };
  if (!existsSync(path)) return { status: 'missing', reason: 'evidence_path_does_not_exist' };
  let record;
  try {
    record = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return {
      status: 'invalid_json',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  const isNaradaProperLaunchResult = record.schema === 'narada.agent_start.result.v0';
  const isSiteSessionStart = record.schema === 'narada.agent_context.session_start.v0';
  if (!isNaradaProperLaunchResult && !isSiteSessionStart) {
    return { status: 'invalid_shape', reason: 'unsupported_launch_evidence_schema' };
  }
  if (record.runtime !== expectedRuntime) {
    return { status: 'invalid_runtime', reason: `expected_${expectedRuntime}_got_${record.runtime ?? 'missing'}` };
  }
  if (expectedRuntime === 'agent-cli' && !['agent_cli_carrier', 'agent-cli'].includes(runtimeKind(record))) {
    return { status: 'invalid_runtime_kind', reason: 'agent_cli_runtime_kind_required' };
  }
  if (expectedRuntime === 'agent-tui') {
    if (!['agent_tui_carrier', 'agent-tui'].includes(runtimeKind(record))) {
      return { status: 'invalid_runtime_kind', reason: 'agent_tui_runtime_kind_required' };
    }
    if (isNaradaProperLaunchResult && record.agent_tui_launch?.admitted_runtime_slice !== 'bounded_non_terminal_interactive_step_once') {
      return { status: 'invalid_runtime_slice', reason: 'agent_tui_bounded_smoke_slice_required' };
    }
  }
  if (isNaradaProperLaunchResult) {
    const commonEvidenceError = validateCommonLaunchEvidence(record);
    if (commonEvidenceError) return commonEvidenceError;
    const runtimeMetadataError = validateRuntimeLaunchMetadata(record, expectedRuntime);
    if (runtimeMetadataError) return runtimeMetadataError;
  } else {
    if (!VALID_SITE_SESSION_START_STATUSES.has(record.status)) {
      return { status: 'invalid_launch_status', reason: `site_session_start_status_${record.status ?? 'missing'}_not_accepted` };
    }
    if (!hasNonEmptyString(record.agent_start_event)) {
      return { status: 'invalid_launch_identity', reason: 'agent_start_event_required' };
    }
    if (!hasNonEmptyString(carrierSessionId(record))) {
      return { status: 'invalid_launch_identity', reason: 'carrier_session_id_required' };
    }
    if (!hasNonEmptyString(runtimeControlPath(record))) {
      return { status: 'invalid_launch_metadata', reason: 'control_jsonl_path_required' };
    }
    if (expectedRuntime === 'agent-tui' && !hasNonEmptyString(runtimeSessionPath(record))) {
      return { status: 'invalid_launch_metadata', reason: 'agent_tui_session_jsonl_path_required' };
    }
  }

  const actualSiteRoot = recordSiteRoot(record);
  if (expectedSiteRoot && !actualSiteRoot) {
    return { status: 'invalid_site_root', reason: 'site_root_missing_from_launch_evidence' };
  }
  if (expectedSiteRoot && !samePath(actualSiteRoot, expectedSiteRoot)) {
    return {
      status: 'invalid_site_root',
      reason: 'site_root_mismatch',
      expected_site_root: expectedSiteRoot,
      actual_site_root: actualSiteRoot,
    };
  }
  return {
    status: 'valid',
    reason: 'launch_evidence_shape_valid',
    site_root: actualSiteRoot,
    launch_status: record.status,
    launch_schema: record.schema,
    agent_start_event: record.agent_start_event,
    carrier_session_id: carrierSessionId(record),
  };
}

function evidenceStatus(siteId, agentCliEvidence = {}, agentTuiEvidence = {}, expectedSiteRoot = null) {
  const agentCliPath = agentCliEvidence[siteId] ?? null;
  const agentTuiPath = agentTuiEvidence[siteId] ?? null;
  const agentCliValidation = validateEvidenceJson(agentCliPath, 'agent-cli', expectedSiteRoot);
  const agentTuiValidation = validateEvidenceJson(agentTuiPath, 'agent-tui', expectedSiteRoot);
  return {
    agent_cli_evidence_path: agentCliPath,
    agent_cli_evidence_status: agentCliValidation.status,
    agent_cli_evidence_validation: agentCliValidation,
    agent_tui_evidence_path: agentTuiPath,
    agent_tui_evidence_status: agentTuiValidation.status,
    agent_tui_evidence_validation: agentTuiValidation,
  };
}

function siteStatus(site, {
  siteRoot,
  knownSiteRoots = {},
  agentCliEvidence = {},
  agentTuiEvidence = {},
}) {
  const launchRoot = resolveSiteRoot(site, siteRoot, knownSiteRoots);
  const evidence = evidenceStatus(site.site_id, agentCliEvidence, agentTuiEvidence, launchRoot);
  const resolvedSite = {
    ...site,
    ...evidence,
    launch_root: launchRoot,
    launch_root_source: launchRoot === siteRoot && site.site_id === 'narada-proper'
      ? 'primary_site_root'
      : (knownSiteRoots[site.site_id] ? 'operator_known_site_root' : 'unresolved'),
  };
  if (!launchRoot) {
    return {
      ...resolvedSite,
      status: 'pending_site_root_resolution',
      blocker: 'launch_root_not_known_to_narada_proper_acceptance_command',
    };
  }
  if (!existsSync(launchRoot)) {
    return {
      ...resolvedSite,
      status: 'blocked_site_root_missing',
      blocker: 'launch_root_does_not_exist',
    };
  }
  if (evidence.agent_cli_evidence_status === 'missing' || evidence.agent_tui_evidence_status === 'missing') {
    return {
      ...resolvedSite,
      status: 'blocked_evidence_path_missing',
      blocker: 'recorded_evidence_path_does_not_exist',
    };
  }
  const invalidEvidenceStatuses = new Set([
    'invalid_json',
    'invalid_shape',
    'invalid_runtime',
    'invalid_runtime_kind',
    'invalid_runtime_slice',
    'invalid_launch_status',
    'invalid_launch_authority',
    'invalid_launch_identity',
    'invalid_launch_metadata',
    'invalid_site_root',
  ]);
  if (invalidEvidenceStatuses.has(evidence.agent_cli_evidence_status) || invalidEvidenceStatuses.has(evidence.agent_tui_evidence_status)) {
    return {
      ...resolvedSite,
      status: 'blocked_evidence_invalid',
      blocker: 'recorded_evidence_shape_invalid',
    };
  }
  if (evidence.agent_cli_evidence_status !== 'valid' || evidence.agent_tui_evidence_status !== 'valid') {
    return {
      ...resolvedSite,
      status: 'pending_live_acceptance',
      blocker: 'side_by_side_launch_evidence_not_recorded',
    };
  }
  return {
    ...resolvedSite,
    status: 'accepted',
    blocker: null,
  };
}

function buildAgentTuiRolloutAcceptanceReport({
  siteRoot = defaultRootDir,
  knownSiteRoots = {},
  agentCliEvidence = {},
  agentTuiEvidence = {},
  now = new Date().toISOString(),
} = {}) {
  const { result } = buildLaunchPlanFromArgs({
    identity: 'narada.resident',
    runtime: 'agent-tui',
    dry_run: true,
    exec: true,
  }, { siteRoot, now });
  const acceptance = agentTuiSiteRolloutAcceptance(siteRoot);
  const sites = acceptance.known_sites.map((site) => siteStatus(site, {
    siteRoot,
    knownSiteRoots,
    agentCliEvidence,
    agentTuiEvidence,
  }));
  const blockedSites = sites.filter((site) => site.status !== 'accepted');
  return {
    schema: REPORT_SCHEMA,
    status: blockedSites.length === 0 ? 'accepted' : 'blocked',
    generated_at: now,
    site_root: siteRoot,
    known_site_roots: knownSiteRoots,
    agent_cli_evidence: agentCliEvidence,
    agent_tui_evidence: agentTuiEvidence,
    source_launch_runtime: result.runtime,
    source_launch_status: result.status,
    source_launch_admitted_runtime_slice: result.agent_tui_launch.admitted_runtime_slice,
    acceptance,
    sites,
    summary: {
      accepted: sites.filter((site) => site.status === 'accepted').length,
      pending: sites.filter((site) => site.status.startsWith('pending')).length,
      blocked: sites.filter((site) => site.status.startsWith('blocked')).length,
      total: sites.length,
    },
    default_promotion_allowed: blockedSites.length === 0,
    next_required_action: blockedSites.length === 0
      ? 'agent-tui rollout acceptance is current for all known Sites; promotion still requires provider and terminal gates separately'
      : 'record side-by-side agent-cli and agent-tui launch evidence for each known Site without opening interactive carrier windows from this command',
  };
}

function defaultOutputPath(siteRoot) {
  return join(siteRoot, '.narada', 'crew', 'agent-tui-rollout-acceptance', 'latest.json');
}

function writeReport(report, outputPath = defaultOutputPath(report.site_root)) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = buildAgentTuiRolloutAcceptanceReport({
    siteRoot: args.siteRoot,
    knownSiteRoots: args.knownSiteRoots,
    agentCliEvidence: args.agentCliEvidence,
    agentTuiEvidence: args.agentTuiEvidence,
  });
  if (args.write || args.output) {
    report.evidence_path = writeReport(report, args.output);
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`agent-tui rollout acceptance: ${report.status}\n`);
  for (const site of report.sites) {
    process.stdout.write(`  ${site.site_id}: ${site.status}\n`);
  }
  if (report.evidence_path) process.stdout.write(`evidence_path: ${report.evidence_path}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ schema: REPORT_SCHEMA, status: 'refused', refusals: [error instanceof Error ? error.message : String(error)] }, null, 2));
    process.exit(2);
  });
}

export {
  buildAgentTuiRolloutAcceptanceReport,
  defaultOutputPath,
  evidenceStatus,
  parseArgs,
  parseKnownSiteRoot,
  parseSiteEvidence,
  resolveSiteRoot,
  validateEvidenceJson,
  writeReport,
};
