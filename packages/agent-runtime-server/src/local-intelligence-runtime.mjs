import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { SqliteMaterializationStore } from '@narada2/invokable-intelligence-materialization';
import { SqliteRegistryStore } from '@narada2/invokable-intelligence-registry';
import { buildResolverContext, createLocalInvocationGateway } from '@narada2/invokable-intelligence-runtime';
import { deterministicId, resolveInvocation } from '@narada2/invokable-intelligence-resolver';
import { createCanonicalInvocationAdapter } from '@narada2/nars-provider-runtime/canonical-invocation-adapter';
import { createLocalTopologyObserver } from './local-topology-observer.mjs';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
  topologyObserver: inputTopologyObserver = null,
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
  const admittedTopologyObservations = Array.isArray(intelligence.topologyObservations)
    && intelligence.topologyObservations.length > 0
    ? intelligence.topologyObservations
    : null;
  const registryDbPath = nonEmpty(intelligence.registryDbPath)
    ?? join(runtimeContext.siteRoot, '.ai', 'intelligence-registry.db');
  const store = inputStore ?? await openLocalIntelligenceRegistry({
    siteRoot: runtimeContext.siteRoot,
    registryDbPath,
  });
  let materialization;
  try {
    materialization = inputMaterialization ?? await SqliteMaterializationStore.open(registryDbPath);
  } catch (error) {
    if (!inputStore) await store.close();
    throw error;
  }
  const invocationAdapter = adapter ?? createCanonicalInvocationAdapter({
    runtimeContext: {
      ...runtimeContext,
      invocationScope: runtimeContext.invocationSettings?.invocationScope ?? null,
    },
    env,
  });
  const auditAuthority = Object.freeze({
    admittedBy: `runtime:${runtimeContext.session}`,
    admissionRef: `runtime-intelligence:${runtimeContext.session}`,
  });
  const topologyObserver = admittedTopologyObservations
    ? null
    : inputTopologyObserver ?? createLocalTopologyObserver({
      store,
      runtimeContext,
      source: intelligence.topologyObservationSource,
    });
  const contextForClock = async (decisionClock) => {
    const topologyObservations = admittedTopologyObservations
      ?? await topologyObserver.observe({ decisionClock });
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
      await Promise.all([materialization.close(), store.close()]);
    },
  });
}
