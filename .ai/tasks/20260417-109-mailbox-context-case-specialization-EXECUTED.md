# Mailbox ContextCase Specialization — EXECUTED

**Date**: 2026-04-17
**Status**: Complete

---

## Relation to ContextCase

`MailboxCase` is an explicit **subtype** of `ContextCase`. It does not replace or redefine the base schema — it extends it with mail-vertical fields. The base `ContextCase` remains kernel-neutral and vertical-agnostic.

## Deliverables

### 1. Mailbox Case Shape (`examples/schema/mailbox-case.ts`)

`MailboxCase` extends `ContextCase` with mail-vertical fields:

- `vertical: "mailbox"` — discriminated literal
- `context_input: MailboxContextInput` — extends `ContextInput` with:
  - `thread_key` — thread identifier
  - `subject` — message subject
  - `messages: MailMessage[]` — ordered messages
  - `mailbox_bindings?: MailboxBinding` — primary/secondary charter bindings
- `expected_outbound?: OutboundProposal[] | null` — expected side-effect proposals
- `expected_obligations?: ExpectedObligation[] | null` — expected extracted obligations

Supporting types:
- `MailMessage` — `message_id`, `from`, `body`, `timestamp`, `synthetic?`
- `MailboxBinding` — `primary_charter`, `secondary_charters?`
- `OutboundProposal` — `outbound_id`, `action_type`, `target`, `status`
- `ExpectedObligation` — `obligation_id`, `kind`, `deadline?`, `source_message?`, `depends_on?`

### 2. Mail-Specific Assertions

`MailAssertionKind` union:
- `support-classification`
- `obligation-classification`
- `escalation-flag`
- `outbound-reply-proposal`
- `mailbox-mutation-proposal`

Helper: `mailExpectedOutput(kind, description, matcher)` builds mail-specific `ExpectedOutput`.

### 3. Subtype Relation

- `MailboxCase` extends `ContextCase` — explicit subtype, not universal base
- `isMailboxCase(c: ContextCase): c is MailboxCase` — type guard for runtime narrowing
- The base `ContextCase` remains kernel-neutral and vertical-agnostic

---

## Definition of Done

- [x] mailbox specialization is defined
- [x] mail-thread input model is defined
- [x] mailbox-specific assertion model is defined
- [x] the subtype relation to `ContextCase` is explicit
