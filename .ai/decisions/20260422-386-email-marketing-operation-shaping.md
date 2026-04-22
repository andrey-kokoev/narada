# Decision: Email Marketing Operation — Chapter Shaping

**Date:** 2026-04-22  
**Task:** 386  
**Chapter:** 387–394  
**Verdict:** **Shaped — accepted for execution.**

---

## 1. Aim

> Turn inbound colleague/customer email requests into governed Klaviyo email campaign work.

The Aim is pursued at a Windows 11 Site (native or WSL) by:
1. Watching a designated mailbox for campaign requests from trusted senders.
2. Extracting campaign requirements (name, audience, content, timing).
3. Drafting either a campaign brief or a follow-up request for missing info.
4. Routing all Klaviyo mutations through durable intents and operator approval gates.

---

## 2. Source Facts

| Fact Type | Source | Payload Shape | Context Formation |
|-----------|--------|---------------|-------------------|
| `mail.message.discovered` | Microsoft Graph delta sync (or IMAP polling) | Standard mail fact envelope | Group by `conversation_id` into `context_id` |
| `mail.sender.verified` | Post-admission transform | Sender email + verified flag | Attached to existing context |

**Source binding:**
- Mailbox source is configured in Site `config.json`.
- Only senders on an explicit allowlist (`campaign_request_senders`) are admitted as facts.
- Non-allowed sender mail is silently skipped (no fact admission, no work opening).

**Reuse from mailbox vertical:**
- Same `mail.message.discovered` fact type as helpdesk.
- Same Graph delta sync source adapter.
- Different context formation strategy (campaign thread vs. support conversation).

---

## 3. Durable Boundaries Needed

| Boundary | New or Reuse | Note |
|----------|-------------|------|
| Fact store (`facts`, `apply_log`, `source_cursors`) | **Reuse** | Identical to helpdesk vertical |
| Context/work derivation | **New strategy** | `CampaignRequestContextFormation` — groups by thread + sender verification |
| Work item (`work_items`) | **Reuse** | Same schema; charter binding differs |
| Evaluation (`evaluations`) | **Reuse schema** | New campaign-production charter |
| Decision (`decisions`) | **Reuse** | Same foreman governance |
| Intent/outbound (`outbound_commands` / `outbound_handoffs`) | **Reuse schema** | New `campaign_brief` and `send_reply` action types |
| Execution attempt (`execution_attempts`) | **Reuse** | Same worker boundary |
| Confirmation (reconciliation) | **Reuse** | New Klaviyo observation adapter |
| Health/trace (`site_health`, `cycle_traces`) | **Reuse** | Same substrate schema |

---

## 4. Allowed Actions (as Drafts/Intents Only)

| Action | v0 Status | Authority Path |
|--------|-----------|----------------|
| `send_reply` — follow-up email asking for missing campaign info | ✅ Allowed | Charter → evaluation → handoff → operator approve → effect execute |
| `campaign_brief` — draft campaign specification document | ✅ Allowed | Charter → evaluation → handoff → operator review → manual Klaviyo entry |
| `klaviyo_campaign_create` — create draft campaign in Klaviyo | ⚠️ Deferred to v1 | Requires full intent boundary + credential seam + observation |
| `klaviyo_list_update` — modify list/segment membership | ❌ Forbidden | Out of scope; customer data mutation too high-risk for v0 |
| `klaviyo_campaign_send` — publish or send campaign | ❌ Forbidden | Explicitly out of scope. Never automated in v0. |

**v0 posture:** Intelligence drafts. Human operator approves. Human operator manually enters approved briefs into Klaviyo. v1 adds `klaviyo_campaign_create` as a durable intent with observation-based confirmation.

---

## 5. Forbidden in v0

| Forbidden Item | Rationale |
|----------------|-----------|
| Direct Klaviyo API calls without durable intent | Preserves Narada's intent-first architecture |
| Campaign publish or send | Too high-risk for autonomous execution |
| Customer list / segment data in public Narada | Private data belongs in ops repos |
| Generic "marketing automation framework" abstraction | Premature; Klaviyo is one API among many possible peers |
| Auto-approval of campaign drafts | All campaign drafts require explicit operator review |
| Real-time webhook from Klaviyo | Polling-only for v0; webhooks deferred |

---

## 6. Reused Components

