#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { runGovernedCommandSync } from '@narada-core/process-launch-posture';
import { validateSiteIdentityDocument } from '../site-config/validate-site-config.js';
import { buildOutputRefToolContent } from '../mcp-payload-file.js';

const PROTOCOL_VERSION: any = '2024-11-05';
const SERVER_NAME: any = 'narada-site-probe-mcp';
const SERVER_VERSION: any = '0.1.0';
const PROBE_SCHEMA: any = 'narada.registered_site.probe_report.v0';
const CONTRACT_REF: any = 'docs/site-config/site-registry-capability-current-state-contract.md';
const IDENTITY_CONTRACT_REF: any = 'docs/site-config/site-identity-attestation-contract.md';
let activeOutputToolName: any = null;

const options: any = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write('Usage: node tools/site-probe/site-probe-mcp-server.ts --site-root <path>\n');
  process.exit(0);
}

runStdioServer(options).catch((error: any) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function runStdioServer(serverOptions: any) : Promise<any>{
  let buffer: any = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;
    const lines: any = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    const requests: any = lines.filter((line: any) => line.trim().length > 0).map((line: any) => JSON.parse(line));
    for (const request of requests) {
      const response: any = handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response);
    }
  }
  const trailing: any = buffer.trim();
  if (trailing.length > 0) {
    for (const request of parseJsonRpcInput(trailing)) {
      const response: any = handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response);
    }
  }
}

