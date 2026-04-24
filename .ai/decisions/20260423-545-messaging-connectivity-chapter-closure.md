# Decision 545 — Messaging Connectivity Chapter Closure

> **Status:** Closed  
> **Governed by:** task_close:codex  
> **Closes Chapter:** Messaging Connectivity Family Boundary (Tasks 541, 542, 543, 544, 545)

---

## Summary

The Messaging Connectivity Family Boundary Chapter is closed. Narada has defined a **bounded messaging-connectivity family** parallel to mail connectivity, with Telegram as the first concrete provider contract. The chapter produced four interlocking contracts:

1. **Decision 541** — The canonical provider-agnostic messaging boundary (`NormalizedChatUpdate`, `ChatMessageFinder`, 7 required implementations).
2. **Decision 542** — Telegram Bot API fit against that boundary (7 reused components, 10 new adapter components, 4 bounded blockers with resolutions).
3. **Decision 543** — The hard anti-smear boundary between messaging and mail (4 membership rules, 4 hard distinctions, 10 forbidden phrases, cross-family adapter rules).
4. **Decision 544** — The intent and confirmation boundary for messaging outbound (5 `messaging.*` intent types, draft-free state machine, synchronous/async confirmation models, 12 intentional absences vs mail).

The messaging family is **not** "chat as another mail provider." It has its own normalized shape, identity model, intent family, state machine, and confirmation semantics.

---

## What This Chapter Accomplished

| Task | What Was Delivered |
|------|-------------------|
| **541** | Messaging family boundary contract: `NormalizedChatUpdate` with 10 provider-agnostic fields, `source_extensions` slot, 5 intent families, `ChatMessageFinder` reconciliation contract, 7 required implementations for new providers, 12 anti-mail-leakage assumptions, 7 invariants |
| **542** | Telegram provider contract: ingress mapping (`getUpdates`/webhook → `SourceBatch`), complete `NormalizedChatUpdate` field mapping, topic identity boundary rule, media descriptor shape, egress mapping to intent families, synchronous confirmation model, 7 reused vs 10 new components, 4 bounded blockers with resolutions, 6 risks, 6 invariants |
| **543** | Messaging-vs-mail anti-smear contract: 4 membership rules, 4 hard distinctions (event stream, draft boundary, reconciliation, action loop), 10 anti-smear phrases with replacements, cross-family adapter rules, Slack/SMS as adjacent non-members |
| **544** | Intent and confirmation boundary: 5 `messaging.*` intent types with payload schemas, draft-free state machine (`pending → sending → submitted → confirmed`), exact `isValidTransition` overrides documented, synchronous vs asynchronous confirmation per provider, `ChatMessageFinder` reconciliation rules per action type, 12 intentional absences vs mail, schema accommodation notes, bounded blockers for implementation |

---

## What Is Now Explicit

### 1. Bounded Messaging Family (Decision 541)

The messaging family is a **provider-family bounded by conversational event-stream semantics**, not by mail shape or any one provider's API:

| Property | What It Is | What It Is Not |
|----------|-----------|----------------|
| **Native data unit** | Chat update / message with `chat_id`, `message_id`, `text` | Not an RFC 5322 message |
| **Container** | `chat_id` (one-to-one, group, channel) | Not a mailbox/folder |
| **Addressing** | `chat_id` + `sender_id` | Not `From`/`To`/`Cc`/`Bcc` |
| **Threading** | `reply_to_message_id` | Not `References`/`In-Reply-To` |
| **Subject** | Absent | Not optional or emulated |
| **Body** | Plain text + `parse_mode` | Not MIME (`text/plain`, `text/html`) |
| **Attachments** | `media` arrays | Not MIME parts |
| **Read state** | Typically unavailable | Not `is_read` |
| **Draft stage** | Absent | Not supported or emulated |
| **Edit** | First-class provider operation | Not "send replacement" |
| **Confirmation** | Often synchronous (API response) | Not always async delta reconciliation |

**Proof it is bounded:** The boundary requires **zero mail-specific fields** in `NormalizedChatUpdate`. No `subject`, `to`, `cc`, `bcc`, `internet_message_id`, or folder semantics appear. Removing all `source_extensions` leaves all durable boundaries intact.

### 2. Telegram Fit (Decision 542)

Telegram Bot API maps **cleanly** to the messaging boundary:

| Boundary Layer | Telegram Implementation | Effort |
|----------------|------------------------|--------|
| Source adapter | `TelegramSource` with `getUpdates` or webhook buffer | Medium |
| Normalizer | `TelegramNormalizer` maps `Update` → `NormalizedChatUpdate` | Medium |
| Auth | `TelegramTokenProvider` wraps bot token | Low |
| Send worker | `TelegramBotClient.sendMessage()` | Low |
| Edit worker | `TelegramBotClient.editMessageText()` | Low |
| Delete worker | `TelegramBotClient.deleteMessage()` | Low |
| Message finder | `TelegramMessageFinder` with local tracking fallback | Medium |

