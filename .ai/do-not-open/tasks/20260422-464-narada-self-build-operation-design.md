---
status: closed
closed: 2026-04-22
depends_on: [444, 456]
implementation_blocked_by: [442, 454, 463]
---

# Task 464 — Narada Self-Build Operation Design

## Context

Narada has developed enough task-governance and runtime primitives to describe its own build-out as a governed operation:

- task graph files and chapter DAGs;
- roster and assignment records;
- WorkResultReports;
- review and closure artifacts;
- PrincipalRuntime;
- task recommendation;
- active learning recall;
- task graph lint/reservation/renumbering/chapter generation;
- CCC / teleological counterweighting concepts in the surrounding theory work;
- Site materialization work for Windows, macOS, Linux, and Cloudflare.

But the actual Narada build loop still runs mostly through chat:

```text
operator senses pressure
architect reasons in chat
operator assigns agents manually
agents execute tasks
architect reviews task artifacts manually
operator asks "where are we?"
```

This is coherent enough to work, but not yet a first-class Narada operation. If Narada is to be used as a USC-style system-construction charter over itself, the self-build operation needs a defined object model, loop, authority boundary, and implementation plan.

This is a design task only. It must not implement the runner. Implementation should wait for completion evidence enforcement (Task 463), Linux closure (Task 442), and Site bootstrap design/implementation (Task 454), unless the design explicitly narrows a safe earlier implementation slice.

## Goal

Define the canonical design for **Narada Self-Build Operation**: a governed construction operation that uses Narada's own task graph, roster, reviews, reports, PrincipalRuntime, learning artifacts, and CCC posture to guide the ongoing development of Narada.

The design must be biased toward **simplification and closure**, not expansion. It should prefer composing existing primitives over inventing new objects, packages, state machines, or runners. Any proposed new abstraction must pass a burden-of-proof test:

- What existing friction does it remove?
- Which current objects does it replace or simplify?
- What authority boundary does it clarify?
- What implementation or operator work becomes smaller because it exists?

If a proposal only makes the ontology more complete without reducing operational friction, classify it as deferred or rejected.

The design should answer:

- What is the operation's Aim?
- What are its inputs, durable objects, and outputs?
- What is the control loop?
- Which parts are advisory intelligence?
- Which parts are authority-bearing operators?
- What remains human/operator authority?
- What should be implemented next, and what must remain deferred?

## Required Work

### 1. Read core artifacts

Read at least:

- `SEMANTICS.md`
- `.ai/do-not-open/tasks/20260422-444-task-governance-principal-runtime-bridge-contract.md`
- `.ai/decisions/20260422-444-task-governance-principal-runtime-bridge.md`
- `.ai/do-not-open/tasks/20260422-456-implement-task-governance-principal-runtime-bridge.md`
- `.ai/do-not-open/tasks/20260422-463-task-completion-evidence-and-closure-enforcement.md`
- `.ai/do-not-open/tasks/20260422-454-site-bootstrap-contract-and-cli.md`
- `.ai/do-not-open/tasks/20260422-427-governed-promotion-recommendation-to-assignment.md`
- `.ai/do-not-open/tasks/20260422-425-work-result-report-governance-primitive.md`
- `.ai/do-not-open/tasks/20260422-426-assignment-recommendation-implementation.md`
- `docs/governance/task-graph-evolution-boundary.md`
- `docs/concepts/runtime-usc-boundary.md`

If these files have moved or been renamed, use the current equivalent artifacts.

### 2. Produce design decision

Create:

`.ai/decisions/20260422-464-narada-self-build-operation-design.md`

It must be self-standing and include:

- summary verdict;
- simplification/sprawl assessment;
- object model;
- loop/state machine;
- authority boundary;
- advisory/authoritative split;
- CCC integration;
- Site/runtime placement;
- implementation roadmap;
- residual risks.

### 3. Define object model

Define the operation's objects and classify each:

| Object | Role | Authoritative / Advisory / Derived | Owner |
|--------|------|------------------------------------|-------|
| Aim | Defines what Narada is trying to become | ? | ? |
| TaskGraph | Durable work substrate | ? | ? |
| Chapter | Work grouping / horizon | ? | ? |
| WorkResultReport | Attempt evidence | ? | ? |
| Review | Acceptance/rejection evidence | ? | ? |
| Roster | Coordination state | ? | ? |
| AssignmentRecommendation | Advisory routing | ? | ? |
| AssignmentPromotion | Authority-bearing transition | ? | ? |
| PrincipalRuntime | Runtime actor state | ? | ? |
| LearningArtifact | Accepted doctrine / behavioral constraint | ? | ? |
| CCCPosture | Coherence pressure coordinate | ? | ? |
| Site | Runtime locus for periodic inspection | ? | ? |

