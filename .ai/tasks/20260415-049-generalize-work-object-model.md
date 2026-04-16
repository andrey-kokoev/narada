# Generalize Work Object Model

## Context

After Task 048, policy admission and context formation become more kernel-shaped.

The next cavity is that work objects are still likely too conversation/mailbox oriented.

Narada needs a generalized work model that remains schedulable, leasable, and replay-safe across verticals.

## Goal

Refactor the work object model so schedulable work is derived from generalized context rather than mailbox conversation semantics.

## Required Outcome

After this task:

- work objects are generalized beyond mailbox conversation assumptions
- mailbox work remains supported as one work family
- timer/process and future verticals can produce first-class work objects
- existing scheduler/lease semantics remain correct

## Required Work

### 1. Define generalized work identity

Introduce or refactor work identity so it can represent:
- mailbox-derived work
- timer-derived work
- future filesystem/webhook-derived work

The kernel work identity must not require conversation/thread semantics.

### 2. Define work derivation from context

Work opening must derive from context objects, not directly from mailbox revisions or conversations.

### 3. Preserve mailbox vertical behavior

Mailbox work may still map naturally to conversation-shaped contexts, but that must be vertical behavior, not kernel law.

### 4. Align scheduler/lease usage

Ensure scheduler and lease semantics operate on generalized work objects without assuming mailbox meaning.

### 5. Add tests

Add tests proving:
- mailbox contexts open mailbox work correctly
- timer contexts open timer work correctly
- scheduler/lease semantics remain deterministic across both
- replay does not duplicate work

## Invariants

1. Work is a generalized schedulable object.
2. Work identity must not require mailbox-specific semantics.
3. Lease and scheduler rules remain authoritative.
4. Mailbox remains one work family, not the default ontology.

## Constraints

- do not redesign policy admission again
- do not redesign executor families here
- do not weaken crash recovery or lease uniqueness
- do not overgeneralize into speculative workflow engines

## Deliverables

- generalized work object model
- derived work opening path from context
- scheduler/lease alignment
- tests
- small docs update

## Acceptance Criteria

- work objects are no longer mailbox-privileged in kernel semantics
- mailbox and timer can both produce work through the model
- existing scheduler guarantees remain intact
- tests pass

## Definition of Done

Narada’s schedulable unit becomes generalized and no longer implicitly means “mailbox conversation work.”