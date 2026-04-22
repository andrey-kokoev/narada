# Email Marketing Operation Boundary Contract

> Defines the boundary, posture, authority rules, and non-goals for Narada's first non-helpdesk Operation: an email-marketing Operation that turns inbound colleague/customer requests into governed Klaviyo campaign work.
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.
>
> This contract governs Tasks 388–393. No email-marketing Operation implementation work may proceed before this contract is referenced.

---

## 1. Operation Meaning

An **Operation** is a user-configured Aim-at-Site binding. The email-marketing Operation is one specific Operation among peers (helpdesk, timer, webhook, process, etc.). It is **not** a generic marketing automation framework, a chatbot, or a direct Klaviyo integration.

The distinction:

| This Operation is | This Operation is not |
|-------------------|----------------------|
| A governed pipeline from inbound mail facts to campaign draft intents | A generic SaaS connector framework |
| A second vertical proving kernel substrate neutrality | The only way to do marketing with Narada |
| Intelligence that drafts; operator that approves | An autonomous campaign sender |
| A Site-local configuration with reusable kernel boundaries | A multi-tenant marketing platform |

**This chapter targets one concrete Operation, not a generic abstraction.**

---

## 2. Aim

> **Turn inbound colleague/customer email requests into governed Klaviyo email campaign work.**

The Aim is pursued at a Windows 11 Site (native or WSL) by:

1. **Watching** a designated mailbox for campaign requests from trusted senders (source-read Cycle step).
2. **Extracting** campaign requirements — name, audience, content, timing — from allowed-sender mail facts (context formation + charter evaluation).
3. **Drafting** either a campaign brief or a follow-up request for missing information (charter evaluation → decision → handoff).
4. **Routing** all Klaviyo mutations through durable intents and operator approval gates (handoff → outbound command → operator review).
5. **Leaving Traces** — evaluations, decisions, execution attempts, operator actions — for audit and attention derivation.

In crystallized vocabulary:

- **Aim**: Turn inbound colleague campaign requests into governed Klaviyo campaign work.
- **Site**: Windows 11 native or WSL, with mailbox source access and optional Klaviyo credential binding.
- **Cycle**: Bounded sync-evaluate-govern-handoff-reconcile pass over the marketing Site.
- **Act**: `campaign_brief` (document-only draft in v0) or `send_reply` (follow-up for missing info).
- **Trace**: Evaluation records, foreman decisions, outbound command states, operator action requests, cycle health.

---

## 3. Scope

### 3.1 In Scope (Tasks 388–393)

| # | Boundary | What it means |
|---|----------|---------------|
| 388 | Campaign Request Fact Model | Canonical facts, source schema, extraction rules for campaign-request mail |
| 389 | Campaign Charter + Knowledge Binding | Charter behavior, knowledge sources, missing-info escalation path |
| 390 | Klaviyo Intent Boundary | Durable intents, forbidden actions, credential seam, observation model |
| 391 | Windows Site Real-Cycle Wiring | What must exist for Windows to run the Operation Cycle end-to-end |
| 392 | Operator Console Fit | How pending drafts, missing credentials, and missing info surface for operator review |
| 393 | Integration Proof | Runnable fixture proving the full pipeline from fact to draft intent |
| 394 | Chapter closure | Review, residuals, CCC posture, next-work recommendations |

### 3.2 Out of Scope

| Boundary | Reason |
|----------|--------|
| **Klaviyo campaign publish or send** | Too high-risk for autonomous execution in v0. Explicitly forbidden. |
| **Customer list / segment mutation** | Private customer data mutation is out of scope for v0. |
| **Generic marketing automation framework** | One vertical first. Abstraction requires evidence from at least one live Operation. |
| **Generic SaaS connector framework** | Klaviyo is one API. Generic connector deferred until a second SaaS vertical exists. |
| **Real-time Klaviyo webhooks** | Polling-only for v0. Webhook push is deferred. |
| **Auto-approval of any campaign draft** | All campaign drafts require explicit operator review in v0. |
| **Live Klaviyo API calls in tests** | v0 uses manual operator entry. Adapter is specified but not implemented. |
| **NLP / ML extraction model** | v0 uses simple keyword matching. NLP deferred to v1. |
| **Production deployment claim** | Deployment, credential rotation, and operational monitoring remain deferred. |

