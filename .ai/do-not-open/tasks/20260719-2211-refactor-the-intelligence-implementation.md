---
number: 2211
governed_by: dependencies
status: closed
tags: integration-gate, invokable-intelligence, ontology-remediation, parallelism, scope-coherence, task-graph
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2219@v2
creation_payload_sha256: 09a89f7f7257de04a8b3e6092a9d9291cf102dd590d07d9eb4c05da9d35e4d82
idempotency_key: invokable-intelligence-remediation-source-2219-narada-proper-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"user-site-task-2219-narada-proper-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T18:10:26.886Z
---

# Refactor the intelligence implementation task graph

## Goal

Integrate the eight remediation contracts into the implementation chapter, split oversized scopes, and expose safe parallel work without weakening dependency gates.

## Context

Destination-side materialization of User Site task #2219. The current graph serializes contracts -> storage -> resolver -> management/migration before either runtime, while the management task combines migration, CLI, MCP, compatibility, and cross-locus materialization. This task is the integration gate before the original implementation chapter becomes actionable.

Source authority: User Site task #2219.
Destination authority: Narada proper Site, D:\code\narada.

## Required Work

Read the admitted outcomes of the eight remediation tasks and update the original chapter specifications through lifecycle-authorized surfaces.
Split oversized work into independently closable catalog migration, management API/CLI/MCP, compatibility projection, and cross-locus materialization tasks where warranted.
Separate true prerequisite dependencies from work that can proceed in parallel after stable contracts.
Assign each live-E2E obligation to one platform task and make final cutover aggregate evidence rather than duplicate implementation.
Preserve the local and Cloudflare parallel branch and make final cutover wait on all authoritative migration/runtime outcomes.
Produce an acyclic chapter readback showing repository routing, actionable roots, parallel branches, and terminal acceptance.

## Non-Goals

Do not remove a dependency merely to increase concurrency.
Do not leave duplicate active tasks for superseded scopes.
Do not claim ontology implementation completion in this task.

## Execution Notes



Created authoritative Narada-proper chapter invokable-intelligence-implementation-v2 with tasks #2212–#2219. Split prototype admission, catalog migration, management surfaces, compatibility projection, materialization adapters, local runtime, Cloudflare runtime, and final cutover into distinct owners. Declared explicit outcome-contract edges so all remediation tasks #2203–#2210 are machine-represented. Closed bridge #2212 after reconciling User Site #2183 outcome and commit. Preserved active User Site #2184 with a durable no-duplicate guard on #2217; tagged and deferred obsolete unclaimed User tasks #2185/#2186 with replacement lineage.

## Follow-Up Ledger

- created #2212: governed admission bridge for the completed User Site management prototype; completed with admitted outcome.
- created #2213: canonical catalog migration and seed ownership.
- created #2214: management API, CLI, and MCP application-service boundary.
- created #2215: bounded compatibility projection, telemetry, and zero-consumer proof.
- created #2216: SQLite, D1, and request-scoped materialization adapters.
- created #2217: local runtime integration and the sole local live-E2E journey.
- created #2218: Cloudflare runtime integration and the sole authenticated Cloudflare live-E2E journey.
- created #2219: final cutover and aggregate acceptance without duplicate platform journeys.

## Verification



Chapter MCP readback reports eight ordered members, all bound to D:\code\narada. A dependency-graph audit produced topological order 2212,2213,2214,2215,2216,2217,2218,2219 with no cycle. Every remediation number 2203–2210 appears as a satisfying dependency edge. #2213–#2216 are the safe parallel roots after completed bridge #2212; #2217/#2218 converge only after catalog and materialization; #2219 aggregates management, compatibility, and both runtimes. Task specifications assign live E2E ownership once per platform (#2217 local, #2218 Cloudflare) and make #2219 aggregate evidence only.

## Acceptance Criteria

- [x] All eight remediation outcomes are reflected in authoritative task specifications and dependencies.
- [x] No task combines unrelated migration, management, materialization, runtime, and acceptance ownership.
- [x] The graph exposes all safe parallelism and contains no cycle or dependency on conversational state.
- [x] Every task has the correct destination Site/repository binding and one clear verification owner.
- [x] Authoritative chapter inspection shows one coherent path from contracts to local/Cloudflare integration and final cutover.
