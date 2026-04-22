# Campaign Charter + Knowledge Binding Specification

> Defines the campaign-production charter behavior, required knowledge sources, missing-info escalation path, and knowledge injection pattern for the email-marketing Operation.
>
> This specification is the output of **Task 389**. It governs charter implementation (Task 391) and integration proof (Task 393). No campaign charter may be implemented before this specification is referenced.
>
> Uses crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## 1. Charter Identity

| Attribute | Value |
|-----------|-------|
| **Charter ID** | `campaign_producer` |
| **Role** | `primary` (sole owner of campaign-request context decisions) |
| **Authority Classes** | `derive` (read facts, extract requirements), `propose` (propose brief or reply) |
| **Forbidden Authority** | `claim`, `execute`, `resolve`, `confirm` — these remain kernel/runtime owned |
| **Residence** | Private ops repo (prompt template, knowledge sources, policy binding) |
| **Runtime** | `@narada2/control-plane` `CodexCharterRunner` (reused kernel charter runtime) |

The charter is **not** a new runtime. It is a new charter identity (`charter_id: "campaign_producer"`) running inside the existing `CharterInvocationEnvelope` → `CharterOutputEnvelope` boundary.

---

## 2. Charter Inputs

### 2.1 Invocation Envelope

The charter receives a standard [`CharterInvocationEnvelope`](../../packages/domains/charters/src/runtime/envelope.ts) with these fields set:

| Field | Value / Source |
|-------|----------------|
| `charter_id` | `"campaign_producer"` |
| `role` | `"primary"` |
| `context_materialization` | `CampaignRequestContextMaterialization` (see §2.2) |
| `allowed_actions` | `["send_reply", "campaign_brief", "no_action"]` |
| `available_tools` | `[]` (v0 — no tools bound to campaign charter) |
| `coordinator_flags` | `[]` (v0 — no special flags) |
| `prior_evaluations` | Chain of previous evaluations for this context (e.g., prior follow-up requests) |
| `vertical_hints` | `{ "vertical": "campaign", "source": "mail" }` |

### 2.2 Context Materialization

The `CampaignRequestContextMaterializer` (new, to be implemented in Task 391) produces this payload:

```typescript
interface CampaignRequestContextMaterialization {
  /** Thread messages in chronological order */
  messages: NormalizedMessage[];

  /** Extracted campaign fields from the latest message */
  extracted: {
    sender_email: string;
    subject: string;
    body_text: string;
    requested_campaign_name: string | null;
    requested_timing: string | null;
    mentioned_segments: string[];
  };

  /** Prior evaluations in this thread (for follow-up tracking) */
  prior_thread_evaluations: {
    evaluated_at: string;
    outcome: "complete" | "clarification_needed" | "escalation" | "no_op";
    summary: string;
  }[];

  /** Knowledge sources bound to this charter */
  knowledge_sources: KnowledgeSource[];
}
```

### 2.3 Message Formatting

Messages are formatted for the charter prompt as:

```
From: {from.name} <{from.email}>
Subject: {subject}
Date: {received_at}

{body_text}
---
```

Only `body_text` (plain text) is used. HTML bodies are stripped during normalization.

---

## 3. Charter Outputs

The charter produces a `CharterOutputEnvelope` with one of three outcomes.

### 3.1 Outcome: `campaign_brief`

**When:** All required fields are present or inferable with high confidence.

**`recommended_action_class`:** `campaign_brief`

**`proposed_actions` payload:**

```json
{
  "action_type": "campaign_brief",
  "authority": "recommended",
  "payload_json": "{\"name\":\"...\",\"audience\":\"...\",\"content_summary\":\"...\",\"timing\":\"...\",\"approval_needed\":true}",
  "rationale": "..."
}
```

**Payload schema (`CampaignBriefPayload`):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Campaign name, validated against naming conventions |
| `audience` | `string` | Yes | Segment name or description; must match known segment definitions |
| `content_summary` | `string` | Yes | Brief description of campaign content (not full copy) |
| `timing` | `string` | Yes | Target send time or date; validated against lead-time constraints |
| `approval_needed` | `boolean` | Yes | Always `true` in v0. Charter must not set `false`. |
| `from_email` | `string` | No | Sender email override (defaults to operation config) |
| `subject_line` | `string` | No | Proposed subject line |
| `notes` | `string` | No | Additional operator notes |

