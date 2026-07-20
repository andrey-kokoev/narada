---
number: 2213
governed_by: dependencies
status: closed
tags: catalog, d1, invokable-intelligence, migration, sqlite
creation_payload_ref: mcp_payload:invokable-intelligence-catalog-migration-v2@v1
creation_payload_sha256: 734d719f8ad80868b8b1b66e3c06620dd176cdd15f6ac9951e39a6c103be3828
idempotency_key: invokable-intelligence-catalog-migration-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"invokable-intelligence-catalog-migration-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T18:51:55.672Z
---

# Extract canonical intelligence catalog migration and seed ownership

## Goal

Own only deterministic migration from legacy selection inputs into canonical v2 resources, offerings, authority statements, access records, and seed data.

## Context

Consumes the admitted prototype bridge task #2212 and remediation outcomes #2204-#2210. This task separates migration/seed authority from management surfaces, compatibility projection, materialization transport, and runtime integration.

## Required Work

Inventory legacy provider/model/default inputs and map each to a typed canonical v2 record without provider/model identity collapse.
Extend migration for model offerings, execution routes/topology references, authority statement kinds, access/entitlement records, and temporal snapshot inputs.
Provide deterministic dry-run diff, idempotent apply, source revision/provenance, and rollback-safe diagnostics.
Seed both node:sqlite and D1 through the portable registry contract using identical canonical fixtures where topology permits.
Reject ambiguous or authority-escalating legacy inputs and record migration residuals.

## Non-Goals

Do not own CLI/MCP presentation.
Do not own legacy compatibility reads.
Do not integrate local or Cloudflare invocation runtimes.
Do not copy raw secret values.

## Execution Notes


Added a top-level canonical catalog envelope/seed contract carrying source schema/reference/revision/digest, authority kind/locus/ref, immutable catalog revision, and validation evidence. Upgraded the portable registry schema to v2 with canonical record and residual tables plus atomic seed admission that validates nested resources, offering graphs, routes/topology, authority statements, temporal clocks, and secret exclusion before mutation. Reworked legacy migration into a stable-key SHA-256 deterministic plan with publisher-scoped model identity, distinct inference providers/model providers/models/offerings/endpoints/adapters, explicit local topology and route candidates, service accounts, credential locators, target defaults resolved to offerings/routes, observed authority statements, temporal input, and structured residuals. Legacy runtime-selection env names are retained only as non-authoritative residual evidence; raw secrets, ambiguous model publishers/defaults, and unauthorized grant inference are rejected. Missing grants are not fabricated: routes reference the required grant and remain ineligible pending separately authorized access materialization.

## Verification


Post-fix focused verification: contract build passed (structured_command_execution:e_5979966d42574a3884e248e8); registry build passed (structured_command_execution:e_58d3ff4b089d4516b09e672e); management build passed (structured_command_execution:e_8b679b29c1dd475faecf4b29). Typechecks passed for contract (e_fa08a09a07bc492f976b528e), registry (e_f111da4e1cbc4892abda89bc), and management (e_7c400b87350d4fe7ac5fa08b). Tests passed: contract 45/45 (e_d1466380f85a4ee682d470d7), registry 19/19 across node:sqlite and fake D1 plus semantic parity (e_00d2b1d468564621a9dcac78), management 8/8 including deterministic dry-run, idempotency, provenance, distinct identity mapping, SQLite/D1 identical admission, and structured secret/ambiguity/authority residuals (e_ae6719ade44d4141a993dab6).

## Acceptance Criteria

- [x] Dry-run output is deterministic and applying the same source twice is idempotent.
- [x] Every migrated record has source/provenance, authority kind/locus, revision, and validation evidence.
- [x] Representative legacy inputs produce distinct model, model provider, inference provider, offering, endpoint, adapter, credential locator, account/access, and default records.
- [x] SQLite and D1 conformance tests accept the same canonical migration operations.
- [x] Ambiguous, secret-bearing, or cross-locus-escalating inputs are rejected with structured residuals.
