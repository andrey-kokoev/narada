# Semantic Tightening Findings

This note records what the Evidence/Observation, Task/WorkItem, and Zone/Regime/Method tightening uncovered.

## Tightened

1. Evidence is admitted, durable, and authority-bearing. Observation is read-only and cannot justify mutation by itself.
2. Task Governance Tasks are repo-local construction governance. `work_item` remains the runtime control-plane schedulable unit.
3. Review is an admission method / challenge regime, not a zone.
4. A crossing regime is edge law. An admission method is a concrete check used by that law.

## Uncovered Follow-Up Work

| Gap | Why It Matters | Likely Owning Zone |
| --- | --- | --- |
| Task evidence still mixes report, review, acceptance criteria, verification, and lifecycle checks in one command family. | Evidence Admission Zone is still conceptual; implementation is distributed across task commands. | Evidence Admission Zone |
| CLI read surfaces still vary between raw output, bounded JSON, and artifact-first observation. | Observation Artifact Zone is not consistently enforced outside CEIZ/TIZ. | Observation Artifact Zone |
| Task claim/roster/recommend/continue still share assignment authority informally. | Assignment Intent Zone is not yet implemented as one request/result path. | Assignment Intent Zone |
| Chapter close revealed SQLite/file reconciliation gaps. | Reconciliation is still reactive and ad hoc. | Reconciliation Zone |
| Review records are stored, but admission semantics are not first-class. | Review should be a method selected by Evidence Admission, not a lifecycle shortcut. | Evidence Admission Zone |

## Priority

1. Implement Assignment Intent Zone.
2. Implement Evidence Admission Zone.
3. Implement Observation Artifact Zone.
4. Implement Reconciliation Zone.

Operator Input Zone remains important, but the immediate practical failures are assignment drift, evidence admission ambiguity, and output admission inconsistency.
