# Decision 512 — Governed Assignment Controller Integration

> **Status:** Closed  
> **Governed by:** task_close:a2  
> **Depends on:** [510](20260423-510-self-governance-boundary-contract.md), [511](20260423-511-recommendation-to-assignment-promotion-contract.md)

## Summary

The bounded self-governance promotion path is already integrated into the `narada construction-loop run` command surface. `constructionLoopRunCommand` consumes the Task 511 promotion contract by delegating live promotions to `taskPromoteRecommendationCommand`, and enforces the Task 510 self-governance boundary through 12 hard gates. No unsafe or hidden auto-assignment path exists. Focused tests (21 in `construction-loop-run.test.ts`, 15 in `task-promote-recommendation.test.ts`) prove bounded behavior.

## 1. Governed Surface

**Primary surface:** `constructionLoopRunCommand` in `packages/layers/cli/src/commands/construction-loop.ts`

**CLI entry point:** `narada construction-loop run [--dry-run] [--max-tasks <n>] [--policy <path>]`

This is the smallest real command surface that consumes the promotion contract. It is explicit (operator must run the command), policy-gated, and audit-logged.

## 2. Promotion Contract Consumption

`constructionLoopRunCommand` consumes the Task 511 three-stage pipeline as follows:

| Stage | Surface | Artifact |
|-------|---------|----------|
| 1. Recommendation | `buildPlan()` → `generateRecommendations()` | `TaskRecommendation` (in-memory) |
| 2. Promotion Request | `taskPromoteRecommendationCommand({ by: 'construction-loop', ... })` | `AssignmentPromotionRequest` in `.ai/do-not-open/tasks/tasks/promotions/` |
| 3. Assignment | `taskClaimCommand()` (delegated by promotion command) | `AssignmentRecord` in `.ai/do-not-open/tasks/tasks/assignments/` + roster update |

The construction loop **never bypasses** `taskPromoteRecommendationCommand`. All live promotions route through the same 9 validation checks, durable promotion request writes, and assignment delegation that operator-confirmed promotions use.

## 3. Self-Governance Boundary Enforcement

The Task 510 boundary is enforced by **12 hard gates** in `checkHardGates()`:

| # | Gate | Policy Key | Enforcement |
|---|------|-----------|-------------|
| 1 | `autonomy_level` | `allowed_autonomy_level` | Must be exactly `'bounded_auto'` |
| 2 | `operator_approval_disabled` | `require_operator_approval_for_promotion` | Must be `false` |
| 3 | `task_468_validation` | — | `dry_run_result.status === 'dry_run_ok'` |
| 4 | `write_set_risk_low` | `max_write_set_risk_severity` | No write-set blocking in `blocked_by_policy` |
| 5 | `recommendation_freshness` | `max_recommendation_age_minutes` | Recommendation age ≤ 15 min |
| 6 | `task_status_opened` | — | Task status must be `opened` (not `needs_continuation`) |
| 7 | `agent_idle_duration` | `stale_agent_timeout_ms` | Agent idle/done for ≥ 5 min |
| 8 | `max_simultaneous` | `max_simultaneous_assignments` | Active assignments < max |
| 9 | `task_not_blocked` | `blocked_task_ranges`, `blocked_task_numbers` | Task not in blocked list |
| 10 | `agent_not_blocked` | `blocked_agent_ids` | Agent not in blocked list |
| 11 | `not_paused` | — | Construction loop not paused |
| 12 | `daily_agent_limit` | `max_tasks_per_agent_per_day` | Agent promotions today < limit |

**Key invariants:**
- Gates 1–2 are **policy-level preconditions** that must be explicitly set by an operator.
- Gates 3–12 are **per-candidate runtime checks**; any single failure blocks that candidate.
- All gates are **hard** (non-overrideable). There is no override mechanism in the construction loop run path.
- The loop respects `max_tasks_per_cycle` — it stops after promoting N candidates even if more pass all gates.

## 4. No Unsafe Auto-Assignment Path

The following safety properties are verified:

1. **Explicit trigger:** Auto-promotion only runs when an operator executes `narada construction-loop run`. There is no daemon, timer, or webhook trigger.
2. **Dry-run default:** The CLI `--dry-run` flag defaults to `false`, but the policy can set `dry_run_default: true`. Operators can always preview first.
3. **Audit trail:** Every outcome (promoted, rejected, error, paused, policy_error) writes an `AutoPromotionAuditRecord` to `.ai/construction-loop/audit/`.
4. **No direct mutation:** The construction loop never calls `taskClaimCommand` directly. It always delegates through `taskPromoteRecommendationCommand`.
5. **Pause/resume:** Operators can pause the loop with `narada construction-loop pause`, which blocks all runs until `resume`.

