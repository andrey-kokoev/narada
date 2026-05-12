#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CARRIER_SCHEMA = 'narada.site_live_carrier.result.v0';
const LOCAL_DB_CARRIER_ID = 'site_local_db_init';
const STORAGE_CARRIER_ID = 'site_local_storage_hydration';
const MCP_REGISTRATION_CARRIER_ID = 'site_mcp_registration_transport';
const WINDOWS_PROFILE_CARRIER_ID = 'windows_profile_site_binding';
const AGENT_CONTEXT_MEMORY_CARRIER_ID = 'agent_context_memory_local_storage';
const SITE_INBOX_CARRIER_ID = 'site_inbox_local_substrate';
const SITE_CONFIG_CARRIER_ID = 'site_config_local_registry';
const SITE_LIFT_CARRIER_ID = 'site_lift_local_adoption';
const LOCAL_DB_SCHEMA_VERSION = 'site-local-db.v0';

const LOCAL_DB_TABLES = [
  'admissions',
  'checkpoints',
  'inbox_index',
  'capability_state',
  'site_metadata',
];

const STORAGE_DIRS = [
  '.narada/runtime',
  '.narada/inbox/exports',
  '.narada/checkpoints',
  '.narada/logs',
  '.narada/mcp-payloads/staging',
  '.narada/hydration',
];

const NON_PORTABLE_CLASSES = [
  '.ai',
  'SQLite databases from another Site',
  'task history',
  'inbox history',
  'checkpoint history',
  'roster runtime',
  'operator-surface runtime state',
  'PC-locus evidence',
  'display/window state',
  'secrets',
];

function siteLocalDbCarrier(options = {}) {
  return runCarrier({
    carrierId: LOCAL_DB_CARRIER_ID,
    mode: normalizeMode(options.mode),
    options,
    planBuilder: buildLocalDbPlan,
    applier: applyLocalDbPlan,
    verifier: verifyLocalDbPlan,
    recoverer: recoverLocalDbPlan,
  });
}

function siteLocalStorageHydrationCarrier(options = {}) {
  return runCarrier({
    carrierId: STORAGE_CARRIER_ID,
    mode: normalizeMode(options.mode),
    options,
    planBuilder: buildStoragePlan,
    applier: applyStoragePlan,
    verifier: verifyStoragePlan,
    recoverer: recoverStoragePlan,
  });
}

function siteMcpRegistrationCarrier(options = {}) {
  return runCarrier({
    carrierId: MCP_REGISTRATION_CARRIER_ID,
    mode: normalizeMode(options.mode),
    options,
    planBuilder: buildMcpRegistrationPlan,
    applier: applyMcpRegistrationPlan,
    verifier: verifyMcpRegistrationPlan,
    recoverer: recoverMcpRegistrationPlan,
  });
}

function windowsProfileSiteBindingCarrier(options = {}) {
  return runCarrier({
    carrierId: WINDOWS_PROFILE_CARRIER_ID,
    mode: normalizeMode(options.mode),
    options,
    planBuilder: buildWindowsProfilePlan,
    applier: applyWindowsProfilePlan,
    verifier: verifyWindowsProfilePlan,
    recoverer: recoverWindowsProfilePlan,
  });
}

function agentContextMemoryLocalStorageCarrier(options = {}) {
  return runCarrier({
    carrierId: AGENT_CONTEXT_MEMORY_CARRIER_ID,
    mode: normalizeMode(options.mode),
    options,
    planBuilder: buildAgentContextMemoryPlan,
    applier: applyAgentContextMemoryPlan,
    verifier: verifyAgentContextMemoryPlan,
    recoverer: recoverAgentContextMemoryPlan,
  });
}

function siteInboxLocalSubstrateCarrier(options = {}) {
  return runCarrier({
    carrierId: SITE_INBOX_CARRIER_ID,
    mode: normalizeMode(options.mode),
    options,
    planBuilder: buildSiteInboxPlan,
    applier: applySiteInboxPlan,
    verifier: verifySiteInboxPlan,
    recoverer: recoverSiteInboxPlan,
  });
}

function siteConfigLocalRegistryCarrier(options = {}) {
  return runCarrier({
    carrierId: SITE_CONFIG_CARRIER_ID,
    mode: normalizeMode(options.mode),
    options,
    planBuilder: buildSiteConfigPlan,
    applier: applySiteConfigPlan,
    verifier: verifySiteConfigPlan,
    recoverer: recoverSiteConfigPlan,
  });
}

function siteLiftLocalAdoptionCarrier(options = {}) {
  return runCarrier({
    carrierId: SITE_LIFT_CARRIER_ID,
    mode: normalizeMode(options.mode),
    options,
    planBuilder: buildSiteLiftPlan,
    applier: applySiteLiftPlan,
    verifier: verifySiteLiftPlan,
    recoverer: recoverSiteLiftPlan,
  });
}

function runCarrier({ carrierId, mode, options, planBuilder, applier, verifier, recoverer }) {
  const context = buildContext(carrierId, mode, options);
  const sharedRefusals = validateSharedContext(context, options);
  const plan = planBuilder(context, options);
  const result = baseResult(context, plan, sharedRefusals);

  if (result.refusals.length > 0) {
    return { ...result, status: 'refused', recovery_hint: recoveryHint(carrierId, result.refusals) };
  }
  if (mode === 'plan') return { ...result, status: 'planned' };
  if (mode === 'verify') return verifier(context, plan, result);
  if (mode === 'recover') return recoverer(context, plan, result);
  if (mode === 'apply' && options.mutation_authorized !== true) {
    return {
      ...result,
      status: 'refused',
      refusals: ['write_authority_missing'],
      recovery_hint: 'Run plan first, then apply only with explicit receiving-Site authority.',
    };
  }
  return applier(context, plan, result);
}

function buildContext(carrierId, mode, options) {
  const targetSiteRoot = normalizePath(requiredOption(options, 'target_site_root'));
  const siteId = requiredOption(options, 'site_id');
  return {
    schema: CARRIER_SCHEMA,
    carrierId,
    mode,
    targetSiteRoot,
    siteId,
    authorityOwner: carrierId === WINDOWS_PROFILE_CARRIER_ID ? 'pc_or_windows_profile_authority' : 'receiving_site',
    authorityBasis: stringOption(options.authority_basis),
    sourceSiteRoot: options.source_site_root ? normalizePath(options.source_site_root) : null,
    paths: carrierPaths(targetSiteRoot),
    options,
  };
}

function buildLocalDbPlan(context) {
  const dbState = inspectJsonFile(context.paths.localDb);
  const compatible = dbState.status === 'missing'
    || (dbState.status === 'json'
      && dbState.value?.site_id === context.siteId
      && dbState.value?.schema_version === LOCAL_DB_SCHEMA_VERSION);
  return {
    planned_mutations: [
      mutationRecord(context.paths.localDb, dbState.status === 'missing' ? 'create' : compatible ? 'ensure_current' : 'refuse'),
      mutationRecord(context.paths.migrationLedger, 'append_idempotent_migration_entry'),
      mutationRecord(context.paths.auditLog, 'append_audit_event'),
    ],
    created_or_changed: [],
    audit_evidence: {
      plan_id: stablePlanId(context, 'local-db'),
      db_path: relativeToTarget(context, context.paths.localDb),
      migration_ledger_path: relativeToTarget(context, context.paths.migrationLedger),
      schema_version: LOCAL_DB_SCHEMA_VERSION,
      tables: LOCAL_DB_TABLES,
      existing_db_status: dbState.status,
    },
    refusals: compatible ? [] : ['existing_db_incompatible_or_belongs_to_another_site'],
  };
}

