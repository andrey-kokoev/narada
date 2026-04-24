# Decision 532 — Gmail / Google Workspace Provider Contract

**Date:** 2026-04-23  
**Task:** 532  
**Depends on:** 531 (Mail Connectivity Boundary Contract)  
**Chapter:** Mail Connectivity Generalization And Provider Boundary (531–535)  
**Verdict:** **Contract accepted. Gmail fits the canonical boundary with bounded deltas and one regulatory blocker.**

---

## 1. Goal

Specify how Gmail / Google Workspace fits the canonical mail-connectivity boundary from Task 531 and what would be required to support it without Microsoft-specific leakage.

---

## 2. Boundary Fit Summary

Gmail is a **strong fit** for the Task 531 boundary. All seven required components (§5.1 of Decision 531) are implementable. The deltas are bounded and well-understood. No kernel invariant needs to change.

| Component | Fit | Reuse / New Work |
|-----------|-----|------------------|
| Source adapter | Strong fit | New: `GmailSource` wrapping History API |
| Auth provider | Strong fit | New: Google OAuth2 / service account token provider |
| Normalizer | Strong fit | New: `GmailNormalizer` mapping `Message` / `Thread` to `NormalizedMessage` |
| Draft client | Strong fit | New: `GmailDraftClient` wrapping `drafts.create` / `drafts.send` |
| Send executor | Strong fit | New: `GmailSendExecutor` wrapping `messages.send` or `drafts.send` |
| Non-send executor | Strong fit | New: `GmailModifyClient` wrapping `labels` / `modify` endpoints |
| Message finder | Strong fit | New: `GmailMessageFinder` using `messages.list` with RFC822 query |

---

## 3. Provider-Specific Deltas

### 3.1 Auth Posture

| Aspect | Microsoft Graph | Gmail / Google Workspace | Delta |
|--------|----------------|--------------------------|-------|
| **Protocol** | OAuth2 client credentials (tenant-scoped) | OAuth2 authorization code + refresh token, or service account with domain-wide delegation | Different token acquisition flow |
| **Token lifetime** | ~60 minutes | ~60 minutes | Same |
| **Refresh** | Automatic via `ClientCredentialsTokenProvider` | Automatic via refresh token rotation | Same pattern, different endpoint (`oauth2.googleapis.com`) |
| **Scopes** | `Mail.Read`, `Mail.Send`, `Mail.ReadWrite` | `gmail.modify`, `gmail.send`, `gmail.readonly` | Different scope names |
| **Verification** | Azure AD app registration | **Google OAuth verification review** (2–8 weeks, CASA Tier 2/3, $15k–$75k) for consumer accounts | **Major blocker for consumer Gmail** |
| **Workspace bypass** | N/A | Service account + domain-wide delegation bypasses user consent for Workspace | **Viable path for Workspace** |

**Key finding:** Consumer Gmail is blocked by Google's OAuth verification review. Google Workspace is the viable near-term path via service-account domain-wide delegation.

### 3.2 Sync / Change Model

| Aspect | Microsoft Graph | Gmail / Google Workspace | Delta |
|--------|----------------|--------------------------|-------|
| **Delta mechanism** | `@odata.deltaLink` per folder | `history.list(startHistoryId)` per mailbox | Different pagination model |
| **Cursor structure** | URL string (deltaLink) | Numeric `historyId` | Opaque to kernel — no issue |
| **Cursor expiry** | None (stable until resource deleted) | ~7 days (returns HTTP 404, requires full sync) | **Bounded degradation: full sync fallback** |
| **Change types** | Created, updated, deleted messages | `messageAdded`, `messageDeleted`, `labelAdded`, `labelRemoved` | Richer label-change granularity |
| **Page size** | Configurable | Max 500 history records | Similar |
| **Polling vs push** | Polling (deltaLink) | Polling (history) + optional Pub/Sub push | Push available but requires domain-wide delegation for setup |

**Key finding:** Gmail's `historyId` expiry is a bounded degradation. The `Source` implementation handles this by falling back to full sync on 404, then resuming incremental sync from the new `historyId`.

### 3.3 Message / Thread Identity

