import { connect as netConnect } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  canonicalJson,
  validateCanonicalCatalogRecord,
} from '@narada2/invokable-intelligence-contract';

const SOURCE_SCHEMA = 'narada.invokable-intelligence.local-topology-observation-source.v1';
const ROUTE_SCHEMA = 'narada.invokable-intelligence.invocation-route-candidate.v1';
const ENDPOINT_SCHEMA = 'narada.invokable-intelligence.inference-endpoint.v1';
const ADAPTER_SCHEMA = 'narada.invokable-intelligence.adapter.v1';
const EXECUTION_LOCUS_SCHEMA = 'narada.invokable-intelligence.execution-locus.v1';
const OBSERVATION_SCHEMA = 'narada.invokable-intelligence.topology-feasibility.v1';
const RUNTIME_SERVICE_EVIDENCE_SCHEMA = 'narada.invokable-intelligence.local-runtime-service-evidence.v1';
const EXECUTION_EVIDENCE_SCHEMA = 'narada.invokable-intelligence.local-execution-evidence.v1';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
    : fallback;
}

function currentCatalogEntries(records) {
  const latest = new Map();
  for (const record of records) {
    if (record?.validation?.status !== 'accepted' || !nonEmpty(record.record_id)) continue;
    const existing = latest.get(record.record_id);
    if (!existing || Number(record.revision) > Number(existing.revision)) {
      latest.set(record.record_id, record);
    }
  }
  return [...latest.values()].map((record) => ({ record, document: record.document }));
}

function uniqueMap(items, label) {
  if (!Array.isArray(items)) throw new Error(`local_topology_${label}_array_required`);
  const mapped = new Map();
  for (const item of items) {
    const id = nonEmpty(item?.id);
    if (!id) throw new Error(`local_topology_${label}_id_required`);
    if (mapped.has(id)) throw new Error(`local_topology_duplicate_${label}_id:${id}`);
    mapped.set(id, item);
  }
  return mapped;
}

function uniqueRefs(values, label) {
  if (!Array.isArray(values)) throw new Error(`local_topology_route_${label}_array_required`);
  const refs = [];
  const seen = new Set();
  for (const value of values) {
    const id = nonEmpty(value);
    if (!id) throw new Error(`local_topology_route_${label}_id_required`);
    if (seen.has(id)) throw new Error(`local_topology_duplicate_route_${label}_id:${id}`);
    seen.add(id);
    refs.push(id);
  }
  return refs;
}

const EVIDENCE_KINDS = new Set(['artifact', 'run', 'document', 'test', 'site-configuration']);

function hasBoundaryEvidence(evidence, expectedRef) {
  return Array.isArray(evidence)
    && evidence.length > 0
    && evidence.every((entry) => EVIDENCE_KINDS.has(entry?.kind) && nonEmpty(entry?.ref))
    && evidence.some((entry) => entry.kind === 'document' && entry.ref === expectedRef);
}

function boundaryAdmissionError(edge, observedAt = null) {
  const boundary = edge?.boundary;
  const admission = boundary?.admission;
  const requiresAdmission = boundary?.kinds?.some((kind) => ['trust', 'network', 'account', 'site'].includes(kind));
  if (!requiresAdmission) return null;
  if (!admission
    || admission.schema !== 'narada.invokable-intelligence.topology-boundary-admission.v1'
    || admission.edge_id !== edge.id
    || !nonEmpty(boundary.trust_policy_ref)
    || !nonEmpty(boundary.network_path_ref)
    || admission.trust_policy?.ref !== boundary.trust_policy_ref
    || admission.network_path?.ref !== boundary.network_path_ref
    || admission.trust_policy?.status !== 'admitted'
    || admission.network_path?.status !== 'reachable'
    || !nonEmpty(admission.trust_policy?.authority_ref)
    || !nonEmpty(admission.network_path?.authority_ref)
    || admission.trust_policy?.authority_ref !== edge.feasibility_authority?.authority_ref
    || admission.network_path?.authority_ref !== edge.feasibility_authority?.authority_ref
    || !hasBoundaryEvidence(admission.trust_policy?.evidence, boundary.trust_policy_ref)
    || !hasBoundaryEvidence(admission.network_path?.evidence, boundary.network_path_ref)
    || !nonEmpty(admission.validity?.valid_from)
    || !nonEmpty(admission.validity?.valid_until)
    || !nonEmpty(admission.validity?.fresh_as_of)) {
    return `local_topology_boundary_admission_invalid:${edge.id}`;
  }
  const validFrom = Date.parse(admission.validity.valid_from);
  const validUntil = Date.parse(admission.validity.valid_until);
  const freshAsOf = Date.parse(admission.validity.fresh_as_of);
  if (![validFrom, validUntil, freshAsOf].every(Number.isFinite)
    || validFrom >= validUntil
    || freshAsOf < validFrom
    || freshAsOf > validUntil) {
    return `local_topology_boundary_admission_validity_invalid:${edge.id}`;
  }
  if (observedAt) {
    const observed = Date.parse(observedAt);
    if (!Number.isFinite(observed) || observed < validFrom || observed >= validUntil || freshAsOf > observed) {
      return `local_topology_boundary_admission_stale:${edge.id}`;
    }
  }
  return null;
}