function applyLocalDbPlan(context, plan, result) {
  if (plan.refusals.length > 0) return refusedFromPlan(result, plan.refusals);
  const before = inspectJsonFile(context.paths.localDb);
  if (before.status === 'missing') {
    writeJsonNew(context.paths.localDb, {
      schema: 'narada.site_local_db.v0',
      schema_version: LOCAL_DB_SCHEMA_VERSION,
      site_id: context.siteId,
      target_site_root: context.targetSiteRoot,
      created_by_carrier: LOCAL_DB_CARRIER_ID,
      tables: Object.fromEntries(LOCAL_DB_TABLES.map((name) => [name, []])),
      migration_ledger: [{ migration: 'create_site_local_db_v0', status: 'applied' }],
    });
    appendJsonl(context.paths.migrationLedger, migrationEvent(context, 'applied'));
  }
  const changed = before.status === 'missing'
    ? [relativeToTarget(context, context.paths.localDb), relativeToTarget(context, context.paths.migrationLedger)]
    : [];
  appendAudit(context, { carrier_id: LOCAL_DB_CARRIER_ID, event: 'apply', status: 'applied', changed });
  const verify = verifyLocalDbPlan(context, plan, result);
  return {
    ...verify,
    status: 'applied',
    created_or_changed: changed,
    audit_evidence: { ...verify.audit_evidence, apply_event: 'site_local_db_apply', audit_log_path: relativeToTarget(context, context.paths.auditLog) },
  };
}

function verifyLocalDbPlan(context, plan, result) {
  const db = inspectJsonFile(context.paths.localDb);
  const ok = db.status === 'json'
    && db.value?.site_id === context.siteId
    && db.value?.target_site_root === context.targetSiteRoot
    && db.value?.schema_version === LOCAL_DB_SCHEMA_VERSION
    && LOCAL_DB_TABLES.every((name) => Array.isArray(db.value?.tables?.[name]));
  return {
    ...result,
    status: ok ? 'verified' : 'refused',
    refusals: ok ? [] : ['target_site_local_db_missing_or_inconsistent'],
    audit_evidence: {
      ...plan.audit_evidence,
      verification: {
        db_exists: db.status === 'json',
        belongs_to_site_id: db.value?.site_id ?? null,
        belongs_to_target_site_root: db.value?.target_site_root ?? null,
        schema_version: db.value?.schema_version ?? null,
        table_count: db.value?.tables ? Object.keys(db.value.tables).length : 0,
      },
    },
    recovery_hint: ok ? null : 'Run site_local_db_init apply under receiving-Site authority or recover to classify partial state.',
  };
}

function recoverLocalDbPlan(context, plan, result) {
  const db = inspectJsonFile(context.paths.localDb);
  const classification = db.status === 'missing'
    ? 'absent'
    : db.status === 'json' && db.value?.site_id === context.siteId && db.value?.schema_version === LOCAL_DB_SCHEMA_VERSION
      ? 'compatible_seed'
      : db.status === 'json'
        ? 'incompatible_state'
        : 'incomplete_seed';
  return {
    ...result,
    status: classification === 'incompatible_state' ? 'refused' : 'recovered',
    recovery_classification: classification,
    recovery_hint: classification === 'compatible_seed' ? 'Run verify; apply is idempotent.' : 'Repair requires a separate explicit repair carrier.',
  };
}

function buildStoragePlan(context, options) {
  const manifest = inspectJsonFile(context.paths.hydrationManifest);
  const refusals = [];
  if (options.db_init_verified !== true) refusals.push('db_init_verification_missing');
  if (options.handoff_as_checkpoint_truth === true) refusals.push('handoff_material_must_remain_pending_orientation');
  if (manifest.status === 'json' && manifest.value?.site_id && manifest.value.site_id !== context.siteId) {
    refusals.push('existing_hydration_manifest_belongs_to_another_site');
  }
  return {
    planned_mutations: [
      ...STORAGE_DIRS.map((item) => mutationRecord(path.join(context.targetSiteRoot, item), 'ensure_directory')),
      ...Object.keys(storageFileContents(context, options)).map((item) => mutationRecord(path.join(context.targetSiteRoot, item), 'ensure_file')),
      mutationRecord(context.paths.auditLog, 'append_audit_event'),
    ],
    created_or_changed: [],
    audit_evidence: {
      plan_id: stablePlanId(context, 'storage'),
      hydration_manifest_path: relativeToTarget(context, context.paths.hydrationManifest),
      handoff_disposition: options.handoff_material
        ? options.handoff_as_checkpoint_truth === true ? 'rejected_checkpoint_truth_request' : 'external_orientation_pending_admission'
        : 'none',
      refused_non_portable_classes: NON_PORTABLE_CLASSES,
    },
    refusals,
  };
}

function applyStoragePlan(context, plan, result) {
  if (plan.refusals.length > 0) return refusedFromPlan(result, plan.refusals);
  const changed = [];
  for (const dir of STORAGE_DIRS) {
    const absolute = path.join(context.targetSiteRoot, dir);
    if (!fs.existsSync(absolute)) changed.push(dir);
    fs.mkdirSync(absolute, { recursive: true });
  }
  for (const [relative, content] of Object.entries(storageFileContents(context, context.options, plan))) {
    const absolute = path.join(context.targetSiteRoot, relative);
    if (!fs.existsSync(absolute)) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content, 'utf8');
      changed.push(relative);
    }
  }
  appendAudit(context, { carrier_id: STORAGE_CARRIER_ID, event: 'apply', status: 'applied', changed });
  const verify = verifyStoragePlan(context, plan, result);
  return {
    ...verify,
    status: 'applied',
    created_or_changed: changed,
    audit_evidence: { ...verify.audit_evidence, apply_event: 'site_local_storage_hydration_apply', audit_log_path: relativeToTarget(context, context.paths.auditLog) },
  };
}

function verifyStoragePlan(context, plan, result) {
  const manifest = inspectJsonFile(context.paths.hydrationManifest);
  const missingDirs = STORAGE_DIRS.filter((item) => !isDirectory(path.join(context.targetSiteRoot, item)));
  const ok = manifest.status === 'json'
    && manifest.value?.site_id === context.siteId
    && manifest.value?.target_site_root === context.targetSiteRoot
    && missingDirs.length === 0;
  return {
    ...result,
    status: ok ? 'verified' : 'refused',
    refusals: ok ? [] : ['target_site_storage_missing_or_inconsistent'],
    audit_evidence: {
      ...plan.audit_evidence,
      verification: {
        manifest_exists: manifest.status === 'json',
        belongs_to_site_id: manifest.value?.site_id ?? null,
        belongs_to_target_site_root: manifest.value?.target_site_root ?? null,
        missing_dirs: missingDirs,
      },
    },
    recovery_hint: ok ? null : 'Run storage hydration apply after DB init verification, or recover to classify partial directories.',
  };
}

function recoverStoragePlan(context, plan, result) {
  const presentDirs = STORAGE_DIRS.filter((item) => isDirectory(path.join(context.targetSiteRoot, item)));
  const manifest = inspectJsonFile(context.paths.hydrationManifest);
  const classification = presentDirs.length === 0 && manifest.status === 'missing'
    ? 'absent'
    : manifest.status === 'json' && manifest.value?.site_id === context.siteId
      ? 'compatible_seed'
      : manifest.status === 'missing'
        ? 'incomplete_seed'
        : 'incompatible_state';
  return {
    ...result,
    status: classification === 'incompatible_state' ? 'refused' : 'recovered',
    recovery_classification: classification,
    audit_evidence: { ...plan.audit_evidence, present_dirs: presentDirs },
    recovery_hint: classification === 'compatible_seed' ? 'Run verify; apply is idempotent.' : 'Repair requires a separate explicit repair carrier.',
  };
}