| Aspect | Microsoft Graph | Gmail / Google Workspace | Delta |
|--------|----------------|--------------------------|-------|
| **Message ID** | `id` (can be immutable with `Prefer: IdType="ImmutableId"`) | `id` (immutable) | Gmail IDs are natively immutable |
| **Thread ID** | `conversationId` | `threadId` | Same concept, different name |
| **Global ID** | `internetMessageId` | `payload.headers['Message-Id']` | Same RFC 2822 concept, different access path |
| **Change tracking** | `changeKey` (advisory) | `historyId` (per-message, per-mailbox) | Different mechanism |
| **Delivery time** | `receivedDateTime` | `internalDate` (epoch ms) | Same semantics |

**Normalization mapping:**

```typescript
// Gmail Message → NormalizedMessage
{
  message_id: message.id,
  conversation_id: message.threadId,
  internet_message_id: headers['Message-Id'],
  subject: headers['Subject'],
  from: parseAddress(headers['From']),
  to: parseAddresses(headers['To']),
  cc: parseAddresses(headers['Cc']),
  bcc: parseAddresses(headers['Bcc']),
  reply_to: parseAddresses(headers['Reply-To']),
  received_at: new Date(Number(message.internalDate)).toISOString(),
  body: extractBody(message.payload), // MIME part traversal
  attachments: extractAttachments(message.payload),
  flags: {
    is_read: !message.labelIds.includes('UNREAD'),
    is_draft: message.labelIds.includes('DRAFT'),
    is_flagged: message.labelIds.includes('STARRED'),
    has_attachments: message.labelIds.includes('HAS_ATTACHMENT'),
  },
  folder_refs: message.labelIds, // labels are opaque refs
  source_extensions: {
    namespaces: {
      gmail: {
        history_id: message.historyId,
        label_ids: message.labelIds,
        size_estimate: message.sizeEstimate,
        snippet: message.snippet,
      },
    },
  },
}
```

### 3.4 Draft / Send Semantics

| Aspect | Microsoft Graph | Gmail / Google Workspace | Delta |
|--------|----------------|--------------------------|-------|
| **Draft creation** | `POST /users/{id}/messages` (with prefer header) | `POST /users/me/drafts` | Different endpoint |
| **Draft update** | `PATCH /users/{id}/messages/{id}` | `PUT /users/me/drafts/{id}` | Different verb |
| **Draft send** | `POST /users/{id}/messages/{id}/send` | `POST /users/me/drafts/send` | Different endpoint; Gmail requires draft ID in body |
| **Direct send** | `POST /users/{id}/sendMail` | `POST /users/me/messages/send` | Both supported |
| **Draft → sent ID stability** | Changes (new message ID) | Changes (new message ID) | Same behavior |
| **Attachment handling** | Inline via `attachments` array | Base64url in `raw` MIME or multipart | Different attachment model |

**Key finding:** Gmail's draft/send lifecycle is isomorphic to Graph's. The `OutboundCommand` state machine maps directly:
- `pending` → create draft (or direct send)
- `draft_creating` → `drafts.create` call
- `draft_ready` → draft created, awaiting approval
- `approved_for_send` → operator approved
- `sending` → `drafts.send` or `messages.send`
- `submitted` → sent, awaiting confirmation

### 3.5 Labels vs Folders

| Aspect | Microsoft Graph | Gmail / Google Workspace | Delta |
|--------|----------------|--------------------------|-------|
| **Organization** | Folders (single parent) | Labels (multi-assign tags) | **Semantic delta** |
| **Inbox** | `parentFolderId` = `Inbox` | `labelIds` includes `INBOX` | Same concept |
| **Sent** | `parentFolderId` = `SentItems` | `labelIds` includes `SENT` | Same concept |
| **Read state** | `isRead` boolean | `UNREAD` label absence | Maps to `flags.is_read` |
| **Move** | `PATCH parentFolderId` | `modify` (remove old label, add new label) | Different API shape |
| **Categories** | `categories` array | `CATEGORY_*` labels | Maps to `category_refs` |

