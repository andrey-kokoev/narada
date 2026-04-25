# Task State Machine Schema

Static schema for task lifecycle statuses and transitions.

## Statuses

| Status | Meaning | Allowed Transitions |
|--------|---------|---------------------|
| `draft` | Being written, not yet ready | → `opened` |
| `opened` | Ready for claim | → `claimed` |
| `claimed` | Assigned to an agent | → `in_review`, `opened` (abandoned), `needs_continuation` |
| `needs_continuation` | Execution budget exhausted or external blocker prevented safe continuation | → `claimed`, `opened` |
| `in_review` | Completed, awaiting review | → `closed`, `opened` (rejected) |
| `closed` | Review accepted, work done | → `confirmed` |
| `confirmed` | Chapter closure verified | (terminal) |

## Transition Rules

- Only the operators (`claim`, `release`, `review`) may mutate status.
- Transitions not listed in the table above are forbidden.
- `needs_continuation` is not a failure state. It means partial work exists and the task still needs execution.

## Front Matter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task_id` | `string \| number` | Yes | Unique task identifier |
| `status` | `string` | Yes | Current lifecycle status (see table above) |
| `depends_on` | `number[]` | No | Task numbers that must be terminal before this task can be claimed |
| `continuation_affinity` | `object` | No | Advisory signal for warm-agent routing (see below) |

### `continuation_affinity`

Optional nested object that expresses a preference for which agent should claim the task:

```yaml
continuation_affinity:
  preferred_agent_id: "kimicli"
  affinity_strength: 1
  affinity_reason: "Agent completed prerequisite Task 260"
```

| Sub-field | Type | Description |
|-----------|------|-------------|
| `preferred_agent_id` | `string` | Agent ID from the roster |
| `affinity_strength` | `number` | Higher = stronger preference (default 1) |
| `affinity_reason` | `string` | Human-readable justification |

Rules:
- Affinity is **advisory**: it must not block a task from being claimed by another agent.
- The claim operator may sort `opened` tasks by affinity strength when presenting runnable work.
- Manual affinity in the task file overrides computed affinity from assignment history.
- If `preferred_agent_id` is specified but the agent is inactive, the task remains runnable.

## Static vs Operator Boundary

- **Static schema**: This document defines what statuses exist and which transitions are valid.
- **Operator**: `claim`, `release`, `review`, `close` commands enforce transitions at runtime.
- **Pure tool/compiler**: A lint tool may verify task files contain only valid statuses.
