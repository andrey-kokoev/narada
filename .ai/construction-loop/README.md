# Construction Loop Policy

> **Operator-owned configuration for the construction loop controller.**
>
> This directory contains the policy that governs how the construction loop controller composes task operators into an operator plan. It is **advisory configuration**, not authority. The controller may never auto-promote, auto-assign, or mutate task state without explicit operator approval.

---

## Purpose and Authority

The construction loop policy is **operator-configured runtime guidance**. It:

- Sets autonomy boundaries (what the controller may suggest vs. what requires approval)
- Defines agent eligibility filters (allowed, blocked, preferred agents)
- Sets task eligibility filters (blocked task numbers and ranges)
- Configures safety thresholds (write-set risk, recommendation age, stale agent timeout)
- Defines stop conditions (what happens when agents are busy, no tasks are runnable, etc.)

It does **not**:
- Override task governance invariants
- Authorize autonomous assignment or promotion
- Modify task files, roster, or assignment state directly

---

## Schema (Version 1)

```typescript
interface ConstructionLoopPolicy {
  version: number;                              // Schema version, currently 1
  allowed_autonomy_level: AutonomyLevel;        // 'inspect' | 'recommend' | 'plan' | 'bounded_auto' | 'full_auto'
  require_operator_approval_for_promotion: boolean;
  dry_run_default: boolean;                     // Default --dry-run for promotion previews
  allow_auto_review: boolean;                   // Whether auto-review is permitted
  max_simultaneous_assignments: number;         // Max concurrent assignments across all agents
  max_tasks_per_cycle: number;                  // Max tasks to recommend per plan cycle
  max_tasks_per_agent_per_day: number;          // Max tasks per agent per 24h window
  allowed_agent_ids: string[];                  // Whitelist (empty = all allowed)
  blocked_agent_ids: string[];                  // Blacklist
  preferred_agent_ids: string[];                // Advisory preference (must not overlap blocked)
  blocked_task_ranges: Array<{ start: number; end: number }>;
  blocked_task_numbers: number[];
  require_evidence_before_promotion: boolean;
  review_separation_rules: {
    reviewer_cannot_review_own_work: boolean;
    max_reviews_per_reviewer_per_day: number;
    require_different_agent_for_review: boolean;
  };
  max_write_set_risk_severity: 'none' | 'low' | 'medium' | 'high';
  max_recommendation_age_minutes: number;       // Recommendations older than this are stale
  stale_agent_timeout_ms: number;               // Agent without update longer than this is stale
  stop_conditions: {
    on_all_agents_busy: 'wait' | 'recommend_anyway' | 'stop';
    on_no_runnable_tasks: 'suggest_closure' | 'suggest_new_tasks' | 'stop';
    on_cycle_limit_reached: 'stop' | 'queue_for_next_cycle';
    on_policy_violation: 'warn_and_continue' | 'stop' | 'escalate';
  };
  ccc_posture_path?: string;                    // Path to CCC posture file
  ccc_influence_weight: number;                 // 0.0–1.0, CCC advisory weight in scoring
}
```

### Field Descriptions