The design must preserve intelligence-authority separation.

The design must also mark each object as one of:

- `existing` — already implemented or documented and should be reused;
- `rename/clarify` — existing thing needs clearer naming or documentation only;
- `new-required` — new object is required and justified by concrete friction;
- `deferred` — plausible but not needed now;
- `rejected` — would add sprawl or collapse boundaries.

Minimize `new-required`.

### 4. Define self-build loop

Define a loop such as:

```text
observe repo/task state
derive posture and gaps
recommend next work
promote recommendation to assignment
execute task
submit report
review result
close or create corrective task
update learning/CCC/changelog
repeat
```

For each phase, specify:

- inputs;
- outputs;
- authority class;
- whether it is implemented today;
- what command or future command owns it.

### 5. Define chapter state machine

Define a chapter lifecycle, likely:

```text
proposed -> shaped -> executing -> review_ready -> closing -> closed -> committed
```

Specify:

- allowed transitions;
- evidence required for each transition;
- what command or operator should perform it;
- how it relates to task statuses and closure decisions.

Do not implement this state machine in this task.

### 6. Define CCC integration

Explain how CCC / teleological counterweighting should enter the operation without becoming arbitrary philosophy theater.

At minimum define:

- whether CCC posture is advisory or authoritative;
- where CCC evidence is stored;
- how CCC affects task recommendation;
- how CCC affects chapter closure;
- when CCC should be ignored.

The design must avoid making CCC a free-form excuse for any next task.

### 7. Define human/operator authority

Explicitly state which actions must remain human/operator-authorized in v0:

- accepting recommendations into assignments;
- closing chapters;
- approving commits;
- accepting learning artifacts;
- changing Aim or posture;
- approving live external effects.

If any of these should eventually be delegated, define the evidence required before delegation.

### 8. Relate to Site bootstrap

Decide where the self-build operation runs:

- no Site, pure CLI/ad hoc;
- local Site that periodically inspects repo state;
- ops repo Site distinct from Narada source repo;
- Cloudflare or other remote Site later.

This must reference Task 454 as a blocker for any real Site-backed implementation.

### 9. Produce implementation tasks if justified

If the design says implementation should proceed, create self-standing follow-up tasks for the next concrete slices.

Follow-up tasks must be minimal. Prefer one narrow closure task over a new chapter unless the design proves that multiple independent implementation slices are necessary.

Candidate slices:

- chapter state machine / status command;
- assignment promotion implementation from Task 427;
- self-build operation fixture;
- CCC posture artifact and recommender input;
- commit boundary recommendation;
- learning candidate extraction from review friction.

Do not implement any of them in this task.

Use the task reservation protocol. If the reservation tool is unavailable, document the fallback and update `.ai/do-not-open/tasks/tasks/.registry.json` manually.

## Non-Goals

- Do not implement the self-build operation runner.
- Do not implement assignment promotion unless it is created as a separate task.
- Do not create a new package unless the design proves existing CLI/control-plane/task-governance surfaces cannot host the behavior coherently.
- Do not introduce a new top-level object if an existing object can be clarified or composed.
- Do not create a new state machine unless it removes an existing ambiguous lifecycle.
- Do not make recommendations authoritative.
- Do not make PrincipalRuntime authoritative over task lifecycle.
- Do not auto-close chapters.
- Do not auto-commit.
- Do not create a Site-backed runner before Task 454 resolves Site bootstrap.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] Design decision exists at `.ai/decisions/20260422-464-narada-self-build-operation-design.md`.
- [x] Design includes an explicit simplification/sprawl assessment.
- [x] Object model classifies all major objects as authoritative/advisory/derived.
- [x] Object model classifies each object as existing, rename/clarify, new-required, deferred, or rejected.
- [x] Self-build loop phases are explicit and mapped to current/future commands.
- [x] Chapter state machine is defined with evidence gates.
- [x] CCC integration is precise and non-arbitrary.
- [x] Human/operator authority boundaries are explicit.
- [x] Site/runtime placement decision references Task 454.
- [x] Follow-up implementation tasks are created if justified.
- [x] Any new abstraction or follow-up task passes the burden-of-proof test for reducing operational friction.
- [x] No implementation code is added.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
test -f .ai/decisions/20260422-464-narada-self-build-operation-design.md
rg -n "Object Model|Self-Build Loop|Chapter State|CCC|Authority|Site|Implementation" .ai/decisions/20260422-464-narada-self-build-operation-design.md
find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

