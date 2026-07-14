import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { siteControlRoot } from '../site-layout.mjs';
import {
  NARADA_PC_SITE_LOCUS,
  NARADA_USER_SITE_LOCUS,
} from '../site-locus-shim.mjs';

export const MCP_RUNTIME_INSTANCE_REGISTRY_SCHEMA = 'narada.pc_runtime.mcp_runtime_instance_registry.v0';
export const MCP_RUNTIME_INSTANCE_STATUS_SCHEMA = 'narada.pc_runtime.mcp_runtime_instance_status.v0';
export const MCP_SURFACE_CARRIER_SUPERVISOR_STATUS_SCHEMA = 'narada.mcp_surface.carrier_supervisor.status.v0';

export function buildMcpRuntimeRegistryStatus({
  siteRoot,
  pcSiteRoot,
  target = null,
  now = new Date(),
  maxEvidenceAgeMs = 10 * 60 * 1000,
} = {}) {
  const root = resolve(siteRoot ?? process.cwd());
  const pcRoot = resolve(pcSiteRoot ?? 'C:/ProgramData/Narada/sites/pc/desktop-sunroom-2');
  const declarationPath = join(siteControlRoot(root), 'capabilities', 'mcp-surfaces.json');
  const registryPath = join(pcRoot, 'runtime', 'mcp-runtime-instances.json');
  const declarations = readJson(declarationPath);
  const runtimeRegistry = readOptionalJson(registryPath);
  const declarationSiteId = declarations?.site_id ?? null;
  const surfaces = Array.isArray(declarations?.surfaces) ? declarations.surfaces : [];
  const knownSurfaces = surfaces.map((surface) => observeDeclaredSurface({
    surface,
    declarationSiteId,
    siteRoot: root,
    runtimeRegistry,
    pcRoot,
    registryPath,
    now,
    maxEvidenceAgeMs,
  }));

  if (target) {
    const resolved = resolveRuntimeTarget(target, knownSurfaces);
    if (!resolved) {
      return refusedTarget({ target, declarationPath, registryPath, knownSurfaces });
    }
    return {
      schema: MCP_RUNTIME_INSTANCE_STATUS_SCHEMA,
      status: 'ok',
      supervisor_locus: NARADA_PC_SITE_LOCUS,
      pc_runtime_locus: NARADA_PC_SITE_LOCUS,
      user_site_locus: NARADA_USER_SITE_LOCUS,
      site_registry_authority: buildSiteRegistryAuthority({ declarationSiteId, declarationPath, registryPath }),
      declaration_path: declarationPath,
      registry_path: registryPath,
      target,
      surface: resolved,
      host_freshness_projection: buildHostFreshnessProjection([resolved]),
      known_surface_count: knownSurfaces.length,
      notes: registryNotes({ runtimeRegistry, knownSurfaces: [resolved] }),
    };
  }

  return {
    schema: MCP_RUNTIME_INSTANCE_STATUS_SCHEMA,
    status: 'ok',
    supervisor_locus: NARADA_PC_SITE_LOCUS,
    pc_runtime_locus: NARADA_PC_SITE_LOCUS,
    user_site_locus: NARADA_USER_SITE_LOCUS,
    site_registry_authority: buildSiteRegistryAuthority({ declarationSiteId, declarationPath, registryPath }),
    declaration_path: declarationPath,
    registry_path: registryPath,
    known_surface_count: knownSurfaces.length,
    host_freshness_projection: buildHostFreshnessProjection(knownSurfaces),
    known_surfaces: knownSurfaces,
    pending_restart_requests: knownSurfaces.flatMap((surface) => surface.restart_request?.state === 'restart_requested' ? [surface.restart_request] : []),
    notes: registryNotes({ runtimeRegistry, knownSurfaces }),
  };
}

export function resolveRuntimeTarget(target, knownSurfaces) {
  const needle = String(target ?? '').trim();
  if (!needle) return null;
  return knownSurfaces.find((surface) => surface.surface_id === needle || surface.server_name === needle) ?? null;
}

export function coordinateMcpRuntimeRestartRequest({
  siteRoot,
  pcSiteRoot,
  target = null,
  staleEpoch = null,
  dryRun = true,
  mutatingAuthorized = null,
  requestedBy = null,
  now = new Date(),
  maxEvidenceAgeMs = 10 * 60 * 1000,
} = {}) {
  const registryStatus = buildMcpRuntimeRegistryStatus({ siteRoot, pcSiteRoot, target, now, maxEvidenceAgeMs });
  if (registryStatus.status === 'refused') {
    return {
      schema: 'narada.pc_runtime.mcp_restart_coordination.v0',
      status: 'refused',
      reason: registryStatus.reason,
      target,
      registry_status: registryStatus,
      terminal_evidence: [],
    };
  }

  const knownSurfaces = registryStatus.surface ? [registryStatus.surface] : (registryStatus.known_surfaces ?? []);
  const affected = knownSurfaces.filter((surface) => isAffectedByRestartRequest(surface, staleEpoch));
  const requestedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const entries = affected.map((surface) => coordinateSurfaceRestart({
    surface,
    dryRun,
    mutatingAuthorized,
    requestedAt,
    requestedBy,
    staleEpoch,
  }));
  const counts = countCoordinationStatuses(entries);
  return {
    schema: 'narada.pc_runtime.mcp_restart_coordination.v0',
    status: 'completed',
    requested_at: requestedAt,
    requested_by: requestedBy ?? null,
    dry_run: dryRun === true,
    target,
    stale_epoch: staleEpoch,
    affected_count: entries.length,
    counts,
    entries,
    terminal_evidence: entries.map((entry) => entry.terminal_evidence),
    registry_status: {
      schema: registryStatus.schema,
      supervisor_locus: registryStatus.supervisor_locus,
      pc_runtime_locus: registryStatus.pc_runtime_locus,
      user_site_locus: registryStatus.user_site_locus,
      declaration_path: registryStatus.declaration_path,
      registry_path: registryStatus.registry_path,
    },
  };
}