---

## 4. Authority Table

| Concern | Owner | Allowed | Forbidden |
|---------|-------|---------|-----------|
| **Source** | `HttpSourceAdapter` / Graph delta sync (kernel) | Poll mailbox delta; admit `mail.message.discovered` facts from allowed senders | Skip non-allowed senders silently; do not open work items at source boundary |
| **Fact** | Fact admission transform (new) | Derive `campaign.request.discovered` from allowed-sender mail facts; skip non-campaign mail | Mutate facts after admission; bypass apply-log idempotency |
| **Context** | `CampaignRequestContextFormation` (new) | Group mail facts by `conversation_id` into campaign-request contexts | Open work items directly; create context without fact basis |
| **Work** | `DefaultForemanFacade` (kernel) | Open `work_item` rows from admitted campaign-request contexts | Open work items from non-campaign facts; bypass foreman admission |
| **Evaluation** | Campaign-production charter (new, ops repo) | Propose `campaign_brief` or `send_reply` outcomes; escalate missing info | Propose `klaviyo_campaign_create` or `klaviyo_campaign_send`; reference private customer data |
| **Decision** | `DefaultForemanFacade` (kernel) | Create `foreman_decision` from evaluation; apply policy governance | Auto-approve decisions; bypass policy binding |
| **Intent** | `OutboundHandoff` (kernel) | Create `outbound_handoff` / `outbound_command` from decision | Create command without decision; insert directly via SQL |
| **Execution** | Outbound workers (`SendReplyWorker`, etc.) | Execute `send_reply` only after `approved_for_send` | Execute `campaign_brief` (document-only in v0); execute without approval; execute Klaviyo mutations |
| **Confirmation** | Reconciliation adapter (kernel + new) | Confirm `send_reply` via observation; v0 has no Klaviyo confirmation | Self-confirm from API success; confirm without observation |
| **Observation** | Operator console / CLI (kernel) | Read-only aggregation of campaign drafts, health, attention queue | Mutate Site state directly; create/approve commands from observation layer |

---

## 5. In-Scope Boundaries (Detailed)

### 5.1 Source

- **Mailbox source**: Microsoft Graph delta sync (or IMAP polling) configured in Site `config.json`.
- **Sender allowlist**: Only senders on `campaign_request_senders` list are admitted as campaign-request facts.
- **Non-allowed sender mail**: Silently skipped — no fact admission, no work opening.
- **Reuse**: Same `HttpSourceAdapter` and Graph sync as helpdesk vertical. Different config, same code.

### 5.2 Fact Admission

- **Primary fact**: `mail.message.discovered` — standard mail fact envelope, reused from helpdesk vertical.
- **Derived fact**: `campaign.request.discovered` (optional enrichment) — extracted fields: `sender_email`, `subject`, `body_text`, `requested_campaign_name`, `requested_timing`, `mentioned_segments`.
- **Admission rule**: Sender must be on allowlist. Non-campaign mail from allowed senders is admitted as `mail.message.discovered` but not promoted to `campaign.request.discovered`.

### 5.3 Context Formation

- **Strategy**: `CampaignRequestContextFormation` — groups mail facts by `conversation_id` (thread).
- **Context identity**: One campaign-request thread = one `context_id`.
- **Work opening**: One `work_item` per open context with no existing non-terminal work item.
- **Reuse**: Same `context_records` / `work_items` schema as helpdesk. Different formation strategy.

### 5.4 Charter Evaluation

- **Charter**: `campaign-production` charter (resides in ops repo, not public Narada packages).
- **Inputs**: `CharterInvocationEnvelope` containing campaign-request context facts.
- **Outputs**:
  - `campaign_brief` — structured brief with name, audience, content_summary, timing, approval_needed.
  - `request_info` — list of missing fields + draft follow-up email.
  - `no_action` — not a campaign request (residual).
