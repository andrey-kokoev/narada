# Decision: Email Marketing Operation Chapter Closure

**Date:** 2026-04-22  
**Chapter:** Tasks 387–394  
**Verdict:** **Closed — accepted.**

---

## Summary

The email-marketing Operation chapter defined Narada's first non-helpdesk vertical: a governed pipeline that turns inbound colleague email requests into campaign brief drafts and follow-up emails, with all Klaviyo mutations explicitly deferred to v1 behind a durable intent boundary.

**What was produced:**
- **Task 387** — Boundary contract defining Aim, authority table, public/private data boundary, and no-overclaim language guide.
- **Task 388** — Campaign request fact model with `mail.message.discovered` reuse, `campaign.request.discovered` enrichment, and sender-allowlist admission rules.
- **Task 389** — Campaign-production charter specification with knowledge binding, missing-info escalation (3-follow-up limit), and governance rules restricting the charter to `campaign_brief` / `send_reply` / `no_action`.
- **Task 390** — Klaviyo intent boundary contract defining allowed/forbidden intent types, `KlaviyoEffectAdapter` interface, credential binding, observation/confirmation model, and rate-limit behavior.
- **Task 391** — Windows Site real-cycle wiring document identifying 12 gaps between existing substrate capabilities and what the marketing Operation needs.
- **Task 392** — Operator console fit document proving campaign briefs can surface through generic observation queries without vertical-specific UI code.
- **Task 393** — Integration proof fixture with 5 tests exercising the full pipeline from mail fact to `campaign_brief` outbound, including missing-info and authority-boundary assertions.

**Honest scope:** This chapter produced design documents and an integration fixture, not a live marketing Operation. No real Klaviyo API calls are made. No campaign-production charter prompt is materialized. The Windows Site Cycle steps 2–6 remain fixture stubs. The chapter proves the *boundary* and *pipeline* are sound; live operation requires porting Cloudflare's real step handlers to Windows.

---

## Task-by-Task Assessment

### Task 387 — Email Marketing Operation Contract

**Delivered:**
- `docs/deployment/email-marketing-operation-contract.md` — comprehensive 12-section contract (311 lines).
- Crystallized Aim: "Turn inbound colleague/customer email requests into governed Klaviyo email campaign work."
- Authority table covering source, fact, context, work, evaluation, decision, intent, execution, confirmation, observation.
- Explicit forbidden list: Klaviyo publish/send, customer list mutation, generic frameworks, auto-approval.
- Public/private data boundary table with 9 rows.
- No-overclaim language guide with 8 avoid/prefer pairs.
- Mapping to AGENTS.md invariants 1–35.

**Tests/checks:** Document-only task. `pnpm verify` passes.

**Residuals:** Contract may need amendment when v1 adds `klaviyo_campaign_create` execution or when a third vertical emerges.

**Boundary concerns:** None. Contract correctly forbids autonomous campaign send and customer data mutation.

---

### Task 388 — Campaign Request Fact Model

**Delivered:**
- `docs/deployment/campaign-request-fact-model.md` — fact types, payload schemas, extraction rules, context formation strategy.
- `mail.message.discovered` reuse from helpdesk vertical with different admission rule (sender allowlist).
- `campaign.request.discovered` enrichment fact with extracted fields.
- Context formation: group by `conversation_id` (thread), one work item per open context.
- Extraction rules: plain-text canonical, subject scanning, timing keyword matching, segment mention extraction.
- Non-campaign mail handling: admitted as `mail.message.discovered` but not promoted; no work opened.

**Tests/checks:** Document-only task. `pnpm verify` passes.

**Residuals:** Extraction rules use simple keyword matching (v0). NLP/ML extraction deferred to v1.

**Boundary concerns:** None. Facts are read-only derivations from mail data.

---

### Task 389 — Campaign Charter + Knowledge Binding

