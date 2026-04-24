# Decision 544 — Messaging Intent And Confirmation Boundary

**Date:** 2026-04-23
**Task:** 544
**Depends on:** 541 (Messaging Family Boundary Contract)
**Chapter:** Messaging Connectivity Family Boundary (541–545)
**Verdict:** **Contract accepted. Messaging outbound uses the same Intent admission path as mail, but with a draft-free, chat-native state machine and confirmation model.**

---

## 1. Problem Statement

Narada's outbound infrastructure (`OutboundCommand`, `SendReplyWorker`, `OutboundReconciler`) is shaped around mail semantics:

- **Draft-first delivery:** `pending → draft_creating → draft_ready` before any message reaches a provider.
- **Approval gate:** `send_reply` and `send_new_message` require `approved_for_send` before `sending`.
- **Mail-shaped version payload:** `to[]`, `cc[]`, `bcc[]`, `subject`, `body_text`, `body_html`.
- **Managed draft verification:** `ManagedDraft` tracks Graph draft integrity via `body_hash`, `recipients_hash`, `subject_hash`.
- **Async reconciliation:** `submitted → confirmed` via polling `MessageFinder` because Graph send acceptance and inbox visibility are decoupled.

Messaging platforms (Telegram, WhatsApp, Signal) have **none** of these properties:

- Chat messages are sent immediately; there is no draft stage.
- Bot-sent messages do not require operator approval by default.
- Chat identity is `chat_id` + `message_id`, not `to`/`cc`/`subject`.
- Confirmation is often synchronous (the API response contains the sent message).
- Edit and delete are first-class provider operations, not emulated via replacement.

Without an explicit intent and confirmation boundary, messaging outbound will either:

1. **Inherit mail semantics by default** — fake draft stages, synthetic approval gates, and empty `subject` fields in `OutboundVersion`.
2. **Bypass the Intent boundary** — send messages directly from charter tools without durable `Intent` admission, breaking the universal effect boundary.

This contract defines the **canonical messaging outbound intent family**, the **draft-free state machine**, and the **confirmation/reconciliation semantics** that keep Intent as the universal durable effect boundary while respecting chat-native lifecycle.

---

## 2. Core Thesis

> **Messaging outbound is intent-governed but draft-free. It uses the same Intent admission path as mail, but its state machine, payload shape, and confirmation model are chat-native, not mail-derived.**

The boundary consists of:

1. **Intent Family:** `messaging.*` intent types registered in `INTENT_FAMILIES` with chat-native payload schemas.
2. **State Machine:** `pending → sending → submitted → confirmed` (no draft stage, no approval gate by default).
3. **Payload Shape:** `chat_id`, `message_id`, `text`, `media`, `parse_mode` — no `to`/`cc`/`bcc`/`subject`.
4. **Confirmation Model:** Synchronous (API response) where supported, asynchronous (inbound observation) where required.
5. **Reconciliation Contract:** `ChatMessageFinder` interface binding submitted effects to observed chat state.

---

## 3. Messaging Intent Family

### 3.1 Canonical Intent Types

| Intent Type | Executor Family | Description | Confirmation Model |
|-------------|-----------------|-------------|-------------------|
| `messaging.send_message` | `messaging` | Send a new message to a chat | `implicit` |
| `messaging.send_reply` | `messaging` | Send a reply to an existing message | `implicit` |
| `messaging.edit_message` | `messaging` | Edit a previously sent message | `implicit` |
| `messaging.delete_message` | `messaging` | Delete a message from a chat | `none` |
| `messaging.ack_callback` | `messaging` | Acknowledge a callback query or button press | `none` |

> **Note on `confirmation_model`:** This field in `INTENT_FAMILIES` is a **registry-level annotation**, not a runtime behavior switch. The worker and reconciler determine actual confirmation behavior based on action type and provider capability. The registry value documents intent designer intent.

