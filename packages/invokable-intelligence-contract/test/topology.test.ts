import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOUDFLARE_EXECUTION_TOPOLOGY,
  LOCAL_EXECUTION_TOPOLOGY,
  TOPOLOGY_FEASIBILITY_SCHEMA,
  evaluateExecutionTopologyFeasibility,
  validateExecutionTopology,
} from "../src/topology.js";
import type { ExecutionTopology, TopologyFeasibilityObservation } from "../src/topology.js";

const clone = <T>(value: T): T => structuredClone(value);

test("local and Cloudflare routes are valid but structurally different", () => {
  assert.deepEqual(validateExecutionTopology(LOCAL_EXECUTION_TOPOLOGY), []);
  assert.deepEqual(validateExecutionTopology(CLOUDFLARE_EXECUTION_TOPOLOGY), []);
  const localRuntime = LOCAL_EXECUTION_TOPOLOGY.nodes.find(({ kind }) => kind === "runtime");
  const cloudflareRuntime = CLOUDFLARE_EXECUTION_TOPOLOGY.nodes.find(({ kind }) => kind === "runtime");
  assert.equal(localRuntime?.locus.kind, "local-machine");
  assert.equal(cloudflareRuntime?.locus.kind, "cloudflare-worker");
  assert.notEqual(localRuntime?.locus.site_id, cloudflareRuntime?.locus.site_id);
});

test("routes missing execution loci or connected edges are rejected", () => {
  const missingLocus = clone(LOCAL_EXECUTION_TOPOLOGY);
  const runtime = missingLocus.nodes.find(({ kind }) => kind === "runtime");
  if (runtime) delete runtime.locus.execution_locus;
  assert.ok(validateExecutionTopology(missingLocus).some(({ code }) => code === "missing-execution-locus"));

  const disconnected = clone(CLOUDFLARE_EXECUTION_TOPOLOGY);
  disconnected.edges.find(({ id }) => id === "c3")!.to = "cf-adapter";
  assert.ok(validateExecutionTopology(disconnected).some(({ code }) => code === "disconnected-route"));
});

test("boundary admission requires evidence bound to declared policy and path references", () => {
  const topology = clone(LOCAL_EXECUTION_TOPOLOGY);
  const edge = topology.edges.find(({ id }) => id === "l5")!;
  edge.boundary.admission!.trust_policy.evidence = [{ kind: "test", ref: "test:unrelated" }];
  assert.ok(validateExecutionTopology(topology).some(({ code, component_id }) => (
    code === "invalid-boundary-admission" && component_id === "l5"
  )));
});

test("malformed nested boundary admission is rejected without throwing", () => {
  const topology = clone(LOCAL_EXECUTION_TOPOLOGY);
  const edge = topology.edges.find(({ id }) => id === "l5")!;
  delete (edge.boundary.admission as unknown as { trust_policy?: unknown }).trust_policy;
  assert.doesNotThrow(() => validateExecutionTopology(topology));
  assert.ok(validateExecutionTopology(topology).some(({ code, component_id }) => (
    code === "invalid-boundary-admission" && component_id === "l5"
  )));
});

test("feasibility explanations identify the exact infeasible boundary", () => {
  const topology = CLOUDFLARE_EXECUTION_TOPOLOGY;
  const observations: TopologyFeasibilityObservation[] = [];
  for (const node of topology.nodes) {
    for (const requirement of node.required_feasibility) {
      observations.push({
        schema: TOPOLOGY_FEASIBILITY_SCHEMA,
        id: `observation:${node.id}:${requirement}`,
        topology_id: topology.id,
        subject: { kind: "node", id: node.id },
        requirement,
        status: "feasible",
        owner: node.feasibility_authority,
        validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
        observed_at: "2026-07-19T00:00:00Z",
        evidence: [{ kind: "test", ref: "test:topology", evidence_class: "observed" }],
      });
    }
  }
  for (const edge of topology.edges) {
    for (const requirement of edge.required_feasibility) {
      observations.push({
        schema: TOPOLOGY_FEASIBILITY_SCHEMA,
        id: `observation:${edge.id}:${requirement}`,
        topology_id: topology.id,
        subject: { kind: "edge", id: edge.id },
        requirement,
        status: edge.id === "c2" && requirement === "network-reachable" ? "infeasible" : "feasible",
        owner: edge.feasibility_authority,
        validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
        observed_at: "2026-07-19T00:00:00Z",
        evidence: [{ kind: "test", ref: "test:topology", evidence_class: "observed" }],
        reason_code: edge.id === "c2" ? "cloudflare-network-unreachable" : undefined,
      });
    }
  }
  const result = evaluateExecutionTopologyFeasibility(topology, observations);
  assert.equal(result.status, "infeasible");
  assert.deepEqual(
    result.failures.map(({ subject, requirement, reason_code }) => ({ subject, requirement, reason_code })),
    [{ subject: { kind: "edge", id: "c2" }, requirement: "network-reachable", reason_code: "infeasible-component" }],
  );
});