| Field | Description | Default |
|-------|-------------|---------|
| `version` | Schema version. Must be `1` for v0. | `1` |
| `allowed_autonomy_level` | Highest autonomy level permitted. v0 supports `inspect`, `recommend`, `plan`. `bounded_auto` and `full_auto` are reserved for future versions. | `plan` |
| `require_operator_approval_for_promotion` | If `true`, promotion candidates require explicit `--by <operator>` approval. | `true` |
| `dry_run_default` | Default to dry-run behavior when previewing promotions. | `true` |
| `allow_auto_review` | Whether the controller may suggest auto-review actions. v0: should be `false`. | `false` |
| `max_simultaneous_assignments` | Hard cap on concurrent assignments. Must be ≥ `max_tasks_per_cycle`. | `2` |
| `max_tasks_per_cycle` | Number of tasks the controller recommends per cycle. Must be ≤ `max_simultaneous_assignments`. | `1` |
| `max_tasks_per_agent_per_day` | Rate limit per agent to prevent overload. | `3` |
| `allowed_agent_ids` | If non-empty, only these agents are eligible. Empty means no restriction. | `[]` |
| `blocked_agent_ids` | These agents are never eligible. | `[]` |
| `preferred_agent_ids` | Advisory preference for scoring. Must not intersect `blocked_agent_ids`. | `[]` |
| `blocked_task_ranges` | Inclusive ranges of task numbers to exclude. Ranges must not overlap. | `[]` |
| `blocked_task_numbers` | Individual task numbers to exclude. | `[]` |
| `require_evidence_before_promotion` | If `true`, tasks without evidence summary block promotion. | `false` |
| `review_separation_rules` | Rules to prevent review conflicts. | see default |
| `max_write_set_risk_severity` | Recommendations with write-set risk above this level are blocked. | `medium` |
| `max_recommendation_age_minutes` | Recommendations older than this are considered stale. | `60` |
| `stale_agent_timeout_ms` | Minimum `30 * 60 * 1000` (30 minutes). | `1800000` |
| `stop_conditions` | Behavior when the loop encounters boundary conditions. | see default |
| `ccc_posture_path` | Optional path to CCC posture file for cross-cutting-concern influence. | `.ai/ccc/posture.json` |
| `ccc_influence_weight` | Weight of CCC posture in recommendation scoring. `0.0` disables CCC. | `0.3` |

---

## Example Policy Files

### Minimal

```json
{
  "version": 1,
  "allowed_autonomy_level": "plan",
  "require_operator_approval_for_promotion": true,
  "dry_run_default": true,
  "allow_auto_review": false,
  "max_simultaneous_assignments": 2,
  "max_tasks_per_cycle": 1,
  "max_tasks_per_agent_per_day": 3,
  "allowed_agent_ids": [],
  "blocked_agent_ids": [],
  "preferred_agent_ids": [],
  "blocked_task_ranges": [],
  "blocked_task_numbers": [],
  "require_evidence_before_promotion": false,
  "review_separation_rules": {
    "reviewer_cannot_review_own_work": true,
    "max_reviews_per_reviewer_per_day": 3,
    "require_different_agent_for_review": true
  },
  "max_write_set_risk_severity": "medium",
  "max_recommendation_age_minutes": 60,
  "stale_agent_timeout_ms": 1800000,
  "stop_conditions": {
    "on_all_agents_busy": "wait",
    "on_no_runnable_tasks": "suggest_closure",
    "on_cycle_limit_reached": "stop",
    "on_policy_violation": "stop"
  },
  "ccc_posture_path": ".ai/ccc/posture.json",
  "ccc_influence_weight": 0.3
}
```

### Strict

```json
{
  "version": 1,
  "allowed_autonomy_level": "recommend",
  "require_operator_approval_for_promotion": true,
  "dry_run_default": true,
  "allow_auto_review": false,
  "max_simultaneous_assignments": 1,
  "max_tasks_per_cycle": 1,
  "max_tasks_per_agent_per_day": 2,
  "allowed_agent_ids": [],
  "blocked_agent_ids": [],
  "preferred_agent_ids": [],
  "blocked_task_ranges": [],
  "blocked_task_numbers": [],
  "require_evidence_before_promotion": true,
  "review_separation_rules": {
    "reviewer_cannot_review_own_work": true,
    "max_reviews_per_reviewer_per_day": 2,
    "require_different_agent_for_review": true
  },
  "max_write_set_risk_severity": "low",
  "max_recommendation_age_minutes": 30,
  "stale_agent_timeout_ms": 1800000,
  "stop_conditions": {
    "on_all_agents_busy": "stop",
    "on_no_runnable_tasks": "stop",
    "on_cycle_limit_reached": "stop",
    "on_policy_violation": "escalate"
  },
  "ccc_posture_path": ".ai/ccc/posture.json",
  "ccc_influence_weight": 0.5
}
```

