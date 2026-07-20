---
number: 2202
governed_by: unknown
status: deferred
tags: integration-gate, invokable-intelligence, ontology-remediation, parallelism, scope-coherence, superseded, task-graph
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2219@v1
creation_payload_sha256: e72538f00c86a8d58a54137ce772004f82eab98de12304d828eb6861ac0df59d
idempotency_key: invokable-intelligence-remediation-source-2219-narada-proper-v1
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"D:\\code\\narada","correlation_key":"user-site-task-2219"}
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

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] All eight remediation outcomes are reflected in authoritative task specifications and dependencies.
- [ ] No task combines unrelated migration, management, materialization, runtime, and acceptance ownership.
- [ ] The graph exposes all safe parallelism and contains no cycle or dependency on conversational state.
- [ ] Every task has the correct destination Site/repository binding and one clear verification owner.
- [ ] Authoritative chapter inspection shows one coherent path from contracts to local/Cloudflare integration and final cutover.
