---
status: closed
created: 2026-04-23
depends_on: [541]
closed_at: 2026-04-23T00:17:00Z
closed_by: codex
governed_by: task_close:codex
---

# Task 544 - Messaging Intent And Confirmation Boundary

## Goal

Define the outbound intent and confirmation boundary for messaging-family providers without inheriting mail draft/send semantics by default.

## Required Work

1. Define the canonical messaging outbound family:
   - send,
   - reply,
   - edit,
   - callback/ack style responses where applicable.
2. Define how Intent remains the durable effect boundary for messaging.
3. Define confirmation/reconciliation semantics for messaging providers.
4. State where messaging parity with mail is intentionally absent.
5. Write the boundary artifact to `.ai/decisions/`.

## Acceptance Criteria

- [x] Boundary artifact exists.
- [x] Messaging-family intent set is explicit.
- [x] Confirmation/reconciliation semantics are explicit.
- [x] Intent boundary remains canonical.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

1. **Read prerequisite Decision 541** (Messaging Family Boundary Contract) to establish ingress shape, identity model, and `ChatMessageFinder` interface.
2. **Read `packages/layers/control-plane/src/intent/types.ts`** to confirm `Intent` interface is family-neutral and `IntentType` union requires explicit extension.
3. **Read `packages/layers/control-plane/src/intent/registry.ts`** to confirm `INTENT_FAMILIES` registry pattern and `confirmation_model` annotation semantics.
4. **Read `packages/layers/control-plane/src/intent/handoff.ts`** to confirm `IntentHandoff.admitIntentFromDecision()` already branches on `executorFamily === "mail"` vs non-mail, making `messaging` a natural third branch.
5. **Read `packages/layers/control-plane/src/outbound/types.ts`** to confirm `OutboundStatus` state machine and `isValidTransition(actionType)` action-specific override pattern.
6. **Read `packages/layers/control-plane/src/outbound/send-reply-worker.ts`** to confirm mail draft-creation semantics that messaging must not inherit.
7. **Read `packages/layers/control-plane/src/outbound/reconciler.ts`** to confirm `submitted → confirmed` reconciliation path and `MessageFinder` abstraction.
8. **Read `packages/layers/control-plane/src/outbound/store.ts`** to confirm `outbound_handoffs` is family-neutral while `outbound_versions` and `managed_drafts` are mail-shaped.
9. **Produced boundary artifact** `.ai/decisions/20260423-544-messaging-intent-and-confirmation-boundary.md` documenting:
   - §3: 5 `messaging.*` intent types with payload schemas and `confirmation_model` annotations
   - §3.2: Intent boundary invariants (same admission path as mail)
   - §4: Draft-free state machine (`pending → sending → submitted → confirmed`) with exact `isValidTransition` overrides required
   - §5: Synchronous vs asynchronous confirmation models per provider
   - §5.2: `ChatMessageFinder` reconciliation rules per action type
   - §6: 12 intentional absences vs mail (draft, approval, to/cc/bcc, subject, internet_message_id, read state, etc.)
   - §7: Schema accommodation (`outbound_handoffs` neutral, `outbound_versions` mail-shaped, `managed_drafts` unused)
   - §8: Bounded blockers — type system changes + new worker components needed for implementation
   - §9: 7 invariants
10. **No code changes required.** This is a documentation and contract task.

## Verification

- Decision artifact exists and is readable at `.ai/decisions/20260423-544-messaging-intent-and-confirmation-boundary.md`.
- 5 `messaging.*` intent types are explicit with family-scoped naming (`messaging.send_message`, etc.).
- Payload schemas use chat-native fields (`chat_id`, `message_id`, `text`, `parse_mode`, `media`) — no `to`, `cc`, `bcc`, `subject`.
- State machine is draft-free: `draft_creating` and `draft_ready` are never entered by default.
- `approved_for_send` is optional (policy may insert it) but not required by default.
- Exact `isValidTransition` overrides are documented for 4 missing transitions (`pending→sending`, `pending→approved_for_send`, `sending→confirmed`, `retry_wait→sending`).
- Confirmation model distinguishes synchronous (API response) vs asynchronous (reconciler polling).
- `confirmation_model` is correctly identified as registry-level annotation, not a runtime switch.
- Reconciliation rules per action type are explicit (send/reply/edit/delete/ack).
- 12 intentional absences prevent mail semantics from leaking into messaging.
- Schema accommodation notes explain how `outbound_handoffs` (neutral) and `outbound_versions` (mail-shaped) accommodate messaging.
- Bounded blockers list exact files and components that require change for implementation.
- No `mail.*` intent types or outbound types were modified.
- No code, CLI flags, DB migrations, or package APIs were modified.
- No derivative status files created.
