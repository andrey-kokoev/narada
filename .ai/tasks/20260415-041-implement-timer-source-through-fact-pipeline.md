# Implement TimerSource Through Fact Pipeline

## Context

Task 039 creates Fact.

This task is the first real proof that the kernel is not mailbox-shaped.

TimerSource must use the same Source → Fact → Policy path as Exchange.

## Goal

Add a first non-Exchange source that emits deterministic timer facts through the same pipeline.

## Required Outcome

After this task:

- Narada supports TimerSource
- timer ticks become facts such as `timer.tick`
- TimerSource uses the same Source → Fact path as Exchange
- no special-case policy/effect path is introduced

## Required Work

### 1. Define TimerSource

Implement a source that emits deterministic timer records according to schedule/slot semantics.

Timer identity must be explicit.

### 2. Define schedule-slot identity

A timer tick must be uniquely anchored by a deterministic slot identity.

It must not depend on process uptime or incidental wall-clock drift.

The semantics must answer:
- what defines a slot
- what constitutes duplicate tick emission
- how replay/restart behaves

### 3. Materialize timer facts

Compile timer source output into facts such as:
- `timer.tick`

These facts must use the same durable Fact envelope introduced in Task 039.

### 4. Route timer facts through the same policy entry path

Do not create:
- a direct scheduler shortcut
- an ad hoc worker callback path
- a terminal/CLI-triggered control loop

Timer must enter as facts like any other source domain.

### 5. Add tests

Add tests proving:

- timer ticks generate deterministic facts
- repeated runs do not duplicate the same slot fact
- timer facts survive replay/restart
- timer uses the same fact store/path as Exchange

## Invariants

1. TimerSource must prove the kernel abstraction is real.
2. Timer ticks are facts, not side effects.
3. Slot identity must be deterministic and replay-stable.
4. No source-specific shortcut may bypass the Fact boundary.

## Constraints

- do not yet add process execution
- do not redesign foreman authority
- do not introduce UI coupling
- do not create a separate timer-only scheduler architecture

## Deliverables

- TimerSource implementation
- timer slot identity rules
- timer fact materialization
- tests for replay/idempotency

## Acceptance Criteria

- timer facts exist in the same Fact system as mailbox facts
- duplicate slot emission is prevented deterministically
- restart/replay behavior is correct
- no source-specific shortcut path exists

## Definition of Done

Narada proves its kernel is real by supporting a non-mailbox source through the same Fact pipeline.