function boundaryAdmissionEvidence(edge, routeRecord) {
  const admission = edge.boundary.admission;
  return [
    ...routeAdmissionEvidence(routeRecord),
    { kind: 'document', ref: admission.trust_policy.ref },
    { kind: 'document', ref: admission.network_path.ref },
    ...admission.trust_policy.evidence.map((entry) => ({ ...entry })),
    ...admission.network_path.evidence.map((entry) => ({ ...entry })),
  ];
}

function validatedRouteEntry(entry) {
  const diagnostics = validateCanonicalCatalogRecord(entry.record);
  if (diagnostics.length) {
    throw new Error(`local_topology_route_catalog_record_invalid:${entry.record?.id ?? 'unknown'}:${diagnostics[0].code}`);
  }
  const route = entry.document;
  const topology = route?.topology;
  if (!nonEmpty(route?.id) || !nonEmpty(route?.endpoint?.id) || !nonEmpty(route?.adapter?.id)) {
    throw new Error(`local_topology_route_coordinates_required:${route?.id ?? 'unknown'}`);
  }
  if (!topology || !nonEmpty(topology.id) || !topology.route) {
    throw new Error(`local_topology_route_document_invalid:${route.id}`);
  }
  const nodes = uniqueMap(topology.nodes, 'node');
  const edges = uniqueMap(topology.edges, 'edge');
  const nodeIds = uniqueRefs(topology.route.node_ids, 'node');
  const edgeIds = uniqueRefs(topology.route.edge_ids, 'edge');
  for (const id of nodeIds) {
    if (!nodes.has(id)) throw new Error(`local_topology_route_node_not_found:${topology.id}:${id}`);
  }
  for (const id of edgeIds) {
    if (!edges.has(id)) throw new Error(`local_topology_route_edge_not_found:${topology.id}:${id}`);
  }
  for (const edge of edges.values()) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      throw new Error(`local_topology_edge_node_not_found:${topology.id}:${edge.id}`);
    }
    const boundaryError = boundaryAdmissionError(edge);
    if (boundaryError) throw new Error(boundaryError);
  }
  return {
    record: entry.record,
    route,
    topology,
    nodes,
    edges,
    nodeIds,
    edgeIds,
    selectionShape: canonicalJson({
      endpoint: route.endpoint,
      adapter: route.adapter,
      topology,
    }),
  };
}

function socketCoordinate(address) {
  if (address?.kind !== 'url' || !nonEmpty(address.url)) return null;
  try {
    const url = new URL(address.url);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
      protocol: url.protocol.slice(0, -1),
    };
  } catch {
    return null;
  }
}

