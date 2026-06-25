import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LOCAL_DB_CARRIER_ID,
  MCP_REGISTRATION_CARRIER_ID,
  STORAGE_CARRIER_ID,
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
} from './site-live-carriers.mjs';

function tempSite(name = 'narada-proper-site-live-carriers') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  fs.mkdirSync(path.join(root, '.narada/admission'), { recursive: true });
  fs.mkdirSync(path.join(root, '.narada/capabilities'), { recursive: true });
  fs.writeFileSync(path.join(root, '.narada/site.json'), JSON.stringify({
    schema: 'narada.site.v0',
    site_id: path.basename(root).toLowerCase(),
    authority_root: root,
  }, null, 2));
  return root;
}

function dbOptions(root, overrides = {}) {
  return {
    target_site_root: root,
    site_id: path.basename(root).toLowerCase(),
    authority_basis: 'test_receiving_site_authority',
    ...overrides,
  };
}

function storageOptions(root, overrides = {}) {
  return {
    target_site_root: root,
    site_id: path.basename(root).toLowerCase(),
    authority_basis: 'test_receiving_site_authority',
    db_init_verified: true,
    ...overrides,
  };
}

function mcpOptions(root, overrides = {}) {
  return {
    target_site_root: root,
    site_id: path.basename(root).toLowerCase(),
    authority_basis: 'test_runtime_carrier_authority',
    db_verified: true,
    storage_verified: true,
    runtime_target: 'codex',
    mcp_server_descriptors: [{
      name: 'site-doctor',
      transport: 'stdio',
      command: 'node',
      args: ['tools/site-init/site-doctor.mjs'],
      entrypoint: path.join(root, 'tools/site-init/site-doctor.mjs'),
    }],
    ...overrides,
  };
}

function profileOptions(root, overrides = {}) {
  return {
    target_site_root: root,
    site_id: path.basename(root).toLowerCase(),
    authority_basis: 'test_windows_profile_authority',
    mcp_registration_verified: true,
    ...overrides,
  };
}

test('local DB carrier plans exact target mutations without writes by default', () => {
  const root = tempSite();
  const result = siteLocalDbCarrier(dbOptions(root));

  assert.equal(result.schema, 'narada.site_live_carrier.result.v0');
  assert.equal(result.carrier_id, LOCAL_DB_CARRIER_ID);
  assert.equal(result.mode, 'plan');
  assert.equal(result.status, 'planned');
  assert.deepEqual(result.created_or_changed, []);
  assert.equal(fs.existsSync(path.join(root, '.narada/state/local-db/site-local-db.json')), false);
  assert.ok(result.planned_mutations.some((entry) => entry.path.endsWith('site-local-db.json')));
});

test('local DB carrier apply is authority gated, idempotent, and source import refusing', () => {
  const root = tempSite();
  const source = tempSite('source-site');

  const refused = siteLocalDbCarrier(dbOptions(root, { mode: 'apply' }));
  assert.equal(refused.status, 'refused');
  assert.ok(refused.refusals.includes('write_authority_missing'));

  const sourceImport = siteLocalDbCarrier(dbOptions(root, {
    source_site_root: source,
    import_source_runtime_state: true,
  }));
  assert.equal(sourceImport.status, 'refused');
  assert.ok(sourceImport.refusals.includes('source_runtime_state_import_refused'));

  const first = siteLocalDbCarrier(dbOptions(root, { mode: 'apply', mutation_authorized: true }));
  assert.equal(first.status, 'applied');
  assert.ok(first.created_or_changed.includes('.narada/state/local-db/site-local-db.json'));

  const second = siteLocalDbCarrier(dbOptions(root, { mode: 'apply', mutation_authorized: true }));
  assert.equal(second.status, 'applied');
  assert.deepEqual(second.created_or_changed, []);

  const verify = siteLocalDbCarrier(dbOptions(root, { mode: 'verify' }));
  assert.equal(verify.status, 'verified');
});

test('storage hydration requires DB verification and refuses checkpoint-truth handoff', () => {
  const root = tempSite();
  const missingDb = siteLocalStorageHydrationCarrier(storageOptions(root, { db_init_verified: false }));
  assert.equal(missingDb.status, 'refused');
  assert.ok(missingDb.refusals.includes('db_init_verification_missing'));

  const checkpointTruth = siteLocalStorageHydrationCarrier(storageOptions(root, {
    handoff_material: { source_ref: 'external-packet' },
    handoff_as_checkpoint_truth: true,
  }));
  assert.equal(checkpointTruth.status, 'refused');
  assert.ok(checkpointTruth.refusals.includes('handoff_material_must_remain_pending_orientation'));

  const applied = siteLocalStorageHydrationCarrier(storageOptions(root, { mode: 'apply', mutation_authorized: true }));
  assert.equal(applied.status, 'applied');
  assert.ok(applied.created_or_changed.includes('.narada/hydration/hydration-manifest.json'));

  const verify = siteLocalStorageHydrationCarrier(storageOptions(root, { mode: 'verify' }));
  assert.equal(verify.status, 'verified');
});

