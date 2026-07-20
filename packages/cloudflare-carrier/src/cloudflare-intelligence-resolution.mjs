/**
 * Cloudflare carrier intelligence resolution.
 *
 * The Worker receives only infrastructure bindings from `env`. Catalog,
 * policy, defaults, access grants, and executable routes must already exist
 * as admitted canonical records in D1. Runtime startup never seeds or
 * promotes environment values into intelligence authority.
 */

import { D1MaterializationStore } from '@narada2/invokable-intelligence-materialization';
import { D1RegistryStore } from '@narada2/invokable-intelligence-registry/d1';
import {
  resolveInvocationPrincipalAdmission,
  siteMatchesRegistryIdentity,
} from '@narada2/invokable-intelligence-contract';
import {
  buildResolverContext,
  createLocalInvocationGateway,
} from '@narada2/invokable-intelligence-runtime';

export const CARRIER_INTELLIGENCE_ADAPTER_ID = 'adapter:workers-ai-binding';
export const CLOUDFLARE_SITE_REGISTRY_ID = 'narada.cloudflare-site-registry.v1';

const REQUIRED_INFRASTRUCTURE_BINDINGS = ['INTELLIGENCE_REGISTRY_DB'];

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function intelligenceError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function latestRecords(records) {
  const latest = new Map();
  for (const record of records) {
    const current = latest.get(record.record_id);
    if (!current || record.revision > current.revision) latest.set(record.record_id, record);
  }
  return [...latest.values()];
}

function requireCarrierContext(value) {
  const actor = value?.authenticated_actor;
  const membership = value?.site_membership;
  const target = value?.target_registry_site;
  if (
    value?.source !== 'cloudflare-carrier-site-admission'
    || !nonEmpty(actor?.principal_id)
    || !nonEmpty(actor?.auth_type)
    || target?.registry !== CLOUDFLARE_SITE_REGISTRY_ID
    || !nonEmpty(target?.subject_id)
    || membership?.registry !== CLOUDFLARE_SITE_REGISTRY_ID
    || membership?.site_id !== target.subject_id
    || !nonEmpty(membership?.role)
    || !nonEmpty(membership?.evidence_ref)
  ) {
    throw intelligenceError(
      'intelligence_authentication_context_invalid',
      'A server-admitted carrier actor, target Site binding, and Site membership are required.',
    );
  }
  return {
    actor: { principal_id: actor.principal_id.trim(), auth_type: actor.auth_type.trim() },
    targetRegistrySite: { registry: target.registry, subject_id: target.subject_id.trim() },
    membership: {
      registry: membership.registry,
      site_id: membership.site_id,
      role: membership.role.trim(),
      evidence_ref: membership.evidence_ref.trim(),
    },
  };
}

function runtimeAccessContext() {
  return {
    action: 'invoke',
    requested_region: 'global',
    data_classification: 'internal',
    requested_retention_days: 0,
    provider_training: 'prohibited',
    expected_usage: { amount: 1, unit: 'requests' },
    expected_cost: { amount: 0, currency: 'USD' },
  };
}

function topologyObservations(records, clock, evidenceRef) {
  const validityWindowMs = 5 * 60 * 1000;
  const observedMs = Math.floor(Date.parse(clock.instant) / validityWindowMs) * validityWindowMs;
  const observedAt = new Date(observedMs).toISOString();
  const validUntil = new Date(observedMs + validityWindowMs).toISOString();
  const observations = [];
  for (const record of records) {
    const route = record.document;
    if (route?.schema !== 'narada.invokable-intelligence.invocation-route-candidate.v1') continue;
    const components = [
      ...route.topology.nodes.map((node) => ({ subject: { kind: 'node', id: node.id }, component: node })),
      ...route.topology.edges.map((edge) => ({ subject: { kind: 'edge', id: edge.id }, component: edge })),
    ];
    for (const { subject, component } of components) {
      for (const requirement of component.required_feasibility) {
        observations.push({
          schema: 'narada.invokable-intelligence.topology-feasibility.v1',
          id: `topology-observation:${route.topology.id}:${subject.kind}:${subject.id}:${requirement}:${observedAt}`,
          topology_id: route.topology.id,
          subject,
          requirement,
          status: 'feasible',
          owner: { ...component.feasibility_authority },
          validity: { valid_from: observedAt, valid_until: validUntil, fresh_as_of: observedAt },
          observed_at: observedAt,
          evidence: [
            { kind: 'run', ref: evidenceRef },
            { kind: 'artifact', ref: 'cloudflare-worker-binding:AI' },
          ],
          reason_code: 'cloudflare-carrier-runtime-and-binding-observed',
        });
      }
    }
  }
  return observations;
}

