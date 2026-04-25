---
status: closed
depends_on: [652]
amended_by: a2
amended_at: 2026-04-25T14:01:06.128Z
closed_at: 2026-04-25T14:01:09.719Z
closed_by: a2
governed_by: task_close:a2
---

# Task 653 — Evidence Admission Zone Execution

## Goal

Task 653 — Evidence Admission Zone Execution

## Context

Task evidence currently mixes report text, acceptance criteria checkboxes, verification rows, review records, and lifecycle status inspection. Review is an admission method, not a zone. Evidence Admission Zone should assemble explicit evidence bundles and record admission results before lifecycle commands consume them.

## Required Work

1. Add `evidence_bundles` and `evidence_admission_results` SQLite rows or equivalent store APIs.
2. Define `EvidenceBundle` with links to:
   - WorkResultReport;
   - VerificationRun(s);
   - acceptance criteria state;
   - ReviewRecord(s);
   - changed files / residuals.
3. Define `AdmissionResult` with verdict, method(s), blocker list, admitted_at, admitted_by/method, and lifecycle eligibility.
4. Route `task evidence`, `task review`, and `task close` through evidence admission logic.
5. Preserve review as a method selected by Evidence Admission.
6. Make `task close` consume an admitted result rather than recomputing ad hoc evidence gates.
7. Add focused tests for:
   - report + verification admitted without review when policy allows;
   - review-gated admission accepted/rejected;
   - unchecked criteria blocks admission;
   - raw observation output does not count as evidence;
   - TIZ `VerificationRun` can be linked into a bundle.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Planning completed. This task depends on Assignment Intent Zone only to reduce lifecycle/assignment drift first.
- Amended by a2 at 2026-04-25T14:01:06.128Z: checked all acceptance criteria

## Verification

Plan checked against current evidence rough surfaces: task evidence command overloading, review method confusion, TIZ/CEIZ evidence linkage, and close/confirm lifecycle gates.

## Acceptance Criteria

- [x] EvidenceBundle and AdmissionResult are durable.
- [x] Review is represented as an admission method, not a zone.
- [x] `task close` consumes/adheres to admission result.
- [x] TIZ `VerificationRun` links into evidence bundles.
- [x] Focused tests cover admitted, rejected, review-gated, and unchecked-criteria cases.
- [x] Observation output alone cannot satisfy evidence admission.


