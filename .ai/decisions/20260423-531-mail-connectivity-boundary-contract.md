# Decision 531 — Mail Connectivity Boundary Contract

**Date:** 2026-04-23  
**Task:** 531  
**Depends on:** 394 (Email Marketing Operation Closure)  
**Chapter:** Mail Connectivity Generalization And Provider Boundary (531–535)  
**Verdict:** **Contract accepted. The mail vertical is a provider-family, not a provider-lock.**

---

## 1. Problem Statement

Narada's first mail connectivity path is Microsoft Graph / Exchange. This is a strong initial vertical, but the codebase currently contains implicit assumptions that Graph/Exchange is the only possible mail provider:

- `mailbox_id` and `conversation_id` leak into generic types and observability queries
- Auth is hard-wired to Microsoft OAuth2 (`login.microsoftonline.com`)
- Delta sync uses Graph-specific `@odata.deltaLink` pagination
- Draft/send/reconcile implementations call Graph endpoints directly
- The `source_extensions.graph` namespace is the only provider extension slot

Without an explicit boundary contract, adding Gmail / Google Workspace or generic IMAP/SMTP providers would require either:
1. Smearing Graph-specific assumptions across new provider code, or
2. Rewriting large parts of the mail vertical from scratch.

This contract defines the **canonical provider-agnostic mail-connectivity boundary** and identifies the **minimum stable seam** needed to host multiple providers without either outcome.

---

## 2. Core Thesis

> **The mail vertical is a provider-family bounded by intent type and normalized shape, not by any one provider's API.**

Microsoft Graph, Gmail, and IMAP/SMTP are all **provider-specific implementations** behind the same canonical boundary. The boundary consists of:

1. **Ingress:** `Source` interface → `NormalizedMessage` → `Fact`
2. **Egress:** `Intent` → `OutboundCommand` → provider-specific executor
3. **Identity:** `message_id`, `conversation_id`, `internet_message_id` as stable cross-provider identifiers
4. **Reconciliation:** `MessageFinder` interface binding submitted effects to observed state

What is **inside** the boundary (provider-agnostic) and what is **outside** (provider-specific) is explicit below.

---

## 3. The Boundary: Provider-Agnostic vs. Provider-Specific

### 3.1 Ingress Path (Source → Fact)

| Layer | Provider-Agnostic | Provider-Specific (Graph/Exchange) | Provider-Specific (Gmail) | Provider-Specific (IMAP/SMTP) |
|-------|-------------------|-----------------------------------|---------------------------|-------------------------------|
| **Source contract** | `Source.pull(checkpoint) → SourceBatch` | `ExchangeSource` | `GmailSource` (future) | `ImapSource` (future) |
| **Checkpoint** | Opaque string | `@odata.deltaLink` | `historyId` | `UIDVALIDITY + last UID` |
| **Record payload** | `unknown` (opaque to kernel) | `NormalizedEvent` with `source_extensions.graph` | `NormalizedEvent` with `source_extensions.gmail` | `NormalizedEvent` with `source_extensions.imap` |
| **Fact type** | `mail.message.discovered` | Same | Same | Same |
| **Fact payload** | Opaque JSON | `NormalizedPayload` | `NormalizedPayload` | `NormalizedPayload` |
| **Auth** | Token provider interface | `ClientCredentialsTokenProvider` (Microsoft OAuth2) | OAuth2 / service account (Google) | Password / OAuth / TLS cert |

**Key invariant:** The kernel never sees provider-specific checkpoint structure. The `Source` implementation owns checkpoint semantics entirely.

### 3.2 Normalized Message Shape

**Provider-agnostic fields** (all providers must produce or accept these):

