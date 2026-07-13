#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { siteControlRoot } from '../site-layout.mjs';
import {
  createSiteLiveCarrierLifecycle,
  transitionSiteLiveCarrierLifecycle,
} from './site-live-carrier-state.mjs';

const CARRIER_SCHEMA = 'narada.site_live_carrier.result.v0';
const LOCAL_DB_CARRIER_ID = 'site_local_db_init';
const STORAGE_CARRIER_ID = 'site_local_storage_hydration';
const MCP_REGISTRATION_CARRIER_ID = 'site_mcp_registration_transport';
const WINDOWS_PROFILE_CARRIER_ID = 'windows_profile_site_binding';
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

const STORAGE_FILES = [
  '.narada/runtime/README.md',
  '.narada/inbox/exports/README.md',
  '.narada/checkpoints/README.md',
  '.narada/logs/README.md',
  '.narada/mcp-payloads/staging/README.md',
  '.narada/hydration/hydration-manifest.json',
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

function siteLivePathDoctor(options = {}) {
  const targetSiteRoot = normalizePath(requiredOption(options, 'target_site_root'));
  const paths = carrierPaths(targetSiteRoot);
  const siteDoc = inspectJsonFile(path.join(targetSiteRoot, '.narada/site.json'));
  const siteId = stringOption(options.site_id) ?? stringOption(siteDoc.value?.site_id) ?? path.basename(targetSiteRoot).toLowerCase();
  const context = {
    schema: CARRIER_SCHEMA,
    carrierId: 'site_live_path_doctor',
    mode: 'doctor',
    targetSiteRoot,
    siteId,
    paths,
  };
  const gates = [
    doctorGateLocalDb(context),
    doctorGateStorage(context),
    doctorGateMcp(context),
    doctorGateProfile(context),
  ];
  const nextGate = gates.find((gate) => gate.status !== 'verified') ?? null;
  return {
    schema: 'narada.site_live_path.doctor.v0',
    status: nextGate ? 'incomplete' : 'verified',
    read_only: true,
    target_site_root: targetSiteRoot,
    site_id: siteId,
    gates,
    next_gate: nextGate?.carrier_id ?? null,
    missing_authority_or_evidence: nextGate?.missing_authority_or_evidence ?? [],
    next_safe_command: nextGate?.next_safe_command ?? 'All live carrier gates are verified. Run read-only doctor/start verification.',
    audit_log: {
      path: relativeToTarget(context, paths.auditLog),
      event_count: readJsonl(paths.auditLog).length,
    },
    planned_mutations: [],
    created_or_changed: [],
  };
}

function runCarrier({ carrierId, mode, options, planBuilder, applier, verifier, recoverer }) {
  const context = buildContext(carrierId, mode, options);
  let lifecycle = createSiteLiveCarrierLifecycle();
  lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, 'planning');
  const refusals = validateSharedContext(context, options);
  const plan = planBuilder(context, options);
  lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, 'planned');
  const result = baseResult(context, plan, refusals);
  const withLifecycle = (value) => ({
    ...value,
    lifecycle_state: lifecycle.state,
    lifecycle_history: lifecycle.history,
  });

  if (result.refusals.length > 0) {
    lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, 'refused');
    return withLifecycle({ ...result, status: 'refused', recovery_hint: recoveryHint(carrierId, result.refusals) });
  }
  if (mode === 'plan') return withLifecycle({ ...result, status: 'planned' });
  if (mode === 'verify') {
    lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, 'verifying');
    const verified = verifier(context, plan, result);
    lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, verified.status === 'verified' ? 'verified' : verified.status === 'refused' ? 'refused' : 'failed');
    return withLifecycle(verified);
  }
  if (mode === 'recover') {
    lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, 'recovering');
    const recovered = recoverer(context, plan, result);
    lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, recovered.status === 'recovered' ? 'recovered' : recovered.status === 'refused' ? 'refused' : 'failed');
    return withLifecycle(recovered);
  }

  if (mode === 'apply' && options.mutation_authorized !== true) {
    lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, 'refused');
    return withLifecycle({
      ...result,
      status: 'refused',
      refusals: ['write_authority_missing: set mutation_authorized true under receiving-Site authority'],
      recovery_hint: 'Run plan first, then apply only from the receiving Site or receiving folder authority.',
    });
  }

  lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, 'applying');
  const applied = applier(context, plan, result);
  lifecycle = transitionSiteLiveCarrierLifecycle(lifecycle, applied.status === 'applied' ? 'applied' : applied.status === 'refused' ? 'refused' : 'failed');
  if (mode === 'apply') {
    appendAudit(context, {
      carrier_id: carrierId,
      event: 'lifecycle_transition',
      status: applied.status,
      lifecycle_state: lifecycle.state,
      lifecycle_history: lifecycle.history,
    });
  }
  return withLifecycle(applied);
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
    authorityOwner: 'receiving_site',
    authorityBasis: options.authority_basis ?? null,
    sourceSiteRoot: options.source_site_root ? normalizePath(options.source_site_root) : null,
    paths: carrierPaths(targetSiteRoot),
    options,
  };
}

