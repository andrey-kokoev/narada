/** Explicit multi-locus execution topology for an invocation route. */

import type { AssertionValidity, EvidenceRef } from "./assertions.js";
import type { ResourceKind, ResourceRef } from "./ids.js";

export const EXECUTION_TOPOLOGY_SCHEMA = "narada.invokable-intelligence.execution-topology.v1" as const;
export const TOPOLOGY_FEASIBILITY_SCHEMA = "narada.invokable-intelligence.topology-feasibility.v1" as const;

export type ExecutionTopologyNodeKind =
  | "client"
  | "launcher"
  | "carrier"
  | "runtime"
  | "adapter"
  | "inference-service"
  | "endpoint";

export type ExecutionTopologyLocusKind =
  | "client-device"
  | "local-machine"
  | "cloudflare-account"
  | "cloudflare-worker"
  | "remote-service"
  | "test-runtime";

export type TopologyAuthorityLocus =
  | "client-site"
  | "launcher-site"
  | "carrier-site"
  | "execution-site"
  | "service-site"
  | "target-site";

export interface TopologyAuthorityRef {
  site_id: string;
  locus: TopologyAuthorityLocus;
  authority_ref: string;
}

export interface ExecutionTopologyLocus {
  kind: ExecutionTopologyLocusKind;
  site_id: string;
  /** Typed registry resource for concrete executable loci when one exists. */
  execution_locus?: ResourceRef;
  /** Deployment/account/process identity, never a credential. */
  deployment_ref?: string;
}

export type TopologyFeasibilityRequirement =
  | "client-supported"
  | "launcher-available"
  | "carrier-deployed"
  | "runtime-available"
  | "adapter-supported"
  | "boundary-admitted"
  | "network-reachable"
  | "service-available"
  | "endpoint-available";

export interface ExecutionTopologyNode {
  id: string;
  kind: ExecutionTopologyNodeKind;
  locus: ExecutionTopologyLocus;
  /** Adapter/provider/endpoint registry identity where the node embodies one. */
  resource?: ResourceRef;
  feasibility_authority: TopologyAuthorityRef;
  required_feasibility: TopologyFeasibilityRequirement[];
}

export type ExecutionTopologyEdgeKind =
  | "operator-handoff"
  | "process-handoff"
  | "runtime-call"
  | "binding-call"
  | "network-call"
  | "provider-call";

export type TopologyBoundaryKind = "none" | "process" | "trust" | "network" | "account" | "site";

export interface ExecutionTopologyEdge {
  id: string;
  from: string;
  to: string;
  kind: ExecutionTopologyEdgeKind;
  boundary: {
    kinds: TopologyBoundaryKind[];
    trust_policy_ref?: string;
    network_path_ref?: string;
  };
  feasibility_authority: TopologyAuthorityRef;
  required_feasibility: TopologyFeasibilityRequirement[];
}

export interface ExecutionTopology {
  schema: typeof EXECUTION_TOPOLOGY_SCHEMA;
  id: string;
  nodes: ExecutionTopologyNode[];
  edges: ExecutionTopologyEdge[];
  /** Ordered selected route. Edges must connect adjacent nodes exactly. */
  route: {
    node_ids: string[];
    edge_ids: string[];
  };
}

export interface TopologyComponentRef {
  kind: "node" | "edge";
  id: string;
}

export interface TopologyFeasibilityObservation {
  schema: typeof TOPOLOGY_FEASIBILITY_SCHEMA;
  id: string;
  topology_id: string;
  subject: TopologyComponentRef;
  requirement: TopologyFeasibilityRequirement;
  status: "feasible" | "infeasible" | "unknown";
  owner: TopologyAuthorityRef;
  validity: AssertionValidity;
  observed_at: string;
  evidence: EvidenceRef[];
  reason_code?: string;
}

export type TopologyDiagnosticCode =
  | "invalid-topology"
  | "duplicate-component-id"
  | "missing-node-kind"
  | "missing-execution-locus"
  | "wrong-resource-kind"
  | "dangling-edge"
  | "disconnected-route"
  | "missing-boundary"
  | "missing-feasibility-authority"
  | "unknown-feasibility-subject"
  | "feasibility-authority-mismatch"
  | "undeclared-feasibility-requirement";

export interface TopologyDiagnostic {
  code: TopologyDiagnosticCode;
  component_id?: string;
  expected?: unknown;
  actual?: unknown;
  message: string;
}

const REQUIRED_NODE_KINDS: readonly ExecutionTopologyNodeKind[] = [
  "client",
  "launcher",
  "carrier",
  "runtime",
  "adapter",
  "inference-service",
  "endpoint",
];

