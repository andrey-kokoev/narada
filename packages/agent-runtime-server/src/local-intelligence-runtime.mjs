import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  deriveUserSiteRootFromRegistryPath,
  probeCodexSubscriptionService as probeCodexSubscriptionReadiness,
} from '@narada2/carrier-provider-support/codex-subscription-readiness';
import { resolveInvocationPrincipalAdmission } from '@narada2/invokable-intelligence-contract';
import { SqliteMaterializationStore } from '@narada2/invokable-intelligence-materialization';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';
import { buildResolverContext, createLocalInvocationGateway } from '@narada2/invokable-intelligence-runtime';
import { deterministicId, resolveInvocation } from '@narada2/invokable-intelligence-resolver';
import { readNarsEventLog } from '@narada2/nars-session-core/event-log';
import { createCanonicalInvocationAdapter } from '@narada2/nars-provider-runtime/canonical-invocation-adapter';
import {
  assertNarsKernelCapabilityGateway,
  normalizeIntelligenceKernelKind,
} from '@narada2/nars-intelligence-kernel-contract';
import { createIntelligenceKernel } from '@narada2/nars-pi-kernel';
import { createLocalTopologyObserver } from './local-topology-observer.mjs';
import { LOCAL_RUNTIME_SERVICE_EVIDENCE_SCHEMA } from './local-topology-observer.mjs';