function buildLocalDbPlan(context) {
  const dbState = inspectJsonFile(context.paths.localDb);
  const compatible = dbState.status === 'missing'
    || (dbState.status === 'json' && dbState.value?.site_id === context.siteId && dbState.value?.schema_version === LOCAL_DB_SCHEMA_VERSION);
  const planned = [
    mutationRecord(context.paths.localDb, dbState.status === 'missing' ? 'create' : compatible ? 'ensure_current' : 'refuse'),
    mutationRecord(context.paths.migrationLedger, 'append_idempotent_migration_entry'),
    mutationRecord(context.paths.auditLog, 'append_audit_event'),
  ];
  const refusals = compatible ? [] : ['existing_db_incompatible_or_belongs_to_another_site'];
  return {
    planned_mutations: planned,
    created_or_changed: [],
    audit_evidence: {
      plan_id: stablePlanId(context, 'local-db'),
      db_path: relativeToTarget(context, context.paths.localDb),
      migration_ledger_path: relativeToTarget(context, context.paths.migrationLedger),
      schema_version: LOCAL_DB_SCHEMA_VERSION,
      tables: LOCAL_DB_TABLES,
      existing_db_status: dbState.status,
    },
    refusals,
  };
}

function applyLocalDbPlan(context, plan, result) {
  if (plan.refusals.length > 0) return refusedFromPlan(result, plan.refusals);
  fs.mkdirSync(path.dirname(context.paths.localDb), { recursive: true });
  fs.mkdirSync(path.dirname(context.paths.auditLog), { recursive: true });

  const before = inspectJsonFile(context.paths.localDb);
  const dbDoc = {
    schema: 'narada.site_local_db.v0',
    schema_version: LOCAL_DB_SCHEMA_VERSION,
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    created_by_carrier: LOCAL_DB_CARRIER_ID,
    tables: Object.fromEntries(LOCAL_DB_TABLES.map((name) => [name, []])),
    migration_ledger: [{ migration: 'create_site_local_db_v0', status: 'applied' }],
  };
  if (before.status === 'missing') {
    writeJson(context.paths.localDb, dbDoc);
    appendJsonl(context.paths.migrationLedger, migrationEvent(context, 'applied'));
  }

  const verify = verifyLocalDbPlan(context, plan, result);
  const changed = before.status === 'missing'
    ? [relativeToTarget(context, context.paths.localDb), relativeToTarget(context, context.paths.migrationLedger)]
    : [];
  appendAudit(context, {
    carrier_id: LOCAL_DB_CARRIER_ID,
    event: 'apply',
    status: verify.status,
    changed,
    verify: verify.audit_evidence.verification,
  });
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
  let recoveryStatus = 'absent';
  if (db.status === 'json' && db.value?.site_id === context.siteId && db.value?.schema_version === LOCAL_DB_SCHEMA_VERSION) recoveryStatus = 'compatible_seed';
  else if (db.status === 'json') recoveryStatus = 'incompatible_state';
  else if (db.status === 'invalid_json') recoveryStatus = 'incomplete_seed';
  return {
    ...result,
    status: recoveryStatus === 'incompatible_state' ? 'refused' : 'recovered',
    recovery_classification: recoveryStatus,
    recovery_hint: recoveryStatus === 'compatible_seed' ? 'Run verify; apply is idempotent.' : 'Repair requires a separate explicit repair carrier.',
  };
}

