# Decision 534 — Mail vs Adjacent Source Family Boundary

**Date:** 2026-04-23
**Task:** 534
**Depends on:** 531 (Mail Connectivity Boundary Contract)
**Chapter:** Mail Connectivity Generalization And Provider Boundary (531–535)
**Verdict:** **Accepted. Mail is a bounded provider-family; adjacent systems are not honorary mail providers.**

---

## 1. Problem Statement

Narada's mail vertical is generalizing beyond Microsoft Graph to host Gmail and IMAP/SMTP providers. During this generalization, there is a recurring risk: systems that *send* notifications (GitHub, Slack, SMS) or *receive* events (webhooks, APIs) may be incorrectly modeled as mail providers or squeezed into the `mail.*` intent/fact family.

This decision defines the **mail-connectivity family membership rules** and the **adjacent-source family boundary** so that:

1. A GitHub notification email is correctly handled by the mail vertical (it is an RFC 5322 message).
2. A GitHub issue webhook is **not** handled by the mail vertical (it is a native object from an adjacent source family).
3. No agent or charter may claim that "GitHub is a mail provider" or "Slack messages are mail."

---

## 2. Mail-Connectivity Family Membership Rules

A system qualifies as a member of the **mail-connectivity family** if and only if it satisfies **all four** of the following criteria:

### 2.1 RFC 5322 Message Shape
The system's native data unit is an RFC 5322 message (or a close structural equivalent) with:
- `From` / `To` / `Cc` / `Bcc` address fields
- `Subject` header
- `Message-Id` header (`internet_message_id`)
- MIME body structure (`text/plain`, `text/html`, attachments)

### 2.2 Mailbox Semantics
The system organizes messages into containers with mailbox semantics:
- Messages are stored, retrieved, and searched by container
- Read/unread state is tracked per message
- Messages can be moved between containers
- Drafts (optional) are staged before sending

### 2.3 Thread / Conversation Grouping
The system groups related messages into threads or conversations via:
- `References` / `In-Reply-To` headers, or
- Provider-native thread identifiers (e.g., `conversationId`, `threadId`)

### 2.4 Send and Receive as Core Functions
Sending and receiving messages are core system functions, not side effects:
- The system has a native send path (SMTP, Graph send, Gmail send)
- The system has a native receive/ingest path (IMAP, delta sync, push notification)

### 2.5 Membership Table

| System | RFC 5322 | Mailbox | Threading | Send/Receive | **Mail Family?** |
|--------|----------|---------|-----------|--------------|-----------------|
| Microsoft Graph / Exchange | ✓ | ✓ | ✓ | ✓ | **Yes** |
| Gmail / Google Workspace | ✓ | ✓ | ✓ | ✓ | **Yes** |
| Generic IMAP / SMTP | ✓ | ✓ | ✓ | ✓ (SMTP send) | **Yes** |
| **GitHub** | ✗ (issues/PRs are native objects) | ✗ (inbox is notification surface, not mailbox) | ✗ (issue threads are not email threads) | ✗ (no native send) | **No** |
| **Slack** | ✗ (chat messages) | ✗ (channels, not mailboxes) | ✗ (Slack threads) | ✗ (no SMTP) | **No** |
| **Klaviyo** | ✗ (campaigns are native objects) | ✗ (no user mailbox) | ✗ | ✗ (sends via ESP, not native) | **No** |
| **SMS / Twilio** | ✗ (short messages, not MIME) | ✗ | ✗ | Partial (send only) | **No** |
| **Generic Webhook** | ✗ | ✗ | ✗ | ✗ | **No** |

---

## 3. Adjacent Source Families: The GitHub Case Study

GitHub is the canonical example of an adjacent source family because it interacts with mail in multiple ways, creating maximum smear risk.

### 3.1 Native Object Model

GitHub's native objects are **not** messages:

| GitHub Object | Mail Equivalent | Why Different |
|--------------|-----------------|---------------|
| `Repository` | None | A code hosting project, not a mailbox |
| `Issue` | None | A tracked work item with comments, not a thread |
| `Pull Request` | None | A code review workflow, not a conversation |
| `Notification` | None | A GitHub-native alert surface, not an RFC 5322 message |
| `Comment` | None | A native comment on an issue/PR, not an email reply |

