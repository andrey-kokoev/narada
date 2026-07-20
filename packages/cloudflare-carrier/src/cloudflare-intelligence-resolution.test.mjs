import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  deployManagementBundle,
  MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA,
} from '@narada2/invokable-intelligence-management';
import { D1MaterializationStore } from '@narada2/invokable-intelligence-materialization';
import { D1RegistryStore } from '@narada2/invokable-intelligence-registry/d1';
import { createFakeD1 } from '@narada2/invokable-intelligence-registry';
import { canonicalSha256 } from '@narada2/invokable-intelligence-contract';

import { createCloudflareAiProviderAdapter } from './cloudflare-worker.mjs';
import {
  cloudflareIntelligenceResolutionConfigured,
  createCarrierIntelligenceGateway,
} from './cloudflare-intelligence-resolution.mjs';

const TARGET_SITE_ID = 'site:narada-cloudflare';
const PRINCIPAL_ID = 'principal:admin';
const SERVICE_PRINCIPAL_ID = 'principal:cloudflare-carrier-service';
const REGISTRY_SITE_ID = 'site_narada_cloudflare';
const DEPLOYMENT_CONSENT_REF = 'authorization:narada-cloudflare:intelligence-deployment:revision-1';
const DESTINATION_AUTHORITY_REF = 'authority:site:narada-cloudflare:catalog';
const PRODUCTION_CATALOG = JSON.parse(readFileSync(
  new URL('../config/invokable-intelligence.catalog.json', import.meta.url),
  'utf8',
));
const PRODUCTION_MATERIALIZATIONS = JSON.parse(readFileSync(
  new URL('../config/invokable-intelligence.materializations.json', import.meta.url),
  'utf8',
));
const PRODUCTION_TOPOLOGY = PRODUCTION_CATALOG.records.find(
  ({ record_kind }) => record_kind === 'route',
).document.topology;

function makeAi(resultOrError, calls = []) {
  return {
    calls,
    async run(model, request) {
      calls.push({ model, request });
      if (resultOrError instanceof Error) throw resultOrError;
      return resultOrError;
    },
  };
}

function catalogWithTimeout(timeoutMs) {
  const catalog = structuredClone(PRODUCTION_CATALOG);
  const defaults = catalog.records.find(({ record_id }) => record_id === 'policy:narada-cloudflare-defaults');
  const rule = defaults.document.rules.find(({ option }) => option === 'timeout_ms');
  rule.value = timeoutMs;
  defaults.source.digest = canonicalSha256(defaults.document);
  return catalog;
}