export function probeTcpEndpoint(address, { timeoutMs = 1500 } = {}) {
  const coordinate = socketCoordinate(address);
  if (!coordinate) {
    return Promise.resolve(Object.freeze({
      status: 'infeasible',
      reason_code: 'endpoint-url-invalid-or-unsupported',
      evidence_ref: 'local-runtime-tcp-probe:invalid-url',
    }));
  }
  return new Promise((resolve) => {
    const socket = netConnect({ host: coordinate.host, port: coordinate.port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(Object.freeze(result));
    };
    socket.setTimeout(timeoutMs, () => finish({
      status: 'infeasible',
      reason_code: 'endpoint-tcp-timeout',
      evidence_ref: `local-runtime-tcp-probe:${coordinate.protocol}:${coordinate.host}:${coordinate.port}`,
    }));
    socket.once('error', (error) => finish({
      status: 'infeasible',
      reason_code: `endpoint-tcp-${nonEmpty(error?.code)?.toLowerCase() ?? 'unreachable'}`,
      evidence_ref: `local-runtime-tcp-probe:${coordinate.protocol}:${coordinate.host}:${coordinate.port}`,
    }));
    socket.once('connect', () => finish({
      status: 'feasible',
      reason_code: 'endpoint-tcp-connected',
      evidence_ref: `local-runtime-tcp-probe:${coordinate.protocol}:${coordinate.host}:${coordinate.port}`,
    }));
  });
}

export function probeHttpEndpoint(address, { timeoutMs = 1500 } = {}) {
  const coordinate = socketCoordinate(address);
  const invalid = {
    status: 'infeasible',
    reason_code: 'endpoint-url-invalid-or-unsupported',
    evidence_ref: 'local-runtime-http-probe:invalid-url',
  };
  if (!coordinate) {
    return Promise.resolve({
      transport: invalid,
      endpoint: invalid,
      service: invalid,
    });
  }
  const evidenceRef = `local-runtime-http-probe:${coordinate.protocol}:${coordinate.host}:${coordinate.port}`;
  const requestFn = coordinate.protocol === 'https' ? httpsRequest : httpRequest;
  return new Promise((resolve) => {
    let settled = false;
    let connected = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(Object.freeze(result));
    };
    const failure = (reasonCode) => {
      const transport = {
        status: connected ? 'feasible' : 'infeasible',
        reason_code: connected ? 'endpoint-tcp-connected' : `endpoint-tcp-${reasonCode}`,
        evidence_ref: evidenceRef,
      };
      return {
        transport,
        endpoint: {
          status: 'infeasible',
          reason_code: `endpoint-http-${reasonCode}`,
          evidence_ref: evidenceRef,
        },
        service: {
          status: 'infeasible',
          reason_code: `endpoint-http-${reasonCode}`,
          evidence_ref: evidenceRef,
        },
      };
    };
    let request;
    try {
      request = requestFn(address.url, {
        method: 'HEAD',
        headers: { accept: '*/*' },
      }, (response) => {
        const statusCode = Number(response.statusCode ?? 0);
        response.resume();
        const responseReceived = statusCode > 0;
        const authenticationFailure = statusCode === 401
          ? 'endpoint-http-authentication-required'
          : statusCode === 403
            ? 'endpoint-http-authentication-forbidden'
            : null;
        const serviceAvailable = statusCode >= 200 && statusCode < 500 && !authenticationFailure;
        const statusReason = `endpoint-http-status-${statusCode || 'unknown'}`;
        finish({
          transport: {
            // A received HTTP status necessarily traversed the TCP connection;
            // the socket event ordering is not an authority boundary.
            status: responseReceived ? 'feasible' : connected ? 'feasible' : 'unknown',
            reason_code: responseReceived ? 'endpoint-tcp-connected' : connected ? 'endpoint-tcp-connected' : 'endpoint-tcp-connect-unobserved',
            evidence_ref: evidenceRef,
          },
          endpoint: {
            status: responseReceived ? 'feasible' : 'infeasible',
            reason_code: statusReason,
            evidence_ref: evidenceRef,
          },
          service: {
            status: serviceAvailable ? 'feasible' : 'infeasible',
            reason_code: authenticationFailure ?? (serviceAvailable ? 'endpoint-http-service-responded' : statusReason),
            evidence_ref: evidenceRef,
          },
        });
      });
    } catch (error) {
      finish(failure(nonEmpty(error?.code)?.toLowerCase() ?? 'request-construction-failed'));
      return;
    }
    request.once('socket', (socket) => {
      socket.once('connect', () => { connected = true; });
      socket.once('secureConnect', () => { connected = true; });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      finish(failure('timeout'));
    });
    request.once('error', (error) => {
      finish(failure(nonEmpty(error?.code)?.toLowerCase() ?? 'unreachable'));
    });
    request.end();
  });
}

