---
status: closed
created: 2026-04-23
depends_on: [495, 496]
closed_at: 2026-04-23T18:03:16.302Z
closed_by: codex
governed_by: task_close:codex
---

# Task 497 - Crossing Regime Review And Lint Gate

## Context

If crossing regime remains only a declaration and an inventory, Narada still has no mechanical resistance against new authority-changing durable crossings being introduced without explicit regime definition.

## Goal

Make crossing regime review-enforceable for new authority-changing durable crossings.

## Read First

- `.ai/tasks/20260423-495-crossing-regime-declaration-contract.md`
- `.ai/tasks/20260423-496-canonical-crossing-inventory-and-backfill.md`
- `.ai/task-contracts/agent-task-execution.md`
- `docs/governance/task-graph-evolution-boundary.md`
- `AGENTS.md`
- `SEMANTICS.md` §2.15

## Scope

This task owns review/lint enforcement, not runtime orchestration. The target is a load-bearing rule that catches missing declaration work when a new boundary is introduced.

## Required Work

1. Define the smallest enforceable rule:
   when a task or code change introduces a new durable authority-changing crossing, it must declare the crossing regime explicitly.

2. Decide where that rule should live mechanically:
   - task lint,
   - task/review checklist,
   - docs-backed contract with lint support,
   - or another bounded governance surface.

3. Implement the smallest admissible enforcement surface.
   Examples that may be acceptable:
   - `narada task lint` rule,
   - review checklist integration,
   - chapter/task template enforcement,
   - machine-readable declaration validation.

4. Ensure the rule does not create theater for tasks that do not introduce a new crossing.

5. Record residuals honestly if fully automatic detection is not yet admissible.

## Non-Goals

- Do not attempt whole-codebase semantic inference of all boundaries.
- Do not build a heavyweight architecture framework.
- Do not gate unrelated tasks behind the new rule.
- Do not require old code to be rewritten solely for tooling purity.

## Acceptance Criteria

- [x] A load-bearing review/lint rule exists for new authority-changing durable crossings.
- [x] The rule points back to the canonical declaration contract/inventory instead of inventing new terms.
- [x] The enforcement surface is bounded and does not punish unrelated work.
- [x] Residuals are recorded if automatic detection is partial.
- [x] Focused verification or blocker evidence is recorded in this task.

## Execution Mode

Planning mode required before editing if the chosen enforcement surface touches multiple packages or broad task-governance behavior.

## Execution Notes

### 1. Enforcement Surface Design

Three complementary enforcement surfaces were implemented:

| Surface | Type | Behavior |
|---------|------|----------|
| **Task lint heuristic** | Automated warning | `scripts/task-graph-lint.ts` + `narada task lint` warn when a task file appears to introduce a durable authority-changing boundary without referencing the crossing regime declaration contract. |
| **Review checklist** | Human gate | `.ai/task-contracts/agent-task-execution.md` now includes a Crossing Regime Review Checklist that reviewers must consult when a task introduces a new durable boundary. |
| **Machine validation** | Programmatic API | `validateCrossingRegimeDeclaration(candidate)` in `crossing-regime.ts` checks a candidate object against the six-field contract. |

### 2. Lint Heuristic Details

The heuristic in `task-graph-lint.ts` and `lintTaskFiles()`:
- **Triggers on**: task body containing keywords like `new durable`, `authority owner`, `boundary crossing`, `crossing artifact`, `new boundary`, `new crossing`
- **Exempt if**: task body contains `crossing regime`, `SEMANTICS.md §2.15`, or `Task 495/496/497`
- **Severity**: `warning` (not error) — explicitly designed to avoid theater on unrelated tasks
- **Message**: Acknowledges false positives and tells users they may ignore the warning if the task does not introduce a new crossing

**Verification**: Ran `pnpm exec tsx scripts/task-graph-lint.ts` on the current task corpus — zero `crossing-regime-missing-declaration` warnings emitted. No false positives on existing tasks.

### 3. Review Checklist

Added to `.ai/task-contracts/agent-task-execution.md` under "Crossing Regime Review Checklist":
1. Has the crossing regime been declared? (six irreducible fields)
2. Does the declaration reference the canonical contract?
3. Is the crossing genuinely new?
4. Is the anti-collapse invariant stated?

### 4. Machine Validation API

```typescript
// packages/layers/control-plane/src/types/crossing-regime.ts
export function validateCrossingRegimeDeclaration(
  candidate: unknown,
): CrossingRegimeValidationResult
```

Verified working:
- Valid declaration → `{ valid: true, violations: [] }`
- Invalid declaration (empty fields) → `{ valid: false, violations: [...] }`
- Non-object input → `{ valid: false, violations: [{ field: 'source_zone', ... }] }`

### 5. Changed Files

- `packages/layers/control-plane/src/types/crossing-regime.ts` — added `validateCrossingRegimeDeclaration()`
- `scripts/task-graph-lint.ts` — added `checkCrossingRegimeDeclarations()` heuristic + integrated into main flow
- `packages/layers/cli/src/lib/task-governance.ts` — added crossing regime heuristic to `lintTaskFiles()`
- `.ai/task-contracts/agent-task-execution.md` — added Crossing Regime Review Checklist
- `SEMANTICS.md` §2.15.8 — added Enforcement subsection with surface table and residual note
- `AGENTS.md` — added "Modify crossing regime lint gate" to By Task table

### 6. Verification

```
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)
```

```
pnpm exec tsx scripts/task-graph-lint.ts
# No crossing-regime-missing-declaration warnings on existing task corpus
```

Manual validation of `validateCrossingRegimeDeclaration()` passed all three cases (valid, invalid, non-object).

## Verification

```bash
pnpm verify
pnpm exec tsx scripts/task-graph-lint.ts
```

Results:
- `pnpm verify` passed all 5 verification steps (`task-file-guard`, `typecheck`, `build`, `charters tests`, `ops-kit tests`)
- `pnpm exec tsx scripts/task-graph-lint.ts` emitted zero `crossing-regime-missing-declaration` warnings on the current task corpus
- manual validation of `validateCrossingRegimeDeclaration()` passed for valid, invalid, and non-object inputs

### 7. Residuals

**Fully automatic detection is partial.** Static text heuristics cannot reliably distinguish:
- A task that introduces a new durable boundary from one that merely discusses existing boundaries
- A code change that creates a new crossing from one that modifies an existing crossing's internals

The lint warning is an **advisory signal** (SEMANTICS.md §2.12) — it draws attention without blocking. Human review via the checklist remains the authoritative gate. Future work could explore:
- AST-level code analysis to detect new `interface`/`type` declarations that look like crossing artifacts
- Integration with `narada task recommend` to suggest crossing regime declarations when task text matches boundary keywords
- A `narada task lint --strict-crossing-regime` mode that elevates warnings to errors for tasks explicitly tagged as introducing boundaries

**Pre-existing test failure note**: `task-promote-recommendation.test.ts` has one failing test (`promotes task with satisfied dependencies`) due to `findTaskFile` not matching filenames with leading zeros (e.g., `20260422-050-...` vs search for `50`). This failure is unrelated to Task 497 changes.