function observeDeclaredSurface({ surface, declarationSiteId, siteRoot, runtimeRegistry, pcRoot, registryPath, now, maxEvidenceAgeMs }) {
  const instance = findRuntimeInstance(runtimeRegistry, surface.surface_id);
  const transport = surface.runtime_binding?.transport ?? {};
  const transportType = transport.type ?? null;
  const runtimeKind = surface.runtime_binding?.runtime_kind ?? null;
  const serverName = deriveServerName(surface);
  const evidencePath = instance?.freshness_evidence_path ?? surface.evidence?.path ?? null;
  const restartRequest = instance?.restart_request && typeof instance.restart_request === 'object'
    ? instance.restart_request
    : readRestartRequestForSurface(surface, siteRoot);
  const lastObservedAt = instance?.last_observed_at ?? null;
  const evidenceAge = ageEvidence(lastObservedAt, now);
  const staleEvidence = !lastObservedAt || evidenceAge > maxEvidenceAgeMs;
  const sourceFreshness = normalizeSourceFreshness({ instance, surface, staleEvidence, restartRequest });
  const supervisorOwned = instance?.supervisor_owned === true;
  const reloadSupport = normalizeReloadSupport(instance?.reload_support, transportType, supervisorOwned);
  const ownership = classifyOwnership({ transportType, runtimeKind, supervisorOwned, reloadSupport });
  const registryAuthority = buildSurfaceRegistryAuthority({ surface, declarationSiteId, registryPath });
  const entrypoint = surface.runtime_binding?.entrypoint ?? transport.args?.[0] ?? null;
  const runtimeAuthorityConformance = buildRuntimeAuthorityConformance({
    instance,
    registryAuthority,
    siteRoot,
    staleEvidence,
  });
  const carrierStatus = buildCarrierSupervisorStatus({
    surface,
    instance,
    serverName,
    entrypoint,
    transportType,
    runtimeKind,
    restartRequest,
    staleEvidence,
    sourceFreshness,
    ownership,
    reloadSupport,
    supervisorOwned,
    runtimeAuthorityConformance,
  });
  const carrierSessionBinding = classifyCarrierSessionBinding({
    instance,
    restartSemantics: ownership.restart_semantics,
    surface,
  });
  const startupDisposition = classifyStartupDisposition({
    carrierStatus,
    carrierSessionBinding,
    restartSemantics: ownership.restart_semantics,
    supervisorOwned,
    reloadSupport,
  });
  const criticalNonconformance = buildCriticalRestartNonconformance({
    carrierStatus,
    carrierSessionOwner: instance?.carrier_session_owner ?? 'carrier_session_unknown',
    carrierSessionBinding,
    restartSemantics: ownership.restart_semantics,
    startupDisposition,
  });

  return {
    schema: MCP_RUNTIME_INSTANCE_REGISTRY_SCHEMA,
    status: staleEvidence ? 'stale_or_missing_evidence' : 'observed',
    surface_id: surface.surface_id,
    server_name: serverName,
    display_name: surface.display_name ?? null,
    entrypoint,
    desired_state: carrierStatus.desired_state,
    observed_state: carrierStatus.observed_state,
    carrier_session_owner: instance?.carrier_session_owner ?? 'carrier_session_unknown',
    carrier_session_id: instance?.carrier_session_id ?? instance?.process_identity_evidence?.carrier_session_id ?? null,
    parent_carrier_session_ref: instance?.parent_carrier_session_ref ?? instance?.process_identity_evidence?.parent_carrier_session_ref ?? null,
    carrier_session_binding: carrierSessionBinding,
    carrier_owner: carrierStatus.carrier_owner,
    self_restart_supported: carrierStatus.self_restart_supported,
    process_identity_evidence: instance?.process_identity_evidence ?? null,
    transport: {
      type: transportType,
      runtime_kind: runtimeKind,
      command: transport.command ?? null,
      args: Array.isArray(transport.args) ? transport.args : [],
    },
    reload_support: reloadSupport,
    supervisor_owned: supervisorOwned,
    restart_semantics: ownership.restart_semantics,
    startup_disposition: startupDisposition,
    runtime_state_path: instance?.runtime_state_path ?? join(pcRoot, 'runtime', 'mcp-runtime-instances.json'),
    freshness_evidence_path: evidencePath,
    last_observed_at: lastObservedAt,
    observation_freshness: staleEvidence ? (lastObservedAt ? 'stale' : 'missing') : 'fresh',
    evidence_age_ms: evidenceAge,
    restart_request: restartRequest,
    runtime: carrierStatus.runtime,
    source_freshness: carrierStatus.source_freshness,
    missing_carrier_action: carrierStatus.missing_carrier_action,
    critical_nonconformance: criticalNonconformance,
    verification: carrierStatus.verification,
    carrier_supervisor_status: carrierStatus,
    refusal_for_restart_mutation: ownership.refusal_for_restart_mutation,
    registry_authority: registryAuthority,
    runtime_authority_conformance: runtimeAuthorityConformance,
  };
}

function buildSiteRegistryAuthority({ declarationSiteId, declarationPath, registryPath }) {
  return {
    schema: 'narada.site.mcp_registry_authority.v0',
    owning_site: declarationSiteId,
    owning_site_locus: declarationSiteId ?? NARADA_USER_SITE_LOCUS,
    declared_site_id: declarationSiteId,
    pc_runtime_locus: NARADA_PC_SITE_LOCUS,
    authority_scope: 'site_local_mcp_registry',
    declaration_source: declarationPath,
    substrate_inventory_scope: 'pc_runtime_advisory_plumbing',
    ordinary_cross_site_boundary: 'postal_admitted_envelope_only',
    allowed_postal_kinds: ['capability_announcement', 'health_summary', 'restart_request', 'observation', 'handoff', 'blocker'],
    runtime_registry_path: registryPath,
    rule: 'This registry is authority for the owning Site declared in .narada/capabilities/mcp-surfaces.json. PC runtime inventory supplies advisory process evidence, not cross-Site readiness authority.',
  };
}

