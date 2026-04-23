---
closes_tasks: [490]
decided_at: 2026-04-23
decided_by: operator
---

# Decision: Task Attachment / Carriage Boundary

## Date

2026-04-23

## Problem

Narada task governance reconstructs the meaning of an agent's connection to a task from a mix of:

- agent roster role
- roster status
- command surface used
- continuation reason
- task/report/review state

This is semantically weak. The same roster state (`working`, task=N) can mean primary implementation, review, evidence repair, or takeover. Commands like `task roster assign` on an already-claimed task warn but do not record *what kind* of assignment is happening.

## Decision

Introduce a first-class semantic boundary:

```text
task attachment != task carriage
```

- **Attachment**: an agent is involved with a task in any durable capacity.
- **Carriage**: an agent is the current primary carrier of forward implementation ownership.

An agent may be attached without being the carrier. An agent may be the carrier while other agents are also attached (e.g., a reviewer, a repair continuation).

## Assignment Intent Enum

The minimal set of intent values that explains *what kind* of attachment this is:

| Intent | Meaning | Supersedes Prior Primary? |
|--------|---------|---------------------------|
| `primary` | Agent is the forward implementation carrier. | Only if prior primary is released. |
| `review` | Agent evaluates work done by the primary carrier. | No — parallel, not replacement. |
| `repair` | Agent fixes evidence gaps without taking ownership. | No — prior primary stays active. |
| `takeover` | Agent becomes the new primary carrier, replacing prior. | Yes — prior primary is released. |

### Justification

- `primary` is load-bearing: it is the default claim/assign intent and determines who owns forward work.
- `review` is load-bearing: it determines what evidence gate blocks `roster done` (review artifact vs WorkResultReport).
- `repair` is load-bearing: it distinguishes continuation-without-supersession from takeover. This prevents evidence-repair work from being mistaken for a new primary claim.
- `takeover` is load-bearing: it explicitly records that ownership transferred, which is necessary for assignment history, continuation affinity, and accountability.

No additional members are required at this time. `operator_override`, `blocked_agent`, and `handoff` are *reasons*, not intents.

## Intent vs Reason

These are separate layers:

- **Intent** (`primary`, `review`, `repair`, `takeover`) = *what kind* of attachment this is.
- **Reason** (`evidence_repair`, `review_fix`, `handoff`, `blocked_agent`, `operator_override`) = *why* this attachment exists.

### Reason layer evaluation

Current continuation reasons remain the right reason layer:

| Reason | Maps To Intent | Releases Prior Primary? |
|--------|---------------|------------------------|
| `evidence_repair` | `repair` | No |
| `review_fix` | `repair` | No |
| `handoff` | `takeover` | Yes |
| `blocked_agent` | `takeover` | Yes |
| `operator_override` | `takeover` | Yes |

Reasons are free-text-adjacent and may expand. Intents are the stable semantic enum that downstream code should match against.

## Operator Mapping

| Operator | Produces Intent | Produces Reason | Affects Carriage? |
|----------|-----------------|-----------------|-------------------|
| `task roster assign <n> --agent <id>` | `primary` | `claim_context` (free text) | Yes — sets carrier. |
| `task roster assign <n> --agent <id> --no-claim` | `primary` (advisory) | `claim_context` | No — roster only. |
| `task claim <n> --agent <id>` | `primary` | `claim_context` | Yes — sets carrier. |
| `task roster review <n> --agent <id>` | `review` | `review_assignment` | No — parallel attachment. |
| `task continue <n> --agent <id> --reason evidence_repair` | `repair` | `evidence_repair` | No — assists primary. |
| `task continue <n> --agent <id> --reason review_fix` | `repair` | `review_fix` | No — assists primary. |
| `task continue <n> --agent <id> --reason handoff` | `takeover` | `handoff` | Yes — transfers carrier. |
| `task continue <n> --agent <id> --reason blocked_agent` | `takeover` | `blocked_agent` | Yes — transfers carrier. |
| `task continue <n> --agent <id> --reason operator_override` | `takeover` | `operator_override` | Yes — transfers carrier. |
| `task report <n> --agent <id>` | Evidence attachment | (from active assignment) | No — evidence only. |
| `task review <n> --agent <id>` | Evidence attachment | (from active assignment) | No — evidence only. |
| `task finish <n> --agent <id>` | Completes intent | — | No — completion only. |
| `task roster done <n> --agent <id>` | Clears attachment | — | If primary, clears carrier. |

## Invariants

1. **At most one primary carriage at any time.** A `takeover` must release the prior primary before the new primary becomes active.
2. **Repair does not displace primary.** A `repair` intent creates a secondary attachment; the prior primary stays the carrier.
3. **Review is parallel.** A `review` intent does not affect the primary carrier.
4. **Evidence survives roster clearance.** A `task report` or `task review` creates a durable attachment (evidence artifact) that persists after `roster done` clears the roster entry.
5. **Intent is explicit, not inferred.** Commands that create attachments must record intent directly. Inferring intent from roster role or chat context is a fallback, not authority.

## Assignment Record Shape (Target)

The current assignment record in `.ai/tasks/assignments/README.md` should be extended to include `intent`:

```json
{
  "agent_id": "string",
  "claimed_at": "ISO-8601 timestamp",
  "claim_context": "string | null",
  "intent": "primary | review | repair | takeover",
  "released_at": "ISO-8601 timestamp | null",
  "release_reason": "completed | abandoned | superseded | transferred | budget_exhausted | continued | null"
}
```

The `intent` field is the canonical source of *what kind* of attachment this record represents. The `continuation_reason` field remains the *why*.

## What This Decision Does NOT Do

- It does not change any command schema yet. Schema changes are deferred to a later implementation task.
- It does not add runtime code, database schema, or CLI mutation surfaces.
- It does not make PE-lite or any other contract apply to every small code change.
- It does not weaken existing Narada authority boundaries.

## Closure Statement

The attachment/carriage boundary is defined, the intent enum is specified, and the operator mapping is recorded. This decision provides the semantic foundation for later schema and command changes without requiring them now.