test('MCP registration carrier applies target-local manifest and refuses broader or source authority', () => {
  const root = tempSite();
  const source = tempSite('source-site');

  const missingGate = siteMcpRegistrationCarrier(mcpOptions(root, { db_verified: false }));
  assert.equal(missingGate.status, 'refused');
  assert.ok(missingGate.refusals.includes('db_and_storage_verification_required'));

  const broad = siteMcpRegistrationCarrier(mcpOptions(root, {
    mcp_server_descriptors: [{ name: 'broad', grants_broader_authority: true }],
  }));
  assert.equal(broad.status, 'refused');
  assert.ok(broad.refusals.includes('mcp_registration_broader_authority_refused'));

  const sourceReuse = siteMcpRegistrationCarrier(mcpOptions(root, {
    source_site_root: source,
    mcp_server_descriptors: [{ name: 'source', entrypoint: path.join(source, 'tools/source.mjs') }],
  }));
  assert.equal(sourceReuse.status, 'refused');
  assert.ok(sourceReuse.refusals.includes('source_site_mcp_entrypoint_reuse_requires_admitted_lift_packet'));

  const applied = siteMcpRegistrationCarrier(mcpOptions(root, { mode: 'apply', mutation_authorized: true }));
  assert.equal(applied.status, 'applied');
  assert.ok(applied.created_or_changed.includes('.narada/capabilities/mcp-registration.json'));

  const verify = siteMcpRegistrationCarrier(mcpOptions(root, { mode: 'verify' }));
  assert.equal(verify.status, 'verified');
  assert.equal(verify.audit_evidence.verification.server_count, 1);
});

test('MCP registration carrier admits policy write roots for bounded local surfaces', () => {
  const root = tempSite('policy-root-mcp-carrier');
  const siteId = path.basename(root).toLowerCase();
  const admittedRoot = path.join(root, 'admitted-workspace');
  const readOnlyEnv = path.join(root, '.narada', '.env');
  fs.writeFileSync(path.join(root, `.narada/capabilities/${siteId}-access-policy.json`), JSON.stringify({
    schema: 'narada.site.access_policy_admission.v0',
    site_id: siteId,
    policy_kind: 'filesystem_root_access',
    allowed_roots: [
      { path: root, access: ['read', 'write'], purpose: 'site root' },
      { path: admittedRoot, access: ['read', 'write'], purpose: 'admitted workspace' },
      { path: readOnlyEnv, access: ['read'], purpose: 'read-only credential file' },
    ],
  }, null, 2));

  const applied = siteMcpRegistrationCarrier(mcpOptions(root, {
    mode: 'apply',
    mutation_authorized: true,
    mcp_server_descriptors: [{
      name: 'narada-test-local-filesystem',
      transport: 'stdio',
      command: 'node',
      args: ['D:/code/mcp-surfaces/packages/local-filesystem-mcp/dist/src/main.js', '--mode', 'write'],
      entrypoint: 'D:/code/mcp-surfaces/packages/local-filesystem-mcp/dist/src/main.js',
      surface_class: 'site_local_policy_gated_filesystem_write',
    }],
  }));

  assert.equal(applied.status, 'applied');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.narada/capabilities/mcp-registration.json'), 'utf8'));
  const [server] = manifest.mcp_servers;
  assert.equal(server.surface_class, 'site_local_policy_gated_filesystem_write');
  assert.equal(server.allowed_roots_source, 'site_access_policy');
  assert.deepEqual(server.allowed_roots, [root, admittedRoot]);
  assert.equal(server.args.filter((arg) => arg === '--allowed-root').length, 2);
  assert.ok(server.args.includes(root));
  assert.ok(server.args.includes(admittedRoot));
  assert.equal(server.args.includes(readOnlyEnv), false);
});

