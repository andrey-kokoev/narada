# Decision 533 — Generic Mail Provider Contract

**Date:** 2026-04-23
**Task:** 533
**Depends on:** 531 (Mail Connectivity Boundary Contract)
**Chapter:** Mail Connectivity Generalization And Provider Boundary (531–535)
**Verdict:** **Contract accepted. IMAP/SMTP is a bounded-degradation provider, not a parity provider.**

---

## 1. Problem Statement

Task 531 defined the canonical mail-connectivity boundary and identified three provider classes behind it: Microsoft Graph, Gmail/Google Workspace, and generic IMAP/SMTP. This contract focuses on the third class — the generic provider — because it is the weakest and most constraining case. If Narada can articulate a bounded path for IMAP/SMTP, the Graph and Gmail paths are strictly easier.

Generic providers (IMAP for read, SMTP for send) differ from first-class API ecosystems in fundamental ways:
- No native delta API; sync is polling-based
- No draft concept in SMTP; send is fire-and-forget
- Thread identity is heuristic, not provider-native
- Auth is password-based or certificate-based, not OAuth2-centric
- Confirmation/reconciliation is polling-only, with no webhook or push notification path

Without an explicit contract, a generic provider path would either:
1. Be silently rejected as "too weak to bother with," or
2. Be naively implemented in a way that smears first-class assumptions (drafts, webhooks, delta tokens) onto a system that cannot support them.

This contract defines the **bounded generic provider path**: what works, what degrades, and where the floor is.

---

## 2. Core Thesis

> **IMAP/SMTP is a bounded-degradation mail provider. It supports the core mail vertical (send, receive, basic mark-read/move) but lacks the richness that makes draft-first delivery, rich reconciliation, and real-time sync efficient.**

The generic provider contract is not a promise of parity. It is a promise of **honest bounded support**: the provider advertises what it can do, the kernel does not ask for what it cannot, and the operator understands the operational consequences.

---

## 3. The Generic Provider Shape

### 3.1 Reference Stack

| Role | Protocol | Typical Implementation |
|------|----------|------------------------|
| Ingress (read / sync) | IMAP4rev1 | `ImapSource` polling via `UID SEARCH UNSEEN` |
| Egress (send) | SMTP / SUBMIT | `SmtpSendClient` direct send |
| Auth | SASL (PLAIN, LOGIN, CRAM-MD5, XOAUTH2) or TLS client cert | `ImapTokenProvider` / `SmtpTokenProvider` |
| Threading | Heuristic | `References` + `In-Reply-To` header parse |
| Reconciliation | Polling | `ImapMessageFinder` via `UID SEARCH HEADER` |

### 3.2 Ingress (Source → Fact)

| Aspect | First-Class API (Graph/Gmail) | Generic Provider (IMAP) |
|--------|------------------------------|------------------------|
| **Delta model** | Native delta API (`@odata.deltaLink`, `historyId`) | None. Polling via `UID SEARCH SINCE <date>` or `STATUS UNSEEN` |
| **Checkpoint** | Opaque cursor | `UIDVALIDITY` + highest seen `UID` + last poll timestamp |
| **Record ordering** | Guaranteed by provider | Best-effort by `INTERNALDATE` or arrival order |
| **Change types** | Create, update, delete flags | Create (new message), pseudo-update (flag change observed on re-poll) |
| **Deletion detection** | Native tombstones | Heuristic: message no longer returned in `UID SEARCH ALL` |

**Checkpoint semantics for IMAP:**

```typescript
interface ImapCheckpoint {
  uidvalidity: number;     // Mailbox UIDVALIDITY; reset on mailbox recreation
  maxUid: number;          // Highest UID seen in last poll
  lastPollAt: string;      // ISO timestamp for date-based fallback
  mailboxName: string;     // e.g., "INBOX"
}
```

If `UIDVALIDITY` changes, the checkpoint is invalid and a full resync is required. This is a bounded but real cost.

### 3.3 Normalized Message Shape

IMAP can produce all provider-agnostic fields defined in Decision 531 §3.2:

| Field | IMAP Source | Notes |
|-------|-------------|-------|
| `message_id` | `UID` + `UIDVALIDITY` | Scoped to mailbox; not globally stable |
| `conversation_id` | Derived from `References` / `In-Reply-To` | Heuristic; may be empty for orphaned messages |
| `internet_message_id` | `Message-Id` header | Globally stable; preferred for reconciliation |
| `subject` | `ENVELOPE.SUBJECT` | RFC 2047 decoded |
| `from` / `to` / `cc` / `bcc` | `ENVELOPE` addresses | RFC 2047 decoded |
| `received_at` | `INTERNALDATE` | Server arrival time, not header time |
| `body` | `BODY[TEXT]` / `BODY[1]` | MIME parse required for multipart |
| `attachments` | `BODYSTRUCTURE` | Flatten MIME parts with `Content-Disposition: attachment` |
| `flags` | `FLAGS` response | `\Seen` → `is_read`, `\Flagged` → `is_flagged`, `\Draft` → `is_draft` |
| `folder_refs` | Mailbox name | Single-assign; IMAP does not natively support labels |
| `reply_to` | `Reply-To` header or `ENVELOPE.REPLY-TO` | |

**Key limitation:** IMAP `UID` is mailbox-scoped. Moving a message between mailboxes changes its `UID`. `internet_message_id` is the cross-mailbox stable identifier.

### 3.4 Egress (Intent → Execution → Confirmation)

| Aspect | First-Class API | Generic Provider (SMTP) |
|--------|----------------|------------------------|
| **Draft stage** | Full draft lifecycle (create → edit → send) | **Absent.** SMTP has no draft concept |
| **Send path** | `draft_ready → approved_for_send → sending → submitted` | `pending → sending → submitted` |
| **Send confirmation** | Provider returns message ID | SMTP `250 OK` returns no message ID; `Message-Id` must be self-generated |
| **Non-send actions** | `mark_read`, `move_message`, `set_categories` | `mark_read` (`STORE +FLAGS \Seen`), `move_message` (`MOVE` RFC 6851 or copy+delete), `set_categories` **unsupported** |
| **Reconciliation** | Delta/webhook push | Polling only (`UID SEARCH HEADER Message-Id:<id>`) |

**SMTP send contract:**

Because SMTP does not return a provider message ID on successful send, Narada must:
1. Self-generate a `Message-Id` header before sending
2. Record that `Message-Id` as the `idempotency_key` / `internet_message_id`
3. Reconcile by polling IMAP for a message with that `Message-Id` header

This shifts reconciliation authority from the provider to the operator's own header generation.

### 3.5 Confirmation Semantics

| Aspect | First-Class API | Generic Provider |
|--------|----------------|------------------|
| **Confirmation trigger** | Delta/webhook / push notification | Timer-based IMAP poll |
| **Confirmation latency** | Seconds to minutes | Minutes to hours (poll interval dependent) |
| **Confirmation window** | Bounded by provider event delivery | Bounded by poll frequency + IMAP server caching |
| **Lost confirmation risk** | Low (provider persists events) | Higher (message may arrive during poll gap, server-side dedup may hide it) |
| **Duplicate send risk** | Low (provider-side idempotency) | Higher (no provider idempotency; relies on `Message-Id` + Narada dedup) |

**Operational consequence:** Generic provider operations should use longer confirmation timeouts and more conservative retry policies. The operator must accept that "submitted" means "SMTP accepted it," not "it is in the mailbox and reconciled."

---

## 4. Capability Degradation Matrix

| Capability | Graph | Gmail | Generic IMAP/SMTP |
|------------|-------|-------|-------------------|
| **Draft lifecycle** | Full | Full | **None** — direct send only |
| **`mail.send_reply`** | ✓ | ✓ | ✓ (self-generate `In-Reply-To`, `References`) |
| **`mail.send_new_message`** | ✓ | ✓ | ✓ |
| **`mail.mark_read`** | ✓ | ✓ (labels) | ✓ (`STORE +FLAGS \Seen`) |
| **`mail.move_message`** | ✓ | ✓ (labels) | ✓ (`MOVE` or copy+delete) |
| **`mail.set_categories`** | ✓ | ✓ (labels) | **✗** — no label concept |
| **`mail.draft_reply`** | ✓ | ✓ | **✗** — no drafts |
| **Rich reconciliation** | ✓ (delta + headers) | ✓ (history API) | **Degraded** — polling only |
| **Real-time sync** | ✓ (webhook/delta) | ✓ (push notifications) | **✗** — poll-based |
| **Attachment streaming** | ✓ | ✓ | Limited (fetch via `BODY[n]`) |
| **Thread identity** | Provider-native | Provider-native | Heuristic |
| **Deletion detection** | Native tombstones | Native (trash/label change) | Heuristic (disappearance from search) |
| **Multi-folder / labels** | Folders | Labels | Mailboxes only |

---

## 5. Bounded Parity Limits

This section records where the generic provider path becomes **too weak for parity** and what that means operationally.

### 5.1 Hard Floor: What a Generic Provider Cannot Do

