---
number: 2209
governed_by: dependencies
status: closed
tags: authorization, entitlement, governance, invokable-intelligence, ontology-remediation, quota
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2217@v2
creation_payload_sha256: d1023443b5511e6429bab130b8d1b915d616c3431a93df66d4806a18ec017d92
idempotency_key: invokable-intelligence-remediation-source-2217-narada-proper-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"user-site-task-2217-narada-proper-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T17:53:20.548Z
---

# Model principal access, entitlements, quota, and governance

## Goal

Ensure route feasibility requires authorized use of an account and service, not merely the presence of a credential locator.

## Context

Destination-side materialization of User Site task #2217. Credential existence, secret availability, principal authorization, account entitlement, quota, budget, data residency, retention policy, and current usability are distinct facts with different owners and freshness. The resolver must not select an available credential that the invoking principal may not use.

Source authority: User Site task #2217.
Destination authority: Narada proper Site, D:\code\narada.

## Required Work

Define account/tenant, credential reference, secret transport, principal or workload identity, access grant, entitlement, quota, budget, and data-governance constraints.
Define ownership, scope, validity, revocation, and evidence requirements for each authorization/feasibility concept.
Require candidate routes to prove authorization and governance eligibility before ranking.
Keep secret values outside ontology, plan, logs, and evidence while preserving locator/grant provenance.
Define structured refusal reasons for missing secret, unauthorized principal, expired grant, exhausted quota, budget denial, and governance mismatch.
Add local and Cloudflare fixtures with shared credentials but different principal entitlements.

## Non-Goals

Do not persist secret material in SQLite, D1, plans, or evidence.
Do not infer authorization from successful authentication alone.
Do not reduce budget, quota, or data-governance policy to generic model preferences.

## Execution Notes


Implemented separate service account, principal/workload identity, credential binding/secret transport handle, access grant with principal consent, service entitlement, quota observation, budget authorization, and data-governance requirement contracts. Added a route eligibility gate with typed refusal/provenance for account, secret presence/usability, unauthorized/expired/revoked grants, entitlement, quota, budget, region, retention, classification, and provider-training mismatches. Added recursive raw-secret field detection.

## Verification


Contract typecheck passed (structured_command_execution:e_197c36b7fba6462c9d886078). Five focused access tests passed (structured_command_execution:e_611d7cb1b0b9440097d5e9c8), covering complete eligibility, shared credential/different principal, unusable credential and revoked grant, independent quota/budget/governance refusals, and secret-field exclusion.

## Acceptance Criteria

- [x] Credential presence, credential usability, principal authorization, account entitlement, and policy eligibility are separately represented.
- [x] No route is eligible without a valid grant for the invoking principal/workload and required governance conditions.
- [x] Quota, budget, region, and retention constraints produce typed, explainable outcomes.
- [x] Revoked grants and exhausted entitlements invalidate or revalidate plans according to temporal semantics.
- [x] Diagnostics and persistence are demonstrably secret-safe.