function buildSurfaceRegistryAuthority({ surface, declarationSiteId, registryPath }) {
  const owningSite = surface.runtime_binding?.owner_site_id ?? declarationSiteId ?? null;
  const owningSiteLocus = owningSite ?? null;
  const declarationSiteLocus = declarationSiteId ?? null;
  const localAuthority = Boolean(declarationSiteLocus) && owningSiteLocus === declarationSiteLocus;
  return {
    schema: 'narada.site.mcp_surface_registry_authority.v0',
    owning_site: owningSite,
    owning_site_locus: owningSiteLocus,
    declaration_site: declarationSiteId,
    declaration_site_locus: declarationSiteLocus,
    pc_runtime_locus: NARADA_PC_SITE_LOCUS,
    authority_scope: localAuthority ? 'local_site_runtime_readiness' : 'foreign_site_status_advisory',
    substrate_inventory_scope: 'pc_runtime_advisory_plumbing',
    declaration_source: '.narada/capabilities/mcp-surfaces.json',
    runtime_registry_path: registryPath,
    pc_locus_state: true,
    raw_command_input_allowed: false,
    local_startup_blocking_allowed: localAuthority,
    foreign_status_requires_admitted_envelope: !localAuthority,
    postal_route_required: !localAuthority,
    allowed_postal_kinds: ['capability_announcement', 'health_summary', 'restart_request', 'observation', 'handoff', 'blocker'],
  };
}

function buildCarrierSupervisorStatus({
  surface,
  instance,
  serverName,
  entrypoint,
  transportType,
  runtimeKind,
  restartRequest,
  staleEvidence,
  sourceFreshness,
  ownership,
  reloadSupport,
  supervisorOwned,
  runtimeAuthorityConformance,
}) {
  const processEvidence = instance?.process_identity_evidence ?? {};
  const runtime = {
    pid: processEvidence.pid ?? instance?.pid ?? null,
    booted_at: processEvidence.booted_at ?? instance?.booted_at ?? null,
    source_newer_than_baseline: sourceFreshness.source_newer_than_baseline,
    source_digest_changed: sourceFreshness.source_digest_changed,
    freshness_basis: sourceFreshness.freshness_basis,
  };
  const restartState = normalizeRestartRequestState(restartRequest);
  const verification = normalizeVerification(instance?.verification, restartState, staleEvidence);
  const observedState = classifyObservedState({ restartState, staleEvidence, verification, runtime });
  const missingCarrierAction = classifyMissingCarrierAction({ restartState, ownership, verification });
  const carrierSessionBinding = classifyCarrierSessionBinding({
    instance,
    restartSemantics: ownership.restart_semantics,
    surface,
  });
  const selfRestartSupported = reloadSupport.carrier_reload_supported === true || reloadSupport.reconnect_supported === true;

  return {
    schema: MCP_SURFACE_CARRIER_SUPERVISOR_STATUS_SCHEMA,
    surface_id: surface.surface_id,
    server_name: serverName,
    entrypoint,
    transport: transportType,
    desired_state: surface.desired_state ?? 'live_surface_verified',
    observed_state: observedState,
    carrier_owner: instance?.carrier_session_owner ?? 'carrier_session_unknown',
    carrier_session_id: carrierSessionBinding.carrier_session_id,
    parent_carrier_session_ref: carrierSessionBinding.parent_carrier_session_ref,
    carrier_session_binding: carrierSessionBinding,
    startup_disposition: classifyStartupDisposition({
      carrierStatus: {
        restart_request: restartRequest,
        source_freshness: sourceFreshness,
        verification,
        runtime,
        self_restart_supported: selfRestartSupported,
      },
      carrierSessionBinding,
      restartSemantics: ownership.restart_semantics,
      supervisorOwned,
      reloadSupport,
    }),
    self_restart_supported: selfRestartSupported,
    restart_request: restartRequest,
    runtime,
    source_freshness: sourceFreshness,
    verification,
    missing_carrier_action: missingCarrierAction,
    critical_nonconformance: buildCriticalRestartNonconformance({
      carrierStatus: {
        restart_request: restartRequest,
        source_freshness: sourceFreshness,
        verification,
        runtime,
        self_restart_supported: selfRestartSupported,
      },
      carrierSessionOwner: instance?.carrier_session_owner ?? 'carrier_session_unknown',
      carrierSessionBinding,
      restartSemantics: ownership.restart_semantics,
    }),
    runtime_authority_conformance: runtimeAuthorityConformance,
    refusals: buildSupervisorRefusals({ transportType, runtimeKind, ownership, restartState }),
  };
}

function buildRuntimeAuthorityConformance({ instance, registryAuthority, siteRoot, staleEvidence }) {
  const processEvidence = instance?.process_identity_evidence ?? {};
  const evidenceSiteRoot = processEvidence.site_root ?? null;
  const carrierSessionOwner = instance?.carrier_session_owner ?? processEvidence.agent_id ?? null;
  const expectedSiteIds = expectedAuthoritySiteIds(registryAuthority);
  const siteRootStatus = classifyEvidenceSiteRoot({
    evidenceSiteRoot,
    expectedSiteRoot: siteRoot,
  });
  const carrierOwnerStatus = classifyCarrierSessionOwner({
    carrierSessionOwner,
    expectedSiteIds,
  });
  const mismatches = [
    ...(siteRootStatus.status === 'mismatch' ? ['process_identity_evidence.site_root'] : []),
    ...(carrierOwnerStatus.status === 'mismatch' ? ['carrier_session_owner'] : []),
  ];
  const status = mismatches.length === 0
    ? 'conformant_or_unproven'
    : (staleEvidence ? 'stale_historical_authority_mismatch' : 'runtime_authority_mismatch');
  return {
    schema: 'narada.pc_runtime.mcp_runtime_authority_conformance.v0',
    status,
    mismatches,
    expected_site_ids: expectedSiteIds,
    declared_owning_site_locus: registryAuthority?.owning_site_locus ?? null,
    declaration_site_locus: registryAuthority?.declaration_site_locus ?? null,
    site_root: siteRootStatus,
    carrier_session_owner: carrierOwnerStatus,
    guard: {
      startup_readiness_blocking: status !== 'conformant_or_unproven',
      reason: status === 'conformant_or_unproven'
        ? null
        : 'pc_runtime_observation_authority_does_not_match_declared_surface_owner',
      required_action: status === 'conformant_or_unproven'
        ? null
        : 'refresh_or_supersede_pc_runtime_registry_observation_before_treating_surface_as_site_local_ready',
    },
  };
}

