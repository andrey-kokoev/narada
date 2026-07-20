import {
  IntelligenceManagementService,
  MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA,
  MANAGEMENT_ERROR_SCHEMA,
  ManagementError,
  deployManagementBundle,
  managementErrorResult,
} from '@narada2/invokable-intelligence-management';
import { D1MaterializationStore } from '@narada2/invokable-intelligence-materialization';
import { D1RegistryStore } from '@narada2/invokable-intelligence-registry/d1';
import { siteMatchesRegistryIdentity } from '@narada2/invokable-intelligence-contract';

import { createCloudflareSiteRegistryAdapter } from '@narada2/cloudflare-site-registry';

export const CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_REQUEST_SCHEMA =
  'narada.cloudflare.invokable-intelligence.management-api-request.v1';
export const CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_RESPONSE_SCHEMA =
  'narada.cloudflare.invokable-intelligence.management-api-response.v1';
export const CLOUDFLARE_INTELLIGENCE_TRANSPORT_AUTHORIZATION_SCHEMA =
  'narada.cloudflare.invokable-intelligence.transport-authorization.v1';
export const CLOUDFLARE_INTELLIGENCE_EXECUTION_READ_SCHEMA =
  'narada.cloudflare.invokable-intelligence.execution-read.v1';

const MUTATING_SITE_ROLES = new Set(['owner', 'maintainer', 'operator']);
const CLOUDFLARE_SITE_REGISTRY_ID = 'narada.cloudflare-site-registry.v1';

function owningSite(body) {
  if (body?.schema === MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA) return body.owning_site;
  if (body?.schema === CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_REQUEST_SCHEMA) return body.owning_site;
  return null;
}

async function readExecution(store, materialization, site, request) {
  const attemptId = String(request?.attempt_id ?? '').trim();
  if (!attemptId) {
    throw new ManagementError(
      'invalid-management-api-request',
      'execution.read requires one canonical attempt_id.',
    );
  }
  const attempt = await store.getExecutionAttempt(attemptId);
  if (!attempt) throw new ManagementError('not-found', `Execution attempt '${attemptId}' was not found.`);
  const [intent, plan] = await Promise.all([
    store.getIntent(attempt.intent_id),
    store.getPlan(attempt.plan_id),
  ]);
  const snapshot = plan ? await store.getPlanSnapshot(plan.id) : null;
  if (!intent || !plan || !snapshot) {
    throw new ManagementError(
      'execution-provenance-unavailable',
      `Execution attempt '${attemptId}' has incomplete canonical intent or plan provenance.`,
      [attemptId, attempt.intent_id, attempt.plan_id],
    );
  }

  const routeRevision = snapshot.referenced_revisions.find(({ kind, record_id }) =>
    kind === 'topology' && record_id === plan.route.route_id);
  const routeRecord = routeRevision
    ? await store.getCatalogRecord(routeRevision.immutable_ref)
    : null;
  const materializationRevisions = snapshot.referenced_revisions.filter(({ kind }) => kind === 'materialization');
  const projections = await Promise.all(materializationRevisions.map(({ immutable_ref }) =>
    materialization.getProjectionByEnvelope(immutable_ref)));
  if (!routeRecord || projections.length === 0 || projections.some((projection) => !projection)) {
    throw new ManagementError(
      'execution-provenance-unavailable',
      `Execution attempt '${attemptId}' cannot be linked to all immutable route and materialization inputs.`,
      [attemptId, ...(routeRevision ? [routeRevision.immutable_ref] : []), ...materializationRevisions.map(({ immutable_ref }) => immutable_ref)],
    );
  }
  if (
    routeRecord.authority?.site_id !== site.id
    || projections.some((projection) => projection.envelope.destination.site_id !== site.id)
  ) {
    throw new ManagementError(
      'foreign-locus-read',
      `Execution attempt '${attemptId}' is not governed by the requested owning Site.`,
      [attemptId, site.id],
    );
  }

  const [
    transitions,
    results,
    outcome,
    observations,
    auditEvidence,
    telemetry,
    revalidations,
  ] = await Promise.all([
    store.listExecutionTransitions(attemptId),
    store.listResultEnvelopes(attemptId),
    store.getTerminalOutcomeByAttempt(attemptId),
    store.listInvocationObservations(attemptId),
    store.listInvocationAuditEvidence(attemptId),
    store.listInvocationTelemetry(attemptId),
    store.listPlanRevalidations(plan.id),
  ]);
  return {
    schema: CLOUDFLARE_INTELLIGENCE_EXECUTION_READ_SCHEMA,
    operation: 'execution.read',
    owning_site: { ...site },
    data: {
      intent,
      plan,
      plan_snapshot: snapshot,
      plan_revalidations: revalidations,
      attempt,
      transitions,
      results,
      terminal_outcome: outcome,
      observations,
      audit_evidence: auditEvidence,
      telemetry,
      provenance: {
        route_revision: { ...routeRevision },
        route_authority: { ...routeRecord.authority },
        materializations: projections.map((projection) => ({
          envelope_id: projection.envelope.id,
          admission_id: projection.admission.id,
          origin: { ...projection.envelope.origin },
          destination: { ...projection.envelope.destination },
          statement: { ...projection.envelope.statement },
        })),
      },
    },
  };
}