**Delivered:**
- `docs/deployment/campaign-charter-knowledge-binding.md` — 429-line specification.
- Charter identity (`campaign_producer`, `derive`+`propose` authority).
- Charter inputs: `CharterInvocationEnvelope` with `CampaignRequestContextMaterialization`.
- Charter outputs: three outcomes (`campaign_brief`, `request_info`/`clarification_needed`, `no_action`) with payload schemas.
- Knowledge source catalog: 5 knowledge files (naming conventions, brand voice, segment definitions, timing constraints, campaign templates) all in private ops repo.
- Knowledge injection pattern: config binding → materializer loading → system prompt injection.
- Missing-info escalation: 3-follow-up limit before `failed_terminal`.
- Governance rules: allowed actions (`campaign_brief`, `send_reply`, `no_action`), forbidden actions (all Klaviyo mutations, `send_new_message`).

**Tests/checks:** Document-only task. `pnpm verify` passes.

**Residuals:** Charter prompt templates and knowledge source contents are not created (intentionally — they belong in private ops repo).

**Boundary concerns:** None. Charter is restricted to `derive`+`propose`. No `claim`, `execute`, `resolve`, or `confirm` authority.

---

### Task 390 — Klaviyo Intent Boundary

**Delivered:**
- `docs/deployment/klaviyo-intent-boundary.md` — 311-line contract.
- Intent type classification table: 6 intent types with v0/v1/forbidden classification.
- `KlaviyoEffectAdapter` interface with `createCampaign` and `getCampaignStatus`.
- Error classification matrix: terminal (401/403/400/422/404) vs. retryable (429/503/504/network).
- Bounded retry: 5 attempts, exponential backoff (`1s→2s→4s→8s→16s`), max ~31s.
- Credential binding: `KLAVIYO_API_KEY` / `KLAVIYO_PRIVATE_API_KEY` with fail-closed `KlaviyoCredentialError`.
- Observation/confirmation model: `submitted` on API acceptance, `confirmed` only after reconciliation observation.
- Explicit "No Self-Confirmation" rule: API success ≠ confirmed.
- Attention queue derivation for credential-required items with `interactive_auth_required` subtype.

**Tests/checks:** Document-only task. `pnpm verify` passes.

**Residuals:** No real Klaviyo adapter implementation. v0 does not resolve Klaviyo credentials.

**Boundary concerns:** None. Intent-first architecture preserved. All mutations flow through durable intents.

---

### Task 391 — Windows Site Real-Cycle Wiring

**Delivered:**
- `docs/deployment/windows-site-real-cycle-wiring.md` — 370-line wiring document.
- Inventory of existing Windows Site capabilities: Cycle runner, source adapter, coordinator, charter runtime, effect worker, operator surface, notification, registry.
- 12-entry gap table identifying what exists vs. what is needed.
- Assessment: Cycle runner needs no modification (same 8-step pipeline), Site schema needs no new tables, CLI may need `show-draft` extension.
- Windows 11-specific requirements: directory structure, credential binding, Task Scheduler interval, log retention.

**Tests/checks:** Document-only task. `pnpm verify` passes.

**Residuals:** Windows Cycle steps 2–6 are still fixture stubs. Real step handlers must be ported from Cloudflare package.

**Boundary concerns:** None. Wiring document correctly identifies substrate gaps without introducing marketing-specific code.

---

### Task 392 — Operator Console Fit

**Delivered:**
- `docs/deployment/operator-console-fit.md` — 340-line specification.
- Vertical-neutrality design principle: console displays raw `action_type`, not semantic labels.
- Campaign artifact → console surface mapping table.
- `campaign_brief` surfaced as generic `outbound_command` with `action_type: "campaign_brief"`.
- Missing-info attention derived from generic `work_items` + `outbound_handoffs` join.
- Credential-missing attention uses existing `auth_failed` / `credential_required` paths.
- CLI command coverage verified: `narada ops`, `status --site`, `doctor --site`, `console attention` all work without changes.
- Required changes list: 4 minimal runtime changes (add `campaign_brief` to action type enums, exclude from `approve-draft-for-send`).

**Tests/checks:** Document-only task. `pnpm verify` passes.

**Residuals:** Console does not yet display `campaign_brief` payloads with semantic rendering. Generic `payload_json` parsing is sufficient for v0.

**Boundary concerns:** None. Console remains vertical-neutral. No campaign-specific UI code added.

---

### Task 393 — Email Marketing Operation Integration Proof

