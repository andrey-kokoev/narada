# Task 218: Correct Task 211 Test Telemetry And Teardown Overclaim

## Why

Review of Task 211 found that the implementation is useful but overclaims in three places:

- `classifyStep()` treats any exit `133` / `SIGTRAP` signature as `known-teardown-noise`, even though step-level classification cannot know whether the underlying suite had already passed.
- The task text and docs imply meaningful prevention/hardening of the `better-sqlite3` teardown crash, but `createTestDb()` is only adopted in one harness while many tests still use raw `new Database(":memory:")`.
- The telemetry surface defines `violatedLadder`, but the main runner scripts do not actually compute or persist verification-ladder violations.

Narada should either implement these claims fully or narrow the claims to match reality.

## Goal

Bring Task 211, the runner behavior, and the docs into coherence:

- teardown noise classification must be evidence-based
- mitigation scope must be described honestly
- verification-ladder violation signaling must either be implemented or removed from claims

## Required Changes

### 1. Fix Step-Level Teardown Classification

Do not classify a step as `known-teardown-noise` purely because:

- exit status is `133`
- output contains a V8 / SIGTRAP signature

unless there is evidence that the underlying test suite actually completed successfully.

Acceptable approaches:

- use a stronger success heuristic for test output before assigning `known-teardown-noise`
- split classification into `possible-teardown-noise` vs `known-teardown-noise`
- keep step-level classification conservative and reserve `known-teardown-noise` for whole-run classification with `stepsPassed === true`

The key requirement is: genuine runner/infrastructure failures must not be silently softened into harmless noise.

### 2. Correct Mitigation Scope

Either:

- expand `createTestDb()` adoption materially across the control-plane test suite,

or:

- explicitly state that the current mitigation is primarily classification plus a narrow best-effort lifecycle helper, not broad prevention.

The final docs and task notes must match the real scope of adoption.

### 3. Implement Or Remove Ladder-Violation Signaling

Task 211 claims misuse visibility for expensive verification choices. Make that true in one coherent way:

- compute `violatedLadder` in the runner scripts when a more expensive command is used without explicit opt-in context,

or:

- remove the claim from docs/task notes and treat it as a follow-up rather than completed work.

Do not leave a dormant field that suggests functionality Narada does not actually provide.

### 4. Update The Original Task File

Update `.ai/tasks/20260419-211-add-test-runtime-observability-and-better-sqlite3-teardown-hardening.md` so its `Execution Notes` and completion claims reflect the corrected reality.

## Verification

Minimum:

```bash
pnpm verify
pnpm test:unit
```

Focused proof:

- a synthetic or reproduced infrastructure failure is not mislabeled as harmless teardown noise
- telemetry entries either contain a real `violatedLadder` signal or no longer claim it exists
- Task 211 text matches what the code actually does

## Definition Of Done

- [x] Step-level teardown classification is no longer over-broad.
- [x] Mitigation scope for `better-sqlite3` teardown is documented honestly.
- [x] Verification-ladder violation signaling is either implemented or explicitly de-scoped.
- [x] Task 211’s execution notes are brought into agreement with reality.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

### Reviewed State

Task 211 and the runner code were brought into coherence:

- `scripts/test-telemetry.ts` no longer classifies exit `133` / V8 signatures as `known-teardown-noise` without evidence that the suite passed.
- `violatedLadder` was removed from the telemetry surface rather than left as a dormant, uncomputed signal.
- Task 211 now describes `createTestDb()` adoption honestly as narrow/best-effort, not broad prevention of the `better-sqlite3` teardown crash.
- `AGENTS.md` documents that `known-teardown-noise` requires evidence of successful test completion.

### Verification

Reviewed by inspection of:

- `scripts/test-telemetry.ts`
- `.ai/tasks/20260419-211-add-test-runtime-observability-and-better-sqlite3-teardown-hardening.md`
- `AGENTS.md`
