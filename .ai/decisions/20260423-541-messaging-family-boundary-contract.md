# Decision 541 — Messaging Family Boundary Contract

**Date:** 2026-04-23
**Task:** 541
**Depends on:** 394 (Email Marketing Operation Closure), 534 (Mail vs Adjacent Source Family Boundary)
**Chapter:** Messaging Connectivity Family Boundary (541–545)
**Verdict:** **Contract accepted. Messaging is a distinct provider-family bounded by conversational event-stream semantics, not a honorary mail vertical.**

---

## 1. Problem Statement

Narada's connectivity families currently include mail (`mail.*`) and generic event sources (`timer.*`, `filesystem.*`, `webhook.*`). Real-world operations increasingly need to reach users through conversational messaging systems — Telegram, WhatsApp, Signal, and similar platforms — where the interaction model is chat streams rather than mailbox correspondence.

Without an explicit boundary contract, there are two failure modes:

1. **Mail smear:** Messaging systems are squeezed into the `mail.*` fact/intent family, requiring fake `subject` fields, synthetic `conversation_id` mappings, and emulated mailbox semantics that do not exist.
2. **Provider lock:** The first messaging provider (Telegram) hard-wires Telegram Bot API assumptions into generic messaging types, making future providers (WhatsApp, Signal) impossible without rewrite.

This contract defines the **canonical provider-agnostic messaging-connectivity boundary** and identifies the **minimum stable seam** needed to host multiple messaging providers without either outcome.

---

## 2. Core Thesis

> **The messaging vertical is a provider-family bounded by conversational event-stream semantics and chat-native identity, not by mail shape or any one provider's API.**

Telegram, WhatsApp, Signal, and similar platforms are all **provider-specific implementations** behind the same canonical boundary. The boundary consists of:

1. **Ingress:** `Source` interface → `NormalizedChatUpdate` → `Fact`
2. **Egress:** `Intent` → `OutboundChatCommand` → provider-specific executor
3. **Identity:** `chat_id`, `message_id`, `sender_id` as stable cross-provider identifiers
4. **Reconciliation:** `ChatMessageFinder` interface binding submitted effects to observed state

---

## 3. The Boundary: Provider-Agnostic vs. Provider-Specific

### 3.1 Ingress Path (Source → Fact)

| Layer | Provider-Agnostic | Provider-Specific (Telegram) | Provider-Specific (WhatsApp) | Provider-Specific (Signal) |
|-------|-------------------|------------------------------|------------------------------|---------------------------|
| **Source contract** | `Source.pull(checkpoint) → SourceBatch` | `TelegramSource` | `WhatsAppSource` (future) | `SignalSource` (future) |
| **Checkpoint** | Opaque string | `update_id` offset | `webhook.timestamp` or `message.id` | `envelope.timestamp` |
| **Record payload** | `unknown` (opaque to kernel) | `NormalizedChatUpdate` with `source_extensions.telegram` | `NormalizedChatUpdate` with `source_extensions.whatsapp` | `NormalizedChatUpdate` with `source_extensions.signal` |
| **Fact type** | `messaging.message.received` | Same | Same | Same |
| **Fact payload** | Opaque JSON | `NormalizedChatPayload` | `NormalizedChatPayload` | `NormalizedChatPayload` |
| **Auth** | Token provider interface | Bot token (`TelegramTokenProvider`) | OAuth2 / business account | Signal CLI or REST bridge |

**Key invariant:** The kernel never sees provider-specific checkpoint structure. The `Source` implementation owns checkpoint semantics entirely.

### 3.2 Normalized Chat Update Shape

**Provider-agnostic fields** (all providers must produce or accept these):

