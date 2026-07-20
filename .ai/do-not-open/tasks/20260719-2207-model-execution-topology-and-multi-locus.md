---
number: 2207
governed_by: unknown
status: closed
tags: cloudflare, execution-topology, feasibility, invokable-intelligence, local-runtime, ontology-remediation
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2215@v2
creation_payload_sha256: f1379ee6fd93c1ae5bf23c636b339512bbba6575697e7c7237467b0430de4b98
idempotency_key: invokable-intelligence-remediation-source-2215-narada-proper-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"user-site-task-2215-narada-proper-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T17:35:15.989Z
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


Implemented typed client, launcher, carrier, runtime, adapter, inference-service, and endpoint nodes; selected route edges; process/trust/network/account/Site boundaries; component-scoped feasibility requirements; and explicit feasibility authority Sites. Added structural validation and exact node/edge elimination explanations. Added structurally distinct local and Cloudflare fixtures.

## Verification


Package typecheck passed (structured_command_execution:e_442314abcacd429bbba63357). Four focused topology tests passed (structured_command_execution:e_bcc55f13aee04ccfb968e453), covering local/Cloudflare route differences, missing loci, disconnected routes, exact boundary failure, and foreign authority rejection.

## Acceptance Criteria

- [x] Local and Cloudflare invocations produce explicit, structurally different execution topologies under one contract.
- [x] Feasibility facts attach to the responsible topology node or edge and preserve owning Site/locus.
- [x] Resolver explanations identify the exact infeasible component or boundary.
- [x] Equivalent-input tests compare resolver semantics rather than demanding identical real-world plans across different topologies.
- [x] Schemas reject routes with missing execution loci or impossible role assignments.