const EXECUTION_BEARING_NODE_KINDS: readonly ExecutionTopologyNodeKind[] = [
  "launcher",
  "carrier",
  "runtime",
  "adapter",
];

const RESOURCE_KIND_BY_NODE_KIND: Partial<Record<ExecutionTopologyNodeKind, ResourceKind>> = {
  adapter: "adapter",
  "inference-service": "inference-provider",
  endpoint: "inference-endpoint",
};

const sameAuthority = (a: TopologyAuthorityRef, b: TopologyAuthorityRef) =>
  a.site_id === b.site_id && a.locus === b.locus && a.authority_ref === b.authority_ref;

export function validateExecutionTopology(topology: ExecutionTopology): TopologyDiagnostic[] {
  const diagnostics: TopologyDiagnostic[] = [];
  if (topology.schema !== EXECUTION_TOPOLOGY_SCHEMA || !topology.id) {
    diagnostics.push({ code: "invalid-topology", message: "Execution topology requires the v1 schema and an identity." });
  }

  const allIds = [...topology.nodes.map(({ id }) => id), ...topology.edges.map(({ id }) => id)];
  for (const id of new Set(allIds)) {
    if (allIds.filter((candidate) => candidate === id).length > 1) {
      diagnostics.push({ code: "duplicate-component-id", component_id: id, message: `Duplicate topology component id: ${id}` });
    }
  }

  for (const kind of REQUIRED_NODE_KINDS) {
    if (!topology.nodes.some((node) => node.kind === kind)) {
      diagnostics.push({ code: "missing-node-kind", expected: kind, message: `Selected route has no ${kind} node.` });
    }
  }

  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const edges = new Map(topology.edges.map((edge) => [edge.id, edge]));
  for (const node of topology.nodes) {
    if (!node.locus.site_id || !node.feasibility_authority.site_id || !node.feasibility_authority.authority_ref) {
      diagnostics.push({
        code: "missing-feasibility-authority",
        component_id: node.id,
        message: "Topology nodes require an explicit locus and feasibility authority Site.",
      });
    }
    if (EXECUTION_BEARING_NODE_KINDS.includes(node.kind)) {
      if (!node.locus.execution_locus || node.locus.execution_locus.kind !== "execution-locus") {
        diagnostics.push({
          code: "missing-execution-locus",
          component_id: node.id,
          expected: "execution-locus resource",
          actual: node.locus.execution_locus,
          message: `${node.kind} node ${node.id} requires a typed execution locus.`,
        });
      }
    }
    const expectedResourceKind = RESOURCE_KIND_BY_NODE_KIND[node.kind];
    if (expectedResourceKind && node.resource?.kind !== expectedResourceKind) {
      diagnostics.push({
        code: "wrong-resource-kind",
        component_id: node.id,
        expected: expectedResourceKind,
        actual: node.resource?.kind,
        message: `${node.kind} node ${node.id} must reference a ${expectedResourceKind} resource.`,
      });
    }
  }

  for (const edge of topology.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      diagnostics.push({
        code: "dangling-edge",
        component_id: edge.id,
        actual: { from: edge.from, to: edge.to },
        message: `Edge ${edge.id} references a missing topology node.`,
      });
    }
    if (!edge.boundary.kinds.length) {
      diagnostics.push({ code: "missing-boundary", component_id: edge.id, message: `Edge ${edge.id} must declare its boundary posture.` });
    }
    if (!edge.feasibility_authority.site_id || !edge.feasibility_authority.authority_ref) {
      diagnostics.push({
        code: "missing-feasibility-authority",
        component_id: edge.id,
        message: `Edge ${edge.id} requires an explicit feasibility authority Site.`,
      });
    }
  }

  if (topology.route.edge_ids.length !== topology.route.node_ids.length - 1) {
    diagnostics.push({ code: "disconnected-route", message: "A selected route requires exactly one edge between every adjacent node." });
  }
  topology.route.node_ids.forEach((nodeId, index) => {
    if (!nodes.has(nodeId)) {
      diagnostics.push({ code: "disconnected-route", component_id: nodeId, message: `Route references missing node ${nodeId}.` });
    }
    if (index === topology.route.node_ids.length - 1) return;
    const edgeId = topology.route.edge_ids[index];
    const edge = edgeId ? edges.get(edgeId) : undefined;
    const nextNodeId = topology.route.node_ids[index + 1];
    if (!edge || edge.from !== nodeId || edge.to !== nextNodeId) {
      diagnostics.push({
        code: "disconnected-route",
        component_id: edgeId,
        expected: { from: nodeId, to: nextNodeId },
        actual: edge ? { from: edge.from, to: edge.to } : null,
        message: `Route edge ${String(edgeId)} does not connect adjacent selected nodes.`,
      });
    }
  });
  return diagnostics;
}