async function admitCarrierInvocationRequest(store, request) {
  const carrier = requireCarrierContext(request.carrierContext);
  const [resources, catalogRecords] = await Promise.all([
    store.listResources(),
    store.listCatalogRecords(),
  ]);
  const records = latestRecords(catalogRecords);
  const targetSites = resources.filter((resource) =>
    resource.schema === 'narada.invokable-intelligence.site.v1'
    && siteMatchesRegistryIdentity(resource, carrier.targetRegistrySite.registry, carrier.targetRegistrySite.subject_id));
  if (targetSites.length !== 1) {
    throw intelligenceError(
      targetSites.length === 0 ? 'intelligence_target_site_binding_missing' : 'intelligence_target_site_binding_ambiguous',
      `The admitted Site registry identity resolves to ${targetSites.length} canonical Sites.`,
      { candidate_site_ids: targetSites.map(({ id }) => id).sort() },
    );
  }
  const principals = records
    .map(({ document }) => document)
    .filter((document) => document.schema === 'narada.invokable-intelligence.principal.v1');
  const principalResolution = resolveInvocationPrincipalAdmission(principals, {
    actor: carrier.actor,
    memberships: [carrier.membership],
  });
  if (!principalResolution.ok) {
    throw intelligenceError(
      `intelligence_${principalResolution.code.replaceAll('-', '_')}`,
      `Authenticated actor has no unique canonical invocation principal (${principalResolution.code}).`,
      { candidate_principal_ids: principalResolution.candidate_principal_ids },
    );
  }
  const userSiteIds = [...new Set(records
    .map(({ document }) => document)
    .filter((document) => document.schema === 'narada.invokable-intelligence.authority-statement.v1'
      && document.kind === 'principal-consent'
      && document.origin.principal_id === principalResolution.principal.id)
    .map((document) => document.origin.site_id))];
  if (userSiteIds.length !== 1) {
    throw intelligenceError(
      userSiteIds.length === 0 ? 'intelligence_user_site_binding_missing' : 'intelligence_user_site_binding_ambiguous',
      `Canonical principal consent resolves to ${userSiteIds.length} User Sites.`,
      { candidate_site_ids: userSiteIds.sort() },
    );
  }
  const userSite = resources.find((resource) =>
    resource.schema === 'narada.invokable-intelligence.site.v1' && resource.id === userSiteIds[0]);
  if (!userSite) {
    throw intelligenceError('intelligence_user_site_binding_missing', 'The consent-origin User Site is absent from the canonical catalog.');
  }
  const targetSite = targetSites[0];
  return {
    targetSite: { kind: 'site', id: targetSite.id },
    userSite: { kind: 'site', id: userSite.id },
    hostSite: { kind: 'site', id: targetSite.id },
    access: runtimeAccessContext(),
    catalogRecords: records,
    membershipEvidenceRef: carrier.membership.evidence_ref,
    principalId: principalResolution.principal.id,
    authorityBinding: {
      actor_id: carrier.actor.principal_id,
      auth_type: carrier.actor.auth_type,
      principal_id: principalResolution.principal.id,
      binding_ref: principalResolution.binding.id,
      evidence_refs: [...principalResolution.evidence_refs],
    },
  };
}

export function cloudflareIntelligenceConfigurationStatus(env = {}) {
  const missing = REQUIRED_INFRASTRUCTURE_BINDINGS.filter((name) => {
    const value = env[name];
    return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);
  });
  return {
    configured: missing.length === 0,
    missing,
  };
}

