# Decision: Email Marketing Live Dry Run Readiness & Gap Assessment

**Date:** 2026-04-22
**Task:** 398
**Depends on:** 394 (Email Marketing Operation Closure), 397 (Session Attachment Semantics)
**Verdict:** **Design accepted — chapter tasks 399–405 defined.**

---

## Summary

Tasks 387–394 proved the email-marketing Operation structurally and by fixture. The next chapter (399–405) will drive Narada from fixture-backed proof to one supervised live dry run: a real inbound campaign request from a configured mailbox produces either a governed campaign brief or a missing-info attention item, with no Klaviyo mutation and no campaign send/publish.

This artifact inventories what is proven, what remains unproven, where public Narada ends and private ops repos begin, what live input is acceptable, and what must be impossible.

---

## 1. What Is Already Proven (Tasks 387–394)

| # | Proven Item | Evidence |
|---|-------------|----------|
| 1 | Boundary contract defines Aim, authority, forbidden actions | `docs/deployment/email-marketing-operation-contract.md` |
| 2 | Fact model reuses `mail.message.discovered` with sender-allowlist admission | `docs/deployment/campaign-request-fact-model.md` |
| 3 | Campaign charter behavior, knowledge binding, missing-info escalation | `docs/deployment/campaign-charter-knowledge-binding.md` |
| 4 | Klaviyo intent boundary: forbidden send/publish, v0 has no executable intents | `docs/deployment/klaviyo-intent-boundary.md` |
| 5 | Windows Site can run an 8-step Cycle with lock, health, trace | `packages/sites/windows/src/runner.ts` |
| 6 | Operator console surfaces campaign artifacts through generic queries | `docs/deployment/operator-console-fit.md` |
| 7 | Full pipeline proven end-to-end with real SQLite stores (fixture) | `packages/sites/windows/test/integration/email-marketing-operation.test.ts` (5/5 pass) |
| 8 | Session attachment semantics for operator/agent interaction | `.ai/decisions/20260422-397-session-attachment-semantics.md` |

**What "proven" means here:** The schema, boundaries, and authority invariants are correct. The integration fixture demonstrates that facts → context → work item → evaluation → decision → outbound command flows through real SQLite tables without error.

**What "proven" does NOT mean:** No real Graph API call has been made. No real charter has evaluated a real email. No real Windows Cycle has run steps 2–6 with live handlers. The fixture simulates steps 2–5 with direct SQL inserts.

---

## 2. What Remains Unproven for Live Dry-Run Usefulness

| # | Unproven Item | Why It Blocks Live Dry Run |
|---|---------------|---------------------------|
| 1 | **Windows Cycle steps 2–6 are fixture stubs** | A live dry run requires real sync, derive, evaluate, and handoff. The fixture bypasses these with SQL inserts. |
| 2 | **`campaign_brief` action type not in runtime enums** | `AllowedActionSchema`, `OutboundActionType`, payload validators, and transition logic do not yet know `campaign_brief`. The fixture uses direct SQL to insert it. |
| 3 | **`CampaignRequestContextFormation` not implemented** | No code exists to read `mail.message.discovered` facts, check sender allowlists, extract campaign fields, and group by thread into campaign contexts. |
| 4 | **No real charter runtime on Windows** | `SandboxEvaluateStepHandler` exists in Cloudflare package only. Windows has no sandboxed charter execution. A mock or inline runner may suffice for the dry run. |
| 5 | **No private knowledge sources bound** | The 5 knowledge files (naming conventions, brand voice, segments, timing, templates) are specified but do not exist. They belong in a private ops repo. |
| 6 | **No real mailbox source bound to a Windows Site** | A Site config with real Graph API credentials and a designated mailbox has not been created. |
| 7 | **No `send_reply` effect worker on Windows** | If the dry run produces a missing-info follow-up, there is no Windows worker to create the Graph draft. Cloudflare has this; Windows does not. |
| 8 | **Operator has not inspected a live-produced artifact** | The console can theoretically surface `campaign_brief`, but no operator has seen one produced from real mail. |

---

## 3. Public/Private Artifact Boundary