function makeSequenceAi(sequence, calls = []) {
  return {
    calls,
    async run(model, request) {
      calls.push({ model, request });
      const next = sequence.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

function configuredEnv(overrides = {}) {
  return {
    AI: makeAi({ response: 'cf-ok' }),
    INTELLIGENCE_REGISTRY_DB: createFakeD1(':memory:'),
    ...overrides,
  };
}

function carrierContext(overrides = {}) {
  return {
    source: 'cloudflare-carrier-site-admission',
    authenticated_actor: {
      principal_id: 'microsoft:tenant:operator',
      auth_type: 'microsoft_oidc',
    },
    target_registry_site: {
      registry: 'narada.cloudflare-site-registry.v1',
      subject_id: REGISTRY_SITE_ID,
    },
    site_membership: {
      registry: 'narada.cloudflare-site-registry.v1',
      site_id: REGISTRY_SITE_ID,
      role: 'operator',
      evidence_ref: 'site-binding:test-request',
    },
    ...overrides,
  };
}

function productionDeploymentBundle(catalog = PRODUCTION_CATALOG) {
  return {
    schema: MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA,
    id: 'deployment:narada-cloudflare:invokable-intelligence:revision-1',
    owning_site: { kind: 'site', id: TARGET_SITE_ID },
    actor_id: 'site-operator:narada-cloudflare',
    principal_id: PRINCIPAL_ID,
    consent_ref: DEPLOYMENT_CONSENT_REF,
    destination_authority: {
      site_id: TARGET_SITE_ID,
      locus: 'target-site',
      authority_ref: DESTINATION_AUTHORITY_REF,
    },
    decided_at: '2026-07-20T20:30:00.000Z',
    evidence_refs: [
      DEPLOYMENT_CONSENT_REF,
      DESTINATION_AUTHORITY_REF,
      'site-config:narada-cloudflare:invokable-intelligence:revision-1',
    ],
    catalog: structuredClone(catalog),
    materializations: structuredClone(PRODUCTION_MATERIALIZATIONS.materializations),
  };
}

async function seedRegistry(binding, catalog = PRODUCTION_CATALOG) {
  const store = await D1RegistryStore.open(binding);
  const materialization = await D1MaterializationStore.open(binding);
  try {
    const result = await deployManagementBundle({
      store,
      materialization,
      owningSite: { kind: 'site', id: TARGET_SITE_ID },
    }, productionDeploymentBundle(catalog));
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.admitted_record_ids.length, 27);
    assert.equal(result.materialized_envelope_ids.length, 3);
  } finally {
    await materialization.close();
    await store.close();
  }
}

function invocation(overrides = {}) {
  return {
    input: { content: 'hello' },
    carrier_session_id: 'carrier:test:1',
    site_id: REGISTRY_SITE_ID,
    carrier_context: carrierContext(),
    operation_id: 'operation:test:1',
    turn_id: 'turn:test:1',
    input_event_id: 'input:test:1',
    ...overrides,
  };
}

test('D1 catalog selects the exact offering key; model environment variables have no authority', async () => {
  const env = configuredEnv();
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB);
  assert.equal(cloudflareIntelligenceResolutionConfigured(env), true);

  const adapter = createCloudflareAiProviderAdapter(env);
  const result = await adapter.run(invocation());

  assert.equal(result.text, 'cf-ok');
  assert.equal(env.AI.calls.length, 1);
  assert.equal(env.AI.calls[0].model, '@cf/moonshotai/kimi-k2.7-code');
  assert.equal(result.intelligence.selection.adapter.id, 'adapter:workers-ai-binding');
  assert.equal(result.intelligence.offering_id, 'model-offering:kimi-via-workers-ai');

  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  const plan = await store.getPlan(result.intelligence.plan_id);
  assert.equal(plan.route.offering.id, 'model-offering:kimi-via-workers-ai');
  const attempts = await store.listExecutionAttempts(plan.id);
  assert.equal(attempts.length, 1);
  const outcome = await store.getTerminalOutcomeByAttempt(attempts[0].id);
  assert.equal(outcome.kind, 'success');
  await store.close();
});

test('Cloudflare AI receives canonical tools through the provider transport schema', async () => {
  const env = configuredEnv({ CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS: '1' });
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB);

  const adapter = createCloudflareAiProviderAdapter(env);
  await adapter.run(invocation());

  assert.deepEqual(env.AI.calls[0].request.tools, [{
    type: 'function',
    function: {
      name: 'cloudflare_carrier_runtime_metadata_read',
      description: 'Read non-secret Narada Cloudflare carrier runtime metadata for the active session.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  }]);
});

test('service bearer resolves through its dedicated workload principal scope', async () => {
  const env = configuredEnv();
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB);
  const adapter = createCloudflareAiProviderAdapter(env);
  const result = await adapter.run(invocation({
    carrier_context: carrierContext({
      authenticated_actor: { principal_id: 'service', auth_type: 'service' },
      site_membership: {
        registry: 'narada.cloudflare-site-registry.v1',
        site_id: REGISTRY_SITE_ID,
        role: 'owner',
        evidence_ref: 'site-binding:service-workload',
      },
    }),
    operation_id: 'operation:test:service-workload',
    turn_id: 'turn:test:service-workload',
  }));

  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  const plan = await store.getPlan(result.intelligence.plan_id);
  const intent = await store.getIntent(plan.intent_id);
  assert.equal(intent.principal, SERVICE_PRINCIPAL_ID);
  assert.equal(plan.access.grant_id, 'grant:cloudflare-carrier-service-workers-ai');
  assert.equal(plan.access.budget_id, 'budget:cloudflare-carrier-service-workers-ai');
  await store.close();
});

test('provider timeout persists acknowledgment uncertainty rather than provider failure', async () => {
  const env = configuredEnv({ AI: makeAi(new Promise(() => {})) });
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB, catalogWithTimeout(1000));
  const adapter = createCloudflareAiProviderAdapter(env);

  let refs;
  await assert.rejects(adapter.run(invocation({ operation_id: 'operation:test:timeout' })), (error) => {
    assert.equal(error.code, 'cloudflare_workers_ai_timeout');
    refs = error.intelligence;
    return true;
  });

  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  const outcome = await store.getTerminalOutcome(refs.outcome_id);
  const observations = await store.listInvocationObservations(refs.attempt_id);
  assert.equal(outcome.kind, 'admission-unknown');
  assert.equal(outcome.admission_acknowledged, undefined);
  assert.equal(
    observations.find(({ kind }) => kind === 'transport-acknowledgment')?.status,
    'uncertain',
  );
  assert.equal((await store.listResultEnvelopes(refs.attempt_id)).length, 0);
  await store.close();
});

test('live diagnostic modes preserve canonical refusal, provider failure, and acknowledgment uncertainty', async () => {
  const env = configuredEnv();
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB);
  const adapter = createCloudflareAiProviderAdapter(env);

  let refusal;
  await assert.rejects(adapter.run(invocation({
    intelligence_invocation: {
      schema: 'narada.invokable-intelligence.invocation-control.v1',
      intent_id: 'intent:test:live-diagnostic-refusal',
      operation_id: 'operation:test:live-diagnostic-refusal',
      mode: 'immediate',
      allow_replan: true,
    },
    intelligence_diagnostic: 'resolver-refusal',
  })), (error) => {
    assert.equal(error.code, 'intelligence_resolver_no_candidates');
    assert.equal(error.intelligence.outcome_kind, 'pre-invocation-refusal');
    refusal = error.intelligence;
    return true;
  });

  let failure;
  await assert.rejects(adapter.run(invocation({
    intelligence_invocation: {
      schema: 'narada.invokable-intelligence.invocation-control.v1',
      intent_id: 'intent:test:live-diagnostic-failure',
      operation_id: 'operation:test:live-diagnostic-failure',
      mode: 'immediate',
      allow_replan: true,
    },
    intelligence_diagnostic: 'provider-failure',
  })), (error) => {
    assert.equal(error.code, 'cloudflare_workers_ai_provider_failed');
    assert.equal(error.intelligence.outcome_kind, 'provider-failure');
    failure = error.intelligence;
    return true;
  });

  let uncertain;
  await assert.rejects(adapter.run(invocation({
    intelligence_invocation: {
      schema: 'narada.invokable-intelligence.invocation-control.v1',
      intent_id: 'intent:test:live-diagnostic-uncertain',
      operation_id: 'operation:test:live-diagnostic-uncertain',
      mode: 'immediate',
      allow_replan: true,
    },
    intelligence_diagnostic: 'acknowledgment-uncertain',
  })), (error) => {
    assert.equal(error.code, 'cloudflare_workers_ai_timeout');
    assert.equal(error.intelligence.outcome_kind, 'admission-unknown');
    uncertain = error.intelligence;
    return true;
  });

  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  assert.equal((await store.getTerminalOutcome(refusal.outcome_id)).kind, 'pre-invocation-refusal');
  assert.equal((await store.getTerminalOutcome(failure.outcome_id)).kind, 'provider-failure');
  assert.equal((await store.getTerminalOutcome(uncertain.outcome_id)).kind, 'admission-unknown');
  assert.equal(env.AI.calls.length, 0);
  await store.close();
});

test('explicit retry appends lineage and preserves the failed predecessor', async () => {
  const env = configuredEnv({ AI: makeSequenceAi([new Error('upstream 500'), { response: 'recovered' }]) });
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB);
  const adapter = createCloudflareAiProviderAdapter(env);
  const base = invocation({ operation_id: 'operation:test:retry-domain' });

  let failedRefs;
  await assert.rejects(adapter.run({
    ...base,
    intelligence_invocation: {
      schema: 'narada.invokable-intelligence.invocation-control.v1',
      intent_id: 'intent:test:cloudflare-retry',
      operation_id: 'operation:test:retry:1',
      mode: 'immediate',
    },
  }), (error) => {
    assert.equal(error.code, 'cloudflare_workers_ai_provider_failed');
    failedRefs = error.intelligence;
    return true;
  });
  const recovered = await adapter.run({
    ...base,
    intelligence_invocation: {
      schema: 'narada.invokable-intelligence.invocation-control.v1',
      intent_id: 'intent:test:cloudflare-retry',
      operation_id: 'operation:test:retry:2',
      mode: 'retry',
    },
  });

  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  const attempts = await store.listExecutionAttempts(recovered.intelligence.plan_id);
  const failedOutcome = await store.getTerminalOutcome(failedRefs.outcome_id);
  const recoveredOutcome = await store.getTerminalOutcome(recovered.intelligence.outcome_id);
  assert.equal(env.AI.calls.length, 2);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].lineage.relation, 'retry-of');
  assert.equal(attempts[1].lineage.predecessor_attempt_id, attempts[0].id);
  assert.equal(failedOutcome.kind, 'provider-failure');
  assert.equal(recoveredOutcome.kind, 'success');
  await store.close();
});