**Key finding:** Gmail labels are a multi-assign tag system, not a folder hierarchy. This is a semantic delta, but it fits the `NormalizedMessage.folder_refs` array model naturally. The provider-specific `move_message` executor handles the label add/remove dance.

### 3.6 Confirmation / Reconciliation

| Aspect | Microsoft Graph | Gmail / Google Workspace | Delta |
|--------|----------------|--------------------------|-------|
| **Find by outbound ID** | Search `internetMessageHeaders` for `X-Outbound-Id` | Search `headers` for `X-Outbound-Id` | Same pattern |
| **Find by message ID** | `GET /users/{id}/messages/{id}` | `GET /users/me/messages/{id}` | Same pattern |
| **Find by internet message ID** | `?$filter=internetMessageId eq '...'` | `messages.list(q: "rfc822msgid:...")` | Different query syntax |
| **Confirmation lag** | Delta sync observes sent message | History API observes sent message | Same pattern |
| **Sent visibility** | Appears in SentItems automatically | Appears with `SENT` label automatically | Same pattern |

**MessageFinder implementation for Gmail:**

```typescript
class GmailMessageFinder implements MessageFinder {
  async findByOutboundId(mailboxId: string, outboundId: string): Promise<FoundMessage | undefined> {
    // Search by custom header injected at send time
    const result = await gmail.users.messages.list({
      userId: mailboxId,
      q: `rfc822msgid:${outboundId}`, // or custom header if supported
    });
    // ...map to FoundMessage
  }

  async findByMessageId(mailboxId: string, messageId: string): Promise<FoundMessage | undefined> {
    const message = await gmail.users.messages.get({ userId: mailboxId, id: messageId });
    // ...map to FoundMessage
  }

  async findByInternetMessageId(mailboxId: string, internetMessageId: string): Promise<FoundMessage | undefined> {
    const result = await gmail.users.messages.list({
      userId: mailboxId,
      q: `rfc822msgid:${internetMessageId}`,
    });
    // ...map to FoundMessage
  }
}
```

---

## 4. Straightforward Reuse vs New Adapter Work

### 4.1 Straightforward Reuse (No Changes Needed)

| Component | Why Reusable |
|-----------|-------------|
| **Kernel Source contract** | `Source.pull()` is opaque; `GmailSource` implements it |
| **Fact ingestion** | `mail.message.discovered` fact type is provider-agnostic |
| **Context formation** | `conversation_id` → `context_id` mapping works with `threadId` |
| **Outbound state machine** | `pending → draft_ready → submitted → confirmed` is provider-agnostic |
| **Outbound store** | `SqliteOutboundStore` has no provider references |
| **Intent registry** | `mail.send_reply`, `mail.mark_read`, etc. are family names, not provider names |
| **Operator action pipeline** | `executeOperatorAction()` is provider-agnostic |
| **Observation layer** | Read-only views over durable state; no provider assumptions |

### 4.2 New Adapter Work Required

| Component | Effort | Files |
|-----------|--------|-------|
| `GmailTokenProvider` | Low | `adapter/gmail/auth.ts` |
| `GmailHttpClient` | Low | `adapter/gmail/client.ts` |
| `GmailHistoryWalker` | Medium | `adapter/gmail/history.ts` |
| `GmailNormalizer` | Medium | `adapter/gmail/normalizer.ts` |
| `GmailSource` | Low | `adapter/gmail/gmail-source.ts` |
| `GmailDraftClient` | Medium | `adapter/gmail/draft-client.ts` |
| `GmailSendExecutor` | Low | `adapter/gmail/send-executor.ts` |
| `GmailModifyClient` | Low | `adapter/gmail/modify-client.ts` |
| `GmailMessageFinder` | Low | `adapter/gmail/message-finder.ts` |
| Config schema updates | Low | `config/types.ts`, `config/load.ts` |

**Estimated total:** 9 new files, ~1,500–2,000 lines, 2–3 weeks for an implementer familiar with the boundary.

---

## 5. Bounded Blockers and Risks