GitHub *can* send email notifications, but those are **exports** from GitHub's native model into RFC 5322. The email is a mail fact; the GitHub issue is not.

### 3.2 Native Transport and Control Surfaces

| Surface | GitHub | Mail Family |
|---------|--------|-------------|
| **Read API** | REST API (`/repos/{owner}/{repo}/issues`) | IMAP, Graph delta, Gmail API |
| **Write API** | REST API (`POST /repos/.../issues`) | SMTP, Graph send, Gmail send |
| **Event delivery** | Webhooks (`issues.opened`, `pull_request.review_submitted`) | Push notification, delta sync, IDLE |
| **Auth** | GitHub token (PAT or OAuth) | OAuth2, password, TLS cert |
| **Identity** | `login`, `node_id`, `repository_id` | `email_address`, `message_id`, `conversation_id` |

### 3.3 Notification vs Mailbox Semantics

GitHub has a **notification surface** that is superficially similar to a mailbox but semantically distinct:

| Aspect | GitHub Notification | Mail Mailbox |
|--------|---------------------|--------------|
| **Storage** | Ephemeral, marked read by viewing | Persistent, read state is independent of viewing |
| **Threading** | Tied to issue/PR lifecycle | Tied to `In-Reply-To` / `References` |
| **Reply path** | Reply via web UI or API | Reply via `Reply-To` / `From` address |
| **Subscription** | Watched repo, mention, assignment | Direct address, list, alias |
| **Archive** | No archive; issue is the durable record | Archive is a mailbox move |

