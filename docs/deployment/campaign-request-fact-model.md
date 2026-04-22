# Campaign Request Fact Model

> Defines the canonical fact types, payload schemas, extraction rules, and context formation strategy for the email-marketing Operation.
>
> Governed by [`docs/deployment/email-marketing-operation-contract.md`](./email-marketing-operation-contract.md) (Task 387).
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## 1. Fact Pipeline Overview

```
┌─────────────────┐     ┌──────────────────────────┐     ┌─────────────────────────┐
│  Graph delta    │────▶│  mail.message.discovered │────▶│ campaign.request.       │
│  sync source    │     │  (kernel fact envelope)  │     │ discovered              │
└─────────────────┘     └──────────────────────────┘     │ (enriched fact)         │
                                                         └─────────────────────────┘
                                                                    │
                                                                    ▼
                                                         ┌─────────────────────────┐
                                                         │ CampaignRequestContext  │
                                                         │ Formation               │
                                                         │ (group by thread)       │
                                                         └─────────────────────────┘
                                                                    │
                                                                    ▼
                                                         ┌─────────────────────────┐
                                                         │   PolicyContext →       │
                                                         │   work_item (foreman)   │
                                                         └─────────────────────────┘
```

**Stages:**

1. **Source sync** admits `mail.message.discovered` facts via `HttpSourceAdapter` / Graph delta sync.
2. **Sender filter** (admission rule) silently drops mail from non-allowed senders.
3. **Enrichment transform** derives `campaign.request.discovered` from allowed-sender mail facts.
4. **Context formation** groups enriched facts by `conversation_id` into campaign-request contexts.
5. **Foreman admission** opens `work_item` rows from admitted contexts.

---

## 2. Fact Types

### 2.1 `mail.message.discovered` — Reuse from Helpdesk Vertical

**Classification:** Kernel fact type (already defined in `packages/layers/control-plane/src/facts/types.ts`).

**Admission rule for email-marketing Operation:**

- Same fact type as helpdesk vertical.
- Same payload shape: `NormalizedPayload` inside a fact envelope (`{ record_id, ordinal, event: NormalizedPayload }`).
- **Different admission rule:** The sender email address (`event.from.email`) must be present in the Site configuration's `campaign_request_senders` allowlist.
- Non-allowed sender mail is **silently skipped** — no fact admission, no work opening, no residual logging required.

**Fact envelope shape (existing, unchanged):**

```typescript
interface Fact {
  fact_id: string;           // Deterministic, replay-stable
  fact_type: "mail.message.discovered";
  provenance: {
    source_id: string;       // e.g. "graph:delta:mailbox-1"
    source_record_id: string;
    source_version?: string | null;
    source_cursor?: string | null;
    observed_at: string;     // ISO 8601
  };
  payload_json: string;      // Serialized { record_id, ordinal, event: NormalizedPayload }
  created_at: string;        // ISO 8601
}
```

**Payload shape (existing, unchanged):**

The `payload_json` contains a `NormalizedPayload` (see `packages/layers/control-plane/src/types/normalized.ts`):

```typescript
interface NormalizedPayload {
  schema_version: number;
  mailbox_id: string;
  message_id: string;
  event_id?: string;
  kind?: "created" | "updated" | "deleted" | "upsert" | "delete";
  source_version?: string;
  received_at?: string;
  observed_at?: string;
  subject?: string;
  from?: { display_name?: string; email?: string };
  sender?: { display_name?: string; email?: string };
  to?: { display_name?: string; email?: string }[];
  cc?: { display_name?: string; email?: string }[];
  bcc?: { display_name?: string; email?: string }[];
  reply_to?: { display_name?: string; email?: string }[];
  conversation_id?: string;
  category_refs?: string[];
  folder_refs?: string[];
  flags?: { is_read: boolean; is_draft: boolean; is_flagged: boolean; has_attachments: boolean };
  body?: {
    body_kind: "empty" | "text" | "html";
    text?: string;
    html?: string;
    preview?: string;
  };
  attachments?: NormalizedAttachment[];
  internet_message_id?: string;
  headers?: { values: Record<string, string[]> };
  importance?: string;
  is_read?: boolean;
  is_draft?: boolean;
  is_flagged?: boolean;
}
```

