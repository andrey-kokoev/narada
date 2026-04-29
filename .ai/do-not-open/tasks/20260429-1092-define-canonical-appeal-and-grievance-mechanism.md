---
status: closed
amended_by: architect
amended_at: 2026-04-29T22:05:06.355Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-29T22:06:30.547Z
criteria_proof_verification:
  state: unbound
  rationale: Appeal/grievance doctrine defines the governed crossing, lifecycle, artifact shape, standing, independence, stay posture, outcomes, anti-collapse rules, and relationships to escalation, review, rejection ledger, reopen, supersession, governance feedback, operator confirmation, and inbox. Focused verification passed.
closed_at: 2026-04-29T22:06:37.693Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Define canonical appeal and grievance mechanism

## Chapter

Appeal and Grievance Governance

## Goal

Define a first-class appeal/grievance path for challenging Narada decisions, refusals, reviews, closures, routing outcomes, and capability denials without collapsing into ad hoc chat escalation.

## Context

Current Narada has question escalation, review/rejection, reopen/supersession, governance feedback, operator confirmation, and the Admission Rejection Ledger. It does not yet have a single first-class appeal/grievance path where a principal can challenge a decision, rejection, closure, routing refusal, capability refusal, or review verdict. The mechanism must be governed and durable, not a chat convention or automatic override.

## Required Work

1. Inspect question escalation, admission rejection ledger, task lifecycle review/reopen, operator-action confirmation, and governance feedback docs. 2. Define appeal/grievance as a governed crossing with stable artifact, authority owner, admissibility regime, confirmation rule, and lifecycle. 3. Distinguish appeal from pre-decision escalation, ordinary review, rejection ledger entries, reopen, supersession, and governance feedback. 4. Specify standing: who may file, what can be appealed, evidence required, time/scope bounds, and when appeal is refused. 5. Specify review independence and outcomes: upheld, overturned, remanded, superseded, withdrawn, refused. 6. Specify effect posture: filing an appeal does not automatically suspend the original decision unless the crossing regime or Operator grants stay/suspension. 7. Document relationship to inbox submission and Admission Rejection Ledger. 8. Add a focused docs verification search and task-file guard; do not implement autonomous override machinery.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T22:05:06.355Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Doctrine defines appeal or grievance as a governed crossing distinct from question escalation review rejection and governance feedback
- [x] Appeal lifecycle includes filed admitted-or-refused reviewed and upheld overturned superseded or withdrawn outcomes
- [x] Standing evidence independence and non-suspension rules are explicit
- [x] Relationship to Admission Rejection Ledger task review reopen operator confirmation and inbox is documented
- [x] No implementation creates autonomous override or silent mutation authority
- [x] Focused verification confirms the new doctrine is linked from relevant governance docs
