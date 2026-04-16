# Task 054 — De-mailbox Charter Invocation Envelope

## Objective
Eliminate mailbox-specific assumptions (`conversation_id`, `mailbox_id`, `thread_context`) from the charter runtime contract and replace with domain-neutral invocation.

## Required Changes
- Replace invocation envelope shape with:
  - `context_id`
  - `scope_id`
  - `context_materialization` (opaque, vertical-specific)
  - `vertical_hints` (optional)
- Move mailbox thread assembly into a **MailboxContextMaterializer**
- Update `buildInvocationEnvelope` and all call sites
- Update charter runtime input schema and tests

## Acceptance Criteria
- No kernel/runtime code requires `conversation_id` or `mailbox_id`
- Mailbox still works via adapter
- Timer/webhook can invoke charters without mailbox fields

## Invariant
Kernel must not assume message/thread semantics