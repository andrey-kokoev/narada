---
number: 2198
governed_by: unknown
status: deferred
tags: cloudflare, execution-topology, feasibility, invokable-intelligence, local-runtime, ontology-remediation, superseded
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2215@v1
creation_payload_sha256: 4b2396f25d09394d8d21b16ff5c47f92a24ab2d26a8696b5172e3140b4df53f4
idempotency_key: invokable-intelligence-remediation-source-2215-narada-proper-v1
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"D:\\code\\narada","correlation_key":"user-site-task-2215"}
---

# Model execution topology and multi-locus feasibility

## Goal

Replace the overloaded Host/PC concept with an explicit execution topology capable of representing client, launcher, carrier, adapter, inference service, and their distinct feasibility authorities.

## Context

Destination-side materialization of User Site task #2215. The desktop PC is the execution host for a local carrier but not for a Cloudflare Worker invocation. A remote route can involve several loci and boundaries. Feasibility may attach to nodes or edges and must be evaluated for the actual route.

Source authority: User Site task #2215.
Destination authority: Narada proper Site, D:\code\narada.

## Required Work

Define execution locus, process/runtime, carrier deployment, adapter locus, inference endpoint, client locus, and relevant trust/network boundaries.
Model route topology and the feasibility assertions applicable to each node and edge.
Define which Site owns observed feasibility for local PC, Cloudflare account/deployment, network path, adapter, and remote endpoint.
Update invocation intent/context and plan contracts to carry the selected execution topology.
Update resolver candidate elimination and explanation semantics for multi-locus feasibility.
Provide equivalent local and Cloudflare fixtures without pretending their Host inputs are identical.

## Non-Goals

Do not require every client device to be a model-selection authority.
Do not collapse Cloudflare, an upstream inference service, and the operator PC into one Host resource.
Do not encode topology in provider names.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Local and Cloudflare invocations produce explicit, structurally different execution topologies under one contract.
- [ ] Feasibility facts attach to the responsible topology node or edge and preserve owning Site/locus.
- [ ] Resolver explanations identify the exact infeasible component or boundary.
- [ ] Equivalent-input tests compare resolver semantics rather than demanding identical real-world plans across different topologies.
- [ ] Schemas reject routes with missing execution loci or impossible role assignments.