test('Windows profile binding carrier is profile-authority gated and target-local', () => {
  const root = tempSite();

  const missingMcp = windowsProfileSiteBindingCarrier(profileOptions(root, { mcp_registration_verified: false }));
  assert.equal(missingMcp.status, 'refused');
  assert.ok(missingMcp.refusals.includes('mcp_registration_verification_required'));

  const secret = windowsProfileSiteBindingCarrier(profileOptions(root, { include_secrets: true }));
  assert.equal(secret.status, 'refused');
  assert.ok(secret.refusals.includes('profile_secret_capture_refused'));

  const outOfScope = windowsProfileSiteBindingCarrier(profileOptions(root, {
    profile_artifact_path: path.join(root, '.narada/outside-profile.json'),
  }));
  assert.equal(outOfScope.status, 'refused');
  assert.ok(outOfScope.refusals.includes('profile_artifact_path_outside_admitted_scope'));

  const applied = windowsProfileSiteBindingCarrier(profileOptions(root, { mode: 'apply', mutation_authorized: true }));
  assert.equal(applied.status, 'applied');
  assert.ok(applied.created_or_changed.includes('.narada/profile/windows-profile-binding.json'));

  const verify = windowsProfileSiteBindingCarrier(profileOptions(root, { mode: 'verify' }));
  assert.equal(verify.status, 'verified');
});

test('agent-context memory carrier creates empty target-local memory store and refuses source state import', () => {
  const root = tempSite('agent-context-memory-carrier');
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'source-agent-context-'));

  const refused = agentContextMemoryLocalStorageCarrier({
    target_site_root: root,
    site_id: 'agent-memory-site',
    authority_basis: 'test_agent_memory_authority',
    db_verified: true,
    storage_verified: true,
    import_source_runtime_state: true,
    source_site_root: source,
    mutation_authorized: true,
    mode: 'apply',
  });
  assert.equal(refused.status, 'refused');
  assert.ok(refused.refusals.includes('source_runtime_state_import_refused'));

  const applied = agentContextMemoryLocalStorageCarrier({
    target_site_root: root,
    site_id: 'agent-memory-site',
    authority_basis: 'test_agent_memory_authority',
    db_verified: true,
    storage_verified: true,
    mutation_authorized: true,
    mode: 'apply',
  });
  assert.equal(applied.status, 'applied');
  assert.deepEqual(applied.created_or_changed, [
    '.narada/agent-context-memory/memory-store.json',
    '.narada/agent-context-memory/hydration-policy.json',
  ]);
  const store = JSON.parse(fs.readFileSync(path.join(root, '.narada/agent-context-memory/memory-store.json'), 'utf8'));
  assert.equal(store.package_owns_sqlite_dependency, false);
  assert.equal(store.source_state_imported, false);
  assert.deepEqual(store.checkpoints, []);
  const policy = JSON.parse(fs.readFileSync(path.join(root, '.narada/agent-context-memory/hydration-policy.json'), 'utf8'));
  assert.equal(policy.runtime_hydration_executed, false);
  assert.equal(policy.checkpoint_history_imported, false);
  assert.equal(policy.secrets_imported, false);
});

test('site inbox carrier creates empty target-local index and refuses source inbox import', () => {
  const root = tempSite('site-inbox-carrier');
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'source-inbox-'));

  const refused = siteInboxLocalSubstrateCarrier({
    target_site_root: root,
    site_id: 'site-inbox-site',
    authority_basis: 'test_site_inbox_authority',
    db_verified: true,
    storage_verified: true,
    import_source_runtime_state: true,
    source_site_root: source,
    mutation_authorized: true,
    mode: 'apply',
  });
  assert.equal(refused.status, 'refused');
  assert.ok(refused.refusals.includes('source_runtime_state_import_refused'));

  const applied = siteInboxLocalSubstrateCarrier({
    target_site_root: root,
    site_id: 'site-inbox-site',
    authority_basis: 'test_site_inbox_authority',
    db_verified: true,
    storage_verified: true,
    mutation_authorized: true,
    mode: 'apply',
  });
  assert.equal(applied.status, 'applied');
  assert.deepEqual(applied.created_or_changed, [
    '.narada/inbox/index.json',
    '.narada/inbox/publication-policy.json',
  ]);
  const index = JSON.parse(fs.readFileSync(path.join(root, '.narada/inbox/index.json'), 'utf8'));
  assert.equal(index.source_state_imported, false);
  assert.deepEqual(index.envelopes, []);
  const policy = JSON.parse(fs.readFileSync(path.join(root, '.narada/inbox/publication-policy.json'), 'utf8'));
  assert.equal(policy.publication_executed, false);
  assert.equal(policy.source_inbox_history_imported, false);
});