**Proof it fits:** All 10 `NormalizedChatUpdate` fields are mappable from Telegram `Update` objects. The synchronous confirmation model means no async reconciliation polling is required in the happy path.

### 3. Anti-Smear Boundary (Decision 543)

Messaging and mail are **parallel, non-hierarchical** families:

| Risk | Prevention |
|------|-----------|
| "Messaging is mail without subjects" | 12 anti-mail-leakage assumptions in Decision 541 |
| "Mail is messaging with extra headers" | 4 hard distinctions in Decision 543 §3 |
| "Telegram messages normalize to `NormalizedMessage`" | `NormalizedChatUpdate` is a distinct type with no shared fields |
| "We can reuse `mail.send_reply` for Telegram" | `messaging.send_reply` is a separate intent type in `INTENT_FAMILIES` |
| "Cross-family conversion happens automatically" | Cross-family adapters must be explicit, chartered, and auditable (Decision 543 §6) |

**Proof anti-smear is preserved:** 10 forbidden phrases are recorded with preferred replacements. Slack and SMS are explicitly classified as adjacent non-members.

### 4. Intent/Confirmation Boundary (Decision 544)

Messaging outbound uses the **same universal `Intent` admission path** as mail, but with chat-native semantics:

| Property | Mail | Messaging |
|----------|------|-----------|
| Draft stage | `pending → draft_creating → draft_ready` | **Absent** |
| Approval gate | Required for `send_reply`/`send_new_message` | **Optional by default** |
| State machine | 7 statuses before `confirmed` | 4 statuses before `confirmed` |
| Payload | `to`, `cc`, `bcc`, `subject`, `body_text`, `body_html` | `chat_id`, `message_id`, `text`, `parse_mode`, `media` |
| Managed draft | `ManagedDraft` verification | **Absent** |
| Confirmation | Typically async (5-minute window) | Often synchronous (near-zero window) |

**Proof intent boundary is preserved:** All 5 `messaging.*` intent types declare `executor_family: "messaging"`. No intent may be created outside the foreman's atomic handoff transaction. Idempotency is enforced at `idempotency_key`.

---

## What Remains Deferred or Unproven

### Deferred Implementations

| # | Deferred Item | Current State | Blocker / Effort |
|---|--------------|---------------|-----------------|
| 1 | **`messaging.*` intent types in `INTENT_FAMILIES`** | Proposed in Decision 544; not registered | Low — extend union and registry |
| 2 | **`messaging.message.received` fact type** | Proposed in Decision 541/542; not in `FactType` union | Low — extend `FactType` |
| 3 | **`messaging.interaction.received` fact type** | Proposed in Decision 542 for callback queries; not in `FactType` union | Low — extend `FactType` |
| 4 | **`isValidTransition` messaging overrides** | 4 overrides documented in Decision 544; not in code | Low — add action-specific rules |
| 5 | **`TelegramSource` adapter** | Specified in Decision 542; not implemented | Medium — `getUpdates` or webhook queue |
| 6 | **`TelegramNormalizer`** | Specified in Decision 542; not implemented | Medium — field mapping + media descriptors |
| 7 | **`TelegramTokenProvider`** | Specified in Decision 542; not implemented | Low — wrap bot token |
| 8 | **`TelegramBotClient`** | Specified in Decision 542; not implemented | Medium — HTTP client for Bot API |
| 9 | **`ChatSendWorker` / `ChatEditWorker` / `ChatDeleteWorker`** | Specified in Decisions 542/544; not implemented | Low — delegate to `TelegramBotClient` |
| 10 | **`ChatAckWorker`** | Specified in Decision 544; not implemented | Low — `answerCallbackQuery` |
| 11 | **`TelegramMessageFinder`** | Specified in Decision 542; not implemented | Medium — local tracking + fallback |
| 12 | **`outbound_versions` schema accommodation** | Documented in Decision 544; no migration | Low — messaging payloads use `payload_json` with mail-column defaults |
| 13 | **Integration tests for messaging** | No tests exist | Medium — fixture-based source + worker tests |
| 14 | **WhatsApp provider contract** | Future provider; no work started | Deferred to post-Telegram |
| 15 | **Signal provider contract** | Future provider; no work started | Deferred to post-Telegram |

### Unproven Assumptions

| # | Assumption | Risk | Mitigation |
|---|-----------|------|------------|
| 1 | `outbound_versions` mail columns with defaults are acceptable for messaging | May confuse observability queries that expect `subject` to mean something | Use `action_type` prefix filtering; future schema evolution to nullable columns |
| 2 | Synchronous confirmation is sufficient for Telegram | Crash between `submitted` and `confirmed` loses mapping | Local `outbound_id → telegram_message_id` table + `findBySenderAndText` fallback |
| 3 | `chat_id` is stable across Telegram updates | Supergroup migration may change `chat_id` | Charter governance uses `sender_id` + `chat_id` composite; migration is rare |
| 4 | One `messaging_send_message` action type covers all Telegram send variants | Photo, document, voice have different Bot API endpoints | `media` array in payload drives endpoint selection inside `TelegramBotClient` |

