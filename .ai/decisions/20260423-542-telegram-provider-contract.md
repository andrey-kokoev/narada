# Decision 542 — Telegram Provider Contract

**Date:** 2026-04-23
**Task:** 542
**Depends on:** 541 (Messaging Family Boundary Contract)
**Chapter:** Messaging Connectivity Family Boundary (541–545)
**Verdict:** **Contract accepted. Telegram Bot API maps cleanly to the messaging boundary with one bounded blocker (callback/command interaction model).**

---

## 1. Problem Statement

Task 541 defined the canonical messaging-connectivity boundary. Telegram is the first concrete provider to be fitted against that boundary. This contract maps Telegram Bot API semantics onto the provider-agnostic messaging shape and identifies what is straightforward reuse, what requires new adapter work, and what represents a bounded blocker.

The core question: **Does Telegram fit the messaging boundary without mail leakage or provider lock?**

---

## 2. Telegram Bot API Overview

Telegram Bot API is a RESTful HTTP API for bot accounts. Key characteristics:

| Characteristic | Detail |
|----------------|--------|
| **Auth** | Bot token (`123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`) passed as `?token=` query parameter |
| **Ingress modes** | Long-polling (`getUpdates`) or webhook (`setWebhook`) |
| **Update model** | `Update` objects containing `message`, `edited_message`, `callback_query`, `inline_query`, etc. |
| **Checkpoint** | Monotonic `update_id` (integer offset) |
| **Outbound** | `sendMessage`, `sendPhoto`, `sendDocument`, `editMessageText`, `deleteMessage`, `answerCallbackQuery` |
| **Rate limits** | ~30 messages/second to same chat; burst limits apply |
| **Confirmation** | Synchronous — API returns the sent `Message` object on success |

---

## 3. Boundary Fit: Telegram → Messaging Family

### 3.1 Ingress Path (Source → Fact)

| Messaging Boundary (§3.1) | Telegram Implementation | Notes |
|---------------------------|------------------------|-------|
| `Source.pull(checkpoint)` | `TelegramSource` calls `getUpdates(offset=checkpoint, limit=100)` | Long-polling mode; webhook mode buffers into `WebhookEventQueue` |
| Checkpoint | `update_id` + 1 | Monotonic integer; kernel sees opaque string `"123456789"` |
| Record payload | `Update` object | Opaque to kernel; normalizer extracts `message` or `edited_message` |
| Fact type | `messaging.message.received` | All message-bearing updates normalize to this |
| Auth | `TelegramTokenProvider` | Wraps bot token; no OAuth2, no refresh token |

**Telegram-specific update kinds and their fact mapping:**

| Telegram Update Kind | Fact Type | Normalized As | Notes |
|---------------------|-----------|---------------|-------|
| `message` (text) | `messaging.message.received` | `message_type: 'text'` | Standard chat message |
| `message` (photo) | `messaging.message.received` | `message_type: 'photo'` | Media message |
| `message` (document) | `messaging.message.received` | `message_type: 'document'` | File attachment |
| `message` (voice) | `messaging.message.received` | `message_type: 'voice'` | Voice note |
| `edited_message` | `messaging.message.received` | `message_type: 'text'`, `is_edited: true` | Edit is a new update, not a delta |
| `callback_query` | **TBD** (§6.1) | — | Inline button press; not a message |
| `inline_query` | **Out of scope** | — | Bot mention in other chats; not a chat update |
| `my_chat_member` | **Out of scope** | — | Bot added/removed from group; lifecycle event |

### 3.2 Normalized Chat Update Shape