function buildMcpRegistrationPlan(context, options) {
  const manifest = inspectJsonFile(context.paths.mcpRegistrationManifest);
  const descriptors = normalizeMcpServerDescriptors(options.mcp_server_descriptors);
  const refusals = [];
  if (options.db_verified !== true || options.storage_verified !== true) refusals.push('db_and_storage_verification_required');
  if (!stringOption(options.runtime_target)) refusals.push('runtime_target_required');
  if (descriptors.length === 0) refusals.push('mcp_server_descriptors_required');
  if (manifest.status === 'json' && manifest.value?.site_id && manifest.value.site_id !== context.siteId) {
    refusals.push('existing_mcp_registration_belongs_to_another_site');
  }
  if (descriptors.some((descriptor) => descriptor.grants_broader_authority === true)) {
    refusals.push('mcp_registration_broader_authority_refused');
  }
  if (context.sourceSiteRoot && descriptors.some((descriptor) => descriptor.entrypoint && sameOrParent(context.sourceSiteRoot, normalizePath(descriptor.entrypoint)))) {
    refusals.push('source_site_mcp_entrypoint_reuse_requires_admitted_lift_packet');
  }
  return {
    planned_mutations: [
      mutationRecord(context.paths.mcpRegistrationManifest, manifest.status === 'missing' ? 'create' : 'ensure_current'),
      mutationRecord(context.paths.auditLog, 'append_audit_event'),
    ],
    created_or_changed: [],
    audit_evidence: {
      plan_id: stablePlanId(context, 'mcp-registration'),
      registration_manifest_path: relativeToTarget(context, context.paths.mcpRegistrationManifest),
      runtime_target: stringOption(options.runtime_target),
      server_descriptor_count: descriptors.length,
      restart_required: descriptors.some((descriptor) => (descriptor.transport ?? 'stdio') === 'stdio'),
      stale_live_pressure_recorded_until_verified: true,
    },
    refusals,
  };
}

function applyMcpRegistrationPlan(context, plan, result) {
  if (plan.refusals.length > 0) return refusedFromPlan(result, plan.refusals);
  const manifest = mcpRegistrationManifest(context, context.options, plan);
  const before = inspectJsonFile(context.paths.mcpRegistrationManifest);
  const changed = [];
  if (before.status === 'missing' || JSON.stringify(before.value) !== JSON.stringify(manifest)) {
    writeJson(context.paths.mcpRegistrationManifest, manifest);
    changed.push(relativeToTarget(context, context.paths.mcpRegistrationManifest));
  }
  appendAudit(context, { carrier_id: MCP_REGISTRATION_CARRIER_ID, event: 'apply', status: 'applied', changed, restart_required: plan.audit_evidence.restart_required });
  const verify = verifyMcpRegistrationPlan(context, plan, result);
  return {
    ...verify,
    status: 'applied',
    created_or_changed: changed,
    audit_evidence: { ...verify.audit_evidence, apply_event: 'site_mcp_registration_apply', audit_log_path: relativeToTarget(context, context.paths.auditLog) },
  };
}

function verifyMcpRegistrationPlan(context, plan, result) {
  const manifest = inspectJsonFile(context.paths.mcpRegistrationManifest);
  const ok = manifest.status === 'json'
    && manifest.value?.site_id === context.siteId
    && manifest.value?.target_site_root === context.targetSiteRoot
    && Array.isArray(manifest.value?.mcp_servers);
  return {
    ...result,
    status: ok ? 'verified' : 'refused',
    refusals: ok ? [] : ['mcp_registration_manifest_missing_or_inconsistent'],
    audit_evidence: {
      ...plan.audit_evidence,
      verification: {
        manifest_exists: manifest.status === 'json',
        belongs_to_site_id: manifest.value?.site_id ?? null,
        belongs_to_target_site_root: manifest.value?.target_site_root ?? null,
        server_count: Array.isArray(manifest.value?.mcp_servers) ? manifest.value.mcp_servers.length : 0,
        restart_required: manifest.value?.restart_required ?? null,
      },
    },
    recovery_hint: ok ? null : 'Run MCP registration apply under runtime/carrier authority, or recover to classify partial registration state.',
  };
}

function recoverMcpRegistrationPlan(context, plan, result) {
  return recoverJsonArtifact(context, plan, result, context.paths.mcpRegistrationManifest, 'registration');
}

function buildWindowsProfilePlan(context, options) {
  const artifactPath = resolveProfileArtifactPath(context, options);
  const existing = inspectJsonFile(artifactPath);
  const refusals = [];
  if (options.mcp_registration_verified !== true && options.profile_can_precede_mcp_registration !== true) {
    refusals.push('mcp_registration_verification_required');
  }
  if (options.include_secrets === true) refusals.push('profile_secret_capture_refused');
  if (options.register_mcp === true) refusals.push('profile_carrier_must_not_register_mcp');
  if (!sameOrParent(path.join(context.targetSiteRoot, '.narada', 'profile'), artifactPath)) {
    refusals.push('profile_artifact_path_outside_admitted_scope');
  }
  if (existing.status === 'json' && existing.value?.site_id && existing.value.site_id !== context.siteId) {
    refusals.push('existing_profile_binding_belongs_to_another_site');
  }
  return {
    planned_mutations: [
      mutationRecord(artifactPath, existing.status === 'missing' ? 'create_profile_binding_artifact' : 'structured_merge_profile_binding_artifact'),
      mutationRecord(context.paths.profilePreimage, 'capture_preimage_when_changed'),
      mutationRecord(context.paths.auditLog, 'append_audit_event'),
    ],
    created_or_changed: [],
    audit_evidence: {
      plan_id: stablePlanId(context, 'windows-profile'),
      profile_artifact_path: relativeToTarget(context, artifactPath),
      preimage_path: relativeToTarget(context, context.paths.profilePreimage),
      restart_or_new_shell_required: true,
      profile_bindings: profileBindings(context, options),
    },
    refusals,
  };
}

function applyWindowsProfilePlan(context, plan, result) {
  if (plan.refusals.length > 0) return refusedFromPlan(result, plan.refusals);
  const artifactPath = path.join(context.targetSiteRoot, plan.audit_evidence.profile_artifact_path);
  const before = fs.existsSync(artifactPath) ? fs.readFileSync(artifactPath, 'utf8') : null;
  const next = `${JSON.stringify(windowsProfileBinding(context, context.options), null, 2)}\n`;
  const changed = [];
  if (before !== next) {
    if (before !== null) {
      writeJson(context.paths.profilePreimage, {
        schema: 'narada.windows_profile.preimage.v0',
        site_id: context.siteId,
        target_site_root: context.targetSiteRoot,
        artifact_path: artifactPath,
        preimage: before,
        captured_at: new Date().toISOString(),
      });
      changed.push(relativeToTarget(context, context.paths.profilePreimage));
    }
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, next, 'utf8');
    changed.push(relativeToTarget(context, artifactPath));
  }
  appendAudit(context, { carrier_id: WINDOWS_PROFILE_CARRIER_ID, event: 'apply', status: 'applied', changed, restart_or_new_shell_required: true });
  const verify = verifyWindowsProfilePlan(context, plan, result);
  return {
    ...verify,
    status: 'applied',
    created_or_changed: changed,
    audit_evidence: { ...verify.audit_evidence, apply_event: 'windows_profile_site_binding_apply', audit_log_path: relativeToTarget(context, context.paths.auditLog) },
  };
}

function verifyWindowsProfilePlan(context, plan, result) {
  const artifactPath = path.join(context.targetSiteRoot, plan.audit_evidence.profile_artifact_path);
  const binding = inspectJsonFile(artifactPath);
  const ok = binding.status === 'json'
    && binding.value?.site_id === context.siteId
    && binding.value?.target_site_root === context.targetSiteRoot
    && binding.value?.carrier_id === WINDOWS_PROFILE_CARRIER_ID;
  return {
    ...result,
    status: ok ? 'verified' : 'refused',
    refusals: ok ? [] : ['windows_profile_binding_missing_or_inconsistent'],
    audit_evidence: {
      ...plan.audit_evidence,
      verification: {
        binding_exists: binding.status === 'json',
        belongs_to_site_id: binding.value?.site_id ?? null,
        belongs_to_target_site_root: binding.value?.target_site_root ?? null,
        points_to_source_site: false,
      },
    },
    recovery_hint: ok ? null : 'Run profile binding apply under PC/profile authority, or recover to classify partial profile state.',
  };
}

