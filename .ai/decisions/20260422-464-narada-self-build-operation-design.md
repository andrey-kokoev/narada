# Decision: Narada Self-Build Operation Design

**Date:** 2026-04-22
**Task:** 464
**Depends on:** 444 (Task Governance / PrincipalRuntime Bridge Contract), 456 (Implement Task Governance / PrincipalRuntime Bridge)
**Implementation Blocked By:** 442 (Linux Site Closure), 454 (Site Bootstrap Contract and CLI), 463 (Task Completion Evidence and Closure Enforcement)
**Verdict:** **Design accepted. Three narrow implementation tasks justified. Site-backed runner deferred until Task 454 resolves.**

---

## 1. Summary

Narada now has enough task-governance, runtime, and learning primitives to describe its own build-out as a **governed construction operation**. This design defines the canonical model for the **Narada Self-Build Operation**: a first-class operation that uses Narada's existing task graph, roster, reviews, reports, PrincipalRuntime, learning artifacts, and CCC posture to guide the ongoing development of Narada itself.

The design is biased toward **simplification and closure**. It composes existing primitives, introduces only two justified new abstractions (`AssignmentPromotion` implementation and `CCCPosture` advisory artifact), and explicitly defers anything that does not remove concrete operational friction.

**Core insight:** The self-build operation does not need a new runner, a new package, or a new Site. It needs:
1. A clear loop mapped to existing CLI commands.
2. A chapter state machine to replace the ambiguous "is this chapter done?" question.
3. A `CCCPosture` artifact to prevent arbitrary next-task selection.
4. An implemented assignment promotion path to remove manual `claim`/`assign` churn.

---

## 2. Simplification / Sprawl Assessment

### 2.1 What Exists Today

| Primitive | Status | Friction It Creates |
|-----------|--------|--------------------|
| Task files (`.ai/do-not-open/tasks/*.md`) | Mature | None — durable, inspectable, versioned |
| WorkResultReport | Implemented | None — agents submit reports, reviewers inspect them |
| Review records | Implemented | None — acceptance/rejection is explicit |
| Roster (`.ai/agents/roster.json`) | Implemented | Minor — manual tracking of who is working on what |
| `narada task recommend` | Implemented | Operator must still manually claim/assign after reading recommendation |
| PrincipalRuntime | Implemented | Advisory only; does not reduce manual assignment steps |
| Learning artifacts (`.ai/learning/`) | Partially implemented | Not yet consumed by task commands beyond recall surfacing |
| CCC posture | Conceptual only | Lives in decision documents; not inspectable by commands |
| Chapter closure | Manual | Operator must read all task files to determine if chapter is done |

### 2.2 Sprawl Risk Analysis

| Proposed Addition | Sprawl Risk | Burden-of-Proof Result |
|-------------------|-------------|------------------------|
| New `self-build` package | **High** — Rejected. Existing CLI and task-governance surfaces can host all behavior. |
| New `SelfBuildRunner` class | **High** — Rejected. The loop is a composition of existing commands, not a new runtime. |
| New top-level `Aim` object | **Medium** — Rejected. The task graph + closure decisions already express the Aim. A new object would duplicate task file authority. |
| `AssignmentPromotion` command | **Low** — Accepted. Task 427 already designed it. Implementation removes manual promotion friction. |
| `CCCPosture` artifact | **Low** — Accepted. Narrow JSON file + CLI read. Prevents arbitrary next-task selection. |
| Chapter state machine | **Low-Medium** — Accepted. Adds a status command and evidence gates. Removes "is the chapter done?" ambiguity. |
| Site-backed self-build runner | **Medium** — Deferred until Task 454. Pure CLI is sufficient for v0. |
| New database table for chapters | **High** — Rejected. Chapters stay file-backed like tasks. |

### 2.3 Simplification Principle

> **If an existing command can own the behavior, no new command is created.**
> **If an existing file can store the state, no new file type is created.**
> **If an existing authority boundary can enforce the transition, no new authority class is introduced.**