- **Governance**: Charter may only propose `campaign_brief` or `send_reply`. No other action types.

### 5.5 Handoff

- **Allowed action types**: `campaign_brief` (document-only in v0), `send_reply`.
- **Action type semantics**:
  - `campaign_brief`: Non-executable document. Operator reviews and manually enters into Klaviyo UI.
  - `send_reply`: Executable email. Requires operator approval before sending.
- **Reuse**: Same `OutboundHandoff.createCommandFromDecision()` as helpdesk. New action type payload.

### 5.6 Effect Execution

- **v0 allowed effects**: `send_reply` only.
- **v0 forbidden effects**: All Klaviyo mutations (`klaviyo_campaign_create`, `klaviyo_campaign_update`, `klaviyo_campaign_send`, `klaviyo_list_update`).
- **v1 deferred effects**: `klaviyo_campaign_create`, `klaviyo_campaign_read`, `klaviyo_list_read`.
- **Approval gate**: `approved_for_send` required for `send_reply`. `campaign_brief` is never executed — it is surfaced for operator review.

### 5.7 Reconciliation

- **v0**: No Klaviyo reconciliation needed (no Klaviyo mutations executed).
- **v0 for `send_reply`**: Same reconciliation path as helpdesk vertical — `GraphLiveObservationAdapter` confirms sent items.
- **v1**: `KlaviyoObservationAdapter` polls for campaign state confirmations.

---

## 6. Out-of-Scope Boundaries (Detailed)

### 6.1 Klaviyo Publish/Send

**Explicitly forbidden in v0.** All campaign drafts require operator review. The operator manually enters approved briefs into Klaviyo UI. Autonomous publish or send is never allowed without explicit operator policy.

### 6.2 Customer List/Segment Mutation

**Explicitly forbidden in v0.** Modifying list or segment membership is customer data mutation. This is out of scope for all versions unless separately approved by operator policy.

### 6.3 Generic Frameworks

**Explicitly deferred.** No generic "marketing automation framework," "SaaS connector framework," or "Site core extraction" may be introduced during this chapter. These require evidence from at least two live verticals before abstraction is justified.

### 6.4 Real-Time Webhooks

**Explicitly deferred.** Polling-only for v0. Real-time webhook push from Klaviyo is deferred to v1 or later.

### 6.5 Auto-Approval

**Explicitly forbidden in v0.** All campaign drafts require explicit operator review. No auto-approval path exists.

---

## 7. Public/Private Data Boundary

| Concern | Location | Rationale |
|---------|----------|-----------|
| Kernel, control plane, CLI, Site substrates | Public `narada` monorepo | Core runtime and substrate machinery |
| Generic charter runtime, adapter interfaces | Public `narada` monorepo | Reusable runtime and interface definitions |
| Klaviyo adapter seam (interface + mock) | Public `narada` monorepo | Minimal, mockable boundary for v1 expansion |
| `campaign_brief` action type definition | Public `narada` monorepo | New outbound action type; v0 is non-executable |
| Operation specification (sources, charters, policy) | Private ops repo | Operation-specific configuration, not kernel code |
| Brand voice knowledge, campaign templates | Private ops repo | Proprietary brand data |
| Segment definitions, list IDs | Private ops repo | Customer-related metadata; no customer records in public code |
| Klaviyo API credentials | Private ops repo / env bindings | Secrets must never be in public repositories |
| Campaign charter prompt materialization | Private ops repo | Prompts contain brand-specific instructions |
| Inbound mail content | Site-local SQLite | Raw mail data stays in Site coordinator; never in public packages |

**Rule:** Public Narada packages may reference `campaign_brief` and `send_reply` action types. They must never contain brand names, segment definitions, customer data, or Klaviyo credentials.

---

## 8. Windows 11 v0 Requirements