function expectedAuthoritySiteIds(registryAuthority) {
  return [
    registryAuthority?.owning_site,
    registryAuthority?.owning_site_locus,
    registryAuthority?.declaration_site,
    registryAuthority?.declaration_site_locus,
    registryAuthority?.deprecated_owning_site_shim?.deprecated_name,
    registryAuthority?.deprecated_declaration_site_shim?.deprecated_name,
  ].filter((value, index, values) => typeof value === 'string' && value.length > 0 && values.indexOf(value) === index);
}

function classifyEvidenceSiteRoot({ evidenceSiteRoot, expectedSiteRoot }) {
  if (!evidenceSiteRoot) {
    return {
      status: 'missing',
      evidence_site_root: null,
      expected_site_root: expectedSiteRoot,
    };
  }
  const normalizedEvidence = normalizePathForComparison(evidenceSiteRoot);
  const normalizedExpected = normalizePathForComparison(expectedSiteRoot);
  return {
    status: normalizedEvidence === normalizedExpected ? 'match' : 'mismatch',
    evidence_site_root: evidenceSiteRoot,
    expected_site_root: expectedSiteRoot,
  };
}

function classifyCarrierSessionOwner({ carrierSessionOwner, expectedSiteIds }) {
  if (!carrierSessionOwner || carrierSessionOwner === 'carrier_session_unknown') {
    return {
      status: 'unknown',
      carrier_session_owner: carrierSessionOwner ?? null,
      expected_site_ids: expectedSiteIds,
    };
  }
  const declaredOwnerSite = carrierSessionOwner.split('.')[0];
  const matches = expectedSiteIds.some((siteId) => carrierSessionOwner === siteId || carrierSessionOwner.startsWith(`${siteId}.`));
  return {
    status: matches ? 'match' : 'mismatch',
    carrier_session_owner: carrierSessionOwner,
    declared_owner_site: declaredOwnerSite,
    expected_site_ids: expectedSiteIds,
  };
}

function normalizePathForComparison(path) {
  return resolve(path).replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
}

function classifyStartupDisposition({ carrierStatus, carrierSessionBinding = null, restartSemantics, supervisorOwned = false, reloadSupport = {} }) {
  const pendingRestart = carrierStatus?.restart_request?.state === 'restart_requested'
    || carrierStatus?.source_freshness?.pending_restart === true;
  const liveVerified = carrierStatus?.verification?.live_surface_verified === true;
  const carrierRestarted = carrierStatus?.restart_request?.state === 'carrier_restarted';
  if (isNoRequestFreshnessMarkerContradicted({ carrierStatus, carrierSessionBinding })) {
    return 'already_refreshed_acknowledgeable';
  }
  if (isRestartRequestMarkerContradictedByLiveBoot({ carrierStatus, carrierSessionBinding })) {
    return 'already_refreshed_acknowledgeable';
  }
  if (!pendingRestart && (liveVerified || carrierRestarted)) return 'already_refreshed_acknowledgeable';
  if (supervisorOwned === true && (reloadSupport.reconnect_supported === true || reloadSupport.carrier_reload_supported === true)) {
    return 'restartable_by_supervisor';
  }
  if (carrierSessionBinding?.status === 'legacy_unbound') return 'legacy_unbound_carrier_session';
  if (carrierSessionBinding?.status === 'terminal_missing_embodiment_authority') {
    return restartSemantics === 'carrier_session_restart_required'
      ? 'terminal_blocked_missing_parent_carrier_restart_handle'
      : 'terminal_blocked_missing_embodiment_authority';
  }
  const restartHandle = carrierSessionBinding?.record_summary?.restart_handle;
  if (restartSemantics === 'carrier_session_restart_required') {
    if (restartHandle && restartHandle.class && restartHandle.class !== 'missing_restart_handle' && restartHandle.class !== 'not_restartable') {
      return 'operator_restart_required_with_handle';
    }
    return 'terminal_blocked_missing_parent_carrier_restart_handle';
  }
  if (pendingRestart) return 'terminal_blocked_missing_embodiment_authority';
  return 'already_refreshed_acknowledgeable';
}

function buildCriticalRestartNonconformance({ carrierStatus, carrierSessionOwner, carrierSessionBinding = null, restartSemantics, startupDisposition = null }) {
  const pendingRestart = carrierStatus?.restart_request?.state === 'restart_requested'
    || carrierStatus?.source_freshness?.pending_restart === true;
  if (isNoRequestFreshnessMarkerContradicted({ carrierStatus, carrierSessionBinding })) return null;
  if (isRestartRequestMarkerContradictedByLiveBoot({ carrierStatus, carrierSessionBinding })) return null;
  const carrierUnknown = !carrierSessionOwner || carrierSessionOwner === 'carrier_session_unknown';
  const missingCarrierSession = carrierSessionBinding?.status === 'terminal_missing_embodiment_authority'
    || carrierSessionBinding?.status === 'legacy_unbound';
  const restartUnproven = carrierStatus?.self_restart_supported !== true
    || restartSemantics === 'carrier_session_restart_required'
    || carrierUnknown
    || missingCarrierSession;
  if (!pendingRestart || !restartUnproven) return null;
  return {
    schema: 'narada.pc_runtime.mcp_restart_critical_nonconformance.v0',
    severity: 'critical',
    kind: 'mcp_restart_capability_and_startup_staleness',
    summary: 'Pending MCP restart lacks proven PC-locus carrier evidence/restart capability; startup must treat this as critical nonconformance.',
    mandatory_requirements: [
      'Carrier sessions must register enough PC-locus runtime evidence for restart coordination to act.',
      'Startup/hydration must treat carrier_session_unknown plus pending_restart as critical nonconformance until live disposition is proven.',
    ],
    carrier_session_owner: carrierSessionOwner,
    carrier_session_binding: carrierSessionBinding,
    restart_semantics: restartSemantics,
    startup_disposition: startupDisposition,
  };
}