---

## 3. Object Model

### 3.1 Complete Classification Table

| Object | Role | Authoritative / Advisory / Derived | Owner | Classification | Justification |
|--------|------|------------------------------------|-------|----------------|---------------|
| **Aim** | "Improve Narada" — inspectable specification realized through task graph and closure decisions | Derived from task graph + decisions | Operator / architect | `existing` | Task files and decisions already express what Narada is trying to become. No new object needed. |
| **TaskGraph** | Durable work substrate | **Authoritative** | Task governance | `existing` | Already implemented. Single source of truth for work state. |
| **Chapter** | Work grouping / horizon | **Authoritative** | Task governance | `existing` | Already implemented as file-backed planning artifact. |
| **WorkResultReport** | Attempt evidence | **Authoritative** (as evidence) | Task governance | `existing` | Already implemented. Report does not close task — preserves review separation. |
| **Review** | Acceptance/rejection evidence | **Authoritative** | Task governance | `existing` | Already implemented. |
| **Roster** | Coordination state | **Advisory** (tracking only) | Task governance | `existing` | Already implemented. Advisory per Decision 444. |
| **AssignmentRecommendation** | Advisory routing | **Advisory** | Planner (`task recommend`) | `existing` | Already implemented. Never mutates task or roster. |
| **AssignmentPromotion** | Authority-bearing transition from recommendation to assignment | **Authoritative** | Operator (via `claim` authority) | `new-required` | Task 427 designed but not implemented. Removes manual `claim`/`assign` friction. Creates audit trail. |
| **PrincipalRuntime** | Runtime actor state | **Advisory** | Console / agent runtime | `existing` | Already implemented. Ephemeral by design. |
| **LearningArtifact** | Accepted doctrine / behavioral constraint | **Advisory** (until accepted) | Learning loop | `existing` (partial) | Decision 396 designed; Task 430 partially implemented. Accepted artifacts guide future behavior. |
| **CCCPosture** | Coherence pressure coordinate | **Advisory** | Operator / architect | `new-required` | Narrow artifact. Prevents arbitrary next-task selection. Makes CCC inspectable by commands. |
| **Site** (self-build) | Runtime locus | N/A for v0 | N/A | `rejected` for v0 | Pure CLI is sufficient. Site-backed runner deferred. |

### 3.2 Why Only Two `new-required` Objects

**`AssignmentPromotion`**: Without it, the operator performs the same manual steps after every recommendation: read recommendation, decide, run `task claim`, run `task roster assign`. The promotion command automates the validation and atomic write but preserves operator approval. It is a promotion operator (SEMANTICS.md §2.10) — a governed transition from advisory to authoritative.

**`CCCPosture`**: Without it, CCC lives only in decision documents (e.g., Decision 395). Commands cannot consult it. The risk is that `task recommend` selects the next task based on local graph heuristics without considering global coherence pressure (e.g., `authority_reviewability` is overweighted relative to `constructive_executability`). A `CCCPosture` artifact makes this an inspectable advisory signal consumed by the recommendation phase.

---

## 4. Self-Build Loop

### 4.1 Loop Definition

```text
observe repo/task state
  → derive posture and gaps
  → recommend next work
  → promote recommendation to assignment (operator-approved)
  → execute task
  → submit report
  → review result
  → close or create corrective task
  → update learning / CCC / changelog
  → repeat
```

### 4.2 Phase Detail