function statusForManagementResult(result) {
  if (result?.schema !== MANAGEMENT_ERROR_SCHEMA) return 200;
  const code = result.error?.code;
  if (code === 'not-found') return 404;
  if (code === 'catalog-revision-conflict' || code === 'refresh-required' || code === 'materialization-required' || code === 'execution-provenance-unavailable') return 409;
  if (code === 'foreign-locus-mutation' || code === 'foreign-locus-read' || code === 'target-scope-refused' || code === 'principal-consent-refused') return 403;
  if (code === 'internal' || code === 'materialization-unavailable') return 500;
  return 400;
}

function apiResponse(site, transportAuthorization, result, status = statusForManagementResult(result)) {
  return {
    status,
    body: {
      schema: CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_RESPONSE_SCHEMA,
      ok: status >= 200 && status < 300,
      owning_site: site ? { ...site } : null,
      transport_authorization: transportAuthorization,
      result,
    },
  };
}

function managedRefusal(code, message, evidenceRefs = []) {
  return managementErrorResult(new ManagementError(code, message, evidenceRefs));
}

async function transportSiteIdentity(env, body, site) {
  let siteResource = null;
  if (body?.schema === MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA) {
    siteResource = body.catalog?.records
      ?.map(({ document }) => document)
      .find((document) => document?.schema === 'narada.invokable-intelligence.site.v1' && document.id === site.id) ?? null;
  } else if (env.INTELLIGENCE_REGISTRY_DB?.prepare) {
    const store = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB);
    try {
      siteResource = await store.getResource(site.id);
    } finally {
      await store.close();
    }
  }
  const bindings = siteResource?.registry_bindings?.filter(({ registry, subject_id }) =>
    registry === CLOUDFLARE_SITE_REGISTRY_ID && typeof subject_id === 'string' && subject_id.length > 0) ?? [];
  if (bindings.length !== 1 || !siteMatchesRegistryIdentity(siteResource, CLOUDFLARE_SITE_REGISTRY_ID, bindings[0]?.subject_id)) {
    return { ok: false, code: bindings.length === 0 ? 'site-registry-binding-missing' : 'site-registry-binding-ambiguous' };
  }
  return { ok: true, registry: CLOUDFLARE_SITE_REGISTRY_ID, site_id: bindings[0].subject_id };
}

