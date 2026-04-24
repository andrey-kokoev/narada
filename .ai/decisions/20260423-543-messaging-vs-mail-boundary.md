# Decision 543 — Messaging vs Mail Boundary

**Date:** 2026-04-23  
**Task:** 543  
**Depends on:** 541 (Messaging Family Boundary Contract), 534 (Mail vs Adjacent Source Family Boundary), 531 (Mail Connectivity Boundary Contract)  
**Chapter:** Messaging Connectivity Family Boundary (541–545)  
**Verdict:** **Messaging and mail are parallel, non-hierarchical connectivity families. Neither is a subset, superset, or honorary member of the other.**

---

## 1. Problem Statement

Narada now hosts two conversation-shaped connectivity families:

- **Mail family** (`mail.*`) — RFC 5322 correspondence with mailbox semantics.
- **Messaging family** (`messaging.*`) — conversational event-stream semantics with chat-native identity.

Both families handle human-readable threaded communication. Both have ingress (Source → Fact), egress (Intent → Execution), and reconciliation. This surface similarity creates **semantic smear risk**: agents, charters, and operators may treat messaging as "mail without subjects" or mail as "messaging with extra headers."

This decision records the **hard boundary** between the two families so that:

1. Messaging types never acquire mail-only fields (`subject`, `to`, `cc`, `internet_message_id`) by convenience.
2. Mail types never acquire chat-only fields (`chat_id`, `parse_mode`, `reply_to_message_id` as a primary thread key) by convenience.
3. Cross-family adapters (e.g., "send a mail message to a Telegram chat") are explicit, not implicit.

The canonical messaging family definition is in **Decision 541**. This artifact focuses exclusively on the **messaging-vs-mail distinction**.

---

## 2. Messaging-Family Membership Rules

A system qualifies as a member of the **messaging-connectivity family** if and only if it satisfies **all four** of the following criteria:

### 2.1 Conversational Event-Stream Shape
The system's native data unit is a chat message or update with:
- `chat_id` (conversation container)
- `message_id` (provider-local message identifier)
- `sender_id` (sender within the chat)
- `text` body (plain text with optional parse mode)
- Absent `subject` field

### 2.2 Chat Container Semantics
The system organizes messages into containers with chat semantics:
- Messages belong to a `chat_id` (one-to-one, group, or channel)
- No folder/mailbox hierarchy
- No read/unread state tracked per message by the platform
- Messages are not "moved" between containers

### 2.3 Reply-Based Threading
The system threads related messages via reply references:
- `reply_to_message_id` links a message to its parent
- No `References` / `In-Reply-To` headers (RFC 5322)
- No `conversation_id` or `threadId` as a primary grouping key (optional at best)

### 2.4 Send and Receive as Core Functions
Sending and receiving messages are core system functions:
- The system has a native send path (bot API, REST, websocket)
- The system has a native receive/ingest path (long-polling, webhook, websocket)

### 2.5 Membership Table

| System | Event-Stream | Chat Container | Reply Threading | Send/Receive | **Messaging Family?** |
|--------|-------------|----------------|-----------------|--------------|----------------------|
| Telegram Bot API | ✓ | ✓ | ✓ | ✓ | **Yes** |
| WhatsApp Business API | ✓ | ✓ | ✓ | ✓ | **Yes** |
| Signal REST bridge | ✓ | ✓ | ✓ | ✓ | **Yes** |
| **Microsoft Graph / Exchange** | ✗ (mailbox correspondence) | ✗ (folders) | ✗ (`References`/`In-Reply-To`) | ✓ | **No** |
| **Gmail / Google Workspace** | ✗ (mailbox correspondence) | ✗ (labels/folders) | ✗ (`References`/`In-Reply-To`) | ✓ | **No** |
| **Slack** | ✓ (chat) | ✓ (channels) | ✓ (thread_ts) | ✓ | **Adjacent** — see §5 |
| **SMS / Twilio** | ✓ (short messages) | ✗ (no chat container) | ✗ (no reply threading) | Partial | **Adjacent** — see §5 |

---

## 3. Messaging vs Mail: The Four Hard Distinctions

### 3.1 Conversational Event Stream vs Mailbox Correspondence

| Dimension | Mail Family | Messaging Family |
|-----------|-------------|------------------|
| **Native data unit** | RFC 5322 message | Chat update / message |
| **Container** | Mailbox / folder | Chat / conversation (`chat_id`) |
| **Message lifetime** | Stored until deleted/archived | Stored in chat history; deletion removes from chat |
| **Ingest model** | Delta sync or polling against stored messages | Event stream (long-polling, webhook, websocket) |
| **Historical access** | Full mailbox search and retrieval | Limited; typically recent messages only |
| **Fact type** | `mail.message.discovered` | `messaging.message.received` |