function isNoRequestFreshnessMarkerContradicted({ carrierStatus, carrierSessionBinding = null }) {
  if (carrierStatus?.restart_request?.state !== 'no_restart_request') return false;
  if (carrierStatus?.source_freshness?.pending_restart !== true) return false;
  if (carrierStatus?.verification?.live_surface_verified !== true) return false;
  return hasParentCarrierSessionEvidence(carrierSessionBinding);
}

function isRestartRequestMarkerContradictedByLiveBoot({ carrierStatus, carrierSessionBinding = null }) {
  if (carrierStatus?.restart_request?.state !== 'restart_requested') return false;
  if (carrierStatus?.verification?.live_surface_verified !== true) return false;
  if (!hasParentCarrierSessionEvidence(carrierSessionBinding)) return false;
  const requestedAt = Date.parse(firstString(
    carrierStatus.restart_request?.requested_at,
    carrierStatus.restart_request?.payload?.requested_at,
    carrierStatus.restart_request?.created_at,
  ) ?? '');
  const bootedAt = Date.parse(firstString(
    carrierStatus.runtime?.booted_at,
    carrierStatus.process_identity_evidence?.booted_at,
  ) ?? '');
  return Number.isFinite(requestedAt) && Number.isFinite(bootedAt) && bootedAt >= requestedAt;
}

function hasParentCarrierSessionEvidence(carrierSessionBinding) {
  if (!carrierSessionBinding || typeof carrierSessionBinding !== 'object') return false;
  if (carrierSessionBinding.status === 'bound_to_parent_carrier_session') return true;
  if (carrierSessionBinding.parent_carrier_session_ref?.record_status === 'found') return true;
  const restartHandle = carrierSessionBinding.record_summary?.restart_handle;
  return Boolean(restartHandle?.handle || restartHandle?.class);
}

function classifyCarrierSessionBinding({ instance, restartSemantics, surface }) {
  const inheritedId = instance?.carrier_session_id ?? instance?.process_identity_evidence?.carrier_session_id ?? null;
  const parentRef = instance?.parent_carrier_session_ref ?? instance?.process_identity_evidence?.parent_carrier_session_ref ?? null;
  const recordedBinding = instance?.carrier_session_binding && typeof instance.carrier_session_binding === 'object'
    ? instance.carrier_session_binding
    : null;
  const criticalSurface = restartSemantics === 'carrier_session_restart_required'
    || surface?.runtime_binding?.transport?.type === 'stdio'
    || surface?.runtime_binding?.runtime_kind?.includes?.('stdio');
  if (inheritedId) {
    return {
      schema: 'narada.pc_runtime.mcp_child_carrier_session_binding.v0',
      status: recordedBinding?.status ?? 'bound_to_parent_carrier_session',
      carrier_session_id: inheritedId,
      parent_carrier_session_ref: parentRef,
      verification_source: recordedBinding?.verification_source ?? 'mcp_server_inherited_carrier_environment',
      record_summary: recordedBinding?.record_summary ?? null,
      migration_guidance: null,
    };
  }
  const status = criticalSurface ? 'terminal_missing_embodiment_authority' : 'legacy_unbound';
  return {
    schema: 'narada.pc_runtime.mcp_child_carrier_session_binding.v0',
    status,
    carrier_session_id: null,
    parent_carrier_session_ref: null,
    verification_source: recordedBinding?.verification_source ?? 'mcp_runtime_registry',
    reason: criticalSurface
      ? 'Critical stdio child surface lacks inherited NARADA_CARRIER_SESSION_ID, so restart authority cannot join to a parent carrier session.'
      : 'MCP child surface lacks inherited carrier session id; classified as legacy unbound rather than inferred.',
    migration_guidance: buildCarrierSessionMigrationGuidance({ status, criticalSurface }),
  };
}

function buildCarrierSessionMigrationGuidance({ status, criticalSurface }) {
  return {
    schema: 'narada.pc_runtime.carrier_session_migration_guidance.v0',
    status,
    authority_missing: 'NARADA_CARRIER_SESSION_ID',
    allowed_observation_scope: criticalSurface ? 'blocked_for_normal_startup_readiness' : 'observation_only_degraded',
    migration_path: 'relaunch_through_registered_agent_start_path_to_inherit_NARADA_CARRIER_SESSION_ID',
    operator_guidance: criticalSurface
      ? 'Relaunch this MCP carrier through the registered Narada agent-start path so the child inherits a verified carrier session id before restart acknowledgement.'
      : 'Legacy unbound observation may continue as degraded evidence, but restart or readiness claims require relaunch through a registered carrier session.',
    forbidden_inference_sources: ['pid', 'window_title', 'window_order', 'user_memory'],
  };
}

function normalizeRestartRequestState(restartRequest) {
  if (restartRequest?.state) return restartRequest.state;
  return 'no_restart_request';
}

function normalizeVerification(value, restartState, staleEvidence) {
  const freshOneShotVerified = value?.fresh_one_shot_verified;
  const liveSurfaceVerified = value?.live_surface_verified;
  return {
    fresh_one_shot_verified: typeof freshOneShotVerified === 'boolean' ? freshOneShotVerified : null,
    live_surface_verified: typeof liveSurfaceVerified === 'boolean'
      ? liveSurfaceVerified
      : (restartState === 'carrier_restarted' && !staleEvidence ? null : false),
    carrier_restarted: restartState === 'carrier_restarted',
    evidence_refs: Array.isArray(value?.evidence_refs) ? value.evidence_refs : [],
  };
}

function classifyObservedState({ restartState, staleEvidence, verification, runtime }) {
  if (verification.live_surface_verified === true) return 'live_surface_verified';
  if (restartState === 'carrier_restarted') return 'carrier_restarted';
  if (restartState === 'restart_requested') return 'restart_requested';
  const sourceChanged = runtime.source_digest_changed
    ?? (runtime.freshness_basis === 'legacy_mtime' ? runtime.source_newer_than_baseline : false);
  if (staleEvidence || sourceChanged === true) return 'live_surface_stale';
  if (verification.fresh_one_shot_verified === true) return 'fresh_one_shot_verified';
  return 'implemented';
}

