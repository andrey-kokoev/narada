# Rebind Mailbox as One Vertical

## Context

Tasks 038–045 extract the kernel:

- Source
- Fact
- Policy/Foreman
- Intent
- Execution
- recovery / worker / observation layers

The final step is to finish the perspective shift in code and docs so mailbox is clearly one vertical built on top.

## Goal

Finalize the architectural rebinding so mailbox is documented and structured as one vertical atop the generalized kernel.

## Required Outcome

After this task:

- mailbox is clearly one source family
- mailbox is clearly one policy/charter family
- mailbox is clearly one intent/executor family
- no remaining kernel type or core architecture narrative treats mailbox as privileged essence

## Required Work

### 1. Review kernel-vs-vertical boundaries

Identify remaining mailbox privilege leaks in:
- names
- package placement
- type boundaries
- docs
- assumptions in code comments

### 2. Rebind mailbox vertical explicitly

Make mailbox explicit as a composition across:
- ExchangeSource
- mailbox fact kinds
- mailbox policy/charter family
- mailbox intent family
- mailbox executor family

### 3. Remove stale architectural narratives

Update docs so they no longer imply:
- mailbox is the kernel center
- outbound mail is the universal effect shape
- timer/process automation is an add-on rather than same kernel usage

### 4. Ensure end-to-end parity story

Show, in code/docs/tests, that both:
- mailbox vertical
- timer/process vertical

travel through the same generalized kernel pipeline.

### 5. Add final validation tests if needed

At least enough to demonstrate:
- mailbox vertical still works
- timer/process vertical works
- both use same kernel layers

## Invariants

1. Mailbox is one vertical, not the architectural essence.
2. Kernel types must remain mailbox-neutral.
3. Existing mailbox behavior must be preserved.
4. Kernel story and code story must match.

## Constraints

- do not do a broad rewrite for its own sake
- preserve current mailbox behavior
- prefer extraction over replacement
- avoid mailbox-shaped names in kernel types
- do not reintroduce UI/terminal coupling

## Deliverables

- final code/doc cleanup aligning mailbox as one vertical
- updated architecture narrative
- validation that mailbox and timer/process share the same kernel story

## Acceptance Criteria

- mailbox is no longer privileged in kernel semantics
- docs and code tell the same story
- mailbox behavior remains preserved
- timer/process proof path remains valid

## Definition of Done

Narada is understandable as:
- a generalized deterministic kernel
- with mailbox as one vertical built on top.