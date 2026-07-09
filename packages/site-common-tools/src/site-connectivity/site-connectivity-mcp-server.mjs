#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import { validateSiteIdentityDocument } from '../site-config/validate-site-config.mjs';
import { buildOutputRefToolContent } from '../mcp-payload-file.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'narada-site-connectivity-mcp';
const SERVER_VERSION = '0.1.0';
const WORKFLOW_SCHEMA = 'narada.site_connectivity.workflow.v0';
const RUNBOOK_REF = 'docs/site-config/two-way-site-connectivity-runbook.md';
const REGISTRY_CONTRACT_REF = 'docs/site-config/site-registry-capability-current-state-contract.md';
const IDENTITY_CONTRACT_REF = 'docs/site-config/site-identity-attestation-contract.md';
const SITE_PROBE_SERVER = 'tools/site-probe/site-probe-mcp-server.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(__dirname, '../..');
let activeOutputToolName = null;

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write('Usage: node tools/site-connectivity/site-connectivity-mcp-server.mjs --site-root <path>\n');
  process.exit(0);
}

runStdioServer(options).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function runStdioServer(serverOptions) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    const requests = lines.filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
    for (const request of requests) {
      const response = handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response);
    }
  }
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    for (const request of parseJsonRpcInput(trailing)) {
      const response = handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response);
    }
  }
}