function recoverWindowsProfilePlan(context, plan, result) {
  const artifactPath = path.join(context.targetSiteRoot, plan.audit_evidence.profile_artifact_path);
  const recovered = recoverJsonArtifact(context, plan, result, artifactPath, 'profile');
  const preimage = inspectJsonFile(context.paths.profilePreimage);
  return {
    ...recovered,
    audit_evidence: { ...recovered.audit_evidence, preimage_available: preimage.status === 'json' },
    recovery_hint: recovered.recovery_classification === 'compatible_seed'
      ? 'Run verify; apply is idempotent.'
      : 'Preimage restore requires explicit profile repair authority.',
  };
}

function buildAgentContextMemoryPlan(context, options) {
  const store = inspectJsonFile(context.paths.agentContextMemoryStore);
  const policy = inspectJsonFile(context.paths.agentContextHydrationPolicy);
  const refusals = [];
  if (options.db_verified !== true || options.storage_verified !== true) refusals.push('db_and_storage_verification_required');
  if (options.handoff_as_checkpoint_truth === true) refusals.push('handoff_material_must_remain_pending_orientation');
  if (options.include_secrets === true) refusals.push('agent_context_secret_capture_refused');
  if (context.sourceSiteRoot && options.import_source_runtime_state === true) refusals.push('source_runtime_state_import_refused');
  if (store.status === 'json' && store.value?.site_id && store.value.site_id !== context.siteId) {
    refusals.push('existing_agent_context_store_belongs_to_another_site');
  }
  if (policy.status === 'json' && policy.value?.site_id && policy.value.site_id !== context.siteId) {
    refusals.push('existing_agent_context_hydration_policy_belongs_to_another_site');
  }
  return {
    planned_mutations: [
      mutationRecord(context.paths.agentContextMemoryStore, store.status === 'missing' ? 'create' : 'ensure_current'),
      mutationRecord(context.paths.agentContextHydrationPolicy, policy.status === 'missing' ? 'create' : 'ensure_current'),
      mutationRecord(context.paths.auditLog, 'append_audit_event'),
    ],
    created_or_changed: [],
    audit_evidence: {
      plan_id: stablePlanId(context, 'agent-context-memory'),
      memory_store_path: relativeToTarget(context, context.paths.agentContextMemoryStore),
      hydration_policy_path: relativeToTarget(context, context.paths.agentContextHydrationPolicy),
      package_name: '@narada2/agent-context-memory',
      package_owns_sqlite_dependency: false,
      source_state_imported: false,
      refused_non_portable_classes: NON_PORTABLE_CLASSES,
    },
    refusals,
  };
}

function applyAgentContextMemoryPlan(context, plan, result) {
  if (plan.refusals.length > 0) return refusedFromPlan(result, plan.refusals);
  const changed = [];
  const store = agentContextMemoryStore(context);
  const policy = agentContextHydrationPolicy(context);
  const beforeStore = inspectJsonFile(context.paths.agentContextMemoryStore);
  if (beforeStore.status === 'missing') {
    writeJson(context.paths.agentContextMemoryStore, store);
    changed.push(relativeToTarget(context, context.paths.agentContextMemoryStore));
  }
  const beforePolicy = inspectJsonFile(context.paths.agentContextHydrationPolicy);
  if (beforePolicy.status === 'missing') {
    writeJson(context.paths.agentContextHydrationPolicy, policy);
    changed.push(relativeToTarget(context, context.paths.agentContextHydrationPolicy));
  }
  appendAudit(context, { carrier_id: AGENT_CONTEXT_MEMORY_CARRIER_ID, event: 'apply', status: 'applied', changed });
  const verify = verifyAgentContextMemoryPlan(context, plan, result);
  return {
    ...verify,
    status: 'applied',
    created_or_changed: changed,
    audit_evidence: { ...verify.audit_evidence, apply_event: 'agent_context_memory_local_storage_apply', audit_log_path: relativeToTarget(context, context.paths.auditLog) },
  };
}

function verifyAgentContextMemoryPlan(context, plan, result) {
  const store = inspectJsonFile(context.paths.agentContextMemoryStore);
  const policy = inspectJsonFile(context.paths.agentContextHydrationPolicy);
  const ok = store.status === 'json'
    && store.value?.site_id === context.siteId
    && store.value?.target_site_root === context.targetSiteRoot
    && store.value?.package_name === '@narada2/agent-context-memory'
    && store.value?.source_state_imported === false
    && policy.status === 'json'
    && policy.value?.site_id === context.siteId
    && policy.value?.target_site_root === context.targetSiteRoot
    && policy.value?.runtime_hydration_executed === false;
  return {
    ...result,
    status: ok ? 'verified' : 'refused',
    refusals: ok ? [] : ['agent_context_memory_store_missing_or_inconsistent'],
    audit_evidence: {
      ...plan.audit_evidence,
      verification: {
        store_exists: store.status === 'json',
        policy_exists: policy.status === 'json',
        belongs_to_site_id: store.value?.site_id ?? null,
        belongs_to_target_site_root: store.value?.target_site_root ?? null,
        source_state_imported: store.value?.source_state_imported ?? null,
        runtime_hydration_executed: policy.value?.runtime_hydration_executed ?? null,
      },
    },
    recovery_hint: ok ? null : 'Run agent_context_memory_local_storage apply after DB and storage verification, or recover to classify partial state.',
  };
}

function recoverAgentContextMemoryPlan(context, plan, result) {
  const store = inspectJsonFile(context.paths.agentContextMemoryStore);
  const policy = inspectJsonFile(context.paths.agentContextHydrationPolicy);
  const classification = store.status === 'missing' && policy.status === 'missing'
    ? 'absent'
    : store.status === 'json' && store.value?.site_id === context.siteId && policy.status === 'json' && policy.value?.site_id === context.siteId
      ? 'compatible_seed'
      : store.status === 'json' || policy.status === 'json'
        ? 'incompatible_or_partial_state'
        : 'incomplete_seed';
  return {
    ...result,
    status: classification === 'incompatible_or_partial_state' ? 'refused' : 'recovered',
    recovery_classification: classification,
    recovery_hint: classification === 'compatible_seed' ? 'Run verify; apply is idempotent.' : 'Repair requires a separate explicit repair carrier.',
  };
}

function buildSiteInboxPlan(context, options) {
  const index = inspectJsonFile(context.paths.siteInboxIndex);
  const policy = inspectJsonFile(context.paths.siteInboxPublicationPolicy);
  const refusals = [];
  if (options.db_verified !== true || options.storage_verified !== true) refusals.push('db_and_storage_verification_required');
  if (context.sourceSiteRoot && options.import_source_runtime_state === true) refusals.push('source_runtime_state_import_refused');
  if (options.handoff_as_checkpoint_truth === true) refusals.push('inbox_handoff_must_remain_pending_evidence');
  if (index.status === 'json' && index.value?.site_id && index.value.site_id !== context.siteId) {
    refusals.push('existing_inbox_index_belongs_to_another_site');
  }
  if (policy.status === 'json' && policy.value?.site_id && policy.value.site_id !== context.siteId) {
    refusals.push('existing_inbox_publication_policy_belongs_to_another_site');
  }
  return {
    planned_mutations: [
      mutationRecord(context.paths.siteInboxIndex, index.status === 'missing' ? 'create' : 'ensure_current'),
      mutationRecord(context.paths.siteInboxPublicationPolicy, policy.status === 'missing' ? 'create' : 'ensure_current'),
      mutationRecord(context.paths.auditLog, 'append_audit_event'),
    ],
    created_or_changed: [],
    audit_evidence: {
      plan_id: stablePlanId(context, 'site-inbox'),
      inbox_index_path: relativeToTarget(context, context.paths.siteInboxIndex),
      publication_policy_path: relativeToTarget(context, context.paths.siteInboxPublicationPolicy),
      package_name: '@narada2/site-inbox',
      source_state_imported: false,
      refused_non_portable_classes: NON_PORTABLE_CLASSES,
    },
    refusals,
  };
}

