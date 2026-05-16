---
status: closed
depends_on: [1379]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T16:36:51.080Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-16T16:36:51.605Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Implement hosted registry message exchange and receipts

## Chapter

Cloudflare hosted Site Registry projection

## Goal

Implement hosted message-leaving and receipt/finalization flow without making the registry canonical inbox authority.

## Context

Staccato's Worker implements POST /api/inbox/messages, pending D1 rows, GET pending messages, finalize admitted/rejected/error, and durable receipts. Narada has @narada2/site-inbox remote message exchange contracts that preserve local Site admission authority.

## Required Work

1. Implement hosted message submit/list/detail/receipt/finalize routes using Narada remote exchange contracts. 2. Store pending remote messages and message events in D1 with source + idempotency uniqueness. 3. Require separate submit, poll, and finalize capabilities. 4. Ensure finalized admitted rows only reference local admission evidence and never self-admit into a Site inbox. 5. Add tests for submit, duplicate retry count, pending poll, admitted/rejected/error finalize, receipts, audit rows, and raw-secret redaction.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Implemented hosted remote message exchange routes in `packages/site-registry-cloudflare` using `@narada2/site-inbox` remote message, local admission plan, finalize payload, and receipt contracts. Added submit, pending list, detail, receipt, and finalize routes with separate submit, poll, and finalize bearer capabilities.

Remote messages are stored as hosted pending state in D1 with source/idempotency uniqueness and retry count updates on duplicate submit. Message events are stored separately for submitted, duplicate, and finalized transitions. Finalized admitted receipts only reference local admission evidence; the Worker response explicitly records `local_inbox_mutated=false`.

Expanded the D1 migration for remote message and message event tables. Updated tests with fake D1 coverage for submit, capability separation, duplicate retry count, pending poll with local admission plan, admitted/rejected/error finalization, receipt projection, audit rows, and raw-secret refusal/redaction.

## Verification

- `pnpm install` passed.
- `pnpm --filter @narada2/site-inbox build` passed.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 1 test file, 18 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Hosted message exchange is implemented as remote pending state, not canonical inbox admission.
- [x] Receipts distinguish cloud receipt from local admission/rejection/error evidence.
- [x] Tests prove idempotency, capability separation, receipt projection, and no local inbox mutation.