test('Cloudflare route factorizes runtime topology from provider account access', () => {
  assert.deepEqual(
    PRODUCTION_TOPOLOGY.nodes.map(({ kind }) => kind),
    ['client', 'launcher', 'carrier', 'runtime', 'adapter', 'inference-service', 'endpoint'],
  );
  const route = PRODUCTION_CATALOG.records.find(({ record_kind }) => record_kind === 'route').document;
  assert.equal(route.access.account_ref, 'account:cloudflare-workers-ai');
  assert.deepEqual(route.access.grant_refs, [
    'grant:andrey-cloudflare-workers-ai',
    'grant:cloudflare-carrier-service-workers-ai',
  ]);
  assert.equal(route.access.credential.id, 'credential-locator:cloudflare-worker-binding');
  assert.deepEqual(PRODUCTION_TOPOLOGY.edges.find(({ id }) => id === 'c2').boundary.kinds, [
    'network', 'trust', 'site', 'account',
  ]);
  assert.equal(PRODUCTION_TOPOLOGY.edges.find(({ id }) => id === 'c5').kind, 'binding-call');
  assert.deepEqual(PRODUCTION_TOPOLOGY.edges.find(({ id }) => id === 'c5').boundary.kinds, ['account', 'trust']);
});

test('generated Cloudflare boundary admissions remain valid after the deployment day', () => {
  const now = Date.parse('2026-07-20T20:30:00.000Z');
  for (const edgeId of ['c2', 'c5']) {
    const admission = PRODUCTION_TOPOLOGY.edges.find(({ id }) => id === edgeId).boundary.admission;
    assert.equal(admission.schema, 'narada.invokable-intelligence.topology-boundary-admission.v1');
    assert.ok(Date.parse(admission.validity.valid_from) <= now);
    assert.ok(Date.parse(admission.validity.valid_until) > now);
    assert.ok(Date.parse(admission.validity.fresh_as_of) <= now);
  }
});

