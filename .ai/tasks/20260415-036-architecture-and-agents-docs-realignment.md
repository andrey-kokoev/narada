# Architecture and AGENTS Docs Realignment

## Context

The codebase has advanced from:

- deterministic mailbox compiler only

to:

- compiler
- coordinator durable state
- scheduler
- foreman
- charter runtime
- tool execution
- outbound idempotent handoff
- multi-mailbox dispatch
- observability surfaces

The documentation must now be realigned so future contributors do not reintroduce older assumptions.

## Goal

Produce one coherent repo narrative such that:

> the code, tasks, architecture docs, and AGENTS instructions all describe the same system.

## Required Work

### 1. Canonical Vocabulary

Unify terminology for:

- conversation_id
- thread_id if retained as alias
- work_item
- execution_attempt
- session
- evaluation
- outbound intent / command
- trace
- mailbox policy

### 2. End-to-End Architecture Narrative

Update architecture docs to describe the full loop:

sync → changed conversation → work item → lease → execution → tool path → evaluation → foreman governance → idempotent outbound handoff → replay-safe recovery

### 3. AGENTS Guidance

Update AGENTS docs so coding agents know:

- what objects are authoritative
- what they must never use as truth
- where to anchor new features
- how task numbering/lineage should work
- how to avoid reintroducing hidden fallbacks or identity ambiguity

### 4. Remove Stale Narratives

Find and update docs that still imply:
- daemon merely wakes an agent on thread changes
- traces are central state
- hardcoded charter defaults are acceptable
- single-mailbox assumptions are universal

### 5. Tests / Validation if Applicable

If repo has doc validation or examples, update them accordingly.

## Invariants

1. Docs must reflect actual authority boundaries.
2. Docs must not contradict code or canonical tasks.
3. AGENTS guidance must reinforce de-arbitrarized architecture.
4. Stale architecture language is a real bug.

## Constraints

- do not redesign code in this task except tiny doc-alignment fixes
- do not introduce product marketing language
- do not leave multiple competing architecture narratives active

## Deliverables

- updated architecture docs
- updated AGENTS docs
- unified glossary
- final end-to-end sequence description

## Acceptance Criteria

- repo docs describe the actual implemented system
- AGENTS guidance matches the architecture
- stale contradictory narratives are removed
- future coding agents can orient correctly from docs alone

## Definition of Done

The repo has one coherent self-description aligned with the actual system.