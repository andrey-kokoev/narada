import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  deriveUserSiteRootFromRegistryPath,
  probeCodexSubscriptionService as probeCodexSubscriptionReadiness,
} from '@narada2/carrier-provider-support/codex-subscription-readiness';
import {
  latestCatalogRecords,
  resolveInvocationPrincipalAdmission,
  resolveRouteCapabilities,
} from '@narada2/invokable-intelligence-contract';
import { SqliteMaterializationStore } from '@narada2/invokable-intelligence-materialization';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';
import { buildResolverContext, createLocalInvocationGateway } from '@narada2/invokable-intelligence-runtime';
import { assembleCandidates, deterministicId, resolveInvocation } from '@narada2/invokable-intelligence-resolver';
import { readNarsEventLog } from '@narada2/nars-session-core/event-log';
import { createCanonicalInvocationAdapter } from '@narada2/nars-provider-runtime/canonical-invocation-adapter';
import {
  assertNarsKernelCapabilityGateway,
  normalizeIntelligenceKernelKind,
} from '@narada2/nars-intelligence-kernel-contract';
import { createIntelligenceKernel } from '@narada2/nars-pi-kernel';
import { createLocalTopologyObserver } from './local-topology-observer.js';
import { LOCAL_RUNTIME_SERVICE_EVIDENCE_SCHEMA } from './local-topology-observer.js';

const TOPOLOGY_OBSERVATION_ADMISSION_SCHEMA: any = 'narada.invokable-intelligence.topology-observation-admission.v1';
const TOPOLOGY_OBSERVATION_SCHEMA: any = 'narada.invokable-intelligence.topology-feasibility.v1';
const EVIDENCE_KINDS: any = new Set(['artifact', 'run', 'document', 'test', 'site-configuration']);
const DISABLED_NARS_CAPABILITY_GATEWAY: any = Object.freeze({
  toolCatalog: async () => [],
  invoke: async () => ({
    status: 'unknown',
    admission_action: 'deny',
    execution_outcome: 'unknown',
    effect_confirmation: 'unknown',
    reason: 'capability_gateway_disabled',
  }),
  close: async () => {},
});