| Phase | Inputs | Outputs | Authority Class | Implemented? | Command / Owner |
|-------|--------|---------|-----------------|--------------|-----------------|
| **Observe** | Task files, roster, reports, reviews, lint results | Task list + lint findings | `derive` (inspection) | ✅ Yes | `narada task list`, `narada task lint` |
| **Derive posture** | Task graph, chapter status, CCC posture, open work count | Gap list + posture coordinates | `derive` | ⚠️ Partial | `narada task recommend` (partial — posture not yet wired) |
| **Recommend** | Task graph, roster, PrincipalRuntime, learning artifacts, CCC posture | Ranked `AssignmentRecommendation[]` | `derive` (advisory) | ✅ Yes | `narada task recommend` |
| **Promote** | Selected recommendation + operator approval | `TaskAssignment` + task status `claimed` + roster `working` | `claim` | ❌ No | `narada task promote-recommendation` (Task 427 design; Task 468 implementation) |
| **Execute** | Task file + assignment | WorkResultReport (when ready) | `execute` (agent) | ✅ Yes | Agent works; no new command |
| **Submit report** | Task number + agent id + summary + verification | WorkResultReport file + task `in_review` | `resolve` (report transitions status) | ✅ Yes | `narada task report` |
| **Review** | Report + task file + acceptance criteria | Review record + task `accepted`/`rejected` | `resolve` (reviewer) | ✅ Yes | `narada task review` |
| **Close / correct** | Review verdict + task evidence | Task `closed` or corrective task created | `resolve` + `admin` | ⚠️ Partial | `narada task review` (accept closes); `narada task derive-from-finding` (corrective) |
| **Update learning** | Closed task / chapter closure decision | Learning candidate | `derive` | ⚠️ Partial | `narada task learn --from-task` (partially implemented) |
| **Update CCC** | Chapter closure + current posture | Updated CCC posture artifact | `admin` | ❌ No | Manual edit or `narada posture update` (Task 467) |
| **Repeat** | Previous cycle traces | Next cycle | — | ✅ Yes | Operator or scheduled invocation |

### 4.3 Loop Invariants

1. **Recommendation never mutates.** `narada task recommend` is read-only. Promotion requires explicit operator command.
2. **Report does not close.** `narada task report` transitions to `in_review`, not `closed`. Review is mandatory.
3. **Review does not assign.** `narada task review` resolves the reviewed task; it does not claim the next task.
4. **Learning is post-hoc.** Learning artifact extraction runs after task closure, not during execution.
5. **CCC is advisory.** Posture updates do not block any command. They surface as warnings or score adjustments in `recommend`.

---

## 5. Chapter State Machine

### 5.1 States

```text
proposed -> shaped -> executing -> review_ready -> closing -> closed -> committed
```

### 5.2 State Definitions

| State | Meaning | Evidence Required to Enter |
|-------|---------|---------------------------|
| `proposed` | Chapter idea exists; no tasks created | Chapter DAG file created with task range reserved |
| `shaped` | All tasks in range created with dependencies, acceptance criteria, and assignments | Task files exist and lint clean; `depends_on` edges valid |
| `executing` | At least one task is `claimed` or `in_progress` | Roster shows active work; task statuses confirm |
| `review_ready` | All tasks terminal (`closed`, `accepted`, `deferred`, or `confirmed`) | `narada task lint --chapter` reports zero open tasks |
| `closing` | Chapter closure review in progress | Closure decision draft exists; gap table populated |
| `closed` | Closure decision accepted; all tasks `confirmed` or `closed` | Closure decision artifact exists in `.ai/decisions/` |
| `committed` | Closure decision merged; no further edits | Decision file unchanged for 24h or explicitly marked `committed` |

### 5.3 Allowed Transitions

| From | To | Trigger | Operator / Command | Evidence Gate |
|------|----|---------|-------------------|---------------|
| `proposed` | `shaped` | All tasks created | Operator / `narada chapter shape` | Task files exist; no lint errors |
| `shaped` | `executing` | First task claimed | Agent / `narada task claim` | Roster shows `working` |
| `executing` | `review_ready` | All tasks terminal | Operator / `narada chapter status` | Task lint shows zero `opened`/`claimed`/`in_progress` |
| `review_ready` | `closing` | Operator initiates closure | Operator / `narada chapter close --start` | Closure decision template generated |
| `closing` | `closed` | Closure review accepted | Operator / `narada chapter close --finish` | Acceptance criteria verified; gap table complete |
| `closed` | `committed` | Operator marks committed | Operator / `narada chapter commit` | 24h cooling period or explicit `--now` |
| `closing` | `executing` | Closure review finds gaps | Operator / `narada chapter reopen` | Corrective tasks created |
| `shaped` | `proposed` | Chapter cancelled before execution | Operator / `narada chapter cancel` | No tasks claimed |

