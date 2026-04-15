# Generalize Outbound into Intent Log

## Context

Once Fact exists, Narada needs a domain-neutral effect boundary.

Today mailbox-oriented outbound commands still define the effect shape too strongly.

This task generalizes that boundary into Intent while preserving mailbox behavior.

## Goal

Refactor mailbox-specific outbound mutation flow into a domain-neutral Intent log such that mailbox effects become one family of intents.

## Required Outcome

After this task:

- Narada has a universal durable Intent boundary
- mailbox effects are represented as intent kinds
- no side effect bypasses intent admission
- existing mailbox behavior is preserved through mailbox-specific intent execution

## Required Work

### 1. Define Intent envelope

Introduce a durable Intent type.

It must include enough to express:

- intent_id
- intent_type
- target executor family
- payload_json
- idempotency_key
- created_at
- status/lifecycle as needed

The envelope must be domain-neutral.

### 2. Define mailbox intents as a vertical family

Map current mailbox actions into intent kinds such as:

- `mail.send_reply`
- `mail.send_new_message`
- `mail.mark_read`
- `mail.move_message`

Exact names may differ, but mailbox must become one intent family, not the universal shape.

### 3. Preserve idempotency boundary

All effect materialization must still pass through deterministic idempotency logic.

This task must preserve:
- effect-of-once semantics
- replay safety
- crash-safe recovery

### 4. Rebind foreman handoff to Intent

Foreman should no longer think in mailbox-privileged “outbound command” terms at the kernel boundary.

It may still use mailbox vertical executors downstream, but the admission boundary must become Intent.

### 5. Maintain compatibility path

If full replacement is too disruptive, provide a compatibility layer where:
- current outbound structures are backed by or mapped from Intent
- mailbox execution still works unchanged

### 6. Add tests

Add tests proving:

- mailbox actions materialize as intents
- retries/replay do not duplicate intents
- mailbox behavior still works through the mailbox executor path
- no effect bypasses intent admission

## Invariants

1. Intent is the universal durable effect boundary.
2. All side effects must pass through Intent.
3. Mailbox effects are one intent family, not the architectural essence.
4. Existing effect-of-once guarantees must survive this refactor.

## Constraints

- do not yet add process execution
- do not redesign policy/foreman authority
- do not break mailbox behavior
- do not create a speculative generic action DSL

## Deliverables

- Intent envelope/schema/store
- mapping from current mailbox outbound flow to Intent
- compatibility/update path for mailbox execution
- tests for idempotency and replay

## Acceptance Criteria

- mailbox effects are represented via Intent
- no duplicate effects are introduced
- existing mailbox behavior still passes
- Intent is clearly domain-neutral

## Definition of Done

Narada has a universal durable effect boundary and mailbox outboundness is no longer privileged.