# Route Live Control Plane Through Fact Boundary

## Context

Tasks 038–046 successfully introduced kernel-level Source, Fact, Intent, TimerSource, ProcessExecutor, WorkerRegistry, ObservationPlane, and the documentation rebinding that positions mailbox as one vertical built on top of the kernel.

However, the live control-plane path is still operationally centered on mailbox-shaped ingress:

- sync emits changed conversations
- foreman opens work from `changed_conversations`
- scheduler and resolution remain conversation/work-item centric
- Fact exists as a durable kernel boundary, but is not yet the primary live admission boundary for policy

This leaves Narada in a transitional state:

- the kernel exists
- mailbox is described as one vertical
- but the main operational path is still mailbox-first in practice

## Goal

Make Fact the actual live admission boundary into policy/control-plane processing, so that mailbox and future sources are operationally peers rather than only architecturally peers.

## Required Outcome

After this task:

- live source ingestion produces durable facts first
- policy/foreman work opening derives from facts, not mailbox-privileged changed-conversation signals
- mailbox remains one vertical, but no longer holds privileged ingress semantics in the live path
- existing mailbox behavior is preserved

## Required Work

### 1. Define fact-to-policy admission boundary

Introduce an explicit boundary where newly ingested facts are the unit that policy/control-plane admission consumes.

This does not require abolishing work items.

It does require that:
- work opening becomes derived from facts
- not directly from mailbox-specific sync output

### 2. Refactor sync/dispatch integration

Current daemon dispatch logic must stop treating mailbox-specific changed-conversation output as the primary live trigger.

Instead:

- source pull
- source record → fact
- fact persistence
- fact-driven admission/opening of work

Mailbox-specific fact interpretation is allowed.
Mailbox-privileged ingress shortcuts are not.

### 3. Preserve mailbox behavior through fact derivation

The mailbox vertical may still derive:
- conversation_id
- revision effects
- work-item supersession
- charter routing context

But those must now be downstream of facts.

### 4. Add a fact admission surface

Introduce minimal store/query surface needed to:
- read newly ingested or not-yet-admitted facts
- mark fact admission if necessary
- replay admission safely without duplicate work opening

Keep this minimal and deterministic.

### 5. Ensure TimerSource can use the same live path

Do not make this mailbox-only.

At least one non-mailbox source (`TimerSource`) must be able to enter the same live admission path:
- timer source
- timer fact
- policy admission
- intent emission

### 6. Preserve existing invariants

This refactor must not break:
- crash/replay determinism
- work-item lease semantics
- effect-of-once boundary
- mailbox behavior
- policy/foreman authority

### 7. Add tests

Add tests proving:

A. mailbox source records become facts before work opens  
B. work opening is driven from facts, not direct changed-conversation shortcuts  
C. replayed facts do not duplicate work opening  
D. timer facts can enter the same policy admission path  
E. existing mailbox end-to-end behavior still passes

## Invariants

1. Fact is the first canonical durable and replay-stable boundary.
2. Policy/Foreman consumes facts, not source-specific ingress shortcuts.
3. Mailbox-specific work derivation is permitted only downstream of facts.
4. Duplicate fact replay must not duplicate work opening or effects.
5. Existing mailbox behavior must be preserved while removing mailbox privilege at ingress.

## Constraints

- do not perform a giant rewrite
- do not abolish work items
- do not redesign Intent or executor families
- do not weaken crash/idempotency guarantees
- do not introduce speculative event-bus/framework machinery

## Deliverables

- live fact-admission integration
- refactored daemon/sync-to-policy flow
- minimal fact admission/query surface
- tests proving mailbox + timer can enter through same live fact boundary
- small docs update clarifying that Fact is now operationally, not only structurally, the first kernel boundary

## Acceptance Criteria

- live control-plane admission is fact-driven
- mailbox no longer has privileged ingress semantics in practice
- timer can use the same admission path
- existing mailbox behavior remains correct
- tests pass

## Definition of Done

Narada’s kernel thesis becomes operationally true:
Fact is not only present in code, but is the real live admission boundary into policy/control-plane behavior.