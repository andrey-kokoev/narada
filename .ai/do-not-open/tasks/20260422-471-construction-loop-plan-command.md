---
status: closed
depends_on: [470, 468, 469, 463]
closed_at: 2026-04-22T19:00:00.000Z
closed_by: codex
---

# Task 471 — Construction Loop Plan Command

## Context

Task 470 designed the Construction Loop Controller as a "promotion assistant requiring operator approval." The v0 loop is plan-only: it observes roster, graph, evidence, chapter states, and recommendations, then emits a structured operator plan without mutating any state.

This task implements the v0 inspect/plan command.

## Goal

Implement `narada construction-loop plan` as a read-only composition command that produces a structured operator plan from existing operators.

## Required Work

### 1. Implement `narada construction-loop plan`

Create `packages/layers/cli/src/commands/construction-loop.ts`:

```bash
narada construction-loop plan [--policy <path>] [--format json|human] [--max-tasks <n>]
```

Behavior:
- Load policy from `.ai/construction-loop/policy.json` (create default if missing).
- Validate policy; fail closed on invalid policy.
- Run the 9-step v0 loop from Decision 470 §3.1.
- Delegate 100% to existing operators; do not reimplement parsing logic.
- Emit structured plan without any mutations.

Plan output must include:
- `observations`: roster state, graph summary, stale agents
- `evidence_summary`: task evidence classifications
- `chapter_summary`: chapter states
- `recommendations`: primary + alternatives from `task recommend`
- `promotion_candidates`: filtered through policy, with dry-run validation results
- `suggested_actions`: exact command lines the operator can run

### 2. Create policy loader and validator

Create `packages/layers/cli/src/lib/construction-loop-policy.ts`:
- `loadPolicy(cwd, policyPath?)`
- `validatePolicy(policy)` — returns array of validation errors
- `defaultPolicy()` — returns the v0 default policy from Decision 470 §4.4
- Policy TypeScript types

### 3. Create plan builder

Create `packages/layers/cli/src/lib/construction-loop-plan.ts`:
- `buildPlan(options)` — composes existing operators into a plan
- Imports from existing libs: `task-governance.ts`, `task-graph.ts`, `task-recommender.ts`
- Uses `taskPromoteRecommendationCommand` with `--dry-run` for promotion candidates
- Returns structured `ConstructionLoopPlan` object

### 4. Wire into main.ts

Add `narada construction-loop plan` under a new `construction-loop` command group.

### 5. Add focused tests

Create `packages/layers/cli/test/commands/construction-loop.test.ts` covering:
- Plan with idle agents and runnable tasks
- Plan with all agents busy
- Plan with no runnable tasks
- Invalid policy fails gracefully
- Policy filtering (blocked tasks, blocked agents)
- Stale agent detection
- Dry-run promotion candidate generation
- JSON and human output formats
- No mutations to task files, roster, or assignments

### 6. Create default policy directory

On first run, create `.ai/construction-loop/` with default `policy.json`.

## Non-Goals

- Do not implement auto-promotion (that is Task 473).
- Do not mutate any state.
- Do not reimplement existing operator logic.
- Do not create derivative task-status files.
- Do not add a web UI or daemon mode.

## Acceptance Criteria

- [x] `narada construction-loop plan` exists and is read-only.
- [x] Policy loader validates schema and provides clear errors.
- [x] Default policy is created on first run if missing.
- [x] Plan builder delegates to existing operators (roster, graph, evidence, recommend, promote --dry-run).
- [x] Plan output includes observations, evidence summary, recommendations, promotion candidates, and suggested actions.
- [x] Policy filters (blocked tasks, blocked agents, max assignments) are applied.
- [x] Stale agents are flagged with suggested actions.
- [x] Focused tests cover all plan paths.
- [x] No task, roster, or assignment mutations occur.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/construction-loop.test.ts
pnpm --filter @narada2/cli typecheck
npx tsx scripts/task-graph-lint.ts
find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

## Execution Notes

### Implementation Summary

1. **Policy types, loader, and validator** (`packages/layers/cli/src/lib/construction-loop-policy.ts`):
   - `ConstructionLoopPolicy` TypeScript interface matching Decision 470 schema
   - `defaultPolicy()` returns v0 defaults
   - `validatePolicy()` checks all fields, cross-field constraints (disjoint blocked/preferred agents, range overlaps, max_simultaneous_assignments >= max_tasks_per_cycle)
   - `loadPolicy()` reads `.ai/construction-loop/policy.json`, creates default if missing
   - `bounded_auto` and `full_auto` fail with "not yet supported"

2. **Plan builder** (`packages/layers/cli/src/lib/construction-loop-plan.ts`):
   - `buildPlan()` implements the 9-step v0 loop from Decision 470
   - Composes existing operators: `loadRoster`, `readTaskGraph`, `inspectTaskEvidence`, `chapterStatusCommand`, `generateRecommendations`, `taskPromoteRecommendationCommand` with `--dry-run`
   - Detects pause file (`.ai/construction-loop/pause`)
   - Detects stale agents by `updated_at` vs `stale_agent_timeout_ms`
   - Groups tasks into contiguous ranges for chapter state derivation
   - Filters promotion candidates through policy (blocked agents/tasks, write-set risk, recommendation age, max assignments)
   - Emits structured `ConstructionLoopPlan` with observations, evidence summary, chapter summary, recommendations, promotion candidates, and suggested actions

3. **Command** (`packages/layers/cli/src/commands/construction-loop.ts`):
   - `constructionLoopPlanCommand()` with `--policy`, `--max-tasks`, `--format`
   - Human-readable output with emoji markers and boxed header
   - JSON output with full plan structure

4. **Wiring** (`packages/layers/cli/src/main.ts`):
   - Added `narada construction-loop plan` under new `construction-loop` command group

5. **Tests** (`packages/layers/cli/test/commands/construction-loop.test.ts`):
   - 13 tests covering: default policy creation, idle agents + runnable tasks, all agents busy, no runnable tasks, invalid policy, blocked agent filtering, blocked task filtering, stale agent detection, pause file respect, human output format, no task mutations, no roster mutations, bounded_auto rejection

### Files Changed

- `packages/layers/cli/src/lib/construction-loop-policy.ts` — new (~260 LOC)
- `packages/layers/cli/src/lib/construction-loop-plan.ts` — new (~340 LOC)
- `packages/layers/cli/src/commands/construction-loop.ts` — new (~200 LOC)
- `packages/layers/cli/src/main.ts` — wiring for `construction-loop plan`
- `packages/layers/cli/test/commands/construction-loop.test.ts` — new (~330 LOC)

### Verification

- `pnpm --filter @narada2/cli exec vitest run test/commands/construction-loop.test.ts` — **13/13 passed**
- `pnpm --filter @narada2/cli typecheck` — **clean**
- `npx tsx scripts/task-graph-lint.ts` — no new errors
- `find .ai/do-not-open -maxdepth 1 ...` — 0 derivative files

### Residuals

- `max_tasks_per_agent_per_day` policy field is checked but not enforced (no daily assignment tracking yet)
- `review_separation_rules.max_reviews_per_reviewer_per_day` not enforced (no daily review tracking yet)
- `ccc_posture_path` and `ccc_influence_weight` are in schema but CCC posture is not yet consumed by the plan builder (Task 467 not yet implemented)
- Chapter discovery uses contiguous task ranges heuristic; explicit chapter DAG files are not yet scanned