| # | Blocker / Risk | Severity | Mitigation |
|---|---------------|----------|------------|
| 1 | **Google OAuth verification review** for consumer Gmail accounts (2–8 weeks, $15k–$75k CASA assessment) | **High** | Target Google Workspace first via service-account domain-wide delegation; consumer Gmail deferred |
| 2 | **History ID expiry** (~7 days) causes full-sync fallback | Medium | `GmailSource` implements 404 → full sync → resume incremental; bounded by mailbox size |
| 3 | **Gmail API rate limits** (250 quota units/user/second for Workspace, lower for consumer) | Medium | Exponential backoff in `GmailHttpClient`; batch operations where possible |
| 4 | **Attachment model差异** (Graph inline vs Gmail `raw` MIME / multipart) | Medium | `GmailDraftClient` constructs multipart MIME for attachments; normalized shape unchanged |
| 5 | **Label add/remove race** during `move_message` (not atomic like folder move) | Low | `GmailModifyClient` sends single `modify` call with both `addLabelIds` and `removeLabelIds` |
| 6 | **No `changeKey` equivalent** for optimistic concurrency | Low | Gmail message IDs are immutable; updates use `modify` which is idempotent for label changes |
| 7 | **Pub/Sub push requires domain-wide delegation** for setup | Low | Polling-based `GmailSource` works without push; push is an optimization |

---

## 6. Capability Parity Matrix

| Capability | Microsoft Graph | Gmail API | Notes |
|------------|----------------|-----------|-------|
| `mail.send_reply` | ✓ Full | ✓ Full | Draft + send or direct send |
| `mail.send_new_message` | ✓ Full | ✓ Full | Direct send via `messages.send` |
| `mail.draft_reply` | ✓ Full | ✓ Full | `drafts.create` + `drafts.send` |
| `mail.mark_read` | ✓ Full | ✓ Full | Remove `UNREAD` label |
| `mail.move_message` | ✓ Full | ✓ Full | Remove old label + add new label |
| `mail.set_categories` | ✓ Full | ✓ Partial | `CATEGORY_*` labels only; no custom categories |
| `campaign_brief` | N/A | N/A | Not a mail provider capability |

**Degradation:** `mail.set_categories` on Gmail is limited to Gmail's built-in `CATEGORY_*` labels. Custom categories (like Graph's user-defined categories) are not supported. The intent is rejected with `unsupported_category` if custom categories are requested.

---

## 7. Invariants

1. **Gmail is a provider-family member, not a new vertical.** It uses the same `mail.*` intent types and `NormalizedMessage` shape as Graph.
2. **The kernel never sees Gmail-specific structure.** `historyId`, `labelIds`, and `internalDate` live inside `source_extensions.gmail`.
3. **Auth is provider-local.** Google OAuth2 is an implementation detail of `GmailTokenProvider`; the kernel receives only opaque bearer tokens.
4. **Draft ID changes on send are handled by the state machine.** Both Graph and Gmail change message IDs when a draft is sent; the reconciler binds the old draft ID to the new sent message ID.
5. **Labels are folder_refs.** The multi-assign nature of Gmail labels is normalized to the `folder_refs: string[]` array; the kernel does not assume single-parent folders.

---

## 8. Verification Evidence

- `pnpm verify` — all 5 steps pass
- `pnpm typecheck` — all packages pass
- Decision 531 boundary contract is comprehensive enough to host Gmail without kernel changes
- `Source` interface, `NormalizedMessage` shape, `OutboundCommand` state machine, and `MessageFinder` interface all support Gmail semantics
- No Graph-specific code exists in kernel layers (`facts/`, `context/`, `work/`, `policy/`, `intent/`, `observability/`)

---

## Closure Statement

Gmail / Google Workspace fits the Task 531 canonical mail-connectivity boundary with bounded deltas and no kernel changes. The seven required adapter components are all implementable. The primary blocker is Google's OAuth verification review for consumer accounts ($15k–$75k, 2–8 weeks), which makes Google Workspace via service-account domain-wide delegation the recommended near-term path. All capabilities except custom categories achieve full parity. The estimated implementation effort is 9 new adapter files over 2–3 weeks.

---

**Closed by:** a2  
**Closed at:** 2026-04-23
