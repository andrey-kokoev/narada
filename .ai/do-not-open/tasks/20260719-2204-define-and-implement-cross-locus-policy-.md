---
number: 2204
governed_by: dependencies
status: closed
tags: cross-locus, d1, invokable-intelligence, materialization, ontology-remediation, sqlite
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2212@v2
creation_payload_sha256: 5e6a75a54e15244d8a359b382bd7116b5fe441049b4beec6836c24d042d475b2
idempotency_key: invokable-intelligence-remediation-source-2212-narada-proper-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"user-site-task-2212-narada-proper-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T17:45:40.154Z
---

# Define and implement cross-locus policy materialization

## Goal

Provide an explicit, auditable path by which target-, User-, and execution-locus facts become available to local and Cloudflare resolvers without implicit synchronization or authority collapse.

## Context

Destination-side materialization of User Site task #2212. Separate SQLite and D1 embodiments do not explain how a remote carrier receives authorized User preferences or execution feasibility. The design requires explicit materialization: origin authority remains identifiable, destination admission is separate, and stale or revoked projections cannot silently remain effective.

Source authority: User Site task #2212.
Destination authority: Narada proper Site, D:\code\narada.

## Required Work

Define a versioned materialization envelope carrying origin Site/locus, subject, source revision, payload digest, allowed purpose/scope, issued/expiry times, provenance, and revocation/supersession references.
Define authorization, destination admission, idempotency, conflict, refresh, rejection, and audit semantics.
Specify local SQLite and Cloudflare D1 projection stores without introducing multi-master ownership.
Define when request-scoped signed context is permitted instead of durable projection and how it is verified.
Provide CLI/MCP operations and fixtures for materialize, inspect, refresh, revoke, reject, and explain.
Integrate the protocol into resolver input acquisition contracts.

## Non-Goals

Do not implement ambient bidirectional database synchronization.
Do not copy secret values or transfer authority merely by copying rows.
Do not let destination storage erase the origin locus.

## Execution Notes


Implemented versioned envelopes with preserved origin authority, statement kind/effect/revision, payload digest/reference, purpose/target/principal/topology scope, validity, provenance, authorization, supersession, and request signatures. Implemented destination admission, idempotent materialization, strict refresh/conflict handling, origin revocation, resolver acquisition/exclusion, portable SQLite/D1 DDL, and operation contracts for materialize/refresh/revoke/reject/inspect/explain. No payload or secret values are carried by the envelope.

## Verification


Package typecheck passed (structured_command_execution:e_704e42fb739f43238ecf7b71). Five focused materialization tests passed (structured_command_execution:e_e3ef9330ed7240eeac12a4c9), covering D1 acquisition, idempotency/refresh, authority escalation, revoked/expired/wrong-scope exclusion, and request-scoped signature binding.

## Acceptance Criteria

- [x] A Cloudflare resolver can obtain admitted target/User/execution-locus inputs through a documented durable or request-scoped path.
- [x] Every projected fact remains linked to origin authority, revision, scope, validity, and destination admission evidence.
- [x] Revoked, expired, stale, conflicting, or unauthorized projections are rejected or excluded with structured reasons.
- [x] SQLite and D1 tests prove idempotent materialization, refresh, supersession, revocation, and conflict handling.
- [x] No design path assumes that each logical Site is simultaneously authoritative in both SQLite and D1.