| Requirement | v0 Delivery | v1 Enhancement |
|-------------|-------------|----------------|
| Site root + credential binding | Windows Credential Manager / env | Credential rotation automation |
| Scheduled Cycle execution | Task Scheduler (native) / systemd (WSL) | Windows Service wrapper |
| Mailbox source access | Graph API delta sync | IMAP fallback; webhook push |
| Klaviyo API credential access | Env binding | Credential Manager integration |
| Operator console / CLI inspection | `narada ops`, `narada status --site` | Web dashboard |
| Campaign brief draft review | CLI `narada show-draft` | In-app review |
| Direct Klaviyo campaign creation | ❌ v1 only | Durable intent + observation |
| Campaign send/publish | ❌ Forbidden in v0 | Requires explicit operator policy |

---

## 9. No-Overclaim Language Guide

Agents and documentation for this Operation must avoid these overloaded phrases:

| Avoid | Prefer |
|-------|--------|
| "Klaviyo operation" | "email-marketing Operation with Klaviyo as the target platform" |
| "marketing automation" | "governed campaign draft pipeline" |
| "autonomous campaign creation" | "charter-proposed campaign brief requiring operator review" |
| "send the campaign" | "draft the campaign brief" (v0) or "create the campaign in Klaviyo" (v1, with approval) |
| "Narada sends email campaigns" | "Narada drafts campaign briefs; the operator approves and publishes" |
| "generic connector" | "Klaviyo adapter seam" (specific, minimal, mockable) |
| "operation deploys operation" | "an Aim creates or materializes an Aim-at-Site binding" |
| "running the marketing operation" (when you mean the process) | "running a Cycle" or "advancing the email-marketing Aim at a Site" |

**Rule:** If a sentence makes Narada sound like it sends campaigns autonomously, rewrite it. Intelligence drafts. Human operator approves. Human operator manually enters approved briefs into Klaviyo in v0.

---

## 10. Mapping to AGENTS.md Invariants

| AGENTS.md Invariant | Email Marketing Operation Preservation |
|---------------------|----------------------------------------|
| 1. No loss after commit | Same as helpdesk — cursor commit follows apply-log |
| 2. Replay safety | Same `apply_log` idempotency boundary |
| 3. Determinism | Same normalization rules; new context formation is deterministic |
| 4. Idempotency boundary | Same `event_id` → `apply_log` enforcement |
| 5. Apply ordering | Same `apply(e)` → `mark_applied(e)` → `cursor_commit` |
| 6. Foreman owns work opening | `DefaultForemanFacade.onContextsAdmitted()` opens work items from campaign contexts |
| 6a. Re-derivation is explicit and bounded | Same rule — no automatic replay on daemon startup |
| 6b. No admission side effect in replay | Same rule — replay does not mark facts as admitted |
| 7. Foreman owns evaluation resolution | `DefaultForemanFacade.resolveWorkItem()` transitions campaign work items |
| 8. Foreman owns failure classification | `DefaultForemanFacade.failWorkItem()` classifies missing-info retry vs. terminal |
| 9. Scheduler owns leases | Same `SqliteScheduler` for campaign work items |
| 10. IntentHandoff owns intent creation | Same `IntentHandoff.admitIntentFromDecision()` |
| 11. OutboundHandoff owns command creation | Same `OutboundHandoff.createCommandFromDecision()`; new `campaign_brief` action type |
| 12. Outbound workers own mutation | `SendReplyWorker` executes `send_reply`. No worker executes `campaign_brief` in v0. |
| 13. Charter runtime is read-only sandbox | Campaign charter reads envelope, produces output envelope. No direct store writes. |
| 14. Work object authority | Same — at most one non-terminal work item per context |
| 15. Lease uniqueness | Same — at most one unreleased, unexpired lease per work item |
| 16. Bounded evaluation | Same frozen `CharterInvocationEnvelope` with immutable capability envelope |
| 17. Decision before command | Same append-only `foreman_decision`; one decision produces at most one command |
| 18. Authority class enforcement | Campaign charter bound to `derive` and `propose` only. No `claim`, `execute`, `resolve`, or `confirm` without runtime authorization. |
| 23. No mailbox leakage into generic observation | `campaign_brief` surfaced as generic `outbound_command` with `actionType`. No mail-specific columns in generic types. |
| 27. Neutral tables are kernel substrate | `context_records`, `context_revisions`, `outbound_handoffs` are canonical base tables. Mailbox-era views are compatibility-only. |
| 31. Draft-first delivery | `campaign_brief` is a draft document. `send_reply` creates Graph draft before send. |
| 32. Two-stage completion | `send_reply`: `submitted` on Graph acceptance, `confirmed` on inbound reconciliation. `campaign_brief`: document-only, no execution stage in v0. |