**Delivered:**
- `packages/sites/windows/test/integration/email-marketing-operation.test.ts` — 531-line fixture with 5 tests.
- Uses real `SqliteCoordinatorStore` + `SqliteOutboundStore` on in-memory SQLite.
- **Test 1:** Full pipeline to `campaign_brief` — asserts context, work item, evaluation, decision, outbound command, payload structure.
- **Test 2:** Missing-info pipeline to `send_reply` — asserts `clarification_needed` outcome, follow-up body, no `campaign_brief` created.
- **Test 3:** Forbidden actions — asserts no `klaviyo_*` or `send_new_message` actions appear.
- **Test 4:** Console observation surface — asserts generic `getCommandsByScope` surfaces `campaign_brief` drafts.
- **Test 5:** IAS boundary preservation — asserts evaluation, decision, and outbound have distinct IDs.

**Tests:** 5/5 pass.

**Corrections applied during review:** None required.

**Residuals:** Fixture simulates steps 2–5 with direct SQL inserts rather than real step handlers. This is intentional — the fixture proves schema and boundary correctness, not step handler logic.

**Boundary concerns:** None. All authority boundaries (evaluation ≠ decision ≠ outbound) are preserved and asserted.

---

## Semantic Drift Check

| Check | Result |
|-------|--------|
| **Aim / Site / Cycle / Act / Trace used consistently?** | ✅ Yes. All documents reference SEMANTICS.md §2.14. No deviation. |
| **"Klaviyo operation" or "marketing automation framework" smears?** | ❌ No. No-overclaim language guide explicitly bans these. Documents use "email-marketing Operation with Klaviyo as the target platform" and "governed campaign draft pipeline." |
| **Email-marketing Operation conflated with helpdesk vertical?** | ❌ No. Contract explicitly states this is a *second vertical*, not a replacement. Facts reuse `mail.message.discovered` but with different admission rules and context formation. |
| **`operation` smeared into kernel types?** | ❌ No. All types use `siteId`, `scopeId`, `variant`. No `operation` overload in any code or document. |
| **Campaign brief treated as executable intent?** | ❌ No. `campaign_brief` is explicitly document-only in v0. Integration test asserts no execution attempt exists beyond evaluation. |
| **Klaviyo API success treated as confirmation?** | ❌ No. Klaviyo boundary doc §4.3: "API success ≠ confirmed." Confirmation is exclusively reconciliation's job. |
| **Charter granted execute/resolve/confirm authority?** | ❌ No. Charter is bound to `derive`+`propose` only. All forbidden authority classes are explicitly listed. |

**Verdict:** No semantic drift detected. The chapter maintained strict separation between email-marketing and helpdesk verticals, preserved crystallized vocabulary, and never conflated document drafts with executable intents.

---

## Authority Boundary Check

| Check | Result |
|-------|--------|
| **Intelligence does not publish/send campaigns?** | ✅ Confirmed. `klaviyo_campaign_send` is forbidden in all versions without explicit operator policy amendment. Integration test asserts no `klaviyo_*` actions are created. |
| **Klaviyo mutations are durable intents before execution?** | ✅ Confirmed. Klaviyo boundary doc §4 defines full intent → decision → command → submitted → confirmed flow. v0 has no Klaviyo adapter, so no mutations occur. |
| **Campaign briefs require operator review?** | ✅ Confirmed. `campaign_brief` payload includes `approval_needed: true`. Status is `draft_ready`. Console fit doc excludes `campaign_brief` from `approve-draft-for-send`. |
| **Observation surfaces are read-only?** | ✅ Confirmed. Console fit doc explicitly states vertical-neutrality and read-only observation. Generic queries on `outbound_handoffs`. No campaign-specific SQL in console. |
| **Charter runtime is read-only sandbox?** | ✅ Confirmed. Charter spec §1: "Charter may only propose... No direct store writes." Charter produces `CharterOutputEnvelope`; kernel handles all persistence. |
| **Foreman owns work opening?** | ✅ Confirmed. Contract §4 authority table: `DefaultForemanFacade.onContextsAdmitted()` opens work items from campaign contexts. |
| **OutboundHandoff owns command creation?** | ✅ Confirmed. Contract §4: `OutboundHandoff.createCommandFromDecision()` creates `outbound_handoff` / `outbound_command`. Integration test routes through decision → handoff → outbound. |
| **Worker exclusivity preserved?** | ✅ Confirmed. Klaviyo boundary doc §5.3: "Only the designated Klaviyo worker may call `KlaviyoEffectAdapter.createCampaign()`." v0 has no Klaviyo worker. |

