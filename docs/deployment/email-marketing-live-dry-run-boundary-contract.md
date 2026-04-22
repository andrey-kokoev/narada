# Email Marketing Live Dry Run Boundary Contract

> Defines the exact boundary, input selection criteria, success criteria, and public/private artifact split for the email-marketing live dry run.
>
> This contract is the output of **Task 399**. All subsequent tasks (400–405) must reference it. No live dry-run execution may proceed before this contract is agreed.
>
> Uses crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.
> Uses session/attachment vocabulary from [`.ai/decisions/20260422-397-session-attachment-semantics.md`](../../.ai/decisions/20260422-397-session-attachment-semantics.md).

---

## 1. Success Criterion (One Sentence)

> **One allowed-sender email to the designated mailbox is synced, evaluated, and produces either a `campaign_brief` outbound command or a `send_reply` missing-info follow-up, with no Klaviyo API call and no campaign send/publish.**

If the dry run meets this criterion, the chapter succeeds. If it fails, the gap is documented and becomes the next task.

---

## 2. Input Selection Criteria

### 2.1 Source Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| **Mailbox** | One designated mailbox, configured in Site `config.json` | Single source of truth for campaign requests |
| **Sender allowlist** | Pre-configured array `campaign_request_senders` in Site `config.json` | Only trusted colleagues may trigger campaign work |
| **Thread selection** | One specific thread, identified by `conversation_id` or `subject` prefix | Bounded input; no unbounded inbox sweep |
| **Message age** | ≤ 7 days old | Fresh enough that context is relevant; old mail is archival |
| **Content type** | Plain-text or HTML email with clear campaign intent | Avoids edge cases (attachments, encrypted mail, newsletters) |

### 2.2 Controlled Input Shape

The ideal first live input is an email like:

```
From: colleague@example.com (on allowlist)
To: marketing@example.com
Subject: Campaign request: Spring Launch

Hi team,

Can we run a campaign for the spring product launch?
Target audience: VIP segment
Timing: Next Tuesday
Content: Use the spring template

Thanks!
```

This email should produce either:
- A `campaign_brief` with `name: "Spring Launch"`, `audience: "VIP segment"`, `timing: "next Tuesday"`
- A `send_reply` asking for missing info (if the charter needs more detail)

### 2.3 What the Dry Run Must NOT Process

| Exclusion | Enforcement |
|-----------|-------------|
| Mail from non-allowed senders | Silently skipped per Task 388 fact model |
| Newsletter subscriptions, automated alerts, or spam | No `campaign.request.discovered` enrichment; no work opened |
| Attachments or embedded images | Stripped during normalization; not part of extraction |
| Multi-thread campaign requests (v0) | One thread at a time; additional threads get separate contexts |
| Historical mail older than the lookback window | Cursor + apply-log idempotency ensures only recent mail is considered |

### 2.4 Lookback Window

- **Sync cursor:** The Windows Site Graph delta sync uses the existing cursor mechanism. Only mail newer than the last cursor position is fetched.
- **Bounded safety:** Even if the cursor is stale, the `campaign_request_senders` filter and the 7-day message-age gate prevent unbounded processing.
- **No reprocessing:** The apply-log (`apply_log` table) ensures the same mail fact is never admitted twice.

---

## 3. Public/Private Artifact Boundary

### 3.1 What Stays in Public Narada

| Artifact | Location | Reason |
|----------|----------|--------|
| Kernel enum updates (`campaign_brief` in `AllowedActionSchema`, `OutboundActionType`) | `@narada2/control-plane` | Kernel substrate change; all verticals benefit |
| `CampaignRequestContextFormation` implementation | `@narada2/control-plane` | Context materializer is kernel code; vertical-neutral pattern |
| Windows step handler ports (sync, derive, evaluate, handoff) | `@narada2/windows-site` | Site substrate code; reusable across verticals on Windows |
| `KlaviyoEffectAdapter` interface + error classification | `@narada2/control-plane` | Intent boundary contract; already public |
| Site config schema (`campaign_request_senders`, `knowledge_sources`) | `@narada2/control-plane` | Config schema is public; specific values are private |
| Campaign-production charter prompt template shape | `@narada2/control-plane` | Template shape and injection pattern are public |
| Dry run boundary contract (this document) | `docs/deployment/` | Public governance document |