**Why it matters:** Mail is a *stored corpus* that is queried and synchronized. Messaging is an *event stream* that is consumed as it arrives. A mail source can re-fetch old messages; a messaging source typically cannot.

### 3.2 Weaker / Absent Draft Boundary

| Dimension | Mail Family | Messaging Family |
|-----------|-------------|------------------|
| **Draft stage** | Supported (optional but common) | Absent |
| **Pre-send staging** | Draft created, edited, approved, then sent | Message sent immediately or scheduled via API |
| **Outbound state machine** | `pending → draft_creating → draft_ready → approved_for_send → sending → submitted → confirmed` | `pending → sending → submitted → confirmed` |
| **Approval boundary** | Draft exists as a separable artifact | No separable artifact; approval is governance-only |
| **Edit after send** | Rare (send replacement message) | Supported by some providers (Telegram) |

**Why it matters:** The mail family's draft-first boundary is a core safety mechanism. Messaging has no equivalent native stage. If Narada adds a governance pause before sending a chat message, that pause is **purely control-plane** — there is no provider-side draft to inspect or edit.

### 3.3 Different Reconciliation Semantics

| Dimension | Mail Family | Messaging Family |
|-----------|-------------|------------------|
| **Confirmation model** | Often async (delta lag, webhook delay) | Often sync (API response contains `message_id`) |
| **Confirmation window** | Seconds to minutes (delta sync interval) | Near-zero (immediate API response) |
| **Reconciliation trigger** | Inbound delta observes sent message | API response + optional inbound confirmation |
| **Idempotency mechanism** | `internet_message_id` or `idempotency_key` in headers | `idempotency_key` in message text, caption, or reply markup |
| **Reconciliation interface** | `MessageFinder` (3 lookup methods) | `ChatMessageFinder` (3 lookup methods) |

**Why it matters:** Mail reconciliation is built around the expectation of lag. Messaging reconciliation may be synchronous, but the `OutboundCommand` state machine must still support the async path for providers that do not return immediate confirmation (or for webhook-based ingestion).

### 3.4 Faster Action / Response Loop

| Dimension | Mail Family | Messaging Family |
|-----------|-------------|------------------|
| **Typical response latency** | Minutes to hours | Seconds to minutes |
| **Message length expectation** | Long-form (paragraphs) | Short-form (sentences) |
| **Turn-taking model** | Async correspondence | Near-real-time conversation |
| **Charter interaction model** | Batch processing, scheduled review | Immediate reaction, inline response |
| **Human operator loop** | Review queue, async approval | Real-time monitoring, immediate intervention |

**Why it matters:** A charter designed for mail (batch review, draft approval, scheduled sends) will feel broken in messaging. A charter designed for messaging (immediate replies, inline buttons, rapid turns) will feel spammy in mail. The action/response loop shapes charter design, policy timeouts, and operator runbooks.

---

## 4. Anti-Smear Language

These phrases collapse the messaging/mail boundary and must be avoided:

| Avoid | Why | Prefer |
|-------|-----|--------|
| "Messaging is just mail without subjects" | Ignores event-stream shape, absent draft, different reconciliation, faster loop | "Messaging is a parallel family with distinct semantics" |
| "We can reuse `mail.send_reply` for Telegram" | Chat has no `to`/`cc`/`subject`; reply threading uses `reply_to_message_id` | "Telegram uses `messaging.send_reply` with `chat_id` and `reply_to_message_id`" |
| "Chat messages should normalize to `NormalizedMessage`" | Chat messages are not RFC 5322; they lack `subject`, `internet_message_id`, MIME | "Chat messages normalize to `NormalizedChatUpdate`" |
| "Let's add `subject` to `NormalizedChatUpdate` for convenience" | Subjects do not exist in chat; this is mail smear | "Chat messages have no subject; thread context is carried by `chat_id` and `reply_to_message_id`" |
| "We can reuse `MessageFinder` for chat" | `MessageFinder` assumes `mailbox_id` and `internet_message_id` | "Chat uses `ChatMessageFinder` with `chat_id`, `message_id`, and `sender_id`" |
| "Chat outbound should have a draft stage" | Chat platforms have no native draft | "Chat outbound uses governance-only approval; no provider draft exists" |
| "Mail and messaging are the same vertical" | They are parallel families with incompatible shapes | "Mail and messaging are distinct connectivity families" |
| "Let's thread chat messages by `conversation_id`" | Chat threads by `reply_to_message_id`, not by container ID | "Chat threads by `reply_to_message_id`; `chat_id` is the container, not the thread" |
| "Messaging reconciliation is the same as mail" | Mail expects delta lag; messaging is often synchronous | "Messaging reconciliation may be synchronous, but the state machine still supports async confirmation" |
| "A charter that handles mail can handle messaging" | Action/response loops are incompatible without redesign | "Charters must be designed for one family or explicitly adapted" |

