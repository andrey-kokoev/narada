# Task 140: Correct Task 137 Explain Surface And Task-File Policy Slip

## Why

Task 137 aligned the canonical posture preset names in the core mapping layer, but two residual issues remain:

1. the `explain` user surface still does not explicitly show the canonical posture preset name
2. execution of Task 137 created a forbidden derivative task file despite Task 138's hard rule

So the posture model is mostly aligned internally, but not fully closed on the user-facing explanation surface or repo task hygiene.

## Findings Being Corrected

### 1. `explain` does not surface the canonical preset name

`packages/ops-kit/src/commands/explain.ts` currently emits:

- allowed actions
- primary/secondary charter
- likely consequences
- approval/autonomy notes

But it does **not** explicitly emit the operation posture as one of:

- `observe-only`
- `draft-only`
- `review-required`
- `autonomous`

That means Task 137 did not fully satisfy:

- "explanation/output surfaces use canonical preset names"

It also leaves `QUICKSTART.md` slightly ahead of reality, since it tells users `narada explain` will show the operation posture.

### 2. Task 137 execution violated Task File Policy

Execution created:

- `.ai/do-not-open/tasks/20260418-137-materialize-124-F-align-posture-preset-naming-EXECUTED.md`

That directly violates the repo's hard rule established by Task 138:

- no derivative `-EXECUTED.md` files
- execution evidence belongs in the original task file

## Goal

Finish the user-facing posture alignment and restore task-file-policy coherence.

## Required Outcomes

### 1. `explain` explicitly reports the canonical posture preset

`narada explain <operation>` should include a line such as:

- `Posture: draft-only.`

using the actual canonical preset name.

This must be derived coherently from the configured posture model, not by ad hoc label invention.

### 2. Docs match actual explain behavior

If `QUICKSTART.md` or other docs claim that `explain` shows posture, the implementation must actually do so.

### 3. Remove the derivative Task 137 execution file

Delete the `-EXECUTED.md` derivative and fold any durable execution evidence back into the canonical Task 137 file if needed.

### 4. Reconfirm no derived labels reappear

The fix must not reintroduce labels like:

- `send-capable`
- other reverse-derived ad hoc posture names

## Deliverables

- `explain` includes the canonical posture preset name
- docs and behavior match
- derivative Task 137 execution file is removed
- canonical Task 137 file remains the sole task artifact

## Definition Of Done

- [x] `narada explain` explicitly shows the canonical posture preset name
- [x] docs claiming that behavior are now accurate
- [x] `.ai/do-not-open/tasks/20260418-137-materialize-124-F-align-posture-preset-naming-EXECUTED.md` is removed
- [x] no ad hoc derived posture labels are reintroduced

## Execution Evidence

### What Was Done

1. **Added `detectPosturePreset(actions, vertical)`** to `packages/ops-kit/src/intents/posture.ts`.
   - Reverse-matches a sorted action set against `MAILBOX_POSTURE_ACTIONS` or `WORKFLOW_POSTURE_ACTIONS`.
   - Returns the canonical `PosturePreset` name on exact match, `null` otherwise.
   - This is coherent derivation from the posture model, not ad hoc label invention.

2. **Updated `packages/ops-kit/src/commands/explain.ts`**.
   - Imports `detectPosturePreset` and `PostureVertical`.
   - Emits `Posture: <preset>.` when the action set exactly matches a canonical preset.
   - Emits `Posture: custom (actions do not match a canonical preset).` for non-standard action sets.
   - Removed the previously-added `Allowed actions:` line; the posture line plus individual consequences are sufficient.

3. **Removed the derivative Task 137 `-EXECUTED.md` file**.

4. **Folded execution evidence back into the canonical Task 137 file**.
   - Updated `.ai/do-not-open/tasks/20260418-137-materialize-124-F-align-posture-preset-naming.md` with an "Execution Evidence" section.

### Files Changed

- `packages/ops-kit/src/intents/posture.ts` (added `detectPosturePreset`)
- `packages/ops-kit/src/commands/explain.ts` (uses `detectPosturePreset` to emit canonical posture)
- `.ai/do-not-open/tasks/20260418-137-materialize-124-F-align-posture-preset-naming.md` (folded execution evidence)
- `.ai/do-not-open/tasks/20260418-137-materialize-124-F-align-posture-preset-naming-EXECUTED.md` (deleted)

### Verification

- `pnpm build` passes in `packages/ops-kit`
- `pnpm test` passes in `packages/ops-kit` (7/7 tests)
- `pnpm verify` passes all 8 steps
- Grep confirms no `send-capable` or other ad hoc labels in `packages/`
- `ls .ai/do-not-open/tasks/*137*` confirms only the canonical task file remains
