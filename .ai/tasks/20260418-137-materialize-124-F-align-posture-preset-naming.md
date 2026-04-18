# Task 137: Materialize 124-F Align Posture Preset Naming

## Source

Derived from Task 124-F in `.ai/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md`.

## Why

Posture naming is currently non-parallel across verticals and sometimes contradicted by derived labels in explanation output.

Users should be able to understand autonomy/safety progression without learning different vocabularies for mailbox and workflow operations.

## Goal

Align posture preset naming to one coherent progression across verticals.

## Required Outcomes

### 1. Define one canonical progression

Target progression from the audit:

- `observe-only`
- `draft-only`
- `review-required`
- `autonomous`

### 2. Map vertical-specific behavior onto the shared progression

Mailbox and workflow behavior may differ operationally, but the user-facing posture names should remain parallel.

### 3. Remove conflicting derived labels

User-facing explanation surfaces should use canonical preset names, not ad hoc labels like `send-capable`.

## Deliverables

- one cross-vertical posture naming model
- updated user-facing explanation/output to match that model
- docs/config/help aligned with the canonical progression

## Definition Of Done

- [x] user-facing posture naming follows one shared progression across verticals
- [x] explanation/output surfaces use canonical preset names
- [x] docs/help/config-facing guidance align with the new naming model

## Execution Evidence

### What Was Done

1. **Defined one canonical 4-level progression** replacing divergent vertical-specific vocabularies.
2. **Mapped vertical-specific behavior** onto shared names via `MAILBOX_POSTURE_ACTIONS` and `WORKFLOW_POSTURE_ACTIONS`.
3. **Removed conflicting derived labels** (`send-capable`, etc.) from `explain.ts`.
4. **Added `detectPosturePreset`** in `posture.ts` to reverse-match action sets against canonical presets so `explain` can report the actual preset name.
5. **Updated all call sites** (`want-mailbox`, `want-workflow`, `want-posture`, `scope-builder`, `explain`, tests, `QUICKSTART.md`).

### Files Changed

- `packages/ops-kit/src/intents/posture.ts`
- `packages/ops-kit/src/lib/scope-builder.ts`
- `packages/ops-kit/src/commands/want-mailbox.ts`
- `packages/ops-kit/src/commands/want-workflow.ts`
- `packages/ops-kit/src/commands/want-posture.ts`
- `packages/ops-kit/src/commands/explain.ts`
- `packages/ops-kit/test/unit/ops-kit.test.ts`
- `QUICKSTART.md`

### Verification

- `pnpm build` passes in `packages/ops-kit` and `packages/layers/cli`
- `pnpm test` passes in `packages/ops-kit` (7/7 tests)
- `pnpm -r typecheck` passes across all workspace packages
- `pnpm verify` passes all 8 steps
- Grep confirms no old posture names remain in `packages/` or top-level canonical docs