**Proposed registry entries (`INTENT_FAMILIES`):**

```typescript
"messaging.send_message": {
  intent_type: "messaging.send_message",
  executor_family: "messaging",
  payload_schema: obj({
    chat_id: { type: "string" },
    text: { type: "string" },
    parse_mode: { type: "string" },
    media: { type: "array" },
    inline_keyboard: { type: "array" },
  }, ["chat_id", "text"]),
  idempotency_scope: "context_action",
  confirmation_model: "implicit",
},
"messaging.send_reply": {
  intent_type: "messaging.send_reply",
  executor_family: "messaging",
  payload_schema: obj({
    chat_id: { type: "string" },
    reply_to_message_id: { type: "string" },
    text: { type: "string" },
    parse_mode: { type: "string" },
    media: { type: "array" },
  }, ["chat_id", "reply_to_message_id", "text"]),
  idempotency_scope: "context_action",
  confirmation_model: "implicit",
},
"messaging.edit_message": {
  intent_type: "messaging.edit_message",
  executor_family: "messaging",
  payload_schema: obj({
    chat_id: { type: "string" },
    message_id: { type: "string" },
    text: { type: "string" },
    parse_mode: { type: "string" },
  }, ["chat_id", "message_id", "text"]),
  idempotency_scope: "context_action",
  confirmation_model: "implicit",
},
"messaging.delete_message": {
  intent_type: "messaging.delete_message",
  executor_family: "messaging",
  payload_schema: obj({
    chat_id: { type: "string" },
    message_id: { type: "string" },
  }, ["chat_id", "message_id"]),
  idempotency_scope: "context_action",
  confirmation_model: "none",
},
"messaging.ack_callback": {
  intent_type: "messaging.ack_callback",
  executor_family: "messaging",
  payload_schema: obj({
    chat_id: { type: "string" },
    callback_query_id: { type: "string" },
    text: { type: "string" },
    show_alert: { type: "boolean" },
  }, ["chat_id", "callback_query_id"]),
  idempotency_scope: "context_action",
  confirmation_model: "none",
},
```

### 3.2 Intent Boundary Invariants (Messaging-Specific)

1. **All messaging effects must be represented as an `Intent` before execution.** No charter tool may call a messaging provider API directly without an admitted intent.
2. **Idempotency is enforced at `idempotency_key`.** The key is computed from `(context_id, intent_type, payload)`.
3. **No `messaging.*` intent may be created outside the foreman's atomic handoff transaction.** Same invariant as `mail.*`.
4. **Intent types are family-scoped, not provider-scoped.** `messaging.send_message` works for Telegram, WhatsApp, and Signal.
5. **Authority class enforcement applies.** A charter must declare `execute` authority for `messaging.*` intents; domain packs may only declare `derive` and `propose`.

---

## 4. Messaging Outbound State Machine

### 4.1 Canonical Transitions

Messaging uses a **subset** of the `OutboundStatus` union. Mail-specific statuses (`draft_creating`, `draft_ready`) are never entered by default. `approved_for_send` is optional — policy may insert it, but the default path bypasses it.

```
pending ──→ sending ──→ submitted ──→ confirmed
   │           │            │
   │           ▼            ▼
   └──→ blocked_policy   retry_wait ──→ failed_terminal
   │
   └──→ cancelled
   │
   └──→ superseded
```

**Valid transitions for messaging action types:**

