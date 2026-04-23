# Work Result Reports

This directory contains durable `WorkResultReport` records submitted by agents when they believe a claimed task is ready for review.

## Schema

| Field | Type | Meaning |
|-------|------|---------|
| `report_id` | `string` | Stable ID: `wrr_<timestamp>_<task_id>_<agent_id>` |
| `task_number` | `number \| string` | Claimed task number |
| `task_id` | `string` | Full task file identifier |
| `agent_id` | `string` | Reporting principal / agent |
| `assignment_id` | `string` | Active assignment being reported |
| `reported_at` | `ISO 8601 string` | Submission timestamp |
| `summary` | `string` | Human-readable result summary |
| `changed_files` | `string[]` | Changed paths reported by the agent |
| `verification` | `{ command: string; result: string }[]` | Focused verification commands and results |
| `known_residuals` | `string[]` | Known gaps, blockers, or deferred items |
| `ready_for_review` | `boolean` | Whether the agent believes the work is ready |
| `report_status` | `"submitted" \| "accepted" \| "rejected" \| "superseded"` | Report lifecycle state |

## Invariants

- A report does **not** close a task. It is evidence, not authority.
- A report does **not** prove correctness. It is a principal's belief that work is ready for review.
- Reports are **append-only**. A rejected report remains in history.
- A task may have **multiple reports** over time, but **one assignment_id → at most one submitted WorkResultReport**.
  - Report identity is deterministic: `wrr_<hash>_<task_id>_<agent_id>` where the hash is derived from `task_id`, `agent_id`, and `assignment_id`.
  - Re-invoking `narada task report` for the same assignment returns the existing report without creating a duplicate.
- Report status transitions are governed by review: `submitted` → `accepted` or `rejected`.

## File Naming

Each report is stored as `<report_id>.json` in this directory.

## CLI Usage

Submit a report:

```bash
narada task report <task-number> \
  --agent <agent-id> \
  --summary "Implemented X, verified with Y" \
  --changed-files "src/foo.ts,src/bar.ts" \
  --verification '[{"command":"pnpm test","result":"passed"}]' \
  --residuals '["Edge case Z not yet covered"]'
```

Review with report linkage:

```bash
narada task review <task-number> \
  --agent <reviewer-id> \
  --verdict accepted \
  --report <report-id>
```