| Artifact | Belongs In | Reason |
|----------|-----------|--------|
| Kernel enum updates (`campaign_brief` in `AllowedActionSchema`, `OutboundActionType`) | **Public Narada** | Kernel substrate change; all verticals benefit. |
| `CampaignRequestContextFormation` implementation | **Public Narada** | Context materializer is kernel code; vertical-neutral pattern reusable for other request types. |
| Windows step handler ports (sync, derive, evaluate, handoff) | **Public Narada** | Site substrate code; reusable across verticals on Windows. |
| `KlaviyoEffectAdapter` interface + error classification | **Public Narada** | Intent boundary contract; already public. |
| Site config schema (`campaign_request_senders`, `knowledge_sources`) | **Public Narada** | Config schema is public; specific values are private. |
| Campaign-production charter prompt template | **Public Narada** | The template shape and injection pattern are public; brand-specific content is private. |
| **Brand voice guidelines** | **Private ops repo** | Contains customer-facing tone, examples, and proprietary language. |
| **Segment definitions** | **Private ops repo** | Contains internal audience taxonomy and business rules. |
| **Campaign templates** | **Private ops repo** | Contains proprietary HTML/copy skeletons. |
| **Naming conventions** | **Private ops repo** | Contains internal campaign naming rules. |
| **Timing constraints** | **Private ops repo** | Contains business calendar and send-time rules. |
| **Graph API credentials** | **Private ops repo / secure storage** | `GRAPH_ACCESS_TOKEN`, `GRAPH_TENANT_ID`, etc. Never in public repo. |
| **Klaviyo API credentials** | **Private ops repo / secure storage** | `KLAVIYO_API_KEY`. v0 does not resolve them; v1 will. |
| **Site root directory** (`config.json`, `coordinator.db`) | **Private ops repo / local filesystem** | Per-Site state; never committed to public Narada. |
| Dry run execution trace | **Private ops repo** | Contains real mail snippets, sender addresses, and extracted fields. |

**Hard rule:** No private brand data, customer data, or credentials may be committed to the public Narada repository. The public repo contains only generic schemas, interfaces, and substrate code.

---

## 4. Exact Live Input Acceptable for the First Run

### 4.1 Source Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| **Mailbox** | One designated mailbox (e.g., `marketing@example.com`) | Single source of truth for campaign requests. |
| **Sender allowlist** | Pre-configured in `config.json` `campaign_request_senders` | Only trusted colleagues may trigger campaign work. |
| **Thread selection** | One specific thread, identified by `conversation_id` or `subject` prefix | Bounded input; no unbounded inbox sweep. |
| **Message age** | ≤ 7 days old | Fresh enough that context is relevant; old mail is archival. |
| **Content type** | Plain-text or HTML email with clear campaign intent | Avoids edge cases (attachments, encrypted mail, newsletters). |

### 4.2 Controlled Input Shape

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

### 4.3 What the Dry Run Must NOT Process

- Mail from non-allowed senders (silently skipped per Task 388)
- Newsletter subscriptions, automated alerts, or spam
- Attachments or embedded images
- Multi-thread campaign requests (v0 handles one thread at a time)
- Historical mail older than the lookback window

---

## 5. What Must Be Observable After the Run

| Observable | How It Is Observed |
|------------|-------------------|
| **Work item opened** | `narada status --site <site-id>` shows `work_items` count increased |
| **Context record created** | `context_records` table has new row with `primary_charter: "campaign_producer"` |
| **Evaluation produced** | `evaluations` table has row with `outcome` and `proposed_actions_json` |
| **Decision recorded** | `foreman_decisions` table has row with `approved_action: "campaign_brief"` or `"send_reply"` |
| **Outbound command created** | `outbound_handoffs` + `outbound_versions` have new row with payload |
| **Campaign brief payload** | `narada show-draft <outbound-id>` displays structured brief JSON |
| **Missing-info attention** | `narada ops` attention queue shows `stuck_work_item` or `pending_outbound_command` if follow-up was drafted |
| **Cycle trace** | `cycle_traces` table has row showing steps executed and duration |
| **Health status** | `site_health` shows `healthy` or `degraded` (not `critical`) |

---

## 6. What Must Be Impossible in the Run

| Prohibition | Enforcement |
|-------------|-------------|
| **Klaviyo campaign create** | `KlaviyoEffectAdapter` is not implemented; no worker calls Klaviyo API |
| **Klaviyo campaign send/publish** | Forbidden in all versions per Task 390. No intent type exists for it. |
| **Klaviyo list/segment mutation** | Forbidden in all versions. No intent type exists for it. |
| **Auto-approval of campaign brief** | `campaign_brief` is excluded from `approve-draft-for-send`. Operator must manually review. |
| **Unbounded mailbox sweep** | `config.json` specifies `campaign_request_senders` and lookback window. Non-allowed mail is silently skipped. |
| **Graph draft send without approval** | `send_reply` outbounds are `draft_ready`; operator must approve before worker sends. |
| **Customer data exposure in public repo** | Private ops repo boundary; no PII in public Narada. |
| **Real credential commit** | Credentials resolved from secure storage or `.env`; never in source control. |