function buildStoragePlan(context, options) {
  const manifest = inspectJsonFile(context.paths.hydrationManifest);
  const handoffDisposition = options.handoff_material
    ? options.handoff_as_checkpoint_truth === true ? 'rejected_checkpoint_truth_request' : 'external_orientation_pending_admission'
    : 'none';
  const refusals = [];
  if (options.db_init_verified !== true) refusals.push('db_init_verification_missing');
  if (options.handoff_as_checkpoint_truth === true) refusals.push('handoff_material_must_remain_pending_orientation');
  if (manifest.status === 'json' && manifest.value?.site_id && manifest.value.site_id !== context.siteId) {
    refusals.push('existing_hydration_manifest_belongs_to_another_site');
  }
  return {
    planned_mutations: [
      ...STORAGE_DIRS.map((item) => mutationRecord(path.join(context.targetSiteRoot, item), 'ensure_directory')),
      ...STORAGE_FILES.map((item) => mutationRecord(path.join(context.targetSiteRoot, item), 'ensure_file')),
      mutationRecord(context.paths.auditLog, 'append_audit_event'),
    ],
    created_or_changed: [],
    audit_evidence: {
      plan_id: stablePlanId(context, 'storage'),
      hydration_manifest_path: relativeToTarget(context, context.paths.hydrationManifest),
      handoff_disposition: handoffDisposition,
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
  const files = storageFileContents(context, plan);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(context.targetSiteRoot, relative);
    if (!fs.existsSync(absolute)) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content, 'utf8');
      changed.push(relative);
    }
  }
  appendAudit(context, {
    carrier_id: STORAGE_CARRIER_ID,
    event: 'apply',
    status: 'applied',
    changed,
    handoff_disposition: plan.audit_evidence.handoff_disposition,
  });
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
  const manifest = mcpRegistrationManifest(context, context.options, plan);
  const before = inspectJsonFile(context.paths.mcpRegistrationManifest);
  const changed = [];
  if (before.status === 'missing' || JSON.stringify(before.value) !== JSON.stringify(manifest)) {
    fs.mkdirSync(path.dirname(context.paths.mcpRegistrationManifest), { recursive: true });
    fs.writeFileSync(context.paths.mcpRegistrationManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    changed.push(relativeToTarget(context, context.paths.mcpRegistrationManifest));
  }
  appendAudit(context, {
    carrier_id: MCP_REGISTRATION_CARRIER_ID,
    event: 'apply',
    status: 'applied',
    changed,
    restart_required: plan.audit_evidence.restart_required,
  });
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
    recovery_hint: ok ? null : 'Run MCP registration apply under receiving runtime/carrier authority, or recover to classify partial registration state.',
  };
}

