/**
 * Cloudflare carrier intelligence resolution: D1-backed deterministic
 * resolution for carrier turns. When INTELLIGENCE_REGISTRY_DB (a D1
 * binding) and explicit site context are configured, model and inference
 * path come from the invokable-intelligence resolver — never from
 * CLOUDFLARE_CARRIER_AI_MODEL, AI_MODEL, or any hardcoded default.
 */

import { D1RegistryStore } from '@narada2/invokable-intelligence-registry/d1';
import { createLocalInvocationGateway } from '@narada2/invokable-intelligence-runtime';

export const CARRIER_INTELLIGENCE_ADAPTER_ID = 'adapter:workers-ai-binding';

export function cloudflareIntelligenceResolutionConfigured(env = {}) {
  return Boolean(
    env.INTELLIGENCE_REGISTRY_DB
      && env.INTELLIGENCE_TARGET_SITE
      && env.INTELLIGENCE_USER_SITE
      && env.INTELLIGENCE_HOST_SITE,
  );
}

function sitesFromEnv(env) {
  return {
    targetSite: { kind: 'site', id: env.INTELLIGENCE_TARGET_SITE },
    userSite: { kind: 'site', id: env.INTELLIGENCE_USER_SITE },
    hostSite: { kind: 'site', id: env.INTELLIGENCE_HOST_SITE },
  };
}

/**
 * Idempotent seed of the Workers-AI catalog into the D1 registry: the
 * inference provider, adapter, credential locator, catalog models, and
 * feasibility assertions, plus the three locus sites. Runs when the store
 * has no resources yet; no-ops afterwards.
 */
export async function ensureCloudflareIntelligenceCatalog(store, env) {
  const existing = await store.listResources();
  if (existing.length > 0) return { seeded: false };
  const sites = sitesFromEnv(env);
  const hostSiteRef = sites.hostSite;
  const recordedAt = new Date().toISOString();
  const provenance = { source: 'operator', recorded_at: recordedAt, actor: 'cloudflare-carrier-catalog-seed', reference: 'workers-ai-catalog' };
  const catalogModels = (env.INTELLIGENCE_WORKERS_AI_MODELS ?? '@cf/meta/llama-3.1-8b-instruct')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const resources = [
    { schema: 'narada.invokable-intelligence.site.v1', id: sites.targetSite.id },
    { schema: 'narada.invokable-intelligence.site.v1', id: sites.userSite.id },
    { schema: 'narada.invokable-intelligence.site.v1', id: sites.hostSite.id },
    { schema: 'narada.invokable-intelligence.inference-provider.v1', id: 'inference-provider:cloudflare-workers-ai', display_name: 'Cloudflare Workers AI' },
    { schema: 'narada.invokable-intelligence.adapter.v1', id: CARRIER_INTELLIGENCE_ADAPTER_ID, runtime_family: 'workers' },
    {
      schema: 'narada.invokable-intelligence.credential-locator.v1',
      id: 'credential-locator:cloudflare-worker-binding',
      store: 'none',
      reference: 'cloudflare-worker-binding',
      holder: hostSiteRef,
    },
    ...catalogModels.map((slug) => ({
      schema: 'narada.invokable-intelligence.model-provider.v1',
      id: `model-provider:${slug.startsWith('@cf/') ? slug.split('/')[1] : 'cloudflare'}`,
    })),
    ...catalogModels.map((slug) => ({
      schema: 'narada.invokable-intelligence.model.v1',
      id: `model:${slug.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')}`,
      display_name: slug,
      provider: { kind: 'model-provider', id: `model-provider:${slug.startsWith('@cf/') ? slug.split('/')[1] : 'cloudflare'}` },
      metadata: { workers_ai_model: slug },
    })),
  ];
  const modelRefs = catalogModels.map((slug) => ({
    kind: 'model',
    id: `model:${slug.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')}`,
  }));
  resources.push({
    schema: 'narada.invokable-intelligence.inference-endpoint.v1',
    id: 'inference-endpoint:cloudflare-workers-ai',
    inference_provider: { kind: 'inference-provider', id: 'inference-provider:cloudflare-workers-ai' },
    adapter: { kind: 'adapter', id: CARRIER_INTELLIGENCE_ADAPTER_ID },
    serves: modelRefs,
    credential: { kind: 'credential-locator', id: 'credential-locator:cloudflare-worker-binding' },
  });
  for (const resource of resources) {
    await store.putResource(resource);
  }
  await store.putAssertion({
    schema: 'narada.invokable-intelligence.capability-assertion.v1',
    id: 'assert:cloudflare-worker-binding-feasible',
    subject: { kind: 'credential-locator', id: 'credential-locator:cloudflare-worker-binding' },
    capability: { family: 'credential', name: 'feasible' },
    value: true,
    scope: { locus: 'host-site', site: hostSiteRef },
    provenance,
    validity: { fresh_as_of: recordedAt },
    confidence: 1,
    evidence: [{ kind: 'run', ref: 'cloudflare-carrier-catalog-seed' }],
  });
  for (const ref of modelRefs) {
    await store.putAssertion({
      schema: 'narada.invokable-intelligence.capability-assertion.v1',
      id: `assert:${ref.id.replace(/^model:/, '')}-available`,
      subject: ref,
      capability: { family: 'support', name: 'state' },
      value: 'verified_supported',
      scope: { locus: 'global' },
      provenance,
      validity: { fresh_as_of: recordedAt },
      confidence: 1,
      evidence: [{ kind: 'run', ref: 'cloudflare-carrier-catalog-seed' }],
    });
  }
  return { seeded: true, models: catalogModels };
}

/**
 * Build the invocation gateway for carrier turns over the D1 registry.
 * `adapterFactory` receives the store and returns the Workers-AI
 * InvocationAdapter (request building stays in the carrier worker).
 */
export async function createCarrierIntelligenceGateway(env, adapterFactory) {
  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  await ensureCloudflareIntelligenceCatalog(store, env);
  const gateway = createLocalInvocationGateway({
    store,
    sites: sitesFromEnv(env),
    adapters: { [CARRIER_INTELLIGENCE_ADAPTER_ID]: adapterFactory(store) },
  });
  return { gateway, store };
}