const TOPOLOGY_OBSERVATION_ADMISSION_SCHEMA = 'narada.invokable-intelligence.topology-observation-admission.v1';
const TOPOLOGY_OBSERVATION_SCHEMA = 'narada.invokable-intelligence.topology-feasibility.v1';
const EVIDENCE_KINDS = new Set(['artifact', 'run', 'document', 'test', 'site-configuration']);
const DISABLED_NARS_CAPABILITY_GATEWAY = Object.freeze({
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

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function runtimePiRpcConfig(env) {
  const args = nonEmpty(env.NARADA_PI_RPC_ARGS);
  let parsedArgs = [];
  if (args) {
    try {
      const candidate = JSON.parse(args);
      if (!Array.isArray(candidate) || !candidate.every((item) => typeof item === 'string')) {
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

function parseTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return NaN;
  return Date.parse(value);
}

function boundedObservationValidityMs(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(10000, Math.max(100, Math.trunc(parsed)))
    : 1000;
}

function boundedRuntimeServiceValidityMs(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(60000, Math.max(1000, Math.trunc(parsed)))
    : 10000;
}

function validEvidence(evidence) {
  return Array.isArray(evidence)
    && evidence.length > 0
    && evidence.every((entry) => EVIDENCE_KINDS.has(entry?.kind)
      && nonEmpty(entry?.ref)
      && ['durable', 'observed', 'synthetic-correlation'].includes(entry?.evidence_class));
}

function validWindow(validity, now) {
  const validFrom = parseTimestamp(validity?.valid_from);
  const validUntil = parseTimestamp(validity?.valid_until);
  const freshAsOf = parseTimestamp(validity?.fresh_as_of);
  const at = parseTimestamp(now);
  return [validFrom, validUntil, freshAsOf, at].every(Number.isFinite)
    && validFrom < validUntil
    && freshAsOf >= validFrom
    && freshAsOf <= validUntil
    && at >= validFrom
    && at < validUntil
    && freshAsOf <= at;
}

function validateAdmittedTopologyObservations(observations, { runtimeContext, sites, now }) {
  if (!Array.isArray(observations) || observations.length === 0) return null;
  const admission = runtimeContext.intelligence?.topologyObservationAdmission;
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
  const seen = new Set();
  for (const observation of observations) {
    const observedAt = parseTimestamp(observation?.observed_at);
    const validityFrom = parseTimestamp(observation?.validity?.valid_from);
    const validityUntil = parseTimestamp(observation?.validity?.valid_until);
    const decisionAt = parseTimestamp(now);
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
  return Object.freeze(observations.map((observation) => Object.freeze({ ...observation })));
}

function validateInjectedRuntimeServices(runtimeServices, session, {
  authorityRef = `runtime:${session}`,
  now,
  validityMs = 1000,
} = {}) {
  if (!Array.isArray(runtimeServices) || runtimeServices.length === 0) return null;
  const decisionAt = Date.parse(now ?? '');
  const valid = runtimeServices.every((entry) => entry?.schema === LOCAL_RUNTIME_SERVICE_EVIDENCE_SCHEMA
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
  return valid ? runtimeServices.map((entry) => Object.freeze({ ...entry })) : null;
}

async function assertCanonicalSiteAdmission(store, sites, principal, principalBinding) {
  const [resources, records] = await Promise.all([
    store.listResources(),
    store.listCatalogRecords(),
  ]);
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  for (const site of Object.values(sites)) {
    const resource = byId.get(site.id);
    if (resource?.schema !== 'narada.invokable-intelligence.site.v1' || resource.id !== site.id) {
      throw new Error(`local_intelligence_site_not_admitted:${site.id}`);
    }
  }
  const principalRecord = records.find((record) => (
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
  const principalDocument = principalRecord.document;
  const admission = resolveInvocationPrincipalAdmission([principalDocument], {
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
} = {}) {
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

function requireRef(ref, label) {
  if (!ref || ref.kind !== 'site' || !nonEmpty(ref.id)) {
    throw new Error(`local_intelligence_${label}_required`);
  }
  return Object.freeze({ kind: 'site', id: ref.id.trim() });
}

export function executionSiteDecisionClock(authorityRef, date = new Date()) {
  const instant = date.toISOString();
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
export async function openLocalIntelligenceRegistry({ siteRoot, registryDbPath } = {}) {
  if (!nonEmpty(siteRoot)) throw new Error('local_intelligence_site_root_required');
  const dbPath = nonEmpty(registryDbPath) ?? join(siteRoot, '.ai', 'intelligence-registry.db');
  if (dbPath !== ':memory:') {
    try {
      const entry = await stat(dbPath);
      if (!entry.isFile()) throw new Error('not-a-file');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`intelligence_registry_not_initialized:${dbPath}`);
      }
      throw new Error(`intelligence_registry_unavailable:${dbPath}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const store = await SqliteRegistryStore.open(dbPath);
  try {
    const [records, resources] = await Promise.all([
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
} = {}) {
  const intelligence = runtimeContext?.intelligence;
  if (!intelligence || typeof intelligence !== 'object') throw new Error('local_intelligence_context_required');
  const sites = Object.freeze({
    targetSite: requireRef(intelligence.sites?.targetSite, 'target_site'),
    userSite: requireRef(intelligence.sites?.userSite, 'user_site'),
    hostSite: requireRef(intelligence.sites?.hostSite, 'host_site'),
  });
  const principal = nonEmpty(intelligence.principal);
  if (!principal) throw new Error('local_intelligence_principal_required');
  if (!intelligence.access || typeof intelligence.access !== 'object') {
    throw new Error('local_intelligence_access_context_required');
  }
  const admittedTopologyInput = Array.isArray(intelligence.topologyObservations)
    && intelligence.topologyObservations.length > 0
    ? intelligence.topologyObservations
    : null;
  const registryDbPath = nonEmpty(intelligence.registryDbPath)
    ?? join(runtimeContext.siteRoot, '.ai', 'intelligence-registry.db');
  const ownsStore = !inputStore;
  const store = inputStore ?? await openLocalIntelligenceRegistry({
    siteRoot: runtimeContext.siteRoot,
    registryDbPath,
  });
  const ownsMaterialization = !inputMaterialization;
  let materialization;
  let kernel = null;
  let ownsKernel = false;
  try {
    materialization = inputMaterialization ?? await SqliteMaterializationStore.open(registryDbPath);
    await assertCanonicalSiteAdmission(store, sites, principal, intelligence.principalBinding);
    const observationSource = intelligence.topologyObservationSource ?? {
      authority_ref: `runtime:${runtimeContext.session}`,
      observation_validity_ms: 1000,
    };
    const observationAuthorityRef = nonEmpty(observationSource.authority_ref)
      ?? `runtime:${runtimeContext.session}`;
    const observationValidityMs = boundedObservationValidityMs(observationSource.observation_validity_ms);
    const runtimeServiceValidityMs = boundedRuntimeServiceValidityMs(observationSource.runtime_service_validity_ms);
    const startupClock = clock();
    const admittedTopologyObservations = admittedTopologyInput
      ? validateAdmittedTopologyObservations(admittedTopologyInput, {
        runtimeContext,
        sites,
        now: startupClock.instant,
      })
      : null;
    const runtimeServicesFor = (services, now) => validateInjectedRuntimeServices(services, runtimeContext.session, {
      authorityRef: observationAuthorityRef,
      now,
      validityMs: runtimeServiceValidityMs,
    });
    const probeRuntimeServices = async (now) => {
      const probed = await runtimeServiceProbe({
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
      const probeDecisionAt = clock().instant;
      const admitted = runtimeServicesFor([probed], probeDecisionAt ?? now);
      if (!admitted) throw new Error('local_intelligence_runtime_service_probe_invalid');
      return admitted;
    };
    let runtimeServices = admittedTopologyObservations
      ? []
      : runtimeServicesFor(inputRuntimeServices, startupClock.instant)
        ?? await probeRuntimeServices(startupClock.instant);
    const providerAdapter = adapter ?? createCanonicalInvocationAdapter({
      runtimeContext: {
        ...runtimeContext,
        invocationScope: runtimeContext.invocationSettings?.invocationScope ?? null,
      },
      env,
    });
    const kernelKind = normalizeIntelligenceKernelKind(
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
    const startupCapabilityGateway = capabilityGateway
      ? assertNarsKernelCapabilityGateway(capabilityGateway)
      : assertNarsKernelCapabilityGateway(DISABLED_NARS_CAPABILITY_GATEWAY);
    const startupTools = await startupCapabilityGateway.toolCatalog();
    const kernelStartEvidence = await kernel.start({
      session_id: runtimeContext.session,
      agent_id: runtimeContext.identity,
      runtime_context: runtimeContext,
      tools: startupTools,
    });
    const invocationAdapter = Object.freeze({
      // This is the private gateway adapter seam. The kernel itself never
      // exposes an arbitrary public invoke(input) escape hatch.
      invoke: (admittedInvocation) => kernel.invokeAdmitted({
        ...admittedInvocation,
        capabilityGateway: startupCapabilityGateway,
      }),
    });
    const auditAuthority = Object.freeze({
      admittedBy: `runtime:${runtimeContext.session}`,
      admissionRef: `runtime-intelligence:${runtimeContext.session}`,
    });
    let topologyObserver = admittedTopologyObservations
      ? null
      : inputTopologyObserver ?? createLocalTopologyObserver({
        store,
        runtimeContext,
        source: observationSource,
        runtimeServices,
      });
    const contextForClock = async (decisionClock) => {
      // A runtime-service probe completes asynchronously. Its observed_at can
      // legitimately be a few milliseconds newer than the decision clock that
      // triggered the probe. Carry a refreshed authoritative clock forward so
      // the topology observer never evaluates fresh evidence as future/stale.
      // Preserve the gateway's authoritative decision clock. A runtime-service
      // probe is asynchronous, so its observation clock may advance after the
      // gateway sampled the decision clock; only the topology observation uses
      // that refreshed clock.
      let observationDecisionClock = decisionClock;
      if (!admittedTopologyObservations && !inputTopologyObserver) {
        const freshRuntimeServices = runtimeServicesFor(runtimeServices, decisionClock.instant);
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
      const topologyObservations = admittedTopologyObservations
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
    const materializationFor = (intent, context) => materialization.acquire({
      destination_site_id: context.targetSite.id,
      resolver: 'local',
      target_site_id: context.targetSite.id,
      purpose: intent.purpose,
      ...(intent.principal ? { principal_id: intent.principal } : {}),
      now: context.clock.instant,
    });
    const gateway = createLocalInvocationGateway({
      store,
      adapterFor: () => invocationAdapter,
      clock,
      contextFor: ({ clock: decisionClock }) => contextForClock(decisionClock),
      materializationFor: ({ intent, context }) => materializationFor(intent, context),
      auditAuthority,
      resultPayloadPolicy: ({ intent, plan, producedAt, request }) => ({
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
    let closed = false;
    return Object.freeze({
      gateway,
      kernel,
      kernel_kind: kernelKind,
      kernel_start_evidence: kernelStartEvidence,
      kernelHealth: () => kernel.health?.() ?? null,
      store,
      async preflightSelection({ requestedModel = null, requestedOptions = {} } = {}) {
        const decisionClock = clock();
        const intent = {
          schema: 'narada.invokable-intelligence.invocation-intent.v1',
          id: deterministicId('intent-preflight', {
            session: runtimeContext.session,
            principal,
            requestedModel,
            requestedOptions,
            clock: decisionClock,
          }),
          created_at: decisionClock.instant,
          principal,
          purpose: 'operator-chat',
          ...(requestedModel ? { requested_model: requestedModel } : {}),
          ...(Object.keys(requestedOptions).length ? { requested_options: requestedOptions } : {}),
        };
        const context = await contextForClock(decisionClock);
        const materializedInputs = await materializationFor(intent, context);
        const result = await resolveInvocation(intent, context, { store, materializedInputs });
        if (result.schema === 'narada.invokable-intelligence.invocation-refusal.v1') {
          throw new Error(`intelligence_selection_refused:${result.reason_code}:${result.explanation}`);
        }
        return result;
      },
      async close() {
        if (closed) return;
        closed = true;
        const closers = [];
        if (ownsKernel) closers.push(kernel.close({ reason: 'runtime_close' }));
        if (ownsMaterialization) closers.push(materialization.close());
        if (ownsStore) closers.push(store.close());
        await Promise.all(closers);
      },
    });
  } catch (error) {
    const cleanup = [];
    if (ownsKernel && kernel) cleanup.push(kernel.close({ reason: 'runtime_start_failed' }));
    if (ownsMaterialization && materialization) cleanup.push(materialization.close());
    if (ownsStore) cleanup.push(store.close());
    await Promise.allSettled(cleanup);
    throw error;
  }
}
