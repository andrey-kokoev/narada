import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUDFLARE_SITE_REGISTRY_ADAPTER_KIND,
  CLOUDFLARE_SITE_REGISTRY_SCHEMA,
  createCloudflareSiteRegistryAdapter,
  createD1CloudflareSiteRegistry,
  normalizeOperationId,
  normalizeSiteId,
} from '../src/cloudflare-site-registry.mjs';

test('normalizes bounded site identifiers', () => {
  assert.equal(normalizeSiteId('site_alpha'), 'site_alpha');
  assert.equal(normalizeSiteId('a:b.c-1'), 'a:b.c-1');
  assert.equal(normalizeSiteId('x'), null);
  assert.equal(normalizeSiteId('../escape'), null);
  assert.equal(normalizeOperationId('operation_alpha'), 'operation_alpha');
  assert.equal(normalizeOperationId('x'), null);
});

test('creates reads and lists site operations behind site authority', async () => {
  const db = fakeD1SiteRegistryDatabase();
  const registry = createD1CloudflareSiteRegistry(db, { now: fixedNow });
  const owner = { principal_id: 'user:owner' };
  await registry.createSite({ site_id: 'site_operations', display_name: 'Operations Site', principal: owner });

  const created = await registry.handle({
    operation: 'operation.create',
    principal: owner,
    params: {
      site_id: 'site_operations',
      operation_id: 'operation_control',
      display_name: 'Control Operation',
      operation_kind: 'control',
      request_id: 'req_operation_create',
    },
  });
  assert.equal(created.ok, true);
  assert.equal(created.action, 'created');
  assert.equal(created.operation.operation_id, 'operation_control');
  assert.equal(created.operation.status, 'active');

  const read = await registry.handle({
    operation: 'operation.read',
    principal: owner,
    params: { site_id: 'site_operations', operation_id: 'operation_control' },
  });
  assert.equal(read.ok, true);
  assert.equal(read.operation.display_name, 'Control Operation');

  const listed = await registry.handle({
    operation: 'operation.list',
    principal: owner,
    params: { site_id: 'site_operations' },
  });
  assert.deepEqual(listed.operations.map((operation) => operation.operation_id), ['operation_control']);

  const siteRead = await registry.readSite({ site_id: 'site_operations', principal: owner });
  assert.deepEqual(siteRead.operations.map((operation) => operation.operation_id), ['operation_control']);
  assert.equal(siteRead.authority_events.some((event) => event.event_kind === 'site_operation_updated'), true);
});

test('rejects operation creation without owner or maintainer authority', async () => {
  const db = fakeD1SiteRegistryDatabase();
  const registry = createD1CloudflareSiteRegistry(db, { now: fixedNow });
  const owner = { principal_id: 'user:owner' };
  await registry.createSite({ site_id: 'site_operation_denied', display_name: 'Operation Denied Site', principal: owner });
  await registry.putSiteMembership({
    site_id: 'site_operation_denied',
    member_principal_id: 'user:viewer',
    role: 'viewer',
    principal: owner,
  });

  const denied = await registry.handle({
    operation: 'operation.create',
    principal: { principal_id: 'user:viewer' },
    params: {
      site_id: 'site_operation_denied',
      operation_id: 'operation_denied',
      display_name: 'Denied Operation',
      operation_kind: 'control',
    },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'site_authority_denied');

  const listed = await registry.handle({
    operation: 'operation.list',
    principal: { principal_id: 'user:viewer' },
    params: { site_id: 'site_operation_denied' },
  });
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.operations, []);
});

test('creates lists and reads authority-bearing sites', async () => {
  const registry = createD1CloudflareSiteRegistry(fakeD1SiteRegistryDatabase(), { now: fixedNow });
  const principal = { principal_id: 'user:owner' };
  const created = await registry.handle({
    operation: 'site.create',
    principal,
    params: {
      site_id: 'site_alpha',
      site_ref: 'cloudflare://site_alpha',
      display_name: 'Alpha Site',
      request_id: 'req_create_alpha',
    },
  });
  assert.equal(created.ok, true);
  assert.equal(created.action, 'created');
  assert.equal(created.site.site_id, 'site_alpha');
  assert.equal(created.site.site_ref, 'cloudflare://site_alpha');
  assert.equal(created.membership.role, 'owner');

  const listed = await registry.handle({ operation: 'site.list', principal });
  assert.deepEqual(listed.sites.map((site) => site.site_id), ['site_alpha']);

  const read = await registry.handle({ operation: 'site.read', principal, params: { site_id: 'site_alpha' } });
  assert.equal(read.ok, true);
  assert.equal(read.site.display_name, 'Alpha Site');
  assert.deepEqual(read.settings, {});
});

