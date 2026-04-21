# Review: Task 351 — Live Adapter Boundary Contract

**Target:** `docs/deployment/cloudflare-live-adapter-boundary-contract.md` + task closure artifacts  
**Reviewer:** agent review  
**Date:** 2026-04-21

---

## 1. Verdict

**ACCEPTED**

The boundary contract is a sound, referenceable document. It correctly classifies the five adapter types, scopes four in and one out, preserves all IAS and foreman boundaries, and includes explicit no-overclaim language. The document is internally consistent with `SEMANTICS.md §2.14`, `AGENTS.md` critical invariants, and the existing Cloudflare Site materialization docs.

All review findings were applied as fixes rather than deferred as notes.

---

## 2. Fixes Applied

### 2.1 §3.3 wording: adapter "confirms" vs. provides observations

**Fix:** Rephrased the allowed-behavior bullet from "Confirm `outbound_commands` only when..." to "Provide observations that enable the reconcile step to confirm `outbound_commands` when the external state matches the expected state."

This removes the ambiguity: the adapter produces observations; the reconcile handler performs confirmation.

### 2.2 §5.3 uses "IAS Anti-Collapse" without expansion

**Fix:** Expanded to "Intent–Action–Separation Anti-Collapse" on first use in §5.3.

### 2.3 Failure-mode guidance is uneven across adapter types

**Fix:** Added explicit failure-mode paragraphs to:
- §3.3 (reconciliation-read): "Adapter failure must not fabricate confirmation. Missing or stale observations must leave `outbound_commands` in their prior state. The adapter must not infer success from the absence of data."
- §3.4 (operator-control): "Invalid operator actions must be rejected without mutation. Audit records must be written for both accepted and rejected actions. Operator action failure must not crash the Cycle or corrupt work-item state."

### 2.4 No mention of `scope_id` / `site_id` conflation

**Fix:** Added an **Identity note** to §3.1 (source-read): "For v0 single-Site, single-scope setups, `site_id` and `scope_id` coincide. A source-read adapter operates against the Site's configured sources and admits facts scoped to that Site. Multi-scope resolution is deferred to v1."

---

## 3. Open Risks

- **Contract drift during implementation:** Tasks 352–355 may discover edge cases (e.g., webhook ingress does not fit the read-only/delta model, Sandbox has unexpected network constraints) that are not anticipated by this contract. The contract should be treated as living: if a task discovers a blocker, the contract should be amended to record the new boundary, not worked around silently.
- **Operator-control adapter authority creep:** Task 355's operator mutation surface is the highest-risk adapter for authority boundary violations because it intentionally mutates state. The audit boundary in §5.5 is correct, but implementation must also enforce that operator actions cannot skip foreman governance (e.g., an operator "approve" must still route through the decision → handoff sequence, not directly execute).
- **Fixture fallback hygiene:** If Task 353 blocks on Sandbox runtime, the contract correctly permits fixture fallback. However, repeated use of fixture fallback in Tasks 356–357 without re-attempting the live seam could lead to a "fixture-normalized" system where the live adapter is technically blocked but operationally forgotten.

---

## 4. Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Boundary document exists | **Pass** | `docs/deployment/cloudflare-live-adapter-boundary-contract.md` (211 lines) |
| Adapter taxonomy is explicit | **Pass** | §2 table with 5 classes, direction, authority, and scope |
| Effect execution is clearly out of scope | **Pass** | §2 and §4 both state it explicitly; "No" in scope column |
| Live-safe proof distinguished from production readiness | **Pass** | §6 no-overclaim table + closing paragraph |
| Tasks 352–357 reference or align with the contract | **Pass** | §7 Task Reference maps each task to contract sections |
| No derivative task-status files created | **Pass** | Only the boundary doc, task file update, and materialization cross-reference were modified |

---

## 5. Boundary Statement

> Live adapters are **mechanical seams** that replace fixture injection with bounded external interaction. They are not authority sources. No live adapter in Tasks 351–357 may create decisions directly from evaluator output, confirm effects from execution success alone, execute side effects autonomously, or mutate state without leaving an audited trace. The boundary contract preserves the fixture-backed IAS chain: facts → context/work → evaluations → decisions → outbound commands → external observation → confirmation.
