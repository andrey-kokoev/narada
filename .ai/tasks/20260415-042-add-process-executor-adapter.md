# Add Process Executor Adapter

## Context

TimerSource proves non-mailbox ingress.

The next proof is non-mailbox effect materialization.

This task adds local process execution as a first-class executor family driven by Intent.

## Goal

Support timer fact → policy → intent → local subprocess execution through the same kernel boundaries.

## Required Outcome

After this task:

- Narada can materialize process-execution intents
- process execution is driven through Intent, not ad hoc loops
- logs/results are persisted
- no terminal/UI attachment is required for control

## Required Work

### 1. Define process intent family

Introduce process-related intent kinds such as:
- `process.run`
- or similarly precise process execution intent types

### 2. Implement process executor adapter

Add an execution adapter that:
- consumes process intents
- launches local subprocesses
- records durable start/completion/failure information
- remains idempotency-aware and recoverable

### 3. Persist execution results

Persist enough execution evidence for:
- status
- exit code
- stdout/stderr or bounded output references
- started/completed timestamps

### 4. Preserve effect boundary discipline

No process execution may occur:
- directly from TimerSource
- directly from policy logic
- directly from CLI/terminal-only flow

It must go through Intent.

### 5. Add end-to-end proof

At minimum, prove:
- `timer.tick` fact
- policy emits process intent
- process executor runs it
- durable result exists
- replay/retry does not duplicate improperly

### 6. Add tests

Add tests proving:
- process execution works without terminal coupling
- duplicate/replayed intents do not mis-materialize
- results are persisted durably
- mailbox and process executor families coexist cleanly

## Invariants

1. Process execution is one executor family, not a special control path.
2. All execution must remain subordinate to Intent.
3. Durable execution records are required.
4. No UI/terminal attachment may be required for correctness.

## Constraints

- do not redesign scheduler globally
- do not yet introduce worker registry policy
- do not build a terminal-oriented job runner
- do not bypass the existing recovery/idempotency discipline

## Deliverables

- process intent kinds
- process executor adapter
- durable execution result persistence
- end-to-end tests from timer to process execution

## Acceptance Criteria

- a timer-driven process execution path works through Source → Fact → Policy → Intent → Execution
- results are durably persisted
- replay/idempotency remain correct
- no terminal coupling exists

## Definition of Done

Narada can drive a non-mailbox effect path through the same kernel it uses for mailbox workflows.