import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA,
  MANAGEMENT_DEPLOYMENT_RESULT_SCHEMA,
  MANAGEMENT_RESULT_SCHEMA,
} from '@narada2/invokable-intelligence-management';
import { createFakeD1 } from '@narada2/invokable-intelligence-registry';
import { D1RegistryStore } from '@narada2/invokable-intelligence-registry/d1';

import { createCloudflareSiteRegistryAdapter } from '@narada2/cloudflare-site-registry';
import {
  CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_REQUEST_SCHEMA,
  CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_RESPONSE_SCHEMA,
  CLOUDFLARE_INTELLIGENCE_EXECUTION_READ_SCHEMA,
  executeCloudflareIntelligenceManagement,
} from './cloudflare-intelligence-management-api.mjs';
import worker, { createCloudflareAiProviderAdapter } from './cloudflare-worker.mjs';

const TARGET_SITE = { kind: 'site', id: 'site:narada-cloudflare' };
const REGISTRY_SITE_ID = 'site_narada_cloudflare';
const PRINCIPAL = { auth_type: 'user', principal_id: 'admin' };
const CATALOG = JSON.parse(readFileSync(
  new URL('../config/invokable-intelligence.catalog.json', import.meta.url),
  'utf8',
));
const MATERIALIZATIONS = JSON.parse(readFileSync(
  new URL('../config/invokable-intelligence.materializations.json', import.meta.url),
  'utf8',
));

function deploymentBundle() {
  return {
    schema: MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA,
    id: 'deployment:narada-cloudflare:invokable-intelligence:revision-1',
    owning_site: TARGET_SITE,
    actor_id: 'site-operator:narada-cloudflare',
    principal_id: 'principal:admin',
    consent_ref: 'authorization:narada-cloudflare:intelligence-deployment:revision-1',
    destination_authority: {
      site_id: TARGET_SITE.id,
      locus: 'target-site',
      authority_ref: 'authority:site:narada-cloudflare:catalog',
    },
    decided_at: '2026-07-19T12:00:00.000Z',
    evidence_refs: [
      'authorization:narada-cloudflare:intelligence-deployment:revision-1',
      'authority:site:narada-cloudflare:catalog',
      'site-config:narada-cloudflare:invokable-intelligence:revision-1',
    ],
    catalog: structuredClone(CATALOG),
    materializations: structuredClone(MATERIALIZATIONS.materializations),
  };
}

async function configuredEnv() {
  const db = createFakeD1(':memory:');
  const env = {
    ADMIN_BEARER_TOKEN: 'test-admin-token',
    AI: {
      async run() {
        return { response: 'cf-evidence-ok', request_id: 'provider-request:test-evidence' };
      },
    },
    CLOUDFLARE_SITE_REGISTRY_DB: db,
    INTELLIGENCE_REGISTRY_DB: db,
  };
  const registry = createCloudflareSiteRegistryAdapter(env);
  assert.ok(registry);
  const created = await registry.handle({
    operation: 'site.create',
    principal: PRINCIPAL,
    params: { site_id: REGISTRY_SITE_ID, display_name: 'Narada Cloudflare' },
  });
  assert.equal(created.ok, true);
  return { env, registry };
}

test('D1 management API deploys canonical production authority without conflating transport and semantic actors', async () => {
  const { env } = await configuredEnv();
  const response = await executeCloudflareIntelligenceManagement(deploymentBundle(), PRINCIPAL, env);
  assert.equal(response.status, 200);
  assert.equal(response.body.schema, CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_RESPONSE_SCHEMA);
  assert.equal(response.body.transport_authorization.principal_id, PRINCIPAL.principal_id);
  assert.equal(response.body.result.schema, MANAGEMENT_DEPLOYMENT_RESULT_SCHEMA);
  assert.equal(response.body.result.admitted_record_ids.length, 24);
  assert.equal(response.body.result.materialized_envelope_ids.length, 2);
  assert.ok(response.body.result.receipts.every(({ actor_id }) => actor_id !== PRINCIPAL.principal_id));

  const validation = await executeCloudflareIntelligenceManagement({
    schema: CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_REQUEST_SCHEMA,
    owning_site: TARGET_SITE,
    request: { operation: 'validate' },
  }, PRINCIPAL, env);
  assert.equal(validation.status, 200);
  assert.equal(validation.body.result.schema, MANAGEMENT_RESULT_SCHEMA);
  assert.equal(validation.body.result.operation, 'validate');
  assert.deepEqual(validation.body.result.data.diagnostics, []);
});

