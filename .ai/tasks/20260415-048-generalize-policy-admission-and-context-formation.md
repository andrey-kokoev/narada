.ai/tasks/20260415-048-generalize-policy-admission-and-context-formation.md

# Generalize Policy Admission and Context Formation

## Context

Task 047 makes Fact the live admission boundary.

That closes the biggest operational contradiction, but the policy layer is still likely too mailbox-shaped in how it forms context and opens work.

Narada now needs policy admission that is fact-driven and domain-neutral at the kernel layer, while still allowing mailbox-specific policy families.

## Goal

Make policy admission consume facts through a generalized context-formation step rather than directly inheriting mailbox-thread semantics.

## Required Outcome

After this task:

- policy admission is fact-first
- context formation is explicit
- mailbox context becomes one vertical context strategy
- Timer/process and future verticals can form policy context without semantic cheating

## Required Work

### 1. Define generalized context formation boundary

Introduce a clear step between:
- fact ingestion/admission
- policy/foreman decision-making

This step must produce a context object or equivalent input for policy.

It must be domain-neutral at the kernel boundary.

### 2. Move mailbox context shaping behind a vertical adapter

Mailbox-specific context may still include:
- conversation_id
- recent message neighborhood
- mailbox policy metadata
- prior evaluations/decisions

But those must be produced by a mailbox context strategy, not assumed by the kernel.

### 3. Define minimal kernel context contract

The kernel must only require what policy truly needs, such as:
- context identity
- admitted fact neighborhood
- policy family binding
- capability envelope
- prior durable decisions if relevant

Do not leak mailbox concepts into the kernel contract.

### 4. Ensure TimerSource can form policy context

Timer facts must be able to produce a valid policy context through the same boundary.

### 5. Add tests

Add tests proving:
- mailbox facts form mailbox context through the new boundary
- timer facts form timer context without mailbox semantics
- policy admission is driven by context produced from facts
- replayed facts/context do not duplicate work opening or decisions

## Invariants

1. Policy admission must consume fact-derived context.
2. Context formation is explicit, not incidental.
3. Mailbox context is one vertical strategy, not the kernel default.
4. Kernel context contracts must remain mailbox-neutral.

## Constraints

- do not redesign Intent or executor families
- do not abolish current work items yet
- do not weaken crash/idempotency guarantees
- do not overbuild a generic ontology prematurely

## Deliverables

- generalized context formation boundary
- mailbox context adapter/strategy
- timer-compatible context formation path
- tests
- small docs update

## Acceptance Criteria

- policy/foreman no longer assumes mailbox-thread context at the kernel boundary
- mailbox and timer contexts both form through the same general step
- replay behavior remains correct
- tests pass

## Definition of Done

Narada’s policy layer becomes fact-driven and context-explicit rather than mailbox-privileged.