### 3.2 What Belongs in the Private Ops Repo

| Artifact | Location | Reason |
|----------|----------|--------|
| **Brand voice guidelines** | Private ops repo | Contains customer-facing tone, examples, and proprietary language |
| **Segment definitions** | Private ops repo | Contains internal audience taxonomy and business rules |
| **Campaign templates** | Private ops repo | Contains proprietary HTML/copy skeletons |
| **Naming conventions** | Private ops repo | Contains internal campaign naming rules |
| **Timing constraints** | Private ops repo | Contains business calendar and send-time rules |
| **Graph API credentials** | Private ops repo / secure storage | `GRAPH_ACCESS_TOKEN`, `GRAPH_TENANT_ID`, etc. Never in public repo |
| **Klaviyo API credentials** | Private ops repo / secure storage | `KLAVIYO_API_KEY`. v0 does not resolve them; v1 will |
| **Site root directory** (`config.json`, `coordinator.db`) | Private ops repo / local filesystem | Per-Site state; never committed to public Narada |
| **Dry run execution trace** | Private ops repo | Contains real mail snippets, sender addresses, and extracted fields |

### 3.3 Hard Rule

> **No private brand data, customer data, or credentials may be committed to the public Narada repository.** The public repo contains only generic schemas, interfaces, and substrate code.

---

## 4. No-Effect Proof Criteria

The dry run must be **provably safe**: even if something goes wrong, no external mutation occurs.

### 4.1 What Must Be Impossible

| Prohibition | Enforcement Mechanism | Observable Proof |
|-------------|----------------------|------------------|
| **Klaviyo campaign create** | `KlaviyoEffectAdapter` is not implemented; no worker calls Klaviyo API | `outbound_handoffs` contains zero rows with `action_type` starting with `klaviyo_` |
| **Klaviyo campaign send/publish** | Forbidden in all versions per Task 390. No intent type exists for it. | Same as above |
| **Klaviyo list/segment mutation** | Forbidden in all versions. No intent type exists for it. | Same as above |
| **Auto-approval of campaign brief** | `campaign_brief` is excluded from `approve-draft-for-send`. | `outbound_handoffs.status` is `draft_ready`, not `approved_for_send` |
| **Graph draft send without approval** | `send_reply` outbounds are `draft_ready`; operator must approve before worker sends. | `approved_at` is null on all `send_reply` outbounds unless operator explicitly approves |
| **Unbounded mailbox sweep** | `config.json` specifies `campaign_request_senders` and lookback window. | Sync cursor + apply-log limit reprocessing; only allowed-sender mail is admitted |
| **Customer data exposure in public repo** | Private ops repo boundary; no PII in public Narada. | Git status of public repo shows no new files containing sender addresses or credentials |

### 4.2 Operator Inspection Commands

After the dry run, the operator must be able to run these commands and see evidence:

```bash
# 1. Verify work item was opened
narada status --site <site-id>
# Expected: work_items count increased by 1

# 2. Verify context was created with campaign_producer charter
narada show-context <context-id> --site <site-id>
# Expected: primary_charter = "campaign_producer"

# 3. Verify evaluation was produced
narada show-evaluation <evaluation-id> --site <site-id>
# Expected: outcome = "complete" or "clarification_needed"

# 4. Verify outbound command exists
narada show-draft <outbound-id>
# Expected: action_type = "campaign_brief" or "send_reply"

# 5. Verify no Klaviyo actions exist
narada ops --site <site-id>
# Expected: attention queue contains no "credential_required" for Klaviyo
#          outbound commands contain no action_type starting with "klaviyo_"

# 6. Verify Cycle trace was recorded
narada status --site <site-id> --trace
# Expected: cycle_traces shows steps executed and duration
```

### 4.3 Attention Items If Something Goes Wrong

| Failure Mode | Attention Item Type | How It Surfaces |
|--------------|---------------------|-----------------|
| Graph API credential missing or invalid | `credential_required` | `site_health.status = "auth_failed"`; attention queue shows missing credential |
| Sender not on allowlist | (none) | Mail silently skipped; no work opened; logged in sync trace |
| Charter evaluation fails | `stuck_work_item` | `work_item.status = "failed_retryable"` or `"failed_terminal"`; attention queue shows error |
| Context formation produces no campaign fields | `pending_outbound_command` | Charter produces `send_reply` asking for missing info |
| Mailbox source unreachable | `critical_health` | `site_health.status = "critical"`; attention queue shows sync failure |

