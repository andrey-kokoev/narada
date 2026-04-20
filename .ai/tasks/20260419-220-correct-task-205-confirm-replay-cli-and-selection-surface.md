# Task 220: Correct Task 205 Confirm-Replay CLI And Selection Surface

## Why

Review of Task 205 found that the control-plane operator exists, but the user-facing surface and task state do not match that reality.

Concrete gaps:

- `packages/layers/cli/src/commands/confirm-replay.ts` still returns a `not_implemented` result and contains stale comments claiming the operator has not landed.
- The task file `.ai/tasks/20260419-205-add-confirmation-replay-from-durable-execution-state.md` still has all Definition of Done boxes unchecked and no execution notes.
- The CLI surface advertises bounds like `--context-id` and `--executor-family`, but the implementation does not currently honor them end-to-end.
- There is no CLI-level proof that the surfaced command actually drives the implemented control-plane operator.

Narada should not claim a first-class operator family member if the public command still behaves like a stub.

## Goal

Make confirmation replay actually usable and honestly documented:

- wire the CLI command to `ConfirmationReplay`
- ensure exposed selector dimensions are either implemented or removed
- update the original task file as the canonical completion record

## Required Changes

### 1. Wire `confirm-replay` To The Real Operator

Replace the stub path in:

- `packages/layers/cli/src/commands/confirm-replay.ts`

with actual construction and invocation of:

- `ConfirmationReplay`

using the stores already opened in that command.

The command should return real replay results in both JSON and human output modes.

### 2. Make Selection Surface Honest

Audit the options exposed by the CLI and the selection fields consumed by `ConfirmationReplay`.

At minimum, make one coherent choice:

- implement `scope`, `contextId`, `intentIds`, `outboundIds`, and `executorFamily` end-to-end,

or:

- remove/rename any flags that are not actually honored.

Do not leave the CLI advertising bounds that the operator silently ignores.

### 3. Add Focused Verification

Add a focused proof that the CLI path reaches the real operator.

Acceptable forms:

- command-level unit test
- narrow integration test
- focused test around command construction and result formatting

The proof should cover at least one confirm-to-confirmed path.

### 4. Update The Original Task File

Update:

- `.ai/tasks/20260419-205-add-confirmation-replay-from-durable-execution-state.md`

with:

- checked Definition of Done items as appropriate
- `Execution Notes`
- explicit note about what is implemented now vs deferred follow-up

## Verification

Minimum:

```bash
pnpm verify
pnpm --filter @narada2/control-plane test:unit
pnpm --filter @narada2/cli test
```

Focused proof:

- `narada confirm-replay` no longer returns `not_implemented`
- at least one bounded replay path confirms an execution/effect without re-performing it
- surfaced CLI flags are implemented or no longer exposed

## Definition Of Done

- [x] `confirm-replay` invokes the real `ConfirmationReplay` operator.
- [x] The CLI selection surface is honest and bounded.
- [x] Focused verification covers the user-facing command path.
- [x] Task 205 is updated as the canonical completion artifact.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

### Changes Made

- `packages/layers/cli/src/commands/confirm-replay.ts` now constructs and invokes the real `ConfirmationReplay` operator.
- Dishonest selector flags (`--context-id`, `--executor-family`) are no longer exposed by the CLI.
- The retained bounded surface is `--scope`, `--intent-ids`, `--outbound-ids`, and `--limit`.
- Unknown `--scope` values now hard fail in both multi-mailbox and single-config modes rather than silently falling back to the first configured scope.
- `.ai/tasks/20260419-205-add-confirmation-replay-from-durable-execution-state.md` was updated as the canonical completion artifact.

### Verification

- `packages/layers/cli/test/commands/confirm-replay.test.ts` covers:
  - invoking the real operator and confirming a completed execution
  - empty replay result
  - `intentIds` bounded replay
  - unknown single-config scope hard failure