| Field | Telegram Source | Example Value |
|-------|-----------------|---------------|
| `chat_id` | `message.chat.id` | `"-1001234567890"` (group) or `"123456789"` (DM) |
| `message_id` | `message.message_id` | `42` |
| `sender_id` | `message.from.id` | `"123456789"` |
| `sender_name` | `message.from.first_name + last_name` | `"Alice Smith"` |
| `text` | `message.text` or `message.caption` | `"Hello bot"` |
| `sent_at` | `message.date` (Unix epoch → ISO 8601) | `"2026-04-23T10:30:00Z"` |
| `reply_to_message_id` | `message.reply_to_message?.message_id` | `7` or `undefined` |
| `message_type` | Derived from `message` structure | `text`, `photo`, `video`, `document`, `voice`, `location`, `contact` |
| `media` | `message.photo[]`, `message.video`, `message.document`, `message.voice` | Array of media descriptors (see §3.2.1) |
| `edit_date` | `message.edit_date` (Unix epoch → ISO 8601) | `"2026-04-23T10:35:00Z"` or `undefined` |
| `is_edited` | `edit_date != null` | `true` or `false` |

#### 3.2.1 Topic Identity (Forum Topics)

Telegram supergroups may have **forum topics** enabled. In this mode, messages belong to both a `chat_id` (the supergroup) and a `message_thread_id` (the topic):

| Telegram Field | Semantics | Messaging Boundary Mapping |
|----------------|-----------|---------------------------|
| `message.chat.id` | Supergroup ID | `chat_id` — the outer container |
| `message.message_thread_id` | Topic ID within supergroup | `source_extensions.telegram.topic_id` — advisory threading hint |
| `message.is_topic_message` | Whether sent in a forum topic | `source_extensions.telegram.is_topic_message` |

**Boundary rule:** The messaging boundary uses `chat_id` as the canonical conversation container. `message_thread_id` is an **advisory** field in the Telegram extension slot. It must not become a generic `topic_id` field in `NormalizedChatUpdate` because:
- WhatsApp and Signal do not have forum topics.
- The kernel must not assume topic semantics exist for all messaging providers.
- Charter governance may use `topic_id` for routing, but the scheduler treats it as a hint, not a mandatory partition.

**Reply semantics in topics:**
- Replies within a topic use `reply_to_message_id` (same as normal chats).
- Cross-topic replies are not supported by Telegram.
- The `TelegramSource` normalizer preserves `message_thread_id` in extensions but does not synthesize separate `chat_id` values per topic.

#### 3.2.2 Media Descriptor Shape

Telegram media types have heterogeneous fields. The normalizer maps them to a uniform descriptor:

```typescript
interface NormalizedMediaItem {
  media_type: 'photo' | 'video' | 'document' | 'voice' | 'location' | 'contact';
  file_id?: string;           // Telegram file reference
  file_unique_id?: string;    // Deduplication key
  file_size?: number;         // Bytes
  duration?: number;          // Seconds (video/voice)
  width?: number;             // Pixels (photo/video)
  height?: number;            // Pixels (photo/video)
  mime_type?: string;         // MIME type
  file_name?: string;         // Original filename (document)
  caption?: string;           // Media caption
}
```

**Key invariant:** The normalizer extracts all available metadata but does not download file content during normalization. Content download is deferred to a background worker or omitted.

**Telegram extension slot (`source_extensions.telegram`):**

```typescript
{
  update_id: number;
  chat_type: 'private' | 'group' | 'supergroup' | 'channel';
  topic_id?: number;          // message_thread_id for forum topics
  is_topic_message?: boolean;
  forward_from?: { id: number; name: string };
  forward_date?: string;
  entities?: Array<{ type: string; offset: number; length: number }>;
  caption_entities?: Array<{ type: string; offset: number; length: number }>;
  reply_markup?: unknown;     // inline keyboard structure
}
```

### 3.3 Egress Path (Intent → Execution → Confirmation)

| Messaging Boundary (§3.3) | Telegram Implementation | Notes |
|---------------------------|------------------------|-------|
| `messaging.send_message` | `sendMessage(chat_id, text, { parse_mode, reply_markup })` | Returns `Message` object synchronously |
| `messaging.send_reply` | `sendMessage(chat_id, text, { reply_to_message_id })` | Same endpoint with `reply_to_message_id` param |
| `messaging.edit_message` | `editMessageText(chat_id, message_id, text)` | Only text edits; media edits use `editMessageMedia` |
| `messaging.delete_message` | `deleteMessage(chat_id, message_id)` | Deletes within 48 hours (bot or own messages) |
| Confirmation | Immediate | API response contains sent `Message` with `message_id` |