function runtimeServiceEvidenceState(runtimeServices, {
  service,
  runtimeFamily,
  protocolFamily,
  session,
  authorityRef,
  observedAt,
  validityMs,
}) {
  const candidate = runtimeServices.find((entry) => (
    entry?.schema === RUNTIME_SERVICE_EVIDENCE_SCHEMA
      && entry.service === service
      && entry.runtime_family === runtimeFamily
      && entry.protocol_family === protocolFamily
      && entry.observed_for_session === session
      && entry.authority_ref === authorityRef
      && nonEmpty(entry.evidence_ref)
  ));
  if (!candidate) return { evidence: null, stale: false };
  const evidenceAt = Date.parse(candidate.observed_at ?? '');
  const observed = Date.parse(observedAt ?? '');
  const fresh = Number.isFinite(evidenceAt)
    && Number.isFinite(observed)
    && evidenceAt <= observed
    && observed - evidenceAt <= validityMs;
  return { evidence: fresh ? candidate : null, stale: !fresh };
}

function observationId(topologyId, kind, componentId, requirement, observedAt) {
  const instant = observedAt.replace(/[^0-9A-Za-z]/g, '');
  return `topology-observation:runtime:${topologyId}:${kind}:${componentId}:${requirement}:${instant}`;
}

function observationFor({
  topology,
  kind,
  component,
  requirement,
  assessment,
  observedAt,
  validUntil,
}) {
  return Object.freeze({
    schema: OBSERVATION_SCHEMA,
    id: observationId(topology.id, kind, component.id, requirement, observedAt),
    topology_id: topology.id,
    subject: Object.freeze({ kind, id: component.id }),
    requirement,
    status: assessment.status,
    owner: Object.freeze({ ...component.feasibility_authority }),
    validity: Object.freeze({
      valid_from: observedAt,
      valid_until: validUntil,
      fresh_as_of: observedAt,
    }),
    observed_at: observedAt,
    evidence: Object.freeze(assessment.evidence.map((entry) => Object.freeze({
      ...entry,
      evidence_class: entry.evidence_class === 'synthetic-correlation'
        ? 'synthetic-correlation'
        : entry.evidence_class ? 'observed' : entry.kind === 'document' ? 'durable' : 'observed',
    }))),
    ...(assessment.reason_code ? { reason_code: assessment.reason_code } : {}),
  });
}

function endpointAssessment(endpoint, adapter, probeResult, runtimeServices, runtimeSession, runtimeEvidenceContext) {
  if (!endpoint || endpoint.schema !== ENDPOINT_SCHEMA) {
    return {
      status: 'unknown',
      reason_code: 'canonical-endpoint-not-found',
      evidence: [{ kind: 'document', ref: 'canonical-registry:endpoint-not-found' }],
    };
  }
  if (endpoint.address?.kind === 'url') {
    const evidenceRef = probeResult?.evidence_ref ?? probeResult?.transport?.evidence_ref ?? 'local-runtime-endpoint-probe:not-run';
    const transport = probeResult?.transport ?? {
      status: probeResult?.status ?? 'unknown',
      reason_code: probeResult?.reason_code ?? 'endpoint-transport-probe-not-run',
      evidence_ref: evidenceRef,
    };
    const endpointResult = probeResult?.endpoint ?? {
      status: 'infeasible',
      reason_code: 'endpoint-protocol-probe-not-run',
      evidence_ref: evidenceRef,
    };
    const service = probeResult?.service ?? {
      status: 'infeasible',
      reason_code: 'endpoint-service-probe-not-run',
      evidence_ref: evidenceRef,
    };
    return {
      forRequirement(requirement) {
        const assessment = requirement === 'network-reachable'
          ? transport
          : requirement === 'endpoint-available'
            ? endpointResult
            : service;
        return {
          status: assessment.status,
          reason_code: assessment.reason_code,
          evidence: [{ kind: 'run', ref: assessment.evidence_ref }],
        };
      },
    };
  }
  if (endpoint.address?.kind === 'runtime-service') {
    const runtimeEvidenceState = runtimeServiceEvidenceState(runtimeServices, {
      service: endpoint.address.service,
      runtimeFamily: adapter?.runtime_family,
      protocolFamily: adapter?.protocol?.family,
      session: runtimeSession,
      authorityRef: runtimeEvidenceContext?.authorityRef,
      observedAt: runtimeEvidenceContext?.observedAt,
      validityMs: runtimeEvidenceContext?.validityMs ?? 1000,
    });
    const runtimeEvidence = runtimeEvidenceState.evidence;
    const supported = Boolean(runtimeEvidence)
      && runtimeEvidence.status === 'ready'
      && endpoint.address.service === 'codex-subscription'
      && adapter?.schema === ADAPTER_SCHEMA
      && adapter.runtime_family === 'node'
      && adapter.protocol?.family === 'codex-subscription';
    const assessment = {
      status: supported ? 'feasible' : 'infeasible',
      reason_code: supported
        ? null
        : runtimeEvidenceState.stale
          ? 'runtime-service-evidence-stale'
          : runtimeEvidence?.status === 'executable-present'
          ? 'runtime-service-readiness-not-proven'
          : 'runtime-service-not-observed',
      evidence: [{
        kind: 'run',
        ref: runtimeEvidence?.evidence_ref
          ?? `local-runtime-service:not-observed:${endpoint.address.service ?? 'unknown'}`,
      }],
    };
    return {
      forRequirement() {
        return assessment;
      },
    };
  }
  return {
    forRequirement() {
      return {
        status: 'infeasible',
        reason_code: 'endpoint-address-not-supported-by-node-runtime',
        evidence: [{ kind: 'document', ref: `canonical-endpoint-address:${endpoint.address?.kind ?? 'unknown'}` }],
      };
    },
  };
}