| Component | Source | Reuse Mode |
|-----------|--------|------------|
| `HttpSourceAdapter` / Graph sync | Cloudflare + Windows packages | Direct reuse; same adapter, different config |
| `FileLock` / stuck-cycle recovery | `@narada2/control-plane` | Direct reuse |
| `computeHealthTransition` | `@narada2/control-plane` | Direct reuse |
| `DefaultForemanFacade` | `@narada2/control-plane` | Direct reuse; new policy binding for campaign charter |
| `executeSiteOperatorAction` | Windows Site / CLI | Direct reuse; new action types if needed |
| `executeApprovedCommands` + effect worker | Cloudflare / Windows | Direct reuse; new Klaviyo adapter boundary |
| Site Registry / Operator Console | Tasks 378–384 | Direct reuse; new Site entries for marketing Aim |
| `LogNotificationAdapter` / `WebhookNotificationAdapter` | Tasks 340–342, 376 | Direct reuse |
| `SiteRegistry`, `aggregateHealth`, `deriveAttentionQueue` | Tasks 380–381 | Direct reuse |

---

## 7. New Components Required

| Component | Package | Responsibility |
|-----------|---------|----------------|
| `CampaignRequestContextFormation` | `@narada2/control-plane` or ops repo | Groups mail facts into campaign-request contexts |
| `campaign-production` charter | Ops repo | Extracts campaign requirements; proposes brief or follow-up |
| `KlaviyoCampaignAdapter` seam | `@narada2/control-plane` (minimal) | Mockable boundary for campaign create/update/read |
| `KlaviyoObservationAdapter` | `@narada2/control-plane` (minimal) | Polls Klaviyo for campaign state confirmations |
| `campaign_brief` action type | `@narada2/control-plane` | New outbound action type; v0 is non-executable (document-only) |

---

## 8. Public vs. Private Boundary

| Concern | Location |
|---------|----------|
| Kernel, control plane, CLI, Site substrates | Public `narada` monorepo |
| Generic charter runtime, adapter interfaces | Public `narada` monorepo |
| Klaviyo adapter seam (interface + mock) | Public `narada` monorepo |
| Operation specification (sources, charters, policy) | Private ops repo |
| Brand voice knowledge, campaign templates | Private ops repo |
| Customer segment definitions, list IDs | Private ops repo |
| Klaviyo API credentials | Private ops repo / env bindings |
| Campaign charter prompt materialization | Private ops repo |

---

## 9. Windows 11 Requirements

| Requirement | v0 Delivery | v1 Enhancement |
|-------------|-------------|----------------|
| Site root + credential binding | ✅ Windows Credential Manager / env | Credential rotation automation |
| Scheduled Cycle execution | ✅ Task Scheduler (native) / systemd (WSL) | Windows Service wrapper |
| Mailbox source access | ✅ Graph API delta sync | IMAP fallback; webhook push |
| Klaviyo API credential access | ✅ Env binding | Credential Manager integration |
| Operator console / CLI inspection | ✅ `narada ops`, `narada status --site` | Web dashboard |
| Campaign brief draft review | ✅ CLI `narada show-draft` | In-app review |
| Direct Klaviyo campaign creation | ❌ v1 only | Durable intent + observation |

---

## 10. Risk Acknowledgments

1. **Klaviyo API surface is large.** The chapter targets only campaign creation and read-back. Lists, flows, metrics are all deferred.
2. **First non-helpdesk Operation.** The kernel has not yet proven a second vertical end-to-end. There may be unanticipated coupling between mailbox source semantics and campaign charter semantics.
3. **Brand data sensitivity.** Even brief drafts may contain customer segment names or promotional timing. All draft payloads must be treated as confidential.
4. **Operator approval bottleneck.** v0 requires human review of every campaign brief. If volume is high, the operator may become a bottleneck. This is accepted as a v0 constraint, not a bug.

---

## 11. Recommended Next Work (Post-394)

1. **Klaviyo Live Operational Trial** — manual end-to-end with real Klaviyo sandbox credentials
2. **Additional SaaS Connectors** — HubSpot, Mailchimp, or SendGrid as peer verticals
3. **Multi-Operation Site** — one Windows Site running both helpdesk and marketing Aims
4. **Campaign Analytics Observation** — read campaign performance back into Narada as facts