**Telegram-specific outbound capabilities:**

| Capability | Telegram Support | Intent Mapping |
|------------|-----------------|---------------|
| Text send | ✓ | `messaging.send_message` / `send_reply` |
| Rich text (Markdown/HTML) | ✓ | `parse_mode` in intent payload |
| Photo send | ✓ | `messaging.send_message` with `media` array |
| Document send | ✓ | `messaging.send_message` with `media` array |
| Voice send | ✓ | `messaging.send_message` with `media` array |
| Video send | ✓ | `messaging.send_message` with `media` array |
| Inline keyboard | ✓ (§6.1) | Extension of `messaging.send_message` |
| Message edit | ✓ (text only) | `messaging.edit_message` |
| Message delete | ✓ (48h window) | `messaging.delete_message` |
| Group administration | ✓ | Out of scope for messaging boundary |

### 3.4 Identity and Reconciliation

| Identifier | Telegram Value | Stability |
|------------|---------------|-----------|
| `chat_id` | `message.chat.id` | Stable for group/channel; DM `chat_id` equals user `id` |
| `message_id` | `message.message_id` | Stable within a chat; not globally unique |
| `sender_id` | `message.from.id` | Stable user identifier |
| `idempotency_key` | UUID injected into `reply_markup` or `caption` | Explicitly placed by Narada |

**Reconciliation (`ChatMessageFinder` for Telegram):**

```typescript
class TelegramMessageFinder implements ChatMessageFinder {
  async findByOutboundId(chatId: string, outboundId: string): Promise<FoundChatMessage | undefined> {
    // Telegram returns Message object on send; outboundId = returned message_id
    // Store mapping at submit time; lookup is local
  }

  async findByMessageId(chatId: string, messageId: string): Promise<FoundChatMessage | undefined> {
    // Telegram has no getMessageById; must track locally or use forward
    // Fallback: not implementable directly; use findByOutboundId
  }

  async findBySenderAndText(chatId: string, senderId: string, text: string, sentAfter: string): Promise<FoundChatMessage | undefined> {
    // Poll recent updates via getUpdates and match sender_id + text + sent_at
    // Used when findByMessageId is unavailable
  }
}
```

**Key reconciliation note:** Telegram's synchronous API means confirmation is typically immediate. The `ChatMessageFinder` is primarily for crash recovery and idempotency replay, not for async reconciliation.

---

## 4. Reuse vs New Adapter Work

### 4.1 Straightforward Reuse

| Component | Reuse From | Why |
|-----------|-----------|-----|
| `Source` interface | Existing `Source` contract | Domain-neutral; no changes needed |
| `SqliteOutboundStore` | Existing outbound store | Provider-agnostic state machine |
| `OutboundCommand` / `OutboundVersion` | Existing outbound types | No provider-specific fields |
| `FactStore` | Existing fact store | `messaging.message.received` is just another fact type |
| `TokenProvider` interface | Existing auth abstraction | Telegram bot token fits opaque token model |
| `WebhookSource` | Existing webhook source | Can buffer Telegram webhook `Update` objects |
| `scheduler`, `foreman`, `work_item` | Control plane v2 | Domain-neutral; no changes needed |

### 4.2 New Adapter Work Required

