---
status: closed
created: 2026-04-23
depends_on: [541]
closed_at: 2026-04-24T00:42:00Z
closed_by: codex
governed_by: task_close:codex
---

# Task 542 - Telegram Provider Contract

## Goal

Specify how Telegram fits the canonical messaging-connectivity boundary and what would be required to support it without mail-specific leakage.

## Required Work

1. Map Telegram capabilities onto the messaging boundary from Task 541.
2. Identify Telegram-specific deltas:
   - bot/webhook/polling posture,
   - message/chat/topic identity,
   - callback / command interactions,
   - outbound send/edit/reply surface,
   - confirmation/reconciliation model.
3. State what is straightforward reuse vs what requires new adapter work.
4. Record bounded blockers and risks.
5. Write the provider contract to `.ai/decisions/`.

## Acceptance Criteria

- [x] Telegram provider contract exists.
- [x] Boundary fit against Task 541 is explicit.
- [x] Reuse vs new adapter work is explicit.
- [x] Bounded blockers are recorded.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

1. **Read prerequisite Task 541** (Messaging Family Boundary Contract) to establish the canonical boundary, `NormalizedChatUpdate` shape, intent families, and `ChatMessageFinder` contract.
2. **Read `packages/layers/control-plane/src/types/source.ts`** to confirm `Source` interface supports opaque payload/checkpoint.
3. **Read `packages/layers/control-plane/src/facts/types.ts`** to confirm fact type expansion points.
4. **Read `packages/layers/control-plane/src/intent/registry.ts`** to confirm intent family registration pattern.
5. **Read `packages/layers/control-plane/src/sources/webhook-source.ts`** to confirm `WebhookSource` can buffer Telegram webhook updates.
6. **Produced provider contract** `.ai/decisions/20260423-542-telegram-provider-contract.md` documenting:
   - §3.1 Ingress mapping: `getUpdates` / webhook → `SourceBatch` → `messaging.message.received`
   - §3.2 `NormalizedChatUpdate` field mapping for all Telegram message types
   - §3.2.1 Topic identity: `message_thread_id` mapped to advisory extension slot, not generic field
   - §3.2.2 Media descriptor shape with heterogeneous field normalization
   - §3.3 Egress mapping: `sendMessage`, `editMessageText`, `deleteMessage` → intent families
   - §3.4 Identity and reconciliation with synchronous confirmation model
   - §4: Straightforward reuse (7 components) vs new adapter work (10 components)
   - §5: Synchronous confirmation model and crash recovery path
   - §6: 4 bounded blockers with resolutions (callback queries, media download, group vs channel, rate limits)
   - §7: 6 risks with likelihood, impact, and mitigation
   - §8: 6 invariants
7. **No code changes required.** This is a documentation and contract task.

## Verification

- Decision artifact exists and is readable at `.ai/decisions/20260423-542-telegram-provider-contract.md`.
- Boundary fit is explicit for all 10 `NormalizedChatUpdate` fields.
- Topic identity (`message_thread_id`) is explicitly mapped to advisory extension slot with boundary rule preventing generic `topic_id` leakage.
- Reuse vs new work is explicit: 7 reused components, 10 new adapter components.
- 4 bounded blockers are recorded with concrete resolutions:
  - Callback queries → new `messaging.interaction.received` fact type
  - Media download → defer to background worker or omit `content_hash`
  - Channels → out of scope, rejected at binding time
  - Rate limits → handled by `TelegramBotClient`, not kernel
- 6 risks documented with likelihood/impact/mitigation.
- 6 invariants are enforceable at normalizer, auth, and adapter levels.
- No `mail.*` fact types or intent types were modified.
- No code, CLI flags, DB columns, or package APIs were modified.
- No derivative status files created.
