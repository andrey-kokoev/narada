# Task 205: Add Confirmation Replay From Durable Execution State

## Why

Narada already separates:

- decision / intent
- execution
- confirmation

That implies a replay-shaped operator at the confirmation boundary:

- re-check whether a previously executed effect can now be confirmed
- without re-executing the effect

Mail already has parts of this idea in outbound reconciliation. The missing piece is to define and expose it as a first-class generic operator family member.

## Goal

Add an explicit confirmation replay operator that recomputes confirmation state from durable execution/outbound state plus current observation, without re-performing the effect.

## Required Behavior

- select bounded unconfirmed or ambiguous executions/effects
- query the relevant durable execution/outbound records
- use observation/reconciliation logic to attempt confirmation
- update confirmation state only when confirmation can be proven
- never blind-resend or re-execute as part of confirmation replay

## Definition Of Done

- [x] Narada defines confirmation replay as an explicit operator.
- [x] Confirmation replay does not re-execute effects.
- [x] Existing mail reconciliation is documented or refactored as one instance of this family.
- [x] Tests or focused proof cover at least one replay-to-confirm path.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

**What landed:**

- `packages/layers/control-plane/src/executors/confirmation-replay.ts` — `ConfirmationReplay` operator with:
  - `ConfirmationReplaySelection` — bounds: `scopeId`, `intentIds`, `outboundIds`, `limit`
  - Process family via `ProcessConfirmationResolver.resolve()` — transitions `completed` → `confirmed`, `failed` → `confirmation_failed`
  - Mail family via `OutboundReconciler.reconcileOne()` — no re-send, only reconciliation
  - 10 unit tests covering both families, bounded selection, no-re-execution invariant

- `packages/layers/control-plane/src/outbound/reconciler.ts` — Added `reconcileOne(outboundId)` for targeted single-command reconciliation (refactored from `processNext()`), plus `previousStatus`/`newStatus` evidence in return value.

- `packages/layers/cli/src/commands/confirm-replay.ts` — CLI command `narada confirm-replay` wired to real `ConfirmationReplay` operator. Removed dishonest `--context-id` and `--executor-family` flags. Returns real results in JSON and human format.

- `packages/layers/cli/test/commands/confirm-replay.test.ts` — 3 focused CLI-level tests proving the command path reaches the real operator and confirms executions without re-performing effects.

- `SEMANTICS.md` §2.8 — Updated confirmation replay row to reference `OutboundReconciler` and `ProcessConfirmationResolver` as vertical instances of the confirm-mode operator family.

- `AGENTS.md` — Added navigation entry for confirmation replay.

**Intentionally deferred:**

- `scopeId` in `ConfirmationReplaySelection` only bounds mail family replay (`findAllSubmitted`). Process family does not filter by scope because `process_executions` lacks `scope_id`. This is acceptable for now; process family replay is inherently bounded by `intentIds` or `limit`.
- `contextId` was removed from the selection surface entirely because it was not honored by the operator.
- Graph `MessageFinder` construction in the CLI is best-effort; if credentials are unavailable, mail family replay is silently skipped.

**Follow-up:**

- Task 220 corrected the CLI stub path, removed dishonest flags (`--context-id`, `--executor-family`), and added CLI-level proof that the command reaches the real operator.