**Validation rules:**
- `name` must not be empty; should follow campaign naming conventions if inferable
- `audience` must reference a known segment name from `knowledge_sources` or be marked as `unknown`
- `timing` must include a date; relative timing ("next week") must be resolved to absolute date
- `approval_needed` must be `true` in v0; foreman governance rejects `false`

### 3.2 Outcome: `request_info`

**When:** Required fields are missing and confidence is medium or low.

**`recommended_action_class`:** `send_reply`

**`proposed_actions` payload:**

```json
{
  "action_type": "send_reply",
  "authority": "recommended",
  "payload_json": "{\"to\":[\"...\"],\"subject\":\"Re: ...\",\"body_text\":\"...\"}",
  "rationale": "Missing required fields: ..."
}
```

**Missing field tracking:**

The charter must explicitly list missing fields in the `summary` or `reasoning_log`:

| Field | Critical? | Follow-up question template |
|-------|-----------|----------------------------|
| `requested_campaign_name` | No | "What would you like to name this campaign?" |
| `audience` / `mentioned_segments` | Yes | "Which segment or list should receive this campaign?" |
| `timing` | No | "When would you like this campaign sent? (We need at least 3 business days lead time.)" |
| `content_summary` | Yes | "What is the main message or offer for this campaign?" |

**Critical fields:** If a critical field is missing, the charter MUST produce `request_info`. It must NOT produce `campaign_brief` with placeholder values.

### 3.3 Outcome: `no_action`

**When:** The thread is not a campaign request (e.g., administrative email, reply to a prior campaign, out-of-office).

**`recommended_action_class:** `no_action` (or absent)

**`proposed_actions`:** Empty array

**`summary`:** Brief explanation of why no action is needed (e.g., "This is a calendar invitation, not a campaign request.")

---

## 4. Required Knowledge Sources

Knowledge sources are `.md` files in the private ops repo, bound to the charter at evaluation time via the `MailboxBinding.knowledge_sources` configuration.

### 4.1 Knowledge Catalog

| Knowledge File | Kind | Owner | Public/Private | Contents |
|----------------|------|-------|----------------|----------|
| `campaign-naming-conventions.md` | `policy` | Ops team | Private | Rules for campaign names (prefixes, date formats, forbidden words) |
| `brand-voice-guidelines.md` | `policy` | Marketing | Private | Tone, style, prohibited phrases, mandatory disclaimers |
| `segment-definitions.md` | `reference` | Marketing | Private | Segment names, descriptions, approximate sizes. **No customer record data.** |
| `timing-constraints.md` | `policy` | Ops team | Private | Lead times, blackout dates, send-time preferences |
| `campaign-templates.md` | `example` | Marketing | Private | Example briefs for common campaign types (welcome, promotional, newsletter) |

### 4.2 Knowledge Loading

At Site startup, the `CampaignRequestContextMaterializer` reads knowledge sources from the configured path and injects them into `context_materialization.knowledge_sources`.

```typescript
interface KnowledgeSource {
  name: string;        // e.g., "segment-definitions"
  kind: "policy" | "reference" | "example";
  content: string;     // Full markdown content
}
```

Knowledge sources are **read once per context materialization** and are immutable during evaluation. The charter runtime does not re-fetch knowledge mid-evaluation.

### 4.3 Segment Privacy Rule

`segment-definitions.md` must contain **only**:
- Segment names (e.g., "Active Customers", "Lapsed 90 Days")
- Descriptions (e.g., "Customers with purchase in last 90 days")
- Approximate counts (e.g., "~12,000 contacts")

It must **never** contain:
- Individual customer email addresses
- Customer names or identifiers
- List export data
- Klaviyo list API keys or internal IDs

---

## 5. Missing-Info Escalation Path

### 5.1 First Missing-Info Event

```
Campaign request received
  → Context materialized
  → Charter evaluates
  → Critical field(s) missing
  → Charter produces: outcome=clarification_needed, action=send_reply
  → Foreman creates decision
  → OutboundHandoff creates outbound_command (send_reply)
  → Operator reviews and approves follow-up email
  → SendReplyWorker sends follow-up via Graph API
  → Reconciliation confirms send