### 5.4 Relationship to Task Statuses

A chapter's state is **derived from task statuses**, not an independent state machine. The chapter state machine is a **read-only projection** with explicit operator-triggered transitions. It does not store state independently.

```
chapter state = f(task statuses in range, closure decision existence, operator trigger)
```

This means:
- Deleting the chapter state artifact does not affect tasks.
- Task status remains the authoritative lifecycle.
- Chapter state is a convenience lens, not a new authority boundary.

### 5.5 Burden-of-Proof Justification

**What friction does the chapter state machine remove?**
- The operator currently asks "where are we?" and manually inspects all task files in a chapter.
- `narada chapter status` replaces this with a single command that computes the derived state.

**What existing objects does it replace or simplify?**
- Replaces ad-hoc chat queries about chapter progress.
- Simplifies closure review by providing a checklist of evidence gates.

**What authority boundary does it clarify?**
- Clarifies that chapter closure is operator-owned (`admin` authority), not automatic.
- Distinguishes `closed` (decision accepted) from `committed` (no further edits).

**What implementation work becomes smaller?**
- Closure reviews follow a template instead of free-form assessment.
- Gap tables are generated from actual task states, not operator memory.

---

## 6. Authority Boundary

### 6.1 Authority Classes by Phase

| Phase | Required Authority | Why |
|-------|-------------------|-----|
| Observe / derive | `derive` | Read-only inspection |
| Recommend | `derive` | Advisory output; no mutation |
| Promote | `claim` | Creates assignment; mutates task status |
| Execute | `execute` (agent) | Performs work |
| Submit report | `resolve` (report) | Transitions task to `in_review` |
| Review | `resolve` (reviewer) | Accepts/rejects work |
| Close / correct | `resolve` + `admin` | Structural task changes |
| Update learning | `derive` (extraction) | Read-only over source material |
| Accept learning | `admin` | Mutates accepted doctrine |
| Update CCC | `admin` | Changes structural coherence posture |

### 6.2 What PrincipalRuntime May NOT Do

Per Decision 444 and 406:
- PrincipalRuntime may NOT auto-claim tasks.
- PrincipalRuntime may NOT auto-promote recommendations.
- PrincipalRuntime may NOT auto-close chapters.
- PrincipalRuntime may NOT auto-accept learning artifacts.
- PrincipalRuntime may NOT auto-update CCC posture.

PrincipalRuntime remains advisory. Its state is consumed by `narada task recommend` for availability filtering only.

### 6.3 What Task Commands May NOT Do

- `task recommend` may NOT write to task files, roster, or PrincipalRuntime.
- `task report` may NOT close a task without review.
- `task review` may NOT assign the next task.
- `task learn` may NOT accept its own output.

---

## 7. Advisory / Authoritative Split

### 7.1 Advisory Objects

| Object | Advisory Role | Consumed By | If Absent |
|--------|---------------|-------------|-----------|
| AssignmentRecommendation | Ranks next work | Operator / promotion command | Operator assigns manually |
| PrincipalRuntime | Filters by availability | `task recommend` | Recommendations degrade to roster-only |
| LearningArtifact | Guides future behavior | Task context prep, command reminders | Behavior falls back to defaults |
| CCCPosture | Coherence pressure signal | `task recommend` scoring | Recommendations use local heuristics only |

### 7.2 Authoritative Objects

