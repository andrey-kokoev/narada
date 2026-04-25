---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T22:15:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [519]
---

# Task 520 - Traveling Proof Plan And Fixture Contract

## Goal

Define the first bounded proof for the selected second operation, including what is fixture-backed, what requires supervised live proof, and what remains out of scope.

## Acceptance Criteria

- [x] A bounded proof plan exists.
- [x] Fixture-backed vs supervised-live boundaries are explicit.
- [x] Operator gates and safety limits are explicit.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Research Phase

1. **Analyzed existing fixture coverage** for Timer → Process:
   - `timer-to-process.test.ts` (4 tests) — covers fact ingestion, foreman resolution, process execution, replay safety
   - `vertical-parity.test.ts` (4 tests) — covers Source interface parity, FactStore ingestion, foreman → scheduler → execution path
   - `process-executor.test.ts` (11 tests) — covers spawn, recovery, error handling
   - `confirmation.test.ts` (13 tests) — covers ProcessConfirmationResolver
   - `timer-source.test.ts` (8 tests) — covers determinism, checkpoint, edge cases

2. **Compared against first operation proof** (`docs/product/first-operation-proof.md`) to identify structural patterns:
   - Fixture-backed vs live-backed separation
   - Pipeline stage → test mapping
   - Operator review loop documentation
   - Inspection checkpoints

3. **Identified the live boundary** for Timer → Process:
   - Narrower than mailbox because timer sources are self-generated and process execution is local
   - Live boundary concentrated in: charter output quality (LLM), real diagnostic command behavior, operator review loop
   - Most pipeline stages are mechanically provable without live exercise

4. **Defined safety limits** by examining existing code:
   - Process timeout: 300s default (`ProcessExecutor`)
   - Output capture: 64 KB each (`truncateOutput`)
   - Allowed actions: `["process_run", "no_action"]` (policy)
   - Lease duration: 300s default (`ProcessExecutor`)

### Deliverable

Created `.ai/decisions/20260423-520-traveling-proof-plan-and-fixture-contract.md` (17 KB) containing:
- Canonical proof case with fixture and expected behavior
- Fixture-backed proof: 10 pipeline stages mapped to existing tests
- Live-backed proof: explicit table of what requires live exercise and why
- Fixture vs live separation table
- Operator gates and safety limits (3 gates, 6 limits)
- Inspection checkpoints for all 5 pipeline stages
- Proof vs knowledge boundary
- 5 non-goals
- 5 bounded blockers for full live proof

## Verification

### Decision Artifact Verification

- Decision file exists: `.ai/decisions/20260423-520-traveling-proof-plan-and-fixture-contract.md` ✅
- File size: ~17 KB, 10 sections ✅
- Contains all required sections: proof plan, fixture/live boundary, operator gates, safety limits, blockers ✅

### Fixture Test Verification

All referenced tests passed:

```bash
npx vitest run test/integration/control-plane/timer-to-process.test.ts
npx vitest run test/integration/control-plane/vertical-parity.test.ts
npx vitest run test/unit/executors/process-executor.test.ts
npx vitest run test/unit/executors/confirmation.test.ts
npx vitest run test/unit/sources/timer-source.test.ts
```

Results:
- `timer-to-process.test.ts`: 4/4 pass ✅
- `vertical-parity.test.ts`: 4/4 pass ✅
- `process-executor.test.ts`: 11/11 pass ✅
- `confirmation.test.ts`: 13/13 pass ✅
- `timer-source.test.ts`: 8/8 pass ✅
- **Total: 40/40 pass**

### Typecheck Verification

- `pnpm typecheck`: all 11 packages pass ✅

### Structural Verification

Confirmed the proof plan follows the same structural patterns as the canonical first operation proof (`docs/product/first-operation-proof.md`):
- Fixture-backed / live-backed separation ✅
- Pipeline stage → test mapping ✅
- Operator review loop documentation ✅
- Inspection checkpoints per stage ✅
- Proof vs knowledge boundary ✅
- Public repo vs private ops repo boundary ✅