function applySiteInboxPlan(context, plan, result) {
  if (plan.refusals.length > 0) return refusedFromPlan(result, plan.refusals);
  const changed = [];
  const beforeIndex = inspectJsonFile(context.paths.siteInboxIndex);
  if (beforeIndex.status === 'missing') {
    writeJson(context.paths.siteInboxIndex, siteInboxIndex(context));
    changed.push(relativeToTarget(context, context.paths.siteInboxIndex));
  }
  const beforePolicy = inspectJsonFile(context.paths.siteInboxPublicationPolicy);
  if (beforePolicy.status === 'missing') {
    writeJson(context.paths.siteInboxPublicationPolicy, siteInboxPublicationPolicy(context));
    changed.push(relativeToTarget(context, context.paths.siteInboxPublicationPolicy));
  }
  appendAudit(context, { carrier_id: SITE_INBOX_CARRIER_ID, event: 'apply', status: 'applied', changed });
  const verify = verifySiteInboxPlan(context, plan, result);
  return {
    ...verify,
    status: 'applied',
    created_or_changed: changed,
    audit_evidence: { ...verify.audit_evidence, apply_event: 'site_inbox_local_substrate_apply', audit_log_path: relativeToTarget(context, context.paths.auditLog) },
  };
}

function verifySiteInboxPlan(context, plan, result) {
  const index = inspectJsonFile(context.paths.siteInboxIndex);
  const policy = inspectJsonFile(context.paths.siteInboxPublicationPolicy);
  const ok = index.status === 'json'
    && index.value?.site_id === context.siteId
    && index.value?.target_site_root === context.targetSiteRoot
    && index.value?.source_state_imported === false
    && policy.status === 'json'
    && policy.value?.site_id === context.siteId
    && policy.value?.target_site_root === context.targetSiteRoot
    && policy.value?.publication_executed === false;
  return {
    ...result,
    status: ok ? 'verified' : 'refused',
    refusals: ok ? [] : ['site_inbox_substrate_missing_or_inconsistent'],
    audit_evidence: {
      ...plan.audit_evidence,
      verification: {
        inbox_index_exists: index.status === 'json',
        publication_policy_exists: policy.status === 'json',
        belongs_to_site_id: index.value?.site_id ?? null,
        belongs_to_target_site_root: index.value?.target_site_root ?? null,
        source_state_imported: index.value?.source_state_imported ?? null,
        publication_executed: policy.value?.publication_executed ?? null,
      },
    },
    recovery_hint: ok ? null : 'Run site_inbox_local_substrate apply after DB and storage verification, or recover to classify partial state.',
  };
}

function recoverSiteInboxPlan(context, plan, result) {
  const index = inspectJsonFile(context.paths.siteInboxIndex);
  const policy = inspectJsonFile(context.paths.siteInboxPublicationPolicy);
  const classification = index.status === 'missing' && policy.status === 'missing'
    ? 'absent'
    : index.status === 'json' && index.value?.site_id === context.siteId && policy.status === 'json' && policy.value?.site_id === context.siteId
      ? 'compatible_seed'
      : index.status === 'json' || policy.status === 'json'
        ? 'incompatible_or_partial_state'
        : 'incomplete_seed';
  return {
    ...result,
    status: classification === 'incompatible_or_partial_state' ? 'refused' : 'recovered',
    recovery_classification: classification,
    recovery_hint: classification === 'compatible_seed' ? 'Run verify; apply is idempotent.' : 'Repair requires a separate explicit repair carrier.',
  };
}

function buildSiteConfigPlan(context, options) {
  const registry = inspectJsonFile(context.paths.siteConfigRegistry);
  const probePolicy = inspectJsonFile(context.paths.siteConfigProbePolicy);
  const refusals = [];
  if (options.db_verified !== true || options.storage_verified !== true) refusals.push('db_and_storage_verification_required');
  if (context.sourceSiteRoot && options.import_source_runtime_state === true) refusals.push('source_runtime_state_import_refused');
  if (options.scan_external_roots === true) refusals.push('arbitrary_client_project_scan_refused');
  if (registry.status === 'json' && registry.value?.site_id && registry.value.site_id !== context.siteId) {
    refusals.push('existing_site_config_registry_belongs_to_another_site');
  }
  if (probePolicy.status === 'json' && probePolicy.value?.site_id && probePolicy.value.site_id !== context.siteId) {
    refusals.push('existing_site_config_probe_policy_belongs_to_another_site');
  }
  return {
    planned_mutations: [
      mutationRecord(context.paths.siteConfigRegistry, registry.status === 'missing' ? 'create' : 'ensure_current'),
      mutationRecord(context.paths.siteConfigProbePolicy, probePolicy.status === 'missing' ? 'create' : 'ensure_current'),
      mutationRecord(context.paths.auditLog, 'append_audit_event'),
    ],
    created_or_changed: [],
    audit_evidence: {
      plan_id: stablePlanId(context, 'site-config'),
      registry_path: relativeToTarget(context, context.paths.siteConfigRegistry),
      probe_policy_path: relativeToTarget(context, context.paths.siteConfigProbePolicy),
      package_name: '@narada2/site-config',
      source_state_imported: false,
      external_probe_executed: false,
      refused_non_portable_classes: NON_PORTABLE_CLASSES,
    },
    refusals,
  };
}

function applySiteConfigPlan(context, plan, result) {
  if (plan.refusals.length > 0) return refusedFromPlan(result, plan.refusals);
  const changed = [];
  if (inspectJsonFile(context.paths.siteConfigRegistry).status === 'missing') {
    writeJson(context.paths.siteConfigRegistry, siteConfigRegistry(context));
    changed.push(relativeToTarget(context, context.paths.siteConfigRegistry));
  }
  if (inspectJsonFile(context.paths.siteConfigProbePolicy).status === 'missing') {
    writeJson(context.paths.siteConfigProbePolicy, siteConfigProbePolicy(context));
    changed.push(relativeToTarget(context, context.paths.siteConfigProbePolicy));
  }
  appendAudit(context, { carrier_id: SITE_CONFIG_CARRIER_ID, event: 'apply', status: 'applied', changed });
  const verify = verifySiteConfigPlan(context, plan, result);
  return {
    ...verify,
    status: 'applied',
    created_or_changed: changed,
    audit_evidence: { ...verify.audit_evidence, apply_event: 'site_config_local_registry_apply', audit_log_path: relativeToTarget(context, context.paths.auditLog) },
  };
}

function verifySiteConfigPlan(context, plan, result) {
  const registry = inspectJsonFile(context.paths.siteConfigRegistry);
  const probePolicy = inspectJsonFile(context.paths.siteConfigProbePolicy);
  const ok = registry.status === 'json'
    && registry.value?.site_id === context.siteId
    && registry.value?.target_site_root === context.targetSiteRoot
    && registry.value?.source_state_imported === false
    && probePolicy.status === 'json'
    && probePolicy.value?.site_id === context.siteId
    && probePolicy.value?.target_site_root === context.targetSiteRoot
    && probePolicy.value?.external_probe_executed === false;
  return {
    ...result,
    status: ok ? 'verified' : 'refused',
    refusals: ok ? [] : ['site_config_registry_missing_or_inconsistent'],
    audit_evidence: {
      ...plan.audit_evidence,
      verification: {
        registry_exists: registry.status === 'json',
        probe_policy_exists: probePolicy.status === 'json',
        belongs_to_site_id: registry.value?.site_id ?? null,
        belongs_to_target_site_root: registry.value?.target_site_root ?? null,
        source_state_imported: registry.value?.source_state_imported ?? null,
        external_probe_executed: probePolicy.value?.external_probe_executed ?? null,
      },
    },
    recovery_hint: ok ? null : 'Run site_config_local_registry apply after DB and storage verification, or recover to classify partial state.',
  };
}