| Field | Semantics | Graph | Gmail | IMAP |
|-------|-----------|-------|-------|------|
| `message_id` | Provider-local stable ID | `id` | `id` | `UID` |
| `conversation_id` | Thread / conversation grouping | `conversationId` | `threadId` | `References` / `In-Reply-To` hash |
| `internet_message_id` | Global RFC 2822 `Message-Id` | `internetMessageId` | `payload.headers['Message-Id']` | `Message-Id` header |
| `subject` | Subject line | ✓ | ✓ | ✓ |
| `from` / `to` / `cc` / `bcc` | RFC 5322 addresses | ✓ | ✓ | ✓ |
| `received_at` | Delivery timestamp | `receivedDateTime` | `internalDate` | `INTERNALDATE` |
| `body` | `text` / `html` / `empty` | `body.content` | `payload.parts` | `BODY[TEXT]` |
| `attachments` | `attachment_key`, `display_name`, `content_type`, `size_bytes`, `inline`, `content_hash` | `attachments` | `payload.parts` | `BODYSTRUCTURE` |
| `flags` | `is_read`, `is_draft`, `is_flagged`, `has_attachments` | `isRead` / `isDraft` / `flag` | `labelIds` | `FLAGS` |
| `folder_refs` | Container references | `parentFolderId` | `labelIds` | `Mailbox name` |
| `reply_to` | Reply-to addresses | `replyTo` | `payload.headers['Reply-To']` | `Reply-To` header |

**Provider-specific extension slot:**

```typescript
source_extensions?: {
  namespaces: {
    graph?: { change_key, parent_folder_id, web_link, ... };
    gmail?: { history_id, label_ids, ... };
    imap?: { uidvalidity, modseq, ... };
  };
};
```

**Key invariant:** The kernel compiles only provider-agnostic fields into canonical state. Provider extensions are advisory and may be stripped without losing authority.

### 3.3 Egress Path (Intent → Execution → Confirmation)

| Layer | Provider-Agnostic | Provider-Specific (Graph) | Provider-Specific (Gmail) | Provider-Specific (SMTP) |
|-------|-------------------|--------------------------|---------------------------|--------------------------|
| **Intent family** | `mail.send_reply`, `mail.send_new_message`, `mail.mark_read`, `mail.move_message`, `mail.set_categories`, `mail.draft_reply` | Same | Same | `mail.send_reply` / `mail.send_new_message` only |
| **Intent payload** | `to`, `cc`, `bcc`, `subject`, `body_text`, `body_html`, `reply_to_message_id`, `target_message_id`, `message_ids`, `destination_folder_id`, `categories` | Same | Same | Subset (no `mark_read`, `move_message`, `set_categories`) |
| **Outbound state machine** | `pending → draft_creating → draft_ready → approved_for_send → sending → submitted → confirmed` | Same | Same | `pending → sending → submitted → confirmed` (no draft stage) |
| **Outbound store** | `SqliteOutboundStore`, `OutboundCommand`, `OutboundVersion` | Same | Same | Same |
| **Draft client** | `DraftClient` interface | `GraphDraftClient` | `GmailDraftClient` (future) | N/A |
| **Send execution** | `SendExecutionWorker` | `DefaultGraphDraftClient.sendDraft()` | `GmailSendClient` (future) | `SmtpSendClient` (future) |
| **Non-send actions** | `mark_read`, `move_message`, `set_categories` intents | `NonSendGraphClient` | `GmailModifyClient` (future) | N/A |
| **Reconciliation** | `MessageFinder` interface | Graph-based implementation | Gmail-based implementation (future) | IMAP-based implementation (future) |

**Key invariant:** The `OutboundCommand` state machine and `SqliteOutboundStore` are provider-agnostic. Provider-specific code lives in draft clients, send executors, and `MessageFinder` implementations.

### 3.4 Identity and Reconciliation

**Canonical identifiers (cross-provider stable):**

| Identifier | Role | Graph Source | Gmail Source | IMAP Source |
|------------|------|--------------|--------------|-------------|
| `message_id` | Provider-local primary key | Graph `id` | Gmail `id` | IMAP `UID` + `UIDVALIDITY` |
| `conversation_id` | Thread grouping | Graph `conversationId` | Gmail `threadId` | Derived from `References` / `In-Reply-To` |
| `internet_message_id` | Global RFC 2822 identifier | `internetMessageId` | `Message-Id` header | `Message-Id` header |
| `idempotency_key` | Narada-generated effect dedup | UUID in `internetMessageHeaders` | Same | Same |

