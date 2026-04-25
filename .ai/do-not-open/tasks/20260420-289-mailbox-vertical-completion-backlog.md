# Task 289: Mailbox Vertical Completion Backlog

## Chapter

Post-Operation Realization

## Context

Narada now has a complete first mailbox vertical shape:

- bootstrap path
- executor attachment model
- degraded-state contract
- fixture-backed proof
- live-backed proof path
- operator loop
- draft-first outbound governance

What remains is not a missing vertical. It is the disciplined completion and hardening backlog for the mailbox vertical so it can move from “full first vertical shape” toward “saturated, production-capable vertical”.

## Goal

Record the remaining mailbox-vertical work as a small, prioritized backlog that preserves current architecture and authority boundaries.

## Backlog

### P1 — Autonomous Send Completion

**Status:** Captured separately as Task 288.

**Why it matters:** This is the largest remaining structural gap in the outbound mailbox lifecycle.

**Deliverable shape:**
- explicit sendable-state boundary after `draft_ready`
- dedicated send worker/daemon path
- audited approval/promotion distinct from send execution
- `submitted` vs `confirmed` preserved

---

### P1 — Live Graph Proof Saturation

**What is missing:**
- durable acceptance artifact for real Graph draft creation
- durable acceptance artifact for real send submission
- durable acceptance artifact for inbound reconciliation after live send

**Why it matters:** The live-backed proof path is documented, but not yet fully captured as a repeatable acceptance story.

**Boundaries:**
- keep private-data/live credentials in ops repos
- public repo should only contain safe fixtures, docs, and acceptance contracts

---

### P2 — Draft Review / Promotion Ergonomics

**What is missing:**
- smoother operator path from “draft exists” to “approve / reject / sendable”
- clearer surfacing of why a draft exists and what policy/governance produced it
- stronger mailbox-specific review rhythm once Task 288 lands

**Why it matters:** The operator experience around draft handling is still more correct than elegant.

---

### P2 — Day-2 Mailbox Hardening

**What is missing:**
- stronger handling of auth expiry and token failure recovery
- real-world Graph edge-case validation
- attachment-heavy scenario hardening
- more explicit mailbox recovery drills under live conditions

**Why it matters:** The first vertical is coherent, but not yet deeply stress-tested against live operational drift.

---

### P2 — Scenario Library Expansion

**What is missing:**
- a small canonical set of mailbox scenarios beyond the login issue proof

**Suggested first set:**
- login/access issue
- billing question
- refund request
- escalation-worthy complaint
- ambiguous request needing clarification

**Why it matters:** A vertical becomes much more reusable once it has a compact scenario basis rather than one proof case.

---

### P3 — Knowledge-Backed Support Maturity

**What is missing:**
- clearer product-level shape for mailbox+charter knowledge use
- stronger support playbook examples
- sharper distinction between generic proof and domain-specific knowledge

**Why it matters:** Support quality depends not just on pipeline correctness, but on knowledge quality and placement.

---

### P3 — Mailbox Operator Polish

**What is missing:**
- more direct mailbox-specific surfacing of:
  - pending drafts
  - blocked drafts
  - operator decisions taken
  - thread/customer context summary

**Why it matters:** The general operator loop exists, but mailbox-specific operations can still become faster and clearer.

## Explicitly Not Urgent

These are mailbox-related but should not displace the backlog above:

- autonomous send by default
- secondary charter arbitration
- multi-folder redesign
- generalized RAG
- CRM/ticket integrations
- fleet/multi-operation dashboards

## Priority Summary

| Priority | Item |
|----------|------|
| P1 | Task 288 — Autonomous send completion |
| P1 | Live Graph proof saturation |
| P2 | Draft review / promotion ergonomics |
| P2 | Day-2 mailbox hardening |
| P2 | Scenario library expansion |
| P3 | Knowledge-backed support maturity |
| P3 | Mailbox operator polish |

## Next-Step Guidance

If work continues on the mailbox vertical specifically, the recommended order is:

1. Task 288 — autonomous send completion
2. Live Graph proof saturation
3. Draft review / promotion ergonomics
4. Day-2 mailbox hardening
5. Scenario library expansion

This keeps the vertical moving from structural completion into operational saturation without reopening settled architectural questions.

## Execution Notes

Backlog validated against current codebase on 2026-04-20.

### Validation Performed

1. **Task 288 — Autonomous Send Completion** — Confirmed `.ai/do-not-open/tasks/20260420-288-implement-autonomous-send-as-approved-draft-execution.md` exists and is correctly scoped. Current outbound state machine (`packages/layers/control-plane/src/outbound/types.ts`) allows `draft_ready` → `sending` directly. `SendReplyWorker` (`send-reply-worker.ts:144-153`) executes send immediately upon reaching `draft_ready` without an explicit approval gate. The gap is real and accurately described.

2. **Live Graph Proof Saturation** — Confirmed `docs/first-operation-proof.md` exists and documents both fixture-backed and live-backed proof paths. The live-backed path is documented but lacks durable acceptance artifacts for real draft creation, real send submission, and inbound reconciliation after live send. Gap accurately captured.

3. **Draft Review / Promotion Ergonomics** — Confirmed current operator actions (`packages/layers/control-plane/src/operator-actions/executor.ts`) provide `reject_draft`, `mark_reviewed`, and `handled_externally`. No `approve_for_send` action or `approved_for_send` status exists. Operator can mark reviewed but cannot explicitly promote to sendable state. Gap accurately captured.

4. **Day-2 Mailbox Hardening** — Confirmed `CharterRunner.probeHealth()` and degraded-state contract exist (Task 284), but no explicit auth-expiry recovery drills or attachment-heavy scenario tests exist in the integration suite. Gap accurately captured.

5. **Scenario Library Expansion** — Confirmed only one fixture-backed scenario exists: `support-thread-login-issue` in `test/integration/live-operation/smoke-test.test.ts`. No billing, refund, escalation, or clarification scenarios exist. Gap accurately captured.

6. **Knowledge-Backed Support Maturity** — Confirmed `packages/layers/control-plane/src/charter/mailbox/materializer.ts` and related knowledge sources exist, but no compact support playbook or explicit domain-knowledge boundary documentation exists beyond the generic proof. Gap accurately captured.

7. **Mailbox Operator Polish** — Confirmed `narada ops` dashboard exists (Task 286), but mailbox-specific surfacing (pending drafts, blocked drafts, thread context summary) is limited to generic observation queries. Gap accurately captured.

### Authority Boundary Check

All backlog items preserve existing boundaries:
- No item proposes bypassing `ForemanFacade`, `Scheduler`, `OutboundHandoff`, or outbound workers.
- No item proposes charter runtime mutation of stores.
- No item proposes observation surface writes.
- Task 288 explicitly preserves the `submitted` vs `confirmed` separation.

### Outcome

Backlog is accurate, bounded, and correctly prioritized. No additional task files were created from this backlog per the directive to keep it as a planning record rather than an expansion trigger. Individual items should be picked up in priority order when mailbox vertical work resumes.