---

## Versioning Rules

- **v0** (current): Schema version `1`. Policy is advisory by default. `bounded_auto` is supported but requires explicit opt-in (`require_operator_approval_for_promotion: false`).
- **v1** (future): May introduce `full_auto` support and policy-migration helpers.
- **Breaking changes** bump the schema version. Non-breaking additions may keep the same version with additive fields.
- The loader rejects unknown schema versions with a clear error.

## Migration Notes

- There is **no auto-migration** from v0 to v1. Operators must explicitly rewrite the policy file.
- Future versions may provide `narada construction-loop policy migrate --from <version>`.
- The controller always validates policy before use. Invalid policies fall back to defaults with a warning.

---

## Storage

Policy is stored at `.ai/construction-loop/policy.json`. If missing, the controller creates the default policy on first run. The default policy is **conservative** (plan-only, dry-run default, approval required).

---

## CLI

```bash
# Display current effective policy
narada construction-loop policy show

# Create default policy file (idempotent)
narada construction-loop policy init

# Create strict policy file
narada construction-loop policy init --strict

# Validate existing policy and report all errors
narada construction-loop policy validate

# Run bounded auto-promotion (requires bounded_auto + approval disabled)
narada construction-loop run [--dry-run]

# Pause / resume the controller
narada construction-loop pause [--reason <text>]
narada construction-loop resume

# Show auto-promotion metrics
narada construction-loop metrics
```

---

## Auto-Promotion (Bounded Auto)

Auto-promotion is **explicitly opt-in** and bounded by 12 hard gates. It only activates when:

1. Policy `allowed_autonomy_level` is `bounded_auto`
2. Policy `require_operator_approval_for_promotion` is `false`

### Hard Gates

A candidate may only be auto-promoted if ALL of the following are true:

| # | Gate | Description |
|---|------|-------------|
| 1 | `autonomy_level` | `allowed_autonomy_level === 'bounded_auto'` |
| 2 | `operator_approval_disabled` | `require_operator_approval_for_promotion === false` |
| 3 | `task_468_validation` | All Task 468 validation checks pass (dry-run returns `dry_run_ok`) |
| 4 | `write_set_risk_low` | Write-set risk severity ≤ `low` |
| 5 | `recommendation_freshness` | Recommendation age ≤ 15 minutes |
| 6 | `task_status_opened` | Task status is `opened` (not `needs_continuation`) |
| 7 | `agent_idle_duration` | Agent roster status is `idle` or `done` for ≥ 5 minutes |
| 8 | `max_simultaneous` | Current active assignments < `max_simultaneous_assignments` |
| 9 | `task_not_blocked` | Task number not in `blocked_task_numbers` or `blocked_task_ranges` |
| 10 | `agent_not_blocked` | Agent not in `blocked_agent_ids` |
| 11 | `not_paused` | Controller is not paused (no `.ai/construction-loop/pause` file) |
| 12 | `daily_agent_limit` | Agent's daily promotions < `max_tasks_per_agent_per_day` |

### Audit Trail

Every auto-promotion attempt writes an append-only record to `.ai/construction-loop/audit/YYYY-MM-DD.jsonl`:

```json
{
  "timestamp": "2026-04-22T14:00:00.000Z",
  "promotion_id": "promotion-...",
  "task_id": "20260420-100-a.md",
  "task_number": 100,
  "agent_id": "a1",
  "policy_version": 1,
  "gate_results": [{"gate": "autonomy_level", "passed": true}, ...],
  "operator_overrideable": false,
  "dry_run": false,
  "status": "promoted"
}
```

### Metrics

```bash
narada construction-loop metrics
```

Tracks:
- `auto_promotions_total` — successful live promotions
- `auto_promotions_failed` — rejected by hard gates or live promotion failure
- `operator_overrides_total` — promotions with override flags
- `gate_rejections_by_reason` — count of rejections per gate