function nonEmpty(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function publicResourceId(value: any, prefix: any) {
  const id: any = typeof value === 'string' ? value : value?.id;
  if (typeof id !== 'string' || !id.trim()) return null;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

async function selectionChoicesFromCatalog(store: any) {
  const [resources, routeRecords, assertionRecords]: any = await Promise.all([
    store.listResources(),
    store.listCatalogRecords({ recordKind: 'route' }),
    store.listCatalogRecords({ recordKind: 'assertion' }),
  ]);
  const currentRouteRecords = latestCatalogRecords(routeRecords);
  const currentAssertionRecords = latestCatalogRecords(assertionRecords);
  const routes: any = currentRouteRecords
    .map((record: any) => record.document)
    .filter((document: any) => document?.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1');
  const candidates: any = assembleCandidates(resources, routes);
  const routeAssertions: any = currentAssertionRecords
    .map((record: any) => record.document)
    .filter((document: any) => document?.schema === 'narada.invokable-intelligence.route-capability-assertion.v1');
  const policies: any = await store.listPolicies();
  const offeringByRouteId = new Map<string, string>(routes.map((route: any) => [route.id, route.offering.id]));
  const defaultOfferingIds = new Set<string>();
  const preferredOfferingWeights = new Map<string, number>();
  for (const policy of policies) {
    for (const rule of Array.isArray(policy.rules) ? policy.rules : []) {
      if (rule.type === 'default-option' && typeof rule.value === 'string') {
        const offeringId = rule.option === 'route'
          ? offeringByRouteId.get(rule.value)
          : rule.option === 'model_offering' ? rule.value : null;
        if (offeringId) defaultOfferingIds.add(offeringId);
      }
      if (rule.type === 'prefer-resource' && rule.resource?.kind === 'model-offering' && typeof rule.resource.id === 'string') {
        const weight = Number(rule.weight);
        preferredOfferingWeights.set(rule.resource.id, Math.max(
          weight,
          preferredOfferingWeights.get(rule.resource.id) ?? Number.NEGATIVE_INFINITY,
        ));
      }
    }
  }
  const modelChoices = candidates
    .map((candidate: any) => ({
      value: nonEmpty(candidate.offering.invocation_model_key),
      offeringId: candidate.offering.id,
    }))
    .filter((candidate: any) => Boolean(candidate.value))
    .sort((left: any, right: any) => {
      const defaultDelta = Number(defaultOfferingIds.has(right.offeringId)) - Number(defaultOfferingIds.has(left.offeringId));
      if (defaultDelta !== 0) return defaultDelta;
      const preferenceDelta = (preferredOfferingWeights.get(right.offeringId) ?? 0)
        - (preferredOfferingWeights.get(left.offeringId) ?? 0);
      return preferenceDelta !== 0 ? preferenceDelta : left.value.localeCompare(right.value);
    });
  const providerModels = new Map<string, Map<string, any>>();
  for (const candidate of candidates) {
    const provider = publicResourceId(candidate.inferenceProvider, 'inference-provider:');
    const model = publicResourceId(candidate.model, 'model:');
    const invocationModelKey = nonEmpty(candidate.offering.invocation_model_key);
    if (!provider || !model || !invocationModelKey) continue;
    const models = providerModels.get(provider) ?? new Map<string, any>();
    const modelChoice = models.get(model) ?? {
      model_ref: { kind: 'model', id: candidate.model.id },
      model_provider: { kind: 'model-provider', id: candidate.modelProvider.id },
      inference_provider: { kind: 'inference-provider', id: candidate.inferenceProvider.id },
      offering_refs: new Map<string, any>(),
      invocation_model_keys: new Set<string>(),
      display_name: nonEmpty(candidate.model.display_name),
      capabilities: new Map<string, any>(),
    };
    modelChoice.offering_refs.set(candidate.offering.id, {
      kind: 'model-offering',
      id: candidate.offering.id,
    });
    modelChoice.invocation_model_keys.add(invocationModelKey);
    const capabilities = resolveRouteCapabilities(candidate.route, candidate.offering, routeAssertions).capabilities;
    for (const capability of capabilities) {
      const key = `${capability.capability.family}/${capability.capability.name}`;
      const previous = modelChoice.capabilities.get(key);
      modelChoice.capabilities.set(key, previous ? intersectSelectionCapabilities(previous, capability) : {
        ...capability,
        ...(Array.isArray(capability.allowed_values) ? { allowed_values: [...capability.allowed_values] } : {}),
        ...(Array.isArray(capability.assertion_ids) ? { assertion_ids: [...capability.assertion_ids] } : {}),
        ...(Array.isArray(capability.reasons) ? { reasons: [...capability.reasons] } : {}),
      });
    }
    models.set(model, modelChoice);
    providerModels.set(provider, models);
  }
  const selectionProviders = [...providerModels.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([provider, models]) => ({
      provider,
      inference_provider: models.values().next().value?.inference_provider ?? { kind: 'inference-provider', id: `inference-provider:${provider}` },
      models: [...models.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, modelChoice]) => {
          const capabilities = [...modelChoice.capabilities.values()].sort((left: any, right: any) => (
            `${left.capability.family}/${left.capability.name}`.localeCompare(`${right.capability.family}/${right.capability.name}`)
          ));
          const thinking = capabilities.find((capability: any) => (
            capability.capability?.family === 'thinking' && capability.capability?.name === 'levels'
          ));
          const invocationModelKey = [...modelChoice.invocation_model_keys].sort()[0];
          return {
            model: invocationModelKey,
            model_ref: modelChoice.model_ref,
            model_provider: modelChoice.model_provider,
            inference_provider: modelChoice.inference_provider,
            offering_refs: Object.freeze([...modelChoice.offering_refs.values()]),
            invocation_model_key: invocationModelKey,
            ...(modelChoice.display_name ? { display_name: modelChoice.display_name } : {}),
            capabilities: Object.freeze(capabilities),
            thinking_choices: Object.freeze(Array.isArray(thinking?.allowed_values) ? [...thinking.allowed_values].sort() : []),
          };
        }),
    }));
  return Object.freeze({
    provider_choices: Object.freeze([...new Set(candidates
      .map((candidate: any) => publicResourceId(candidate.inferenceProvider, 'inference-provider:'))
      .filter(Boolean))].sort()),
    model_choices: Object.freeze([...new Set(modelChoices.map(({ value }: any) => value))]),
    selection_choices: Object.freeze({
      schema: 'narada.invokable-intelligence.selection-choices.v1',
      providers: Object.freeze(selectionProviders.map((provider) => Object.freeze({
        ...provider,
        models: Object.freeze(provider.models.map((model) => Object.freeze(model))),
      }))),
    }),
  });
}

function intersectSelectionCapabilities(previous: any, current: any) {
  const previousAllowed = Array.isArray(previous.allowed_values) ? previous.allowed_values : null;
  const currentAllowed = Array.isArray(current.allowed_values) ? current.allowed_values : null;
  const allowedValues = previousAllowed && currentAllowed
    ? previousAllowed.filter((value: any) => currentAllowed.includes(value))
    : previousAllowed ?? currentAllowed;
  const maximum = previous.maximum && current.maximum
    ? previous.maximum.unit === current.maximum.unit
      ? (previous.maximum.value <= current.maximum.value ? previous.maximum : current.maximum)
      : undefined
    : previous.maximum ?? current.maximum;
  const availability = previous.availability?.status === 'unavailable' || current.availability?.status === 'unavailable'
    ? { ...(current.availability ?? previous.availability), status: 'unavailable' }
    : current.availability ?? previous.availability;
  return {
    ...previous,
    supported: Boolean(previous.supported && current.supported && (allowedValues === undefined || allowedValues.length > 0) && (!previous.maximum || !current.maximum || maximum !== undefined)),
    ...(allowedValues !== undefined ? { allowed_values: [...allowedValues] } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    ...(availability ? { availability } : {}),
    assertion_ids: [...new Set([...(previous.assertion_ids ?? []), ...(current.assertion_ids ?? [])])],
    reasons: [...new Set([...(previous.reasons ?? []), ...(current.reasons ?? []), ...(allowedValues?.length === 0 ? ['allowed-value-intersection-empty'] : []), ...(previous.maximum && current.maximum && maximum === undefined ? ['maximum-unit-conflict'] : [])])],
  };
}

/** Read the catalog-backed representation used by operator admission UIs.
 * Provider/model values returned here are display choices only; runtime
 * invocation remains responsible for authoritative selection.
 */
export async function readLocalIntelligenceSelectionChoices({ siteRoot, registryDbPath }: any = {}) {
  const store: any = await openLocalIntelligenceRegistry({ siteRoot, registryDbPath });
  try {
    return await selectionChoicesFromCatalog(store);
  } finally {
    await store.close();
  }
}

function runtimePiRpcConfig(env: any) {
  const args: any = nonEmpty(env.NARADA_PI_RPC_ARGS);
  let parsedArgs: any = [];
  if (args) {
    try {
      const candidate: any = JSON.parse(args);
      if (!Array.isArray(candidate) || !candidate.every((item: any) => typeof item === 'string')) {
        throw new Error('args must be a JSON string array');
      }
      parsedArgs = candidate;
    } catch (error) {
      throw new Error(`pi_rpc_args_invalid:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    command: nonEmpty(env.NARADA_PI_RPC_COMMAND),
    args: parsedArgs,
    piVersion: nonEmpty(env.NARADA_PI_VERSION),
  };
}

function parseTimestamp(value: any) {
  if (typeof value !== 'string' || !value.trim()) return NaN;
  return Date.parse(value);
}

function boundedObservationValidityMs(value: any) {
  const parsed: any = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(10000, Math.max(100, Math.trunc(parsed)))
    : 1000;
}

function boundedRuntimeServiceValidityMs(value: any) {
  const parsed: any = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(60000, Math.max(1000, Math.trunc(parsed)))
    : 10000;
}

function validEvidence(evidence: any) {
  return Array.isArray(evidence)
    && evidence.length > 0
    && evidence.every((entry: any) => EVIDENCE_KINDS.has(entry?.kind)
      && nonEmpty(entry?.ref)
      && ['durable', 'observed', 'synthetic-correlation'].includes(entry?.evidence_class));
}

function validWindow(validity: any, now: any) {
  const validFrom: any = parseTimestamp(validity?.valid_from);
  const validUntil: any = parseTimestamp(validity?.valid_until);
  const freshAsOf: any = parseTimestamp(validity?.fresh_as_of);
  const at: any = parseTimestamp(now);
  return [validFrom, validUntil, freshAsOf, at].every(Number.isFinite)
    && validFrom < validUntil
    && freshAsOf >= validFrom
    && freshAsOf <= validUntil
    && at >= validFrom
    && at < validUntil
    && freshAsOf <= at;
}

function validateAdmittedTopologyObservations(observations: any, { runtimeContext, sites, now }: any) {
  if (!Array.isArray(observations) || observations.length === 0) return null;
  const admission: any = runtimeContext.intelligence?.topologyObservationAdmission;
  if (admission?.schema !== TOPOLOGY_OBSERVATION_ADMISSION_SCHEMA
    || admission.runtime_session_id !== runtimeContext.session
    || admission.authority_ref !== `runtime:${runtimeContext.session}`
    || admission.binding?.target_site_id !== sites.targetSite.id
    || admission.binding?.user_site_id !== sites.userSite.id
    || admission.binding?.host_site_id !== sites.hostSite.id
    || !validWindow(admission.validity, now)
    || !validEvidence(admission.evidence)) {
    throw new Error('local_intelligence_topology_observation_admission_invalid');
  }
  const seen: any = new Set();
  for (const observation of observations) {
    const observedAt: any = parseTimestamp(observation?.observed_at);
    const validityFrom: any = parseTimestamp(observation?.validity?.valid_from);
    const validityUntil: any = parseTimestamp(observation?.validity?.valid_until);
    const decisionAt: any = parseTimestamp(now);
    if (observation?.schema !== TOPOLOGY_OBSERVATION_SCHEMA
      || !nonEmpty(observation.id)
      || seen.has(observation.id)
      || !nonEmpty(observation.topology_id)
      || !['node', 'edge'].includes(observation.subject?.kind)
      || !nonEmpty(observation.subject?.id)
      || !nonEmpty(observation.requirement)
      || !['feasible', 'infeasible', 'unknown'].includes(observation.status)
      || !nonEmpty(observation.owner?.site_id)
      || !nonEmpty(observation.owner?.locus)
      || !nonEmpty(observation.owner?.authority_ref)
      || !validWindow(observation.validity, now)
      || ![observedAt, validityFrom, validityUntil, decisionAt].every(Number.isFinite)
      || observedAt < validityFrom
      || observedAt >= validityUntil
      || observedAt > decisionAt
       || parseTimestamp(observation.validity.fresh_as_of) > observedAt
      || !validEvidence(observation.evidence)) {
      throw new Error(`local_intelligence_topology_observation_invalid:${observation?.id ?? 'unknown'}`);
    }
    seen.add(observation.id);
  }
  return Object.freeze(observations.map((observation: any) => Object.freeze({ ...observation })));
}

function validateInjectedRuntimeServices(runtimeServices: any, session: any, {
  authorityRef = `runtime:${session}`,
  now,
  validityMs = 1000,
}: any = {}) {
  if (!Array.isArray(runtimeServices) || runtimeServices.length === 0) return null;
  const decisionAt: any = Date.parse(now ?? '');
  const valid: any = runtimeServices.every((entry: any) => entry?.schema === LOCAL_RUNTIME_SERVICE_EVIDENCE_SCHEMA
    && nonEmpty(entry.service)
    && nonEmpty(entry.runtime_family)
    && nonEmpty(entry.protocol_family)
    && ['ready', 'executable-present', 'unavailable'].includes(entry.status)
    && entry.observed_for_session === session
    && entry.authority_ref === authorityRef
    && nonEmpty(entry.evidence_ref)
    && ['durable', 'observed'].includes(entry.evidence_class)
     && Number.isFinite(parseTimestamp(entry.observed_at))
    && Number.isFinite(decisionAt)
     && parseTimestamp(entry.observed_at) <= decisionAt
     && decisionAt - parseTimestamp(entry.observed_at) <= validityMs);
  return valid ? runtimeServices.map((entry: any) => Object.freeze({ ...entry })) : null;
}

async function assertCanonicalSiteAdmission(store: any, sites: any, principal: any, principalBinding: any) {
  const [resources, records]: any = await Promise.all([
    store.listResources(),
    store.listCatalogRecords(),
  ]);
  const byId: any = new Map(resources.map((resource: any) => [resource.id, resource]));
  for (const site of Object.values(sites) as any[]) {
    const resource: any = byId.get(site.id);
    if (resource?.schema !== 'narada.invokable-intelligence.site.v1' || resource.id !== site.id) {
      throw new Error(`local_intelligence_site_not_admitted:${site.id}`);
    }
  }
  const principalRecord: any = records.find((record: any) => (
    record?.validation?.status === 'accepted'
    && record.document?.schema === 'narada.invokable-intelligence.principal.v1'
    && record.document.id === principal
  ));
  if (!principalRecord) {
    throw new Error(`local_intelligence_principal_not_admitted:${principal}`);
  }
  if (!principalBinding || typeof principalBinding !== 'object') {
    throw new Error(`local_intelligence_principal_binding_missing:${principal}`);
  }
  const principalDocument: any = principalRecord.document;
  const admission: any = resolveInvocationPrincipalAdmission([principalDocument], {
    actor: principalBinding.actor,
    memberships: principalBinding.memberships ?? [],
  });
  if (!admission.ok) {
    throw new Error(`local_intelligence_principal_binding_${admission.code}:${principal}`);
  }
  if (admission.principal.id !== principal) {
    throw new Error(`local_intelligence_principal_binding_mismatch:${principal}:${admission.principal.id}`);
  }
}

/** Probe the exact local Codex subscription service required by the canonical route. */
export async function probeCodexSubscriptionService({
  env = process.env,
  session = 'unknown',
  authorityRef = `runtime:${session}`,
  timeoutMs = 60000,
  registryDbPath = null,
  userSiteRoot = null,
  sessionSiteRoot = null,
  siteId = null,
  agentIdentityRef = null,
  launchSessionId = null,
  model = null,
  thinking = null,
}: any = {}) {
  return probeCodexSubscriptionReadiness({
    env,
    session,
    authorityRef,
    timeoutMs,
    registryDbPath,
    userSiteRoot: userSiteRoot ?? deriveUserSiteRootFromRegistryPath(registryDbPath ?? env.NARADA_INTELLIGENCE_REGISTRY_DB),
    sessionSiteRoot: sessionSiteRoot ?? env.NARADA_SITE_ROOT ?? process.cwd(),
    siteId: siteId ?? env.NARADA_SITE_ID ?? null,
    agentIdentityRef,
    launchSessionId,
    model,
    thinking,
  });
}

function requireRef(ref: any, label: any) {
  if (!ref || ref.kind !== 'site' || !nonEmpty(ref.id)) {
    throw new Error(`local_intelligence_${label}_required`);
  }
  return Object.freeze({ kind: 'site', id: ref.id.trim() });
}

export function executionSiteDecisionClock(authorityRef: any, date: any = new Date()) {
  const instant: any = date.toISOString();
  return {
    source: 'execution-site-clock',
    authority_ref: nonEmpty(authorityRef) ?? 'runtime:unknown',
    instant,
    timezone: 'UTC',
    local: {
      date: instant.slice(0, 10),
      time: instant.slice(11, 19),
      weekday: date.getUTCDay(),
    },
  };
}

/** Open an already admitted canonical catalog. Runtime startup never migrates or grants authority. */
export async function openLocalIntelligenceRegistry({ siteRoot, registryDbPath }: any = {}) {
  if (!nonEmpty(siteRoot)) throw new Error('local_intelligence_site_root_required');
  const dbPath: any = nonEmpty(registryDbPath) ?? join(siteRoot, '.ai', 'intelligence-registry.db');
  if (dbPath !== ':memory:') {
    try {
      const entry: any = await stat(dbPath);
      if (!entry.isFile()) throw new Error('not-a-file');
    } catch (error) {
      const errorCode = error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (errorCode === 'ENOENT') {
        throw new Error(`intelligence_registry_not_initialized:${dbPath}`);
      }
      throw new Error(`intelligence_registry_unavailable:${dbPath}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const store: any = await SqliteRegistryStore.open(dbPath);
  try {
    const [records, resources]: any = await Promise.all([
      store.listCatalogRecords(),
      store.listResources(),
    ]);
    if (records.length === 0 || resources.length === 0) {
      throw new Error(`intelligence_registry_not_initialized:${dbPath}:catalog_records=${records.length}:resources=${resources.length}`);
    }
    return store;
  } catch (error) {
    await store.close();
    throw error;
  }
}

/** Compose the Node adapter and canonical durable gateway from explicit runtime context. */
export async function createLocalIntelligenceRuntime({
  runtimeContext,
  env = process.env,
  store: inputStore = null,
  materialization: inputMaterialization = null,
  clock = () => executionSiteDecisionClock(`runtime:${runtimeContext?.session ?? 'unknown'}`),
  adapter = null,
  kernel: inputKernel = null,
  kernelFactory = createIntelligenceKernel,
  piSdk = null,
  piSessionFactory = null,
  piRpc = null,
  readNarsRecords = null,
  artifactRegistrar = null,
  topologyObserver: inputTopologyObserver = null,
  runtimeServices: inputRuntimeServices = null,
  runtimeServiceProbe = probeCodexSubscriptionService,
  capabilityGateway = null,
}: any = {}) {
  const intelligence: any = runtimeContext?.intelligence;
  if (!intelligence || typeof intelligence !== 'object') throw new Error('local_intelligence_context_required');
  const sites: any = Object.freeze({
    targetSite: requireRef(intelligence.sites?.targetSite, 'target_site'),
    userSite: requireRef(intelligence.sites?.userSite, 'user_site'),
    hostSite: requireRef(intelligence.sites?.hostSite, 'host_site'),
  });
  const principal: any = nonEmpty(intelligence.principal);
  if (!principal) throw new Error('local_intelligence_principal_required');
  if (!intelligence.access || typeof intelligence.access !== 'object') {
    throw new Error('local_intelligence_access_context_required');
  }
  const admittedTopologyInput: any = Array.isArray(intelligence.topologyObservations)
    && intelligence.topologyObservations.length > 0
    ? intelligence.topologyObservations
    : null;
  const registryDbPath: any = nonEmpty(intelligence.registryDbPath)
    ?? join(runtimeContext.siteRoot, '.ai', 'intelligence-registry.db');
  const ownsStore: any = !inputStore;
  const store: any = inputStore ?? await openLocalIntelligenceRegistry({
    siteRoot: runtimeContext.siteRoot,
    registryDbPath,
  });
  const ownsMaterialization: any = !inputMaterialization;
  let materialization: any;
  let kernel: any = null;
  let ownsKernel: any = false;
  try {
    materialization = inputMaterialization ?? await SqliteMaterializationStore.open(registryDbPath);
    await assertCanonicalSiteAdmission(store, sites, principal, intelligence.principalBinding);
    const selectionChoices: any = await selectionChoicesFromCatalog(store);
    const observationSource: any = intelligence.topologyObservationSource ?? {
      authority_ref: `runtime:${runtimeContext.session}`,
      observation_validity_ms: 1000,
    };
    const observationAuthorityRef: any = nonEmpty(observationSource.authority_ref)
      ?? `runtime:${runtimeContext.session}`;
    const observationValidityMs: any = boundedObservationValidityMs(observationSource.observation_validity_ms);
    const runtimeServiceValidityMs: any = boundedRuntimeServiceValidityMs(observationSource.runtime_service_validity_ms);
    const startupClock: any = clock();
    const admittedTopologyObservations: any = admittedTopologyInput
      ? validateAdmittedTopologyObservations(admittedTopologyInput, {
        runtimeContext,
        sites,
        now: startupClock.instant,
      })
      : null;
    const runtimeServicesFor: any = (services: any, now: any) => validateInjectedRuntimeServices(services, runtimeContext.session, {
      authorityRef: observationAuthorityRef,
      now,
      validityMs: runtimeServiceValidityMs,
    });
    const probeRuntimeServices: any = async (now: any) => {
      const probed: any = await runtimeServiceProbe({
        env,
        session: runtimeContext.session,
        authorityRef: observationAuthorityRef,
        registryDbPath,
        sessionSiteRoot: runtimeContext.siteRoot,
        siteId: runtimeContext.siteId,
        agentIdentityRef: runtimeContext.agentIdentityRef,
        launchSessionId: runtimeContext.launchSessionId,
        model: intelligence.model ?? env.NARADA_AI_MODEL ?? env.CODEX_MODEL ?? null,
        thinking: intelligence.thinking ?? env.NARADA_AI_THINKING ?? env.CODEX_THINKING ?? null,
      });
      // The probe records its observation when it completes. Re-read the
      // authoritative decision clock after the await so a slow probe is not
      // rejected merely because it finished after the clock sampled before it.
      const probeDecisionAt: any = clock().instant;
      const admitted: any = runtimeServicesFor([probed], probeDecisionAt ?? now);
      if (!admitted) throw new Error('local_intelligence_runtime_service_probe_invalid');
      return admitted;
    };
    let runtimeServices: any = admittedTopologyObservations
      ? []
      : runtimeServicesFor(inputRuntimeServices, startupClock.instant)
        ?? await probeRuntimeServices(startupClock.instant);
    const providerAdapter: any = adapter ?? createCanonicalInvocationAdapter({
      runtimeContext: {
        ...runtimeContext,
        invocationScope: runtimeContext.invocationSettings?.invocationScope ?? null,
      },
      env,
    });
    const kernelKind: any = normalizeIntelligenceKernelKind(
      runtimeContext.intelligenceKernelKind
        ?? intelligence.intelligence_kernel_kind
        ?? intelligence.kernel_kind
        ?? env.NARADA_INTELLIGENCE_KERNEL,
    );
    ownsKernel = !inputKernel;
    kernel = inputKernel ?? kernelFactory({
      kind: kernelKind,
      providerAdapter,
      runtimeContext: {
        ...runtimeContext,
        provider: intelligence.provider ?? null,
        model: intelligence.model ?? null,
        thinking: intelligence.thinking ?? null,
      },
      sdk: piSdk,
      sessionFactory: piSessionFactory,
      ...(piRpc ? { rpc: piRpc } : {}),
      ...(kernelKind === 'pi-rpc' && !piRpc ? { rpc: runtimePiRpcConfig(env) } : {}),
      readNarsRecords: readNarsRecords ?? (runtimeContext.eventsPath
        ? async () => readNarsEventLog(runtimeContext.eventsPath).events
        : undefined),
      ...(artifactRegistrar ? { artifactRegistrar } : {}),
    });
    if (!kernel || typeof kernel.start !== 'function' || typeof kernel.invokeAdmitted !== 'function') {
      throw new Error(`local_intelligence_kernel_invalid:${kernelKind}`);
    }
    // A local runtime always binds one canonical gateway to the kernel.  The
    // disabled form is an inert NARS-owned boundary for unit/native runs with
    // MCP disabled; it is not a provider or ambient-tool fallback.  A caller
    // supplied per-turn gateway is never allowed to replace this binding.
    const startupCapabilityGateway: any = capabilityGateway
      ? assertNarsKernelCapabilityGateway(capabilityGateway)
      : assertNarsKernelCapabilityGateway(DISABLED_NARS_CAPABILITY_GATEWAY);
    const startupTools: any = await startupCapabilityGateway.toolCatalog();
    const kernelStartEvidence: any = await kernel.start({
      session_id: runtimeContext.session,
      agent_id: runtimeContext.identity,
      runtime_context: runtimeContext,
      execution_policy: runtimeContext.executionPolicy ?? runtimeContext.execution_policy,
      tools: startupTools,
    });
    const invocationAdapter: any = Object.freeze({
      // This is the private gateway adapter seam. The kernel itself never
      // exposes an arbitrary public invoke(input) escape hatch.
      invoke: (admittedInvocation: any) => kernel.invokeAdmitted({
        ...admittedInvocation,
        capabilityGateway: startupCapabilityGateway,
      }),
    });
    const auditAuthority: any = Object.freeze({
      admittedBy: `runtime:${runtimeContext.session}`,
      admissionRef: `runtime-intelligence:${runtimeContext.session}`,
    });
    let topologyObserver: any = admittedTopologyObservations
      ? null
      : inputTopologyObserver ?? createLocalTopologyObserver({
        store,
        runtimeContext,
        source: observationSource,
        runtimeServices,
      });
    const contextForClock: any = async (decisionClock: any) => {
      // A runtime-service probe completes asynchronously. Its observed_at can
      // legitimately be a few milliseconds newer than the decision clock that
      // triggered the probe. Carry a refreshed authoritative clock forward so
      // the topology observer never evaluates fresh evidence as future/stale.
      // Preserve the gateway's authoritative decision clock. A runtime-service
      // probe is asynchronous, so its observation clock may advance after the
      // gateway sampled the decision clock; only the topology observation uses
      // that refreshed clock.
      let observationDecisionClock: any = decisionClock;
      if (!admittedTopologyObservations && !inputTopologyObserver) {
        const freshRuntimeServices: any = runtimeServicesFor(runtimeServices, decisionClock.instant);
        if (!freshRuntimeServices) {
          runtimeServices = await probeRuntimeServices(decisionClock.instant);
          observationDecisionClock = clock();
          topologyObserver = createLocalTopologyObserver({
            store,
            runtimeContext,
            source: observationSource,
            runtimeServices,
          });
        }
      }
      const topologyObservations: any = admittedTopologyObservations
        ? validateAdmittedTopologyObservations(admittedTopologyInput, {
          runtimeContext,
          sites,
          now: decisionClock.instant,
        })
        : await topologyObserver.observe({ decisionClock: observationDecisionClock });
      return buildResolverContext(sites, {
        clock: decisionClock,
        runtime: 'node',
        access: intelligence.access,
        topologyObservations,
      });
    };
    const materializationFor: any = (intent: any, context: any) => materialization.acquire({
      destination_site_id: context.targetSite.id,
      resolver: 'local',
      target_site_id: context.targetSite.id,
      purpose: intent.purpose,
      ...(intent.principal ? { principal_id: intent.principal } : {}),
      now: context.clock.instant,
    });
    const gateway: any = createLocalInvocationGateway({
      store,
      adapterFor: () => invocationAdapter,
      clock,
      contextFor: ({ clock: decisionClock }: any) => contextForClock(decisionClock),
      materializationFor: ({ intent, context }: any) => materializationFor(intent, context),
      auditAuthority,
      resultPayloadPolicy: ({ intent, plan, producedAt, request }: any) => ({
        media_type: 'application/json',
        classification: request && intelligence.access.data_classification
          ? intelligence.access.data_classification
          : 'internal',
        retention: {
          mode: 'never-retain',
          policy_ref: plan.access.governance_requirement_ids[0],
          residency: sites.hostSite.id,
        },
        access: {
          allowed_principals: intent.principal ? [intent.principal] : [],
          capability_refs: ['capability:invocation-result-read'],
        },
        disposition: 'never-retained',
        tombstone: {
          disposed_at: producedAt,
          reason_code: 'runtime-result-never-retain',
          evidence_ref: auditAuthority.admissionRef,
        },
      }),
    });
    let closed: any = false;
    return Object.freeze({
      gateway,
      kernel,
      kernel_kind: kernelKind,
      kernel_start_evidence: kernelStartEvidence,
      selectionChoices,
      kernelHealth: () => kernel.health?.() ?? null,
      store,
      async preflightSelection({ requestedInferenceProvider = null, requestedModel = null, requestedOptions = {} }: any = {}) {
        const decisionClock: any = clock();
        const intent: any = {
          schema: 'narada.invokable-intelligence.invocation-intent.v1',
          id: deterministicId('intent-preflight', {
            session: runtimeContext.session,
            principal,
            requestedInferenceProvider,
            requestedModel,
            requestedOptions,
            clock: decisionClock,
          }),
          created_at: decisionClock.instant,
          principal,
          purpose: 'operator-chat',
          ...(requestedInferenceProvider ? { requested_inference_provider: requestedInferenceProvider } : {}),
          ...(requestedModel ? { requested_model: requestedModel } : {}),
          ...(Object.keys(requestedOptions).length ? { requested_options: requestedOptions } : {}),
        };
        const context: any = await contextForClock(decisionClock);
        const materializedInputs: any = await materializationFor(intent, context);
        const result: any = await resolveInvocation(intent, context, { store, materializedInputs });
        if (result.schema === 'narada.invokable-intelligence.invocation-refusal.v1') {
          throw new Error(`intelligence_selection_refused:${result.reason_code}:${result.explanation}`);
        }
        return result;
      },
      async close() {
        if (closed) return;
        closed = true;
        const closers: any = [];
        if (ownsKernel) closers.push(kernel.close({ reason: 'runtime_close' }));
        if (ownsMaterialization) closers.push(materialization.close());
        if (ownsStore) closers.push(store.close());
        await Promise.all(closers);
      },
    });
  } catch (error) {
    const cleanup: any = [];
    if (ownsKernel && kernel) cleanup.push(kernel.close({ reason: 'runtime_start_failed' }));
    if (ownsMaterialization && materialization) cleanup.push(materialization.close());
    if (ownsStore) cleanup.push(store.close());
    await Promise.allSettled(cleanup);
    throw error;
  }
}