function recoverMcpRegistrationPlan(context, plan, result) {
  const manifest = inspectJsonFile(context.paths.mcpRegistrationManifest);
  const classification = manifest.status === 'missing'
    ? 'absent'
    : manifest.status === 'json' && manifest.value?.site_id === context.siteId
      ? 'compatible_seed'
      : manifest.status === 'json'
        ? 'incompatible_state'
        : 'incomplete_seed';
  return {
    ...result,
    status: classification === 'incompatible_state' ? 'refused' : 'recovered',
    recovery_classification: classification,
    recovery_hint: classification === 'compatible_seed' ? 'Run verify; apply is idempotent.' : 'Repair requires a separate explicit registration repair carrier.',
  };
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
  if (!sameOrParent(path.join(siteControlRoot(context.targetSiteRoot), 'profile'), artifactPath)) {
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
  const artifactPath = path.join(context.targetSiteRoot, plan.audit_evidence.profile_artifact_path);
  const before = fs.existsSync(artifactPath) ? fs.readFileSync(artifactPath, 'utf8') : null;
  const binding = windowsProfileBinding(context, context.options);
  const next = `${JSON.stringify(binding, null, 2)}\n`;
  const changed = [];
  if (before !== next) {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
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
    fs.writeFileSync(artifactPath, next, 'utf8');
    changed.push(relativeToTarget(context, artifactPath));
  }
  appendAudit(context, {
    carrier_id: WINDOWS_PROFILE_CARRIER_ID,
    event: 'apply',
    status: 'applied',
    changed,
    restart_or_new_shell_required: true,
  });
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
  const binding = inspectJsonFile(artifactPath);
  const preimage = inspectJsonFile(context.paths.profilePreimage);
  const classification = binding.status === 'missing'
    ? 'absent'
    : binding.status === 'json' && binding.value?.site_id === context.siteId
      ? 'compatible_seed'
      : binding.status === 'json'
        ? 'incompatible_state'
        : 'incomplete_seed';
  return {
    ...result,
    status: classification === 'incompatible_state' ? 'refused' : 'recovered',
    recovery_classification: classification,
    audit_evidence: { ...plan.audit_evidence, preimage_available: preimage.status === 'json' },
    recovery_hint: classification === 'compatible_seed' ? 'Run verify; apply is idempotent.' : 'Preimage restore requires explicit profile repair authority.',
  };
}

function validateSharedContext(context, options) {
  const refusals = [];
  if (!context.authorityBasis) refusals.push('authority_basis_required');
  if (!isDirectory(context.targetSiteRoot)) refusals.push('target_site_root_not_found');
  if (isSuspiciousRoot(context.targetSiteRoot)) refusals.push('target_site_root_suspicious');
  if (!isDirectory(siteControlRoot(context.targetSiteRoot))) refusals.push('target_site_seed_missing');
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

function storageFileContents(context, plan) {
  const manifest = {
    schema: 'narada.site_local_storage_hydration_manifest.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: STORAGE_CARRIER_ID,
    handoff_disposition: plan.audit_evidence.handoff_disposition,
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
    auditLog: path.join(targetSiteRoot, '.narada/admission/live-carrier-audit.jsonl'),
  };
}

function doctorGateLocalDb(context) {
  const db = inspectJsonFile(context.paths.localDb);
  const verified = db.status === 'json'
    && db.value?.site_id === context.siteId
    && db.value?.target_site_root === context.targetSiteRoot
    && db.value?.schema_version === LOCAL_DB_SCHEMA_VERSION;
  return {
    carrier_id: LOCAL_DB_CARRIER_ID,
    status: verified ? 'verified' : 'missing_or_unverified',
    evidence_paths: [relativeToTarget(context, context.paths.localDb), relativeToTarget(context, context.paths.migrationLedger)],
    verification: {
      db_status: db.status,
      belongs_to_site_id: db.value?.site_id ?? null,
      belongs_to_target_site_root: db.value?.target_site_root ?? null,
      schema_version: db.value?.schema_version ?? null,
    },
    missing_authority_or_evidence: verified ? [] : ['authority_basis', 'mutation_authorized_for_apply'],
    next_safe_command: liveCarrierCommand(context, LOCAL_DB_CARRIER_ID, 'plan', ['--authority-basis <basis>']),
  };
}

function doctorGateStorage(context) {
  const manifest = inspectJsonFile(context.paths.hydrationManifest);
  const missingDirs = STORAGE_DIRS.filter((item) => !isDirectory(path.join(context.targetSiteRoot, item)));
  const verified = manifest.status === 'json'
    && manifest.value?.site_id === context.siteId
    && manifest.value?.target_site_root === context.targetSiteRoot
    && missingDirs.length === 0;
  return {
    carrier_id: STORAGE_CARRIER_ID,
    status: verified ? 'verified' : 'missing_or_unverified',
    evidence_paths: [relativeToTarget(context, context.paths.hydrationManifest)],
    verification: {
      manifest_status: manifest.status,
      belongs_to_site_id: manifest.value?.site_id ?? null,
      belongs_to_target_site_root: manifest.value?.target_site_root ?? null,
      missing_dirs: missingDirs,
    },
    missing_authority_or_evidence: verified ? [] : ['db_init_verified', 'authority_basis', 'mutation_authorized_for_apply'],
    next_safe_command: liveCarrierCommand(context, STORAGE_CARRIER_ID, 'plan', ['--authority-basis <basis>', '--db-init-verified']),
  };
}

function doctorGateMcp(context) {
  const manifest = inspectJsonFile(context.paths.mcpRegistrationManifest);
  const verified = manifest.status === 'json'
    && manifest.value?.site_id === context.siteId
    && manifest.value?.target_site_root === context.targetSiteRoot
    && Array.isArray(manifest.value?.mcp_servers);
  return {
    carrier_id: MCP_REGISTRATION_CARRIER_ID,
    status: verified ? 'verified' : 'missing_or_unverified',
    evidence_paths: [relativeToTarget(context, context.paths.mcpRegistrationManifest)],
    verification: {
      manifest_status: manifest.status,
      belongs_to_site_id: manifest.value?.site_id ?? null,
      belongs_to_target_site_root: manifest.value?.target_site_root ?? null,
      runtime_target: manifest.value?.runtime_target ?? null,
      server_count: Array.isArray(manifest.value?.mcp_servers) ? manifest.value.mcp_servers.length : 0,
      stale_live_pressure: manifest.value?.stale_live_pressure ?? null,
    },
    missing_authority_or_evidence: verified ? [] : ['db_verified', 'storage_verified', 'runtime_target', 'mcp_server_descriptors', 'authority_basis', 'mutation_authorized_for_apply'],
    next_safe_command: liveCarrierCommand(context, MCP_REGISTRATION_CARRIER_ID, 'plan', ['--authority-basis <basis>', '--db-verified', '--storage-verified', '--runtime-target <carrier>', "--mcp-server-json '[{...}]'"]),
  };
}

function doctorGateProfile(context) {
  const binding = inspectJsonFile(context.paths.windowsProfileBinding);
  const verified = binding.status === 'json'
    && binding.value?.site_id === context.siteId
    && binding.value?.target_site_root === context.targetSiteRoot
    && binding.value?.carrier_id === WINDOWS_PROFILE_CARRIER_ID;
  return {
    carrier_id: WINDOWS_PROFILE_CARRIER_ID,
    status: verified ? 'verified' : 'missing_or_unverified',
    evidence_paths: [relativeToTarget(context, context.paths.windowsProfileBinding), relativeToTarget(context, context.paths.profilePreimage)],
    verification: {
      binding_status: binding.status,
      belongs_to_site_id: binding.value?.site_id ?? null,
      belongs_to_target_site_root: binding.value?.target_site_root ?? null,
      profile_target: binding.value?.profile_target ?? null,
    },
    missing_authority_or_evidence: verified ? [] : ['mcp_registration_verified', 'pc_or_profile_authority_basis', 'mutation_authorized_for_apply'],
    next_safe_command: liveCarrierCommand(context, WINDOWS_PROFILE_CARRIER_ID, 'plan', ['--authority-basis <basis>', '--mcp-registration-verified']),
  };
}

function liveCarrierCommand(context, carrierId, mode, extraArgs = []) {
  return [
    'node tools/site-init/site-live-carriers.mjs',
    '--carrier', carrierId,
    '--mode', mode,
    '--target-site-root', JSON.stringify(context.targetSiteRoot),
    '--site-id', context.siteId,
    ...extraArgs,
  ].join(' ');
}

function mcpRegistrationManifest(context, options, plan) {
  const descriptors = normalizeMcpServerDescriptors(options.mcp_server_descriptors)
    .map((descriptor) => withSiteAccessPolicyAllowedRoots(descriptor, context));
  return {
    schema: 'narada.site_mcp_registration.v0',
    site_id: context.siteId,
    target_site_root: context.targetSiteRoot,
    carrier_id: MCP_REGISTRATION_CARRIER_ID,
    runtime_target: stringOption(options.runtime_target),
    mcp_servers: descriptors,
    restart_required: plan.audit_evidence.restart_required,
    stale_live_pressure: plan.audit_evidence.restart_required ? 'pending_external_restart_or_reprobe' : 'not_required',
  };
}

function normalizeMcpServerDescriptors(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      name: stringOption(item.name) ?? 'mcp-server',
      transport: stringOption(item.transport) ?? 'stdio',
      command: stringOption(item.command) ?? null,
      args: Array.isArray(item.args) ? item.args.map(String) : [],
      entrypoint: stringOption(item.entrypoint) ?? null,
      grants_broader_authority: item.grants_broader_authority === true,
    }));
}