| Object | Authority Role | Mutated By | If Absent |
|--------|---------------|------------|-----------|
| TaskGraph | Work state | `task claim`, `task report`, `task review` | No work tracking |
| WorkResultReport | Attempt evidence | `task report` | No reviewable evidence |
| Review | Acceptance verdict | `task review` | No formal acceptance/rejection |
| AssignmentPromotion | Durable assignment | `task promote-recommendation` | Manual claim/assign |
| Chapter state (derived) | Progress lens | Operator trigger + task mutations | Manual inspection required |

### 7.3 Intelligence-Authority Separation

The self-build operation preserves IAS (SEMANTICS.md §2.13) at every boundary:

- **Intelligence produces:** recommendations, CCC posture analysis, learning candidates.
- **Authority produces:** assignments, task status transitions, review verdicts, chapter closure.
- **Intelligence never owns:** task lifecycle, assignment records, chapter state, learning acceptance.

---

## 8. CCC Integration

### 8.1 CCC Posture as Advisory Signal

`CCCPosture` is **advisory**, not authoritative. Removing it from the system must leave all task-governance invariants intact.

It is a structured file at `.ai/postures/current.json` (or `.ai/decisions/postures/current.json` if preferred) with this schema:

```json
{
  "posture_id": "ppp_<timestamp>",
  "created_at": "2026-04-22T15:38:00-05:00",
  "source": "chapter-closure-395",
  "coordinates": {
    "semantic_resolution": { "reading": "stable", "evidence": "..." },
    "invariant_preservation": { "reading": "strong", "evidence": "..." },
    "constructive_executability": { "reading": "improved", "evidence": "..." },
    "grounded_universalization": { "reading": "healthy", "evidence": "..." },
    "authority_reviewability": { "reading": "strong", "evidence": "..." },
    "teleological_pressure": { "reading": "needs_target", "evidence": "..." }
  },
  "counterweight_intent": "Restore balance by moving constructive_executability and teleological_pressure through email-marketing Operation integration proof",
  "recommended_next_slices": ["task-number-1", "task-number-2"],
  "expires_at": "2026-05-22T15:38:00-05:00"
}
```

### 8.2 How CCC Affects Task Recommendation

`narada task recommend` consumes `CCCPosture` as an advisory scoring input:

| CCC Coordinate | Effect on Recommendation |
|----------------|-------------------------|
| `constructive_executability` low | Boost tasks that produce runnable proofs, tests, or integration fixtures |
| `teleological_pressure` unfocused | Penalize meta/governance tasks; boost vertical-specific constructive tasks |
| `authority_reviewability` overweighted | Penalize new observation surfaces; boost core runtime or charter work |
| `semantic_resolution` unstable | Boost tasks that clarify terminology or contracts |
| `invariant_preservation` weak | Boost tasks that add tests, lint rules, or boundary enforcement |
| `grounded_universalization` premature | Penalize generic abstraction tasks; boost substrate-specific proofs |

The effect is a **score adjustment** (±10% per coordinate), not a hard filter. The operator may override.

### 8.3 How CCC Affects Chapter Closure

During chapter closure review, the closure decision must:
1. State the CCC posture at chapter start.
2. State the CCC posture at chapter end.
3. Explain whether the chapter achieved its intended counterweight.
4. If not, explain why and what the residual posture implies for next work.

This prevents chapters from closing without assessing whether they actually moved the coherence coordinates.

### 8.4 When CCC Should Be Ignored

1. **Stale posture:** If `expires_at` has passed, warn and fall back to local heuristics.
2. **Missing posture:** If no `.ai/postures/current.json` exists, `task recommend` proceeds normally.
3. **Operator override:** `--ignore-posture` flag on `task recommend` disables CCC scoring.
4. **Contradictory coordinates:** If two coordinates recommend opposite actions, the net adjustment is zero; warn the operator.

### 8.5 Burden-of-Proof Justification