function writeMcpFrame(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function handleRequest(request, serverOptions) {
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  try {
    return { jsonrpc: '2.0', id: request.id ?? null, result: dispatchMethod(request.method, request.params ?? {}, serverOptions) };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: request?.id ?? null,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function dispatchMethod(method, params, serverOptions) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      };
    case 'tools/list':
      return { tools: tools() };
    case 'tools/call':
      return callTool(params, serverOptions);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function tools() {
  return [
    {
      name: 'site_connectivity_doctor',
      description: 'Inspect two-way Site connectivity workflow readiness.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'site_connectivity_plan',
      description: 'Return a non-mutating two-way connectivity plan for a registered or operator-provided Site root.',
      inputSchema: {
        type: 'object',
        properties: {
          site_id: { type: 'string' },
          root: { type: 'string' },
          locus_type: { type: 'string' },
          authority_basis: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'site_connectivity_verify',
      description: 'Run the read-only registered Site probe and classify connectivity state.',
      inputSchema: {
        type: 'object',
        properties: {
          site_id: { type: 'string' },
          root: { type: 'string' },
          authority_basis: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'site_connectivity_reciprocal_payload',
      description: 'Build the target-local reciprocal inbox proposal payload without submitting it.',
      inputSchema: {
        type: 'object',
        properties: {
          site_id: { type: 'string' },
          root: { type: 'string' },
          source_site_id: { type: 'string' },
          principal: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'site_connectivity_trust_plan',
      description: 'Inspect Site identity posture and return local trust-pin guidance.',
      inputSchema: {
        type: 'object',
        properties: {
          site_id: { type: 'string' },
          root: { type: 'string' },
          authority_basis: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
  ];
}

function callTool(params, serverOptions) {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');
  activeOutputToolName = name;
  const siteRoot = resolve(serverOptions.siteRoot ?? process.cwd());
  switch (name) {
    case 'site_connectivity_doctor':
      return jsonToolResult(doctor(siteRoot));
    case 'site_connectivity_plan':
      return jsonToolResult(planConnectivity(siteRoot, args));
    case 'site_connectivity_verify':
      return jsonToolResult(verifyConnectivity(siteRoot, args));
    case 'site_connectivity_reciprocal_payload':
      return jsonToolResult(reciprocalPayload(siteRoot, args));
    case 'site_connectivity_trust_plan':
      return jsonToolResult(trustPlan(siteRoot, args));
    default:
      throw new Error(`site_connectivity_refused_unknown_tool: ${name}`);
  }
}

function doctor(siteRoot) {
  const config = loadConfig(siteRoot);
  const awareness = siteAwarenessFromConfig(config);
  const knownSites = awareness.known_sites ?? {};
  return {
    schema: 'narada.site_connectivity.doctor.v0',
    status: 'ok',
    surface: 'site-connectivity-mcp.local',
    workflow_schema: WORKFLOW_SCHEMA,
    runbook_ref: RUNBOOK_REF,
    registered_site_count: Object.keys(knownSites).length,
    identity_trust_records: Array.isArray(awareness.identity_trust) ? awareness.identity_trust.length : 0,
    mutates_target_files: false,
    authority_rule: 'Workflow may plan, probe, and build handoff payloads; target mutation requires target-rooted authority or target-local admission.',
    composed_surfaces: ['site_probe', 'inbox_stage_submission_workflow', 'site_lift_catalog adoption packets'],
  };
}

function planConnectivity(siteRoot, args) {
  const context = resolveConnectivityContext(siteRoot, args);
  return {
    schema: 'narada.site_connectivity.plan.v0',
    status: 'planned',
    workflow_schema: WORKFLOW_SCHEMA,
    runbook_ref: RUNBOOK_REF,
    source_site_id: context.sourceSiteId,
    target: targetSummary(context),
    phases: [
      { id: 'local_awareness', authority: 'source_site', action: 'Ensure known_sites entry has explicit capability edges and non-grants.' },
      { id: 'read_only_probe', authority: 'source_site_read_only', action: 'Run site_connectivity_verify or site_probe against governance-root surfaces only.' },
      { id: 'target_local_proposal', authority: 'target_site_inbox', action: 'Submit reciprocal payload through Inbox MCP with target_locus local_site.' },
      { id: 'target_admission', authority: 'target_site', action: 'Target admits reciprocal registry, local MCP configs, and site.identity.json.' },
      { id: 'source_reprobe', authority: 'source_site_read_only', action: 'Re-probe and update source registry from observed facts.' },
      { id: 'trust_hardening', authority: 'source_site', action: 'Pin target public-key fingerprint in site_awareness.identity_trust when operator-approved.' },
      { id: 'signed_crossings', authority: 'both_sites', action: 'Use trusted keys for signed declarations; signatures improve evidence quality only.' },
    ],
    default_non_grants: defaultNonGrants(context.sourceSiteId, context.targetSiteId),
    next_tool: 'site_connectivity_verify',
  };
}

function verifyConnectivity(siteRoot, args) {
  const context = resolveConnectivityContext(siteRoot, args);
  const probe = callSiteProbe(siteRoot, context);
  const missing = Array.isArray(probe.missing_surfaces) ? probe.missing_surfaces : [];
  const identity = probe.identity ?? {};
  const hasMcp = probe.readable_surfaces?.includes('.ai/mcp') || probe.current_state?.mcp_access?.status === 'observed';
  const hasIdentity = identity.identity_document?.status === 'observed';
  const connected = missing.length === 0 && hasMcp && hasIdentity;
  return {
    schema: 'narada.site_connectivity.verify.v0',
    status: connected ? 'connected_read_only' : 'needs_target_admission',
    workflow_schema: WORKFLOW_SCHEMA,
    target: targetSummary(context),
    observed: {
      readable_surfaces: probe.readable_surfaces ?? [],
      missing_surfaces: missing,
      health: probe.current_state?.health ?? probe.health ?? null,
      mcp_access: probe.current_state?.mcp_access ?? { status: hasMcp ? 'observed' : 'not_observed' },
      identity: {
        status: identity.status ?? 'not_observed',
        site_id_claim: identity.site_id_claim ?? null,
        trusted_key_match: identity.trusted_key_match === true,
        verification_state: identity.verification_state ?? 'observed_unverified',
        validation: identity.validation ?? null,
      },
      privacy_scope: probe.privacy_scope ?? null,
    },
    residuals: classifyResiduals(probe),
    next_actions: connected
      ? ['Optionally run site_connectivity_trust_plan to pin identity trust.', 'Use target-rooted MCP/session or governed crossing for any mutation.']
      : ['Submit reciprocal payload to target local inbox.', 'Target should materialize missing .ai/mcp and site.identity.json surfaces.', 'Re-run verification after target admission.'],
    evidence_refs: probe.evidence_refs ?? [],
  };
}

function reciprocalPayload(siteRoot, args) {
  const context = resolveConnectivityContext(siteRoot, args);
  const sourceSiteId = stringField(args, 'source_site_id') ?? context.sourceSiteId;
  const principal = stringField(args, 'principal') ?? 'unknown_mcp_agent';
  const payload = {
    schema: 'narada.cross_site_connectivity.proposal.v0',
    title: `Establish two-way connectivity with ${sourceSiteId}`,
    source_site_id: sourceSiteId,
    target_site_id: context.targetSiteId,
    operator_intent: 'Establish proper two-way connectivity while preserving explicit authority boundaries.',
    requested_target_side_admission: {
      register_related_site: {
        site_id: sourceSiteId,
        root_windows: sourceSiteId === context.sourceSiteId ? siteRoot : null,
        capabilities_from_target_to_source: ['know', 'navigate', 'review', 'route_proposals'],
        non_grants: defaultNonGrants(context.targetSiteId, sourceSiteId),
      },
      materialize_or_admit_missing_surfaces: [
        'Target-local .ai/mcp configuration for admitted tools.',
        'Target site.identity.json or equivalent Site identity attestation record.',
      ],
      keep_authority_split: 'Reciprocal awareness does not grant mutation, task lifecycle mutation, knowledge admission, deployment, or secrets access without target-rooted authority or governed crossing.',
    },
    recommended_submission: {
      surface: 'inbox_stage_submission_workflow',
      target_site_root: context.root,
      target_locus: 'local_site',
      kind: 'proposal',
      authority_level: 'operator_confirmed',
      principal,
    },
    evidence_refs: ['generated_by:site_connectivity_reciprocal_payload'],
  };
  return {
    schema: 'narada.site_connectivity.reciprocal_payload.v0',
    status: 'payload_ready',
    target: targetSummary(context),
    payload,
    submission_rule: 'Submit with target_locus local_site; cross-locus labels such as client_service_site can be refused by target routing policy.',
    mutates_target_files: false,
  };
}

function trustPlan(siteRoot, args) {
  const context = resolveConnectivityContext(siteRoot, args);
  const probe = callSiteProbe(siteRoot, context);
  const identityDoc = readIdentityDocument(context.root);
  if (identityDoc.status !== 'ok') {
    return {
      schema: 'narada.site_connectivity.trust_plan.v0',
      status: 'identity_missing_or_invalid',
      target: targetSummary(context),
      identity_document: identityDoc,
      next_actions: ['Ask target Site to materialize valid site.identity.json before trust pinning.'],
    };
  }
  const errors = validateSiteIdentityDocument(identityDoc.value, 'identity');
  if (errors.length > 0) {
    return {
      schema: 'narada.site_connectivity.trust_plan.v0',
      status: 'identity_invalid',
      target: targetSummary(context),
      validation: { status: 'invalid', errors },
      next_actions: ['Fix target-owned site.identity.json under target authority.'],
    };
  }
  const keys = Array.isArray(identityDoc.value.public_keys) ? identityDoc.value.public_keys : [];
  const activeKey = keys.find((key) => key?.status === 'active') ?? keys[0] ?? null;
  const trustRecord = matchingLocalTrustRecord(context.awareness, identityDoc.value, activeKey);
  const trusted = Boolean(trustRecord && ['operator_pinned', 'signature_verified'].includes(trustRecord.verification_state));
  return {
    schema: 'narada.site_connectivity.trust_plan.v0',
    status: trusted ? 'trusted' : 'trust_record_missing',
    target: targetSummary(context),
    identity: {
      site_id: identityDoc.value.site_id,
      key_id: activeKey?.key_id ?? null,
      fingerprint_sha256: activeKey?.fingerprint_sha256 ?? null,
      probe_verification_state: probe.identity?.verification_state ?? 'observed_unverified',
      trusted_key_match: probe.identity?.trusted_key_match === true,
    },
    trust_record: trustRecord ?? null,
    trust_record_template: activeKey ? {
      site_id: identityDoc.value.site_id,
      key_id: activeKey.key_id,
      fingerprint_sha256: activeKey.fingerprint_sha256,
      trust_basis: 'operator_pinned',
      verification_state: 'operator_pinned',
      pinned_at: new Date().toISOString(),
      status: 'active',
      evidence_refs: ['operator_pinned_after_site_connectivity_probe'],
    } : null,
    signed_crossing_posture: trusted
      ? 'ready_to_verify_signed_declarations_when_signed payload support exists'
      : 'not_ready_until_local_trust_record_is_pinned',
    next_actions: trusted
      ? ['Use signatures as evidence quality only; keep capability grants in capability_edges and capability_denials.']
      : ['Operator must pin the public-key fingerprint in structural_config.site_awareness.identity_trust before treating declarations as trusted.'],
  };
}

function resolveConnectivityContext(siteRoot, args) {
  const config = loadConfig(siteRoot);
  const sourceSiteId = config.static_config?.site_id ?? 'unknown-source-site';
  const awareness = siteAwarenessFromConfig(config);
  const knownSites = awareness.known_sites ?? {};
  const siteId = stringField(args, 'site_id');
  const explicitRoot = stringField(args, 'root');
  let entry = siteId ? knownSites[siteId] : null;
  if (!entry && explicitRoot) entry = findRegisteredSiteByRoot(knownSites, explicitRoot);
  if (!entry && siteId && !explicitRoot) throw new Error(`site_connectivity_unknown_site_id: ${siteId}`);
  if (!entry && explicitRoot && !hasOperatorAuthority(args)) throw new Error('site_connectivity_unregistered_root_requires_operator_authority_basis');
  const targetSiteId = entry?.site_id ?? siteId ?? 'operator-explicit-target';
  const root = explicitRoot ? resolveMaybeAbsolute(siteRoot, explicitRoot) : preferredSiteRoot(entry, siteRoot);
  if (!root) throw new Error(`site_connectivity_site_has_no_root: ${targetSiteId}`);
  return {
    siteRoot,
    config,
    awareness,
    knownSites,
    sourceSiteId,
    targetSiteId,
    root,
    locusType: entry?.locus_type ?? stringField(args, 'locus_type') ?? 'unknown',
    registered: Boolean(entry),
    entry,
    authorityOwner: targetAuthorityOwner(entry) ?? targetSiteId.replaceAll('-', '_'),
  };
}

function targetSummary(context) {
  return {
    site_id: context.targetSiteId,
    root: context.root,
    locus_type: context.locusType,
    registered: context.registered,
    authority_owner: context.authorityOwner,
  };
}

function callSiteProbe(siteRoot, context) {
  const request = { site_id: context.registered ? context.targetSiteId : undefined, root: context.registered ? undefined : context.root, authority_basis: context.registered ? undefined : { kind: 'operator_direct_instruction', summary: 'site connectivity explicit root verification' } };
  const frames = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'site-connectivity-mcp', version: SERVER_VERSION } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'site_probe', arguments: request } },
  ].map((frame) => JSON.stringify(frame)).join('\n') + '\n';
  const result = runGovernedCommandSync(process.execPath, [resolve(SOURCE_ROOT, SITE_PROBE_SERVER), '--site-root', siteRoot], {
    cwd: siteRoot,
    input: frames,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`site_probe_process_failed: ${result.stderr || result.stdout}`);
  const responses = result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const response = responses.find((item) => item.id === 2);
  if (response?.error) throw new Error(response.error.message);
  return JSON.parse(response.result.content[0].text);
}

function classifyResiduals(probe) {
  const residuals = [];
  const missing = Array.isArray(probe.missing_surfaces) ? probe.missing_surfaces : [];
  if (missing.includes('.ai/mcp')) residuals.push({ kind: 'missing_mcp', summary: 'Target-local MCP configs are not observed.' });
  if (missing.includes('.narada/site.identity.json')) residuals.push({ kind: 'missing_identity', summary: 'Target Site identity document is not observed.' });
  if (probe.identity?.verification_state === 'observed_unverified') residuals.push({ kind: 'identity_untrusted', summary: 'Identity is observed but no local trust record matches.' });
  return residuals;
}

function defaultNonGrants(from, to) {
  const target = to.includes('user') ? 'user' : 'target';
  return [
    `mutate_${target}_site_config`,
    `mutate_${target}_task_lifecycle`,
    `admit_${target}_site_knowledge`,
    `access_${target}_site_secrets`,
  ];
}

function loadConfig(siteRoot) {
  const path = resolve(siteRoot, 'config.json');
  if (!existsSync(path)) throw new Error(`site_connectivity_config_not_found: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function siteAwarenessFromConfig(config) {
  return config.structural_config?.site_awareness
    ?? config.governance?.site_awareness
    ?? {};
}

function preferredSiteRoot(site, siteRoot) {
  const roots = site?.roots ?? {};
  const raw = roots.site_root_windows ?? roots.site_root_wsl ?? roots.windows ?? roots.wsl;
  return raw ? resolveMaybeAbsolute(siteRoot, raw) : null;
}

function findRegisteredSiteByRoot(knownSites, root) {
  const normalized = resolveMaybeAbsolute(process.cwd(), root);
  return Object.values(knownSites).find((site) => registeredRoots(site).some((candidate) => resolveMaybeAbsolute(process.cwd(), candidate) === normalized)) ?? null;
}

function registeredRoots(site) {
  return Object.values(site?.roots ?? {}).filter((value) => typeof value === 'string' && !/^https?:\/\//i.test(value));
}

function targetAuthorityOwner(awareness) {
  const boundaries = awareness?.authority_boundaries ?? {};
  return Object.keys(boundaries).find((key) => !['user_site', 'not_granted_by_awareness'].includes(key)) ?? null;
}

function readIdentityDocument(root) {
  const path = resolveIdentityDocumentPath(root);
  if (!existsSync(path)) return { status: 'missing', path };
  try {
    return { status: 'ok', path, value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { status: 'invalid', path, error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveIdentityDocumentPath(root) {
  const normalized = root.split('\\').join('/').toLowerCase();
  return normalized.endsWith('/.narada') ? join(root, 'site.identity.json') : join(root, '.narada', 'site.identity.json');
}

function matchingLocalTrustRecord(awareness, identity, activeKey) {
  const trustRecords = Array.isArray(awareness?.identity_trust) ? awareness.identity_trust : [];
  return trustRecords.find((record) => (
    record?.site_id === identity?.site_id
    && activeKey
    && record.key_id === activeKey.key_id
    && record.fingerprint_sha256 === activeKey.fingerprint_sha256
  )) ?? null;
}

function hasOperatorAuthority(args) {
  const basis = asRecord(args.authority_basis);
  return basis.kind === 'operator_direct_instruction' && typeof basis.summary === 'string' && basis.summary.trim().length > 0;
}

function resolveMaybeAbsolute(base, path) {
  return resolve(isAbsolute(path) ? path : resolve(base, path));
}

function jsonToolResult(payload) {
  return buildOutputRefToolContent({ siteRoot: resolve(options.siteRoot ?? process.cwd()), toolName: activeOutputToolName, value: payload });
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringField(record, key) {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--site-root') parsed.siteRoot = argv[++i];
    else if (arg === '--help' || arg === '-h') parsed.help = true;
  }
  return parsed;
}

function parseJsonRpcInput(input) {
  return input.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