| Limitation | Why | Operational Meaning |
|------------|-----|---------------------|
| **No draft stage** | SMTP is fire-and-forget | Agents cannot review or edit before send. "Draft-first delivery" (Invariant 32) becomes "self-generated Message-Id first delivery." The spirit is preserved but the mechanism is different. |
| **No native delta** | IMAP has no change-feed API | Sync is polling-based. Higher latency, higher server load, risk of poll-gap misses. |
| **No webhook / push** | IMAP is pull-only | Confirmation is entirely timer-driven. Operator must accept longer uncertainty windows. |
| **No provider-side idempotency** | SMTP `250 OK` is just an ACK | Duplicate send protection relies entirely on Narada's `idempotency_key` + `Message-Id` header. |
| **No labels / categories** | IMAP mailboxes are single-assign | `set_categories` intent is unsupported. Categorization must happen outside the mail boundary (e.g., in Narada's own policy layer). |
| **Threading is heuristic** | No native thread ID | Conversation grouping may break for malformed `References` headers or missing `In-Reply-To`. |

### 5.2 Soft Floor: What Degrades Operator Experience

| Degradation | Acceptable? | Mitigation |
|-------------|-------------|------------|
| Minutes-to-hours sync latency | Yes, for non-urgent mail | Shorter poll intervals (with backoff), or accept latency |
| Higher bandwidth usage (full headers fetched) | Yes | `FETCH` only required headers + `BODY.PEEK` |
| UID invalidation on mailbox move | Yes | Reconcile via `internet_message_id` instead of `message_id` |
| No rich attachment metadata | Partially | Parse `BODYSTRUCTURE` as deeply as possible |

### 5.3 Where Generic Becomes Too Weak for the Vertical

A generic provider path is **operationally unacceptable** when:

1. **The operation requires draft review before send.** If charter policy demands human or agent review of outbound messages before submission, SMTP's lack of drafts means the review must happen entirely in Narada's own layer (pre-composition policy), not in the provider's draft store.

2. **The operation requires sub-minute sync latency.** IMAP polling cannot guarantee this. If the use case is real-time triage or alerting, a generic provider is the wrong tool.

3. **The operation requires deletion detection with audit certainty.** IMAP heuristic deletion detection ("message disappeared from search") is inherently ambiguous — the message may have been moved, not deleted. If audit trails require certainty, IMAP is insufficient.

4. **The operation requires multi-folder labels.** If the workflow depends on a message appearing in multiple collections simultaneously (Gmail-style labels), IMAP mailboxes cannot support it.

**Verdict:** The generic provider path is valid for **basic mailbox sync and send** operations. It is not valid for **real-time, draft-heavy, or label-centric** workflows. The operator must select the provider class appropriate to the operation's requirements.

---

## 6. Credential Posture

| Aspect | First-Class API (Graph/Gmail) | Generic Provider (IMAP/SMTP) |
|--------|------------------------------|------------------------------|
| **Primary auth** | OAuth2 (client credentials / service account) | Password (SASL PLAIN/LOGIN) or TLS client certificate |
| **Token refresh** | Automated via refresh token / service account rotation | Manual password rotation or no rotation |
| **Session model** | Short-lived access tokens | Long-lived TCP connections or per-command login |
| **2FA / MFA** | Supported via OAuth2 flows | Application-specific passwords or certificate-bound |
| **Credential storage** | Client secret + refresh token | Plain password or PKCS#12 cert bundle |

**Security considerations:**
- Password-based IMAP auth requires the operator to store credentials in Narada's secure storage. This is acceptable but requires explicit operator acknowledgment.
- TLS client certificates are preferred over passwords where the IMAP server supports them.
- SASL XOAUTH2 (Gmail-specific OAuth2-over-IMAP) is a hybrid: it uses OAuth2 tokens but over IMAP wire. It is supported by this contract as an auth variant, not a separate provider class.
- Connection pooling and IDLE (RFC 2177) are optimizations, not requirements. A minimal implementation may open/close connections per poll cycle.

---

## 7. What Narada Needs for a Bounded Generic Provider Path

### 7.1 Read Model

```typescript
interface ImapReadModel {
  pollIntervalMs: number;           // e.g., 60000
  mailboxName: string;              // e.g., "INBOX"
  fetchBatchSize: number;           // e.g., 100 UIDs per fetch
  uidvalidity: number;              // current mailbox UIDVALIDITY
  maxUid: number;                   // highest UID from last poll
  lastPollAt: string;               // ISO timestamp
}
```

The read model is polling-state, not delta-state. It must handle `UIDVALIDITY` changes gracefully (reset and resync).

### 7.2 Send / Draft Boundary

No draft boundary exists. The send model is:

```typescript
interface SmtpSendModel {
  messageId: string;                // Self-generated RFC 2822 Message-Id
  idempotencyKey: string;           // Same as messageId or derived from it
  envelope: SmtpEnvelope;           // { from, to[], cc[], bcc[] }
  content: MimeMessage;             // Self-assembled MIME message
}
```

The outbound state machine skips `draft_creating`, `draft_ready`, and `approved_for_send`. It goes directly from `pending` to `sending`.

### 7.3 Confirmation Semantics

```typescript
interface ImapConfirmationModel {
  pollIntervalMs: number;           // How often to poll for reconciliation
  confirmationTimeoutMs: number;    // e.g., 300000 (5 minutes) or longer
  confirmationStrategy: 'poll_uid_search_header' | 'poll_since_internaldate';
  selfGeneratedMessageId: string;   // The Message-Id we sent with
}
```

Confirmation succeeds when `UID SEARCH HEADER Message-Id:<selfGeneratedMessageId>` returns a UID. Failure modes:
- Timeout: message not found within `confirmationTimeoutMs` → mark for operator review
- Duplicate: two messages with same `Message-Id` found → ambiguity, mark for review
- Server lag: message found after timeout → caught by next poll cycle, retroactively confirm

### 7.4 Credential Posture

```typescript
interface ImapCredentialConfig {
  host: string;                     // IMAP server hostname
  port: number;                     // 993 for TLS, 143 for STARTTLS
  tls: boolean;                     // true for IMAPS
  auth: 
    | { method: 'password'; username: string; password: string }
    | { method: 'xoauth2'; username: string; accessToken: string }
    | { method: 'client_cert'; certPath: string; keyPath: string };
}
```

---

## 8. Provider Binding Contract (Generic)

When a generic provider is bound to an operation, the following must be explicit:

1. **Provider identifier:** `imap+smtp` (or `imap` for read-only operations)
2. **Capability manifest:**
   - Supported intents: `mail.send_reply`, `mail.send_new_message`, `mail.mark_read`, `mail.move_message`
   - Unsupported intents: `mail.draft_reply`, `mail.set_categories`
   - Degraded capabilities: reconciliation is polling-only, no draft stage
3. **Auth configuration:** `host`, `port`, `tls`, `auth.method`, credentials
4. **Normalizer registration:** `source_extensions.imap` with `uidvalidity`, `modseq`, `mailbox`
5. **Message finder registration:** `ImapMessageFinder` (UID SEARCH based)
6. **Degradation policy:** Unsupported intents are rejected at binding time with `unsupported_action: draft_reply, set_categories`
7. **Poll configuration:** `pollIntervalMs`, `confirmationTimeoutMs`, `fetchBatchSize`

---

## 9. Invariants (Generic Provider Specific)

1. **The generic provider never claims draft support.** If `mail.draft_reply` is requested, it is rejected at provider binding, not silently converted to direct send.
2. **SMTP send always self-generates `Message-Id`.** The generated ID is the reconciliation key. No send is reconcilable without it.
3. **IMAP polling handles `UIDVALIDITY` changes.** A changed `UIDVALIDITY` triggers a bounded full resync, not undefined behavior.
4. **Confirmation timeout is explicit and operator-visible.** Generic provider operations do not pretend to confirm in real time.
5. **Deletion detection is heuristic and labeled as such.** The kernel must not treat IMAP disappearance as authoritative deletion without additional evidence.

---

## 10. Verification Evidence

- `pnpm verify` — all 5 steps pass
- `pnpm typecheck` — all packages pass
- Decision 531 boundary contract explicitly names IMAP/SMTP in capability degradation matrix
- `NormalizedMessage` fields required by IMAP are all in the provider-agnostic set (Decision 531 §3.2)
- `OutboundCommand` state machine can skip draft stages; `pending → sending → submitted → confirmed` is a valid subgraph
- `MessageFinder` interface is implementable via `UID SEARCH HEADER Message-Id:<id>`
- No code changes required for this contract task

---

## Closure Statement

The generic mail provider contract is defined: IMAP/SMTP is a bounded-degradation provider that supports core mail vertical operations (send, receive, mark-read, move) but lacks draft lifecycle, real-time sync, labels/categories, and provider-side idempotency. Narada can host generic providers by implementing the seven components from Decision 531 §5.1 with the specific shapes in §7 of this contract. The operator must accept longer confirmation windows, heuristic threading, and the absence of draft review. Where these limits are unacceptable, a first-class API provider (Graph, Gmail) is required.

---

**Closed by:** codex
**Closed at:** 2026-04-23
