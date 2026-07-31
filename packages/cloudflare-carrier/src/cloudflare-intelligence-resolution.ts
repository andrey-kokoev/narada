/**
 * Cloudflare carrier intelligence resolution.
 *
 * The Worker receives only infrastructure bindings from `env`. Catalog,
 * policy, defaults, access grants, and executable routes must already exist
 * as admitted canonical records in D1. Runtime startup never seeds or
 * promotes environment values into intelligence authority.
 */

import {
  latestCatalogRecords,
  resolveInvocationPrincipalAdmission,
  siteMatchesRegistryIdentity,
} from '@narada2/invokable-intelligence-contract';
import {
  createCloudflareInvocationGateway,
} from '@narada2/invokable-intelligence-runtime';
import type { CloudflareInvocationAdmission } from '@narada2/invokable-intelligence-runtime';

export const CARRIER_INTELLIGENCE_ADAPTER_ID = 'adapter:workers-ai-binding';
export const CLOUDFLARE_SITE_REGISTRY_ID = 'narada.cloudflare-site-registry.v1';

const REQUIRED_INFRASTRUCTURE_BINDINGS = ['INTELLIGENCE_REGISTRY_DB'];

function nonEmpty(value: any) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function intelligenceError(code: any, message: any, details: any= {}) {
  const error: any = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function catalogEvidenceReference(records: any) {
  const references = latestCatalogRecords(records)
    .flatMap((record: any) => record.validation?.evidence ?? [])
    .map(({ ref }: any) => ref)
    .filter((ref: any) => /^site-config:narada-cloudflare:invokable-intelligence:revision-\\d+$/u.test(ref));
  return references.sort((left: any, right: any) => {
    const leftRevision = Number(left.match(/revision-(\\d+)$/u)?.[1] ?? 0);
    const rightRevision = Number(right.match(/revision-(\\d+)$/u)?.[1] ?? 0);
    return rightRevision - leftRevision || right.localeCompare(left);
  })[0] ?? 'site-config:narada-cloudflare:invokable-intelligence:unavailable';
}

function requireCarrierContext(value: any) {
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

function topologyRequirementEvidence(subject: any, requirement: any, runtimeEvidence: any) {
  const requestPathRequirements = new Set([
    'client-supported',
    'launcher-available',
    'network-reachable',
  ]);
  const bindingRequirements = new Set([
    'adapter-supported',
    'service-available',
    'endpoint-available',
  ]);
  let available = false;
  let reasonCode = 'cloudflare-carrier-topology-evidence-missing';
  let runRef = runtimeEvidence.runtime_evidence_ref;
  let artifactRef = runtimeEvidence.runtime_artifact_ref;
  if (requestPathRequirements.has(requirement)) {
    available = runtimeEvidence.request_admitted === true;
    reasonCode = available
      ? 'cloudflare-carrier-request-path-admitted'
      : 'cloudflare-carrier-request-path-not-admitted';
    runRef = runtimeEvidence.request_evidence_ref;
    artifactRef = runtimeEvidence.request_artifact_ref;
  } else if (bindingRequirements.has(requirement)) {
    available = runtimeEvidence.ai_binding_available === true;
    reasonCode = available
      ? 'cloudflare-workers-ai-binding-available'
      : 'cloudflare-workers-ai-binding-missing';
    runRef = runtimeEvidence.binding_evidence_ref;
    artifactRef = runtimeEvidence.binding_artifact_ref;
  } else if (requirement === 'carrier-deployed' || requirement === 'runtime-available') {
    available = runtimeEvidence.worker_runtime === true;
    reasonCode = available
      ? 'cloudflare-carrier-worker-runtime-executing'
      : 'cloudflare-carrier-worker-runtime-not-observed';
  } else if (requirement === 'boundary-admitted') {
    const requestBoundary = subject.id === 'c1' || subject.id === 'c2';
    const bindingBoundary = subject.id === 'c5';
    const runtimeBoundary = subject.id === 'c3';
    if (requestBoundary) {
      available = runtimeEvidence.request_admitted === true;
      reasonCode = available
        ? 'cloudflare-carrier-request-boundary-admitted'
        : 'cloudflare-carrier-request-boundary-not-admitted';
      runRef = runtimeEvidence.request_evidence_ref;
      artifactRef = runtimeEvidence.request_artifact_ref;
    } else if (bindingBoundary) {
      available = runtimeEvidence.ai_binding_available === true;
      available = runtimeEvidence.ai_binding_available === true;
      reasonCode = available
        ? 'cloudflare-workers-ai-binding-boundary-admitted'
        : 'cloudflare-workers-ai-binding-boundary-not-admitted';
      runRef = runtimeEvidence.binding_evidence_ref;
      artifactRef = runtimeEvidence.binding_artifact_ref;
    } else if (runtimeBoundary) {
      available = runtimeEvidence.worker_runtime === true;
      reasonCode = available
        ? 'cloudflare-carrier-runtime-boundary-admitted'
        : 'cloudflare-carrier-runtime-boundary-not-admitted';
    }
  }
  return {
    status: available ? 'feasible' : 'infeasible',
    reason_code: reasonCode,
    evidence: [
      { kind: 'run', ref: runRef, evidence_class: 'observed' },
      { kind: 'artifact', ref: artifactRef, evidence_class: 'observed' },
      { kind: 'document', ref: runtimeEvidence.site_admission_evidence_ref, evidence_class: 'durable' },
    ],
  };
}

function topologyObservations(records: any, clock: any, runtimeEvidence: any): any[] {
  const validityWindowMs = 5 * 60 * 1000;
  const observedMs = Math.floor(Date.parse(clock.instant) / validityWindowMs) * validityWindowMs;
  const observedAt = new Date(observedMs).toISOString();
  const validUntil = new Date(observedMs + validityWindowMs).toISOString();
  const observations = [];
  for (const record of records) {
    const route = record.document;
    if (route?.schema !== 'narada.invokable-intelligence.invocation-route-candidate.v1') continue;
    const components = [
      ...route.topology.nodes.map((node: any) => ({ subject: { kind: 'node', id: node.id }, component: node })),
      ...route.topology.edges.map((edge: any) => ({ subject: { kind: 'edge', id: edge.id }, component: edge })),
    ];
    for (const { subject, component } of components) {
      for (const requirement of component.required_feasibility) {
        const assessment = topologyRequirementEvidence(subject, requirement, runtimeEvidence);
        observations.push({
          schema: 'narada.invokable-intelligence.topology-feasibility.v1',
          id: `topology-observation:${route.topology.id}:${subject.kind}:${subject.id}:${requirement}:${observedAt}`,
          topology_id: route.topology.id,
          subject,
          requirement,
          status: assessment.status,
          owner: { ...component.feasibility_authority },
          validity: { valid_from: observedAt, valid_until: validUntil, fresh_as_of: observedAt },
          observed_at: observedAt,
          evidence: assessment.evidence,
          reason_code: assessment.reason_code,
        });
      }
    }
  }
  return observations;
}

async function admitCarrierInvocationRequest(store: any, request: any) {
  const carrier = requireCarrierContext(request.carrierContext);
  const requestSiteIds = [request.site_id, request.invocationScope?.site_id]
    .filter((value: any) => value !== undefined && value !== null);
  if (requestSiteIds.some((siteId: any) => siteId !== carrier.targetRegistrySite.subject_id)
    || new Set(requestSiteIds).size > 1) {
    throw intelligenceError(
      'intelligence_request_site_binding_mismatch',
      'The request Site identity does not match the carrier-admitted target Site.',
      {
        request_site_ids: requestSiteIds,
        admitted_site_id: carrier.targetRegistrySite.subject_id,
      },
    );
  }
  const [resources, catalogRecords] = await Promise.all([
    store.listResources(),
    store.listCatalogRecords(),
  ]);
  const records = latestCatalogRecords(catalogRecords);
  const targetSites = resources.filter((resource: any) =>
    resource.schema === 'narada.invokable-intelligence.site.v1'
    && siteMatchesRegistryIdentity(resource, carrier.targetRegistrySite.registry, carrier.targetRegistrySite.subject_id));
  if (targetSites.length !== 1) {
    throw intelligenceError(
      targetSites.length === 0 ? 'intelligence_target_site_binding_missing' : 'intelligence_target_site_binding_ambiguous',
      `The admitted Site registry identity resolves to ${targetSites.length} canonical Sites.`,
      { candidate_site_ids: targetSites.map(({ id }: any) => id).sort() },
    );
  }
  const principals = records
    .map(({ document }: any) => document)
    .filter((document: any) => document.schema === 'narada.invokable-intelligence.principal.v1');
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
    .map(({ document }: any) => document)
    .filter((document: any) => document.schema === 'narada.invokable-intelligence.authority-statement.v1'
      && document.kind === 'principal-consent'
      && document.origin.principal_id === principalResolution.principal.id)
    .map((document: any) => document.origin.site_id))];
  if (userSiteIds.length !== 1) {
    throw intelligenceError(
      userSiteIds.length === 0 ? 'intelligence_user_site_binding_missing' : 'intelligence_user_site_binding_ambiguous',
      `Canonical principal consent resolves to ${userSiteIds.length} User Sites.`,
      { candidate_site_ids: userSiteIds.sort() },
    );
  }
  const userSite = resources.find((resource: any) =>
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

export function cloudflareIntelligenceConfigurationStatus(env: any= {}) {
  const missing = REQUIRED_INFRASTRUCTURE_BINDINGS.filter((name: any) => {
    const value = env[name];
    return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);
  });
  return {
    configured: missing.length === 0,
    missing,
  };
}

export function cloudflareIntelligenceResolutionConfigured(env: any= {}) {
  return cloudflareIntelligenceConfigurationStatus(env).configured;
}

export function cloudflareExecutionDecisionClock(date: any= new Date()) {
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

async function assertInitializedCatalog(store: any) {
  const [records, resources] = await Promise.all([
    store.listCatalogRecords(),
    store.listResources(),
  ]);
  if (records.length === 0 || resources.length === 0) {
    const error: any = new Error(
      `intelligence_registry_not_initialized:catalog_records=${records.length}:resources=${resources.length}`,
    );
    error.code = 'intelligence_registry_not_initialized';
    throw error;
  }
}

/** Build the shared Cloudflare gateway over a carrier-admitted D1 catalog. */
export async function createCarrierIntelligenceGateway(
  env: any,
  adapterFactory: any,
  {
    clock = () => cloudflareExecutionDecisionClock(),
    auditAuthority = {
      admittedBy: 'runtime:cloudflare-carrier',
      admissionRef: 'runtime-boundary:cloudflare-carrier',
    },
  }: any= {},
) {
  const configuration = cloudflareIntelligenceConfigurationStatus(env);
  if (!configuration.configured) {
    const error: any = new Error(
      `intelligence_resolution_configuration_missing:${configuration.missing.join(',')}`,
    );
    error.code = 'intelligence_resolution_configuration_missing';
    error.missing = [...configuration.missing];
    throw error;
  }

  const runtimeEvidence = {
    request_admitted: true,
    worker_runtime: true,
    ai_binding_available: typeof env.AI?.run === 'function',
    request_evidence_ref: auditAuthority.admissionRef,
    request_artifact_ref: 'cloudflare-carrier:authenticated-request',
    binding_evidence_ref: auditAuthority.admissionRef,
    binding_artifact_ref: 'cloudflare-worker-binding:AI',
    runtime_evidence_ref: auditAuthority.admissionRef,
    runtime_artifact_ref: 'cloudflare-worker:runtime',
    site_admission_evidence_ref: 'site-config:narada-cloudflare:invokable-intelligence:runtime',
  };
  const handle = await createCloudflareInvocationGateway({
    registryDb: env.INTELLIGENCE_REGISTRY_DB,
    runtimeCapabilities: {
      aiBinding: typeof env.AI?.run === 'function',
      outboundFetch: typeof globalThis.fetch === 'function',
    },
    adapterFor: (adapter, store) => adapter.id === CARRIER_INTELLIGENCE_ADAPTER_ID
      ? adapterFactory(store)
      : null,
    assertReady: (store) => assertInitializedCatalog(store),
    admitRequest: async (store, request) => admitCarrierInvocationRequest(store, request) as Promise<CloudflareInvocationAdmission>,
    topologyObservationsFor: ({ records, clock: decisionClock }) => topologyObservations(records, decisionClock, {
      ...runtimeEvidence,
      site_admission_evidence_ref: catalogEvidenceReference(records),
    }),
    clock,
    auditAuthority,
  });
  return {
    ...handle,
    gateway: {
      invoke: (request: any) => handle.gateway.invoke(request),
    },
  };
}