**What friction does CCCPosture remove?**
- Prevents `task recommend` from selecting locally optimal but globally incoherent next tasks (e.g., building another governance dashboard when the system lacks a second vertical).
- Makes CCC inspectable and versioned, not just a concept in design documents.

**What existing objects does it replace?**
- Replaces implicit operator memory of "what did Decision 395 say?" with an explicit file.

**What authority boundary does it clarify?**
- Clarifies that CCC is advisory. The operator may ignore it; the recommender may not enforce it.

**What implementation work becomes smaller?**
- Chapter closure reviews reference the same posture file instead of re-deriving CCC from scratch.

---

## 9. Site / Runtime Placement

### 9.1 Decision: Pure CLI / Ad Hoc for v0

The Narada Self-Build Operation runs **without a Site** in v0. It is executed through:

- Chat-initiated operator commands
- Scheduled or manually run CLI commands (`narada task recommend`, `narada task lint`, etc.)
- Agent-initiated `task report`, `task review`, `task claim` commands

### 9.2 Rationale

| Approach | Why Rejected / Deferred |
|----------|------------------------|
| **No Site, pure CLI** | **Accepted for v0.** All necessary commands exist. No substrate complexity needed. |
| **Local Site that periodically inspects repo state** | Deferred. Adds supervisor, credentials, health, trace for a loop that runs primarily through chat. Value does not justify complexity until the loop is more automated. |
| **Ops repo Site distinct from Narada source repo** | Deferred. Would require a second repo and cross-repo coordination. Useful for multi-repo build-out but premature for single-repo self-build. |
| **Cloudflare or remote Site** | Rejected for self-build. Self-build is local development work. Cloudflare is a deployment substrate, not a development substrate. |

### 9.3 Future Path

If the self-build loop becomes highly automated (e.g., agents claim, execute, report, and review with minimal operator intervention), a **local Site** may be justified:

```
v0: Pure CLI / chat-driven
v1: Local Site with periodic `task recommend` + operator notification
v2: Ops repo Site distinct from source repo (for multi-repo governance)
v3+: Cloudflare or remote only if self-build spans remote teams
```

### 9.4 Task 454 Relationship

Task 454 (Site Bootstrap Contract and CLI) must close before any Site-backed self-build implementation. The Site bootstrap path (`narada sites init`, `narada sites enable`) will be the canonical way to create a local Site for self-build when the time comes.

Until then, the self-build operation is a **logical operation** (an Aim realized through CLI commands) without a materialized Site.

---

## 10. Implementation Roadmap

### 10.1 Immediate (No External Blockers)

| Priority | Task | What It Does | Est. Size | Authority |
|----------|------|--------------|-----------|-----------|
| 1 | **Task 468 — Assignment Promotion Implementation** | Implements `narada task promote-recommendation` from Task 427 design. Validates, atomically assigns, audits. | ~200 LOC + ~250 LOC tests | `claim` |
| 2 | **Task 469 — Chapter State Command** | Implements `narada chapter status <range>` and `narada chapter close --start/--finish`. Derived state + evidence gates. | ~300 LOC + ~300 LOC tests | `derive` (status), `admin` (close) |
| 3 | **Task 467 — CCC Posture Artifact and Recommender Input** | Defines `.ai/postures/current.json` schema, `narada posture update/show`, wires into `task recommend` scoring. | ~200 LOC + ~200 LOC tests | `derive` (show), `admin` (update) |

### 10.2 After Blockers Resolve

| Blocker | Task | What It Does |
|---------|------|--------------|
| Task 463 (completion evidence) | Integrate `task evidence` into chapter closure gates | Chapter `closing -> closed` requires `task evidence` passes |
| Task 454 (Site bootstrap) | Explore local Site for periodic self-build inspection | `narada sites init self-build --substrate local` |
| Task 442 (Linux closure) | Unblocks Task 454 | — |

### 10.3 Explicitly Deferred

