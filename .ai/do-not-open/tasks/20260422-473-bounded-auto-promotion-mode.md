---
status: closed
depends_on: [471, 472, 468]
---

# Task 473 — Bounded Auto-Promotion Mode

## Context

Task 470 designed the construction loop controller as a plan-only assistant. Task 471 implements the plan command. Task 472 hardens policy validation. This task implements the **bounded auto-promotion** escalation: the controller may automatically promote recommendations under a tightened policy with explicit hard gates.

This is explicitly **deferred future work** from Decision 470. It should only be implemented after:
- Task 471 has been exercised for 20+ cycles
- Task 472 policy validation is stable
- Manual promotion override rate is <5%

## Goal

Enable `narada construction-loop run` to auto-promote recommendations under strict policy gates while preserving auditability and operator override.

## Required Work

### 1. Implement `narada construction-loop run`

Extend `packages/layers/cli/src/commands/construction-loop.ts`:

```bash
narada construction-loop run [--policy <path>] [--max-tasks <n>] [--dry-run]
```

Behavior:
- Load and validate policy.
- Require `allowed_autonomy_level: 'bounded_auto'` and `require_operator_approval_for_promotion: false` (explicit opt-in).
- Run the v0 loop.
- For each promotion candidate that passes ALL hard gates, call `taskPromoteRecommendationCommand` live (not dry-run).
- Write append-only audit records to `.ai/construction-loop/audit/`.
- Stop after `max_tasks_per_cycle` promotions or first gate failure.

### 2. Define hard gates

A candidate may only be auto-promoted if ALL of the following are true:

1. `allowed_autonomy_level === 'bounded_auto'`
2. `require_operator_approval_for_promotion === false`
3. All Task 468 validation checks pass with no overrides
4. Write-set risk severity ≤ `low`
5. Recommendation age ≤ 15 minutes
6. Task status is `opened` (not `needs_continuation`)
7. Agent roster status is `idle` or `done` for ≥ 5 minutes
8. Current active assignments < `max_simultaneous_assignments`
9. Task number not in `blocked_task_numbers` or `blocked_task_ranges`
10. Agent not in `blocked_agent_ids`
11. Operator has not paused the controller (check `.ai/construction-loop/pause` file)
12. Daily task count for agent < `max_tasks_per_agent_per_day`

### 3. Add audit log

Create `packages/layers/cli/src/lib/construction-loop-audit.ts`:
- `auditAutoPromotion(cwd, record)` — append-only JSON lines
- Audit record schema: timestamp, promotion_id, task_id, agent_id, policy_version, gate_results, operator_overrideable

Audit directory: `.ai/construction-loop/audit/YYYY-MM-DD.jsonl`

### 4. Add pause/resume surface

```bash
narada construction-loop pause [--reason <text>]
narada construction-loop resume
```

- `pause` creates `.ai/construction-loop/pause` with reason and timestamp
- `resume` removes the pause file
- `run` checks for pause file and aborts if present

### 5. Add metrics

Track and expose:
- `auto_promotions_total`
- `auto_promotions_failed`
- `operator_overrides_total`
- `gate_rejections_by_reason`

Expose via:
```bash
narada construction-loop metrics [--format json|human]
```

### 6. Add focused tests

Create `packages/layers/cli/test/commands/construction-loop-run.test.ts` covering:
- Auto-promotion succeeds when all gates pass
- Auto-promotion blocked when policy level is `plan`
- Auto-promotion blocked when write-set risk is `medium`
- Auto-promotion blocked when agent is stale
- Auto-promotion blocked when paused
- Audit records are append-only and complete
- `--dry-run` previews without mutation
- Daily task count limit enforced

### 7. Update docs

Update `.ai/construction-loop/README.md` with auto-promotion section and hard gates.
Update `docs/governance/task-graph-evolution-boundary.md` §11 with auto-promotion boundary.

## Non-Goals

- Do not implement `full_auto` autonomy level.
- Do not auto-review, auto-close, or auto-commit.
- Do not bypass `task promote-recommendation` — delegate to it live.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] `narada construction-loop run` exists with `--dry-run`.
- [x] Auto-promotion only activates under `bounded_auto` + `require_operator_approval_for_promotion: false`.
- [x] All 12 hard gates are checked and documented.
- [x] Failed gates are logged with specific reasons.
- [x] Audit records are append-only and include gate results.
- [x] Pause/resume surface works and blocks `run`.
- [x] Metrics track promotions, failures, and overrides.
- [x] Focused tests cover success and all gate failure paths.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/construction-loop-run.test.ts
pnpm --filter @narada2/cli typecheck
npx tsx scripts/task-graph-lint.ts
find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

## Execution Notes

### Implementation Summary

Task 473 implemented bounded auto-promotion mode for the construction loop controller:

- Added `packages/layers/cli/src/lib/construction-loop-audit.ts` — append-only JSON lines audit log with `auditAutoPromotion`, `readAuditLog`, `readAllAuditLogs`, and `computeMetrics`.
- Added `checkHardGates(ctx)` in `packages/layers/cli/src/commands/construction-loop.ts` — evaluates all 12 hard gates independently and returns structured `GateResult[]`.
- Added `constructionLoopRunCommand` — loads policy, builds plan, filters candidates, checks hard gates, promotes live (or dry-run preview), and writes audit records.
- Added `constructionLoopPauseCommand` / `constructionLoopResumeCommand` — file-based pause surface.
- Added `constructionLoopMetricsCommand` — computes and displays metrics from audit logs.
- Wired all commands into `packages/layers/cli/src/main.ts`:
  - `narada construction-loop run [--dry-run]`
  - `narada construction-loop pause [--reason]`
  - `narada construction-loop resume`
  - `narada construction-loop metrics`
- Updated `validatePolicyDeep` to accept `bounded_auto` (only `full_auto` remains rejected in v0).
- Updated `.ai/construction-loop/README.md` with auto-promotion section, hard gates table, audit trail docs, and metrics CLI.
- Updated `docs/governance/task-graph-evolution-boundary.md` §11 with auto-promotion boundary rules and CLI reference.

### Verification

- `pnpm --filter @narada2/cli exec vitest run test/commands/construction-loop-run.test.ts` — 19/19 focused tests pass.
- `pnpm --filter @narada2/cli exec vitest run test/commands/construction-loop.test.ts test/commands/construction-loop-policy.test.ts test/commands/construction-loop-run.test.ts` — 56/56 total tests pass.
- `pnpm --filter @narada2/cli typecheck` — clean.
- `find .ai/do-not-open -maxdepth 1 ...` — no derivative task-status files created.