```

### 5.2 Follow-Up Counter

The `CampaignRequestContextMaterializer` tracks follow-up count via `prior_thread_evaluations`:

| Follow-ups Sent | Charter Behavior |
|-----------------|-----------------|
| 0 | Normal evaluation; produce `request_info` if missing fields |
| 1 | Re-evaluation after sender reply; produce `campaign_brief` if fields now present, or `request_info` if still missing |
| 2 | Produce `request_info` with stronger urgency; note prior requests in body |
| ≥3 | Produce `escalation` outcome; recommend operator manual handling |

### 5.3 Terminal Missing-Info

If **3 follow-up emails** have been sent without receiving the required information:

1. Charter produces `escalation` outcome with `urgency: "high"`.
2. Foreman classifies the work item as `failed_terminal` (via `DefaultForemanFacade.failWorkItem()`).
3. The work item receives a `terminal_reason`: `"Missing required campaign information after 3 follow-up attempts."`
4. A residual is recorded in the task/decision file or Site trace.
5. The attention queue surfaces the item for operator review.

**Authority:** Only the foreman may mark the work item `failed_terminal`. The charter proposes escalation; the foreman classifies the failure.

---

## 6. Governance Rules

### 6.1 Allowed Action Types

The campaign charter may only propose these action types:

| Action Type | When | Payload |
|-------------|------|---------|
| `campaign_brief` | All required fields present | `CampaignBriefPayload` |
| `send_reply` | Missing info follow-up | Standard send_reply payload |
| `no_action` | Not a campaign request | Empty |

**Forbidden action types for campaign charter:**
- `klaviyo_campaign_create` — charter must NOT propose direct Klaviyo mutations
- `klaviyo_campaign_send` — forbidden in all versions
- `send_new_message` — campaign requests are replies, not broadcasts
- `mark_read`, `move_message`, `set_categories` — not campaign concerns
- `tool_request` — v0 has no tools bound
- `process_run` — no subprocess execution

### 6.2 Foreman Action Bounding

The `validateCharterOutput` function in `@narada2/control-plane` strips any proposed action not in `invocation.allowed_actions`. Since `campaign_brief` is a **new action type**, it must be added to:

1. `AllowedActionSchema` in `packages/domains/charters/src/runtime/envelope.ts`
2. `OutboundActionType` in `packages/layers/control-plane/src/outbound/types.ts`
3. `payloadValidators` in `packages/layers/control-plane/src/foreman/governance.ts`
4. `isValidTransition` logic in `packages/layers/control-plane/src/outbound/types.ts`

### 6.3 `campaign_brief` Action Type Semantics

`campaign_brief` is a **document-only, non-executable** action type in v0:

- It does not create a Graph draft.
- It does not call Klaviyo.
- It is surfaced in the operator console/CLI for review.
- It has no `sending` or `submitted` state.
- Valid transitions: `pending` → `draft_ready` → `confirmed` (operator marks as reviewed) OR `pending` → `cancelled`.

In v1, `campaign_brief` may be promoted to a `klaviyo_campaign_create` intent after operator policy amendment and explicit approval.

### 6.4 Confidence and Approval Requirements

| Outcome | Required Confidence | Approval Gate |
|---------|---------------------|---------------|
| `campaign_brief` | `high` | Always requires operator approval in v0 |
| `send_reply` (follow-up) | `medium` or `high` | Requires `approved_for_send` |
| `escalation` | Any | No approval; goes to attention queue |

Low confidence for `campaign_brief` → forced escalation.

### 6.5 Private Data Prohibition

The charter must not:
- Reference individual customer email addresses
- Reference customer purchase history or PII
- Assume access to Klaviyo customer lists
- Propose segment membership changes
- Include raw API responses in summaries

---

## 7. Knowledge Injection Pattern

### 7.1 Configuration Binding

In the Site `config.json`, the campaign mailbox binding declares knowledge sources:

```json
{
  "mailbox_bindings": {
    "campaign-requests@example.com": {
      "charter_id": "campaign_producer",
      "knowledge_sources": {
        "campaign_producer": [
          { "type": "local_path", "path": "knowledge/campaign-naming-conventions.md", "kind": "policy" },
          { "type": "local_path", "path": "knowledge/brand-voice-guidelines.md", "kind": "policy" },
          { "type": "local_path", "path": "knowledge/segment-definitions.md", "kind": "reference" },
          { "type": "local_path", "path": "knowledge/timing-constraints.md", "kind": "policy" },
          { "type": "local_path", "path": "knowledge/campaign-templates.md", "kind": "example" }
        ]
      },
      "charter_tools": {
        "campaign_producer": []
      }
    }
  }
}
```

### 7.2 Materializer Loading

The `CampaignRequestContextMaterializer` (to be implemented in Task 391) performs:

1. Reads thread messages from `FileMessageStore`.
2. Extracts campaign fields via simple keyword matching (v0):
   - `requested_campaign_name`: scan subject + body for quoted strings after "campaign" or "named"
   - `requested_timing`: scan for date phrases ("by Friday", "next week", "March 15")
   - `mentioned_segments`: scan for segment names from `segment-definitions.md`
3. Loads knowledge sources from the configured paths.
4. Reads prior evaluations for this context from coordinator SQLite.
5. Assembles `CampaignRequestContextMaterialization`.

### 7.3 Prompt Injection

The charter prompt template (private ops repo) formats knowledge sources as:

```
## Campaign Naming Conventions
{knowledge_sources["campaign-naming-conventions"].content}