export function validateTopologyFeasibilityObservation(
  topology: ExecutionTopology,
  observation: TopologyFeasibilityObservation,
): TopologyDiagnostic[] {
  const component = observation.subject.kind === "node"
    ? topology.nodes.find(({ id }) => id === observation.subject.id)
    : topology.edges.find(({ id }) => id === observation.subject.id);
  if (!component || observation.topology_id !== topology.id) {
    return [{
      code: "unknown-feasibility-subject",
      component_id: observation.subject.id,
      message: `Feasibility observation ${observation.id} does not address a component in topology ${topology.id}.`,
    }];
  }
  const diagnostics: TopologyDiagnostic[] = [];
  if (!sameAuthority(component.feasibility_authority, observation.owner)) {
    diagnostics.push({
      code: "feasibility-authority-mismatch",
      component_id: component.id,
      expected: component.feasibility_authority,
      actual: observation.owner,
      message: `Observation ${observation.id} was not issued by the component's declared feasibility authority.`,
    });
  }
  if (!component.required_feasibility.includes(observation.requirement)) {
    diagnostics.push({
      code: "undeclared-feasibility-requirement",
      component_id: component.id,
      expected: component.required_feasibility,
      actual: observation.requirement,
      message: `Observation ${observation.id} addresses a requirement not declared by ${component.id}.`,
    });
  }
  return diagnostics;
}

export interface TopologyFeasibilityFailure {
  subject: TopologyComponentRef;
  requirement: TopologyFeasibilityRequirement;
  reason_code: "infeasible-component" | "unknown-feasibility" | "invalid-observation";
  observation_id?: string;
  detail?: string;
}

export interface TopologyFeasibilityResult {
  status: "feasible" | "infeasible" | "unknown";
  failures: TopologyFeasibilityFailure[];
  diagnostics: TopologyDiagnostic[];
}

/** Evaluate the actual selected route and identify the exact failed node or edge. */
export function evaluateExecutionTopologyFeasibility(
  topology: ExecutionTopology,
  observations: readonly TopologyFeasibilityObservation[],
): TopologyFeasibilityResult {
  const diagnostics = validateExecutionTopology(topology);
  const routeNodes = topology.route.node_ids
    .map((id) => topology.nodes.find((node) => node.id === id))
    .filter((node): node is ExecutionTopologyNode => Boolean(node));
  const routeEdges = topology.route.edge_ids
    .map((id) => topology.edges.find((edge) => edge.id === id))
    .filter((edge): edge is ExecutionTopologyEdge => Boolean(edge));
  const components: Array<{ ref: TopologyComponentRef; requirements: TopologyFeasibilityRequirement[] }> = [
    ...routeNodes.map((node) => ({ ref: { kind: "node" as const, id: node.id }, requirements: node.required_feasibility })),
    ...routeEdges.map((edge) => ({ ref: { kind: "edge" as const, id: edge.id }, requirements: edge.required_feasibility })),
  ];
  const failures: TopologyFeasibilityFailure[] = [];
  for (const component of components) {
    for (const requirement of component.requirements) {
      const observation = observations.find(({ subject, requirement: observed }) =>
        subject.kind === component.ref.kind && subject.id === component.ref.id && observed === requirement);
      if (!observation) {
        failures.push({ subject: component.ref, requirement, reason_code: "unknown-feasibility" });
        continue;
      }
      const observationDiagnostics = validateTopologyFeasibilityObservation(topology, observation);
      diagnostics.push(...observationDiagnostics);
      if (observationDiagnostics.length) {
        failures.push({
          subject: component.ref,
          requirement,
          reason_code: "invalid-observation",
          observation_id: observation.id,
          detail: observationDiagnostics.map(({ code }) => code).join(","),
        });
      } else if (observation.status === "infeasible") {
        failures.push({
          subject: component.ref,
          requirement,
          reason_code: "infeasible-component",
          observation_id: observation.id,
          detail: observation.reason_code,
        });
      } else if (observation.status === "unknown") {
        failures.push({
          subject: component.ref,
          requirement,
          reason_code: "unknown-feasibility",
          observation_id: observation.id,
          detail: observation.reason_code,
        });
      }
    }
  }
  const hasInfeasible = failures.some(({ reason_code }) => reason_code === "infeasible-component" || reason_code === "invalid-observation");
  return {
    status: hasInfeasible ? "infeasible" : failures.length ? "unknown" : "feasible",
    failures,
    diagnostics,
  };
}