function processIsAlive(processId) {
  const numeric = Number.parseInt(String(processId ?? ''), 10);
  if (!Number.isInteger(numeric) || numeric <= 0) return false;
  try {
    process.kill(numeric, 0);
    return true;
  } catch {
    return false;
  }
}

function localExecutionAssessment(component, resources, runtimeContext, expectedKind) {
  const executionLocus = component.locus?.execution_locus;
  const locusResource = executionLocus ? resources.get(executionLocus.id) : null;
  const evidence = Array.isArray(runtimeContext?.executionEvidence)
    ? runtimeContext.executionEvidence.find((entry) => (
      entry?.schema === EXECUTION_EVIDENCE_SCHEMA
      && entry.component_kind === expectedKind
      && entry.execution_locus_id === executionLocus?.id
      && entry.observed_for_session === runtimeContext?.session
    ))
    : null;
  const evidenceMatchesResource = !component.resource || evidence?.resource_id === component.resource.id;
  const evidenceHasLiveProcess = processIsAlive(evidence?.process_id);
  const evidenceHasDeployment = nonEmpty(evidence?.deployment_ref);
  const present = component.kind === expectedKind
    && component.locus?.kind === 'local-machine'
    && locusResource?.schema === EXECUTION_LOCUS_SCHEMA
    && locusResource.kind === 'local'
    && nonEmpty(runtimeContext?.session)
    && nonEmpty(runtimeContext?.identity);
  const admitted = present
    && evidence
    && evidence.status === 'ready'
    && nonEmpty(evidence.evidence_ref)
    && evidenceMatchesResource
    && (evidenceHasLiveProcess || evidenceHasDeployment);
  return {
    status: admitted ? 'feasible' : 'infeasible',
    reason_code: admitted ? null : `${expectedKind}-runtime-evidence-not-admitted`,
    evidence: [{
      kind: 'run',
      ref: evidence?.evidence_ref ?? `local-execution-check:${runtimeContext?.session ?? 'unknown'}:${expectedKind}`,
      evidence_class: admitted ? 'observed-process' : 'synthetic-correlation',
    }],
  };
}

