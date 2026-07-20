---
number: 2216
governed_by: dependencies
status: closed
tags: cross-locus, d1, invokable-intelligence, materialization, sqlite
creation_payload_ref: mcp_payload:invokable-intelligence-materialization-adapters-v2@v1
creation_payload_sha256: 21b42942cd9921205e4347626babb704ead915e5645edfa2dc83568cec7548f8
idempotency_key: invokable-intelligence-materialization-adapters-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"invokable-intelligence-materialization-adapters-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T19:16:33.981Z
---

# Implement SQLite, D1, and request-scoped materialization adapters

## Goal

Realize the governed materialization contract in portable storage and resolver acquisition without multi-master synchronization.

## Context

Consumes remediation outcomes #2204, #2206, and #2207. This task owns durable SQLite/D1 projection persistence and signed request-scoped verification; management surfaces and runtimes consume it.

## Required Work

Implement the portable projection/audit tables and store interface for node:sqlite and Cloudflare D1.
Implement destination admission, idempotent materialize/refresh, conflict rejection, supersession, revocation, expiry, and scoped resolver acquisition.
Implement request/destination/digest-bound signed context verification behind a runtime-neutral verifier interface.
Preserve origin authority and source revision in every projection and audit event.
Add cross-adapter conformance tests including stale, revoked, conflicting, unauthorized, and replayed envelopes.

## Non-Goals

Do not add ambient database synchronization.
Do not transfer origin authority to destination storage.
Do not transport raw secret values.
Do not own operator CLI/MCP presentation.

## Execution Notes


Implemented a dedicated runtime-neutral materialization package over one portable SQL contract, with concrete node:sqlite and Cloudflare D1 adapters. Destination admission, idempotent materialize/refresh, guarded concurrent updates, explicit supersession, origin-authorized revocation, resolver acquisition, and queryable audit readback preserve origin authority and source revision. Request-scoped verification signs the canonical request/destination/statement/scope/validity/provenance/authorization/verifier binding. Review hardening added adapter-store locus enforcement, authorization revalidation at resolver acquisition, malformed-kind rejection without crashes, structural/temporal admission and revocation checks, and original-transition reuse for idempotent responses. No ambient synchronization, authority transfer, payload values, or secrets were introduced.

## Verification


Governed focused evidence: contract package tests passed (run_1784488423821_dgjehn); SQLite/D1 shared conformance and cryptographic binding tests passed 5/5 (run_1784488433303_xxmne1); both packages typechecked (run_1784488444695_99im9p); both packages built with authoritative tsc (run_1784488468093_d501wm). The verification suggestion emitted a Vitest command for a native node:test file; its inner seven tests passed but Vitest correctly reported no Vitest suite, so authoritative package scripts were used. Repository-wide pnpm verify remains pre-gate-blocked by unrelated pre-existing forbidden derivative task file .ai/do-not-open/tasks/20260719-2150-mark-v1-agent-roster-projection-superseded.md; task-scoped code checks all pass.

## Acceptance Criteria

- [x] SQLite and D1 pass one materialization conformance suite.
- [x] Idempotent replay is harmless; conflicting same-revision and stale refreshes are rejected.
- [x] Revoked, expired, unauthorized, and out-of-scope projections cannot enter resolver inputs.
- [x] Signed request context is bound to request, destination, digest, validity, and verifier key.
- [x] Audit readback explains origin, destination admission, refresh/supersession, and revocation.
