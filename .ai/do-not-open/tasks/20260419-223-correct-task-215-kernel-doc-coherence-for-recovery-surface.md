# Task 223: Correct Task 215 Kernel-Doc Coherence For Recovery Surface

## Why

Review of Task 215 found that the code and most docs now coherently describe:

- `deriveWorkFromStoredFacts()` as the replay surface
- `recoverFromStoredFacts()` as the recovery surface
- both sharing the same derivation core

But `packages/layers/control-plane/docs/00-kernel.md` still carries older wording that frames recovery through replay-only language:

- it says replay derivation supports recovering after control-plane loss
- it does not explicitly name `recoverFromStoredFacts()` in the kernel’s main re-derivation explanation
- the durable-boundary table shows replay and preview, but not recovery as its own surfaced path

That leaves the highest-level kernel lawbook slightly out of sync with the updated semantics.

## Goal

Make the kernel doc match the implemented and documented shared-core model:

- replay and recovery are distinct surfaces
- both use the same core derivation path
- recovery remains conservative

## Required Changes

### 1. Update `00-kernel.md`

Bring the following sections into explicit agreement with the current model:

- the replay/re-derivation explanation around `deriveWorkFromStoredFacts()`
- the durable-boundary pair table
- the kernel invariants section, if needed

The doc should clearly say:

- `deriveWorkFromStoredFacts()` is the replay surface
- `recoverFromStoredFacts()` is the recovery surface
- both share the same underlying `ContextFormationStrategy` → `onContextsAdmitted()` core

### 2. Avoid Overclaim

Do not imply a divergent runtime algorithm exists for recovery if it does not.

The correct shape is:

- distinct surface
- shared core
- different intent/authority framing

### 3. Clean Up Task 215 Artifact

Update `.ai/do-not-open/tasks/20260419-215-correct-task-204-recovery-vs-replay-and-task-state.md` if needed so its execution notes mention this final doc-alignment correction or explicitly note it as follow-up.

## Verification

Minimum:

```bash
pnpm verify
```

Focused proof:

- `00-kernel.md`, `SEMANTICS.md`, `AGENTS.md`, and the code all tell the same story about replay vs recovery
- no kernel doc still implies that replay is the only surfaced path for recovery

## Definition Of Done

- [x] `00-kernel.md` explicitly reflects replay surface vs recovery surface with shared core.
- [x] Kernel docs no longer imply replay-only recovery semantics.
- [x] Task 215’s durable artifact reflects the final state or follow-up clearly.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

### Changes Made

1. **`packages/layers/control-plane/docs/00-kernel.md`** — Updated three sections:

   **Section 3.5 — Renamed to "Explicit Replay and Recovery Derivation"**
   - Previously only described `deriveWorkFromStoredFacts()` and mentioned recovery as a use case of replay
   - Now explicitly names both surfaces:
     - `deriveWorkFromStoredFacts()` as the replay surface (operator-scoped, `derive` + `resolve` authority)
     - `recoverFromStoredFacts()` as the recovery surface (loss-shaped, `admin` authority)
   - Documents that both share the same `ContextFormationStrategy` → `onContextsAdmitted` core
   - Documents conservative recovery guarantees (no leases, no attempts, no outbound effects)

   **Section 8.2 — Durable Boundary Pairs table**
   - Added recovery row: `Fact` (stored) → `Context`/`Work` via `recoverFromStoredFacts()`
   - Notes "same core as replay" to avoid implying divergent runtime algorithm

   **Section 8.3 — Kernel Invariants for Re-Derivation**
   - Invariant 1: "Same Path" now includes recovery alongside replay and preview
   - Invariant 4: Renamed from "No Admission Side Effect in Replay" to "No Admission Side Effect in Replay or Recovery"
   - Invariant 6: "Authority Preserved" now covers "Replay-derived and recovery-derived work items"
   - New Invariant 7: "Conservative Recovery" — recovery does not restore active leases, in-flight execution attempts, or already-submitted outbound effects
   - Renumbered subsequent invariants to maintain sequential order

2. **`.ai/do-not-open/tasks/20260419-215-correct-task-204-recovery-vs-replay-and-task-state.md`** — Added "Follow-up: Task 223" section referencing the kernel-doc alignment

### Verification

- `pnpm -r typecheck` — passes across all 8 workspace packages
- `pnpm --filter @narada2/control-plane exec vitest run test/unit/foreman/facade.test.ts` — 35/35 tests pass
- `pnpm --filter @narada2/control-plane exec vitest run test/unit/control-plane-lint.test.ts` — 4/4 tests pass
- `pnpm --filter @narada2/cli exec vitest run` — 15/15 tests pass
