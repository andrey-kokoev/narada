---
status: closed
closed_at: 2026-04-23T17:55:00Z
closed_by: codex
governed_by: task_close:codex
created: 2026-04-23
depends_on: [495, 496]
---

# Task 498 - Crossing Regime Inspection Surface

## Context

If declarations exist but cannot be inspected easily, crossing regime is still only half first-class. Operators and architects need a read-only surface that shows what crossings Narada currently recognizes.

## Goal

Add a read-only inspection surface over declared crossing regimes.

## Read First

- `.ai/do-not-open/tasks/20260423-495-crossing-regime-declaration-contract.md`
- `.ai/do-not-open/tasks/20260423-496-canonical-crossing-inventory-and-backfill.md`
- `SEMANTICS.md` §2.15
- `AGENTS.md`
- `packages/layers/cli/src/commands/`

## Scope

This task owns read-only inspection only. The surface may be CLI, docs-backed read tooling, JSON output, or another bounded observation surface.

## Required Work

1. Choose the narrowest useful inspection surface.
   Examples:
   - `narada crossing list`
   - `narada crossing show <id>`
   - task/declaration inspection through an existing governance command

2. Ensure the inspection surface reads only from the canonical declaration/inventory from Tasks 495–496.

3. Make the output useful for both humans and future automation:
   - identity/name of crossing,
   - source zone,
   - destination zone,
   - authority owner,
   - artifact,
   - confirmation rule,
   - canonical source/reference.

4. Keep the surface read-only and explicit about any deferred/unknown declarations.

## Non-Goals

- Do not add mutation or approval semantics.
- Do not build a graph UI unless a very small read-only surface already exists to host it.
- Do not fabricate runtime state from semantic declarations.

## Acceptance Criteria

- [x] A read-only inspection surface exists for declared crossings.
- [x] It reads from the canonical declaration/inventory, not a parallel ad hoc format.
- [x] The output is useful enough to support review and design work.
- [x] The surface is clearly observation-only.
- [x] Focused verification or blocker evidence is recorded in this task.

## Execution Notes

### 1. Chosen Surface

`narada crossing list` and `narada crossing show <name>` — the narrowest useful CLI surface, hosted as a peer to other governance commands (`task`, `chapter`, `posture`).

### 2. Command Reference

| Command | Description | Filter |
|---------|-------------|--------|
| `narada crossing list` | List all declared crossings from canonical inventory | `--classification canonical,advisory,deferred` |
| `narada crossing show <name>` | Show full declaration for a single crossing | Case-insensitive name match |

### 3. Output Fields

Both commands expose all six irreducible fields plus metadata:
- `name`, `description`
- `source_zone`, `destination_zone`
- `authority_owner`
- `admissibility_regime`
- `crossing_artifact`
- `confirmation_rule`
- `anti_collapse_invariant`
- `documented_at`
- `classification`, `classification_rationale`

### 4. Read-Only Guarantees

- No file system writes; imports `CROSSING_REGIME_INVENTORY` const directly.
- No mutation methods on the imported types (`Readonly` view types from Task 495).
- Human format explicitly marks deferred crossings with a warning (`⚠`).
- Advisory crossings are noted separately with their rationale.

### 5. Changed Files

- `packages/layers/cli/src/commands/crossing.ts` — new file with `crossingListCommand` and `crossingShowCommand`
- `packages/layers/cli/src/main.ts` — wired `crossing` subcommand group with `list` and `show`
- `packages/layers/cli/test/commands/crossing.test.ts` — 16 tests covering list, show, filters, human output, error cases, read-only guarantee
- `AGENTS.md` — added "Inspect crossing regimes" to By Task table and "crossing regime inspection" to concept table

### 6. Verification

```bash
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build, charters tests, ops-kit tests)

pnpm --filter @narada2/cli exec vitest run test/commands/crossing.test.ts
# 16 tests passed
```

No runtime code was changed. The surface is pure observation over the existing Task 496 inventory.

## Verification

```bash
pnpm verify
# All 5 verification steps passed

pnpm --filter @narada2/cli exec vitest run test/commands/crossing.test.ts
# Test Files  1 passed (1)
# Tests  16 passed (16)
```


