---
number: 2221
governed_by: dependencies
status: closed
tags: completion-audit, documentation, invokable-intelligence, ontology, tests
creation_payload_ref: mcp_payload:ii-contract-completion-audit@v1
creation_payload_sha256: 88587b9325370421be517a09c2679b33a898297c456a5b0c64fcb60bf32d9048
idempotency_key: invokable-intelligence-contract-completion-audit-20260719
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"invokable-intelligence-contract-completion-audit"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T18:18:08.293Z
---

# Complete invokable-intelligence contract package audit

## Goal

Make the contract package's default verification and documentation cover the complete nine-incoherence remediation surface.

## Context

Tasks #2203–#2211 are closed, but completion audit found that package.json still ran only test/index.test.ts and README described only the original v1 ontology. This bounded audit owns only verification discoverability and package documentation.

## Required Work

Update the package test script so pnpm test executes every test/*.test.ts suite on Windows and Unix-compatible shells.
Update README to describe model offerings and executable routes, authority and cross-locus materialization, explicit topology and temporal snapshots, pre-ranking access gates, and separated results/outcomes/evidence/telemetry.
Run package test, typecheck, and build and record exact results.

## Non-Goals

Do not change ontology semantics, resolver behavior, storage adapters, runtime integrations, or unrelated packages.
Do not commit or push unrelated dirty work.

## Execution Notes


Changed the package test script from the single original index suite to test/*.test.ts, matching the repository's cross-platform Node test-runner convention and exercising all eight contract test files. Updated README from the original provider/model and Intent-to-Evidence summary to the current top-level contract: model offerings and executable routes, scoped capability composition, authority matrix, cross-locus materialization, explicit topology, temporal snapshots, pre-ranking access gates, and separated attempt/result/outcome/observation/evidence/telemetry.

## Follow-Up Ledger

- no follow-up needed: this bounded audit changed only verification discovery and package documentation; semantic implementation remains owned by the closed remediation tasks and the implementation-v2 chapter.

## Verification


Focused package verification passed through structured-command MCP: pnpm test executed test/*.test.ts with 43 tests, 43 passed, 0 failed (execution e_c0dd41f41444402a8b1a99b1); pnpm typecheck passed (e_2b8ceaa7a15b446db4e4575b); pnpm build passed (e_1860437d0d8844049d7b4a69). Filesystem MCP readback confirmed all obsolete README phrases absent and all required surface headings/terms present. Git MCP path-scoped diff contains exactly README.md and package.json.

## Acceptance Criteria

- [x] The package test script executes all contract test files and the run reports all 43 tests passing.
- [x] README no longer presents the original five-resource/provider-model factorization or old Attempt-to-Evidence chain as the complete current contract.
- [x] README names the new authority, materialization, offering/route, topology, temporal, access, and outcomes surfaces.
- [x] Package typecheck and build pass.
- [x] Only package.json and README.md are changed by this audit task.
