# Task Assignment Record Format

This directory contains durable assignment records for task work in the Narada governance system.

## Schema (static)

Each file is named `{task-id}.json` and contains:

```json
{
  "task_id": "string",
  "assignments": [
    {
      "agent_id": "string",
      "claimed_at": "ISO-8601 timestamp",
      "claim_context": "string | null",
      "released_at": "ISO-8601 timestamp | null",
      "release_reason": "completed | abandoned | superseded | transferred | budget_exhausted | null"
    }
  ]
}
```

## Invariants

- At most one assignment per file may have `released_at: null` (the active assignment).
- `release_reason` is required when `released_at` is set.
- `claim_context` is optional free-text justification provided at claim time.
- Assignment history is append-only; released assignments are never removed.

## Ownership

- **Static schema**: This directory and its record shape.
- **Operator**: `claim` and `release` mutations (CLI commands).
- **Observation**: Read-only reporting over these files.