test('stores site settings behind site authority', async () => {
  const registry = createD1CloudflareSiteRegistry(fakeD1SiteRegistryDatabase(), { now: fixedNow });
  const principal = { principal_id: 'user:owner' };
  await registry.createSite({ site_id: 'site_settings', display_name: 'Settings Site', principal });
  const updated = await registry.handle({
    operation: 'site.settings.put',
    principal,
    params: { site_id: 'site_settings', setting_key: 'task_policy', value: { default_status: 'open' } },
  });
  assert.equal(updated.ok, true);
  const read = await registry.readSite({ site_id: 'site_settings', principal });
  assert.deepEqual(read.settings, { task_policy: { default_status: 'open' } });

  const denied = await registry.handle({
    operation: 'site.settings.put',
    principal: { principal_id: 'user:other' },
    params: { site_id: 'site_settings', setting_key: 'task_policy', value: {} },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'site_authority_denied');
});

test('puts site membership behind owner or maintainer authority', async () => {
  const db = fakeD1SiteRegistryDatabase();
  const registry = createD1CloudflareSiteRegistry(db, { now: fixedNow });
  const owner = { principal_id: 'user:owner' };
  await registry.createSite({ site_id: 'site_membership', display_name: 'Membership Site', principal: owner });

  const created = await registry.handle({
    operation: 'site.membership.put',
    principal: owner,
    params: {
      site_id: 'site_membership',
      member_principal_id: 'microsoft:tenant:operator',
      role: 'operator',
      request_id: 'req_member_create',
    },
  });
  assert.equal(created.ok, true);
  assert.equal(created.action, 'created');
  assert.equal(created.membership.principal_id, 'microsoft:tenant:operator');
  assert.equal(created.membership.role, 'operator');

  const read = await registry.readSite({ site_id: 'site_membership', principal: owner });
  assert.deepEqual(read.memberships.map((membership) => [membership.principal_id, membership.role]), [
    ['user:owner', 'owner'],
    ['microsoft:tenant:operator', 'operator'],
  ]);
  assert.equal(read.authority_events.some((event) => event.event_kind === 'site_membership_updated'), true);

  const updated = await registry.handle({
    operation: 'site.membership.put',
    principal: owner,
    params: {
      site_id: 'site_membership',
      member_principal_id: 'microsoft:tenant:operator',
      role: 'viewer',
      status: 'inactive',
      request_id: 'req_member_update',
    },
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.action, 'updated');
  assert.equal(updated.membership.role, 'viewer');
  assert.equal(updated.membership.status, 'inactive');
});

test('rejects invalid or unauthorized site membership updates', async () => {
  const db = fakeD1SiteRegistryDatabase();
  const registry = createD1CloudflareSiteRegistry(db, { now: fixedNow });
  const owner = { principal_id: 'user:owner' };
  await registry.createSite({ site_id: 'site_membership_denied', display_name: 'Membership Denied Site', principal: owner });

  const invalidRole = await registry.handle({
    operation: 'site.membership.put',
    principal: owner,
    params: { site_id: 'site_membership_denied', member_principal_id: 'user:viewer', role: 'admin' },
  });
  assert.equal(invalidRole.ok, false);
  assert.equal(invalidRole.code, 'invalid_site_role');

  const denied = await registry.handle({
    operation: 'site.membership.put',
    principal: { principal_id: 'user:other' },
    params: { site_id: 'site_membership_denied', member_principal_id: 'user:viewer', role: 'viewer' },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'site_authority_denied');
  assert.equal(db.dump().authorityEvents.some((event) => event.event_kind === 'site_membership_update_rejected'), true);
});

test('validates and records carrier session binding to registered site', async () => {
  const db = fakeD1SiteRegistryDatabase();
  const registry = createD1CloudflareSiteRegistry(db, { now: fixedNow });
  const principal = { principal_id: 'service', controlled_actions: ['*'] };
  await registry.createSite({ site_id: 'site_bound', site_ref: 'cloudflare://site_bound', display_name: 'Bound Site', principal });

  const admitted = await registry.validateCarrierSiteBinding({
    site_id: 'site_bound',
    site_ref: 'cloudflare://site_bound',
    carrier_session_id: 'carrier_session_bound',
    agent_id: 'narada.agent.bound',
    principal,
    request_id: 'req_bind_site',
  });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, 'bound');
  assert.equal(admitted.evidence.schema, CLOUDFLARE_SITE_REGISTRY_SCHEMA);
  assert.equal(admitted.evidence.action, 'admit');
  assert.equal(admitted.binding.site_id, 'site_bound');

  const reused = await registry.validateCarrierSiteBinding({
    site_id: 'site_bound',
    carrier_session_id: 'carrier_session_bound',
    agent_id: 'narada.agent.bound',
    principal,
  });
  assert.equal(reused.ok, true);
  assert.equal(reused.action, 'already_bound');

  const read = await registry.readSite({ site_id: 'site_bound', principal });
  assert.equal(read.ok, true);
  assert.equal(read.sessions[0].carrier_session_id, 'carrier_session_bound');
  assert.equal(read.authority_events.some((event) => event.event_kind === 'carrier_site_binding_admitted'), true);

  assert.equal(db.dump().carrierSessions.length, 1);
  assert.equal(db.dump().authorityEvents.some((event) => event.event_kind === 'carrier_site_binding_admitted'), true);
});

test('rejects carrier binding for missing site mismatched site and missing authority', async () => {
  const db = fakeD1SiteRegistryDatabase();
  const registry = createD1CloudflareSiteRegistry(db, { now: fixedNow });
  const owner = { principal_id: 'user:owner' };
  await registry.createSite({ site_id: 'site_owned', site_ref: 'cloudflare://site_owned', display_name: 'Owned Site', principal: owner });

  const missing = await registry.validateCarrierSiteBinding({
    site_id: 'site_missing',
    carrier_session_id: 'carrier_missing_site',
    agent_id: 'narada.agent',
    principal: owner,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'site_not_found');

  const mismatch = await registry.validateCarrierSiteBinding({
    site_id: 'site_owned',
    site_ref: 'cloudflare://different',
    carrier_session_id: 'carrier_mismatch',
    agent_id: 'narada.agent',
    principal: owner,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'site_ref_mismatch');

  const noAuthority = await registry.validateCarrierSiteBinding({
    site_id: 'site_owned',
    carrier_session_id: 'carrier_no_authority',
    agent_id: 'narada.agent',
    principal: { principal_id: 'user:other' },
  });
  assert.equal(noAuthority.ok, false);
  assert.equal(noAuthority.code, 'site_authority_denied');
  assert.equal(db.dump().authorityEvents.filter((event) => event.action === 'deny').length, 3);
});

test('creates adapter only when a D1 binding is present', async () => {
  assert.equal(createCloudflareSiteRegistryAdapter({}), null);
  const adapter = createCloudflareSiteRegistryAdapter({ CLOUDFLARE_SITE_REGISTRY_DB: fakeD1SiteRegistryDatabase() }, { now: fixedNow });
  assert.equal(adapter.adapter_kind, CLOUDFLARE_SITE_REGISTRY_ADAPTER_KIND);
  const created = await adapter.handle({
    operation: 'site.create',
    principal: { principal_id: 'service' },
    params: { site_id: 'site_adapter', display_name: 'Adapter Site' },
  });
  assert.equal(created.ok, true);
});

function fixedNow() {
  return '2026-06-07T00:00:00.000Z';
}

function fakeD1SiteRegistryDatabase() {
  const state = {
    sites: [],
    memberships: [],
    settings: [],
    operations: [],
    carrierSessions: [],
    authorityEvents: [],
  };
  return {
    prepare(sql) {
      return fakeD1Statement(state, sql);
    },
    dump() {
      return clone(state);
    },
  };
}

function fakeD1Statement(state, sql) {
  let bound = [];
  return {
    bind(...values) {
      bound = values;
      return this;
    },
    async run() {
      if (/^INSERT INTO cloudflare_sites/i.test(sql)) {
        const [siteId, siteRef, displayName, status, createdAt, updatedAt, createdByPrincipalId] = bound;
        if (!state.sites.some((site) => site.site_id === siteId)) {
          state.sites.push({ site_id: siteId, site_ref: siteRef, display_name: displayName, status, created_at: createdAt, updated_at: updatedAt, created_by_principal_id: createdByPrincipalId });
        }
      } else if (/^INSERT INTO cloudflare_site_memberships/i.test(sql)) {
        const [siteId, principalId, role, status, createdAt, updatedAt] = bound;
        const existing = state.memberships.find((membership) => membership.site_id === siteId && membership.principal_id === principalId);
        if (existing) {
          Object.assign(existing, { role, status, updated_at: updatedAt });
        } else {
          state.memberships.push({ site_id: siteId, principal_id: principalId, role, status, created_at: createdAt, updated_at: updatedAt });
        }
      } else if (/^INSERT INTO cloudflare_site_settings/i.test(sql)) {
        const [siteId, settingKey, valueJson, updatedAt, updatedByPrincipalId] = bound;
        const existing = state.settings.find((setting) => setting.site_id === siteId && setting.setting_key === settingKey);
        if (existing) Object.assign(existing, { value_json: valueJson, updated_at: updatedAt, updated_by_principal_id: updatedByPrincipalId });
        else state.settings.push({ site_id: siteId, setting_key: settingKey, value_json: valueJson, updated_at: updatedAt, updated_by_principal_id: updatedByPrincipalId });
      } else if (/^INSERT INTO cloudflare_site_operations/i.test(sql)) {
        const [operationId, siteId, displayName, operationKind, status, createdByPrincipalId, createdAt, updatedAt] = bound;
        const existing = state.operations.find((operation) => operation.operation_id === operationId);
        if (existing) Object.assign(existing, { display_name: displayName, operation_kind: operationKind, status, updated_at: updatedAt });
        else state.operations.push({ operation_id: operationId, site_id: siteId, display_name: displayName, operation_kind: operationKind, status, created_by_principal_id: createdByPrincipalId, created_at: createdAt, updated_at: updatedAt });
      } else if (/^INSERT INTO cloudflare_site_carrier_sessions/i.test(sql)) {
        const [carrierSessionId, siteId, agentId, boundByPrincipalId, bindingStatus, createdAt, updatedAt] = bound;
        if (!state.carrierSessions.some((binding) => binding.carrier_session_id === carrierSessionId)) {
          state.carrierSessions.push({ carrier_session_id: carrierSessionId, site_id: siteId, agent_id: agentId, bound_by_principal_id: boundByPrincipalId, binding_status: bindingStatus, created_at: createdAt, updated_at: updatedAt });
        }
      } else if (/^INSERT INTO cloudflare_site_authority_events/i.test(sql)) {
        const [eventId, eventKind, siteId, carrierSessionId, principalId, action, reason, evidenceJson, recordedAt] = bound;
        state.authorityEvents.push({ event_id: eventId, event_kind: eventKind, site_id: siteId, carrier_session_id: carrierSessionId, principal_id: principalId, action, reason, evidence_json: evidenceJson, recorded_at: recordedAt });
      }
      return { success: true };
    },
    async first() {
      if (/FROM cloudflare_sites WHERE site_id = \?/i.test(sql)) {
        const [siteId] = bound;
        return clone(state.sites.find((site) => site.site_id === siteId));
      }
      if (/FROM cloudflare_site_memberships WHERE site_id = \? AND principal_id = \?/i.test(sql)) {
        const [siteId, principalId] = bound;
        return clone(state.memberships.find((membership) => membership.site_id === siteId && membership.principal_id === principalId));
      }
      if (/FROM cloudflare_site_carrier_sessions WHERE carrier_session_id = \?/i.test(sql)) {
        const [carrierSessionId] = bound;
        return clone(state.carrierSessions.find((binding) => binding.carrier_session_id === carrierSessionId));
      }
      if (/FROM cloudflare_site_operations WHERE operation_id = \?/i.test(sql)) {
        const [operationId] = bound;
        return clone(state.operations.find((operation) => operation.operation_id === operationId));
      }
      return null;
    },
    async all() {
      if (/FROM cloudflare_sites s\s+JOIN cloudflare_site_memberships m/i.test(sql)) {
        const [principalId] = bound;
        return {
          results: state.memberships
            .filter((membership) => membership.principal_id === principalId && membership.status === 'active')
            .map((membership) => state.sites.find((site) => site.site_id === membership.site_id && site.status === 'active'))
            .filter(Boolean)
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .map(clone),
        };
      }
      if (/FROM cloudflare_site_settings WHERE site_id = \?/i.test(sql)) {
        const [siteId] = bound;
        return {
          results: state.settings
            .filter((setting) => setting.site_id === siteId)
            .sort((left, right) => left.setting_key.localeCompare(right.setting_key))
            .map(({ setting_key, value_json }) => ({ setting_key, value_json })),
        };
      }
      if (/FROM cloudflare_site_memberships\s+WHERE site_id = \?/i.test(sql)) {
        const [siteId, limit] = bound;
        return {
          results: state.memberships
            .filter((membership) => membership.site_id === siteId)
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .slice(0, Number(limit))
            .map(clone),
        };
      }
      if (/FROM cloudflare_site_operations/i.test(sql)) {
        const [siteId, limit] = bound;
        return {
          results: state.operations
            .filter((operation) => operation.site_id === siteId)
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .slice(0, Number(limit))
            .map(clone),
        };
      }
      if (/FROM cloudflare_site_carrier_sessions/i.test(sql)) {
        const [siteId, limit] = bound;
        return {
          results: state.carrierSessions
            .filter((binding) => binding.site_id === siteId)
            .sort((left, right) => right.created_at.localeCompare(left.created_at))
            .slice(0, Number(limit))
            .map(clone),
        };
      }
      if (/FROM cloudflare_site_authority_events/i.test(sql)) {
        const [siteId, limit] = bound;
        return {
          results: state.authorityEvents
            .filter((event) => event.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map(clone),
        };
      }
      return { results: [] };
    },
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
