# Mailbox ContextCase Specialization

## Mission
Define the mailbox-specific specialization of `ContextCase` for mail-backed threads and mailbox routing examples.

## Why This Exists
Mailbox is the first mature vertical, so examples need a concrete specialization that can model:

- thread-backed contexts
- mailbox bindings
- charter routing on mail threads
- outbound mail proposals
- obligation extraction from mail content

## Scope

- mailbox specialization of `ContextCase`
- mail-thread input model
- mailbox binding expectations
- mailbox-specific assertions

## Deliverables

### 1. Mailbox Case Shape

Define a mailbox specialization that includes:

- mailbox binding
- normalized thread context
- primary and secondary charter expectations
- expected outbound proposals
- expected obligation extraction where applicable

### 2. Mail-Specific Assertions

Support assertions for:

- support classifications
- obligation classifications
- escalation flags
- outbound reply proposals
- mailbox mutation proposals

### 3. Boundaries

Make explicit that this is a subtype of `ContextCase`, not the universal base example type.

## Definition Of Done

- [ ] mailbox specialization is defined
- [ ] mail-thread input model is defined
- [ ] mailbox-specific assertion model is defined
- [ ] the subtype relation to `ContextCase` is explicit