---

### 2.2 `campaign.request.discovered` — Enrichment Fact

**Classification:** New fact type for the email-marketing Operation.

**Derivation:** Produced by a transform step that reads `mail.message.discovered` facts from allowed senders and extracts campaign-specific fields. This transform is **not** a source adapter — it is a post-admission enrichment that runs after facts are ingested and before context formation.

**Fact envelope shape:**

```typescript
interface Fact {
  fact_id: string;           // Deterministic, replay-stable
  fact_type: "campaign.request.discovered";
  provenance: {
    source_id: string;       // Same as parent mail fact: "graph:delta:mailbox-1"
    source_record_id: string; // Same as parent mail fact's source_record_id
    source_version?: string | null;
    source_cursor?: string | null;
    observed_at: string;     // Same as parent mail fact
  };
  payload_json: string;      // Serialized CampaignRequestPayload
  created_at: string;
}
```

**Payload schema — `CampaignRequestPayload`:**

```typescript
interface CampaignRequestPayload {
  /** Reference to the parent mail fact */
  parent_fact_id: string;

  /** Source mail metadata */
  source_mail: {
    message_id: string;
    mailbox_id: string;
    conversation_id: string;
    internet_message_id?: string;
    received_at: string;
  };

  /** Extracted sender information */
  sender: {
    email: string;
    display_name?: string;
    verified: boolean;        // true if sender is on campaign_request_senders allowlist
  };

  /** Extracted campaign request fields */
  extraction: {
    /** Raw subject line */
    subject: string;

    /** Plain-text body (HTML stripped) */
    body_text: string;

    /** Campaign name hint extracted from subject and body */
    requested_campaign_name: string | null;

    /** Timing hint extracted from body */
    requested_timing: string | null;

    /** Segment names mentioned in the request */
    mentioned_segments: string[];

    /** Extraction confidence (0.0–1.0) */
    confidence: number;

    /** List of extraction heuristics that fired */
    matched_rules: string[];
  };

  /** Classification result */
  classification: {
    /** Whether this mail is classified as a campaign request */
    is_campaign_request: boolean;

    /** Reason for classification decision */
    reason: "explicit_keyword" | "sender_pattern" | "subject_pattern" | "insufficient_signal" | "not_a_request";
  };
}
```

**Key invariants:**

- `parent_fact_id` must reference an existing `mail.message.discovered` fact.
- `sender.verified` must be `true` — the enrichment transform only processes allowed-sender mail facts.
- `classification.is_campaign_request` may be `false` for allowed-sender mail that does not contain campaign-request signals.
- `fact_id` is computed deterministically from `fact_type`, `provenance`, and `payload` using `buildFactId()` (same as all kernel facts).

---

## 3. Context Formation Strategy

### 3.1 `CampaignRequestContextFormation`

**Responsibility:** Group `campaign.request.discovered` facts into campaign-request contexts, one per conversation thread.

**Behavior:**

1. **Fact filter:** Only processes facts with `fact_type === "campaign.request.discovered"` and `classification.is_campaign_request === true`.
2. **Group key:** `payload.source_mail.conversation_id` (the mail thread ID).
3. **Context identity:** `context_id` equals the `conversation_id` of the thread.
4. **Change kinds:** `new_request` for the first fact in a thread; `follow_up` for subsequent facts in the same thread.
5. **Revision ordinal:** Incremented per thread, same as `MailboxContextStrategy`.

**Output — `PolicyContext`:**

