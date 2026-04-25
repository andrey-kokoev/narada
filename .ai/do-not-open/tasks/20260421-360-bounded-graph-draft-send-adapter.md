---
status: closed
closed: 2026-04-21
depends_on: [358]
---

# Task 360 — Bounded Graph Draft/Send Adapter

## Agent Instructions

This task is self-standing. Before editing, read:

- `docs/deployment/cloudflare-effect-execution-authority-contract.md`
- `.ai/do-not-open/tasks/20260421-358-364-cloudflare-effect-execution-boundary.md`

Execution mode: direct implementation is acceptable if the write set stays inside `packages/sites/cloudflare/`, this task file, and focused tests. Use planning mode if you need to alter command lifecycle semantics, authority eligibility rules, or the effect-execution contract.

The adapter is mechanical. It receives an already-authorized command/attempt from the worker. It must not decide eligibility, approve commands, transition lifecycle state, or confirm effects. Use mocked Graph-client tests unless live mutation is explicitly safe and separately justified.

## Context

Task 359 owns state-machine behavior. This task owns the external mutating adapter boundary for the first effect path.

The adapter may be tested with a mocked Graph client. The boundary must still be real and must not leak authority decisions into the adapter.

## Goal

Implement or spike a bounded Graph draft/send adapter for Cloudflare Site.

## Required Work

### 1. Define adapter interface

Create a narrow interface for the first effect path, likely:

- create draft reply
- read draft identity
- send draft

The adapter must receive an already-authorized command/attempt. It must not decide eligibility.

### 2. Preserve external identity

Capture enough external identity for reconciliation, such as:

- draft id
- internetMessageId when available
- outbound id header if supported
- submitted timestamp

### 3. Failure handling

Classify failures into retryable and terminal where possible.

Adapter errors must not fabricate confirmation.

### 4. Tests or blocker proof

Add focused tests with mocked Graph client proving:

- adapter calls expected mutating methods for authorized attempt
- external ids are returned for persistence
- retryable/terminal failures are distinguishable
- adapter cannot be used as an authority decision source

If Graph draft/send is infeasible in Cloudflare constraints, produce concrete blocker proof.

## Non-Goals

- Do not implement full mailbox parity.
- Do not run live Graph mutation unless explicitly safe.
- Do not execute unapproved commands.
- Do not decide whether a command is authorized.
- Do not mutate command lifecycle state directly.
- Do not confirm effects.
- Do not claim production readiness.
- Do not create derivative task-status files.

## Suggested Verification

Use focused tests first. Suggested shape:

```bash
pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/graph-draft-send-adapter.test.ts
pnpm verify
```

## Acceptance Criteria

- [x] Bounded effect adapter exists or blocker proof exists.
- [x] Adapter receives authorization; it does not decide authorization.
- [x] External identities needed for reconciliation are returned if available.
- [x] Failure classes are represented.
- [x] Focused tests or blocker evidence exist.
- [x] No derivative task-status files are created.

## Execution Notes

Implemented the bounded Graph draft/send adapter for the first effect path:

- Added `packages/sites/cloudflare/src/effects/graph-draft-send-adapter.ts`.
- Added `GraphDraftClient` as a mockable boundary for `createDraftReply()` and `sendDraft()`.
- Added `GraphDraftSendAdapter.executeSendReply()` for authorized `send_reply` attempts.
- Adapter returns `submitted`, `failed_retryable`, or `failed_terminal`; it never returns `confirmed`.
- Adapter returns external identities when available: `draftId`, `sentMessageId`, `internetMessageId`, and `submittedAt`.
- Adapter classifies terminal failures such as 400/401/403/404/413 and retryable failures such as 429/503/504/network timeout.
- Adapter has no eligibility, approval, lifecycle-transition, or confirmation authority.

Focused verification:

```bash
pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/graph-draft-send-adapter.test.ts
```

Result: 17/17 tests passed.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