| From | To | Messaging Rule | In `VALID_TRANSITIONS`? |
|------|----|----------------|------------------------|
| `pending` | `sending` | Normal start (draft-free) | **No** — requires `isValidTransition` override |
| `pending` | `approved_for_send` | Policy requires approval | **No** — requires `isValidTransition` override |
| `pending` | `blocked_policy` | Policy rejected before send | Yes |
| `pending` | `cancelled` | Operator cancelled | Yes |
| `pending` | `superseded` | Newer version created | Yes |
| `approved_for_send` | `sending` | Approval granted | Yes |
| `sending` | `submitted` | Provider API returned success | Yes |
| `sending` | `confirmed` | Synchronous confirmation (skip `submitted`) | **No** — requires `isValidTransition` override |
| `sending` | `retry_wait` | Transient provider error | Yes |
| `sending` | `failed_terminal` | Permanent provider error | Yes |
| `submitted` | `confirmed` | Reconciler found evidence | Yes |
| `submitted` | `retry_wait` | Reconciliation window expired | Yes |
| `retry_wait` | `sending` | Retry attempt (draft-free) | **No** — requires `isValidTransition` override |
| `retry_wait` | `failed_terminal` | Max retries exceeded | Yes |
| `blocked_policy` | `pending` | Policy override / re-evaluation | Yes |
| `blocked_policy` | `cancelled` | Operator cancelled | Yes |
| `blocked_policy` | `superseded` | Newer version created | Yes |

**Required `isValidTransition` overrides for messaging:**

```typescript
// In isValidTransition() — messaging action-specific additions:
const messagingActions: OutboundCommand["action_type"][] = [
  "messaging_send_message",
  "messaging_send_reply",
  "messaging_edit_message",
  "messaging_delete_message",
  "messaging_ack_callback",
];

if (actionType && messagingActions.includes(actionType)) {
  // Draft-free: pending may go directly to sending
  if (from === "pending" && to === "sending") return true;
  // Optional approval gate: pending may go to approved_for_send
  if (from === "pending" && to === "approved_for_send") return true;
  // Retry without draft stage: retry_wait may go directly to sending
  if (from === "retry_wait" && to === "sending") return true;
  // Synchronous confirmation: sending may go directly to confirmed
  if (from === "sending" && to === "confirmed") return true;
}
```

**Key differences from mail:**

| Aspect | Mail | Messaging |
|--------|------|-----------|
| Draft stage | `pending → draft_creating → draft_ready` | **Absent** |
| Approval gate | `draft_ready → approved_for_send → sending` | **Absent by default** |
| Send eligibility | Requires `approved_for_send` or `retry_wait` | Requires `pending` or `retry_wait` |
| Version fields | `to`, `cc`, `bcc`, `subject`, `body_text`, `body_html` | `chat_id`, `message_id`, `text`, `parse_mode`, `media` (in `payload_json`) |
| Managed draft | `ManagedDraft` tracks Graph draft integrity | **Absent** — no draft to manage |

### 4.2 Action Type Mapping

| Intent Type | Outbound Action Type | Notes |
|-------------|---------------------|-------|
| `messaging.send_message` | `messaging_send_message` | New chat message |
| `messaging.send_reply` | `messaging_send_reply` | Reply to existing message |
| `messaging.edit_message` | `messaging_edit_message` | Edit previously sent message |
| `messaging.delete_message` | `messaging_delete_message` | Remove message from chat |
| `messaging.ack_callback` | `messaging_ack_callback` | Answer callback query |

The `OutboundActionType` union must be extended with these prefixed types to avoid collision with un-prefixed mail action types.

---

## 5. Confirmation and Reconciliation Semantics

### 5.1 Two Confirmation Models

Messaging supports **two** confirmation models, chosen per provider capability:

| Model | When Used | Transition Path | Evidence |
|-------|-----------|-----------------|----------|
| **Synchronous implicit** | Provider API returns the sent message object (Telegram Bot API, WhatsApp Business API) | `sending → submitted → confirmed` (two transitions in one worker invocation) or `sending → confirmed` directly (requires override) | API response body containing `message_id` |
| **Asynchronous implicit** | Provider API returns bare success; confirmation requires inbound observation | `sending → submitted` (worker), then `submitted → confirmed` (reconciler) | `ChatMessageFinder` locates message by `outbound_id` or `message_id` |

**Default per provider:**

