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
      "release_reason": "completed | abandoned | superseded | transferred | budget_exhausted | continued | null",
      "continuation_reason": "evidence_repair | review_fix | handoff | blocked_agent | operator_override | null",
      "previous_agent_id": "string | null",
      "intent": "primary | review | repair | takeover"
    }
  ],
  "continuations": [
    {
      "agent_id": "string",
      "started_at": "ISO-8601 timestamp",
      "reason": "evidence_repair | review_fix | handoff | blocked_agent | operator_override",
      "previous_agent_id": "string | null",
      "completed_at": "ISO-8601 timestamp | null"
    }
  ]
}
```

## Invariants

- At most one assignment per file may have `released_at: null` (the active assignment).
- `release_reason` is required when `released_at` is set.
- `claim_context` is optional free-text justification provided at claim time.
- Assignment history is append-only; released assignments are never removed.
- `continuations` tracks secondary agents working on the task without superseding the primary assignment (e.g., `evidence_repair`, `review_fix`).
- Takeover reasons (`handoff`, `blocked_agent`, `operator_override`) release the prior active assignment and create a new primary assignment.
- `intent` is the canonical source of *what kind* of attachment this record represents. The `continuation_reason` field remains the *why*.

## Intent Semantics

| Intent | Meaning | Supersedes Prior Primary? |
|--------|---------|---------------------------|
| `primary` | Agent is the forward implementation carrier. | Only if prior primary is released. |
| `review` | Agent evaluates work done by the primary carrier. | No — parallel, not replacement. |
| `repair` | Agent fixes evidence gaps without taking ownership. | No — prior primary stays active. |
| `takeover` | Agent becomes the new primary carrier, replacing prior. | Yes — prior primary is released. |

## Backward Compatibility

- Records created before the `intent` field was introduced are interpreted as `primary` by default.
- If `intent` is absent but `continuation_reason` is present, intent is inferred:
  - `evidence_repair`, `review_fix` → `repair`
  - `handoff`, `blocked_agent`, `operator_override` → `takeover`

## Ownership

- **Static schema**: This directory and its record shape.
- **Operator**: `claim`, `continue`, and `release` mutations (CLI commands).
- **Observation**: Read-only reporting over these files.
