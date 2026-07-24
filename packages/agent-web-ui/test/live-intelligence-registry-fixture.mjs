import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildCanonicalLocalTestSeed,
  CANONICAL_LOCAL_TEST_IDS,
  canonicalSha256,
} from '@narada2/invokable-intelligence-contract';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';

const INTELLIGENCE_CONTEXT_SCHEMA = 'narada.intelligence.launch_context.v1';
const PRINCIPAL_BINDING_SCHEMA = 'narada.intelligence.principal_binding.v1';
const EVIDENCE_REF = 'evidence:agent-web-ui-live-intelligence-registry';

function canonicalAdapterProtocol(providerId) {
  return providerId === 'anthropic-api'
    ? { family: 'anthropic', operation: 'messages', version: '1' }
    : providerId === 'codex-subscription'
      ? { family: 'codex-subscription', operation: 'responses', version: '1' }
      : { family: 'openai', operation: 'chat-completions', version: '1' };
}

function canonicalCredentialReference(providerId) {
  return {
    'kimi-api': 'KIMI_API_KEY',
    'kimi-code-api': 'KIMI_CODE_API_KEY',
    'deepseek-api': 'DEEPSEEK_API_KEY',
    'glm-api': 'GLM_API_KEY',
    'openrouter-api': 'OPENROUTER_API_KEY',
    'anthropic-api': 'ANTHROPIC_API_KEY',
    'openai-api': 'OPENAI_API_KEY',
  }[providerId] ?? 'OPENAI_API_KEY';
}

function replaceCanonicalReference(value, replacements) {
  if (typeof value !== 'string') return value;
  return [...replacements.entries()].reduce(
    (current, [from, to]) => current.replaceAll(from, to),
    value,
  );
}

function rewriteCanonicalSeed(value, replacements, providerId) {
  if (typeof value === 'string') return replaceCanonicalReference(value, replacements);
  if (Array.isArray(value)) return value.map((entry) => rewriteCanonicalSeed(entry, replacements, providerId));
  if (!value || typeof value !== 'object') return value;

  const rewritten = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, rewriteCanonicalSeed(entry, replacements, providerId)]),
  );
  if (rewritten.schema === 'narada.invokable-intelligence.adapter.v1') {
    rewritten.protocol = canonicalAdapterProtocol(providerId);
  }
  if (rewritten.schema === 'narada.invokable-intelligence.access-grant.v1') {
    rewritten.scope = {
      ...rewritten.scope,
      purposes: [...new Set([...(rewritten.scope?.purposes ?? []), 'agent-session'])],
    };
  }
  if (rewritten.schema === 'narada.invokable-intelligence.data-governance-requirement.v1') {
    rewritten.purposes = [...new Set([...(rewritten.purposes ?? []), 'agent-session'])];
  }
  return rewritten;
}

function normalizeSeedRecord(record, sourceReference) {
  record.record_id = record.document.id;
  record.source = { ...record.source, reference: sourceReference };
  if (record.document?.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1') {
    record.document.topology.nodes = record.document.topology.nodes.map((node) => ({
      ...node,
      required_feasibility: [],
    }));
    record.document.topology.edges = record.document.topology.edges.map((edge) => ({
      ...edge,
      required_feasibility: [],
    }));
  }
  record.source.digest = canonicalSha256(record.document);
  return record;
}

/**
 * Seed the real local intelligence registry used by the runtime-server E2E.
 * The fixture is intentionally test-owned and disposable; it is not a copy
 * of the User Site registry and the launcher is still responsible for reading
 * the context and resolving the route.
 */