```typescript
interface PolicyContext {
  context_id: string;               // conversation_id
  scope_id: string;                 // Site scope
  revision_id: string;              // "{conversation_id}:rev:{ordinal}"
  previous_revision_ordinal: number | null;
  current_revision_ordinal: number;
  change_kinds: string[];           // ["new_request"] or ["follow_up"]
  facts: Fact[];                    // campaign.request.discovered facts
  synced_at: string;                // ISO 8601
}
```

**Comparison with `MailboxContextStrategy`:**

| Aspect | `MailboxContextStrategy` | `CampaignRequestContextFormation` |
|--------|--------------------------|-----------------------------------|
| Input facts | `mail.message.discovered` | `campaign.request.discovered` |
| Group key | `conversation_id` | `conversation_id` (via payload) |
| Fact filter | All mail facts | Only `is_campaign_request === true` |
| Change kinds | `new_message`, `moved` | `new_request`, `follow_up` |
| Context identity | `conversation_id` | `conversation_id` |
| Work item semantics | Support conversation | Campaign request thread |

---

### 3.2 Work Item Opening

**Rule:** One `work_item` per open `context_id` that has no existing non-terminal (`opened` or `leased` or `executing`) work item.

**Trigger:** Foreman `onContextsAdmitted()` is called with the `PolicyContext[]` produced by `CampaignRequestContextFormation`.

**Work item fields (reuse existing schema):**

```
work_items:
  - context_id      = conversation_id
  - scope_id        = Site scope
  - status          = "opened"
  - opened_at       = now
  - policy_binding  = "campaign-production"
```

---

## 4. Extraction Rules

### 4.1 Plain-Text Canonicalization

- **HTML stripping:** If `body.html` is present, it is stripped to plain text. `body.text` is preferred if present.
- **Truncation:** Body text is truncated to 4000 characters for extraction. Full text is preserved in the parent mail fact.
- **Signature removal:** Simple heuristics remove common email signature patterns ("--", "Sent from my", "Regards,").

### 4.2 Subject Line Scanning

The subject line is scanned for campaign name hints using keyword matching:

| Pattern | Example | Extracted `requested_campaign_name` |
|---------|---------|-------------------------------------|
| `"campaign for {name}"` | "Need a campaign for product launch" | `"product launch"` |
| `"{name} campaign"` | "Spring sale campaign" | `"Spring sale"` |
| `"email for {name}"` | "Email for onboarding flow" | `"onboarding flow"` |
| Quoted string | `"Q2 promo" campaign` | `"Q2 promo"` |

**Fallback:** If no pattern matches, `requested_campaign_name` is `null`.

### 4.3 Body Timing Extraction

The plain-text body is scanned for timing expressions:

| Pattern | Example | Extracted `requested_timing` |
|---------|---------|------------------------------|
| `"by {day}"` | "by Friday" | `"by Friday"` |
| `"next {period}"` | "next week" | `"next week"` |
| `"this {period}"` | "this month" | `"this month"` |
| `"ASAP"` / `"urgent"` / `"rush"` | "ASAP please" | `"ASAP"` |
| `"{N} days"` | "in 3 days" | `"in 3 days"` |
| Date-like pattern | "May 15th" | `"May 15th"` |

**Fallback:** If no pattern matches, `requested_timing` is `null`.

### 4.4 Segment Mention Extraction

The body is scanned for known segment names using simple keyword matching (v0):

- Segment names are loaded from the Site configuration (`campaign_segments` list).
- Matching is case-insensitive whole-word match.
- Only segment names from the configured list are extracted.
- Unknown segment mentions are ignored (not hallucinated).

**Example:**

```
Config: campaign_segments = ["active-users", "churned", "trial", "enterprise"]
Body: "target active-users and enterprise segments"
Result: mentioned_segments = ["active-users", "enterprise"]
```

**v1 enhancement:** NLP-based segment extraction (deferred).

### 4.5 Confidence Scoring