| Field | Semantics | Telegram | WhatsApp | Signal |
|-------|-----------|----------|----------|--------|
| `chat_id` | Conversation container ID | `chat.id` | `phone_number` or `group_id` | `groupId` or `recipient` |
| `message_id` | Provider-local message ID | `message_id` | `id` | `timestamp` + `sender` |
| `sender_id` | Sender identifier | `from.id` | `from` | `sourceNumber` |
| `sender_name` | Display name | `from.first_name` + `last_name` | `profile.name` | Contact name (if known) |
| `text` | Message text body | `text` or `caption` | `text.body` | `dataMessage.message` |
| `sent_at` | Message timestamp | `date` (Unix epoch) | `timestamp` | `timestamp` |
| `reply_to_message_id` | Message this replies to | `reply_to_message.message_id` | `context.id` | `quote.id` |
| `message_type` | `text`, `photo`, `video`, `document`, `voice`, `location`, `contact`, `unknown` | `message` type + media arrays | `type` field | `dataMessage.attachments` |
| `media` | Media attachments array | `photo`, `video`, `document`, `voice` | `image`, `document`, `audio` | `attachments` |
| `edit_date` | Last edit timestamp | `edit_date` | `timestamp` (no native edit) | N/A (no native edit) |
| `is_edited` | Whether message was modified | `edit_date != null` | `false` | `false` |

**Provider-specific extension slot:**

```typescript
source_extensions?: {
  namespaces: {
    telegram?: { update_id, chat_type, forward_from, ... };
    whatsapp?: { wa_id, business_phone_number_id, ... };
    signal?: { source_uuid, group_name, ... };
  };
};
```

**Key invariant:** The kernel compiles only provider-agnostic fields into canonical state. Provider extensions are advisory and may be stripped without losing authority.

### 3.3 Egress Path (Intent → Execution → Confirmation)

| Layer | Provider-Agnostic | Provider-Specific (Telegram) | Provider-Specific (WhatsApp) | Provider-Specific (Signal) |
|-------|-------------------|------------------------------|------------------------------|---------------------------|
| **Intent family** | `messaging.send_message`, `messaging.send_reply`, `messaging.edit_message`, `messaging.delete_message` | Same | Same | Subset (no native edit) |
| **Intent payload** | `chat_id`, `text`, `reply_to_message_id`, `media`, `parse_mode` | Same | Same | Subset |
| **Outbound state machine** | `pending → sending → submitted → confirmed` | Same | Same | Same |
| **Outbound store** | `SqliteOutboundStore`, `OutboundCommand`, `OutboundVersion` | Same | Same | Same |
| **Send execution** | `ChatSendWorker` delegation | `TelegramBotClient.sendMessage()` | `WhatsAppBusinessClient.sendMessage()` | `SignalRestClient.send()` |
| **Edit execution** | `ChatEditWorker` delegation | `TelegramBotClient.editMessageText()` | N/A (unsupported) | N/A |
| **Delete execution** | `ChatDeleteWorker` delegation | `TelegramBotClient.deleteMessage()` | `WhatsAppBusinessClient.deleteMessage()` | N/A (no native delete) |
| **Reconciliation** | `ChatMessageFinder` interface | Telegram-based implementation | WhatsApp-based implementation (future) | Signal-based implementation (future) |

**Key invariant:** The `OutboundCommand` state machine and `SqliteOutboundStore` are provider-agnostic. Provider-specific code lives in send/edit/delete executors and `ChatMessageFinder` implementations.

**Degradation rule:** If a provider does not support a capability (e.g., WhatsApp has no native edit), the intent is rejected at provider-binding time with a clear `unsupported_action` error, not silently dropped.

### 3.4 Identity and Reconciliation

**Canonical identifiers (cross-provider stable):**

| Identifier | Role | Telegram Source | WhatsApp Source | Signal Source |
|------------|------|-----------------|-----------------|---------------|
| `chat_id` | Conversation container | `chat.id` | `phone_number` or `group_id` | `groupId` or `recipient` |
| `message_id` | Provider-local primary key | `message_id` | `id` | `timestamp` + `sender` composite |
| `sender_id` | Sender within chat | `from.id` | `from` | `sourceNumber` |
| `idempotency_key` | Narada-generated effect dedup | UUID in `reply_markup` or caption | UUID in `context` | UUID in text prefix |

**Reconciliation contract (`ChatMessageFinder`):**

```typescript
interface ChatMessageFinder {
  findByOutboundId(chatId: string, outboundId: string): Promise<FoundChatMessage | undefined>;
  findByMessageId(chatId: string, messageId: string): Promise<FoundChatMessage | undefined>;
  findBySenderAndText(chatId: string, senderId: string, text: string, sentAfter: string): Promise<FoundChatMessage | undefined>;
}
```

All three lookup methods must be implementable by every provider. The primary key (`message_id`) is provider-local; `sender_id` + `text` + `sent_after` is the cross-provider fallback.