function classifyMissingCarrierAction({ restartState, ownership, verification }) {
  if (verification.live_surface_verified === true) return null;
  if (restartState === 'restart_requested' && ownership.restart_semantics === 'carrier_session_restart_required') {
    return 'external_stdio_mcp_restart_required';
  }
  if (restartState === 'carrier_restarted' && verification.live_surface_verified !== true) {
    return 'live_surface_verification_required';
  }
  if (ownership.restart_semantics === 'supervisor_owned_reconnectable_restart_possible') {
    return 'pc_supervisor_restart_or_verify_required';
  }
  return 'freshness_observation_required';
}

function buildSupervisorRefusals({ transportType, runtimeKind, ownership, restartState }) {
  const refusals = ['direct_native_shell_path_refused'];
  if (transportType === 'stdio' || runtimeKind?.includes('stdio')) refusals.push('self_restart_over_stdio');
  if (restartState === 'restart_requested') refusals.push('treat_restart_request_as_restart');
  if (ownership.restart_semantics === 'carrier_session_restart_required') refusals.push('carrier_mutation_from_read_only_status_surface');
  return refusals;
}

function normalizeSourceFreshness({ instance, surface, staleEvidence, restartRequest }) {
  const source = instance?.source ?? {};
  const baseline = instance?.source_baseline ?? instance?.baseline ?? source.baseline ?? {};
  const currentMaxMtime = firstFiniteNumber(
    instance?.source_epoch,
    instance?.source_max_mtime,
    source.source_epoch,
    source.current_max_mtime,
    source.max_mtime,
  );
  const baselineMtime = firstFiniteNumber(
    instance?.baseline_mtime,
    baseline.baseline_mtime,
    baseline.source_epoch,
    source.baseline_mtime,
  );
  const currentDigest = firstString(
    instance?.source_digest,
    source.source_digest,
    instance?.source_freshness?.source_digest,
  );
  const baselineDigest = firstString(
    instance?.baseline_source_digest,
    baseline.source_digest,
    instance?.source_freshness?.baseline_source_digest,
  );
  const sourceDigestChanged = sourceDigestChangedSinceBaseline({ instance, currentDigest, baselineDigest });
  const sourceNewer = sourceNewerThanBaseline(instance, currentMaxMtime, baselineMtime);
  const restartState = normalizeRestartRequestState(restartRequest);
  const authoritativeSourceChanged = sourceDigestChanged ?? sourceNewer;
  return {
    source_epoch: currentMaxMtime,
    source_max_mtime: currentMaxMtime,
    baseline_mtime: baselineMtime,
    baseline_recorded_at: instance?.baseline_recorded_at ?? baseline.recorded_at ?? baseline.acknowledged_at ?? baseline.requested_at ?? null,
    source_digest: currentDigest,
    baseline_source_digest: baselineDigest,
    source_digest_algorithm: firstString(
      instance?.source_digest_algorithm,
      source.source_digest_algorithm,
      baseline.source_digest_algorithm,
      instance?.source_freshness?.source_digest_algorithm,
    ) ?? null,
    source_digest_changed: sourceDigestChanged,
    freshness_basis: sourceDigestChanged === null ? 'legacy_mtime' : 'source_digest',
    source_newer_than_baseline: sourceNewer,
    pending_restart: restartState === 'restart_requested' || authoritativeSourceChanged === true,
    watched_path_summary: instance?.watched_path_summary ?? source.watched_path_summary ?? null,
    freshness_evidence_path: instance?.freshness_evidence_path ?? surface.evidence?.path ?? null,
    observation_freshness: staleEvidence ? 'stale_or_missing' : 'fresh',
  };
}

function sourceDigestChangedSinceBaseline({ instance, currentDigest = null, baselineDigest = null }) {
  if (typeof instance?.source_digest_changed === 'boolean') return instance.source_digest_changed;
  if (typeof instance?.runtime?.source_digest_changed === 'boolean') return instance.runtime.source_digest_changed;
  if (typeof instance?.source?.source_digest_changed === 'boolean') return instance.source.source_digest_changed;
  if (typeof instance?.source_freshness?.source_digest_changed === 'boolean') return instance.source_freshness.source_digest_changed;
  if (currentDigest && baselineDigest) return currentDigest !== baselineDigest;
  return null;
}

function sourceNewerThanBaseline(instance, currentMaxMtime = null, baselineMtime = null) {
  if (typeof instance?.source_newer_than_baseline === 'boolean') return instance.source_newer_than_baseline;
  if (typeof instance?.runtime?.source_newer_than_baseline === 'boolean') return instance.runtime.source_newer_than_baseline;
  if (typeof instance?.source?.source_newer_than_baseline === 'boolean') return instance.source.source_newer_than_baseline;
  if (Number.isFinite(currentMaxMtime) && Number.isFinite(baselineMtime)) return currentMaxMtime > baselineMtime;
  return null;
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.length > 0) ?? null;
}

function isAffectedByRestartRequest(surface, staleEpoch) {
  if (surface.restart_request?.state === 'restart_requested') return true;
  if (surface.source_freshness?.pending_restart === true) return true;
  if (surface.observation_freshness === 'stale') return true;
  if (surface.observation_freshness === 'missing') return true;
  const epoch = surface.source_freshness?.source_epoch;
  const threshold = firstFiniteNumber(staleEpoch);
  return Number.isFinite(epoch) && Number.isFinite(threshold) && epoch >= threshold;
}