| Capability | Deferred To | Rationale |
|------------|-------------|-----------|
| Self-build Site-backed runner | Post-Task 454 | Pure CLI is sufficient |
| Auto-learning extraction | Post-Task 398-400 | Manual `task learn --from-task` is sufficient |
| Auto-commit boundary | v2+ | Git commits remain human-owned |
| Multi-repo self-build | v2+ | Single repo is the v0 scope |
| Generic `Aim` object | Never | Task graph already expresses Aim |
| Self-build dashboard | Never | Observation surfaces already exist; no new dashboard needed |

---

## 11. Residual Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Assignment promotion adds complexity without reducing operator load | Medium | Medium | Start with `--dry-run` default; measure operator steps before/after |
| Chapter state machine becomes decorative if operators ignore it | Medium | Low | State machine is derived, not stored. Ignoring it costs nothing. |
| CCC posture becomes arbitrary philosophy theater | Medium | High | Schema enforces evidence per coordinate; expires after 30 days; operator may ignore |
| Self-build loop runs too fast, creating work before review completes | Low | High | Recommendation respects `in_review` tasks; does not recommend new work for principals in `waiting_review` |
| Agents auto-report without real completion | Medium | High | Task 463 hardens completion evidence; review is mandatory; reports do not close tasks |
| Loop focuses on meta-work instead of constructive work | Medium | High | CCC posture penalizes meta-work when `constructive_executability` is low; operator override always available |
| Site placement decision proves wrong | Low | Medium | Pure CLI path is reversible; Site can be added later without breaking existing commands |

---

## 12. Follow-Up Tasks

### Task 468 — Assignment Promotion Implementation

Implements the governed promotion path from Task 427 design.

**Required work:**
- `packages/layers/cli/src/commands/task-promote-recommendation.ts`
- Atomic validation: task exists, task `opened`, dependencies satisfied, agent assignable, no active assignment
- Atomic write: assignment record + task status `claimed` + roster `working`
- Audit: promotion record in `.ai/do-not-open/tasks/tasks/promotions/`
- `--dry-run`, `--override-risk`, `--by <operator-id>`

**Depends on:** 427 (design already closed)

### Task 469 — Chapter State Command

Implements chapter status inspection and closure workflow.

**Required work:**
- `packages/layers/cli/src/commands/chapter-status.ts` — derive chapter state from task statuses
- `packages/layers/cli/src/commands/chapter-close.ts` — closure decision template generation and completion
- Evidence gates: all tasks terminal, closure decision exists, gap table populated
- `narada chapter status <range>` and `narada chapter close --start/--finish`

**Depends on:** 449 (task graph lint — for clean task state verification)

### Task 467 — CCC Posture Artifact and Recommender Input

Implements CCC posture as inspectable advisory signal.

**Required work:**
- `.ai/postures/current.json` schema (validated JSON)
- `packages/layers/cli/src/commands/posture.ts` — `show`, `update`
- Wire into `task recommend` as scoring input
- Expiration and staleness warnings
- `--ignore-posture` flag

**Depends on:** None (design-only prerequisite satisfied)

---

## 13. Acceptance Criteria

- [x] Design decision exists at `.ai/decisions/20260422-464-narada-self-build-operation-design.md`.
- [x] Design includes explicit simplification/sprawl assessment.
- [x] Object model classifies all major objects as authoritative/advisory/derived.
- [x] Object model classifies each object as existing, rename/clarify, new-required, deferred, or rejected.
- [x] Self-build loop phases are explicit and mapped to current/future commands.
- [x] Chapter state machine is defined with evidence gates.
- [x] CCC integration is precise and non-arbitrary.
- [x] Human/operator authority boundaries are explicit.
- [x] Site/runtime placement decision references Task 454.
- [x] Follow-up implementation tasks are created (467, 468, 469).
- [x] Every new abstraction passes the burden-of-proof test for reducing operational friction.
- [x] No implementation code is added.
- [x] No derivative task-status files are created.