export async function seedLiveIntelligenceRegistry(
  siteRoot,
  { siteId, providerId = 'kimi-code-api', endpointBaseUrl },
) {
  if (!siteId || !endpointBaseUrl) throw new Error('live_intelligence_registry_fixture_requires_site_and_endpoint');

  const targetSiteId = `site:${siteId}`;
  const userSiteId = `site:${siteId}-user`;
  const hostSiteId = `site:${siteId}-host`;
  const replacements = new Map([
    [CANONICAL_LOCAL_TEST_IDS.targetSite, targetSiteId],
    [CANONICAL_LOCAL_TEST_IDS.userSite, userSiteId],
    [CANONICAL_LOCAL_TEST_IDS.hostSite, hostSiteId],
    ['inference-provider:remote-api', `inference-provider:${providerId}`],
  ]);
  const now = new Date().toISOString();
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const endpointUrl = `${endpointBaseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const seed = rewriteCanonicalSeed(buildCanonicalLocalTestSeed({
    endpointBaseUrl,
    endpointUrl,
    adapterProtocol: canonicalAdapterProtocol(providerId),
    credentialStore: 'env',
    credentialReference: canonicalCredentialReference(providerId),
    now,
    validUntil,
  }), replacements, providerId);

  for (const record of seed.records) normalizeSeedRecord(record, 'canonical-local-fixture');

  const secondaryProviderId = 'deepseek-api';
  const secondaryModelId = 'model:deepseek-chat';
  const secondaryOfferingId = 'model-offering:deepseek-via-local-api';
  const secondaryRouteId = 'route:deepseek-local-api';
  const secondaryTopologyId = 'topology:deepseek-local-openai-compatible';
  const secondaryDocumentIds = new Set([
    'model-provider:deepseek',
    secondaryModelId,
    `inference-provider:${secondaryProviderId}`,
    'credential-locator:deepseek-api',
    'inference-endpoint:deepseek-default',
    secondaryOfferingId,
    secondaryRouteId,
    'assert:canonical-deepseek-thinking-levels',
    'assert:canonical-deepseek-batch',
    'account:deepseek-api',
    'credential-binding:deepseek-api',
    'grant:andrey-deepseek-api',
    'entitlement:deepseek-api',
    'quota:deepseek-api',
    'budget:narada-deepseek-api',
    'governance:narada-deepseek-api',
    'authority-statement:andrey-deepseek-consent',
    'authority-statement:canonical-deepseek-thinking-levels',
    'authority-statement:canonical-deepseek-batch',
  ]);
  const secondaryReplacements = new Map([
    [CANONICAL_LOCAL_TEST_IDS.targetSite, targetSiteId],
    [CANONICAL_LOCAL_TEST_IDS.userSite, userSiteId],
    [CANONICAL_LOCAL_TEST_IDS.hostSite, hostSiteId],
    [CANONICAL_LOCAL_TEST_IDS.model, secondaryModelId],
    [CANONICAL_LOCAL_TEST_IDS.offering, secondaryOfferingId],
    [CANONICAL_LOCAL_TEST_IDS.route, secondaryRouteId],
    ['topology:local-openai-compatible', secondaryTopologyId],
    ['model-provider:kimi', 'model-provider:deepseek'],
    ['inference-provider:remote-api', `inference-provider:${secondaryProviderId}`],
    [CANONICAL_LOCAL_TEST_IDS.endpoint, 'inference-endpoint:deepseek-default'],
    ['credential-locator:local-api', 'credential-locator:deepseek-api'],
    [CANONICAL_LOCAL_TEST_IDS.account, 'account:deepseek-api'],
    [CANONICAL_LOCAL_TEST_IDS.grant, 'grant:andrey-deepseek-api'],
    ['credential-binding:local-api', 'credential-binding:deepseek-api'],
    ['entitlement:local-api', 'entitlement:deepseek-api'],
    ['quota:local-api', 'quota:deepseek-api'],
    ['budget:narada-local-api', 'budget:narada-deepseek-api'],
    ['governance:narada-local-api', 'governance:narada-deepseek-api'],
    ['authority-statement:andrey-local-consent', 'authority-statement:andrey-deepseek-consent'],
    ['authority-statement:canonical-local-thinking-levels', 'authority-statement:canonical-deepseek-thinking-levels'],
    ['authority-statement:canonical-local-batch', 'authority-statement:canonical-deepseek-batch'],
    ['assert:canonical-local-thinking-levels', 'assert:canonical-deepseek-thinking-levels'],
    ['assert:canonical-local-batch', 'assert:canonical-deepseek-batch'],
    ['credential-handle:local-api', 'credential-handle:deepseek-api'],
  ]);
  const secondarySeed = rewriteCanonicalSeed(buildCanonicalLocalTestSeed({
    endpointBaseUrl,
    endpointUrl,
    adapterProtocol: canonicalAdapterProtocol(secondaryProviderId),
    credentialStore: 'env',
    credentialReference: canonicalCredentialReference(secondaryProviderId),
    invocationModelKey: 'deepseek-chat',
    now,
    validUntil,
  }), secondaryReplacements, secondaryProviderId);
  const secondaryRecords = secondarySeed.records
    .filter((record) => secondaryDocumentIds.has(record.document.id))
    .map((record, index) => normalizeSeedRecord({
      ...record,
      id: `catalog-record:live-secondary:${String(index + 1).padStart(3, '0')}`,
      source: { ...record.source },
    }, 'canonical-secondary-fixture'));
  seed.records.push(...secondaryRecords);
  seed.id = 'catalog-seed:live-multiple-intelligence';

  const registryDbPath = join(siteRoot, '.ai', 'intelligence-registry.db');
  await mkdir(join(siteRoot, '.ai'), { recursive: true });
  const store = await SqliteRegistryStore.open(registryDbPath);
  try {
    await store.loadCatalogSeed(seed);
  } finally {
    await store.close();
  }

  const principalBinding = {
    schema: PRINCIPAL_BINDING_SCHEMA,
    actor: {
      principal_id: CANONICAL_LOCAL_TEST_IDS.principal,
      auth_type: 'user-site-session',
    },
    memberships: [{
      registry: 'site-roster',
      site_id: targetSiteId,
      role: 'resident',
      evidence_ref: EVIDENCE_REF,
    }],
    evidence_refs: [EVIDENCE_REF],
  };
  const contextPath = join(siteRoot, '.narada', 'intelligence-launch-context.json');
  await mkdir(join(siteRoot, '.narada'), { recursive: true });
  await writeFile(contextPath, `${JSON.stringify({
    schema: INTELLIGENCE_CONTEXT_SCHEMA,
    registry_db_path: registryDbPath,
    target_site_id: targetSiteId,
    user_site_id: userSiteId,
    host_site_id: hostSiteId,
    principal_id: CANONICAL_LOCAL_TEST_IDS.principal,
    intelligence_kernel_kind: 'narada-native',
    principal_binding: principalBinding,
  }, null, 2)}\n`, 'utf8');

  return {
    registryDbPath,
    contextPath,
    targetSiteId,
    userSiteId,
    hostSiteId,
    providerId,
    modelId: CANONICAL_LOCAL_TEST_IDS.model,
    invocationModelKey: 'kimi-k2-thinking',
    defaultProviderId: secondaryProviderId,
    defaultModelId: secondaryModelId,
    defaultInvocationModelKey: 'deepseek-chat',
    defaultEndpointId: 'inference-endpoint:deepseek-default',
    providerChoices: [...new Set([providerId, secondaryProviderId])].sort(),
    modelChoices: ['deepseek-chat', 'kimi-k2-thinking'],
  };
}