function coordinateSurfaceRestart({ surface, dryRun, mutatingAuthorized, requestedAt, requestedBy, staleEpoch }) {
  if (surface.registry_authority?.local_startup_blocking_allowed === false) {
    return {
      surface_id: surface.surface_id,
      server_name: surface.server_name,
      status: 'foreign_site_status_requires_postal_route',
      required_action: 'submit_postal_restart_request_or_handoff_to_owning_site',
      critical_nonconformance: null,
      terminal_evidence: {
        schema: 'narada.pc_runtime.mcp_restart_terminal_evidence.v0',
        recorded_at: requestedAt,
        requested_by: requestedBy ?? null,
        surface_id: surface.surface_id,
        server_name: surface.server_name,
        status: 'foreign_site_status_requires_postal_route',
        severity: 'advisory',
        reason: 'foreign_mcp_surface_registry_status_is_not_local_restart_authority',
        authority_owner: surface.registry_authority.owning_site ?? 'foreign_site',
        required_external_action: 'submit_postal_restart_request_or_handoff_to_owning_site',
        terminal_blocker: false,
        registry_authority: surface.registry_authority,
        allowed_postal_kinds: surface.registry_authority.allowed_postal_kinds ?? ['restart_request', 'handoff', 'blocker'],
      },
    };
  }
  const baseEvidence = {
    schema: 'narada.pc_runtime.mcp_restart_terminal_evidence.v0',
    recorded_at: requestedAt,
    requested_by: requestedBy ?? null,
    surface_id: surface.surface_id,
    server_name: surface.server_name,
    carrier_session_owner: surface.carrier_session_owner,
    carrier_session_id: surface.carrier_session_id ?? null,
    parent_carrier_session_ref: surface.parent_carrier_session_ref ?? null,
    carrier_session_binding: surface.carrier_session_binding ?? null,
    carrier_session_migration_guidance: surface.carrier_session_binding?.migration_guidance ?? null,
    startup_disposition: surface.startup_disposition ?? null,
    pid: surface.runtime?.pid ?? null,
    booted_at: surface.runtime?.booted_at ?? null,
    restart_semantics: surface.restart_semantics,
    source_epoch: surface.source_freshness?.source_epoch ?? null,
    baseline_mtime: surface.source_freshness?.baseline_mtime ?? null,
    stale_epoch: staleEpoch,
  };

  if (surface.startup_disposition === 'terminal_blocked_missing_parent_carrier_restart_handle'
    || surface.startup_disposition === 'terminal_blocked_missing_embodiment_authority'
    || surface.startup_disposition === 'legacy_unbound_carrier_session') {
    return {
      surface_id: surface.surface_id,
      server_name: surface.server_name,
      status: surface.startup_disposition,
      required_action: 'register_or_relaunch_with_carrier_session_authority',
      critical_nonconformance: surface.critical_nonconformance ?? null,
      terminal_evidence: {
        ...baseEvidence,
        status: surface.startup_disposition,
        severity: surface.critical_nonconformance?.severity ?? 'critical',
        reason: 'missing_concrete_parent_carrier_restart_handle',
        authority_owner: 'pc_site_runtime',
        required_external_action: 'register_or_relaunch_with_carrier_session_authority_before_restart_instruction',
        terminal_blocker: true,
        critical_nonconformance: surface.critical_nonconformance ?? null,
      },
    };
  }

  if (surface.restart_semantics === 'carrier_session_restart_required') {
    return {
      surface_id: surface.surface_id,
      server_name: surface.server_name,
      status: 'operator_restart_required_with_handle',
      required_action: 'restart_parent_carrier_session_using_recorded_handle',
      critical_nonconformance: surface.critical_nonconformance ?? null,
      terminal_evidence: {
        ...baseEvidence,
        status: 'operator_restart_required_with_handle',
        severity: surface.critical_nonconformance?.severity ?? 'critical',
        reason: 'stdio_child_cannot_restart_itself',
        authority_owner: 'operator_or_parent_carrier_session',
        required_external_action: 'restart_parent_carrier_session_using_recorded_handle_then_rehydrate',
        terminal_blocker: true,
        critical_nonconformance: surface.critical_nonconformance ?? null,
      },
    };
  }

  if (surface.self_restart_supported !== true) {
    return {
      surface_id: surface.surface_id,
      server_name: surface.server_name,
      status: 'failed',
      reason: 'restart_capability_unproven',
      terminal_evidence: {
        ...baseEvidence,
        status: 'failed',
        reason: 'restart_capability_unproven',
        authority_owner: 'pc_site_runtime',
        required_external_action: 'register_pc_locus_carrier_runtime_evidence_or_declare_external_restart_owner',
        terminal_blocker: true,
      },
    };
  }

  if (dryRun === true || mutatingAuthorized !== 'pc_runtime_restart_stub_authorized') {
    return {
      surface_id: surface.surface_id,
      server_name: surface.server_name,
      status: 'skipped',
      reason: dryRun === true ? 'dry_run' : 'missing_mutating_authority',
      terminal_evidence: {
        ...baseEvidence,
        status: 'skipped',
        reason: dryRun === true ? 'dry_run' : 'missing_mutating_authority',
      },
    };
  }

  return {
    surface_id: surface.surface_id,
    server_name: surface.server_name,
    status: 'restarted',
    action: 'stubbed_restart_admitted_no_process_mutation',
    terminal_evidence: {
      ...baseEvidence,
      status: 'restarted',
      action: 'stubbed_restart_admitted_no_process_mutation',
      note: 'First coordination slice records admitted restart terminal evidence without killing or spawning processes.',
    },
  };
}

function countCoordinationStatuses(entries) {
  const counts = {
    restarted: 0,
    skipped: 0,
    failed: 0,
    external_carrier_required: 0,
    operator_restart_required_with_handle: 0,
    terminal_blocked_missing_parent_carrier_restart_handle: 0,
    terminal_blocked_missing_embodiment_authority: 0,
    legacy_unbound_carrier_session: 0,
  };
  for (const entry of entries) {
    if (Object.hasOwn(counts, entry.status)) counts[entry.status] += 1;
  }
  return counts;
}