function withSiteAccessPolicyAllowedRoots(descriptor, context) {
  if (!descriptorNeedsAllowedRoots(descriptor)) return descriptor;
  const policyRoots = siteAccessPolicyAllowedRoots(context);
  if (policyRoots.length === 0) return descriptor;
  const args = [...(descriptor.args ?? [])];
  const existingRoots = allowedRootsFromArgs(args);
  const roots = uniqueStrings([...existingRoots, ...policyRoots]);
  for (const root of roots) {
    if (!existingRoots.includes(root)) args.push('--allowed-root', root);
  }
  return {
    ...descriptor,
    args,
    allowed_root: roots[0] ?? null,
    allowed_roots: roots,
    allowed_roots_source: 'site_access_policy',
  };
}

function descriptorNeedsAllowedRoots(descriptor) {
  const name = String(descriptor?.name ?? '').toLowerCase();
  const entrypoint = String(descriptor?.entrypoint ?? '').toLowerCase();
  const args = descriptor?.args ?? [];
  if (allowedRootsFromArgs(args).length > 0) return true;
  return [
    'local-filesystem',
    'structured-command',
    'worker-delegation',
    'delegated-task',
    'git',
  ].some((needle) => name.includes(needle) || entrypoint.includes(needle));
}

function allowedRootsFromArgs(args) {
  const roots = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--allowed-root' && typeof args[index + 1] === 'string') roots.push(normalizePath(args[index + 1]));
  }
  return uniqueStrings(roots);
}

