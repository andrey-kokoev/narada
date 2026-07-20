import { connect as netConnect } from 'node:net';

const SOURCE_SCHEMA = 'narada.invokable-intelligence.local-topology-observation-source.v1';
const ROUTE_SCHEMA = 'narada.invokable-intelligence.invocation-route-candidate.v1';
const ENDPOINT_SCHEMA = 'narada.invokable-intelligence.inference-endpoint.v1';
const ADAPTER_SCHEMA = 'narada.invokable-intelligence.adapter.v1';
const EXECUTION_LOCUS_SCHEMA = 'narada.invokable-intelligence.execution-locus.v1';
const OBSERVATION_SCHEMA = 'narada.invokable-intelligence.topology-feasibility.v1';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
    : fallback;
}

function currentCatalogDocuments(records) {
  const latest = new Map();
  for (const record of records) {
    if (record?.validation?.status !== 'accepted' || !nonEmpty(record.record_id)) continue;
    const existing = latest.get(record.record_id);
    if (!existing || Number(record.revision) > Number(existing.revision)) {
      latest.set(record.record_id, record);
    }
  }
  return [...latest.values()].map((record) => record.document);
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
      reason_code: null,
      evidence_ref: `local-runtime-tcp-probe:${coordinate.protocol}:${coordinate.host}:${coordinate.port}`,
    }));
  });
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
    evidence: Object.freeze(assessment.evidence.map((entry) => Object.freeze({ ...entry }))),
    ...(assessment.reason_code ? { reason_code: assessment.reason_code } : {}),
  });
}

function endpointAssessment(endpoint, adapter, probeResult) {
  if (!endpoint || endpoint.schema !== ENDPOINT_SCHEMA) {
    return {
      status: 'unknown',
      reason_code: 'canonical-endpoint-not-found',
      evidence: [{ kind: 'document', ref: 'canonical-registry:endpoint-not-found' }],
    };
  }
  if (endpoint.address?.kind === 'url') {
    return {
      status: probeResult?.status ?? 'unknown',
      reason_code: probeResult?.reason_code ?? 'endpoint-probe-not-run',
      evidence: [{ kind: 'run', ref: probeResult?.evidence_ref ?? 'local-runtime-tcp-probe:not-run' }],
    };
  }
  if (endpoint.address?.kind === 'runtime-service') {
    const supported = endpoint.address.service === 'codex-subscription'
      && adapter?.schema === ADAPTER_SCHEMA
      && adapter.runtime_family === 'node'
      && adapter.protocol?.family === 'codex-subscription';
    return {
      status: supported ? 'feasible' : 'infeasible',
      reason_code: supported ? null : 'runtime-service-adapter-unsupported',
      evidence: [{ kind: 'run', ref: `local-runtime-service:${endpoint.address.service ?? 'unknown'}` }],
    };
  }
  return {
    status: 'infeasible',
    reason_code: 'endpoint-address-not-supported-by-node-runtime',
    evidence: [{ kind: 'document', ref: `canonical-endpoint-address:${endpoint.address?.kind ?? 'unknown'}` }],
  };
}

function localExecutionAssessment(component, resources, runtimeContext, expectedKind) {
  const executionLocus = component.locus?.execution_locus;
  const locusResource = executionLocus ? resources.get(executionLocus.id) : null;
  const present = component.kind === expectedKind
    && component.locus?.kind === 'local-machine'
    && locusResource?.schema === EXECUTION_LOCUS_SCHEMA
    && locusResource.kind === 'local'
    && nonEmpty(runtimeContext?.session)
    && nonEmpty(runtimeContext?.identity);
  return {
    status: present ? 'feasible' : 'infeasible',
    reason_code: present ? null : `${expectedKind}-not-present-in-local-runtime`,
    evidence: [{ kind: 'run', ref: `local-runtime-process:${runtimeContext?.session ?? 'unknown'}:${process.pid}` }],
  };
}

function assessNode({ node, route, endpoint, adapter, resources, runtimeContext, endpointStatus }) {
  return (requirement) => {
    if (requirement === 'client-supported') {
      const present = node.kind === 'client' && nonEmpty(runtimeContext?.session) && nonEmpty(runtimeContext?.identity);
      return {
        status: present ? 'feasible' : 'infeasible',
        reason_code: present ? null : 'client-session-not-admitted',
        evidence: [{ kind: 'run', ref: `local-runtime-session:${runtimeContext?.session ?? 'unknown'}` }],
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
        evidence: [{ kind: 'run', ref: `local-runtime-adapter:${adapter?.id ?? 'missing'}` }],
      };
    }
    if (requirement === 'service-available' || requirement === 'endpoint-available') {
      return endpointStatus;
    }
    return {
      status: 'unknown',
      reason_code: 'topology-node-requirement-not-observed',
      evidence: [{ kind: 'document', ref: `canonical-route:${route.id}` }],
    };
  };
}