test('Cloudflare resolution refuses when the Workers AI binding is absent', async () => {
  const env = configuredEnv({ AI: {} });
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB);
  const { gateway, store } = await createCarrierIntelligenceGateway(env, () => ({
    async invoke() {
      throw new Error('must_not_dispatch_without_binding');
    },
  }));
  const result = await gateway.invoke({
    purpose: 'carrier-turn',
    operationId: 'operation:test:missing-ai-binding',
    messages: { input: { content: 'hello' }, tool_results: [] },
    carrierContext: carrierContext(),
  });
  assert.equal(result.kind, 'refusal');
  assert.equal(result.refusal.reason_code, 'topology-infeasible');
  await store.close();
});

test('same delivery identity is not redispatched and reports governed payload unavailability', async () => {
  const env = configuredEnv();
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB);
  const adapter = createCloudflareAiProviderAdapter(env);

  const first = await adapter.run(invocation());
  await assert.rejects(adapter.run(invocation()), (error) => {
    assert.equal(error.code, 'intelligence_result_payload_not_available_on_replay');
    return true;
  });
  assert.equal(env.AI.calls.length, 1);

  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  const plan = await store.getPlan(first.intelligence.plan_id);
  assert.equal((await store.listExecutionAttempts(plan.id)).length, 1);
  await store.close();
});