| Component | New Work | Effort |
|-----------|----------|--------|
| `TelegramSource` | Implement `Source` using `getUpdates` or webhook queue | Medium |
| `TelegramNormalizer` | Map `Update` → `NormalizedChatUpdate` | Medium |
| `TelegramTokenProvider` | Wrap bot token auth | Low |
| `TelegramBotClient` | HTTP client for `sendMessage`, `editMessageText`, `deleteMessage` | Medium |
| `TelegramSendWorker` | Execute `messaging.send_message` / `send_reply` via `TelegramBotClient` | Low |
| `TelegramEditWorker` | Execute `messaging.edit_message` via `TelegramBotClient` | Low |
| `TelegramDeleteWorker` | Execute `messaging.delete_message` via `TelegramBotClient` | Low |
| `TelegramMessageFinder` | Implement `ChatMessageFinder` with local tracking fallback | Medium |
| `messaging.*` intent types | Register in `INTENT_FAMILIES` registry | Low |
| `messaging.message.received` fact type | Add to `FactType` union | Low |

### 4.3 Not Applicable / Out of Scope

| Mail Concept | Messaging Equivalent | Telegram Status |
|--------------|---------------------|-----------------|
| Draft stage | None | Not applicable — Telegram has no drafts |
| `mailbox_id` | `chat_id` | Different semantics; no reuse |
| `conversation_id` | `chat_id` | Different semantics; no reuse |
| `subject` | None | Not applicable |
| `to` / `cc` / `bcc` | None | Not applicable |
| `internet_message_id` | None | Not applicable |
| `is_read` | None | Not applicable — Telegram does not expose read state |
| Folder/move semantics | None | Not applicable |

---

## 5. Confirmation Model

Telegram's confirmation model is **mostly synchronous**, which simplifies the boundary:

```
Intent: messaging.send_message
    ↓
TelegramBotClient.sendMessage() → HTTP POST
    ↓
Telegram API responds with Message object
    ↓
Extract message_id from response
    ↓
OutboundCommand transitions: pending → sending → submitted → confirmed
```

**Confirmation is synchronous** because the API response contains the sent `Message` with its `message_id`. There is no delta lag or polling reconciliation required in the happy path.

**Crash recovery path:** If Narada crashes between `submitted` and `confirmed`, the `TelegramMessageFinder` must recover the sent message. Since `findByMessageId` is not directly implementable, the finder relies on:
1. **Local mapping table:** `outbound_id → telegram_message_id` stored at submit time.
2. **Fallback:** `findBySenderAndText` polling recent `getUpdates` to match sender + text + time.

**Bounded risk:** If the bot sends a message and crashes before storing the mapping, the message may be sent twice. This is acceptable because:
- Telegram bots are idempotent-tolerant (users expect occasional duplicates).
- The `idempotency_key` in `reply_markup` or `caption` allows downstream deduplication.

---

## 6. Bounded Blockers

### 6.1 Callback Query and Command Interaction Model (Medium Blocker)

Telegram bots commonly use **callback queries** (inline button presses) and **bot commands** (`/start`, `/help`). These are not chat messages in the traditional sense:

| Interaction Type | Telegram Structure | Messaging Boundary Fit |
|-----------------|-------------------|------------------------|
| Inline button press | `callback_query` with `data` payload | **Not a message** — it is an interaction event |
| Bot command | `message` with `entities[0].type == 'bot_command'` | **Is a message** — normalize as `text` with command prefix |
| Deep link | `message.text` containing `/start <payload>` | **Is a message** — normalize as `text` |

**Blocker:** The messaging boundary (§3.1) defines fact types as `messaging.message.received`. Callback queries are not messages. They require either:
- A new fact type: `messaging.interaction.received` (recommended), or
- Dropping callback query support (acceptable for MVP).

**Resolution:** Add `messaging.interaction.received` as an optional fact type in the messaging boundary. Charter governance decides whether to act on interactions. This is a small schema addition, not a boundary breach.

### 6.2 Media Download for Confirmation (Low Blocker)

Telegram media files (photos, documents) are referenced by `file_id`. To compute `content_hash` for durable boundaries, the bot must download the file via `getFile` + HTTP fetch.

**Blocker:** Downloading large media files during normalization may be slow and memory-intensive.

**Resolution:** Defer media download to a background worker or omit `content_hash` for media (treat media as advisory, not authoritative). This is a performance optimization, not a boundary issue.