function recoverSiteConfigPlan(context, plan, result) {
  const registry = inspectJsonFile(context.paths.siteConfigRegistry);
  const probePolicy = inspectJsonFile(context.paths.siteConfigProbePolicy);
  const classification = registry.status === 'missing' && probePolicy.status === 'missing'
    ? 'absent'
    : registry.status === 'json' && registry.value?.site_id === context.siteId && probePolicy.status === 'json' && probePolicy.value?.site_id === context.siteId
      ? 'compatible_seed'
      : registry.status === 'json' || probePolicy.status === 'json'
        ? 'incompatible_or_partial_state'
        : 'incomplete_seed';
  return {
    ...result,
    status: classification === 'incompatible_or_partial_state' ? 'refused' : 'recovered',
    recovery_classification: classification,
    recovery_hint: classification === 'compatible_seed' ? 'Run verify; apply is idempotent.' : 'Repair requires a separate explicit repair carrier.',
  };
}

function buildSiteLiftPlan(context, options) {
  const catalog = inspectJsonFile(context.paths.siteLiftAdoptionCatalog);
  const policy = inspectJsonFile(context.paths.siteLiftMaterializationPolicy);
  const refusals = [];
  if (options.db_verified !== true || options.storage_verified !== true) refusals.push('db_and_storage_verification_required');
  if (context.sourceSiteRoot && options.import_source_runtime_state === true) refusals.push('source_runtime_state_import_refused');
  if (options.copy_files === true) refusals.push('file_copy_requires_separate_admission');
  if (options.install_packages === true) refusals.push('install_requires_separate_admission');
  if (catalog.status === 'json' && catalog.value?.site_id && catalog.value.site_id !== context.siteId) {
    refusals.push('existing_site_lift_catalog_belongs_to_another_site');
  }
  if (policy.status === 'json' && policy.value?.site_id && policy.value.site_id !== context.siteId) {
    refusals.push('existing_site_lift_policy_belongs_to_another_site');
  }
  return {
    planned_mutations: [
      mutationRecord(context.paths.siteLiftAdoptionCatalog, catalog.status === 'missing' ? 'create' : 'ensure_current'),
      mutationRecord(context.paths.siteLiftMaterializationPolicy, policy.status === 'missing' ? 'create' : 'ensure_current'),
      mutationRecord(context.paths.auditLog, 'append_audit_event'),
    ],
    created_or_changed: [],
    audit_evidence: {
      plan_id: stablePlanId(context, 'site-lift'),
      adoption_catalog_path: relativeToTarget(context, context.paths.siteLiftAdoptionCatalog),
      materialization_policy_path: relativeToTarget(context, context.paths.siteLiftMaterializationPolicy),
      package_name: '@narada2/site-lift',
      source_state_imported: false,
      files_copied: false,
      packages_installed: false,
      refused_non_portable_classes: NON_PORTABLE_CLASSES,
    },
    refusals,
  };
}

function applySiteLiftPlan(context, plan, result) {
  if (plan.refusals.length > 0) return refusedFromPlan(result, plan.refusals);
  const changed = [];
  if (inspectJsonFile(context.paths.siteLiftAdoptionCatalog).status === 'missing') {
    writeJson(context.paths.siteLiftAdoptionCatalog, siteLiftAdoptionCatalog(context));
    changed.push(relativeToTarget(context, context.paths.siteLiftAdoptionCatalog));
  }
  if (inspectJsonFile(context.paths.siteLiftMaterializationPolicy).status === 'missing') {
    writeJson(context.paths.siteLiftMaterializationPolicy, siteLiftMaterializationPolicy(context));
    changed.push(relativeToTarget(context, context.paths.siteLiftMaterializationPolicy));
  }
  appendAudit(context, { carrier_id: SITE_LIFT_CARRIER_ID, event: 'apply', status: 'applied', changed });
  const verify = verifySiteLiftPlan(context, plan, result);
  return {
    ...verify,
    status: 'applied',
    created_or_changed: changed,
    audit_evidence: { ...verify.audit_evidence, apply_event: 'site_lift_local_adoption_apply', audit_log_path: relativeToTarget(context, context.paths.auditLog) },
  };
}

function verifySiteLiftPlan(context, plan, result) {
  const catalog = inspectJsonFile(context.paths.siteLiftAdoptionCatalog);
  const policy = inspectJsonFile(context.paths.siteLiftMaterializationPolicy);
  const ok = catalog.status === 'json'
    && catalog.value?.site_id === context.siteId
    && catalog.value?.target_site_root === context.targetSiteRoot
    && catalog.value?.source_state_imported === false
    && policy.status === 'json'
    && policy.value?.site_id === context.siteId
    && policy.value?.target_site_root === context.targetSiteRoot
    && policy.value?.files_copied === false
    && policy.value?.packages_installed === false;
  return {
    ...result,
    status: ok ? 'verified' : 'refused',
    refusals: ok ? [] : ['site_lift_adoption_missing_or_inconsistent'],
    audit_evidence: {
      ...plan.audit_evidence,
      verification: {
        adoption_catalog_exists: catalog.status === 'json',
        materialization_policy_exists: policy.status === 'json',
        belongs_to_site_id: catalog.value?.site_id ?? null,
        belongs_to_target_site_root: catalog.value?.target_site_root ?? null,
        source_state_imported: catalog.value?.source_state_imported ?? null,
        files_copied: policy.value?.files_copied ?? null,
        packages_installed: policy.value?.packages_installed ?? null,
      },
    },
    recovery_hint: ok ? null : 'Run site_lift_local_adoption apply after DB and storage verification, or recover to classify partial state.',
  };
}

function recoverSiteLiftPlan(context, plan, result) {
  const catalog = inspectJsonFile(context.paths.siteLiftAdoptionCatalog);
  const policy = inspectJsonFile(context.paths.siteLiftMaterializationPolicy);
  const classification = catalog.status === 'missing' && policy.status === 'missing'
    ? 'absent'
    : catalog.status === 'json' && catalog.value?.site_id === context.siteId && policy.status === 'json' && policy.value?.site_id === context.siteId
      ? 'compatible_seed'
      : catalog.status === 'json' || policy.status === 'json'
        ? 'incompatible_or_partial_state'
        : 'incomplete_seed';
  return {
    ...result,
    status: classification === 'incompatible_or_partial_state' ? 'refused' : 'recovered',
    recovery_classification: classification,
    recovery_hint: classification === 'compatible_seed' ? 'Run verify; apply is idempotent.' : 'Repair requires a separate explicit repair carrier.',
  };
}

function validateSharedContext(context, options) {
  const refusals = [];
  if (!context.authorityBasis) refusals.push('authority_basis_required');
  if (!isDirectory(context.targetSiteRoot)) refusals.push('target_site_root_not_found');
  if (isSuspiciousRoot(context.targetSiteRoot)) refusals.push('target_site_root_suspicious');
  if (!isDirectory(path.join(context.targetSiteRoot, '.narada'))) refusals.push('target_site_seed_missing');
  if (context.sourceSiteRoot && sameOrParent(context.sourceSiteRoot, context.targetSiteRoot)) {
    refusals.push('source_site_root_must_not_enclose_target_site_root');
  }
  if (context.sourceSiteRoot && options.import_source_runtime_state === true) {
    refusals.push('source_runtime_state_import_refused');
  }
  return refusals;
}