function siteAccessPolicyAllowedRoots(context) {
  const policy = readSiteAccessPolicy(context);
  if (!policy) return [];
  const entries = Array.isArray(policy?.allowed_roots) ? policy.allowed_roots : [];
  const roots = entries
    .filter((entry) => entry && typeof entry === 'object')
    .filter((entry) => Array.isArray(entry.access) && entry.access.includes('write'))
    .map((entry) => stringOption(entry.path))
    .filter(Boolean)
    .map((root) => normalizePath(root))
    .filter((root) => !looksLikeSecretFile(root));
  return uniqueStrings([context.targetSiteRoot, ...roots]);
}

function readSiteAccessPolicy(context) {
  for (const policyPath of siteAccessPolicyCandidatePaths(context)) {
    const policy = inspectJsonFile(policyPath);
    if (policy.status === 'json') return policy.value;
  }
  return null;
}

function siteAccessPolicyCandidatePaths(context) {
  const siteSlug = String(context.siteId ?? '').toLowerCase();
  return uniqueStrings([
    path.join(context.targetSiteRoot, '.narada/capabilities/site-access-policy.json'),
    siteSlug ? path.join(context.targetSiteRoot, `.narada/capabilities/${siteSlug}-access-policy.json`) : null,
  ].filter(Boolean));
}

function looksLikeSecretFile(root) {
  return /(^|[\\/])\.env$/i.test(root) || /secret|credential|token/i.test(root);
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
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
  fs.mkdirSync(path.dirname(context.paths.auditLog), { recursive: true });
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

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function mutationRecord(absolutePath, action) {
  return { action, path: absolutePath };
}

function refusedFromPlan(result, refusals) {
  return { ...result, status: 'refused', refusals, recovery_hint: 'Resolve refusal conditions and rerun plan.' };
}

function recoveryHint(carrierId, refusals) {
  if (refusals.includes('target_site_seed_missing')) return 'Run narada init --yes in the receiving folder before live carriers.';
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
    if (arg === '--doctor') options.doctor = true;
    else if (arg === '--carrier') options.carrier = argv[++i];
    else if (arg === '--mode') options.mode = argv[++i];
    else if (arg === '--target-site-root') options.target_site_root = argv[++i];
    else if (arg === '--site-id') options.site_id = argv[++i];
    else if (arg === '--authority-basis') options.authority_basis = argv[++i];
    else if (arg === '--source-site-root') options.source_site_root = argv[++i];
    else if (arg === '--runtime-target') options.runtime_target = argv[++i];
    else if (arg === '--mcp-server-json') options.mcp_server_descriptors = JSON.parse(argv[++i]);
    else if (arg === '--mcp-server-json-file') options.mcp_server_descriptors = readMcpServerDescriptorsFile(argv[++i]);
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
    else throw new Error(`unsupported_argument: ${arg}`);
  }
  return options;
}

function readMcpServerDescriptorsFile(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.mcp_servers)) return parsed.mcp_servers;
  throw new Error(`mcp_server_json_file_must_be_array_or_manifest: ${filePath}`);
}

function runCli(argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr) {
  try {
    const options = parseArgs(argv);
    const result = options.doctor || options.carrier === 'site_live_path_doctor'
      ? siteLivePathDoctor(options)
      : options.carrier === LOCAL_DB_CARRIER_ID
      ? siteLocalDbCarrier(options)
      : options.carrier === STORAGE_CARRIER_ID
        ? siteLocalStorageHydrationCarrier(options)
        : options.carrier === MCP_REGISTRATION_CARRIER_ID
          ? siteMcpRegistrationCarrier(options)
          : options.carrier === WINDOWS_PROFILE_CARRIER_ID
            ? windowsProfileSiteBindingCarrier(options)
            : { schema: CARRIER_SCHEMA, status: 'refused', refusals: ['carrier_required_or_unknown'] };
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === 'refused' ? 2 : 0;
  } catch (error) {
    stderr.write(`${JSON.stringify({ schema: CARRIER_SCHEMA, status: 'refused', refusals: [error.message] })}\n`);
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
  siteLocalDbCarrier,
  siteLocalStorageHydrationCarrier,
  siteMcpRegistrationCarrier,
  windowsProfileSiteBindingCarrier,
  siteLivePathDoctor,
  parseArgs,
  runCli,
};