function assessNode({ node, route, endpoint, adapter, resources, runtimeContext, endpointStatus }) {
  return (requirement) => {
    if (requirement === 'client-supported') {
      const present = node.kind === 'client' && nonEmpty(runtimeContext?.session) && nonEmpty(runtimeContext?.identity);
      return {
        status: present ? 'feasible' : 'infeasible',
        reason_code: present ? null : 'client-session-not-admitted',
        evidence: [{
          kind: 'run',
          ref: `local-runtime-session:${runtimeContext?.session ?? 'unknown'}`,
          evidence_class: present ? 'observed-session' : 'synthetic-correlation',
        }],
      };
    }
    if (requirement === 'launcher-available') {
      return localExecutionAssessment(node, resources, runtimeContext, 'launcher');
    }
    if (requirement === 'carrier-deployed') {
      return localExecutionAssessment(node, resources, runtimeContext, 'carrier');
    }
    if (requirement === 'runtime-available') {
      return localExecutionAssessment(node, resources, runtimeContext, 'runtime');
    }
    if (requirement === 'adapter-supported') {
      const local = localExecutionAssessment(node, resources, runtimeContext, 'adapter');
      const supported = local.status === 'feasible'
        && node.resource?.id === route.adapter?.id
        && adapter?.schema === ADAPTER_SCHEMA
        && adapter.runtime_family === 'node';
      return {
        status: supported ? 'feasible' : 'infeasible',
        reason_code: supported ? null : 'adapter-not-supported-by-node-runtime',
        evidence: local.evidence,
      };
    }
    if (requirement === 'service-available' || requirement === 'endpoint-available') {
      return endpointStatus.forRequirement(requirement);
    }
    return {
      status: 'unknown',
      reason_code: 'topology-node-requirement-not-observed',
      evidence: [{ kind: 'document', ref: `canonical-route:${route.id}` }],
    };
  };
}

function routeAdmissionEvidence(routeRecord) {
  return [
    { kind: 'document', ref: routeRecord.id },
    ...routeRecord.validation.evidence.map((entry) => ({ ...entry })),
  ];
}

function assessEdge({ edge, route, routeRecord, nodes, resources, runtimeContext, endpointStatus }) {
  return (requirement) => {
    if (requirement === 'network-reachable') return endpointStatus.forRequirement(requirement);
    if (requirement === 'boundary-admitted') {
      if (edge.boundary?.kinds?.includes('network')) {
        const admitted = !boundaryAdmissionError(edge);
        return {
          status: admitted ? 'feasible' : 'infeasible',
          reason_code: admitted ? null : 'network-boundary-policy-incomplete',
          evidence: admitted ? boundaryAdmissionEvidence(edge, routeRecord) : routeAdmissionEvidence(routeRecord),
        };
      }
      if (edge.boundary?.kinds?.some((kind) => ['trust', 'account', 'site'].includes(kind))) {
        const admitted = !boundaryAdmissionError(edge);
        return {
          status: admitted ? 'feasible' : 'infeasible',
          reason_code: admitted ? null : 'boundary-admission-evidence-incomplete',
          evidence: admitted ? boundaryAdmissionEvidence(edge, routeRecord) : routeAdmissionEvidence(routeRecord),
        };
      }
      if (edge.boundary?.kinds?.includes('process')) {
        const from = nodes.get(edge.from);
        const to = nodes.get(edge.to);
        const assessProcessEndpoint = (node) => {
          if (node?.kind === 'client') {
            return {
              status: nonEmpty(runtimeContext?.session) && nonEmpty(runtimeContext?.identity)
                ? 'feasible'
                : 'infeasible',
              evidence: [{
                kind: 'run',
                ref: `local-runtime-session:${runtimeContext?.session ?? 'unknown'}`,
                evidence_class: 'observed-session',
              }],
            };
          }
          // The local inference service is an on-demand provider subprocess,
          // not a resident runtime process. Its process boundary is admitted
          // by the authenticated service readiness observation rather than by
          // pretending that the short-lived preflight child is still alive.
          if (node?.kind === 'inference-service') {
            return endpointStatus.forRequirement('service-available');
          }
          return localExecutionAssessment(node, resources, runtimeContext, node?.kind);
        };
        const fromAssessment = assessProcessEndpoint(from);
        const toAssessment = assessProcessEndpoint(to);
        const admitted = fromAssessment.status === 'feasible' && toAssessment.status === 'feasible';
        return {
          status: admitted ? 'feasible' : 'infeasible',
          reason_code: admitted ? null : 'process-boundary-not-present',
          evidence: [
            ...fromAssessment.evidence,
            ...toAssessment.evidence,
            {
              kind: 'run',
              ref: `local-runtime-process-boundary:${runtimeContext?.session ?? 'unknown'}:${edge.id}`,
              evidence_class: admitted ? 'observed-process-boundary' : 'synthetic-correlation',
            },
          ],
        };
      }
      return {
        status: 'unknown',
        reason_code: 'boundary-kind-not-observed',
        evidence: [{ kind: 'document', ref: `canonical-route:${route.id}:boundary:${edge.id}` }],
      };
    }
    return {
      status: 'unknown',
      reason_code: 'topology-edge-requirement-not-observed',
      evidence: [{ kind: 'document', ref: `canonical-route:${route.id}` }],
    };
  };
}