### 6.3 Group Chat vs Channel Semantics (Low Blocker)

Telegram has three chat types: `private`, `group`/`supergroup`, and `channel`. Channels are broadcast-only; bots cannot send replies to channel posts in the same way.

**Blocker:** `messaging.send_reply` assumes a bidirectional conversation. Channels are unidirectional.

**Resolution:** Channels are out of scope for the initial provider contract. The capability manifest (§6 of Decision 541) marks `channel` as unsupported. Group and private chats are the supported targets.

### 6.4 Rate Limit Handling (Low Blocker)

Telegram rate limits are ~30 messages/second per chat. Exceeding this returns HTTP 429.

**Blocker:** The existing retry/circuit breaker infrastructure (`packages/layers/control-plane/src/retry.ts`) is designed for Graph API semantics.

**Resolution:** The `TelegramBotClient` must implement provider-specific rate limit handling (exponential backoff with jitter). This is new adapter work, not a boundary breach.

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Bot token leakage in logs | Medium | High | Token provider uses `logging/sanitize.ts`; never log full token |
| Webhook secret verification bypass | Medium | High | `WebhookSource` must verify `X-Telegram-Bot-Api-Secret-Token` |
| Edited messages treated as new facts | Medium | Medium | Normalizer sets `is_edited: true`; deduplication uses `message_id` + `edit_date` |
| Callback query smear into mail | Low | High | Explicit `messaging.interaction.received` fact type prevents this |
| Bot added to spam groups | Medium | Low | Charter governance filters by `chat_id` whitelist |
| Message delete 48h window exceeded | Low | Low | `TelegramDeleteWorker` returns `unsupported_action` if window expired |

---

## 8. Invariants

1. **Telegram updates normalize to `NormalizedChatUpdate`.** No `NormalizedMessage` fields (`subject`, `to`, `cc`, `internet_message_id`) are used.
2. **Bot token never appears in logs or durable state.** It is resolved at runtime via `TelegramTokenProvider`.
3. **Callback queries are not messages.** They use `messaging.interaction.received`, not `messaging.message.received`.
4. **Confirmation is synchronous in the happy path.** The API response provides `message_id` immediately.
5. **Rate limits are handled by the adapter, not the kernel.** The kernel sees only success/failure/retry outcomes.
6. **Channels are out of scope.** The capability manifest rejects channel `chat_id` values at binding time.

---

## 9. Verification Evidence

- Decision artifact exists at `.ai/decisions/20260423-542-telegram-provider-contract.md`.
- Boundary fit is explicit: all Telegram update kinds map to `messaging.message.received` or `messaging.interaction.received`.
- Reuse vs new work is explicit: 7 components are straightforward reuse; 10 require new adapter work.
- 4 bounded blockers are recorded with resolutions.
- 6 risks are documented with likelihood, impact, and mitigation.
- 6 invariants are enforceable at normalizer, auth, and adapter levels.
- No `mail.*` fact types or intent types were modified.
- No code, CLI flags, DB columns, or package APIs were modified.
- No derivative status files created.

---

## Closure Statement

Telegram Bot API maps cleanly to the messaging-connectivity boundary defined in Decision 541. The ingress path uses `getUpdates` or webhooks with monotonic `update_id` checkpoints. The normalized shape uses `NormalizedChatUpdate` with no mail-specific fields. The egress path uses `sendMessage`, `editMessageText`, and `deleteMessage` with synchronous confirmation. Straightforward reuse includes the `Source` interface, `SqliteOutboundStore`, `FactStore`, and control plane machinery. New adapter work includes `TelegramSource`, `TelegramNormalizer`, `TelegramBotClient`, send/edit/delete workers, and `TelegramMessageFinder`. One bounded blocker exists: callback queries require a new `messaging.interaction.received` fact type. Channels and inline queries are out of scope.

---

**Closed by:** codex
**Closed at:** 2026-04-23