---

## Invariants Preserved

1. **Messaging is not honorary mail.** No mail-specific fields (`subject`, `to`, `cc`, `bcc`, `internet_message_id`) appear in messaging types.
2. **Mail is not honorary messaging.** No chat-specific fields (`chat_id`, `parse_mode`) appear in mail types.
3. **Intent is the universal effect boundary.** All messaging side effects pass through `Intent` admission; no direct API calls from charters.
4. **State machine is draft-free by default.** `draft_creating` and `draft_ready` are never entered for messaging actions.
5. **Confirmation is model-driven.** Provider capability (synchronous vs asynchronous) determines confirmation path, not intent type.
6. **Provider extensions are advisory.** Removing all `source_extensions` from messaging payloads leaves all durable boundaries intact.
7. **Cross-family adapters are explicit.** Any conversion between messaging and mail requires a chartered, auditable adapter — never implicit.

---

## Verification Evidence

- Decision artifacts exist for all 4 chapter tasks:
  - `.ai/decisions/20260423-541-messaging-family-boundary-contract.md` (261 lines) ✅
  - `.ai/decisions/20260423-542-telegram-provider-contract.md` (353 lines) ✅
  - `.ai/decisions/20260423-543-messaging-vs-mail-boundary.md` (206 lines) ✅
  - `.ai/decisions/20260423-544-messaging-intent-and-confirmation-boundary.md` (426 lines) ✅
- `pnpm verify` — all 5 steps pass (no code changes) ✅
- `pnpm typecheck` — all packages pass ✅
- No `mail.*` fact types or intent types were modified ✅
- No code, CLI flags, DB migrations, or package APIs were modified ✅
- No derivative status files created ✅

---

## Closure Statement

The Messaging Connectivity Family Boundary Chapter closes with Narada having an explicit, bounded, and provider-agnostic messaging family parallel to mail connectivity. The boundary is defined by `NormalizedChatUpdate` (chat-native shape), `messaging.*` intent types (family-scoped, not provider-scoped), a draft-free state machine, and `ChatMessageFinder` reconciliation. Telegram is the first concrete provider fitted against this boundary, with 7 reusable components and 10 new adapter components specified. The anti-smear boundary between messaging and mail is preserved by 4 membership rules, 4 hard distinctions, and 10 forbidden phrases. What remains is implementation: registering `messaging.*` intent types, building the Telegram source adapter and normalizer, implementing send/edit/delete/ack workers, and wiring the `TelegramMessageFinder`. These are bounded, well-specified, and can proceed as the next executable provider line.

---

## Next Executable Provider Line

The next executable implementation is the **Telegram Bot API Messaging Vertical**:

1. **Register messaging intent and fact types** (~50 lines)
   - Extend `IntentType` union with `messaging.send_message`, `messaging.send_reply`, `messaging.edit_message`, `messaging.delete_message`, `messaging.ack_callback`
   - Add entries to `INTENT_FAMILIES` registry with chat-native payload schemas
   - Extend `FactType` union with `messaging.message.received` and `messaging.interaction.received`
   - Extend `OutboundActionType` with `messaging_*` variants
   - Add messaging cases to `toIntentType()` and `toExecutorFamily()`
   - Add messaging transition rules to `isValidTransition()`

2. **Implement Telegram source adapter** (~300 lines)
   - `TelegramSource` implementing `Source` with `getUpdates` long-polling
   - `TelegramNormalizer` mapping `Update` → `NormalizedChatUpdate`
   - `TelegramTokenProvider` wrapping bot token auth
   - Webhook buffer integration with existing `WebhookSource`

3. **Implement Telegram bot client and outbound workers** (~400 lines)
   - `TelegramBotClient` HTTP client for `sendMessage`, `editMessageText`, `deleteMessage`, `answerCallbackQuery`
   - `ChatSendWorker` executing `messaging_send_message` and `messaging_send_reply`
   - `ChatEditWorker` executing `messaging_edit_message`
   - `ChatDeleteWorker` executing `messaging_delete_message`
   - `ChatAckWorker` executing `messaging_ack_callback`
   - `TelegramMessageFinder` implementing `ChatMessageFinder`

4. **Verify with fixture-backed tests** (~200 lines)
   - Normalizer unit tests with mock Telegram `Update` objects
   - Bot client unit tests with HTTP mocks
   - Worker integration tests with memfs/outbound store mocks
   - End-to-end source → fact → intent → outbound command test

This implementation line is bounded to ~950 lines of new code and can be executed as a single focused chapter or as 2–3 parallel tasks (type registration, source adapter, outbound workers).

---

**Closed by:** codex  
**Closed at:** 2026-04-23
