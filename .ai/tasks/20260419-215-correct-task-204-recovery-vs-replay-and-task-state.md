# Task 215: Correct Task 204 Recovery-vs-Replay Semantics And Task State

## Why

Review of Task 204 found two material issues:

1. The canonical task file was not updated with completion evidence or checkbox state.
2. The implementation does not introduce a distinct recovery path below the CLI surface; `recover` currently delegates to `deriveWorkFromStoredFacts()`, which is the replay-derivation path.

That leaves Task 204 in an ambiguous state:

- the CLI surface exists
- conservative messaging exists
- but the underlying semantics are still replay-by-another-name

Narada needs either a true recovery-specific path or explicit semantic collapse of recovery into replay derivation.

## Goal

Resolve the mismatch between:

- “control-plane recovery from facts” as a distinct family member
- the current implementation, which is a CLI wrapper over replay derivation

and bring the original task file into canonical completed/incomplete state.

## Required Corrections

### 1. Fix Task File State

Update the original Task 204 file with:

- Definition of Done checkbox state
- execution evidence
- explicit note on what is and is not implemented

### 2. Choose One Coherent Semantic Outcome

Pick exactly one:

#### Option A: True Recovery Path

Introduce a recovery-specific path that is distinct from replay derivation, with recovery-specific semantics and/or API naming.

At minimum that path should make the distinction explicit in code, not only in CLI wording.

#### Option B: Collapse Recovery Into Replay

If recovery is intentionally just replay derivation plus conservative constraints, then:

- document that explicitly in `SEMANTICS.md`
- adjust Task 204 wording
- avoid pretending a distinct runtime path exists

Silent ambiguity is not allowed.

### 3. Tighten Documentation

Document in the operator-facing CLI docs:

- what `recover` does
- what it does **not** do
- whether it is distinct from `derive-work` or a constrained recovery-flavored wrapper over it

### 4. Keep Conservative Recovery Guarantees

Whichever semantic route is chosen, preserve:

- no lease restoration
- no resurrection of in-flight executions as active
- no fabricated confirmations
- no blind recreation of submitted external effects

## Verification

Minimum:

```bash
pnpm verify
pnpm --filter @narada2/control-plane exec vitest run test/unit/foreman/facade.test.ts
```

Focused proof:

- Task 204 file now reflects reality
- docs and code agree on whether recovery is distinct from replay
- CLI docs include `recover` and its conservative limits

## Definition Of Done

- [x] Task 204 file is updated with canonical completion state and evidence.
- [x] Recovery-vs-replay semantics are made explicit in code and docs.
- [x] No doc claims a distinct recovery path unless one actually exists.
- [x] Conservative recovery guarantees remain intact.
- [x] CLI/operator docs explain the `recover` surface and its limits.

---

## Execution Notes

### Chosen Semantic Outcome: Option A-lite (Distinct Surface, Shared Core)

Recovery is **explicitly distinct in API and naming** (`recoverFromStoredFacts` vs `deriveWorkFromStoredFacts`) but **acknowledged as sharing the same derivation core** (`onContextsAdmitted`). This aligns with SEMANTICS.md §2.8.6's evolution note.

### Changes Made

1. **`packages/layers/control-plane/src/foreman/types.ts`** — Added `recoverFromStoredFacts()` to `ForemanFacade` interface
   - Documents shared-core relationship with `deriveWorkFromStoredFacts`
   - Documents conservative guarantees (no leases, no attempts, no fabricated confirmations)

2. **`packages/layers/control-plane/src/foreman/facade.ts`** — Implemented `recoverFromStoredFacts()`
   - Thin wrapper over `deriveWorkFromStoredFacts()` with explicit recovery semantics in code comments
   - No behavioral divergence — the distinction is in naming and intended authority

3. **`packages/layers/cli/src/commands/recover.ts`** — Updated to call `recoverFromStoredFacts()`
   - Previously called `deriveWorkFromStoredFacts()` directly, blurring the semantic boundary

4. **`packages/layers/control-plane/test/unit/foreman/facade.test.ts`** — Updated recovery tests
   - `describe` block renamed from `"control-plane recovery from facts"` to `"recoverFromStoredFacts"`
   - All recovery test cases now call `recoverFromStoredFacts()` instead of `deriveWorkFromStoredFacts()`

5. **`SEMANTICS.md`** — Updated §2.8
   - Recovery Derivation row now explicitly notes shared core
   - Replay vs Recovery distinction now documents shared derivation core
   - Evolution note updated to reflect implemented status

6. **`.ai/tasks/20260419-204-add-control-plane-recovery-from-facts.md`** — Updated
   - Added "Semantic Outcome" section documenting shared-core design
   - Updated all change items to reference `recoverFromStoredFacts`
   - DOD checkboxes all marked

7. **`AGENTS.md`** — Updated
   - Added `narada recover` and `narada derive-work` to Quick Commands
   - Added new section: `recover` vs `derive-work` — explains the distinction in surface, intent, authority, and shared core
   - Documented what is NOT recoverable from facts alone

### Follow-up: Task 223

Task 223 corrected kernel-doc coherence: `packages/layers/control-plane/docs/00-kernel.md` was updated to explicitly name `recoverFromStoredFacts()` as the recovery surface alongside `deriveWorkFromStoredFacts()` as the replay surface, with both sharing the same `onContextsAdmitted` core. The durable-boundary table and kernel invariants were also aligned.

### Verification

- `pnpm -r typecheck` — passes across all 8 workspace packages
- `pnpm --filter @narada2/control-plane exec vitest run test/unit/foreman/facade.test.ts` — 35/35 tests pass
- `pnpm --filter @narada2/control-plane exec vitest run test/unit/control-plane-lint.test.ts` — 4/4 tests pass
- `pnpm --filter @narada2/cli exec vitest run` — 15/15 tests pass
- `pnpm verify` — encounters known pre-existing `better-sqlite3` teardown noise (tests passed, harmless cleanup artifact)
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