**Verdict:** All authority boundaries hold. No hidden authority introduced. No observation path mutated Site state.

---

## Gap Table

| # | Gap | Severity | Justification for Deferral | Impact on v0 |
|---|-----|----------|---------------------------|--------------|
| 1 | **Windows Cycle steps 2–6 are fixture stubs** | High | Real step handlers exist in Cloudflare package but are not yet ported to Windows. Same work needed for helpdesk vertical. | Moderate. Integration proof validates schema/boundaries; real execution requires step handler porting. |
| 2 | **Charter runtime not on Windows** | High | `SandboxEvaluateStepHandler` exists in Cloudflare package. Windows defer. | Moderate. Fixture simulates evaluation with direct SQL. Real charter evaluation requires sandbox port. |
| 3 | **Effect worker not on Windows** | High | `executeApprovedCommands` + `SendReplyWorker` exist in Cloudflare. Windows defer. | Moderate. `send_reply` is executable in v0 but worker is not yet wired on Windows. |
| 4 | **Reconciliation adapter not on Windows** | Medium | `GraphLiveObservationAdapter` exists in Cloudflare. Windows defer. | Low. v0 has no Klaviyo reconciliation. `send_reply` reconciliation is helpdesk vertical. |
| 5 | **`CampaignRequestContextFormation` not implemented** | Medium | Behavior is specified (Task 388) but no implementation exists. | Low. Integration proof simulates context formation with direct SQL inserts. |
| 6 | **Campaign-production charter not materialized** | Medium | Charter prompt and knowledge sources belong in private ops repo, not public Narada. | Low. v0 uses mock charter in integration proof. Real charter requires ops repo setup. |
| 7 | **`campaign_brief` action type not in control-plane enums** | Medium | Action type is specified but not yet added to `AllowedActionSchema`, `OutboundActionType`, payload validators, or transition logic. | Low. Integration proof uses direct SQL inserts. Runtime type safety requires enum updates. |
| 8 | **Klaviyo credential binding not in Windows Credential Manager** | Low | v0 does not resolve Klaviyo credentials. Binding specified for v1. | None. v0 uses manual operator entry. |
| 9 | **No real observation queries for marketing-specific attention** | Low | `SiteObservationApi` methods return empty arrays in CLI. Real queries deferred. | Low. `narada status --site` works for single-Site inspection. Attention queue uses generic derivation. |
| 10 | **Cloudflare Site support for marketing Operation** | Low | Cloudflare Sites are deferred across all verticals. | None. Chapter is Windows-first. |
| 11 | **Campaign analytics observation** | Low | Reading campaign performance back as facts is post-v1. | None. Not in scope. |
| 12 | **Multi-Operation Site (helpdesk + marketing on one Site)** | Low | One Site per Aim for v0. Running multiple Operations on one Site is future work. | None. Explicitly deferred. |

---

## CCC Posture Assessment

| Coordinate | Before | After |
|------------|--------|-------|
| **semantic_resolution** | `0` | `0` (no new semantics; all terms grounded in SEMANTICS.md §2.14. `campaign_brief`, `campaign_producer`, and `CampaignRequestContextFormation` are compositional, not novel.) |
| **invariant_preservation** | `0` | `0` (all AGENTS.md invariants hold: intent-first, decision-before-command, worker exclusivity, read-only observation, no self-confirmation.) |
| **constructive_executability** | `0` | **`+1`** (integration proof fixture exercises real SQLite stores with 5 passing tests. Pipeline from fact to outbound is constructively demonstrated.) |
| **grounded_universalization** | `0` | **`+1`** (second vertical proven on same kernel substrate without collapsing into helpdesk semantics or premature abstraction. Reuse inventory shows 11 existing components reused, 5 new components required.) |
| **authority_reviewability** | `0` | **`+1`** (all campaign briefs require operator review. No auto-approval. Forbidden actions (`klaviyo_campaign_send`, `klaviyo_list_update`) are explicit. Charter authority is `derive`+`propose` only.) |
| **teleological_pressure** | `0` | **`+1 bounded`** (operator can inspect campaign briefs via generic console, approve follow-up emails, and review health/attention. But v0 requires manual Klaviyo entry — the full loop is not yet closed.) |