test('an actor without a governed principal binding refuses before inference', async () => {
  const env = configuredEnv();
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB);
  const adapter = createCloudflareAiProviderAdapter(env);

  await assert.rejects(
    adapter.run(invocation({
      carrier_context: carrierContext({
        site_membership: {
          registry: 'narada.cloudflare-site-registry.v1',
          site_id: REGISTRY_SITE_ID,
          role: 'viewer',
          evidence_ref: 'site-binding:test-unauthorized',
        },
      }),
      operation_id: 'operation:test:unauthorized',
      turn_id: 'turn:test:unauthorized',
    })),
    (error) => {
      assert.equal(error.code, 'intelligence_principal_binding_missing');
      assert.equal(env.AI.calls.length, 0);
      return true;
    },
  );
});

test('inference failure is durable and distinct from admission refusal', async () => {
  const env = configuredEnv({ AI: makeAi(new Error('upstream 500')) });
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB);
  const adapter = createCloudflareAiProviderAdapter(env);

  let refs;
  await assert.rejects(adapter.run(invocation({ operation_id: 'operation:test:failure' })), (error) => {
    assert.equal(error.code, 'cloudflare_workers_ai_provider_failed');
    refs = error.intelligence;
    return true;
  });

  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  const attempt = await store.getExecutionAttempt(refs.attempt_id);
  const outcome = await store.getTerminalOutcome(refs.outcome_id);
  assert.equal(attempt.state, 'created');
  assert.equal(outcome.kind, 'provider-failure');
  assert.equal(outcome.admission_acknowledged, true);
  await store.close();
});

test('runtime refuses an empty D1 registry and never synthesizes catalog authority', async () => {
  const env = configuredEnv();
  const adapter = createCloudflareAiProviderAdapter(env);

  await assert.rejects(adapter.run(invocation()), (error) => {
    assert.equal(error.code, 'intelligence_registry_not_initialized');
    return true;
  });
  assert.equal(env.AI.calls.length, 0);
});

test('only D1 is required as intelligence infrastructure; legacy model/site env values are ignored', async () => {
  const env = {
    AI: makeAi({ response: 'must-not-run' }),
    CLOUDFLARE_CARRIER_AI_MODEL: 'legacy-model-x',
    AI_MODEL: 'legacy-model-y',
    INTELLIGENCE_TARGET_SITE: 'legacy-target',
    INTELLIGENCE_USER_SITE: 'legacy-user',
    INTELLIGENCE_HOST_SITE: 'legacy-host',
    INTELLIGENCE_WORKERS_AI_MODELS: 'legacy-model-list',
  };
  assert.equal(cloudflareIntelligenceResolutionConfigured(env), false);

  const adapter = createCloudflareAiProviderAdapter(env);
  await assert.rejects(adapter.run(invocation()), (error) => {
    assert.equal(error.code, 'intelligence_resolution_configuration_missing');
    assert.deepEqual(error.missing, ['INTELLIGENCE_REGISTRY_DB']);
    return true;
  });
  assert.equal(env.AI.calls.length, 0);
});

test('gateway requires an explicit admitted invocation context', async () => {
  const env = configuredEnv();
  await seedRegistry(env.INTELLIGENCE_REGISTRY_DB);
  const { gateway, store } = await createCarrierIntelligenceGateway(env, () => ({
    async invoke() {
      throw new Error('must_not_dispatch');
    },
  }));
  await assert.rejects(
    gateway.invoke({
      purpose: 'carrier-turn',
      operationId: 'operation:test:missing-context',
      messages: { input: { content: 'hello' }, tool_results: [] },
    }),
    (error) => {
      assert.equal(error.code, 'intelligence_authentication_context_invalid');
      return true;
    },
  );
  await store.close();
});