## Brand Voice Guidelines
{knowledge_sources["brand-voice-guidelines"].content}

## Segment Definitions
{knowledge_sources["segment-definitions"].content}

## Timing Constraints
{knowledge_sources["timing-constraints"].content}

## Campaign Templates (Examples)
{knowledge_sources["campaign-templates"].content}
```

Knowledge is injected at the **system prompt level**, not the user prompt. This keeps the campaign request messages clean and the knowledge persistent across evaluations.

---

## 8. Mapping to Existing Contracts

| Contract | How This Specification Relates |
|----------|-------------------------------|
| [`email-marketing-operation-contract.md`](./email-marketing-operation-contract.md) | This spec details §5.4 (Charter Evaluation) and §5.5 (Handoff) |
| [`klaviyo-intent-boundary.md`](./klaviyo-intent-boundary.md) | This spec defines the v0 action types that precede Klaviyo intents; `campaign_brief` is document-only, not a Klaviyo intent |
| Task 388 (Campaign Request Fact Model) | This spec consumes `campaign.request.discovered` facts as input to context materialization |
| Task 390 (Klaviyo Intent Boundary) | This spec does NOT propose Klaviyo intents; the charter is forbidden from doing so |
| Task 391 (Windows Site Real-Cycle Wiring) | This spec defines what the materializer and charter runner must do; Task 391 implements it |
| Task 392 (Operator Console Fit) | This spec defines how `campaign_brief` documents surface for operator review |

---

## 9. v0 / v1 / Deferred Boundaries

| Capability | v0 | v1 | Deferred |
|------------|----|----|----------|
| Charter evaluation | ✅ Produces brief or follow-up | Same | — |
| Knowledge source loading | ✅ `.md` files from local path | Same | — |
| Campaign field extraction | ✅ Simple keyword matching | NLP enhancement | — |
| `campaign_brief` action type | ✅ Document-only | Document-only (operator still reviews) | Auto-approval |
| `send_reply` follow-up | ✅ Via `SendReplyWorker` | Same | — |
| Follow-up counter (≥3) | ✅ Terminal escalation | Same | — |
| Tool binding | ❌ No tools | Read-only Klaviyo tools (`klaviyo_list_read`) | Write tools |
| Klaviyo campaign creation | ❌ Forbidden | `klaviyo_campaign_create` intent after approval | — |
| Klaviyo campaign send | ❌ Forbidden | ❌ Forbidden | Requires policy amendment |
| Segment membership mutation | ❌ Forbidden | ❌ Forbidden | Out of scope |
| Real-time Klaviyo webhooks | ❌ Not used | Polling + webhooks | — |

---

## 10. Closure Checklist

- [x] Charter inputs (`CharterInvocationEnvelope` + `CampaignRequestContextMaterialization`) are specified.
- [x] Charter outputs (`campaign_brief`, `request_info`, `no_action`) are specified with payload schemas.
- [x] Knowledge sources are catalogued with ownership and public/private classification.
- [x] Knowledge injection pattern (config binding → materializer loading → prompt injection) is documented.
- [x] Missing-info escalation path (follow-up → terminal escalation) is documented with authority boundaries.
- [x] Governance rules restrict charter to allowed action types and forbid Klaviyo mutation proposals.
- [x] `campaign_brief` action type semantics (document-only, non-executable) are explicit.
- [x] Confidence and approval requirements are specified.
- [x] Private data prohibition rules are explicit.
- [x] v0/v1/deferred boundary table is complete.
- [x] Mapping to sibling contracts is documented.