---

## 4. What Mail Assumptions Must Not Leak Into Messaging

These are **hard anti-assumptions**. Messaging is not "mail without subjects."

### 4.1 Anti-Assumptions About Message Shape

| # | Anti-Assumption | Why |
|---|----------------|-----|
| 1 | **The kernel must not assume messages have a `subject`.** | Chat messages do not have subjects. Replies are threaded by `reply_to_message_id`, not by `Re: subject`. |
| 2 | **The kernel must not assume `to` / `cc` / `bcc` address fields.** | Chat has a single `chat_id` container and `sender_id`. There are no carbon-copy semantics. |
| 3 | **The kernel must not assume a MIME body structure.** | Chat bodies are plain text with optional markdown/HTML parse mode. Attachments are media arrays, not MIME parts. |
| 4 | **The kernel must not assume `internet_message_id` exists.** | Chat platforms do not use RFC 2822 `Message-Id`. Identity is provider-local. |
| 5 | **The kernel must not assume read/unread state.** | Most chat platforms do not expose per-message read state to bots. `is_read` is not a messaging concept. |

### 4.2 Anti-Assumptions About Container Semantics

| # | Anti-Assumption | Why |
|---|----------------|-----|
| 6 | **The kernel must not assume folder/mailbox semantics.** | Chat has `chat_id` (conversation), not folders. Messages are not "moved" between containers. |
| 7 | **The kernel must not assume draft staging.** | Chat has no draft stage. Messages are sent immediately or scheduled via provider API. |
| 8 | **The kernel must not assume archive/delete are distinct.** | `delete_message` removes the message from the chat. There is no "archive" vs "delete" distinction. |
| 9 | **The kernel must not assume message editing is universal.** | Telegram supports editing; WhatsApp and Signal do not. Editing is a degradable capability. |

### 4.3 Anti-Assumptions About Auth and Transport

| # | Anti-Assumption | Why |
|---|----------------|-----|
| 10 | **The kernel must not assume OAuth2.** | Telegram uses bot tokens; Signal uses local bridge or REST proxy. Auth interface is `TokenProvider`-shaped but token format is opaque. |
| 11 | **The kernel must not assume a polling/delta model.** | Telegram uses long-polling or webhooks; WhatsApp uses webhooks only; Signal uses local socket. The checkpoint is opaque. |
| 12 | **The kernel must not assume reconciliation lags.** | Chat confirmations are typically immediate (synchronous API response). The confirmation window may be near-zero. |

---

## 5. Minimum Stable Seam for Multiple Messaging Providers

To host a new messaging provider without rewriting the vertical, the following seam must be implemented:

### 5.1 Required Implementations

| # | Component | Interface | Effort |
|---|-----------|-----------|--------|
| 1 | **Source adapter** | `Source` | Medium — map provider update API to `SourceBatch` |
| 2 | **Auth provider** | `TokenProvider` | Low — wrap provider auth (bot token, OAuth, etc.) |
| 3 | **Normalizer** | `NormalizedChatUpdate[]` from provider payload | Medium — map provider fields to `NormalizedChatUpdate` |
| 4 | **Send executor** | `ChatSendWorker` delegation | Low — call provider send API |
| 5 | **Edit executor** | `ChatEditWorker` delegation (if supported) | Low — call provider edit API |
| 6 | **Delete executor** | `ChatDeleteWorker` delegation (if supported) | Low — call provider delete API |
| 7 | **Message finder** | `ChatMessageFinder` | Medium — lookup by outbound ID, message ID, sender+text |

### 5.2 Optional / Degradable Capabilities

| Capability | Telegram | WhatsApp | Signal |
|------------|----------|----------|--------|
| Edit message | ✓ | ✗ | ✗ |
| Delete message | ✓ | ✓ | ✗ |
| Rich media send | ✓ (photo, video, doc, voice) | ✓ (image, doc, audio) | Limited |
| Parse mode (Markdown/HTML) | ✓ | Limited | ✗ |
| Inline keyboards / buttons | ✓ | ✓ (interactive messages) | ✗ |
| Group chat administration | ✓ | ✗ (business API only) | ✗ |

**Degradation rule:** If a provider does not support a capability, the intent is rejected at provider-binding time with a clear `unsupported_action` error.

---

## 6. Provider Binding Contract