```
confidence = base_score + bonus_signals - penalty_signals

base_score = 0.3
bonus_signals:
  + 0.2  requested_campaign_name is non-null
  + 0.2  requested_timing is non-null
  + 0.1  mentioned_segments is non-empty
  + 0.1  subject contains "campaign" or "email"
  + 0.1  body contains "campaign" or "newsletter"

penalty_signals:
  - 0.1  body is shorter than 20 characters
  - 0.1  sender is not on allowlist (should never happen; defensive)

max confidence = 1.0
min confidence = 0.0
```

**Classification threshold:** `is_campaign_request = confidence >= 0.5`

---

## 5. Non-Campaign Mail Handling

### 5.1 From Allowed Senders

When an allowed sender sends mail that does **not** classify as a campaign request (`confidence < 0.5`):

1. The parent `mail.message.discovered` fact is admitted normally.
2. An enrichment fact is **still produced** with `classification.is_campaign_request = false`.
3. `CampaignRequestContextFormation` **skips** this fact (filter: `is_campaign_request === true`).
4. **No work item is opened** for this thread.
5. The enrichment fact with `is_campaign_request = false` may be optionally logged as a residual for operator inspection.

**Rationale:** Producing the enrichment fact even for non-requests preserves the full trace of what the system evaluated and why it decided not to act. It also enables later auditing of false negatives.

### 5.2 From Non-Allowed Senders

When a non-allowed sender sends mail:

1. The `mail.message.discovered` fact is **not admitted** (silent skip at source boundary).
2. No enrichment fact is produced.
3. No work item is opened.
4. No residual is logged.

**Rationale:** The allowlist is the first gate. Non-allowed sender mail never enters the system.

---

## 6. Fact Idempotency and Determinism

### 6.1 Fact ID Computation

Both `mail.message.discovered` and `campaign.request.discovered` use the same deterministic `buildFactId()` function:

```
fact_id = buildFactId({
  fact_type: "campaign.request.discovered",
  provenance: { source_id, source_record_id, source_version, source_cursor, observed_at },
  payload: { parent_fact_id, source_mail, sender, extraction, classification }
})
```

**Idempotency:** Re-processing the same mail fact with the same extraction rules produces the same `campaign.request.discovered` fact ID. The `apply_log` prevents duplicate application.

### 6.2 Replay Safety

If the enrichment transform is re-run from stored `mail.message.discovered` facts:

- Deterministic extraction rules produce identical `campaign.request.discovered` facts.
- Identical fact IDs hit the `apply_log` idempotency boundary.
- Context formation produces identical contexts.
- Foreman admission is idempotent for identical contexts.

**Rule:** The enrichment transform must be deterministic. It must not use randomness, timestamps, or external state that changes between replays.

---

## 7. Configuration Schema

The email-marketing Operation requires these new configuration fields (in addition to standard Site config):

```json
{
  "campaign_request_senders": [
    "colleague@company.com",
    "marketing@company.com"
  ],
  "campaign_segments": [
    "active-users",
    "churned",
    "trial",
    "enterprise"
  ],
  "campaign_extraction": {
    "confidence_threshold": 0.5,
    "max_body_length": 4000,
    "strip_signatures": true
  }
}
```

**Location:** These fields live in the Site's `config.json` under the Operation-specific section. They are not part of the kernel config schema — they are operation-bound configuration read by the enrichment transform and context formation strategy.

---

## 8. Closure Checklist

- [x] Fact types are defined with payload schemas.
- [x] `mail.message.discovered` reuse and admission rules are documented.
- [x] `campaign.request.discovered` payload schema is complete with TypeScript interfaces.
- [x] Context formation strategy (`CampaignRequestContextFormation`) is documented.
- [x] Extraction rules are explicit and bounded (subject scanning, body timing, segment matching, confidence scoring).
- [x] Non-campaign mail handling is documented (allowed-sender vs. non-allowed-sender paths).
- [x] Fact idempotency and replay safety are addressed.
- [x] Configuration schema is specified.
- [x] Document references the operation contract (Task 387).
- [x] No implementation code is added.
- [x] No derivative task-status files are created.
