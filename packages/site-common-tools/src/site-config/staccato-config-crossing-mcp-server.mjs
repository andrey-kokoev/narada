#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { buildDeprecatedNaradaAndreyShim, NARADA_USER_SITE_LOCUS } from '../site-locus-shim.mjs';
import { buildOutputRefToolContent } from '../mcp-payload-file.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const TARGET_CONFIG = 'C:\\Users\\Andrey\\OneDrive - Global Maxima LLC\\!Business\\!Clients\\Staccato\\.narada\\config.json';
const TARGET_ROOT = dirname(TARGET_CONFIG);
const WORKSPACE_ROOT = 'C:\\Users\\Andrey\\OneDrive - Global Maxima LLC\\!Business\\!Clients\\Staccato';
const TASK_NUMBER = 458;
const APPROVAL_ENVELOPE = 'env_e13a0490f8e94e73a3b3b6b4bd847297';
let activeOutputToolName = null;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write('Usage: node tools/site-config/staccato-config-crossing-mcp-server.mjs --site-root <path>\n');
  process.exit(0);
}

runStdioServer().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function runStdioServer() {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const request of lines.filter(Boolean).map((line) => JSON.parse(line))) {
      const response = handleRequest(request);
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
}

function handleRequest(request) {
  if (!request?.id && request?.method?.startsWith?.('notifications/')) return null;
  try {
    return { jsonrpc: '2.0', id: request.id ?? null, result: dispatch(request.method, request.params ?? {}) };
  } catch (error) {
    return { jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: error.message } };
  }
}

function dispatch(method, params) {
  if (method === 'initialize') {
    return {
      protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'narada-staccato-config-crossing-mcp', version: '0.1.0' },
    };
  }
  if (method === 'tools/list') return { tools: tools() };
  if (method === 'tools/call') return callTool(params);
  throw new Error(`unsupported_mcp_method: ${method}`);
}

function tools() {
  return [
    {
      name: 'staccato_config_crossing_doctor',
      description: 'Inspect readiness for the governed #458 Staccato config crossing.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'staccato_config_crossing_apply',
      description: 'Apply the bounded #458 Staccato config schema/current-state update.',
      inputSchema: {
        type: 'object',
        properties: {
          dry_run: { type: 'boolean' },
          task_number: { type: 'integer' },
          authority_basis: { type: 'object' },
        },
        required: ['task_number', 'authority_basis'],
      },
    },
  ];
}

function callTool(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name) activeOutputToolName = name;
  if (name === 'staccato_config_crossing_doctor') return jsonResult(doctor());
  if (name === 'staccato_config_crossing_apply') return jsonResult(applyCrossing(args));
  throw new Error(`staccato_config_crossing_refused_unknown_tool: ${name}`);
}

function doctor() {
  const loaded = existsSync(TARGET_CONFIG) ? loadConfig() : null;
  return {
    schema: 'narada.staccato_config_crossing.doctor.v0',
    status: loaded ? 'ok' : 'blocked',
    target_config: TARGET_CONFIG,
    target_root: TARGET_ROOT,
    mutates_only: [TARGET_CONFIG],
    required_task_number: TASK_NUMBER,
    required_approval_envelope: APPROVAL_ENVELOPE,
    current_schema: loaded?.config?.schema ?? null,
    current_site_id: loaded?.config?.site_id ?? loaded?.config?.static_config?.site_id ?? null,
    current_sha256: loaded?.sha256 ?? null,
  };
}

function applyCrossing(args) {
  if (Number(args.task_number) !== TASK_NUMBER) throw new Error(`wrong_task_number: ${args.task_number}`);
  assertAuthority(args.authority_basis);
  const before = loadConfig();
  const now = new Date().toISOString();
  const updated = buildUpdatedConfig(before.config, now, args.authority_basis);
  const validation = validateConfig(updated);
  if (validation.status !== 'valid') {
    return { schema: 'narada.staccato_config_crossing.apply.v0', status: 'blocked', validation };
  }
  const content = `${JSON.stringify(updated, null, 2)}\n`;
  const afterSha256 = sha256(content);
  if (args.dry_run !== true) writeFileSync(TARGET_CONFIG, content, 'utf8');
  return {
    schema: 'narada.staccato_config_crossing.apply.v0',
    status: args.dry_run === true ? 'planned' : 'updated',
    changed: before.sha256 !== afterSha256,
    target_config: TARGET_CONFIG,
    before_sha256: before.sha256,
    after_sha256: afterSha256,
    validation,
    evidence_refs: [`task:${TASK_NUMBER}`, `inbox:${APPROVAL_ENVELOPE}`],
  };
}