When a new messaging provider is bound to an operation, the following must be explicit:

1. **Provider identifier** in config: `telegram`, `whatsapp`, `signal`, etc.
2. **Capability manifest:** which intent types and action types are supported
3. **Auth configuration:** provider-specific credentials, token refresh behavior
4. **Normalizer registration:** which `source_extensions` namespace is populated
5. **Message finder registration:** which `ChatMessageFinder` implementation is used
6. **Degradation policy:** how unsupported intents are handled (reject, queue, or fallback)
7. **Confirmation model:** whether confirmation is implicit (synchronous API) or requires reconciliation polling

---

## 7. Messaging vs Mail: The Hard Boundary

The messaging and mail families are **parallel, not hierarchical**. Neither is a subset of the other.

| Dimension | Mail Family | Messaging Family |
|-----------|-------------|------------------|
| **Native data unit** | RFC 5322 message | Chat update / message |
| **Container** | Mailbox / folder | Chat / conversation |
| **Addressing** | `From` / `To` / `Cc` / `Bcc` | `chat_id` + `sender_id` |
| **Threading** | `References` / `In-Reply-To` | `reply_to_message_id` |
| **Subject** | Required | Absent |
| **Body** | MIME (`text/plain`, `text/html`) | Plain text + parse mode |
| **Attachments** | MIME parts | Media arrays |
| **Read state** | Per-message (`is_read`) | Typically unavailable |
| **Draft stage** | Supported (optional) | Absent |
| **Edit** | Rare (send replacement) | Supported by some providers |
| **Delete** | Move to trash / hard delete | Remove from chat |
| **Confirmation** | Often async (delta lag) | Often sync (API response) |
| **Fact type** | `mail.message.discovered` | `messaging.message.received` |
| **Intent type** | `mail.send_reply` | `messaging.send_reply` |

**Smear detection:** If a design document says "messaging is just mail without subjects," it is a boundary breach. Messaging has its own shape, identity model, and lifecycle.

---

## 8. Invariants

1. **The kernel sees only opaque source records.** Provider-specific structure lives inside `payload` and `source_extensions`.
2. **Normalized chat shape is the canonical compiler input.** All providers normalize to the same `NormalizedChatUpdate` fields.
3. **Intent types are source-family names, not provider names.** `messaging.send_reply` works for Telegram, WhatsApp, and Signal.
4. **The outbound state machine is provider-agnostic.** Provider-specific behavior lives in send/edit/delete executors.
5. **Reconciliation is abstraction-based, not provider-specific.** `ChatMessageFinder` defines the contract; each provider implements it.
6. **Provider extensions are advisory.** Removing all `source_extensions` from the system leaves all durable boundaries intact.
7. **Mail assumptions must not leak into messaging.** No `subject`, `to`, `cc`, `bcc`, `internet_message_id`, `is_read`, or folder semantics may appear in messaging types.

---

## 9. Verification Evidence

- Decision artifact exists at `.ai/decisions/20260423-541-messaging-family-boundary-contract.md`.
- `pnpm verify` — all 5 steps pass (task file guard, typecheck, build, charters tests, ops-kit tests).
- `pnpm typecheck` — all packages pass.
- Existing `Source` interface is domain-neutral and supports opaque payload/checkpoint.
- Existing `FactType` union in `packages/layers/control-plane/src/facts/types.ts` has expansion points for new families.
- Existing `INTENT_FAMILIES` registry in `packages/layers/control-plane/src/intent/registry.ts` uses family-scoped intent names (`mail.*`, `process.run`, `campaign.brief`), confirming `messaging.*` is the correct pattern.
- No `mailbox_id`, `conversation_id`, `subject`, or `internet_message_id` appears in messaging normalized shape.
- No code changes were made; this is a documentation and contract task.

---

## Closure Statement

The messaging-connectivity boundary is defined: the kernel treats messaging as a provider-family bounded by conversational event-stream semantics and chat-native identity. Telegram is one implementation behind this boundary. WhatsApp and Signal can be added by implementing the seven components in §5.1. The kernel must never assume mail-specific message shape, addressing, container, draft, or reconciliation semantics. Messaging and mail are parallel families with distinct normalized shapes, intent types, and identity models.

---

**Closed by:** codex
**Closed at:** 2026-04-23