---

## 7. Session/Attachment Semantics (Task 397)

The live dry run does not require full `SiteAttachment` implementation. However, the following vocabulary applies:

- **Operator `attach` to Site:** The operator runs `narada site attach <site-id>` (deferred CLI surface) or simply invokes `narada cycle --site <site-id>` from a shell. The shell session is transient; the Site persists independently.
- **Detach without death:** The operator may close their terminal or disconnect. The Windows Cycle continues if already running, or resumes on next Task Scheduler/systemd invocation. No work is lost.
- **Resume context:** When the operator reconnects, they run `narada ops` or `narada status --site <site-id>` to project current state from durable records. No session log replay is needed.
- **Budget-exhausted handoff:** If a charter evaluation hits a token/time ceiling, the work item becomes `failed_retryable` or `idle`. The next Cycle picks it up. No agent attachment state is required.

**Rule:** The dry run must not introduce a second attachment model or treat the operator's shell session as authority.

---

## 8. Gap Resolution Plan (Tasks 399–405)

| Task | Gap Addressed |
|------|---------------|
| 399 | Defines exact dry-run boundary, input selection criteria, and success criteria |
| 400 | Ports real sync, derive, evaluate, handoff step handlers from Cloudflare to Windows |
| 401 | Adds `campaign_brief` to runtime enums; implements `CampaignRequestContextFormation` |
| 402 | Creates private ops repo structure, config template, and knowledge source binding |
| 403 | Selects one controlled mailbox thread; binds real Graph API source; executes one Cycle |
| 404 | Operator inspects output; proves no Klaviyo mutation; documents observed behavior |
| 405 | Chapter closure: semantic drift check, gap table, CCC posture, next-work recommendations |

---

## 9. CCC Posture Table

| Coordinate | Evidenced State Now | Projected State If Chapter Verifies | Pressure Path | Evidence Required |
|------------|---------------------|-------------------------------------|---------------|-------------------|
| semantic_resolution | `0` | `0` | Tasks 399, 405 | No new semantics introduced; all terms grounded in SEMANTICS.md §2.14 and Task 397 vocabulary |
| invariant_preservation | `0` | `0` | Tasks 400–401 | Authority boundaries hold: intent-first, no auto-approval, no Klaviyo send. Integration tests assert this. |
| constructive_executability | `+1` (fixture) | `+1` (live) | Tasks 400–403 | Real Cycle runs with real step handlers on Windows; real mailbox source produces real work item |
| grounded_universalization | `+1` (fixture) | `+1` (live) | Tasks 400–401 | Second vertical proven on live Windows substrate, not just fixture. Reuse inventory updated. |
| authority_reviewability | `+1` (fixture) | `+1` (live) | Tasks 399, 404 | Operator inspects live-produced draft; no-effect proof documented; no hidden authority introduced |
| teleological_pressure | `+1 bounded` (fixture) | `+1 bounded` (live dry run) | Tasks 402–404 | Live dry run closes the "does it work with real mail?" question, but full Klaviyo loop remains deferred to v1 |

**Note:** `constructive_executability` does not increase from `+1` to `+2` because the chapter moves from "fixture-proven" to "live-proven" within the same coordinate. The qualitative shift is from simulated to real, not from non-existent to demonstrated.

---

## 10. Deferred Capabilities (Explicitly Outside This Chapter)

| Deferred Capability | Why Deferred |
|---------------------|--------------|
| **Klaviyo API adapter implementation** | v1 work. v0 proves the intent boundary without executing it. |
| **Real Klaviyo campaign create from brief** | Requires adapter + credential binding + reconciliation. v1. |
| **Campaign send/publish** | Forbidden in all versions without explicit policy amendment. |
| **Multi-mailbox / multi-Site marketing** | One Site, one mailbox for v0 dry run. |
| **NLP/ML extraction** | v0 uses simple keyword matching. NLP deferred to v1. |
| **Campaign analytics / performance observation** | Reading campaign metrics back as facts is post-v1. |
| **Cloudflare Site marketing Operation** | Cloudflare Sites deferred across all verticals. |
| **Generic SaaS connector framework** | Premature abstraction. No second SaaS vertical exists. |
| **Agent roster → Site attachment integration** | Task 397 defines vocabulary; integration is future work. |