test("foreign feasibility observations cannot speak for another Site", () => {
  const topology: ExecutionTopology = clone(LOCAL_EXECUTION_TOPOLOGY);
  const client = topology.nodes[0];
  const result = evaluateExecutionTopologyFeasibility(topology, [{
    schema: TOPOLOGY_FEASIBILITY_SCHEMA,
    id: "observation:foreign",
    topology_id: topology.id,
    subject: { kind: "node", id: client.id },
    requirement: client.required_feasibility[0],
    status: "feasible",
    owner: { site_id: "site:foreign", locus: "execution-site", authority_ref: "authority:foreign" },
    validity: {},
    observed_at: "2026-07-19T00:00:00Z",
    evidence: [{ kind: "test", ref: "test:foreign", evidence_class: "synthetic-correlation" }],
  }]);
  assert.ok(result.diagnostics.some(({ code }) => code === "feasibility-authority-mismatch"));
  assert.ok(result.failures.some(({ reason_code }) => reason_code === "invalid-observation"));
});

test("topology diagnostics are admission failures even when observations look feasible", () => {
  const topology = clone(LOCAL_EXECUTION_TOPOLOGY);
  topology.route.edge_ids[0] = "edge:missing";
  const observations = topology.nodes.flatMap((node) => node.required_feasibility.map((requirement) => ({
    schema: TOPOLOGY_FEASIBILITY_SCHEMA,
    id: `observation:${node.id}:${requirement}`,
    topology_id: topology.id,
    subject: { kind: "node" as const, id: node.id },
    requirement,
    status: "feasible" as const,
    owner: node.feasibility_authority,
    validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
    observed_at: "2026-07-19T00:00:00Z",
    evidence: [{ kind: "test" as const, ref: "test:topology", evidence_class: "observed" as const }],
  })));
  const result = evaluateExecutionTopologyFeasibility(topology, observations);
  assert.equal(result.status, "infeasible");
  assert.ok(result.diagnostics.some(({ code }) => code === "disconnected-route"));
});

test("synthetic correlation is explicit and cannot satisfy a feasible component", () => {
  const topology = clone(LOCAL_EXECUTION_TOPOLOGY);
  const node = topology.nodes[0];
  const result = evaluateExecutionTopologyFeasibility(topology, [{
    schema: TOPOLOGY_FEASIBILITY_SCHEMA,
    id: "observation:synthetic-only",
    topology_id: topology.id,
    subject: { kind: "node", id: node.id },
    requirement: node.required_feasibility[0],
    status: "feasible",
    owner: node.feasibility_authority,
    validity: { fresh_as_of: "2026-07-19T00:00:00Z" },
    observed_at: "2026-07-19T00:00:00Z",
    evidence: [{ kind: "run", ref: "correlation:synthetic", evidence_class: "synthetic-correlation" }],
  }]);
  assert.equal(result.status, "infeasible");
  assert.ok(result.diagnostics.some(({ code }) => code === "invalid-feasibility-evidence"));
  assert.ok(result.failures.some(({ reason_code }) => reason_code === "invalid-observation"));
});

test("malformed feasibility observations fail closed", () => {
  const topology = clone(LOCAL_EXECUTION_TOPOLOGY);
  const node = topology.nodes[0];
  const result = evaluateExecutionTopologyFeasibility(topology, [{
    schema: "wrong-schema" as never,
    id: "observation:malformed",
    topology_id: topology.id,
    subject: { kind: "node", id: node.id },
    requirement: node.required_feasibility[0],
    status: "not-a-status" as never,
    owner: node.feasibility_authority,
    validity: {},
    observed_at: "not-a-timestamp",
    evidence: [{ kind: "test", ref: "test:topology", evidence_class: "observed" }],
  }]);
  assert.equal(result.status, "infeasible");
  assert.ok(result.diagnostics.some(({ code }) => code === "invalid-feasibility-observation"));
  assert.ok(result.failures.some(({ reason_code }) => reason_code === "invalid-observation"));
});