If only Markdown files are changed, do not run broad test suites.

## Execution Notes

### Core artifacts read

All required artifacts were read and analyzed:
- SEMANTICS.md (complete)
- Decision 444 (Task Governance / PrincipalRuntime Bridge Contract)
- Task 456 (Bridge Implementation)
- Task 463 (Completion Evidence)
- Task 454 (Site Bootstrap)
- Task 427 (Governed Promotion Design)
- Task 425 (WorkResultReport)
- Task 426 (Assignment Recommendation)
- docs/governance/task-graph-evolution-boundary.md
- docs/concepts/runtime-usc-boundary.md
- Decision 406 (PrincipalRuntime State Machine)
- Decision 412 (PrincipalRuntime Integration Contract)
- Decision 395 (CCC Rebalance)
- Decision 396 (Learning Loop Design)
- Task 430 (Active Learning Recall)

### Design decision delivered

`.ai/decisions/20260422-464-narada-self-build-operation-design.md` (28,957 bytes) includes:
- Summary verdict: design accepted, three narrow implementation tasks justified, Site-backed runner deferred
- Simplification/sprawl assessment: 11 proposed additions evaluated; 2 accepted as `new-required`, 5 rejected, 4 deferred
- Object model: 12 objects classified with role, authority, owner, classification, and burden-of-proof justification
- Self-build loop: 11 phases with inputs, outputs, authority, implementation status, and command owner
- Chapter state machine: 7 states, 8 transitions, evidence gates, derived-state rationale
- Authority boundary: authority classes by phase, PrincipalRuntime restrictions, task command restrictions
- Advisory/authoritative split: 5 advisory objects + 5 authoritative objects with consumption/absence behavior
- CCC integration: posture schema, recommender scoring rules, chapter closure requirements, 4 ignore conditions
- Site/runtime placement: pure CLI for v0, local Site for v1, ops repo Site for v2, Cloudflare rejected
- Implementation roadmap: 3 immediate tasks + 3 deferred tasks + 7 explicitly deferred capabilities
- Residual risks: 7 risks with likelihood, impact, and mitigation
- Follow-up tasks: Task 468, 469, 467 defined with acceptance criteria

### Follow-up tasks created

| Task | Title | Classification |
|------|-------|----------------|
| 468 | Assignment Promotion Implementation | `new-required` — Task 427 design, removes manual claim/assign friction |
| 469 | Chapter State Command | `new-required` — removes "is chapter done?" ambiguity |
| 467 | CCC Posture Artifact and Recommender Input | `new-required` — prevents arbitrary next-task selection |

Note: Tasks 468 and 469 were initially allocated as 465 and 466 but collided with existing reserved tasks (`task-graph-mermaid-inspection-operator` and `correct-task-allocate-cli-runtime-failure`). Renumbered to 468/469 to resolve collisions. Registry updated.

### Task number collision handling

During file creation, discovered that task numbers 465 and 466 were already reserved in `.ai/do-not-open/tasks/tasks/.registry.json` for other tasks. The collision was resolved by:
1. Renumbering `20260422-465-assignment-promotion-implementation.md` → `20260422-468-assignment-promotion-implementation.md`
2. Renumbering `20260422-466-chapter-state-command.md` → `20260422-469-chapter-state-command.md`
3. Updating task headings to match new numbers
4. Updating registry with new reservations for 467, 468, 469
5. Updating decision document references

### Verification

```bash
test -f .ai/decisions/20260422-464-narada-self-build-operation-design.md  # ✅
rg -n "Object Model|Self-Build Loop|Chapter State|CCC|Authority|Site|Implementation" .ai/decisions/20260422-464-narada-self-build-operation-design.md | wc -l  # 100+ matches
find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print  # 0 results
```

All acceptance criteria satisfied.