A GitHub notification email (the email GitHub sends *to* a user) **is** an RFC 5322 message and may enter Narada through the mail vertical. The GitHub notification *object* (the item in GitHub's notification API) is **not** a message and must not be treated as mail.

### 3.4 Authority Boundary

GitHub's authority model is orthogonal to mail:
- GitHub permissions are repo-scoped (`read`, `write`, `admin`)
- Mail permissions are mailbox-scoped (`read`, `send`, `manage`)
- A charter that can read a mailbox cannot assume it can read a GitHub repo
- A tool that calls the GitHub API must declare its authority class separately from mail intents

---

## 4. How Adjacent Systems May Enter Narada

Adjacent source families are **not** excluded from Narada. They must simply enter through the correct path:

### 4.1 Direct Source Adapters

Adjacent systems may implement the `Source` interface directly:

| Source Family | Fact Type | Example Payload |
|--------------|-----------|-----------------|
| `webhook` | `webhook.received` | `{ endpoint_id, body }` |
| `github` (future) | `github.issue.opened` | `{ repository, issue, sender }` |
| `slack` (future) | `slack.message.posted` | `{ channel, user, text, ts }` |
| `sms` (future) | `sms.message.received` | `{ from_number, to_number, body }` |

These facts travel through the same kernel pipeline (`Source → Fact → Context → Work`) as mail facts, but they are **not** `mail.*` facts and do not normalize to `NormalizedMessage`.

### 4.2 Connector / Tool Surfaces

Charters may interact with adjacent systems through **tools**, not through the mail vertical:

- A charter may call a `github.create_issue` tool (HTTP POST to GitHub API)
- A charter may call a `slack.post_message` tool (HTTP POST to Slack webhook)
- These are `process.run` or future intent types, not `mail.send_new_message`

### 4.3 Mail Notifications Admitted as Mail Facts

When an adjacent system **sends an email**, that email enters Narada correctly:

```
GitHub → sends email notification → arrives in Exchange inbox
                                           ↓
                                    ExchangeSource pulls delta
                                           ↓
                                    NormalizedMessage produced
                                           ↓
                                    Fact: mail.message.discovered
```

This is **not** GitHub entering Narada as a source. It is **mail entering Narada as mail**, where the mail happens to have been triggered by GitHub. The charter may infer GitHub context from the message subject/body, but the source family is still `mail`.

---

## 5. Anti-Smear Language

These phrases collapse the boundary and must be avoided:

| Avoid | Why | Prefer |
|-------|-----|--------|
| "GitHub is a mail provider" | GitHub has no mailbox, no SMTP, no RFC 5322 native model | "GitHub is an adjacent source family that may export notifications as mail" |
| "Slack messages are emails" | Slack messages are chat, not MIME | "Slack messages are chat facts; Slack notification emails are mail facts" |
| "The webhook source is for mail" | `WebhookSource` is domain-neutral | "The webhook source emits `webhook.received` facts; mail may be one payload type" |
| "Klaviyo sends mail, so it's a mail provider" | Klaviyo sends via ESP; it has no mailbox | "Klaviyo is a campaign tool; its emails enter Narada through the recipient's mail provider" |
| "Any notification system is mail" | Collapses all notification into mailbox semantics | "Notification systems may export to mail, but their native model is distinct" |
| "GitHub issues should normalize to NormalizedMessage" | Issues are not messages | "GitHub issues require a separate normalizer and fact type" |
| "We can reuse mail.send_new_message for Slack DMs" | Slack has no SMTP endpoint | "Slack DMs require a `slack.post_message` tool or intent" |

---

## 6. Smear Detection Heuristic

If a proposed "mail provider" requires any of the following, it is **not a mail provider**:

1. **Non-RFC-5322 message shapes** — native objects are not `From`/`To`/`Subject` messages
2. **Non-mailbox identity models** — users are identified by `login`, `node_id`, `phone_number`, not `email_address`
3. **Non-thread conversation semantics** — grouping is by issue, channel, campaign, not `References`/`In-Reply-To`
4. **No native send path** — the system cannot send RFC 5322 messages directly (only via export to an ESP)
5. **No native receive/ingest path** — the system cannot receive or store RFC 5322 messages (only emit webhooks or API events)

If three or more of these are true, the system is an **adjacent source family**, not a mail provider.

---

## 7. Invariants

1. **Mail facts carry RFC 5322 shape.** A fact typed `mail.*` must normalize to `NormalizedMessage`. Facts from adjacent families must not reuse `mail.*` types.
2. **Intent families are source-family names.** `mail.send_reply` is for mail providers only. Adjacent families must register their own intent types (e.g., `github.create_issue`, `slack.post_message`).
3. **Source adapters are family-local.** A `GitHubSource` (future) emits `github.*` facts, not `mail.*` facts. It does not normalize to `NormalizedMessage`.
4. **Tool bindings are authority-separate.** A charter may have both `mail.send_reply` and `github.create_issue` capabilities, but they are distinct authority classes and distinct tool bindings.
5. **Notification emails are mail, not the source.** When GitHub sends an email, the email is a `mail.message.discovered` fact. The GitHub event that triggered it is a separate artifact and must not be conflated.

---

## 8. Verification Evidence

- Decision artifact exists at `.ai/decisions/20260423-534-mail-vs-adjacent-source-family-boundary.md`.
- Membership rules (§2.1–2.4) are explicit and testable against any proposed provider.
- GitHub case study (§3) documents native object model, transport, notification semantics, and authority boundary.
- Three entry paths (§4) are explicit: direct source adapters, connector/tools, mail notifications.
- Anti-smear language (§5) records 7 forbidden phrases with preferred replacements.
- Smear detection heuristic (§6) provides 5 criteria for identifying adjacent families.
- Invariants (§7) are enforceable at fact type, intent type, and source adapter levels.

---

## Closure Statement

The mail-connectivity family is bounded by RFC 5322 message shape, mailbox semantics, thread grouping, and send/receive capability. Microsoft Graph, Gmail, and IMAP/SMTP are members. GitHub, Slack, Klaviyo, SMS, and generic webhooks are adjacent source families. Adjacent systems may enter Narada through their own source adapters, through tool surfaces, or via the mail notifications they export — but they must never be squeezed into the `mail.*` fact and intent family. The anti-smear language and detection heuristic prevent future boundary collapse.

---

**Closed by:** codex
**Closed at:** 2026-04-23