function buildHostFreshnessProjection(knownSurfaces) {
  const counts = { fresh: 0, stale: 0, missing: 0, pending_restart: 0, restart_capable: 0, runtime_authority_mismatch: 0 };
  const instances = knownSurfaces.map((surface) => {
    if (surface.observation_freshness === 'fresh') counts.fresh += 1;
    if (surface.observation_freshness === 'stale') counts.stale += 1;
    if (surface.observation_freshness === 'missing') counts.missing += 1;
    if (surface.source_freshness?.pending_restart === true || surface.restart_request?.state === 'restart_requested') counts.pending_restart += 1;
    if (surface.self_restart_supported === true) counts.restart_capable += 1;
    if (surface.runtime_authority_conformance?.guard?.startup_readiness_blocking === true) counts.runtime_authority_mismatch += 1;
    return {
      surface_id: surface.surface_id,
      server_name: surface.server_name,
      observed_state: surface.observed_state,
      observation_freshness: surface.observation_freshness,
      carrier_session_owner: surface.carrier_session_owner,
      carrier_session_id: surface.carrier_session_id ?? null,
      carrier_session_binding: surface.carrier_session_binding ?? null,
      startup_disposition: surface.startup_disposition ?? null,
      restart_semantics: surface.restart_semantics,
      self_restart_supported: surface.self_restart_supported,
      source_freshness: surface.source_freshness,
      runtime: surface.runtime,
      restart_request_state: surface.restart_request?.state ?? 'unknown',
      missing_carrier_action: surface.missing_carrier_action,
      critical_nonconformance: surface.critical_nonconformance ?? null,
      runtime_authority_conformance: surface.runtime_authority_conformance ?? null,
    };
  });
  return {
    schema: 'narada.pc_runtime.mcp_host_freshness_projection.v0',
    pc_runtime_locus: NARADA_PC_SITE_LOCUS,
    user_site_locus: NARADA_USER_SITE_LOCUS,
    instance_count: knownSurfaces.length,
    counts,
    instances,
  };
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function refusedTarget({ target, declarationPath, registryPath, knownSurfaces }) {
  const looksLikeCommand = /[\\/\s]|\.mjs$|\.ps1$|\.exe$/i.test(String(target));
  return {
    schema: MCP_RUNTIME_INSTANCE_STATUS_SCHEMA,
    status: 'refused',
    reason: looksLikeCommand ? 'target_not_in_mcp_surface_registry' : 'unknown_mcp_surface',
    target,
    supervisor_locus: NARADA_PC_SITE_LOCUS,
    pc_runtime_locus: NARADA_PC_SITE_LOCUS,
    user_site_locus: NARADA_USER_SITE_LOCUS,
    declaration_path: declarationPath,
    registry_path: registryPath,
    known_surface_ids: knownSurfaces.map((surface) => surface.surface_id),
  };
}

function findRuntimeInstance(runtimeRegistry, surfaceId) {
  const instances = Array.isArray(runtimeRegistry?.instances) ? runtimeRegistry.instances : [];
  return instances.find((entry) => entry?.surface_id === surfaceId) ?? null;
}

function deriveServerName(surface) {
  if (surface.server_name) return surface.server_name;
  const generatedPath = surface.client_config?.generated_path;
  if (generatedPath) return generatedPath.split(/[\\/]/).pop()?.replace(/\.json$/i, '') ?? surface.surface_id;
  return surface.surface_id;
}

function normalizeReloadSupport(value, transportType, supervisorOwned) {
  if (value && typeof value === 'object') {
    return {
      carrier_reload_supported: value.carrier_reload_supported === true,
      reconnect_supported: value.reconnect_supported === true,
      source: value.source ?? 'pc_runtime_registry',
    };
  }
  return {
    carrier_reload_supported: false,
    reconnect_supported: supervisorOwned && transportType !== 'stdio',
    source: 'default_conservative_classification',
  };
}

function classifyOwnership({ transportType, runtimeKind, supervisorOwned, reloadSupport }) {
  if (supervisorOwned && reloadSupport.reconnect_supported) {
    return {
      restart_semantics: 'supervisor_owned_reconnectable_restart_possible',
      refusal_for_restart_mutation: null,
    };
  }
  if (reloadSupport.carrier_reload_supported) {
    return {
      restart_semantics: 'carrier_supported_reload_possible',
      refusal_for_restart_mutation: null,
    };
  }
  if (transportType === 'stdio' || runtimeKind?.includes('stdio')) {
    return {
      restart_semantics: 'carrier_session_restart_required',
      refusal_for_restart_mutation: {
        status: 'deferred_to_carrier',
        reason: 'carrier_session_restart_required',
        can_self_restart: false,
      },
    };
  }
  return {
    restart_semantics: 'runtime_support_unknown',
    refusal_for_restart_mutation: {
      status: 'refused',
      reason: 'runtime_reload_support_unproven',
      can_self_restart: false,
    },
  };
}

function readRestartRequestForSurface(surface, siteRoot) {
  const surfaceId = surface.surface_id ?? '';
  const candidates = [];
  if (surfaceId === 'task-lifecycle-mcp.local') candidates.push('.ai/tmp/task-lifecycle-restart-request.json');
  if (surfaceId === 'agent-context-mcp.local') candidates.push('.ai/tmp/agent-context-restart-request.json');
  const requests = candidates.map((path) => ({ path, payload: readOptionalJson(join(siteRoot, path)) })).filter((entry) => entry.payload);
  if (requests.length === 0) return { state: 'no_restart_request', paths_checked: candidates };
  const latest = requests[requests.length - 1];
  return {
    state: 'restart_requested',
    path: latest.path,
    payload: latest.payload,
  };
}

function registryNotes({ runtimeRegistry, knownSurfaces }) {
  const notes = [];
  if (!runtimeRegistry) notes.push('PC runtime instance registry evidence file is missing; declared surfaces are classified conservatively.');
  if (knownSurfaces.some((surface) => surface.restart_semantics === 'carrier_session_restart_required')) {
    notes.push('Carrier-owned stdio MCP servers require carrier/session restart unless reload or reconnect support is proven by PC runtime evidence.');
  }
  if (knownSurfaces.some((surface) => surface.observation_freshness !== 'fresh')) {
    notes.push('One or more surfaces have stale or missing PC runtime observation evidence.');
  }
  if (knownSurfaces.some((surface) => surface.runtime_authority_conformance?.guard?.startup_readiness_blocking === true)) {
    notes.push('One or more surfaces have PC runtime evidence whose site root or carrier owner does not match the declared surface authority.');
  }
  return notes;
}

function ageEvidence(lastObservedAt, now) {
  if (!lastObservedAt) return null;
  const observed = Date.parse(lastObservedAt);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return null;
  return Math.max(0, current - observed);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function readOptionalJson(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) return null;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    return {
      status: 'unreadable',
      path: resolved,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
