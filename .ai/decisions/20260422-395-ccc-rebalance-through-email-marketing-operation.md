# Decision: CCC Rebalance — Email Marketing Operation Chapter

**Date:** 2026-04-22  
**Task:** 395  
**Chapter:** 387–394  
**Verdict:** **Rebalance note accepted. Chapter corrected for constructive priority.**

---

## Current CCC Posture

| Coordinate | Reading | Evidence |
|------------|---------|----------|
| **semantic_resolution** | Stable | SEMANTICS.md §2.14 crystallized. Aim/Site/Cycle/Act/Trace used consistently across 370, 376, 384 closures. |
| **invariant_preservation** | Strong | All IAS boundaries held through Cloudflare v1 productionization and Windows Site materialization. No hidden authority introduced. |
| **constructive_executability** | Improved substrate proofs, but not yet a concrete non-helpdesk operation | Cloudflare Site has 297 tests proving cycle, effect worker, credential seam, RPC, Cron. Windows Site has 148 tests proving file lock, sync, health. But both are mailbox/helpdesk vertical. No second vertical exists. |
| **grounded_universalization** | Healthy restraint | No generic SaaS connector, no generic marketing framework, no premature multi-site abstraction. Cloudflare and Windows are handled as distinct substrates. |
| **authority_reviewability** | Strong / slightly overweighted | Operator console, Site registry, cross-site health, attention queue, audit router, roster tracking — all review surfaces are built and tested. |
| **teleological_pressure** | Needs a useful real Operation target | Helpdesk vertical is proven. Next useful target is email-marketing Operation. Without it, the system is a well-governed helpdesk tool with no second vertical. |

**Assessment:** The CCC posture is coherent but lopsided. `authority_reviewability` is overweighted relative to `constructive_executability` and `teleological_pressure`. The next balancing move must be a concrete, governed, non-helpdesk Operation — not another meta surface.

---

## Intended Counterweight

Restore CCC balance by moving `constructive_executability` and `teleological_pressure` through the email-marketing Operation:

> **Inbound request fact → campaign work item → charter evaluation → durable draft campaign intent → operator attention**

This is the first executable skeleton for a second vertical. It must:
- Reuse existing kernel boundaries (facts, work items, evaluations, decisions, outbound handoffs).
- Add only vertical-local components (campaign context formation, campaign-production charter, `campaign_brief` action type).
- Produce a runnable integration proof (Task 393) that demonstrates the full pipeline with fixture data.

---

## Tasks That Must Come First

These tasks set up the boundaries so the constructive proof can run:

1. **Task 387 — Operation Contract**  
   Delivers the boundary document that governs all subsequent tasks. Establishes Aim, authority table, allowed/forbidden actions, and public/private data separation.

2. **Task 388 — Campaign Request Fact Model**  
   Delivers the canonical fact schema and extraction rules. Defines how mailbox facts become campaign-request facts. This is a durable schema boundary.

3. **Task 389 — Campaign Charter + Knowledge Binding**  
   Delivers charter behavior specification, knowledge source catalog, and missing-info escalation path. This is a charter/knowledge binding.

4. **Task 390 — Klaviyo Intent Boundary**  
   Delivers the intent type table, adapter interface, credential seam, and observation model. This is a durable schema boundary for v1 expansion.

These four tasks are the runway. They are document-only but they are **not decorative** — each produces a schema, contract, or binding that the integration proof depends on.

---

## Keystone Task

**Task 393 — Email Marketing Operation Integration Proof** is the keystone constructive proof.

It must:
- Admit a fixture mail fact from an allowed sender.
- Derive a campaign-request context and work item.
- Evaluate a mock campaign-production charter.
- Hand off a `campaign_brief` outbound command.
- Surface the brief for operator review.
- Include a missing-info fixture proving `send_reply` escalation.

This is the runnable artifact that moves `constructive_executability` from "substrate proofs" to "second vertical proven."

---

## Tempting Work That Must Be Deferred

The following are explicitly **out of scope** for the 387–394 chapter:

| Deferred Capability | Rationale |
|---------------------|-----------|
| **Generic SaaS connector framework** | Klaviyo is one API. A generic connector would be premature abstraction with no second SaaS vertical to validate it. |
| **Generic marketing automation framework** | This is the first marketing Operation. Extracting a framework now would be abstraction without evidence. |
| **Generic Site core extraction** | Cloudflare and Windows Sites share concepts but not code. Extracting a common Site core is deferred until a third substrate appears. |
| **Additional governance dashboards** | Authority reviewability is already strong. No new operator observation surfaces are needed for this chapter. |
| **Autonomous campaign publish/send** | All campaign drafts require explicit operator review in v0. Send/publish is forbidden without operator policy. |
| **Real Klaviyo API calls** | v0 uses manual operator entry. `KlaviyoEffectAdapter` is specified in Task 390 but not implemented until v1. |
| **Real-time Klaviyo webhooks** | Polling-only for v0. Webhook push is deferred. |
| **NLP/ML extraction model** | v0 uses simple keyword matching for timing and segment hints. NLP is deferred to v1. |

---

## Task Decorative-Output Check

| Task | Output Type | Decorative? |
|------|-------------|-------------|
| 387 — Operation Contract | Document (boundary contract) | **No** — governs all subsequent tasks; authority table is enforceable reference. |
| 388 — Campaign Request Fact Model | Schema + extraction rules | **No** — defines durable fact boundary; integration proof depends on it. |
| 389 — Campaign Charter + Knowledge Binding | Charter behavior spec + knowledge catalog | **No** — defines charter/knowledge binding; ops repo needs this to materialize prompts. |
| 390 — Klaviyo Intent Boundary | Intent table + adapter interface + credential seam | **No** — defines durable schema for v1; prevents redesign later. |
| 391 — Windows Site Real-Cycle Wiring | Gap table + wiring document | **Marginal** — mostly analytical, but identifies concrete substrate gaps that block end-to-end execution. Kept because it bounds Windows scope. |
| 392 — Operator Console Fit | Design document for generic observation | **Marginal** — mostly design, but prevents vertical-specific UI creep. Kept because it preserves observation neutrality. |
| 393 — Integration Proof | **Runnable fixture** | **No** — this is the keystone constructive artifact. |
| 394 — Chapter Closure | Closure decision + CCC posture + gap table | **No** — records evidence and residuals for next chapter planning. |

**Verdict:** No task is purely decorative. 391 and 392 are analytical but serve necessary boundary functions. 393 is the critical constructive proof.

---

## Recommended Sequencing Emphasis

The chapter DAG is structurally correct:

```
387 → 388 → 391 → 392 → 393 → 394
387 → 389 ↗
387 → 390 ↗
```

But the **narrative priority** should be:

1. Set boundaries (387–390).
2. Prove the skeleton runs (393).
3. Fill gaps and console fit (391–392) can proceed in parallel with 393 but must not block it.
4. Close with evidence (394).

If 391 or 392 discovers a blocking gap, the chapter should adjust — but the integration proof is the success criterion.

---

## Closure Checklist

- [x] CCC rebalance note exists.
- [x] Current posture is stated with evidence.
- [x] Intended counterweight is explicit (constructive executability + teleological pressure).
- [x] First tasks are identified and justified.
- [x] Deferred work is named with rationale.
- [x] Decorative-output check is performed.
- [x] Chapter file is patched with prioritization and deferrals.
- [x] No implementation code added.
- [x] No derivative task-status files created.
