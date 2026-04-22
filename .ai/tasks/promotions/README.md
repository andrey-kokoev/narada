# Assignment Promotion Records

This directory contains append-only `AssignmentPromotionRequest` records.

## Schema

| Field | Type | Meaning |
|-------|------|---------|
| `promotion_id` | `string` | Stable unique ID (`promotion-{timestamp}-{random}`) |
| `recommendation_id` | `string` | Source recommendation ID (for audit linkage) |
| `task_id` | `string` | Target task file basename |
| `task_number` | `number \| null` | Short task number extracted from filename |
| `agent_id` | `string` | Assigned agent |
| `requested_by` | `string` | Operator ID who requested promotion |
| `requested_at` | `ISO string` | When the promotion was requested |
| `executed_at` | `ISO string \| null` | When the promotion was executed (null until then) |
| `status` | `string` | `requested`, `executed`, `rejected`, `stale`, or `failed` |
| `recommendation_snapshot` | `object` | JSON snapshot of recommendation at promotion time |
| `validation_results` | `array` | Array of `{ check, passed, detail? }` objects |
| `override_reason` | `string \| undefined` | If `--override-risk` was used |
| `assignment_id` | `string \| undefined` | Reference to written assignment record |
| `failure_reason` | `string \| undefined` | If status is `rejected`, `stale`, or `failed` |

## Invariants

- Records are **append-only**. Never edit a file in place.
- If a promotion is retried, a **new record** is created.
- The `status` field describes the outcome of that specific attempt.
- `recommendation_snapshot` preserves evidence even if task/roster state later changes.

## CLI

```bash
# Promote a recommendation to an assignment
narada task promote-recommendation --task <n> --agent <id> --by <operator>

# Dry run (validate without mutating)
narada task promote-recommendation --task <n> --agent <id> --by <op> --dry-run

# Override stale/write-set risk
narada task promote-recommendation --task <n> --agent <id> --by <op> --override-risk "reason"
```