async function authorizeSiteMutation(env, site, transportSite, principal) {
  const principalId = String(principal?.principal_id ?? '').trim();
  if (!principalId) {
    return { ok: false, status: 401, result: managedRefusal('unauthorized', 'An authenticated transport principal is required.') };
  }
  const siteRegistry = createCloudflareSiteRegistryAdapter(env);
  if (!siteRegistry) {
    return { ok: false, status: 500, result: managedRefusal('site-registry-unavailable', 'The Site authority registry is unavailable.') };
  }
  const admission = await siteRegistry.handle({
    operation: 'site.read',
    principal,
    params: {
      site_id: transportSite.site_id,
      include_sessions: false,
      include_authority_events: false,
      include_memberships: false,
    },
  });
  const role = admission?.membership?.role;
  if (!admission?.ok || !MUTATING_SITE_ROLES.has(role)) {
    return {
      ok: false,
      status: 403,
      result: managedRefusal('site-authority-denied', 'The transport principal has no active mutation authority for this Site.'),
    };
  }
  return {
    ok: true,
    evidence: {
      schema: CLOUDFLARE_INTELLIGENCE_TRANSPORT_AUTHORIZATION_SCHEMA,
      principal_id: principalId,
      auth_type: String(principal.auth_type ?? 'unknown'),
      site_id: site.id,
      site_registry: transportSite.registry,
      registry_site_id: transportSite.site_id,
      membership_role: role,
      ...(principal.operator_session_id ? { operator_session_id: String(principal.operator_session_id) } : {}),
    },
  };
}

/** Execute one authenticated canonical management request against D1 authority. */
export async function executeCloudflareIntelligenceManagement(body, principal, env = {}) {
  const site = owningSite(body);
  if (site?.kind !== 'site' || typeof site.id !== 'string' || !site.id.startsWith('site:')) {
    return apiResponse(null, null, managedRefusal(
      'invalid-management-api-request',
      'A deployment bundle or management API request with one explicit owning Site is required.',
    ), 400);
  }
  if (
    body.schema === CLOUDFLARE_INTELLIGENCE_MANAGEMENT_API_REQUEST_SCHEMA
    && (!body.request || typeof body.request !== 'object' || typeof body.request.operation !== 'string')
  ) {
    return apiResponse(site, null, managedRefusal(
      'invalid-management-api-request',
      'The management API envelope requires one canonical management request.',
    ), 400);
  }
  if (!String(principal?.principal_id ?? '').trim()) {
    return apiResponse(site, null, managedRefusal(
      'unauthorized',
      'An authenticated transport principal is required.',
    ), 401);
  }

  const transportSite = await transportSiteIdentity(env, body, site);
  if (!transportSite.ok) {
    return apiResponse(site, null, managedRefusal(
      transportSite.code,
      'The canonical owning Site has no unique admitted Cloudflare Site registry identity.',
    ), 403);
  }
  const authorization = await authorizeSiteMutation(env, site, transportSite, principal);
  if (!authorization.ok) return apiResponse(site, null, authorization.result, authorization.status);

  const binding = env.INTELLIGENCE_REGISTRY_DB;
  if (!binding || typeof binding.prepare !== 'function') {
    return apiResponse(site, authorization.evidence, managedRefusal(
      'intelligence-registry-unavailable',
      'The canonical D1 intelligence registry binding is unavailable.',
    ), 500);
  }

  let store;
  let materialization;
  try {
    store = await D1RegistryStore.open(binding);
    materialization = await D1MaterializationStore.open(binding);
    const session = { store, materialization, owningSite: site };
    const result = body.schema === MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA
      ? await deployManagementBundle(session, body)
      : body.request.operation === 'execution.read'
        ? await readExecution(store, materialization, site, body.request)
        : await new IntelligenceManagementService(session).executeSafe(body.request);
    return apiResponse(site, authorization.evidence, result);
  } catch (error) {
    const result = managementErrorResult(error);
    return apiResponse(site, authorization.evidence, result);
  } finally {
    if (materialization) await materialization.close();
    if (store) await store.close();
  }
}