---

## 5. Session/Attachment Semantics for the Dry Run

The live dry run uses Task 397 session/attachment vocabulary with the following simplified posture:

### 5.1 Operator Interaction Model

| Concept | Dry-Run Posture |
|---------|-----------------|
| **Attach** | Operator invokes `narada cycle --site <site-id>` from a shell. No persistent `SiteAttachment` record is created for v0. |
| **Detach** | Operator closes terminal or presses Ctrl-C. The Cycle continues if already running; if not, the next Task Scheduler invocation resumes. |
| **Resume** | Operator runs `narada status --site <site-id>` to project current state from durable records. No session log replay. |
| **Interaction mode** | `observe` only for v0. The operator does not issue control requests during the dry run; they inspect results after the Cycle completes. |

### 5.2 No Second Attachment Model

The dry run must not invent a second attachment model. Specifically:
- No `SiteAttachment` table is required for v0.
- No `narada site attach` command is invoked.
- No heartbeat or staleness detection runs.
- The operator's shell session is **transient** and carries **no authority**.

### 5.3 Budget and Safety

| Safeguard | Implementation |
|-----------|---------------|
| **Cycle ceiling** | 5-minute default ceiling with abort buffer. Cycle cannot run indefinitely. |
| **Lock TTL** | FileLock TTL ensures stale locks are recovered if the operator's session crashes mid-Cycle. |
| **No auto-retry on failure** | If the Cycle fails, the operator must explicitly re-run `narada cycle --site`. No automatic retry loop. |
| **Dry-run flag** | The Site config may include `dry_run: true` to explicitly mark this Site as non-executing (no effect workers run). |

---

## 6. Rollback and Recovery

If the dry run produces unexpected results, the operator must be able to clean up without affecting the Site's core state:

| Cleanup Action | Effect |
|----------------|--------|
| Delete `campaign_brief` outbound command | Removes the draft from operator view. Does not affect mail facts or context records. |
| Mark work item as `handled_externally` | Closes the work item without executing. Context remains for audit. |
| Reset sync cursor | Forces re-sync from a known point. Apply-log prevents duplicate fact admission. |
| Delete execution trace | `cycle_traces` row is advisory. Deleting it does not affect durable state. |

**Hard invariant:** No cleanup action may delete facts from the fact store or mutate the apply-log. Facts are append-only.

---

## 7. Mapping to AGENTS.md Invariants

| Invariant | Dry-Run Preservation |
|-----------|----------------------|
| 1. No loss after commit | Sync cursor commits only after apply-log marks facts applied |
| 2. Replay safety | Same `apply_log` idempotency boundary |
| 3. Determinism | Same normalization rules; context formation is deterministic for given input |
| 6. Foreman owns work opening | `DefaultForemanFacade.onContextsAdmitted()` opens work items from campaign contexts |
| 11. OutboundHandoff owns command creation | `OutboundHandoff.createCommandFromDecision()` creates `campaign_brief` or `send_reply` outbounds |
| 12. Outbound workers own mutation | No worker executes `campaign_brief` in v0. `send_reply` requires operator approval before execution. |
| 32. Draft-first delivery | `campaign_brief` is a draft document. `send_reply` creates Graph draft before send. |
| 33. Two-Stage Completion | `send_reply`: `submitted` on Graph acceptance, `confirmed` on inbound reconciliation. `campaign_brief`: document-only, no execution stage in v0. |
| 34. No External Draft Mutation | Only the outbound worker may create or mutate managed drafts. No charter or console code creates drafts directly. |

---

## 8. Closure Checklist

- [x] One-sentence success criterion exists and is unambiguous.
- [x] Input selection criteria are bounded (one mailbox, one thread, allowed sender, 7-day lookback).
- [x] Public/private artifact boundary is explicit with examples.
- [x] No-effect proof criteria are defined with enforcement mechanisms and observable proofs.
- [x] Operator inspection commands are listed with expected outputs.
- [x] Session/attachment semantics use Task 397 vocabulary; no second attachment model is invented.
- [x] Rollback and recovery paths are documented.
- [x] Mapping to AGENTS.md invariants is explicit.
- [x] No secret material in public documentation.
