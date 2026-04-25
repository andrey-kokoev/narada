# Ops Zone Completion

Narada buildout does not need a separate zone for every operation. A zone is only warranted when the same authority grammar owns a stable class of intent, admission, artifact, and confirmation. Review is therefore not a zone: it is an admission method used by crossings.

## Simplified Missing Ops Zones

| Priority | Missing Zone | Owns | Primary Artifact | Why It Is Missing |
| --- | --- | --- | --- | --- |
| 1 | Assignment Intent Zone | recommendation, assignment, claim, continuation, takeover | AssignmentRequest / AssignmentResult | Prevents roster, lifecycle, session, and recommender drift. |
| 2 | Evidence Admission Zone | work result admission, acceptance criteria, verification links, review-gated admission | EvidenceBundle / AdmissionResult | Prevents reports, reviews, and lifecycle transitions from being treated as casual text edits. |
| 3 | Observation Artifact Zone | large read outputs, graphs, evidence lists, diagnostics, rendered artifacts | ObservationArtifact / ObservationView | Prevents giant terminal dumps and separates output creation from output admission. |
| 4 | Operator Input Zone | approvals, gates, choices, live credentials, operator-selected targets | OperatorInputRequest / OperatorInputDecision | Prevents chat-state approvals from becoming hidden authority. |
| 5 | Reconciliation Zone | SQLite/file/projection/roster/assignment drift detection and repair | ReconciliationFinding / RepairResult | Prevents state mismatch repair from being arbitrary or ad hoc. |

## Not Zones

| Candidate | Correct Classification |
| --- | --- |
| Review | Admission method / challenge regime on Evidence Admission or Task Lifecycle crossings. |
| Task close | Task Lifecycle transition, usually triggered after Evidence Admission succeeds. |
| Test execution | TIZ is an adjacent verification intent/evidence zone that crosses into CEIZ for command execution, then admits the returned `CommandRunResult` as `VerificationRun` evidence. |
| Build/graph/workbench diagnostics | CEIZ command-run presets plus Observation Artifact admission. |

## Priority Chain

1. Implement Assignment Intent Zone first because it is closest to the recurring operational failures: who owns the task, whether it is claimable, and what an agent should do next.
2. Implement Evidence Admission Zone second because it determines when work becomes accepted evidence.
3. Implement Observation Artifact Zone third because it protects operator/agent context from unbounded output.
4. Implement Operator Input Zone fourth because live gates and approvals must become durable authority records.
5. Implement Reconciliation Zone fifth because it repairs disagreement between authoritative and projected surfaces.

## Closure Rule

No new top-level zone should be introduced unless it has:

- a distinct authority owner;
- a durable request artifact;
- a durable result artifact;
- an admissibility rule;
- a confirmation rule;
- at least one concrete rough surface it eliminates.