const authority = (site_id: string, locus: TopologyAuthorityLocus): TopologyAuthorityRef => ({
  site_id,
  locus,
  authority_ref: `site-governance:${site_id}:${locus}`,
});

const executionLocus = (id: string): ResourceRef => ({ kind: "execution-locus", id: `execution-locus:${id}` });

/** Structurally local fixture: launcher, carrier, runtime, and adapter execute on the operator PC. */
export const LOCAL_EXECUTION_TOPOLOGY: ExecutionTopology = {
  schema: EXECUTION_TOPOLOGY_SCHEMA,
  id: "topology:local-openai-compatible",
  nodes: [
    { id: "local-client", kind: "client", locus: { kind: "client-device", site_id: "site:user" }, feasibility_authority: authority("site:user", "client-site"), required_feasibility: ["client-supported"] },
    { id: "local-launcher", kind: "launcher", locus: { kind: "local-machine", site_id: "site:pc", execution_locus: executionLocus("operator-pc") }, feasibility_authority: authority("site:pc", "launcher-site"), required_feasibility: ["launcher-available"] },
    { id: "local-carrier", kind: "carrier", locus: { kind: "local-machine", site_id: "site:pc", execution_locus: executionLocus("operator-pc") }, feasibility_authority: authority("site:pc", "carrier-site"), required_feasibility: ["carrier-deployed"] },
    { id: "local-runtime", kind: "runtime", locus: { kind: "local-machine", site_id: "site:pc", execution_locus: executionLocus("operator-pc") }, feasibility_authority: authority("site:pc", "execution-site"), required_feasibility: ["runtime-available"] },
    { id: "local-adapter", kind: "adapter", locus: { kind: "local-machine", site_id: "site:pc", execution_locus: executionLocus("operator-pc") }, resource: { kind: "adapter", id: "adapter:openai-compatible-http" }, feasibility_authority: authority("site:pc", "execution-site"), required_feasibility: ["adapter-supported"] },
    { id: "remote-service", kind: "inference-service", locus: { kind: "remote-service", site_id: "site:inference-service" }, resource: { kind: "inference-provider", id: "inference-provider:remote-api" }, feasibility_authority: authority("site:inference-service", "service-site"), required_feasibility: ["service-available"] },
    { id: "remote-endpoint", kind: "endpoint", locus: { kind: "remote-service", site_id: "site:inference-service" }, resource: { kind: "inference-endpoint", id: "inference-endpoint:remote-default" }, feasibility_authority: authority("site:inference-service", "service-site"), required_feasibility: ["endpoint-available"] },
  ],
  edges: [
    { id: "l1", from: "local-client", to: "local-launcher", kind: "operator-handoff", boundary: { kinds: ["process"] }, feasibility_authority: authority("site:user", "client-site"), required_feasibility: ["boundary-admitted"] },
    { id: "l2", from: "local-launcher", to: "local-carrier", kind: "process-handoff", boundary: { kinds: ["process"] }, feasibility_authority: authority("site:pc", "launcher-site"), required_feasibility: ["boundary-admitted"] },
    { id: "l3", from: "local-carrier", to: "local-runtime", kind: "runtime-call", boundary: { kinds: ["process"] }, feasibility_authority: authority("site:pc", "carrier-site"), required_feasibility: ["boundary-admitted"] },
    { id: "l4", from: "local-runtime", to: "local-adapter", kind: "runtime-call", boundary: { kinds: ["none"] }, feasibility_authority: authority("site:pc", "execution-site"), required_feasibility: [] },
    { id: "l5", from: "local-adapter", to: "remote-service", kind: "network-call", boundary: { kinds: ["network", "trust", "site"], trust_policy_ref: "trust:remote-api", network_path_ref: "network:pc-to-remote" }, feasibility_authority: authority("site:pc", "execution-site"), required_feasibility: ["network-reachable", "boundary-admitted"] },
    { id: "l6", from: "remote-service", to: "remote-endpoint", kind: "provider-call", boundary: { kinds: ["none"] }, feasibility_authority: authority("site:inference-service", "service-site"), required_feasibility: [] },
  ],
  route: { node_ids: ["local-client", "local-launcher", "local-carrier", "local-runtime", "local-adapter", "remote-service", "remote-endpoint"], edge_ids: ["l1", "l2", "l3", "l4", "l5", "l6"] },
};

