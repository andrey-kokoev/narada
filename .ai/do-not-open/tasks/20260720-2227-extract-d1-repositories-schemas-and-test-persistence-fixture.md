---
status: closed
depends_on: [2222, 2226]
criteria_proved_by: operator
criteria_proved_at: 2026-07-21T01:02:27.342Z
criteria_proof_verification:
  state: unbound
  rationale: MCP surfaces unavailable; evidence was collected through the repository task CLI, PowerShell, local persistence tests, the full carrier suite from the reviewed dependency, deployment checks, and authenticated live D1 readback.
closed_at: 2026-07-21T01:06:57.950Z
closed_by: 019f7e38-2b97-7610-8d9c-d30e1b505f3d
governed_by: task_close:019f7e38-2b97-7610-8d9c-d30e1b505f3d
closure_mode: peer_reviewed
---

# Extract D1 repositories, schemas, and test persistence fixtures

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260720-2223-2229-cloudflare-carrier-organization.md

## Goal

Give each persistence-backed bounded context an explicit repository/schema owner and remove the giant handwritten SQL interpreter from the core carrier test.

## Context

D1 schema creation, SQL statements, row formatting, and product persistence are distributed through the Worker, while the 10k-line carrier test contains a second handwritten database implementation.

## Required Work

1. Group migrations and schema initialization by persistence domain with one repository interface per bounded context.
2. Move D1 reads/writes and row normalization out of the Worker routing module.
3. Replace the monolithic SQL-string test double with reusable repository fixtures or a contract-tested D1-compatible harness.
4. Keep production D1 schema and local test persistence behavior aligned through shared repository contracts.
5. Add persistence contract tests for idempotency, ordering, projections, and readback evidence.

## Non-Goals

- Do not change table names or persisted record schemas without a separate migration decision.
- Do not remove live D1 verification.
- Do not make tests depend on implementation-private SQL parsing.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification


- node --test src/cloudflare-persistence-registry.test.mjs src/cloudflare-d1-task-store-adapter.test.mjs: 5/5 passed; all 38 DDL tables owned; 12 repositories exposed; SQLite/fixture semantics equivalent
- pnpm --filter @narada2/cloudflare-carrier test: 768/768 passed
- pnpm --filter @narada2/cloudflare-carrier deploy:check: ok; worker D1 table coverage=38
- authenticated canonical live smoke: ok; live D1 task create/update/list persistence readback completed
## Acceptance Criteria

- [x] Every persistence domain has a named repository/schema owner.
- [x] The core carrier test no longer contains a broad handwritten SQL interpreter.
- [x] Local fixtures and live D1 readbacks prove equivalent persistence semantics.
- [x] All persistence, carrier, and workflow tests pass.