test('site config carrier creates empty target-local registry and refuses arbitrary scans', () => {
  const root = tempSite('site-config-carrier');

  const refused = siteConfigLocalRegistryCarrier({
    target_site_root: root,
    site_id: 'site-config-site',
    authority_basis: 'test_site_config_authority',
    db_verified: true,
    storage_verified: true,
    scan_external_roots: true,
    mutation_authorized: true,
    mode: 'apply',
  });
  assert.equal(refused.status, 'refused');
  assert.ok(refused.refusals.includes('arbitrary_client_project_scan_refused'));

  const applied = siteConfigLocalRegistryCarrier({
    target_site_root: root,
    site_id: 'site-config-site',
    authority_basis: 'test_site_config_authority',
    db_verified: true,
    storage_verified: true,
    mutation_authorized: true,
    mode: 'apply',
  });
  assert.equal(applied.status, 'applied');
  assert.deepEqual(applied.created_or_changed, [
    '.narada/site-config/known-sites.json',
    '.narada/site-config/probe-policy.json',
  ]);
  const registry = JSON.parse(fs.readFileSync(path.join(root, '.narada/site-config/known-sites.json'), 'utf8'));
  assert.equal(registry.source_state_imported, false);
  assert.deepEqual(registry.known_sites, []);
  const policy = JSON.parse(fs.readFileSync(path.join(root, '.narada/site-config/probe-policy.json'), 'utf8'));
  assert.equal(policy.external_probe_executed, false);
  assert.equal(policy.arbitrary_scan_admitted, false);
  assert.equal(policy.target_site_mutation_admitted, false);
});

test('site lift carrier creates empty target-local adoption catalog and refuses file copy', () => {
  const root = tempSite('site-lift-carrier');

  const refused = siteLiftLocalAdoptionCarrier({
    target_site_root: root,
    site_id: 'site-lift-site',
    authority_basis: 'test_site_lift_authority',
    db_verified: true,
    storage_verified: true,
    copy_files: true,
    mutation_authorized: true,
    mode: 'apply',
  });
  assert.equal(refused.status, 'refused');
  assert.ok(refused.refusals.includes('file_copy_requires_separate_admission'));

  const applied = siteLiftLocalAdoptionCarrier({
    target_site_root: root,
    site_id: 'site-lift-site',
    authority_basis: 'test_site_lift_authority',
    db_verified: true,
    storage_verified: true,
    mutation_authorized: true,
    mode: 'apply',
  });
  assert.equal(applied.status, 'applied');
  assert.deepEqual(applied.created_or_changed, [
    '.narada/site-lift/adoption-catalog.json',
    '.narada/site-lift/materialization-policy.json',
  ]);
  const catalog = JSON.parse(fs.readFileSync(path.join(root, '.narada/site-lift/adoption-catalog.json'), 'utf8'));
  assert.equal(catalog.source_state_imported, false);
  assert.deepEqual(catalog.adoption_candidates, []);
  const policy = JSON.parse(fs.readFileSync(path.join(root, '.narada/site-lift/materialization-policy.json'), 'utf8'));
  assert.equal(policy.files_copied, false);
  assert.equal(policy.packages_installed, false);
  assert.equal(policy.source_runtime_imported, false);
});

test('greenfield live path can run all four carriers without source Site state import', () => {
  const root = tempSite();

  const db = siteLocalDbCarrier(dbOptions(root, { mode: 'apply', mutation_authorized: true }));
  const storage = siteLocalStorageHydrationCarrier(storageOptions(root, { mode: 'apply', mutation_authorized: true }));
  const mcp = siteMcpRegistrationCarrier(mcpOptions(root, { mode: 'apply', mutation_authorized: true }));
  const profile = windowsProfileSiteBindingCarrier(profileOptions(root, { mode: 'apply', mutation_authorized: true }));

  assert.equal(db.status, 'applied');
  assert.equal(storage.status, 'applied');
  assert.equal(mcp.status, 'applied');
  assert.equal(profile.status, 'applied');
  assert.equal(fs.existsSync(path.join(root, '.ai')), false);
  assert.equal(fs.existsSync(path.join(root, '.narada/admission/live-carrier-audit.jsonl')), true);

  const auditLines = fs.readFileSync(path.join(root, '.narada/admission/live-carrier-audit.jsonl'), 'utf8').trim().split(/\r?\n/);
  assert.deepEqual(auditLines.map((line) => JSON.parse(line).carrier_id), [
    LOCAL_DB_CARRIER_ID,
    STORAGE_CARRIER_ID,
    MCP_REGISTRATION_CARRIER_ID,
    WINDOWS_PROFILE_CARRIER_ID,
  ]);
});
