# Decision: Mailbox Saturation Chapter Closure

## Date

2026-04-20

## Chapter

Mailbox Saturation

## Capabilities Delivered

### Task 291 — Live Graph Proof Saturation
- `docs/live-graph-proof.md` defines the canonical six-stage proof for the full draft-to-confirmed path.
- Each stage specifies durable evidence, canonical inspection commands, and pass criteria.
- Public/private evidence split is explicit: public repo contains contract and method; private ops repo contains live transcripts and evidence.
- Operator runbook covers pre-flight, test email, sync, evaluation, inspection, approval, submission, reconciliation, and logging.
- All CLI commands verified against actual surfaces.

### Task 292 — Draft Review and Promotion Ergonomics
- `narada show-draft` provides deep-dive draft review detail including decision lineage, evaluation lineage, and available actions.
- `narada drafts` provides grouped draft overview with review status and available actions per draft.
- Operator path from `draft_ready` → review → approve/reject/handled-externally is coherent in CLI.
- Review state visibility includes `awaiting_review`, `reviewed`, and `approved_for_send`.

### Task 293 — Day-2 Mailbox Hardening
- Auth-expiry and degraded-state failure modes enumerated and classified.
- Graph edge-case inventory covers draft recreation, remote mutation, missing confirmation, and attachment-bearing replies.
- Recovery drills defined for daemon interruption, outbound ambiguity, and auth restoration.
- Operator behavior for `failed_terminal` → `retry_auth_failed` path is documented and executable.

### Task 294 — Mailbox Scenario Library Expansion
- Canonical scenario basis defined for five conversational shapes: login/access issue, billing question, refund request, escalation-worthy complaint, and ambiguous request needing clarification.
- Fixture shape per scenario defined (input thread, expected evaluation character, expected outbound action class, send eligibility).
- Fixtures remain safe for the public repo; private/customer-specific content stays out.
- Scenario set is compact and intentionally bounded.

### Task 295 — Knowledge-Backed Support Maturity
- Mailbox knowledge placement model explicit across public repo concepts, private ops repo paths, and charter consumption points.
- Distinction between proof and knowledge documented: proof shows the pipeline works; knowledge makes support behavior good.
- Compact support playbook examples provided.
- Authority and secrecy boundaries preserved.

### Task 296 — Mailbox Operator Polish and Closure
- **`narada drafts`** command added: focused, mailbox-specific draft overview grouped by status with counts and available actions.
- `narada ops` updated to suggest `narada drafts` when drafts exist.
- Draft states surfaced: Active (pending, draft_creating), Ready for Review (draft_ready), Approved for Send (approved_for_send), In Flight (sending, submitted), Blocked / Failed (blocked_policy, retry_wait, failed_terminal), Terminal (confirmed, cancelled, superseded).
- Stuck drafts called out prominently with age classification.

## Integrated Review

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Live mailbox proof is repeatable | ✅ Satisfied | `docs/live-graph-proof.md` is the canonical contract. Six stages with exact evidence per stage. |
| Draft review/promotion ergonomics are coherent | ✅ Satisfied | `narada show-draft` and `narada drafts` expose decision lineage, evaluation lineage, review status, and available actions. |
| Day-2 failure modes are understood | ✅ Satisfied | Explicit enumeration of auth, Graph drift, attachment, and recovery scenarios. |
| Scenario basis is compact and defined | ✅ Satisfied | Five canonical scenarios with fixture shape and safety boundaries. |
| Knowledge placement is coherent | ✅ Satisfied | Public/private/charter boundaries documented. Proof vs knowledge distinction is explicit. |
| Operator surfacing is measurably clearer | ✅ Satisfied | `narada drafts` provides focused draft status grouping. `narada ops` cross-references it. |

## Deferred Gaps

| Gap | Priority | Rationale |
|-----|----------|-----------|
| Autonomous send by default | **P3** | Safety-first posture keeps this deferred. `draft-only` with `require_human_approval: true` remains the production default. |
| Real-time UI updates for draft state | **P3** | CLI is the primary operator surface. Daemon observation API provides polling-based UI. |
| Fleet/multi-operation dashboards | **P3** | `narada ops` and `narada drafts` are scoped to one config at a time. |

## Residual Risks

1. **Live proof requires credentials**: The live Graph proof contract is documented but its repeatability depends on operator discipline and credential freshness.
2. **Attachment-heavy flows**: Hardening identifies the edge cases but does not implement exhaustive attachment validation.
3. **Scenario basis is narrow in fixtures**: Five scenarios are defined but only one (login issue) has fixture-backed proof hooks in the public repo. The others are defined contracts awaiting fixture implementation.

## Closure Statement

The Mailbox Saturation chapter is closed. All chapter tasks (291–296) are satisfied. Narada now has:
- A canonical, repeatable live-mailbox proof contract
- Coherent draft review and promotion ergonomics
- Enumerated day-2 failure modes and recovery drills
- A compact canonical scenario basis
- Explicit knowledge placement model for mailbox support
- Focused operator surfacing for draft lifecycle (`narada drafts`)