function assessEdge({ edge, route, nodes, resources, runtimeContext, endpointStatus }) {
  return (requirement) => {
    if (requirement === 'network-reachable') return endpointStatus;
    if (requirement === 'boundary-admitted') {
      if (edge.boundary?.kinds?.includes('network')) {
        const admitted = Boolean(nonEmpty(edge.boundary.trust_policy_ref))
          && Boolean(nonEmpty(edge.boundary.network_path_ref));
        return {
          status: admitted ? 'feasible' : 'infeasible',
          reason_code: admitted ? null : 'network-boundary-policy-incomplete',
          evidence: [{ kind: 'document', ref: `canonical-route:${route.id}:boundary:${edge.id}` }],
        };
      }
      if (edge.boundary?.kinds?.includes('process')) {
        const from = nodes.get(edge.from);
        const to = nodes.get(edge.to);
        const localOrClient = (node) => node?.kind === 'client'
          || localExecutionAssessment(node, resources, runtimeContext, node?.kind).status === 'feasible';
        const admitted = localOrClient(from) && localOrClient(to);
        return {
          status: admitted ? 'feasible' : 'infeasible',
          reason_code: admitted ? null : 'process-boundary-not-present',
          evidence: [{ kind: 'run', ref: `local-runtime-process-boundary:${runtimeContext?.session ?? 'unknown'}:${edge.id}` }],
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
  probeEndpoint = probeTcpEndpoint,
  now = () => Date.now(),
} = {}) {
  if (!store || typeof store.listCatalogRecords !== 'function' || typeof store.listResources !== 'function') {
    throw new Error('local_topology_observer_store_required');
  }
  if (source?.schema !== SOURCE_SCHEMA || !nonEmpty(source.authority_ref)) {
    throw new Error('local_topology_observation_source_required');
  }
  const timeoutMs = boundedInteger(source.probe_timeout_ms, 1500, 50, 10000);
  const cacheTtlMs = boundedInteger(source.cache_ttl_ms, 5000, 0, 60000);
  const probeCache = new Map();

  const probeFor = async (endpoint) => {
    if (endpoint?.address?.kind !== 'url') return null;
    const key = endpoint.address.url;
    const cached = probeCache.get(key);
    const current = now();
    if (cached && cached.expires_at > current) return cached.result;
    const result = await probeEndpoint(endpoint.address, { timeoutMs });
    probeCache.set(key, { result, expires_at: current + cacheTtlMs });
    return result;
  };

  return Object.freeze({
    async observe({ decisionClock } = {}) {
      const observedAt = nonEmpty(decisionClock?.instant) ?? new Date(now()).toISOString();
      const validUntil = new Date(Date.parse(observedAt) + Math.max(cacheTtlMs, 1000)).toISOString();
      const [records, resourceList] = await Promise.all([
        store.listCatalogRecords(),
        store.listResources(),
      ]);
      const routes = currentCatalogDocuments(records)
        .filter((document) => document?.schema === ROUTE_SCHEMA);
      if (routes.length === 0) throw new Error('local_topology_routes_not_initialized');
      const routeByTopology = new Map();
      for (const route of routes) {
        const existing = routeByTopology.get(route.topology?.id);
        if (existing && existing.endpoint?.id !== route.endpoint?.id) {
          throw new Error(`local_topology_ambiguous_route_topology:${route.topology?.id}`);
        }
        routeByTopology.set(route.topology?.id, route);
      }
      const resources = new Map(resourceList.map((resource) => [resource.id, resource]));
      const observations = [];
      for (const route of routeByTopology.values()) {
        const topology = route.topology;
        const endpoint = resources.get(route.endpoint?.id);
        const adapter = resources.get(route.adapter?.id);
        const probeResult = await probeFor(endpoint);
        const endpointStatus = endpointAssessment(endpoint, adapter, probeResult);
        const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
        for (const nodeId of topology.route.node_ids) {
          const node = nodes.get(nodeId);
          if (!node) continue;
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
        const edges = new Map(topology.edges.map((edge) => [edge.id, edge]));
        for (const edgeId of topology.route.edge_ids) {
          const edge = edges.get(edgeId);
          if (!edge) continue;
          const assess = assessEdge({ edge, route, nodes, resources, runtimeContext, endpointStatus });
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