| Provider | Send Confirmation | Edit Confirmation | Delete Confirmation |
|----------|-------------------|-------------------|---------------------|
| Telegram | Synchronous | Synchronous | Synchronous |
| WhatsApp | Synchronous | N/A (unsupported) | Synchronous |
| Signal | Asynchronous (local bridge) | N/A | N/A |

### 5.2 Reconciliation Contract (`ChatMessageFinder`)

The reconciler uses the same `ChatMessageFinder` interface defined in Decision 541:

```typescript
interface ChatMessageFinder {
  findByOutboundId(chatId: string, outboundId: string): Promise<FoundChatMessage | undefined>;
  findByMessageId(chatId: string, messageId: string): Promise<FoundChatMessage | undefined>;
  findBySenderAndText(chatId: string, senderId: string, text: string, sentAfter: string): Promise<FoundChatMessage | undefined>;
}
```

**Reconciliation rules per action type:**

| Action Type | Confirmation Condition | Fallback |
|-------------|------------------------|----------|
| `messaging_send_message` | `findByMessageId` returns message with matching `message_id` from API response | `findBySenderAndText` with bot `sender_id` + sent text + `sentAfter` |
| `messaging_send_reply` | Same as `send_message`, plus `reply_to_message_id` matches | Same as `send_message` |
| `messaging_edit_message` | `findByMessageId` returns message with edited text | `findByOutboundId` |
| `messaging_delete_message` | `findByMessageId` returns `undefined` (message no longer exists) | No fallback — deletion is best-effort |
| `messaging_ack_callback` | No reconciliation needed (`confirmation_model: "none"`) | N/A |

### 5.3 Confirmation Window