function buildUpdatedConfig(original, now, authorityBasis) {
  const targetSiteId = original.site_id ?? original.static_config?.site_id ?? 'staccato-client-service';
  const legacy = { ...original };
  delete legacy.schema;
  delete legacy.static_config;
  delete legacy.structural_config;
  delete legacy.runtime_config;

  return {
    ...original,
    schema: 'narada.site.config.v0',
    static_config: {
      site_id: targetSiteId,
      aliases: ['narada-staccato'],
      variant: original.variant ?? 'onedrive_git_working_repo',
      substrate: 'windows-native',
      site_root: TARGET_ROOT,
      config_path: TARGET_CONFIG,
      locus: {
        authority_locus: original.authority_locus ?? 'client_service',
        locus_type: 'client_service',
        principal: { client: original.client?.name ?? 'Staccato' },
      },
    },
    structural_config: {
      sync: {
        posture: 'not_git_repository',
        git_initialized: false,
        cloud_sync: 'onedrive_workspace_if_configured',
        durable_paths: original.durable_paths ?? [],
        volatile_paths: original.volatile_or_untracked_by_default ?? [],
      },
      task_substrate: {
        status: 'observed',
        authority: 'target_site_when_inspected',
        runtime_db: '.ai/task-lifecycle.db',
        task_specs: '.ai/do-not-open/tasks/',
      },
      narada_cli: {
        embodiment_policy: 'not_declared_for_this_site',
        failure_rule: { message: 'target_cli_not_admitted_for_crossing_session' },
      },
      linked_sites: original.linked_sites ?? {},
      absorbed_sites: original.absorbed_sites ?? {},
      site_awareness: {
        site_id: targetSiteId,
        aliases: ['narada-staccato'],
        own_current_state: {
          locus_type: 'client_service',
          roots: {
            workspace_root_windows: WORKSPACE_ROOT,
            site_root_windows: TARGET_ROOT,
            config_path_windows: TARGET_CONFIG,
          },
          authority_boundaries: {
            staccato_client_service: [
              'client_service_memory',
              'client_service_task_governance',
              'client_service_inbox_intake',
              'client_service_capability_config',
            ],
            not_granted_to_crossing: [
              'mutate_client_files',
              'access_client_secrets',
              'mutate_data_site',
              'mutate_elt_side',
              'send_mail_or_external_effects',
            ],
          },
          capabilities: [
            'config_declared',
            'inbox_facade_declared',
            'site_local_inbox_declared',
            'task_lifecycle_observed',
            'mcp_config_observed',
            'governed_config_crossing_admitted_for_task_458',
          ],
          freshness: {
            reviewed_at: now,
            source: 'staccato_config_crossing_mcp',
            evidence: 'Task #458 governed crossing applied schema and current-state fields after Staccato approval envelope.',
          },
          blockers: [
            'site identity attestation remains unsigned/unimplemented',
            'mailbox sync remains inactive pending credentials, dry-run, and operator activation decision',
            'outbound effect execution still requires separate approval path',
          ],
        },
        known_sites: {
          'narada-andrey': knownAndreySite(targetSiteId, now),
        },
      },
      message_intake: {
        canonical_inbox: original.canonical_inbox ?? null,
        message_routing: original.message_routing ?? null,
      },
      pc_locus: {
        status: 'external_to_client_service_site',
        note: 'PC-local mutations require PC-locus authority and are not granted by this config update.',
      },
      legacy_config: legacy,
      crossing_history: [
        ...asArray(original.structural_config?.crossing_history),
        {
          task_number: TASK_NUMBER,
          applied_at: now,
          surface: 'staccato_config_crossing_mcp.local',
          authority_basis: authorityBasis,
          evidence_refs: [`task:${TASK_NUMBER}`, `inbox:${APPROVAL_ENVELOPE}`],
          scope: 'config_schema_and_current_state_fields_only',
        },
      ],
    },
    runtime_config: {
      mailbox_sync: runtimeParam('configured_pending_credentials_and_dry_run', 'configured_pending_credentials_and_dry_run', 'staccato_client_service', false),
      outbound_effects: runtimeParam('requires_separate_operator_approval', 'requires_separate_operator_approval', 'staccato_client_service', false),
      config_crossing_task_458: runtimeParam('admitted_and_applied', 'not_admitted', 'governed_crossing', false),
    },
  };
}

