import { connect as netConnect } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {
  canonicalJson,
  validateCanonicalCatalogRecord,
} from '@narada-core/invokable-intelligence-contract';

const SOURCE_SCHEMA: any = 'narada.invokable-intelligence.local-topology-observation-source.v1';
const ROUTE_SCHEMA: any = 'narada.invokable-intelligence.invocation-route-candidate.v1';
const ENDPOINT_SCHEMA: any = 'narada.invokable-intelligence.inference-endpoint.v1';
const ADAPTER_SCHEMA: any = 'narada.invokable-intelligence.adapter.v1';
const EXECUTION_LOCUS_SCHEMA: any = 'narada.invokable-intelligence.execution-locus.v1';
const OBSERVATION_SCHEMA: any = 'narada.invokable-intelligence.topology-feasibility.v1';
const RUNTIME_SERVICE_EVIDENCE_SCHEMA: any = 'narada.invokable-intelligence.local-runtime-service-evidence.v1';
const EXECUTION_EVIDENCE_SCHEMA: any = 'narada.invokable-intelligence.local-execution-evidence.v1';

function nonEmpty(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedInteger(value: any, fallback: any, minimum: any, maximum: any) {
  const parsed: any = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
    : fallback;
}

function currentCatalogEntries(records: any) {
  const latest: any = new Map();
  for (const record of records) {
    if (record?.validation?.status !== 'accepted' || !nonEmpty(record.record_id)) continue;
    const existing: any = latest.get(record.record_id);
    if (!existing || Number(record.revision) > Number(existing.revision)) {
      latest.set(record.record_id, record);
    }
  }
  return [...latest.values()].map((record: any) => ({ record, document: record.document }));
}

function uniqueMap(items: any, label: any) {
  if (!Array.isArray(items)) throw new Error(`local_topology_${label}_array_required`);
  const mapped: any = new Map();
  for (const item of items) {
    const id: any = nonEmpty(item?.id);
    if (!id) throw new Error(`local_topology_${label}_id_required`);
    if (mapped.has(id)) throw new Error(`local_topology_duplicate_${label}_id:${id}`);
    mapped.set(id, item);
  }
  return mapped;
}

function uniqueRefs(values: any, label: any) {
  if (!Array.isArray(values)) throw new Error(`local_topology_route_${label}_array_required`);
  const refs: any = [];
  const seen: any = new Set();
  for (const value of values) {
    const id: any = nonEmpty(value);
    if (!id) throw new Error(`local_topology_route_${label}_id_required`);
    if (seen.has(id)) throw new Error(`local_topology_duplicate_route_${label}_id:${id}`);
    seen.add(id);
    refs.push(id);
  }
  return refs;
}

const EVIDENCE_KINDS: any = new Set(['artifact', 'run', 'document', 'test', 'site-configuration']);

function hasBoundaryEvidence(evidence: any, expectedRef: any) {
  return Array.isArray(evidence)
    && evidence.length > 0
    && evidence.every((entry: any) => EVIDENCE_KINDS.has(entry?.kind) && nonEmpty(entry?.ref))
    && evidence.some((entry: any) => entry.kind === 'document' && entry.ref === expectedRef);
}

function boundaryAdmissionError(edge: any, observedAt: any = null) {
  const boundary: any = edge?.boundary;
  const admission: any = boundary?.admission;
  const requiresAdmission: any = boundary?.kinds?.some((kind: any) => ['trust', 'network', 'account', 'site'].includes(kind));
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
  const validFrom: any = Date.parse(admission.validity.valid_from);
  const validUntil: any = Date.parse(admission.validity.valid_until);
  const freshAsOf: any = Date.parse(admission.validity.fresh_as_of);
  if (![validFrom, validUntil, freshAsOf].every(Number.isFinite)
    || validFrom >= validUntil
    || freshAsOf < validFrom
    || freshAsOf > validUntil) {
    return `local_topology_boundary_admission_validity_invalid:${edge.id}`;
  }
  if (observedAt) {
    const observed: any = Date.parse(observedAt);
    if (!Number.isFinite(observed) || observed < validFrom || observed >= validUntil || freshAsOf > observed) {
      return `local_topology_boundary_admission_stale:${edge.id}`;
    }
  }
  return null;
}

function boundaryAdmissionEvidence(edge: any, routeRecord: any) {
  const admission: any = edge.boundary.admission;
  return [
    ...routeAdmissionEvidence(routeRecord),
    { kind: 'document', ref: admission.trust_policy.ref },
    { kind: 'document', ref: admission.network_path.ref },
    ...admission.trust_policy.evidence.map((entry: any) => ({ ...entry })),
    ...admission.network_path.evidence.map((entry: any) => ({ ...entry })),
  ];
}

function validatedRouteEntry(entry: any) {
  const diagnostics: any = validateCanonicalCatalogRecord(entry.record);
  if (diagnostics.length) {
    throw new Error(`local_topology_route_catalog_record_invalid:${entry.record?.id ?? 'unknown'}:${diagnostics[0].code}`);
  }
  const route: any = entry.document;
  const topology: any = route?.topology;
  if (!nonEmpty(route?.id) || !nonEmpty(route?.endpoint?.id) || !nonEmpty(route?.adapter?.id)) {
    throw new Error(`local_topology_route_coordinates_required:${route?.id ?? 'unknown'}`);
  }
  if (!topology || !nonEmpty(topology.id) || !topology.route) {
    throw new Error(`local_topology_route_document_invalid:${route.id}`);
  }
  const nodes: any = uniqueMap(topology.nodes, 'node');
  const edges: any = uniqueMap(topology.edges, 'edge');
  const nodeIds: any = uniqueRefs(topology.route.node_ids, 'node');
  const edgeIds: any = uniqueRefs(topology.route.edge_ids, 'edge');
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
    const boundaryError: any = boundaryAdmissionError(edge);
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

function socketCoordinate(address: any) {
  if (address?.kind !== 'url' || !nonEmpty(address.url)) return null;
  try {
    const url: any = new URL(address.url);
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

export function probeTcpEndpoint(address: any, { timeoutMs = 1500 }: any = {}) {
  const coordinate: any = socketCoordinate(address);
  if (!coordinate) {
    return Promise.resolve(Object.freeze({
      status: 'infeasible',
      reason_code: 'endpoint-url-invalid-or-unsupported',
      evidence_ref: 'local-runtime-tcp-probe:invalid-url',
    }));
  }
  return new Promise((resolve: any) => {
    const socket: any = netConnect({ host: coordinate.host, port: coordinate.port });
    let settled: any = false;
    const finish: any = (result: any) => {
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
    socket.once('error', (error: any) => finish({
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

export function probeHttpEndpoint(address: any, { timeoutMs = 1500 }: any = {}) {
  const coordinate: any = socketCoordinate(address);
  const invalid: any = {
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
  const evidenceRef: any = `local-runtime-http-probe:${coordinate.protocol}:${coordinate.host}:${coordinate.port}`;
  const requestFn: any = coordinate.protocol === 'https' ? httpsRequest : httpRequest;
  return new Promise((resolve: any) => {
    let settled: any = false;
    let connected: any = false;
    const finish: any = (result: any) => {
      if (settled) return;
      settled = true;
      resolve(Object.freeze(result));
    };
    const failure: any = (reasonCode: any) => {
      const transport: any = {
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
    let request: any;
    try {
      request = requestFn(address.url, {
        method: 'HEAD',
        headers: { accept: '*/*' },
      }, (response: any) => {
        const statusCode: any = Number(response.statusCode ?? 0);
        response.resume();
        const responseReceived: any = statusCode > 0;
        const authenticationFailure: any = statusCode === 401
          ? 'endpoint-http-authentication-required'
          : statusCode === 403
            ? 'endpoint-http-authentication-forbidden'
            : null;
        const serviceAvailable: any = statusCode >= 200 && statusCode < 500 && !authenticationFailure;
        const statusReason: any = `endpoint-http-status-${statusCode || 'unknown'}`;
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
      const errorCode = error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      finish(failure(nonEmpty(errorCode)?.toLowerCase() ?? 'request-construction-failed'));
      return;
    }
    request.once('socket', (socket: any) => {
      socket.once('connect', () => { connected = true; });
      socket.once('secureConnect', () => { connected = true; });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      finish(failure('timeout'));
    });
    request.once('error', (error: any) => {
      finish(failure(nonEmpty(error?.code)?.toLowerCase() ?? 'unreachable'));
    });
    request.end();
  });
}

function runtimeServiceEvidenceState(runtimeServices: any, {
  service,
  runtimeFamily,
  protocolFamily,
  session,
  authorityRef,
  observedAt,
  validityMs,
}: any) {
  const candidate: any = runtimeServices.find((entry: any) => (
    entry?.schema === RUNTIME_SERVICE_EVIDENCE_SCHEMA
      && entry.service === service
      && entry.runtime_family === runtimeFamily
      && entry.protocol_family === protocolFamily
      && entry.observed_for_session === session
      && entry.authority_ref === authorityRef
      && nonEmpty(entry.evidence_ref)
  ));
  if (!candidate) return { evidence: null, stale: false };
  const evidenceAt: any = Date.parse(candidate.observed_at ?? '');
  const observed: any = Date.parse(observedAt ?? '');
  const fresh: any = Number.isFinite(evidenceAt)
    && Number.isFinite(observed)
    && evidenceAt <= observed
    && observed - evidenceAt <= validityMs;
  return { evidence: fresh ? candidate : null, stale: !fresh };
}

function observationId(topologyId: any, kind: any, componentId: any, requirement: any, observedAt: any) {
  const instant: any = observedAt.replace(/[^0-9A-Za-z]/g, '');
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
}: any) {
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
    evidence: Object.freeze(assessment.evidence.map((entry: any) => Object.freeze({
      ...entry,
      evidence_class: entry.evidence_class === 'synthetic-correlation'
        ? 'synthetic-correlation'
        : entry.evidence_class ? 'observed' : entry.kind === 'document' ? 'durable' : 'observed',
    }))),
    ...(assessment.reason_code ? { reason_code: assessment.reason_code } : {}),
  });
}

function endpointAssessment(endpoint: any, adapter: any, probeResult: any, runtimeServices: any, runtimeSession: any, runtimeEvidenceContext: any) {
  if (!endpoint || endpoint.schema !== ENDPOINT_SCHEMA) {
    return {
      status: 'unknown',
      reason_code: 'canonical-endpoint-not-found',
      evidence: [{ kind: 'document', ref: 'canonical-registry:endpoint-not-found' }],
    };
  }
  if (endpoint.address?.kind === 'url') {
    const evidenceRef: any = probeResult?.evidence_ref ?? probeResult?.transport?.evidence_ref ?? 'local-runtime-endpoint-probe:not-run';
    const transport: any = probeResult?.transport ?? {
      status: probeResult?.status ?? 'unknown',
      reason_code: probeResult?.reason_code ?? 'endpoint-transport-probe-not-run',
      evidence_ref: evidenceRef,
    };
    const endpointResult: any = probeResult?.endpoint ?? {
      status: 'infeasible',
      reason_code: 'endpoint-protocol-probe-not-run',
      evidence_ref: evidenceRef,
    };
    const service: any = probeResult?.service ?? {
      status: 'infeasible',
      reason_code: 'endpoint-service-probe-not-run',
      evidence_ref: evidenceRef,
    };
    return {
      forRequirement(requirement: any) {
        const assessment: any = requirement === 'network-reachable'
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
    const runtimeEvidenceState: any = runtimeServiceEvidenceState(runtimeServices, {
      service: endpoint.address.service,
      runtimeFamily: adapter?.runtime_family,
      protocolFamily: adapter?.protocol?.family,
      session: runtimeSession,
      authorityRef: runtimeEvidenceContext?.authorityRef,
      observedAt: runtimeEvidenceContext?.observedAt,
      validityMs: runtimeEvidenceContext?.validityMs ?? 1000,
    });
    const runtimeEvidence: any = runtimeEvidenceState.evidence;
    const supported: any = Boolean(runtimeEvidence)
      && runtimeEvidence.status === 'ready'
      && endpoint.address.service === 'codex-subscription'
      && adapter?.schema === ADAPTER_SCHEMA
      && adapter.runtime_family === 'node'
      && adapter.protocol?.family === 'codex-subscription';
    const assessment: any = {
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

function processIsAlive(processId: any) {
  const numeric: any = Number.parseInt(String(processId ?? ''), 10);
  if (!Number.isInteger(numeric) || numeric <= 0) return false;
  try {
    process.kill(numeric, 0);
    return true;
  } catch {
    return false;
  }
}

function localExecutionAssessment(component: any, resources: any, runtimeContext: any, expectedKind: any) {
  const executionLocus: any = component.locus?.execution_locus;
  const locusResource: any = executionLocus ? resources.get(executionLocus.id) : null;
  const evidence: any = Array.isArray(runtimeContext?.executionEvidence)
    ? runtimeContext.executionEvidence.find((entry: any) => (
      entry?.schema === EXECUTION_EVIDENCE_SCHEMA
      && entry.component_kind === expectedKind
      && entry.execution_locus_id === executionLocus?.id
      && entry.observed_for_session === runtimeContext?.session
    ))
    : null;
  const evidenceMatchesResource: any = !component.resource || evidence?.resource_id === component.resource.id;
  const evidenceHasLiveProcess: any = processIsAlive(evidence?.process_id);
  const evidenceHasDeployment: any = nonEmpty(evidence?.deployment_ref);
  const present: any = component.kind === expectedKind
    && component.locus?.kind === 'local-machine'
    && locusResource?.schema === EXECUTION_LOCUS_SCHEMA
    && locusResource.kind === 'local'
    && nonEmpty(runtimeContext?.session)
    && nonEmpty(runtimeContext?.identity);
  const admitted: any = present
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

function assessNode({ node, route, endpoint, adapter, resources, runtimeContext, endpointStatus }: any) {
  return (requirement: any) => {
    if (requirement === 'client-supported') {
      const present: any = node.kind === 'client' && nonEmpty(runtimeContext?.session) && nonEmpty(runtimeContext?.identity);
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
      const local: any = localExecutionAssessment(node, resources, runtimeContext, 'adapter');
      const supported: any = local.status === 'feasible'
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

function routeAdmissionEvidence(routeRecord: any) {
  return [
    { kind: 'document', ref: routeRecord.id },
    ...routeRecord.validation.evidence.map((entry: any) => ({ ...entry })),
  ];
}

function assessEdge({ edge, route, routeRecord, nodes, resources, runtimeContext, endpointStatus }: any) {
  return (requirement: any) => {
    if (requirement === 'network-reachable') return endpointStatus.forRequirement(requirement);
    if (requirement === 'boundary-admitted') {
      if (edge.boundary?.kinds?.includes('network')) {
        const admitted: any = !boundaryAdmissionError(edge);
        return {
          status: admitted ? 'feasible' : 'infeasible',
          reason_code: admitted ? null : 'network-boundary-policy-incomplete',
          evidence: admitted ? boundaryAdmissionEvidence(edge, routeRecord) : routeAdmissionEvidence(routeRecord),
        };
      }
      if (edge.boundary?.kinds?.some((kind: any) => ['trust', 'account', 'site'].includes(kind))) {
        const admitted: any = !boundaryAdmissionError(edge);
        return {
          status: admitted ? 'feasible' : 'infeasible',
          reason_code: admitted ? null : 'boundary-admission-evidence-incomplete',
          evidence: admitted ? boundaryAdmissionEvidence(edge, routeRecord) : routeAdmissionEvidence(routeRecord),
        };
      }
      if (edge.boundary?.kinds?.includes('process')) {
        const from: any = nodes.get(edge.from);
        const to: any = nodes.get(edge.to);
        const assessProcessEndpoint: any = (node: any) => {
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
        const fromAssessment: any = assessProcessEndpoint(from);
        const toAssessment: any = assessProcessEndpoint(to);
        const admitted: any = fromAssessment.status === 'feasible' && toAssessment.status === 'feasible';
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
}: any = {}) {
  if (!store || typeof store.listCatalogRecords !== 'function' || typeof store.listResources !== 'function') {
    throw new Error('local_topology_observer_store_required');
  }
  if (source?.schema !== SOURCE_SCHEMA || !nonEmpty(source.authority_ref)) {
    throw new Error('local_topology_observation_source_required');
  }
  const timeoutMs: any = boundedInteger(source.probe_timeout_ms, 1500, 50, 10000);
  const observationValidityMs: any = boundedInteger(source.observation_validity_ms, 1000, 100, 10000);
  const runtimeServiceValidityMs: any = boundedInteger(source.runtime_service_validity_ms, 10000, 1000, 60000);

  const probeFor: any = async (endpoint: any) => {
    if (endpoint?.address?.kind !== 'url') return null;
    return probeEndpoint(endpoint.address, { timeoutMs });
  };

  return Object.freeze({
    async observe({ decisionClock }: any = {}) {
      const observedAt: any = nonEmpty(decisionClock?.instant) ?? new Date(now()).toISOString();
      const validUntil: any = new Date(Date.parse(observedAt) + observationValidityMs).toISOString();
      const [records, resourceList]: any = await Promise.all([
        store.listCatalogRecords(),
        store.listResources(),
      ]);
      const routes: any = currentCatalogEntries(records)
        .filter(({ document }: any) => document?.schema === ROUTE_SCHEMA)
        .map(validatedRouteEntry);
      if (routes.length === 0) throw new Error('local_topology_routes_not_initialized');
      const routeByTopology: any = new Map();
      for (const entry of routes) {
        const existing: any = routeByTopology.get(entry.topology.id);
        if (existing && existing.selectionShape !== entry.selectionShape) {
          throw new Error(`local_topology_ambiguous_route_topology:${entry.topology.id}`);
        }
        if (!existing) routeByTopology.set(entry.topology.id, entry);
      }
      const resources: any = uniqueMap(resourceList, 'resource');
      const observations: any = [];
      for (const entry of routeByTopology.values()) {
        for (const edge of entry.edges.values()) {
          const boundaryError: any = boundaryAdmissionError(edge, observedAt);
          if (boundaryError) throw new Error(boundaryError);
        }
        const { route, record: routeRecord, topology, nodes, edges, nodeIds, edgeIds }: any = entry;
        const endpoint: any = resources.get(route.endpoint?.id);
        const adapter: any = resources.get(route.adapter?.id);
        const probeResult: any = await probeFor(endpoint);
        const endpointStatus: any = endpointAssessment(
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
          const node: any = nodes.get(nodeId);
          const assess: any = assessNode({ node, route, endpoint, adapter, resources, runtimeContext, endpointStatus });
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
          const edge: any = edges.get(edgeId);
          const assess: any = assessEdge({ edge, route, routeRecord, nodes, resources, runtimeContext, endpointStatus });
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

export const LOCAL_TOPOLOGY_OBSERVATION_SOURCE_SCHEMA: any = SOURCE_SCHEMA;
export const LOCAL_RUNTIME_SERVICE_EVIDENCE_SCHEMA: any = RUNTIME_SERVICE_EVIDENCE_SCHEMA;
export const LOCAL_EXECUTION_EVIDENCE_SCHEMA: any = EXECUTION_EVIDENCE_SCHEMA;