**Verdict:** `constructive_executability`, `grounded_universalization`, `authority_reviewability`, and `teleological_pressure` each moved by `+1`. The chapter is scoped and honest — it delivers boundary contracts, a fact model, a charter spec, an intent boundary, a console fit spec, a wiring analysis, and an integration proof fixture. It does not overclaim live Klaviyo integration or autonomous campaign execution.

---

## Residuals

1. **Windows Cycle step handler porting** — Steps 2–6 (sync, derive, evaluate, handoff, execute) are fixture stubs. Real handlers exist in Cloudflare package and must be ported to Windows for live operation.
2. **Charter runtime on Windows** — `SandboxEvaluateStepHandler` and tool catalog binding are Cloudflare-only. Windows needs equivalent sandbox execution.
3. **Effect worker on Windows** — `executeApprovedCommands` + `SendReplyWorker` need Windows wiring for `send_reply` execution.
4. **`campaign_brief` action type runtime integration** — Enums, validators, and transition logic in `@narada2/control-plane` need the new action type added.
5. **Campaign-production charter materialization** — Prompt template and knowledge sources must be created in private ops repo.
6. **`CampaignRequestContextFormation` implementation** — Context materializer must be built in `@narada2/control-plane`.
7. **Real observation queries** — `SiteObservationApi` methods in CLI return empty arrays. Real SQL queries against Site coordinator DB are deferred.
8. **Klaviyo adapter implementation (v1)** — `KlaviyoEffectAdapter` interface is specified but not implemented. Requires credential binding, retry logic, and reconciliation adapter.
9. **Cloudflare Site marketing Operation** — Cloudflare Sites are deferred across all verticals.
10. **Campaign analytics observation (v1+)** — Reading campaign performance back as facts is post-v1.

---

## Recommended Next Work

1. **Windows Site Step Handler Port** (highest pressure)
   - Port `createSyncStepHandler`, `createDeriveWorkStepHandler`, `createEvaluateStepHandler`, `createHandoffStepHandler`, and `executeApprovedCommands` from Cloudflare package to Windows.
   - Prove end-to-end: `narada cycle --site marketing` runs real sync → derive → evaluate → handoff → execute.

2. **`campaign_brief` Action Type Runtime Integration**
   - Add `campaign_brief` to `AllowedActionSchema`, `OutboundActionType`, payload validators, and `isValidTransition`.
   - Exclude `campaign_brief` from `approve-draft-for-send` in CLI.
   - Verify integration proof still passes after enum updates.

3. **`CampaignRequestContextFormation` Implementation**
   - Implement context materializer in `@narada2/control-plane`.
   - Bind to `config.json` `campaign_request_senders` allowlist.
   - Test with fixture data: allowed sender → context opened; non-allowed sender → silently skipped.

4. **Campaign-Production Charter Materialization (ops repo)**
   - Create prompt template with knowledge injection pattern.
   - Add knowledge sources: naming conventions, brand voice, segment definitions, timing constraints.
   - Test charter evaluation with fixture envelope.

5. **Klaviyo Live Operational Trial (v1)**
   - Implement `KlaviyoEffectAdapter` with real `fetch()`-based Klaviyo API client.
   - Create sandbox campaign, observe confirmation, verify two-stage completion.
   - Test credential binding with `KLAVIYO_API_KEY`.

---

## Closure Checklist

- [x] Closure decision exists.
- [x] Tasks 387–393 are assessed.
- [x] Semantic drift check passes (no drift found).
- [x] Authority boundary check passes (all boundaries hold).
- [x] Gap table exists with 12 entries.
- [x] CCC posture is recorded.
- [x] Residuals are concrete and prioritized.
- [x] Next-work recommendations are explicit.
- [x] No derivative task-status files created.