function writeMcpFrame(response: any) : any{
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function handleRequest(request: any, serverOptions: any) : any{
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  try {
    return { jsonrpc: '2.0', id: request.id ?? null, result: dispatchMethod(request.method, request.params ?? {}, serverOptions) };
  } catch (error: any) {
    return {
      jsonrpc: '2.0',
      id: request?.id ?? null,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function dispatchMethod(method: any, params: any, serverOptions: any) : any{
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

function tools() : any{
  return [
    {
      name: 'site_probe_doctor',
      description: 'Inspect read-only registered Site probe readiness and registered awareness sources.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'site_probe',
      description: 'Read-only probe of a registered Site governance root. Does not mutate target files or grant target authority.',
      inputSchema: {
        type: 'object',
        properties: {
          site_id: { type: 'string', description: 'Known Site id from parent structural_config.site_awareness.known_sites.' },
          root: { type: 'string', description: 'Explicit target root. Requires authority_basis unless it matches a registered root.' },
          authority_basis: { type: 'object', description: 'Required for explicit unregistered root: { kind: operator_direct_instruction, summary }.' },
        },
      },
    },
  ];
}

function callTool(params: any, serverOptions: any) : any{
  const record: any = asRecord(params);
  const name: any = stringField(record, 'name');
  const args: any = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');
  activeOutputToolName = name;
  const parentRoot: any = resolve(serverOptions.siteRoot ?? process.cwd());
  switch (name) {
    case 'site_probe_doctor':
      return jsonToolResult(doctor(parentRoot));
    case 'site_probe':
      return jsonToolResult(probeSite(parentRoot, args));
    default:
      throw new Error(`site_probe_refused_unknown_tool: ${name}`);
  }
}

function doctor(parentRoot: any) : any{
  const config: any = loadParentConfig(parentRoot);
  const siteAwareness: any = siteAwarenessFromConfig(config);
  const knownSites: any = siteAwareness.known_sites ?? {};
  return {
    schema: 'narada.registered_site.probe_doctor.v0',
    status: 'ok',
    surface: 'site-probe-mcp.local',
    read_only: true,
    contract_ref: CONTRACT_REF,
    registered_site_count: Object.keys(knownSites).length,
    registered_sites: Object.entries(knownSites).map(([siteId, site]: any) => ({
      site_id: siteId,
      locus_type: site?.locus_type ?? null,
      registered_roots: registeredRoots(site),
    })),
    authority_rule: 'Local Site registry entries grant read/proposal posture only when explicit; target Site mutation requires target-rooted authority or governed crossing.',
  };
}

function probeSite(parentRoot: any, args: any) : any{
  const config: any = loadParentConfig(parentRoot);
  const siteAwareness: any = siteAwarenessFromConfig(config);
  const knownSites: any = siteAwareness.known_sites ?? {};
  const siteId: any = stringField(args, 'site_id');
  const explicitRoot: any = stringField(args, 'root');
  if (!siteId && !explicitRoot) throw new Error('site_probe_requires_site_id_or_root');

  const knownEntry: any = siteId ? knownSites[siteId] : findRegisteredSiteByRoot(knownSites, explicitRoot);
  if (siteId && !knownEntry && !explicitRoot) throw new Error(`site_probe_unknown_site_id: ${siteId}`);

  const resolved: any = resolveTargetRoot({ parentRoot, knownSites, knownEntry, siteId, explicitRoot, authorityBasis: args.authority_basis });
  const targetRoot: any = resolved.root;
  const awareness: any = knownEntry ?? provisionalAwareness(siteId ?? 'explicit-root', targetRoot, args.authority_basis);
  const rootExists: any = existsSync(targetRoot);

  const surfaces: any = inspectGovernanceSurfaces(targetRoot, rootExists);
  const identity: any = inspectIdentityPosture(targetRoot, rootExists, siteAwareness);
  const git: any = inspectGit(targetRoot, rootExists);
  const blockers: any = [...surfaces.blockers];
  if (resolved.registration_status === 'operator_explicit_unregistered_root') {
    blockers.push({ kind: 'unregistered_root', severity: 'info', summary: 'Explicit root was allowed only by operator authority; it is not parent-registered awareness.' });
  }

  const status: any = !rootExists
    ? 'blocked'
    : blockers.some((blocker: any) => blocker.severity === 'error')
      ? 'warning'
      : 'ok';

  const evidenceRefs: any = [
    `local_site_config:${relativePath(parentRoot, join(parentRoot, 'config.json'))}`,
    `contract:${CONTRACT_REF}`,
    `contract:${IDENTITY_CONTRACT_REF}`,
    `probe_root:${targetRoot}`,
    ...((Array.isArray(awareness.evidence_refs) ? awareness.evidence_refs : [])),
  ];

  return {
    schema: PROBE_SCHEMA,
    status,
    site_id: awareness.site_id ?? siteId ?? 'explicit-root',
    root: targetRoot,
    registration_status: resolved.registration_status,
    locus_type: awareness.locus_type ?? 'unknown',
    authority_owner: targetAuthorityOwner(awareness),
    authority_note: 'Read-only local Site registry/probe result. This does not grant mutation authority over the target Site.',
    awareness_contract: {
      contract_ref: CONTRACT_REF,
      emits_contract_shape_or_superset: true,
      local_site_registry_not_target_authority: true,
    },
    identity,
    current_state: {
      site_id: awareness.site_id ?? siteId ?? 'explicit-root',
      locus_type: awareness.locus_type ?? 'unknown',
      roots: awareness.roots ?? { site_root_windows: targetRoot },
      authority_boundaries: awareness.authority_boundaries ?? provisionalAuthorityBoundaries(),
      capability_edges: awareness.capability_edges ?? provisionalCapabilityEdges(awareness.site_id ?? siteId ?? 'explicit-root'),
      capability_denials: awareness.capability_denials ?? provisionalCapabilityDenials(awareness.site_id ?? siteId ?? 'explicit-root'),
      identity,
      sync_posture: git.sync_posture,
      capabilities: observedCapabilities(awareness, surfaces, git),
      inbox_endpoint: surfaces.inbox_endpoint,
      task_lifecycle: surfaces.task_lifecycle,
      mcp_access: surfaces.mcp_access,
      freshness: { probed_at: new Date().toISOString(), source: 'site_probe_read_only' },
      health: { status, blockers_count: blockers.length },
      blockers,
      evidence_refs: evidenceRefs,
    },
    readable_surfaces: surfaces.readable_surfaces,
    missing_surfaces: surfaces.missing_surfaces,
    git_status: git.status_summary,
    validation: surfaces.validation,
    capability_declarations: {
      local_site_registry: Array.isArray(awareness.capabilities) ? awareness.capabilities : [],
      target_config_capabilities: surfaces.target_config_capabilities,
    },
    privacy_scope: surfaces.privacy_scope,
    blockers,
    recommended_next_actions: recommendedNextActions({ status, surfaces, resolved }),
    evidence_refs: evidenceRefs,
  };
}

function resolveTargetRoot({ parentRoot, knownSites, knownEntry, siteId, explicitRoot, authorityBasis }: any) : any{
  if (knownEntry) {
    const root: any = explicitRoot ? resolveMaybeAbsolute(parentRoot, explicitRoot) : preferredSiteRoot(knownEntry);
    if (!root) throw new Error(`site_probe_registered_site_has_no_root: ${siteId}`);
    if (!isRegisteredRoot(knownEntry, root)) throw new Error(`site_probe_root_not_registered_for_site: ${siteId ?? knownEntry.site_id}`);
    return { root, registration_status: 'registered_local_site_registry' };
  }

  if (explicitRoot) {
    const authority: any = asRecord(authorityBasis);
    if (stringField(authority, 'kind') !== 'operator_direct_instruction' || !stringField(authority, 'summary')) {
      throw new Error('site_probe_unregistered_root_requires_operator_authority_basis');
    }
    const root: any = resolveMaybeAbsolute(parentRoot, explicitRoot);
    if (findRegisteredSiteByRoot(knownSites, root)) return { root, registration_status: 'registered_local_site_registry' };
    return { root, registration_status: 'operator_explicit_unregistered_root' };
  }

  throw new Error(`site_probe_unknown_site_id: ${siteId}`);
}

function loadParentConfig(parentRoot: any) : any{
  const configPath: any = join(parentRoot, 'config.json');
  if (!existsSync(configPath)) throw new Error(`site_probe_local_site_config_not_found: ${configPath}`);
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function siteAwarenessFromConfig(config: any) : any{
  return config.structural_config?.site_awareness
    ?? config.governance?.site_awareness
    ?? {};
}

function inspectGovernanceSurfaces(root: any, rootExists: any) : any{
  const readable: any = [];
  const missing: any = [];
  const blockers: any = [];
  const configPath: any = join(root, 'config.json');
  const agentsPath: any = join(root, 'AGENTS.md');
  const taskDbPath: any = join(root, '.ai', 'task-lifecycle.db');
  const taskSpecsPath: any = join(root, '.ai', 'do-not-open', 'tasks');
  const inboxEnvelopesPath: any = join(root, '.ai', 'inbox-envelopes');
  const inboxIndexPath: any = join(root, '.ai', 'state', 'inbox-index.sqlite');
  const mcpPath: any = join(root, '.ai', 'mcp');
  const identityPath: any = resolveIdentityDocumentPath(root);

  if (!rootExists) {
    return {
      readable_surfaces: [],
      missing_surfaces: ['root'],
      blockers: [{ kind: 'root_missing', severity: 'error', summary: `Target root does not exist: ${root}` }],
      inbox_endpoint: { status: 'root_missing' },
      task_lifecycle: { status: 'root_missing' },
      mcp_access: { status: 'root_missing' },
      validation: { status: 'not_available', reason: 'root_missing' },
      target_config_capabilities: [],
      privacy_scope: privacyScope(root),
    };
  }

  const config: any = readJsonIfPresent(configPath);
  const workspaceInboxFacadePaths: any = config.status === 'ok' ? declaredWorkspaceInboxFacadePaths(root, config.value) : [];
  const inboxPaths: any = [...workspaceInboxFacadePaths, inboxEnvelopesPath, inboxIndexPath];
  if (config.status === 'ok') readable.push('config.json'); else missing.push('config.json');
  if (existsSync(agentsPath)) readable.push('AGENTS.md'); else missing.push('AGENTS.md');
  if (existsSync(taskDbPath) || existsSync(taskSpecsPath)) readable.push('task_lifecycle'); else missing.push('task_lifecycle');
  if (inboxPaths.some((path: any) => existsSync(path))) readable.push('inbox'); else missing.push('inbox');
  if (existsSync(mcpPath)) readable.push('.ai/mcp'); else missing.push('.ai/mcp');
  if (existsSync(identityPath)) readable.push('.narada/site.identity.json'); else missing.push('.narada/site.identity.json');

  if (config.status !== 'ok') blockers.push({ kind: 'config_missing_or_unreadable', severity: 'warning', summary: config.error ?? 'config.json is missing' });

  return {
    readable_surfaces: readable,
    missing_surfaces: missing,
    blockers,
    inbox_endpoint: inboxPaths.some((path: any) => existsSync(path))
      ? {
          status: 'observed',
          surfaces: existingPaths(root, inboxPaths),
          discovery_order: workspaceInboxFacadePaths.length > 0 ? 'workspace_facade_before_site_local' : 'site_local_only',
          declared_facade: workspaceInboxFacadePaths.length > 0 ? {
            path_base: 'workspace_root',
            surfaces: existingPaths(root, workspaceInboxFacadePaths),
          } : null,
        }
      : { status: 'not_observed' },
    task_lifecycle: existsSync(taskDbPath) || existsSync(taskSpecsPath)
      ? { status: 'observed', surfaces: existingPaths(root, [taskDbPath, taskSpecsPath]) }
      : { status: 'not_observed' },
    mcp_access: existsSync(mcpPath)
      ? { status: 'observed', surfaces: existingPaths(root, [mcpPath]) }
      : { status: 'not_observed' },
    validation: config.status === 'ok'
      ? { status: 'available', config_schema: config.value?.schema ?? null }
      : { status: 'not_available', reason: config.error ?? 'config_missing' },
    target_config_capabilities: Array.isArray(config.value?.structural_config?.site_awareness?.own_current_state?.capabilities)
      ? config.value.structural_config.site_awareness.own_current_state.capabilities
      : Array.isArray(config.value?.structural_config?.site_awareness?.capabilities)
        ? config.value.structural_config.site_awareness.capabilities
      : [],
    privacy_scope: privacyScope(root, workspaceInboxFacadePaths.length > 0),
  };
}

function declaredWorkspaceInboxFacadePaths(root: any, config: any) : any{
  const canonicalInbox: any = config?.canonical_inbox ?? config?.structural_config?.message_intake?.canonical_inbox;
  if (canonicalInbox?.path_base !== 'workspace_root') return [];
  const workspaceRoot: any = config?.workspace_root ?? config?.static_config?.workspace_root ?? config?.structural_config?.site_awareness?.own_current_state?.roots?.workspace_root_windows ?? resolve(root, '..');
  return [
    join(workspaceRoot, '.ai', 'inbox-envelopes'),
    join(workspaceRoot, '.ai', 'state', 'inbox-index.sqlite'),
    join(workspaceRoot, '.ai', 'inbox.db'),
    join(workspaceRoot, '.ai', 'inbox-drop'),
  ];
}

function inspectGit(root: any, rootExists: any) : any{
  if (!rootExists) return { sync_posture: 'root_missing', status_summary: { status: 'not_available', reason: 'root_missing' } };
  if (!existsSync(join(root, '.git'))) return { sync_posture: 'not_git_repository', status_summary: { status: 'not_git_repository' } };
  const result: any = runGovernedCommandSync('git', ['status', '--porcelain=v1', '-b'], { cwd: root, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  if (result.status !== 0) {
    return { sync_posture: 'git_status_error', status_summary: { status: 'error', stderr: result.stderr.trim() } };
  }
  const lines: any = result.stdout.split(/\r?\n/).filter(Boolean);
  const dirty: any = lines.filter((line: any) => !line.startsWith('##'));
  return {
    sync_posture: dirty.length > 0 ? 'git_dirty' : 'git_clean',
    status_summary: {
      status: dirty.length > 0 ? 'dirty' : 'clean',
      branch: lines.find((line: any) => line.startsWith('##')) ?? null,
      dirty_count: dirty.length,
      dirty_paths: dirty.map((line: any) => line.slice(3)).slice(0, 20),
    },
  };
}

function readJsonIfPresent(path: any) : any{
  if (!existsSync(path)) return { status: 'missing', error: 'config_missing' };
  try {
    return { status: 'ok', value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error: any) {
    return { status: 'error', error: `json_parse_error: ${error.message}` };
  }
}

function inspectIdentityPosture(root: any, rootExists: any, awareness: any) : any{
  const relativeDocumentPath: any = '.narada/site.identity.json';
  const identityPath: any = resolveIdentityDocumentPath(root);
  const base: any = {
    status: 'not_observed',
    site_id_claim: null,
    identity_document: { status: rootExists ? 'not_observed' : 'root_missing', path: relativeDocumentPath },
    trusted_key_match: false,
    verification_state: 'observed_unverified',
    authority_note: 'Identity material is authenticity evidence only; it does not grant target mutation authority.',
    contract_ref: IDENTITY_CONTRACT_REF,
    evidence_refs: [`contract:${IDENTITY_CONTRACT_REF}`],
  };
  if (!rootExists) return base;
  const identity: any = readJsonIfPresent(identityPath);
  if (identity.status === 'missing') return base;
  if (identity.status !== 'ok') {
    return {
      ...base,
      status: 'invalid',
      identity_document: { status: 'unreadable', path: relativeDocumentPath, error: identity.error },
      validation: { status: 'invalid', errors: [identity.error] },
    };
  }
  const validationErrors: any = validateSiteIdentityDocument(identity.value, 'identity');
  const trustRecord: any = matchingLocalTrustRecord(awareness, identity.value);
  const verified: any = Boolean(trustRecord && ['operator_pinned', 'signature_verified'].includes(trustRecord.verification_state));
  return {
    ...base,
    status: verified ? trustRecord.verification_state : 'observed_unverified',
    site_id_claim: typeof identity.value.site_id === 'string' ? identity.value.site_id : null,
    identity_document: { status: 'observed', path: relativeDocumentPath },
    trusted_key_match: verified,
    verification_state: verified ? trustRecord.verification_state : 'observed_unverified',
    validation: { status: validationErrors.length === 0 ? 'valid' : 'invalid', errors: validationErrors },
    evidence_refs: [`contract:${IDENTITY_CONTRACT_REF}`, `identity_document:${relativeDocumentPath}`],
  };
}

function resolveIdentityDocumentPath(root: any) : any{
  const normalized: any = root.split('\\').join('/').toLowerCase();
  return normalized.endsWith('/.narada') ? join(root, 'site.identity.json') : join(root, '.narada', 'site.identity.json');
}

function matchingLocalTrustRecord(awareness: any, identity: any) : any{
  const trustRecords: any = Array.isArray(awareness?.identity_trust) ? awareness.identity_trust : [];
  return trustRecords.find((record: any) => (
    record?.site_id === identity?.site_id
    && Array.isArray(identity?.public_keys)
    && identity.public_keys.some((key: any) => key?.key_id === record.key_id && key?.fingerprint_sha256 === record.fingerprint_sha256)
  )) ?? null;
}

function preferredSiteRoot(site: any) : any{
  const roots: any = site?.roots ?? {};
  const raw: any = roots.site_root_windows ?? roots.site_root_wsl ?? roots.windows ?? roots.wsl;
  return raw ? resolveMaybeAbsolute(process.cwd(), raw) : null;
}

function registeredRoots(site: any) : any{
  return Object.values(site?.roots ?? {}).filter((value: any) => typeof value === 'string' && !/^https?:\/\//i.test(value));
}

function isRegisteredRoot(site: any, root: any) : any{
  const normalized: any = resolve(root);
  return registeredRoots(site).some((candidate: any) => resolveMaybeAbsolute(process.cwd(), candidate) === normalized);
}

function findRegisteredSiteByRoot(knownSites: any, root: any) : any{
  if (!root) return null;
  const normalized: any = resolveMaybeAbsolute(process.cwd(), root);
  return Object.values(knownSites).find((site: any) => isRegisteredRoot(site, normalized)) ?? null;
}

function resolveMaybeAbsolute(base: any, path: any) : any{
  return resolve(isAbsolute(path) ? path : resolve(base, path));
}

function existingPaths(root: any, paths: any) : any{
  return paths.filter((path: any) => existsSync(path)).map((path: any) => relativePath(root, path));
}

function observedCapabilities(awareness: any, surfaces: any, git: any) : any{
  const capabilities: any = new Set(Array.isArray(awareness.capabilities) ? awareness.capabilities : []);
  if (surfaces.readable_surfaces.includes('config.json')) capabilities.add('config_readable');
  if (surfaces.readable_surfaces.includes('task_lifecycle')) capabilities.add('task_lifecycle_observed');
  if (surfaces.readable_surfaces.includes('inbox')) capabilities.add('inbox_observed');
  if (surfaces.readable_surfaces.includes('.ai/mcp')) capabilities.add('mcp_config_observed');
  if (git.status_summary.status === 'clean' || git.status_summary.status === 'dirty') capabilities.add('git_status_observed');
  return [...capabilities].sort();
}

function targetAuthorityOwner(awareness: any) : any{
  const boundaries: any = awareness?.authority_boundaries ?? {};
  return Object.keys(boundaries).find((key: any) => !['user_site', 'not_granted_by_awareness'].includes(key)) ?? null;
}

function provisionalAwareness(siteId: any, root: any, authorityBasis: any) : any{
  return {
    site_id: siteId,
    locus_type: 'operator_explicit_root',
    roots: { explicit_root: root },
    authority_boundaries: provisionalAuthorityBoundaries(),
    capabilities: ['operator_explicit_read_probe'],
    evidence_refs: [`operator_authority:${stringField(asRecord(authorityBasis), 'summary') ?? 'provided'}`],
  };
}

function provisionalAuthorityBoundaries() : any{
  return {
    user_site: ['know', 'navigate', 'review', 'route_proposals'],
    target_site: ['target_owned_authority_unknown_until_inspected'],
    not_granted_by_awareness: ['mutate_target_site_config', 'mutate_task_lifecycle', 'access_secrets'],
  };
}

function provisionalCapabilityEdges(siteId: any) : any{
  return ['know', 'navigate', 'review', 'route_proposals'].map((capability: any) => ({
    from: 'local_site',
    to: siteId,
    capability,
    status: 'available',
    basis: 'explicit_operator_instruction',
    evidence_refs: ['operator_explicit_root'],
  }));
}

function provisionalCapabilityDenials(siteId: any) : any{
  return ['mutate_target_site_config', 'mutate_task_lifecycle', 'access_secrets'].map((capability: any) => ({
    from: 'local_site',
    to: siteId,
    capability,
    status: 'not_granted',
    basis: 'local_site_registry_non_grant',
    evidence_refs: ['operator_explicit_root'],
  }));
}

function recommendedNextActions({ status, surfaces, resolved }: any) : any{
  const actions: any = [];
  if (status === 'blocked') actions.push('verify_target_root_or_update_parent_site_awareness');
  if (surfaces.missing_surfaces.includes('config.json')) actions.push('inspect_target_site_config_under_target_authority_before_update');
  if (resolved.registration_status === 'operator_explicit_unregistered_root') actions.push('record_or_reject_parent_site_awareness_entry_before_reuse');
  if (actions.length === 0) actions.push('use_probe_report_as_read_only_input_to_follow_up_config_or_crossing_task');
  return actions;
}

function privacyScope(root: any, workspaceInboxFacadeDeclared: any = false) : any{
  const normalizedRoot: any = root.replace(/\\/g, '/').toLowerCase();
  return {
    mode: normalizedRoot.endsWith('/.narada') ? 'governance_root_only' : 'fixed_governance_paths_only',
    inspected_paths: [
      'config.json',
      'AGENTS.md',
      '.git',
      '.ai/task-lifecycle.db',
      '.ai/do-not-open/tasks',
      '.ai/inbox-envelopes',
      '.ai/state/inbox-index.sqlite',
      '.ai/mcp',
      '.narada/site.identity.json',
      ...(workspaceInboxFacadeDeclared ? [
        '../.ai/inbox-envelopes',
        '../.ai/state/inbox-index.sqlite',
        '../.ai/inbox.db',
        '../.ai/inbox-drop',
      ] : []),
    ],
    recursive_scan: false,
    arbitrary_client_files_scanned: false,
  };
}

function relativePath(root: any, path: any) : any{
  const rel: any = relative(root, path).replace(/\\/g, '/');
  return rel || '.';
}

function parseArgs(argv: any) : any{
  const opts: any = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--site-root') {
      opts.siteRoot = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

function parseJsonRpcInput(input: any) : any{
  if (!input) return [];
  return input.split(/\r?\n/).filter(Boolean).map((line: any) => JSON.parse(line));
}

function asRecord(value: any) : any{
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringField(record: any, key: any) : any{
  const value: any = record[key];
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return null;
  return String(value);
}

function jsonToolResult(data: any) : any{
  return buildOutputRefToolContent({ siteRoot: resolve(options.siteRoot ?? process.cwd()), toolName: activeOutputToolName, value: data });
}

export { probeSite, doctor };