export function cloudflareIntelligenceResolutionConfigured(env = {}) {
  return cloudflareIntelligenceConfigurationStatus(env).configured;
}

export function cloudflareExecutionDecisionClock(date = new Date()) {
  const instant = date.toISOString();
  return {
    source: 'execution-site-clock',
    authority_ref: 'runtime:cloudflare-carrier',
    instant,
    timezone: 'UTC',
    local: {
      date: instant.slice(0, 10),
      time: instant.slice(11, 19),
      weekday: date.getUTCDay(),
    },
  };
}

async function assertInitializedCatalog(store) {
  const [records, resources] = await Promise.all([
    store.listCatalogRecords(),
    store.listResources(),
  ]);
  if (records.length === 0 || resources.length === 0) {
    const error = new Error(
      `intelligence_registry_not_initialized:catalog_records=${records.length}:resources=${resources.length}`,
    );
    error.code = 'intelligence_registry_not_initialized';
    throw error;
  }
}

/**
 * Build the canonical invocation gateway over an already admitted D1 catalog.
 * `adapterFactory` receives the store and returns the Workers-AI transport
 * implementation. It has no selection authority.
 */
export async function createCarrierIntelligenceGateway(
  env,
  adapterFactory,
  {
    clock = () => cloudflareExecutionDecisionClock(),
    auditAuthority = {
      admittedBy: 'runtime:cloudflare-carrier',
      admissionRef: 'runtime-boundary:cloudflare-carrier',
    },
  } = {},
) {
  const configuration = cloudflareIntelligenceConfigurationStatus(env);
  if (!configuration.configured) {
    const error = new Error(
      `intelligence_resolution_configuration_missing:${configuration.missing.join(',')}`,
    );
    error.code = 'intelligence_resolution_configuration_missing';
    error.missing = [...configuration.missing];
    throw error;
  }

  const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
  const materialization = await D1MaterializationStore.open(env.INTELLIGENCE_REGISTRY_DB);
  try {
    await assertInitializedCatalog(store);
  } catch (error) {
    await Promise.all([materialization.close(), store.close()]);
    throw error;
  }

  const invocationAdapter = adapterFactory(store);
  const canonicalGateway = createLocalInvocationGateway({
    store,
    adapterFor: (adapter) => adapter.id === CARRIER_INTELLIGENCE_ADAPTER_ID
      ? invocationAdapter
      : null,
    clock,
    contextFor: async ({ request, clock: decisionClock }) => {
      const context = request.resolutionContext;
      return buildResolverContext({
        targetSite: context.targetSite,
        userSite: context.userSite,
        hostSite: context.hostSite,
      }, {
        clock: decisionClock,
        runtime: 'workers',
        access: context.access,
        topologyObservations: topologyObservations(
          context.catalogRecords,
          decisionClock,
          context.membershipEvidenceRef,
        ),
      });
    },
    materializationFor: ({ intent, context }) => materialization.acquire({
      destination_site_id: context.targetSite.id,
      resolver: 'cloudflare',
      target_site_id: context.targetSite.id,
      purpose: intent.purpose,
      ...(intent.principal ? { principal_id: intent.principal } : {}),
      now: context.clock.instant,
    }),
    auditAuthority,
    resultPayloadPolicy: ({ request, intent, plan, producedAt }) => {
      const context = request.resolutionContext;
      return {
        media_type: 'application/json',
        classification: context.access.data_classification,
        retention: {
          mode: 'never-retain',
          policy_ref: plan.access.governance_requirement_ids[0],
          residency: context.hostSite.id,
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
      };
    },
  });
  const gateway = {
    async invoke(request) {
      const admitted = await admitCarrierInvocationRequest(store, request);
      return canonicalGateway.invoke({
        ...request,
        principal: admitted.principalId,
        authorityBinding: admitted.authorityBinding,
        resolutionContext: admitted,
      });
    },
  };
  return { gateway, store, materialization };
}
