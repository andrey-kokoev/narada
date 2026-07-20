---
number: 2208
governed_by: unknown
status: closed
tags: batch, invokable-intelligence, ontology-remediation, revalidation, snapshot, temporal-policy
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2216@v2
creation_payload_sha256: 5a4b35b0e3c370ed0c1b473b284297a1794d53f7e59431d9809ab07037e3c5b0
idempotency_key: invokable-intelligence-remediation-source-2216-narada-proper-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"user-site-task-2216-narada-proper-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T17:38:15.314Z
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


Implemented explicit authoritative clock inputs with timezone/local fields, content-addressed catalog/policy/assertion/topology/access digests, immutable revision references, plan validity boundaries, queued/delayed/retry/resume triggers, plan-use decisions, stale-plan refusal/replan semantics, revalidation evidence, plan/attempt lineage, and deterministic off-peak windows without implicit wall-clock reads.

## Verification


Package typecheck passed (structured_command_execution:e_2ba2c27919424b1898931f34). Five focused temporal tests passed (structured_command_execution:e_79f62260284b4fb0a56f693d), including immediate reuse, queued/retry/resume revalidation, policy/expiry refusal, overnight off-peak evaluation, and replacement lineage.

## Acceptance Criteria

- [x] Every plan identifies its decision time, input/snapshot digests, resolver version, validity boundary, and revalidation conditions.
- [x] Historical plans remain explainable after source records are superseded.
- [x] Queued, off-peak, retry, restart, and policy-change tests have deterministic expected behavior.
- [x] Execution refuses or re-resolves an expired or invalidated plan before provider invocation.
- [x] Attempt lineage distinguishes plan reuse from re-planning.
