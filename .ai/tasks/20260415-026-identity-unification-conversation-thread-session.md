.ai/tasks/20260415-026-identity-unification-conversation-thread-session.md

# Identity Unification — conversation_id, thread_id, session_id

## Context

The system currently operates with multiple overlapping identity domains:

- `conversation_id` — from normalized message layer
- `thread_id` — local deterministic grouping
- implicit agent runtime session identity (CLI / daemon lifecycle)

There is no enforced mapping or invariant between them.

As a result:
- replay scope is ambiguous
- traces and executions may fragment
- multi-session execution cannot be reasoned about deterministically

This is a structural semantic cavity.

---

## Goal

Define and enforce a **single identity model** with explicit relationships:

> conversation_id → thread_id → session_id(s)

with clear invariants and usage boundaries.

---

## Required Decisions (must be made explicitly)

### 1. Canonical Thread Anchor

Choose one:

A. `conversation_id` is canonical; `thread_id` is derived  
B. `thread_id` is canonical; `conversation_id` is external reference

Must define:

- which key is used for:
  - work_item grouping
  - scheduler scanning
  - replay scope

---

### 2. Session Identity

Introduce explicit `session_id`:

- represents a single agent execution lifecycle
- spans:
  - multiple execution_attempts
  - potentially multiple work_items (or not — must decide)

Define:

- when session starts
- when session ends
- whether sessions can overlap for same thread

---

### 3. Mapping Invariants

Must define and enforce:

- 1 conversation_id → 1 thread_id (or not — must be explicit)
- 1 thread_id → N session_id
- session_id → execution_attempts

No implicit joins allowed.

---

## Required Schema Changes

If needed, introduce:

- `agent_sessions` table:
  - session_id
  - thread_id
  - started_at
  - ended_at
  - status

Ensure:

- foreign keys or equivalent invariants exist
- no orphan execution_attempt exists without session

---

## Required Code Changes

- ensure scheduler operates on canonical identity only
- ensure daemon dispatch carries session_id through:
  - execution_attempt
  - tool_call_records
  - outbound_commands (if needed)

- remove any ambiguous joins between thread_id and conversation_id

---

## Required Tests

- multi-message thread → single thread_id invariant holds
- multiple daemon restarts → session continuity behaves as defined
- parallel sessions (if allowed) behave deterministically
- replay uses correct identity scope

---

## Non-Goals

- do not redesign scheduler
- do not change runtime
- do not introduce arbitration logic
- do not expand tool system

---

## Acceptance Criteria

- identity model is explicitly defined and documented
- all identity joins are unambiguous
- session lifecycle is observable and testable
- replay scope is deterministic

---

## Definition of Done

The system has:

- one canonical thread identity
- explicit session identity
- no implicit or ambiguous identity joins