function knownAndreySite(targetSiteId, now) {
  const userSiteShim = buildDeprecatedNaradaAndreyShim({
    resolvedSiteLocus: NARADA_USER_SITE_LOCUS,
    resolutionBasis: 'staccato governed crossing references the current User Site root and architect inbox',
    removalCondition: 'Remove when Staccato crossing config uses narada-user-site for this source Site.',
  });
  return {
    site_id: NARADA_USER_SITE_LOCUS,
    deprecated_site_locus_shim: userSiteShim,
    locus_type: 'user_site',
    roots: { site_root_windows: 'C:\\Users\\Andrey\\Narada' },
    authority_boundaries: {
      staccato_client_service: ['route_proposals', 'receive_governed_crossing_requests', 'review_operator_authorized_updates'],
      narada_user_site: ['operator_memory', 'cross_site_routing', 'architect_review'],
      not_granted_by_awareness: ['mutate_client_files', 'mutate_target_task_lifecycle', 'access_client_secrets', 'send_mail_or_external_effects'],
    },
    capability_edges: [
      claim(targetSiteId, NARADA_USER_SITE_LOCUS, 'route_proposals', 'available', 'governed_crossing'),
      claim(NARADA_USER_SITE_LOCUS, targetSiteId, 'governed_config_crossing_task_458', 'admitted', 'governed_crossing'),
      claim(NARADA_USER_SITE_LOCUS, targetSiteId, 'review_governance_surfaces', 'available', 'operator_instruction'),
    ],
    capability_denials: [
      denial(NARADA_USER_SITE_LOCUS, targetSiteId, 'mutate_client_files'),
      denial(NARADA_USER_SITE_LOCUS, targetSiteId, 'mutate_target_task_lifecycle'),
      denial(NARADA_USER_SITE_LOCUS, targetSiteId, 'access_client_secrets'),
      denial(NARADA_USER_SITE_LOCUS, targetSiteId, 'send_mail_or_external_effects'),
    ],
    sync_posture: 'git_backed_private',
    capabilities: ['route_proposals', 'architect_review', 'governed_config_crossing_task_458'],
    inbox_endpoint: { status: 'observed', fallback: 'User Site architect inbox' },
    task_lifecycle: { status: 'observed', authority: 'user_site' },
    mcp_access: { status: 'observed_current_session', note: 'Crossing applied by task-scoped MCP surface, not by local registry awareness.' },
    freshness: { reviewed_at: now, source: 'staccato_config_crossing_mcp' },
    health: { status: 'ok_governed_crossing_used' },
    blockers: ['no general mutation authority granted by this awareness entry'],
    evidence_refs: [`task:${TASK_NUMBER}`, `inbox:${APPROVAL_ENVELOPE}`],
  };
}

function claim(from, to, capability, status, basis) {
  return { from, to, capability, status, basis, evidence_refs: [`task:${TASK_NUMBER}`, `inbox:${APPROVAL_ENVELOPE}`] };
}

function denial(from, to, capability) {
  return { from, to, capability, status: 'not_granted', basis: 'governed_crossing_limits', evidence_refs: [`task:${TASK_NUMBER}`, `inbox:${APPROVAL_ENVELOPE}`] };
}

function runtimeParam(currentValue, defaultValue, authority, mutableAtRuntime) {
  return { current_value: currentValue, default_value: defaultValue, authority, mutable_at_runtime: mutableAtRuntime };
}

function validateConfig(config) {
  const errors = [];
  for (const key of ['schema', 'static_config', 'structural_config', 'runtime_config']) {
    if (!(key in config)) errors.push(`missing:${key}`);
  }
  for (const key of ['sync', 'task_substrate', 'narada_cli', 'linked_sites', 'site_awareness', 'message_intake', 'pc_locus']) {
    if (!(key in config.structural_config)) errors.push(`missing:structural_config.${key}`);
  }
  const site = config.structural_config.site_awareness.known_sites['narada-andrey'];
  for (const key of ['site_id', 'locus_type', 'roots', 'authority_boundaries', 'capability_edges', 'capability_denials', 'sync_posture', 'capabilities', 'inbox_endpoint', 'task_lifecycle', 'mcp_access', 'freshness', 'health']) {
    if (!(key in site)) errors.push(`missing:known_sites.narada-andrey.${key}`);
  }
  if (!site.authority_boundaries.not_granted_by_awareness.some((entry) => entry.includes('mutate'))) {
    errors.push('missing:mutation_denial');
  }
  return { schema: 'narada.site.config.validation.v0', status: errors.length === 0 ? 'valid' : 'invalid', errors };
}

function assertAuthority(authorityBasis) {
  if (!authorityBasis || typeof authorityBasis !== 'object') throw new Error('authority_basis_required');
  if (!['operator_direct_instruction', 'governed_crossing'].includes(authorityBasis.kind)) throw new Error(`bad_authority_kind: ${authorityBasis.kind}`);
  const text = JSON.stringify(authorityBasis);
  if (!text.includes(String(TASK_NUMBER))) throw new Error(`authority_missing_task:${TASK_NUMBER}`);
  if (!text.includes(APPROVAL_ENVELOPE)) throw new Error(`authority_missing_envelope:${APPROVAL_ENVELOPE}`);
}

function loadConfig() {
  if (!existsSync(TARGET_CONFIG)) throw new Error(`target_config_not_found: ${TARGET_CONFIG}`);
  const content = readFileSync(TARGET_CONFIG, 'utf8');
  return { content, sha256: sha256(content), config: JSON.parse(content) };
}

function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function jsonResult(value) {
  return buildOutputRefToolContent({ siteRoot: process.cwd(), toolName: activeOutputToolName, value });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