/** Structurally hosted fixture: carrier, runtime, and adapter execute in Cloudflare, not on the operator PC. */
export const CLOUDFLARE_EXECUTION_TOPOLOGY: ExecutionTopology = {
  schema: EXECUTION_TOPOLOGY_SCHEMA,
  id: "topology:cloudflare-workers-ai",
  nodes: [
    { id: "cf-client", kind: "client", locus: { kind: "client-device", site_id: "site:user" }, feasibility_authority: authority("site:user", "client-site"), required_feasibility: ["client-supported"] },
    { id: "cf-launcher", kind: "launcher", locus: { kind: "local-machine", site_id: "site:pc", execution_locus: executionLocus("operator-pc") }, feasibility_authority: authority("site:pc", "launcher-site"), required_feasibility: ["launcher-available"] },
    { id: "cf-carrier", kind: "carrier", locus: { kind: "cloudflare-worker", site_id: "site:cloudflare-account", execution_locus: executionLocus("cloudflare-carrier"), deployment_ref: "worker:narada-cloudflare-carrier" }, feasibility_authority: authority("site:cloudflare-account", "carrier-site"), required_feasibility: ["carrier-deployed"] },
    { id: "cf-runtime", kind: "runtime", locus: { kind: "cloudflare-worker", site_id: "site:cloudflare-account", execution_locus: executionLocus("cloudflare-carrier") }, feasibility_authority: authority("site:cloudflare-account", "execution-site"), required_feasibility: ["runtime-available"] },
    { id: "cf-adapter", kind: "adapter", locus: { kind: "cloudflare-worker", site_id: "site:cloudflare-account", execution_locus: executionLocus("cloudflare-carrier") }, resource: { kind: "adapter", id: "adapter:workers-ai-binding" }, feasibility_authority: authority("site:cloudflare-account", "execution-site"), required_feasibility: ["adapter-supported"] },
    { id: "cf-service", kind: "inference-service", locus: { kind: "cloudflare-account", site_id: "site:cloudflare-account", deployment_ref: "binding:AI" }, resource: { kind: "inference-provider", id: "inference-provider:cloudflare-workers-ai" }, feasibility_authority: authority("site:cloudflare-account", "service-site"), required_feasibility: ["service-available"] },
    { id: "cf-endpoint", kind: "endpoint", locus: { kind: "remote-service", site_id: "site:cloudflare-account" }, resource: { kind: "inference-endpoint", id: "inference-endpoint:cf-workers-ai-default" }, feasibility_authority: authority("site:cloudflare-account", "service-site"), required_feasibility: ["endpoint-available"] },
  ],
  edges: [
    { id: "c1", from: "cf-client", to: "cf-launcher", kind: "operator-handoff", boundary: { kinds: ["process"] }, feasibility_authority: authority("site:user", "client-site"), required_feasibility: ["boundary-admitted"] },
    { id: "c2", from: "cf-launcher", to: "cf-carrier", kind: "network-call", boundary: { kinds: ["network", "trust", "site", "account"], trust_policy_ref: "trust:cloudflare-operator-session", network_path_ref: "network:pc-to-cloudflare" }, feasibility_authority: authority("site:pc", "launcher-site"), required_feasibility: ["network-reachable", "boundary-admitted"] },
    { id: "c3", from: "cf-carrier", to: "cf-runtime", kind: "runtime-call", boundary: { kinds: ["process"] }, feasibility_authority: authority("site:cloudflare-account", "carrier-site"), required_feasibility: ["boundary-admitted"] },
    { id: "c4", from: "cf-runtime", to: "cf-adapter", kind: "runtime-call", boundary: { kinds: ["none"] }, feasibility_authority: authority("site:cloudflare-account", "execution-site"), required_feasibility: [] },
    { id: "c5", from: "cf-adapter", to: "cf-service", kind: "binding-call", boundary: { kinds: ["account", "trust"] }, feasibility_authority: authority("site:cloudflare-account", "execution-site"), required_feasibility: ["boundary-admitted"] },
    { id: "c6", from: "cf-service", to: "cf-endpoint", kind: "provider-call", boundary: { kinds: ["none"] }, feasibility_authority: authority("site:cloudflare-account", "service-site"), required_feasibility: [] },
  ],
  route: { node_ids: ["cf-client", "cf-launcher", "cf-carrier", "cf-runtime", "cf-adapter", "cf-service", "cf-endpoint"], edge_ids: ["c1", "c2", "c3", "c4", "c5", "c6"] },
};