**Reconciliation contract (`MessageFinder`):**

```typescript
interface MessageFinder {
  findByOutboundId(mailboxId: string, outboundId: string): Promise<FoundMessage | undefined>;
  findByMessageId(mailboxId: string, messageId: string): Promise<FoundMessage | undefined>;
  findByInternetMessageId(mailboxId: string, internetMessageId: string): Promise<FoundMessage | undefined>;
}
```

All three lookup methods must be implementable by every provider. The primary key (`message_id`) is provider-local; `internet_message_id` is the cross-provider fallback.

---

## 4. What the Kernel Must Never Assume

These are **hard anti-assumptions**. Any code that violates them is a boundary breach.

### 4.1 Anti-Assumptions About Source Semantics

| # | Anti-Assumption | Why |
|---|----------------|-----|
| 1 | **The kernel must not assume delta pagination is cursor-based.** | Gmail uses `historyId`; IMAP uses UID ranges. The checkpoint is opaque. |
| 2 | **The kernel must not assume all messages have a `conversation_id`.** | IMAP threads are derived heuristically; some messages may be orphaned. |
| 3 | **The kernel must not assume folder semantics.** | Gmail uses labels (multi-assign); IMAP uses mailboxes (single-assign). `folder_refs` is an array of opaque refs. |
| 4 | **The kernel must not assume read/unread is a binary flag.** | Gmail `labelIds` includes `UNREAD`; Graph has `isRead`; IMAP has `\Seen`. The provider maps to `flags.is_read`. |
| 5 | **The kernel must not assume attachments are separate objects.** | Gmail inline attachments are MIME parts; Graph has `attachments` array. The provider normalizes to `attachments[]`. |

### 4.2 Anti-Assumptions About Egress Semantics

| # | Anti-Assumption | Why |
|---|----------------|-----|
| 6 | **The kernel must not assume drafts exist as a provider concept.** | SMTP has no draft stage. `mail.draft_reply` intent may be unsupported for some providers. |
| 7 | **The kernel must not assume sent messages are automatically visible in the inbox.** | Gmail `sent` label is automatic; IMAP requires separate `Sent` mailbox append. |
| 8 | **The kernel must not assume `mark_read`, `move_message`, or `set_categories` are universally supported.** | SMTP is send-only. These intents may be rejected at provider binding time. |
| 9 | **The kernel must not assume reconciliation is immediate.** | Graph webhook / delta may lag; IMAP polling may lag. The confirmation window exists for this reason. |
| 10 | **The kernel must not assume `mailbox_id` is a stable identifier.** | It is a legacy alias for `scope_id`. New providers must use `scope_id`. |

### 4.3 Anti-Assumptions About Auth

| # | Anti-Assumption | Why |
|---|----------------|-----|
| 11 | **The kernel must not assume OAuth2.** | IMAP may use password or TLS client cert. The auth interface is `TokenProvider`-shaped but the token format is opaque. |
| 12 | **The kernel must not assume a single tenant / domain model.** | Gmail Workspace has domains but no tenant ID. IMAP has no tenant concept. |
| 13 | **The kernel must not assume refresh tokens are long-lived.** | Gmail service accounts use rotating keys; some IMAP setups use short-lived SASL tokens. |

---

## 5. Minimum Stable Seam for Multiple Providers

To host a new mail provider without rewriting the vertical, the following seam must be implemented:

### 5.1 Required Implementations

| # | Component | Interface | Effort |
|---|-----------|-----------|--------|
| 1 | **Source adapter** | `Source` | Medium — map provider delta API to `SourceBatch` |
| 2 | **Auth provider** | `TokenProvider` | Low — wrap provider auth flow |
| 3 | **Normalizer** | `NormalizedEvent[]` from provider payload | Medium — map provider fields to `NormalizedMessage` |
| 4 | **Draft client** | `DraftClient` (if provider supports drafts) | Medium — create/get/send drafts |
| 5 | **Send executor** | `SendExecutionWorker` delegation | Low — call provider send API |
| 6 | **Non-send executor** | `NonSendWorker` delegation (if supported) | Low — patch/move/categorize |
| 7 | **Message finder** | `MessageFinder` | Medium — lookup by outbound ID, message ID, internet message ID |