test('authenticated execution.read returns linked D1 plan, outcome, evidence, and Site provenance', async () => {
  const { env } = await configuredEnv();
  const deployed = await executeCloudflareIntelligenceManagement(deploymentBundle(), PRINCIPAL, env);
  assert.equal(deployed.status, 200);

  const adapter = createCloudflareAiProviderAdapter(env);
  const invocation = await adapter.run({
    input: { content: 'prove execution readback', event_id: 'input:test:evidence' },
    carrier_session_id: 'carrier:test:evidence',
    site_id: 'site_narada_cloudflare',
    operation_id: 'operation:test:evidence',
    turn_id: 'turn:test:evidence',
    carrier_context: {
      source: 'cloudflare-carrier-site-admission',
      authenticated_actor: {
        principal_id: 'microsoft:tenant:operator',
        auth_type: 'microsoft_oidc',
      },
      target_registry_site: {
        registry: 'narada.cloudflare-site-registry.v1',
        subject_id: 'site_narada_cloudflare',
      },
      site_membership: {
        registry: 'narada.cloudflare-site-registry.v1',
        site_id: 'site_narada_cloudflare',
        role: 'operator',
        evidence_ref: 'site-binding:test-evidence',
      },
    },
  });
  const readback = await executeCloudflareIntelligenceManagement({
    schema: CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_REQUEST_SCHEMA,
    owning_site: TARGET_SITE,
    request: {
      operation: 'execution.read',
      attempt_id: invocation.intelligence.attempt_id,
    },
  }, PRINCIPAL, env);

  assert.equal(readback.status, 200);
  assert.equal(readback.body.result.schema, CLOUDFLARE_INTELLIGENCE_EXECUTION_READ_SCHEMA);
  assert.equal(readback.body.result.data.attempt.id, invocation.intelligence.attempt_id);
  assert.equal(readback.body.result.data.intent.id, invocation.intelligence.intent_id);
  assert.equal(readback.body.result.data.plan.id, invocation.intelligence.plan_id);
  assert.equal(readback.body.result.data.terminal_outcome.kind, 'success');
  assert.deepEqual(readback.body.result.data.transitions.map(({ state }) => state), [
    'dispatching', 'provider-pending', 'terminal',
  ]);
  assert.equal(readback.body.result.data.results.length, 1);
  assert.equal(readback.body.result.data.observations.length, 3);
  assert.equal(readback.body.result.data.audit_evidence.length, 4);
  assert.equal(readback.body.result.data.telemetry.length, 1);
  assert.equal(readback.body.result.data.provenance.route_authority.site_id, TARGET_SITE.id);
  assert.equal(readback.body.result.data.provenance.materializations.length, 2);
  assert.ok(readback.body.result.data.provenance.materializations.every(({ destination }) =>
    destination.site_id === TARGET_SITE.id));
});

test('deployment preflights every materialization before admitting any destination catalog record', async () => {
  const { env } = await configuredEnv();
  const bundle = deploymentBundle();
  bundle.materializations[1].admission.destination_site_id = 'site:tampered';

  const refused = await executeCloudflareIntelligenceManagement(bundle, PRINCIPAL, env);
  assert.notEqual(refused.status, 200);
  assert.equal(refused.body.result.error.code, 'materialization-context-mismatch');

  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  assert.deepEqual(await store.listCatalogRecords(), []);
  await store.close();
});

test('Worker exposes the management service only through authenticated POST /api/intelligence', async () => {
  const { env } = await configuredEnv();
  const deployed = await executeCloudflareIntelligenceManagement(deploymentBundle(), PRINCIPAL, env);
  assert.equal(deployed.status, 200);
  const body = {
    schema: CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_REQUEST_SCHEMA,
    owning_site: TARGET_SITE,
    request: { operation: 'validate' },
  };
  const request = (token) => new Request('https://carrier.test/api/intelligence', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const unauthorized = await worker.fetch(request(null), env);
  assert.equal(unauthorized.status, 401);

  const authorized = await worker.fetch(request('test-admin-token'), env);
  assert.equal(authorized.status, 200);
  const response = await authorized.json();
  assert.equal(response.schema, CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_RESPONSE_SCHEMA);
  assert.equal(response.result.schema, MANAGEMENT_RESULT_SCHEMA);
  assert.equal(response.transport_authorization.principal_id, 'admin');

  const get = await worker.fetch(new Request('https://carrier.test/api/intelligence'), env);
  assert.equal(get.status, 405);
});

test('D1 management API requires authenticated active mutation membership before opening intelligence authority', async () => {
  const { env, registry } = await configuredEnv();
  const deployed = await executeCloudflareIntelligenceManagement(deploymentBundle(), PRINCIPAL, env);
  assert.equal(deployed.status, 200);
  const viewer = { auth_type: 'user', principal_id: 'viewer' };
  const membership = await registry.handle({
    operation: 'site.membership.put',
    principal: PRINCIPAL,
    params: {
      site_id: REGISTRY_SITE_ID,
      member_principal_id: viewer.principal_id,
      role: 'viewer',
    },
  });
  assert.equal(membership.ok, true);

  const body = {
    schema: CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_REQUEST_SCHEMA,
    owning_site: TARGET_SITE,
    request: { operation: 'validate' },
  };
  const anonymous = await executeCloudflareIntelligenceManagement(body, null, env);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.result.error.code, 'unauthorized');

  const denied = await executeCloudflareIntelligenceManagement(body, viewer, env);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.result.error.code, 'site-authority-denied');
});
