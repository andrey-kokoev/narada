---
number: 2214
governed_by: dependencies
status: closed
tags: cli, invokable-intelligence, management, mcp
creation_payload_ref: mcp_payload:invokable-intelligence-management-surfaces-v2@v1
creation_payload_sha256: 55c7440003bc433f571b9be7f4655ebbd30c5137d64e64b46724527841c53dc4
idempotency_key: invokable-intelligence-management-surfaces-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"invokable-intelligence-management-surfaces-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T19:47:24.229Z
---

# Implement intelligence management API, CLI, and MCP surfaces

## Goal

Provide one governed management application service projected consistently through library, CLI, and MCP interfaces.

## Context

Consumes bridge task #2212 and stable v2 contracts. Management owns operator-visible list/show/validate/mutate/explain commands but not migration mechanics, compatibility semantics, materialization storage, or runtime invocation.

## Required Work

Define one application-service boundary for resource, offering, assertion, authority policy, access, topology, and resolution explanation operations.
Project the service through CLI and MCP with equivalent structured inputs, outputs, errors, paging, and evidence references.
Add materialize, inspect, refresh, revoke, reject, and explain commands that call the dedicated materialization authority rather than writing foreign loci directly.
Enforce target Site, principal consent, secret redaction, and mutation evidence at the service boundary.
Add contract and end-to-end command tests for read, valid mutation, refusal, and explanation paths.

## Non-Goals

Do not implement legacy migration.
Do not own compatibility projection.
Do not directly mutate D1/SQLite outside the registry/materialization interfaces.
Do not select or invoke intelligence.

## Execution Notes


1. One service owns structured management semantics for catalog, policy, access, topology, explanation, and materialization.
2. Every mutation requires authority locus, actor, principal consent, destination Site, target Site, explicit decision time, and evidence refs and returns a receipt.
3. Direct foreign-locus writes are refused; cross-locus effects delegate to canonical materialization operations.
4. Secret-bearing inputs and outputs are refused; CLI and MCP accept immutable payload references.
5. Tests cover list/show/validate/admit/explain, paging, refusals, every materialization operation, idempotency, CLI/MCP equivalence, and D1 parity.
6. Removed the unused LegacyDirectRecord and related convenience exports. Pre-existing one-time migration removal remains explicitly owned by #2215.

## Verification


1. PASS structured_command_execution:e_6bad8eb686504cffb0b0afae — package tests 11/11.
2. PASS structured_command_execution:e_db33cdebc6b645d38df89389 — typecheck.
3. PASS structured_command_execution:e_3e05d88744fe4ca288b09c34 — build.
4. PASS TIZ run_1784490142629_17qrk0 — package tests 11/11 before final dead type-export removal; current direct rerun supersedes it.
5. VERIFIER MISMATCH run_1784490114441_ch16hk — generated Vitest selector is incompatible with this native node:test/node:sqlite package and is not claimed as product proof.
6. Independent worker-delegation review could not start because its loaded runtime reported worker_implementation_stale; integrated independent review remains required by terminal #2219.

## Acceptance Criteria

- [x] Library, CLI, and MCP projections expose the same governed operation semantics and structured errors.
- [x] All mutation operations identify authority locus, actor, destination, and admitted evidence.
- [x] Cross-locus writes are routed through materialization and direct foreign-locus mutation is refused.
- [x] Secret material never appears in command arguments, output, logs, or evidence.
- [x] Focused tests cover list/show/validate/mutate/explain and every materialization operation.
