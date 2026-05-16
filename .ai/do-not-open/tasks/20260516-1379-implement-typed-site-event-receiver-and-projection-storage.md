---
status: closed
depends_on: [1378]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T16:30:04.381Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-16T16:30:04.786Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Implement typed Site event receiver and projection storage

## Chapter

Cloudflare hosted Site Registry projection

## Goal

Implement guarded Site event receipt and durable projection storage for the hosted registry Worker.

## Context

Staccato's Worker accepts typed events through /webhook, authorizes bearer capabilities, stores latest dashboard/sync/report projections in KV, and records inbox/audit rows in D1. Narada should implement a generic Site Registry event receiver using @narada2/site-config contracts and Narada-specific event families.

## Required Work

1. Implement POST /webhook for typed Site events using the @narada2/site-config event/receiver contract. 2. Authenticate with bearer capability secrets and record bounded capability audit rows. 3. Store latest projection records and optional event log using KV/D1 according to the chapter boundary. 4. Enforce idempotency, payload bounds, unknown-site refusal, unauthorized refusal, unsupported-family refusal, and no raw secret storage. 5. Add unit tests with fake KV/D1 proving accepted events update projection state and refused events do not.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Implemented `POST /webhook` in `packages/site-registry-cloudflare` using the `@narada2/site-config` Site event receiver contract. The Worker now derives authentication from the configured bearer token, builds a receiver contract from configured known Site ids, and refuses events before projection writes when authentication, family, Site identity, payload bounds, or raw-secret posture fail.

Accepted events are written only as projection data: KV idempotency records, event records, per-Site event lists, and latest Site projection read models. Optional D1 writes record bounded event audit metadata only. Added a D1 migration for the audit table and updated the Wrangler example with known Site, max payload, and event capability binding posture.

Expanded tests with fake KV/D1 to prove accepted event projection updates, duplicate idempotency behavior, unknown Site refusal, unauthorized refusal, unsupported family refusal, oversized payload refusal, and raw-secret marker refusal.

## Verification

- `pnpm install` passed.
- `pnpm --filter @narada2/site-config build` passed.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 1 test file, 9 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] POST /webhook accepts only authenticated, known, bounded typed Site events.
- [x] Projection storage records latest state and provenance without becoming Site authority.
- [x] Tests cover accepted, duplicate/idempotent, unknown Site, unauthorized, unsupported family, oversized payload, and raw-secret refusal cases.