function baseResult(context, plan, sharedRefusals) {
  return {
    schema: context.schema,
    carrier_id: context.carrierId,
    target_site_root: context.targetSiteRoot,
    site_id: context.siteId,
    authority_owner: context.authorityOwner,
    authority_basis: context.authorityBasis,
    mode: context.mode,
    planned_mutations: plan.planned_mutations,
    created_or_changed: plan.created_or_changed,
    audit_evidence: plan.audit_evidence,
    refusals: [...sharedRefusals, ...plan.refusals],
    recovery_hint: null,
  };
}

function storageFileContents(context, options, plan) {
  const handoffDisposition = plan?.audit_evidence?.handoff_disposition
    ?? (options?.handoff_material ? 'external_orientation_pending_admission' : 'none');
  const manifest = {
    schema: 'narada.site_local_storage_hydration_manifest.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: STORAGE_CARRIER_ID,
    handoff_disposition: handoffDisposition,
    empty_histories_created: ['runtime', 'inbox_exports', 'checkpoints', 'logs', 'mcp_payload_staging'],
    refused_non_portable_classes: NON_PORTABLE_CLASSES,
  };
  return {
    '.narada/runtime/README.md': '# Runtime\n\nLocal runtime directory. No source-Site runtime state imported.\n',
    '.narada/inbox/exports/README.md': '# Inbox Exports\n\nNo inbox history imported. Exports created here belong to this Site.\n',
    '.narada/checkpoints/README.md': '# Checkpoints\n\nNo checkpoint history imported. First checkpoints must be created locally.\n',
    '.narada/logs/README.md': '# Logs\n\nLocal logs directory. No source logs imported.\n',
    '.narada/mcp-payloads/staging/README.md': '# MCP Payload Staging\n\nPayloads staged here require local admission before use.\n',
    '.narada/hydration/hydration-manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
  };
}

function carrierPaths(targetSiteRoot) {
  return {
    localDb: path.join(targetSiteRoot, '.narada/state/local-db/site-local-db.json'),
    migrationLedger: path.join(targetSiteRoot, '.narada/state/local-db/migration-ledger.jsonl'),
    hydrationManifest: path.join(targetSiteRoot, '.narada/hydration/hydration-manifest.json'),
    mcpRegistrationManifest: path.join(targetSiteRoot, '.narada/capabilities/mcp-registration.json'),
    windowsProfileBinding: path.join(targetSiteRoot, '.narada/profile/windows-profile-binding.json'),
    profilePreimage: path.join(targetSiteRoot, '.narada/profile/windows-profile-preimage.json'),
    agentContextMemoryStore: path.join(targetSiteRoot, '.narada/agent-context-memory/memory-store.json'),
    agentContextHydrationPolicy: path.join(targetSiteRoot, '.narada/agent-context-memory/hydration-policy.json'),
    siteInboxIndex: path.join(targetSiteRoot, '.narada/inbox/index.json'),
    siteInboxPublicationPolicy: path.join(targetSiteRoot, '.narada/inbox/publication-policy.json'),
    siteConfigRegistry: path.join(targetSiteRoot, '.narada/site-config/known-sites.json'),
    siteConfigProbePolicy: path.join(targetSiteRoot, '.narada/site-config/probe-policy.json'),
    siteLiftAdoptionCatalog: path.join(targetSiteRoot, '.narada/site-lift/adoption-catalog.json'),
    siteLiftMaterializationPolicy: path.join(targetSiteRoot, '.narada/site-lift/materialization-policy.json'),
    auditLog: path.join(targetSiteRoot, '.narada/admission/live-carrier-audit.jsonl'),
  };
}

function siteLiftAdoptionCatalog(context) {
  return {
    schema: 'narada.site_lift.adoption_catalog.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: SITE_LIFT_CARRIER_ID,
    package_name: '@narada2/site-lift',
    source_state_imported: false,
    adoption_candidates: [],
    refused_nonportable_state: NON_PORTABLE_CLASSES,
  };
}

function siteLiftMaterializationPolicy(context) {
  return {
    schema: 'narada.site_lift.materialization_policy.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: SITE_LIFT_CARRIER_ID,
    files_copied: false,
    packages_installed: false,
    source_runtime_imported: false,
    next_admission_required_for: [
      'adoption artifact selection',
      'file copy/install/bootstrap',
      'MCP registration mutation',
      'receiving Site mutation authority',
      'catalog publication',
    ],
  };
}

function siteConfigRegistry(context) {
  return {
    schema: 'narada.site_config.known_sites.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: SITE_CONFIG_CARRIER_ID,
    package_name: '@narada2/site-config',
    source_state_imported: false,
    known_sites: [],
    capability_edges: [],
    capability_denials: [],
  };
}

function siteConfigProbePolicy(context) {
  return {
    schema: 'narada.site_config.probe_policy.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: SITE_CONFIG_CARRIER_ID,
    external_probe_executed: false,
    arbitrary_scan_admitted: false,
    target_site_mutation_admitted: false,
    next_admission_required_for: [
      'registered Site probe execution',
      'known Site registry mutation from probe result',
      'trust record mutation',
      'target Site config write',
    ],
  };
}

function siteInboxIndex(context) {
  return {
    schema: 'narada.site_inbox.local_index.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: SITE_INBOX_CARRIER_ID,
    package_name: '@narada2/site-inbox',
    source_state_imported: false,
    envelopes: [],
    decisions: [],
    portable_artifacts: [],
  };
}

function siteInboxPublicationPolicy(context) {
  return {
    schema: 'narada.site_inbox.publication_policy.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: SITE_INBOX_CARRIER_ID,
    publication_executed: false,
    source_inbox_history_imported: false,
    next_admission_required_for: [
      'portable envelope file write',
      'task promotion',
      'Git publication',
      'live MCP registration',
    ],
  };
}

function agentContextMemoryStore(context) {
  return {
    schema: 'narada.agent_context_memory.local_store.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: AGENT_CONTEXT_MEMORY_CARRIER_ID,
    package_name: '@narada2/agent-context-memory',
    package_owns_sqlite_dependency: false,
    source_state_imported: false,
    named_agents: [],
    sessions: [],
    checkpoints: [],
    hydration_events: [],
  };
}

function agentContextHydrationPolicy(context) {
  return {
    schema: 'narada.agent_context_memory.hydration_policy.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: AGENT_CONTEXT_MEMORY_CARRIER_ID,
    runtime_hydration_executed: false,
    checkpoint_history_imported: false,
    secrets_imported: false,
    next_admission_required_for: [
      'runtime hydration execution',
      'checkpoint persistence from live runtime',
      'MCP tool mutation exposure',
    ],
  };
}

function mcpRegistrationManifest(context, options, plan) {
  return {
    schema: 'narada.site_mcp_registration.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: MCP_REGISTRATION_CARRIER_ID,
    runtime_target: stringOption(options.runtime_target),
    mcp_servers: normalizeMcpServerDescriptors(options.mcp_server_descriptors),
    restart_required: plan.audit_evidence.restart_required,
    stale_live_pressure: plan.audit_evidence.restart_required ? 'pending_external_restart_or_reprobe' : 'not_required',
  };
}

function normalizeMcpServerDescriptors(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      name: stringOption(item.name) ?? 'mcp-server',
      transport: stringOption(item.transport) ?? 'stdio',
      command: stringOption(item.command),
      args: Array.isArray(item.args) ? item.args.map(String) : [],
      entrypoint: stringOption(item.entrypoint),
      grants_broader_authority: item.grants_broader_authority === true,
    }));
}

function resolveProfileArtifactPath(context, options) {
  const requested = stringOption(options.profile_artifact_path);
  return requested ? normalizePath(requested) : context.paths.windowsProfileBinding;
}

function profileBindings(context, options) {
  return {
    NARADA_SITE_ID: context.siteId,
    NARADA_SITE_ROOT: context.targetSiteRoot,
    profile_target: stringOption(options.profile_target) ?? 'target_site_local_profile_artifact',
  };
}