export function createLocalTopologyObserver({
  store,
  runtimeContext,
  source,
  probeEndpoint = probeHttpEndpoint,
  runtimeServices = [],
  now = () => Date.now(),
} = {}) {
  if (!store || typeof store.listCatalogRecords !== 'function' || typeof store.listResources !== 'function') {
    throw new Error('local_topology_observer_store_required');
  }
  if (source?.schema !== SOURCE_SCHEMA || !nonEmpty(source.authority_ref)) {
    throw new Error('local_topology_observation_source_required');
  }
  const timeoutMs = boundedInteger(source.probe_timeout_ms, 1500, 50, 10000);
  const observationValidityMs = boundedInteger(source.observation_validity_ms, 1000, 100, 10000);
  const runtimeServiceValidityMs = boundedInteger(source.runtime_service_validity_ms, 10000, 1000, 60000);

  const probeFor = async (endpoint) => {
    if (endpoint?.address?.kind !== 'url') return null;
    return probeEndpoint(endpoint.address, { timeoutMs });
  };

  return Object.freeze({
    async observe({ decisionClock } = {}) {
      const observedAt = nonEmpty(decisionClock?.instant) ?? new Date(now()).toISOString();
      const validUntil = new Date(Date.parse(observedAt) + observationValidityMs).toISOString();
      const [records, resourceList] = await Promise.all([
        store.listCatalogRecords(),
        store.listResources(),
      ]);
      const routes = currentCatalogEntries(records)
        .filter(({ document }) => document?.schema === ROUTE_SCHEMA)
        .map(validatedRouteEntry);
      if (routes.length === 0) throw new Error('local_topology_routes_not_initialized');
      const routeByTopology = new Map();
      for (const entry of routes) {
        const existing = routeByTopology.get(entry.topology.id);
        if (existing && existing.selectionShape !== entry.selectionShape) {
          throw new Error(`local_topology_ambiguous_route_topology:${entry.topology.id}`);
        }
        if (!existing) routeByTopology.set(entry.topology.id, entry);
      }
      const resources = uniqueMap(resourceList, 'resource');
      const observations = [];
      for (const entry of routeByTopology.values()) {
        for (const edge of entry.edges.values()) {
          const boundaryError = boundaryAdmissionError(edge, observedAt);
          if (boundaryError) throw new Error(boundaryError);
        }
        const { route, record: routeRecord, topology, nodes, edges, nodeIds, edgeIds } = entry;
        const endpoint = resources.get(route.endpoint?.id);
        const adapter = resources.get(route.adapter?.id);
        const probeResult = await probeFor(endpoint);
        const endpointStatus = endpointAssessment(
          endpoint,
          adapter,
          probeResult,
          runtimeServices,
          runtimeContext?.session,
          {
            authorityRef: source.authority_ref,
            observedAt,
            validityMs: runtimeServiceValidityMs,
          },
        );
        for (const nodeId of nodeIds) {
          const node = nodes.get(nodeId);
          const assess = assessNode({ node, route, endpoint, adapter, resources, runtimeContext, endpointStatus });
          for (const requirement of node.required_feasibility) {
            observations.push(observationFor({
              topology,
              kind: 'node',
              component: node,
              requirement,
              assessment: assess(requirement),
              observedAt,
              validUntil,
            }));
          }
        }
        for (const edgeId of edgeIds) {
          const edge = edges.get(edgeId);
          const assess = assessEdge({ edge, route, routeRecord, nodes, resources, runtimeContext, endpointStatus });
          for (const requirement of edge.required_feasibility) {
            observations.push(observationFor({
              topology,
              kind: 'edge',
              component: edge,
              requirement,
              assessment: assess(requirement),
              observedAt,
              validUntil,
            }));
          }
        }
      }
      return Object.freeze(observations);
    },
  });
}

export const LOCAL_TOPOLOGY_OBSERVATION_SOURCE_SCHEMA = SOURCE_SCHEMA;
export const LOCAL_RUNTIME_SERVICE_EVIDENCE_SCHEMA = RUNTIME_SERVICE_EVIDENCE_SCHEMA;
export const LOCAL_EXECUTION_EVIDENCE_SCHEMA = EXECUTION_EVIDENCE_SCHEMA;