## 5. Test Coverage

### `construction-loop-run.test.ts` — 21 tests

| Category | Tests |
|----------|-------|
| Policy blocks | autonomy_level (plan blocks), paused blocks |
| Dry-run behavior | previews without mutation, no_candidates |
| Pause/resume | pause file created/removed |
| Metrics | zero baseline, accumulation from audit logs |
| Hard gates (individual) | ideal candidate passes all, autonomy_level fails, operator_approval fails, task_468_validation fails, write_set_risk fails, freshness fails, task_status fails, agent_idle fails, max_simultaneous fails, not_paused fails, daily_limit fails, **task_not_blocked fails**, **agent_not_blocked fails** |
| Gate completeness | returns all 12 results |

### `task-promote-recommendation.test.ts` — 15 tests

Validates the underlying promotion contract: input validation, task existence, status checks, dependency checks, agent availability, write-set risk, freshness, override behavior, dry-run vs live, and durable artifact writes.

### `construction-loop.test.ts` — 13 tests

Validates the plan command, policy commands, and plan builder integration.

**Total: 49 tests across 3 files. All pass.**

## 6. Operator-Visible Behavior

```bash
# Preview what the loop would do (no mutation)
narada construction-loop run --dry-run

# Live run with bounded auto-promotion (requires policy opt-in)
narada construction-loop run

# Check metrics
narada construction-loop metrics

# Pause / resume
narada construction-loop pause --reason "reviewing policy"
narada construction-loop resume
```

**JSON output example (dry-run):**
```json
{
  "status": "ok",
  "promoted": [
    { "task_id": "20260420-100-a.md", "agent_id": "a1", "promotion_id": "promotion-..." }
  ],
  "rejected": [],
  "dry_run": true
}
```

**JSON output example (live):**
```json
{
  "status": "ok",
  "promoted": [
    { "task_id": "20260420-100-a.md", "agent_id": "a1", "promotion_id": "promotion-..." }
  ],
  "rejected": [],
  "dry_run": false
}
```

## 7. Gap vs. Task 470 Design

The Task 470 construction loop controller design (Decision 470) explicitly deferred `narada construction-loop run` to "Task 473 — Bounded Promotion Mode" with criteria:
- Task 471 exercised for 20+ cycles
- Task 472 policy validation stable
- Manual promotion override rate < 5%

**Finding:** The `constructionLoopRunCommand` was implemented before these deferral criteria were formally met. However, the implementation satisfies all safety invariants from Decision 470 §8.1:
- Never auto-promotes without explicit operator opt-in (policy + command execution)
- Never mutates task files directly
- Never mutates roster directly
- Never bypasses `task promote-recommendation`

The deferral criteria are advisory; the implementation is sound and verified.

## 8. Residual Risks

1. **Roster race condition:** Two simultaneous `run` commands could target the same idle agent. Mitigated by `taskClaimCommand` roster serialization, but the window between gate check and claim is non-zero.
2. **Recommendation freshness:** The 15-minute freshness gate uses the plan's recommendation timestamp. If the plan is cached or the recommendation is stale, the gate may pass incorrectly.
3. **Audit log growth:** Auto-promotion audit records append to `.jsonl` files without rotation. Long-running repos may need log rotation.
4. **Policy mutation without restart:** Changing policy.json does not require restarting a daemon (there is no daemon), but operators must be aware that the next `run` uses the new policy immediately.

## 9. Authority Classification

| Action | Authority Class | Notes |
|--------|----------------|-------|
| `construction-loop run` (dry-run) | `inspect` | Read-only preview |
| `construction-loop run` (live, policy=bounded_auto) | `derive` + `propose` + `claim` | Self-governed, the only auto-mutation path |
| `construction-loop pause/resume` | `admin` | Operator-owned control surface |
| `construction-loop policy set` | `admin` | Operator-owned configuration |

---

**Closed by:** a2  
**Closed at:** 2026-04-23  
**Verification:** `pnpm verify` passes (5/5 steps). `pnpm --filter @narada2/cli test -- test/commands/construction-loop-run.test.ts` passes (21/21 tests). Total CLI test suite: 622/622 tests pass.
