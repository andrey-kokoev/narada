# Review Record Format

This directory contains durable review records for task work in the Narada governance system.

## Schema (static)

Each file is named `{review-id}.json` and contains:

```json
{
  "review_id": "string",
  "reviewer_agent_id": "string",
  "task_id": "string",
  "findings": [
    {
      "finding_id": "string (optional)",
      "severity": "blocking | major | minor | note",
      "description": "string",
      "location": "string | null (optional)",
      "target_task_id": "string | number (optional)",
      "category": "typecheck | test | logic | doc | boundary (optional)",
      "recommended_action": "fix | add_test | rewrite | defer | wontfix (optional)"
    }
  ],
  "verdict": "accepted | accepted_with_notes | rejected",
  "reviewed_at": "ISO-8601 timestamp"
}
```

## Verdict Semantics

- `accepted` — review passed, task may transition to `closed`.
- `accepted_with_notes` — review passed with non-blocking observations, task may transition to `closed`.
- `rejected` — review failed, task must return to `opened` or `claimed` for corrections.

## Invariants

- A task may have multiple review records (re-review after corrections).
- Only the latest review record determines the current verdict for a given task.
- Review records are append-only and human-readable.

## Authority

Only agents with `role: reviewer` or `role: admin` may execute the review operator. This is enforced at runtime by the `narada task review` command.

## Ownership

- **Static schema**: This directory and its record shape.
- **Operator**: `review` mutation (CLI command) creates records and transitions task status.
- **Observation**: Read-only reporting over review records.