- **Synchronous providers:** Confirmation window is **near-zero** (seconds). The worker records confirmation immediately.
- **Asynchronous providers:** Confirmation window defaults to **30 seconds** (much shorter than mail's 5 minutes) because chat delivery is typically immediate.
- **Edit/delete:** Use the same window as send for the provider.

### 5.4 Idempotency and Retry

- **Idempotency key** is computed from `(context_id, action_type, payload)`.
- **Send/reply:** If the provider API returns a message object, the provider `message_id` is captured in `OutboundVersion.payload_json` (e.g., `{ provider_message_id: "123" }`) for reconciliation.
- **Edit:** If edit fails because the message was already deleted, transition to `failed_terminal` with reason `target_message_deleted`.
- **Delete:** If delete fails because message is already gone, treat as success (idempotent delete).

---

## 6. Intentional Absences: Where Messaging ≠ Mail

These are **deliberate design choices**, not gaps. Messaging outbound explicitly does not inherit these mail semantics.

### 6.1 Draft and Approval Absences

| # | Absence | Rationale |
|---|---------|-----------|
| 1 | **No `draft_creating` → `draft_ready` phase** | Chat has no draft stage. Messages are sent immediately or not at all. |
| 2 | **No `approved_for_send` gate by default** | Bot messages do not require operator approval. Policy may still enforce approval, but the default state machine does not. |
| 3 | **No `ManagedDraft` tracking** | There is no draft to verify against external modification. |
| 4 | **No draft reuse** | Mail drafts may be edited and re-sent. Chat messages are immutable after send (edit is a separate operation). |

### 6.2 Message Shape Absences

| # | Absence | Rationale |
|---|---------|-----------|
| 5 | **No `to` / `cc` / `bcc` fields** | Chat has a single `chat_id` container. There are no carbon-copy semantics. |
| 6 | **No `subject` field** | Chat messages do not have subjects. |
| 7 | **No `body_text` / `body_html` split** | Chat uses `text` with optional `parse_mode` (`Markdown`, `HTML`). |
| 8 | **No `internet_message_id`** | Chat platforms do not use RFC 2822 `Message-Id`. Identity is provider-local `message_id`. |
| 9 | **No MIME attachment structure** | Attachments are `media` arrays with `type`, `url`, `file_id`, not MIME parts. |

### 6.3 Reconciliation Absences

| # | Absence | Rationale |
|---|---------|-----------|
| 10 | **No read-state reconciliation** | Most chat platforms do not expose per-message read state to bots. |
| 11 | **No folder/move reconciliation** | Chat has no folders. Messages are not moved between containers. |
| 12 | **No archive vs. delete distinction** | `delete_message` removes the message. There is no archive operation. |

---

## 7. Schema Accommodation

### 7.1 Neutral Tables (Already Compatible)

The following tables are family-neutral and require **no changes** for messaging:

- **`outbound_handoffs`** — stores `outbound_id`, `context_id`, `scope_id`, `action_type`, `status`, `idempotency_key`. All fields are family-agnostic.
- **`outbound_transitions`** — stores status transitions. Family-agnostic.

### 7.2 Mail-Shaped Tables (Require Extension)

The following tables are currently mail-shaped and need accommodation for messaging:

**`outbound_versions`**:
- Mail-specific columns (`to_json`, `cc_json`, `bcc_json`, `subject`) remain with defaults (`[]`, `[]`, `[]`, `''`) for messaging commands.
- Messaging payload lives in `payload_json` with the schema defined in §3.1.
- `reply_to_message_id` is reusable for messaging replies.
- `body_text` and `body_html` may be used to store the plain text representation for observability, but canonical payload is in `payload_json`.

**`managed_drafts`**:
- **Not used for messaging.** This table is mail-specific and remains empty for messaging action types.
- Future schema evolution may rename this to `managed_outbound_artifacts` or create a messaging-specific tracking table (e.g., `managed_messages`).

### 7.3 Recommended Future Schema Evolution

| Priority | Change | Rationale |
|----------|--------|-----------|
| Low | Make `outbound_versions` mail columns nullable without defaults | Avoids meaningless default values for messaging commands |
| Low | Extract `managed_drafts` to a mail-specific store interface | Prevents messaging code from accidentally referencing draft tables |
| Medium | Add `provider_family` column to `outbound_handoffs` | Enables efficient filtering by `mail` vs `messaging` without parsing `action_type` |

---

## 8. Bounded Blockers and Implementation Path

The boundary contract is **defined but not yet implemented**. The following codebase changes are required to admit `messaging.*` intents:

### 8.1 Type System Changes

| File | Change | Effort |
|------|--------|--------|
| `packages/layers/control-plane/src/intent/types.ts` | Extend `IntentType` union with `messaging.*` variants | Low |
| `packages/layers/control-plane/src/intent/registry.ts` | Add `messaging.*` entries to `INTENT_FAMILIES` | Low |
| `packages/layers/control-plane/src/outbound/types.ts` | Extend `OutboundActionType` with `messaging_*` variants; add messaging transition rules to `isValidTransition` | Low |
| `packages/layers/control-plane/src/intent/types.ts` | Extend `toIntentType()` and `toExecutorFamily()` with messaging cases | Low |

### 8.2 Worker Layer (New Components)

| Component | Responsibility | Effort |
|-----------|---------------|--------|
| `ChatSendWorker` | Execute `messaging_send_message` and `messaging_send_reply` via provider client | Medium |
| `ChatEditWorker` | Execute `messaging_edit_message` via provider client | Low |
| `ChatDeleteWorker` | Execute `messaging_delete_message` via provider client | Low |
| `ChatAckWorker` | Execute `messaging_ack_callback` via provider client | Low |
| `ChatMessageFinder` (per provider) | Implement reconciliation lookup for Telegram/WhatsApp/Signal | Medium |

### 8.3 Foreman Handoff

| File | Change | Effort |
|------|--------|--------|
| `packages/layers/control-plane/src/foreman/handoff.ts` | `OutboundHandoff.createCommandFromDecision()` already family-agnostic for `outbound_handoffs`. May need payload parsing update for messaging fields. | Low |

### 8.4 Degradation Rules

If a provider does not support a capability (e.g., WhatsApp does not support `edit_message`), the intent is rejected at **provider-binding time** with:

```
unsupported_action: messaging.edit_message is not supported for provider 'whatsapp'
```

This is a `failed_terminal` transition with `terminal_reason` set to the unsupported action error.

---

## 9. Invariants

1. **Intent is the universal effect boundary for messaging.** All messaging side effects must pass through `Intent` admission; no charter tool may call provider APIs directly.
2. **Messaging state machine is draft-free.** `draft_creating` and `draft_ready` are never entered for messaging action types. `approved_for_send` is optional (policy may insert it) but not required by default.
3. **Intent types are family-scoped.** `messaging.send_message` is provider-agnostic; Telegram, WhatsApp, and Signal all use the same intent type.
4. **Confirmation is model-driven, not family-driven.** A provider may use synchronous or asynchronous confirmation independently of the intent type.
5. **Mail assumptions must not leak into messaging.** No `subject`, `to`, `cc`, `bcc`, `internet_message_id`, `is_read`, folder semantics, or draft tracking in messaging types.
6. **Provider extensions are advisory.** Removing all `source_extensions` from messaging payloads leaves all durable boundaries intact.
7. **Degradation is explicit.** Unsupported intents are rejected at provider-binding time with a clear error, not silently dropped.

---

## 10. Verification Evidence

- Decision artifact exists at `.ai/decisions/20260423-544-messaging-intent-and-confirmation-boundary.md`.
- `pnpm verify` — all 5 steps pass (no code changes required for boundary definition).
- `pnpm typecheck` — all packages pass.
- Existing `Intent` interface in `packages/layers/control-plane/src/intent/types.ts` is family-neutral and supports new `intent_type` values.
- Existing `INTENT_FAMILIES` registry in `packages/layers/control-plane/src/intent/registry.ts` has expansion points for new families.
- Existing `outbound_handoffs` table schema is family-neutral (`action_type`, `status` are opaque strings).
- `OutboundCommand` state machine in `packages/layers/control-plane/src/outbound/types.ts` already supports action-specific transition rules (used for `mark_read`, `move_message`, `set_categories`).
- `isValidTransition()` accepts an optional `actionType` parameter for action-specific rules; the artifact documents the exact 4 overrides needed for messaging (`pending→sending`, `pending→approved_for_send`, `sending→confirmed`, `retry_wait→sending`).
- No `mail.*` intent types or outbound types were modified.
- No code, CLI flags, DB migrations, or package APIs were modified.
- No derivative status files created.

---

## 11. Closure Statement

The messaging intent and confirmation boundary is defined: messaging outbound uses the same universal `Intent` admission path as mail, but with a draft-free, chat-native state machine (`pending → sending → submitted → confirmed`) and chat-native payload shape (`chat_id`, `message_id`, `text`, `parse_mode`). Confirmation may be synchronous (API response) or asynchronous (inbound reconciliation) depending on provider capability. The `messaging.*` intent family (`send_message`, `send_reply`, `edit_message`, `delete_message`, `ack_callback`) is provider-agnostic; Telegram, WhatsApp, and Signal implement the same intent types behind provider-specific executors and `ChatMessageFinder` implementations. Messaging explicitly does not inherit mail draft stages, approval gates, `to`/`cc`/`bcc`/`subject` fields, `internet_message_id`, managed draft verification, or read-state reconciliation. Implementation requires extending the `IntentType` union, `INTENT_FAMILIES` registry, `OutboundActionType` union, and adding `ChatSendWorker`, `ChatEditWorker`, `ChatDeleteWorker`, `ChatAckWorker`, and per-provider `ChatMessageFinder` implementations.

---

**Closed by:** codex
**Closed at:** 2026-04-23