---

## 11. Reuse Inventory

### 11.1 Existing Components Reused

| Component | Source | Reuse Mode |
|-----------|--------|------------|
| `HttpSourceAdapter` / Graph delta sync | `@narada2/control-plane` | Direct reuse; same adapter, different config (`campaign_request_senders` allowlist) |
| `FileLock` / stuck-cycle recovery | `@narada2/control-plane` | Direct reuse |
| `computeHealthTransition` | `@narada2/control-plane` | Direct reuse |
| `DefaultForemanFacade` | `@narada2/control-plane` | Direct reuse; new policy binding for campaign charter |
| `SqliteScheduler` | `@narada2/control-plane` | Direct reuse for campaign work item leasing |
| `OutboundHandoff` | `@narada2/control-plane` | Direct reuse; new `campaign_brief` action type |
| `SendReplyWorker` | `@narada2/control-plane` | Direct reuse for `send_reply` execution |
| `executeSiteOperatorAction` | Windows Site / CLI | Direct reuse; new action types if needed |
| `executeApprovedCommands` | Cloudflare / Windows | Direct reuse; new Klaviyo adapter boundary in v1 |
| Site Registry / Operator Console | Tasks 378–384 | Direct reuse; new Site entries for marketing Aim |
| `LogNotificationAdapter` / `WebhookNotificationAdapter` | Tasks 340–342, 376 | Direct reuse |
| `SiteRegistry`, `aggregateHealth`, `deriveAttentionQueue` | Tasks 380–381 | Direct reuse |

### 11.2 New Components Required

| Component | Package | Responsibility |
|-----------|---------|----------------|
| `CampaignRequestContextFormation` | `@narada2/control-plane` | Groups mail facts into campaign-request contexts |
| `campaign-production` charter | Ops repo | Extracts campaign requirements; proposes brief or follow-up |
| `KlaviyoCampaignAdapter` seam | `@narada2/control-plane` (minimal) | Mockable boundary for campaign create/update/read (v1) |
| `KlaviyoObservationAdapter` | `@narada2/control-plane` (minimal) | Polls Klaviyo for campaign state confirmations (v1) |
| `campaign_brief` action type | `@narada2/control-plane` | New outbound action type; v0 is non-executable (document-only) |

### 11.3 Deferrals

| Surface | Deferred To | Reason |
|---------|-------------|--------|
| `KlaviyoEffectAdapter` implementation | v1 | v0 uses manual operator entry. Adapter specified in Task 390 but not built. |
| `KlaviyoObservationAdapter` implementation | v1 | No Klaviyo mutations in v0 means no observation needed. |
| Real-time Klaviyo webhooks | v1+ | Polling-only for v0. Webhooks require infrastructure beyond current scope. |
| NLP/ML extraction model | v1+ | Simple keyword matching sufficient for v0 proof. |
| Multi-Operation Site | Future chapter | One Site per Aim for v0. Running helpdesk + marketing on one Site is future work. |
| Campaign analytics observation | Future chapter | Reading campaign performance back as facts is post-v1. |

---

## 12. Closure Checklist

- [x] Contract document exists at `docs/deployment/email-marketing-operation-contract.md`.
- [x] Aim is stated in crystallized vocabulary (Aim / Site / Cycle / Act / Trace).
- [x] Authority table covers source, fact, context, work, evaluation, decision, intent, execution, confirmation, observation.
- [x] Klaviyo publish/send is explicitly forbidden in v0.
- [x] Public/private data boundary is explicit.
- [x] No-overclaim language guide is included.
- [x] Mapping to AGENTS.md invariants is explicit.
- [x] Reuse inventory and deferrals are documented.
