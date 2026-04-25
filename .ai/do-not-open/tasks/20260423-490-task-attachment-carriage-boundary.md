---
status: closed
created: 2026-04-23
owner: unassigned
depends_on: [487]
closed_at: 2026-04-23T15:48:56.093Z
closed_by: operator
---

# Task 490 - Task Attachment / Carriage Boundary

## Context

Narada task governance now has multiple ways for an agent to be connected to a task:

- primary assignment / claim
- review assignment
- continuation
- evidence repair
- takeover

The system currently reconstructs the meaning of that connection from a mix of:

- agent roster role
- roster status
- command surface used
- continuation reason
- task/report/review state

That is semantically weak. The deeper boundary is now visible:

```text
task attachment != task carriage
```

An agent may be attached to a task without being the carrier of forward implementation ownership.

## Goal

Define the canonical task-governance boundary between:

- **attachment**: an agent is involved with a task
- **carriage**: an agent is the current primary carrier of the task

This task is semantic/design work first. It should define the concept precisely enough that later implementation can stop inferring assignment meaning indirectly.

## Read First

- `SEMANTICS.md`
- `.ai/task-contracts/agent-task-execution.md`
- `AGENTS.md` Task Assignment and Claim Semantics
- `.ai/do-not-open/tasks/20260423-487-task-continuation-takeover-assignment-operator.md`
- `.ai/do-not-open/tasks/20260423-486-agent-completion-finalizer-report-evidence-roster-handoff.md`
- `.ai/do-not-open/tasks/tasks/assignments/README.md`

## Required Work

1. Define the boundary.
   - Explain the distinction between task attachment and task carriage.
   - State the invariants this preserves.

2. Define the minimal assignment intent enum.
   - Candidate shape to evaluate:
     - `primary`
     - `review`
     - `repair`
     - `takeover`
   - Justify each member or refine the set if one is not load-bearing.

3. Separate intent from reason.
   - Distinguish:
     - what kind of attachment this is;
     - why it exists.
   - Evaluate whether current continuation reasons remain the right reason layer.

4. Map the boundary onto current operators.
   - `task roster assign`
   - `task roster review`
   - `task continue`
   - `task finish`
   - `task report`
   - `task review`

5. Record the result in a decision or semantic note.
   - This task should not just leave chat conclusions behind.

## Non-Goals

- Do not implement schema changes in this task.
- Do not change commands yet.
- Do not broaden into generic project-management theory.

## Execution Notes

Created `.ai/decisions/20260423-490-task-attachment-carriage-boundary.md` defining the attachment/carriage boundary:

1. **Boundary definition**: attachment (any involvement) vs carriage (primary forward-implementation ownership).
2. **Intent enum** (`primary`, `review`, `repair`, `takeover`) with justification for each member.
3. **Intent/reason separation**: intent = what kind; reason = why. Mapped current continuation reasons onto intents.
4. **Operator mapping**: 13 operators mapped against intent, reason, and carriage effects.
5. **Invariants**: 5 invariants including single-primary-carriage, repair-non-displacing, review-parallel, evidence-survives-roster.
6. **Target assignment record shape**: proposed `intent` field extension.
7. **Non-scope boundary**: explicitly states what this decision does not do (no schema changes, no runtime code).

## Verification

- Decision artifact created at `.ai/decisions/20260423-490-task-attachment-carriage-boundary.md`.
- Manual verification: all referenced operators exist in CLI codebase (`task roster assign`, `task claim`, `task roster review`, `task continue`, `task report`, `task review`, `task finish`, `task roster done`).
- Intent/reason mapping is consistent with existing assignment record schema in `.ai/do-not-open/tasks/tasks/assignments/README.md`.
- No commands, schema, or runtime code were changed — this is a semantic decision only.

## Acceptance Criteria

- [x] Attachment vs carriage is defined explicitly.
- [x] Minimal assignment intent members are specified and justified.
- [x] Intent and reason are separated clearly.
- [x] Existing task-governance operators are mapped against the boundary.
- [x] A durable decision/spec artifact is created.
- [x] Verification evidence is recorded in this task.


