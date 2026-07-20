---
number: 2195
governed_by: unknown
status: deferred
tags: cross-locus, d1, invokable-intelligence, materialization, ontology-remediation, sqlite, superseded
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2212@v1
creation_payload_sha256: fca2da1e007360b6c31a3293a72da4000c29d83026ada7a9be439265679b5dcc
idempotency_key: invokable-intelligence-remediation-source-2212-narada-proper-v1
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"D:\\code\\narada","correlation_key":"user-site-task-2212"}
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

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A Cloudflare resolver can obtain admitted target/User/execution-locus inputs through a documented durable or request-scoped path.
- [ ] Every projected fact remains linked to origin authority, revision, scope, validity, and destination admission evidence.
- [ ] Revoked, expired, stale, conflicting, or unauthorized projections are rejected or excluded with structured reasons.
- [ ] SQLite and D1 tests prove idempotent materialization, refresh, supersession, revocation, and conflict handling.
- [ ] No design path assumes that each logical Site is simultaneously authoritative in both SQLite and D1.
