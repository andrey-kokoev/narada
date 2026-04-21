# Task 288: Implement Autonomous Send as Approved-Draft Execution

## Chapter

Post-Operation Realization

## Context

Narada already has the correct durable boundaries for outbound mailbox effects up to draft creation:

- charter/runtime proposes `draft_reply`
- foreman governs proposal into durable outbound work
- outbound worker creates and manages the Graph draft
- command stops at `draft_ready` when approval is required

What is missing is the coherent autonomous-send completion of this pipeline.

That completion must **not** take the shape “agent sends mail”. It must take the shape:

1. draft exists as durable object
2. explicit promotion/operator/policy marks it sendable
3. dedicated daemon/worker performs the actual send with retries and reconciliation

This keeps effect execution mechanical and bounded, rather than intelligence-owned.

## Goal

Extend the existing outbound command pipeline so approved drafts can be sent by a dedicated worker/daemon path, with durable state transitions, retry semantics, and reconciliation, without violating current authority boundaries.

## Required Work

### 1. Define the Missing Promotion Boundary

Add the explicit state boundary between “draft exists” and “send may be executed”.

This may be one of:

- a new outbound status such as `approved_for_send`
- a separate promotion flag / field if that is cleaner

Requirements:

- `draft_ready` remains “draft exists, not yet sendable”
- promotion into sendable state must be explicit and auditable
- no send execution may occur directly from charter output
- no send execution may occur directly from mere draft existence

### 2. Add the Dedicated Send Execution Path

Implement the worker/daemon path that:

- scans only sendable approved drafts
- calls Graph send through the existing outbound/source adapter boundary
- records durable transitions for:
  - execution start
  - retryable failure
  - terminal failure
  - submitted

Requirements:

- this path belongs in outbound worker/daemon execution, not in charter runtime
- retries must be mechanical
- send execution must be idempotent relative to the command/version model

### 3. Preserve Reconciliation As The Confirmation Boundary

Do not collapse submission and confirmation.

Requirements:

- send worker marks the command `submitted` when Graph accepts the send
- reconciliation remains responsible for `confirmed`
- no synthetic confirmation is allowed

### 4. Add Operator / Promotion Surface

Create or extend the explicit operator surface that moves a draft from review state into sendable state.

Requirements:

- action is audited
- action is distinct from send execution
- approval is not itself the send

If autonomous send policy exists, it must still route through the same sendable-state boundary.

### 5. Document The Updated Outbound Lifecycle

Update the canonical docs/task artifacts so the mailbox vertical clearly reflects:

- draft boundary
- approval/promotion boundary
- send execution boundary
- confirmation boundary

## Execution Mode

Start in planning mode before editing.

The plan must name:

- intended write set
- invariants at risk
- dependency assumptions
- focused verification scope

## Non-Goals

- Do not let charter runtimes call Graph send directly.
- Do not collapse approval and send into one synchronous operator action.
- Do not change the rule that confirmation comes from reconciliation.
- Do not broaden this task into non-mail outbound families.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] There is an explicit durable boundary between `draft_ready` and send execution.
- [x] Send execution is performed only by a dedicated outbound worker/daemon path.
- [x] Approval/promotion is explicit, audited, and distinct from send execution.
- [x] `submitted` and `confirmed` remain separate boundaries.
- [x] Retryable vs terminal send failure is durably represented.
- [x] Docs reflect the updated outbound lifecycle and authority boundaries.
- [x] Focused verification covers the new send path and boundary behavior.
