# Foreman Arbitration and Action Governance

## Context

Tasks 024–029 establish:

- crash/replay determinism
- explicit runtime correctness
- unified identity
- non-authoritative traces
- mailbox policy routing
- outbound idempotency at the effect boundary

The next remaining cavity is that charter output can still be structurally valid while being semantically unsafe or internally conflicting.

Narada now needs a stricter foreman-level decision layer.

## Goal

Ensure that:

> no charter output becomes an outbound effect unless it passes explicit action governance and arbitration rules.

This task governs acceptance, rejection, escalation, and conflict resolution across evaluations.

## Required Work

### 1. Define Action Governance Rules

For every proposed action, foreman must evaluate:

- is action type allowed by mailbox policy
- is payload shape valid for that action
- does the action require human approval
- does the action conflict with current conversation/work state
- is confidence sufficient for autonomous execution

### 2. Define Arbitration Model

Support explicit arbitration outcomes:

- accept
- reject
- escalate
- no_op
- clarification_needed
- conflict_unresolved

Arbitration must be possible across:

- primary vs secondary charter outputs
- multiple evaluations on same work item
- replayed evaluations after retry

### 3. Define Confidence / Escalation Rules

Define when low-confidence output must:

- be rejected
- be downgraded to clarification_needed
- be escalated
- be accepted with restrictions

Do not leave this implicit.

### 4. Define Payload Validation Boundary

For each allowed action class, foreman must validate payload structure before handoff.

Examples:
- reply action must have required recipient/body fields
- mark_read must not carry irrelevant body payload
- move_message must specify target location

### 5. Define Approval Gate

If mailbox policy requires approval:

- foreman must stop before outbound command creation
- record decision as pending approval, not action_created

### 6. Tests

Add tests covering:

- structurally valid but policy-disallowed action
- low-confidence action downgraded to escalation
- conflicting primary/secondary actions
- invalid payload rejected before outbound handoff
- approval-required action not materialized automatically

## Invariants

1. Structural validity is not sufficient for effect.
2. Foreman is the final action authority before outbound handoff.
3. Arbitration rules must be deterministic.
4. No outbound command may be created from an ungoverned action.