### 5.2 Optional / Degradable Capabilities

| Capability | Graph | Gmail | IMAP/SMTP |
|------------|-------|-------|-----------|
| Draft lifecycle | Full | Full | None (skip draft stage) |
| `mark_read` | ✓ | ✓ (labels) | ✓ (`STORE FLAGS`) |
| `move_message` | ✓ | ✓ (labels) | ✓ (`MOVE` or copy+delete) |
| `set_categories` | ✓ | ✓ (labels) | ✗ (no labels) |
| Rich reconciliation | ✓ (delta + headers) | ✓ (history API) | ✗ (polling only) |
| Attachment streaming | ✓ | ✓ | Limited |

**Degradation rule:** If a provider does not support a capability, the intent is rejected at provider-binding time with a clear `unsupported_action` error, not silently dropped or emulated.

---

## 6. Provider Binding Contract

When a new provider is bound to an operation, the following must be explicit:

1. **Provider identifier** in config: `graph`, `gmail`, `imap`, etc.
2. **Capability manifest:** which intent types and action types are supported
3. **Auth configuration:** provider-specific credentials, endpoints, token refresh behavior
4. **Normalizer registration:** which `source_extensions` namespace is populated
5. **Message finder registration:** which `MessageFinder` implementation is used
6. **Degradation policy:** how unsupported intents are handled (reject, queue, or fallback)

---

## 7. Adjacent Source Family Boundary (Preview of Task 534)

Mail connectivity is **not** a catch-all for any system that sends notifications. The following are **adjacent source families**, not mail providers:

| System | Why Not Mail | Correct Family |
|--------|-------------|----------------|
| **GitHub** | Issues/PRs are not RFC 5322 messages | `webhook` or `api` source family |
| **Slack** | Messages are chat, not email | `webhook` or `chat` source family |
| **Klaviyo** | Campaigns are marketing automation, not mailbox sync | `api` source family with `campaign_brief` intent |
| **SMS / Twilio** | Short messages, not MIME | `sms` source family |

**Smear detection:** If a new "provider" requires:
- Non-RFC-5322 message shapes
- Non-mailbox identity models
- Non-thread conversation semantics

…it is **not a mail provider** and must not be squeezed into the mail boundary.

---

## 8. Invariants

1. **The kernel sees only opaque source records.** Provider-specific structure lives inside `payload` and `source_extensions`.
2. **Normalized message shape is the canonical compiler input.** All providers normalize to the same `NormalizedMessage` fields.
3. **Intent types are provider-family names, not provider names.** `mail.send_reply` works for Graph, Gmail, and SMTP.
4. **The outbound state machine is provider-agnostic.** Provider-specific behavior lives in draft/send/reconcile executors.
5. **Reconciliation is abstraction-based, not provider-specific.** `MessageFinder` defines the contract; each provider implements it.
6. **Provider extensions are advisory.** Removing all `source_extensions` from the system leaves all durable boundaries intact.

---

## 9. Verification Evidence

- `pnpm verify` — all 5 steps pass
- `pnpm typecheck` — all packages pass
- The existing `ExchangeSource` implements the `Source` interface with opaque payload
- `NormalizedMessage` fields are provider-agnostic except for `source_extensions.graph`
- `OutboundCommand` state machine contains no Graph-specific references
- `MessageFinder` interface is abstraction-based
- `INTENT_FAMILIES` registry uses `mail.*` family names, not `graph.*`

---

## Closure Statement

The mail connectivity boundary is defined: the kernel treats mail as a provider-family bounded by intent type (`mail.*`) and normalized shape (`NormalizedMessage`). Microsoft Graph is one implementation behind this boundary. Gmail and IMAP/SMTP can be added by implementing the seven components in §5.1. The kernel must never assume Graph-specific pagination, auth, folder, draft, or reconciliation semantics. Adjacent systems (GitHub, Slack, SMS) are not mail providers and must not be smeared into the mail boundary.

---

**Closed by:** a2  
**Closed at:** 2026-04-23