function windowsProfileBinding(context, options) {
  return {
    schema: 'narada.windows_profile.site_binding.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: WINDOWS_PROFILE_CARRIER_ID,
    profile_target: stringOption(options.profile_target) ?? 'target_site_local_profile_artifact',
    bindings: profileBindings(context, options),
    restart_or_new_shell_required: true,
    does_not_register_mcp: true,
    does_not_capture_secrets: true,
  };
}

function recoverJsonArtifact(context, plan, result, artifactPath, artifactKind) {
  const artifact = inspectJsonFile(artifactPath);
  const classification = artifact.status === 'missing'
    ? 'absent'
    : artifact.status === 'json' && artifact.value?.site_id === context.siteId
      ? 'compatible_seed'
      : artifact.status === 'json'
        ? 'incompatible_state'
        : 'incomplete_seed';
  return {
    ...result,
    status: classification === 'incompatible_state' ? 'refused' : 'recovered',
    recovery_classification: classification,
    audit_evidence: { ...plan.audit_evidence, artifact_kind: artifactKind },
    recovery_hint: classification === 'compatible_seed' ? 'Run verify; apply is idempotent.' : 'Repair requires a separate explicit repair carrier.',
  };
}

function migrationEvent(context, status) {
  return {
    schema: 'narada.site_local_db.migration_event.v0',
    carrier_id: LOCAL_DB_CARRIER_ID,
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    migration: 'create_site_local_db_v0',
    status,
    at: new Date().toISOString(),
  };
}

function appendAudit(context, event) {
  appendJsonl(context.paths.auditLog, {
    schema: 'narada.site_live_carrier.audit_event.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    at: new Date().toISOString(),
    ...event,
  });
}

function appendJsonl(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeJsonNew(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function inspectJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return { status: 'missing', value: null };
  try {
    return { status: 'json', value: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch (error) {
    return { status: 'invalid_json', value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function mutationRecord(absolutePath, action) {
  return { action, path: absolutePath };
}

function refusedFromPlan(result, refusals) {
  return { ...result, status: 'refused', refusals, recovery_hint: 'Resolve refusal conditions and rerun plan.' };
}

function recoveryHint(carrierId, refusals) {
  if (refusals.includes('target_site_seed_missing')) return 'Run narada sites create for the receiving folder before live carriers.';
  if (carrierId === STORAGE_CARRIER_ID && refusals.includes('db_init_verification_missing')) {
    return 'Run and verify site_local_db_init before storage hydration.';
  }
  return 'Run plan with a receiving-Site root, site id, and explicit authority basis.';
}

function stablePlanId(context, label) {
  return `${context.siteId}:${label}:${relativeToTarget(context, context.targetSiteRoot) || '.'}`;
}

function relativeToTarget(context, absolutePath) {
  return path.relative(context.targetSiteRoot, absolutePath).replace(/\\/g, '/');
}

function sameOrParent(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function isSuspiciousRoot(projectRoot) {
  const resolved = normalizePath(projectRoot);
  const parsed = path.parse(resolved);
  const lower = resolved.toLowerCase();
  return resolved === parsed.root
    || lower === normalizePath(os.homedir()).toLowerCase()
    || lower === normalizePath(os.tmpdir()).toLowerCase();
}

function normalizePath(value) {
  return path.resolve(String(value || ''));
}

function normalizeMode(mode) {
  if (!mode) return 'plan';
  if (['plan', 'apply', 'verify', 'recover'].includes(mode)) return mode;
  throw new Error(`unsupported_carrier_mode: ${mode}`);
}

function requiredOption(options, key) {
  const value = options[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${key}_required`);
  return value;
}

function stringOption(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--carrier') options.carrier = argv[++i];
    else if (arg === '--mode') options.mode = argv[++i];
    else if (arg === '--target-site-root') options.target_site_root = argv[++i];
    else if (arg === '--site-id') options.site_id = argv[++i];
    else if (arg === '--authority-basis') options.authority_basis = argv[++i];
    else if (arg === '--source-site-root') options.source_site_root = argv[++i];
    else if (arg === '--runtime-target') options.runtime_target = argv[++i];
    else if (arg === '--mcp-server-json') options.mcp_server_descriptors = JSON.parse(argv[++i]);
    else if (arg === '--db-verified') options.db_verified = true;
    else if (arg === '--storage-verified') options.storage_verified = true;
    else if (arg === '--mcp-registration-verified') options.mcp_registration_verified = true;
    else if (arg === '--profile-can-precede-mcp-registration') options.profile_can_precede_mcp_registration = true;
    else if (arg === '--profile-artifact-path') options.profile_artifact_path = argv[++i];
    else if (arg === '--profile-target') options.profile_target = argv[++i];
    else if (arg === '--include-secrets') options.include_secrets = true;
    else if (arg === '--register-mcp') options.register_mcp = true;
    else if (arg === '--mutation-authorized') options.mutation_authorized = true;
    else if (arg === '--db-init-verified') options.db_init_verified = true;
    else if (arg === '--handoff-as-checkpoint-truth') options.handoff_as_checkpoint_truth = true;
    else if (arg === '--import-source-runtime-state') options.import_source_runtime_state = true;
    else if (arg === '--scan-external-roots') options.scan_external_roots = true;
    else if (arg === '--copy-files') options.copy_files = true;
    else if (arg === '--install-packages') options.install_packages = true;
    else throw new Error(`unsupported_argument: ${arg}`);
  }
  return options;
}

function runCli(argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr) {
  try {
    const options = parseArgs(argv);
    const result = options.carrier === LOCAL_DB_CARRIER_ID
      ? siteLocalDbCarrier(options)
      : options.carrier === STORAGE_CARRIER_ID
        ? siteLocalStorageHydrationCarrier(options)
        : options.carrier === MCP_REGISTRATION_CARRIER_ID
          ? siteMcpRegistrationCarrier(options)
          : options.carrier === WINDOWS_PROFILE_CARRIER_ID
            ? windowsProfileSiteBindingCarrier(options)
            : options.carrier === AGENT_CONTEXT_MEMORY_CARRIER_ID
              ? agentContextMemoryLocalStorageCarrier(options)
              : options.carrier === SITE_INBOX_CARRIER_ID
                ? siteInboxLocalSubstrateCarrier(options)
                : options.carrier === SITE_CONFIG_CARRIER_ID
                  ? siteConfigLocalRegistryCarrier(options)
                  : options.carrier === SITE_LIFT_CARRIER_ID
                    ? siteLiftLocalAdoptionCarrier(options)
                    : { schema: CARRIER_SCHEMA, status: 'refused', refusals: ['carrier_required_or_unknown'] };
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === 'refused' ? 2 : 0;
  } catch (error) {
    stderr.write(`${JSON.stringify({ schema: CARRIER_SCHEMA, status: 'refused', refusals: [error instanceof Error ? error.message : String(error)] })}\n`);
    return 2;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}

export {
  CARRIER_SCHEMA,
  LOCAL_DB_CARRIER_ID,
  STORAGE_CARRIER_ID,
  MCP_REGISTRATION_CARRIER_ID,
  WINDOWS_PROFILE_CARRIER_ID,
  AGENT_CONTEXT_MEMORY_CARRIER_ID,
  SITE_INBOX_CARRIER_ID,
  SITE_CONFIG_CARRIER_ID,
  SITE_LIFT_CARRIER_ID,
  siteLocalDbCarrier,
  siteLocalStorageHydrationCarrier,
  siteMcpRegistrationCarrier,
  windowsProfileSiteBindingCarrier,
  agentContextMemoryLocalStorageCarrier,
  siteInboxLocalSubstrateCarrier,
  siteConfigLocalRegistryCarrier,
  siteLiftLocalAdoptionCarrier,
  parseArgs,
  runCli,
};