---

## 5. Adjacent Systems: Slack and SMS

Slack and SMS sit between messaging and mail but belong to **neither** family natively.

| System | Why Not Messaging | Why Not Mail | Correct Treatment |
|--------|------------------|--------------|-------------------|
| **Slack** | Channels are not `chat_id` containers; threading uses `thread_ts`, not `reply_to_message_id` | No RFC 5322 shape, no mailbox | Future `slack` source family or `webhook` + tool surface |
| **SMS / Twilio** | No chat container; no reply threading by provider | No RFC 5322 shape, no mailbox | Future `sms` source family |

**Rule:** If a system satisfies 3–4 messaging criteria but fails 1–2, it is an **adjacent family**, not an honorary messaging provider.

---

## 6. Cross-Family Adapters (Explicit Only)

Converting between mail and messaging is allowed but must be **explicit**:

| Direction | Mechanism | Example |
|-----------|-----------|---------|
| Mail → Messaging | Charter reads `mail.message.discovered` fact, emits `messaging.send_message` intent | "Forward urgent mail to Telegram ops channel" |
| Messaging → Mail | Charter reads `messaging.message.received` fact, emits `mail.send_new_message` intent | "Email a transcript of this chat session" |
| Mail notification | Adjacent system sends RFC 5322 email; mail vertical handles it normally | "GitHub notification email arrives in inbox" |

**Anti-pattern:** Implicitly treating all `messaging.message.received` facts as `mail.message.discovered` facts, or vice versa. The kernel must never conflate the two families at the Source or Fact layer.

---

## 7. Invariants

1. **Mail facts carry RFC 5322 shape; messaging facts do not.** A `mail.*` fact must normalize to `NormalizedMessage`. A `messaging.*` fact must normalize to `NormalizedChatUpdate`. Neither may borrow the other's shape.
2. **Intent families are source-family names.** `mail.send_reply` and `messaging.send_reply` are distinct intent types. They may not share an implementation unless explicitly adapted.
3. **Draft boundary is mail-only.** The `draft_creating` → `draft_ready` → `approved_for_send` state transitions exist only in mail outbound. Messaging outbound uses `pending → sending → submitted → confirmed`.
4. **Reconciliation interfaces are family-local.** `MessageFinder` is for mail. `ChatMessageFinder` is for messaging. They may not be conflated.
5. **Action/response loop is charter-design input.** Charters must declare which connectivity family they are designed for. A charter designed for mail must not be silently bound to a messaging source.
6. **Cross-family conversion is explicit intent, not implicit normalization.** The kernel does not automatically convert `NormalizedMessage` to `NormalizedChatUpdate` or vice versa.

---

## 8. Verification Evidence

- Decision artifact exists at `.ai/decisions/20260423-543-messaging-vs-mail-boundary.md`.
- Membership rules (§2.1–2.4) are explicit and testable against any proposed provider.
- Four hard distinctions (§3.1–3.4) are documented with per-dimension comparison tables.
- Anti-smear language (§4) records 10 forbidden phrases with preferred replacements.
- Adjacent systems (§5) document Slack and SMS as neither messaging nor mail.
- Cross-family adapter rules (§6) require explicit intent conversion.
- Invariants (§7) are enforceable at fact type, intent type, and reconciliation interface levels.
- **No code changes were made; this is a documentation and contract task.**
- `pnpm verify` — all 5 steps pass.
- `pnpm typecheck` — all packages pass.

---

## Closure Statement

Messaging and mail are parallel connectivity families with incompatible normalized shapes, intent types, draft boundaries, reconciliation semantics, and action/response loops. Messaging is not "mail without subjects." Mail is not "messaging with headers." The kernel must never conflate the two families at the Source, Fact, Intent, or reconciliation layers. Cross-family interaction is allowed only through explicit charter intent conversion. The anti-smear language and invariants prevent future boundary collapse.

---

**Closed by:** codex  
**Closed at:** 2026-04-23
