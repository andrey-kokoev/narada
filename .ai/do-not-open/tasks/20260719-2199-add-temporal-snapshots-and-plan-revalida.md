---
number: 2199
governed_by: unknown
status: deferred
tags: batch, invokable-intelligence, ontology-remediation, revalidation, snapshot, superseded, temporal-policy
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2216@v1
creation_payload_sha256: d32f3d7074f5f69737e8b6d8797e8db9a8bf265b47697b0f0281557075b7f832
idempotency_key: invokable-intelligence-remediation-source-2216-narada-proper-v1
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"D:\\code\\narada","correlation_key":"user-site-task-2216"}
---

# Add temporal snapshots and plan revalidation semantics

## Goal

Make off-peak, batch, availability, quota, and mutable-policy decisions reproducible and safe between resolution and execution.

## Context

Destination-side materialization of User Site task #2216. Provenance does not by itself establish that a plan is still valid. Plans may queue, retry, cross a pricing window, outlive a capability observation, or encounter changed policy. Resolution needs explicit time inputs, immutable decision snapshots, and revalidation rules.

Source authority: User Site task #2216.
Destination authority: Narada proper Site, D:\code\narada.

## Required Work

Add resolved_at, catalog/policy/assertion revision digests, normalized resolver-input digest, resolver version, valid_until, and revalidation triggers to InvocationPlan.
Define authoritative clock/time-zone handling for temporal policies and deterministic tests.
Define plan validity for immediate, queued batch, delayed, retried, and resumed attempts.
Specify when an attempt reuses a plan, revalidates it, or creates a new plan linked to the same intent.
Persist immutable or content-addressed referenced revisions needed to explain historical decisions.
Add structured stale-plan and re-resolution evidence.

## Non-Goals

Do not make wall-clock reads implicit in deterministic resolver logic.
Do not assume a successful plan remains valid indefinitely.
Do not mutate historical plan snapshots when catalog or policy records change.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Every plan identifies its decision time, input/snapshot digests, resolver version, validity boundary, and revalidation conditions.
- [ ] Historical plans remain explainable after source records are superseded.
- [ ] Queued, off-peak, retry, restart, and policy-change tests have deterministic expected behavior.
- [ ] Execution refuses or re-resolves an expired or invalidated plan before provider invocation.
- [ ] Attempt lineage distinguishes plan reuse from re-planning.
