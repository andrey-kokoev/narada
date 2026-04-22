# Decision: Construction Loop Controller Design

**Date:** 2026-04-22
**Task:** 470
**Depends on:** 463 (Task Completion Evidence and Closure Enforcement), 465 (Task Graph Mermaid Inspection Operator), 468 (Assignment Promotion Implementation), 469 (Chapter State Command)
**Verdict:** **Design accepted. Controller classified as "promotion assistant requiring operator approval." Three narrow implementation tasks justified. No auto-promotion in v0.**

---

## 1. Summary

Narada now has the individual operators for task-governed multi-agent development, but the operator still manually performs the control loop:

```text
observe roster → inspect graph → choose next task → assign agent → wait → mark done → inspect evidence → route review → close or correct → repeat
```

This design defines the **Construction Loop Controller**: a bounded, operator-owned coordination layer that composes existing operators into a single inspect/plan surface without collapsing recommendation into authority.

The controller is **not** a new runtime, not a new authority class, and not an autonomous dispatcher. It is a **read-plan-assist** layer that reduces operator burden by automating the mechanical observation and planning steps while keeping all mutations under explicit operator approval.

**Key principle:** The controller may *recommend* and *plan*; it may *not* assign, claim, close, review, or commit without operator approval.

---

## 2. Controller Autonomy Classification

### 2.1 Evaluated Classes

| Class | What It May Read | What It May Write | Operators It Invokes | What Must Remain Human-Owned | Justification for This Task |
|-------|-----------------|-------------------|---------------------|------------------------------|----------------------------|
| **Inspection-only assistant** | Roster, task graph, task evidence, chapter status, recommendations | Nothing | `task roster show`, `task graph`, `task evidence`, `chapter status` | Everything | Too narrow — does not address the operator's main burden (choosing and assigning) |
| **Recommendation assistant** | All of the above + recommendation scores | Nothing | + `task recommend` | Assignment, promotion, review, closure | Removes "choose next task" burden but operator still manually runs each command separately |
| **Promotion assistant requiring operator approval** (✅ **Selected**) | All of the above | Policy file, loop plan, promotion audit records (append-only) | + `task promote-recommendation --dry-run` | Actual promotion, assignment, review, closure, chapter commit | Removes mechanical observation + planning burden; preserves operator authority over all mutations |
| **Bounded auto-promoter under narrow policy** | All of the above | Task claims, roster assignments, promotion records | + `task promote-recommendation` (live), `task roster assign` | Review, closure, chapter commit, policy changes | Requires high confidence in recommendation accuracy and mature policy gates. Not justified until Task 468 has been exercised extensively and Task 469 is closed. |
| **Full autonomous dispatcher** | Everything | Everything including task closure | All operators | Nothing | Rejected. Violates core authority boundaries (Decision 444, 464). |

### 2.2 Why "Promotion Assistant Requiring Operator Approval" Is the Right Class for v0

- **Task 468** (promotion) is newly implemented and has not been exercised at scale. Auto-promotion would skip the validation learning phase.
- **Task 469** (chapter state) is not yet closed. Closure workflow is still maturing.
- **Evidence gates** (Task 463) are newly hardened. The operator needs to observe how they behave before delegating promotion decisions.
- **Recommendation quality** is not yet measured. We have no baseline for false-positive rate, stale recommendation rate, or write-set risk accuracy.
- **Authority boundary** from Decision 464: "Human operator retains all promotion, closure, commit, learning acceptance, and posture authority in v0."

### 2.3 Future Autonomy Escalation Path

If the promotion assistant operates successfully for N cycles (suggested: 20+ promotions with <5% operator override rate), a follow-up task may propose bounded auto-promotion under a tightened policy. This is explicitly out of scope for Task 470.

---

## 3. Minimal v0 Loop

### 3.1 Loop Steps

```text
1. LOAD POLICY
   → Read .ai/construction-loop/policy.json
   → Validate policy shape; fail closed on invalid policy

2. OBSERVE ROSTER
   → Run equivalent of `narada task roster show --format json`
   → Identify idle agents, working agents, blocked agents, done agents
   → Flag stale agents (no update > stale_agent_timeout_ms)

3. OBSERVE GRAPH
   → Run equivalent of `narada task graph --format json --status opened,claimed,in_progress,reported,in_review`
   → Identify runnable tasks, blocked tasks, in-review tasks, active assignments

4. INSPECT EVIDENCE FOR CANDIDATES
   → For each open task with no active assignment:
     → Run equivalent of `narada task evidence <n> --format json`
     → Classify: incomplete | attempt_complete | needs_review | needs_closure | complete
   → For each task marked done by agent but not closed:
     → Flag for review/closure recommendation

5. DERIVE CHAPTER STATES
   → For each known chapter range:
     → Run equivalent of `narada chapter status <range> --format json`
     → Identify chapters ready for closure (review_ready)

6. GENERATE RECOMMENDATIONS
   → Run equivalent of `narada task recommend --format json`
   → Capture primary recommendation, alternatives, abstained tasks

7. PRODUCE PROMOTION CANDIDATES
   → Filter recommendations against policy:
     → Agent in allowed_agent_ids?
     → Task number not in blocked_task_ranges?
     → Simultaneous assignments ≤ max_simultaneous_assignments?
     → Write-set risk ≤ policy threshold?
     → Review separation rules satisfied?
   → Score and rank filtered candidates

8. EMIT DRY-RUN PLAN (if policy allows)
   → For top candidate(s):
     → Run equivalent of `narada task promote-recommendation --task <n> --agent <id> --by controller --dry-run --format json`
     → Capture validation results
   → Produce structured operator plan

9. STOP AND EMIT
   → Output plan in human or JSON format
   → Include: observations, recommendations, promotion candidates, dry-run results, suggested next actions
   → Do not mutate any state
```

### 3.2 Stop Conditions

The loop stops (does not proceed to emit a plan) when any of the following are true:

| Condition | Behavior |
|-----------|----------|
| Policy file missing or invalid | Error with policy validation failures |
| All agents busy (no idle agents) | Emit plan with "no assignable agents" and suggested wait actions |
| No runnable tasks | Emit plan with "no runnable tasks" and chapter/closure suggestions |
| max_tasks_per_cycle already assigned this cycle | Emit plan noting cycle limit reached |
| Operator explicitly paused the controller | Emit "controller paused by operator" |

### 3.3 Why the Loop Stops Before Promotion

The v0 loop is **plan-only**. It produces a coherent operator plan that the human can review and execute with a single command or a small sequence. It does not perform the promotion because:

1. Operator judgment is still the cheapest safety mechanism.
2. The recommendation engine's false-positive rate is unmeasured.
3. Write-set risks require contextual understanding that the recommender may not capture.
4. Review separation (who should review what) is a policy decision, not a graph property.

### 3.4 Operator Execution Path After Plan

After reviewing the plan, the operator may run:

```bash
# Option A: Accept top recommendation
narada task promote-recommendation --task <n> --agent <id> --by <operator>

# Option B: Accept with override
narada task promote-recommendation --task <n> --agent <id> --by <operator> --override-risk "<reason>"

# Option C: Choose alternative
narada task promote-recommendation --task <alt_n> --agent <alt_id> --by <operator>

# Option D: Close a ready chapter
narada chapter close <range> --start

# Option E: Do nothing (plan was advisory)
```

---

## 4. Policy File Shape

### 4.1 Location

```text
.ai/construction-loop/policy.json
```

### 4.2 Schema

```typescript
interface ConstructionLoopPolicy {
  version: number;                    // Schema version (1 for v0)
  allowed_autonomy_level: 'inspect' | 'recommend' | 'plan' | 'bounded_auto' | 'full_auto';
                                      // v0 default: 'plan'
  require_operator_approval_for_promotion: boolean;  // v0 default: true
  dry_run_default: boolean;           // v0 default: true
  allow_auto_review: boolean;         // v0 default: false

  // Assignment bounds
  max_simultaneous_assignments: number;  // v0 default: 2
  max_tasks_per_cycle: number;           // v0 default: 1
  max_tasks_per_agent_per_day: number;   // v0 default: 3

  // Agent constraints
  allowed_agent_ids: string[];        // Empty = all agents allowed
  blocked_agent_ids: string[];        // Agents never to assign via controller
  preferred_agent_ids: string[];      // Agents to prefer when scores are tied

  // Task constraints
  blocked_task_ranges: Array<{ start: number; end: number }>;
  blocked_task_numbers: number[];     // Individual blocked tasks
  require_evidence_before_promotion: boolean;  // v0 default: false (recommender handles this)

  // Review separation
  review_separation_rules: {
    reviewer_cannot_review_own_work: boolean;     // default: true
    max_reviews_per_reviewer_per_day: number;     // default: 3
    require_different_agent_for_review: boolean;  // default: true
  };

  // Risk thresholds
  max_write_set_risk_severity: 'none' | 'low' | 'medium' | 'high';  // default: 'medium'
  max_recommendation_age_minutes: number;  // default: 60

  // Stale detection
  stale_agent_timeout_ms: number;     // default: 30 * 60 * 1000 (30 min)

  // Stop conditions
  stop_conditions: {
    on_all_agents_busy: 'wait' | 'recommend_anyway' | 'stop';
    on_no_runnable_tasks: 'suggest_closure' | 'suggest_new_tasks' | 'stop';
    on_cycle_limit_reached: 'stop' | 'queue_for_next_cycle';
    on_policy_violation: 'warn_and_continue' | 'stop' | 'escalate';
  };

  // CCC integration (advisory)
  ccc_posture_path?: string;          // default: '.ai/ccc/posture.json'
  ccc_influence_weight: number;       // 0.0–1.0, default: 0.3
}
```

### 4.3 Validation Rules

- `allowed_autonomy_level` must be one of the enum values.
- If `allowed_autonomy_level` is `'inspect'`, the controller emits only observations (steps 2–3).
- If `allowed_autonomy_level` is `'recommend'`, the controller emits observations + recommendations (steps 2–6).
- If `allowed_autonomy_level` is `'plan'`, the controller emits the full plan including dry-run promotion candidates (steps 2–8).
- `bounded_auto` and `full_auto` are **reserved but not implemented in v0**. If set, the controller fails with "autonomy level not yet supported."
- `max_simultaneous_assignments` must be ≥ 1.
- `max_tasks_per_cycle` must be ≥ 1.
- `ccc_influence_weight` must be 0.0–1.0.

### 4.4 Default Policy (v0)

```json
{
  "version": 1,
  "allowed_autonomy_level": "plan",
  "require_operator_approval_for_promotion": true,
  "dry_run_default": true,
  "allow_auto_review": false,
  "max_simultaneous_assignments": 2,
  "max_tasks_per_cycle": 1,
  "max_tasks_per_agent_per_day": 3,
  "allowed_agent_ids": [],
  "blocked_agent_ids": [],
  "preferred_agent_ids": [],
  "blocked_task_ranges": [],
  "blocked_task_numbers": [],
  "require_evidence_before_promotion": false,
  "review_separation_rules": {
    "reviewer_cannot_review_own_work": true,
    "max_reviews_per_reviewer_per_day": 3,
    "require_different_agent_for_review": true
  },
  "max_write_set_risk_severity": "medium",
  "max_recommendation_age_minutes": 60,
  "stale_agent_timeout_ms": 1800000,
  "stop_conditions": {
    "on_all_agents_busy": "wait",
    "on_no_runnable_tasks": "suggest_closure",
    "on_cycle_limit_reached": "stop",
    "on_policy_violation": "stop"
  },
  "ccc_posture_path": ".ai/ccc/posture.json",
  "ccc_influence_weight": 0.3
}
```

---

## 5. Agent State Machine Interaction

### 5.1 Controller's View of Agents

The controller does **not** manage agents directly. It reads the roster and produces recommendations. The roster state machine remains the canonical operational model:

```text
idle → assigned → working → reported → reviewing → done
  ↑_________________________________________________|
```

### 5.2 Controller Observations

| Roster State | Controller Interpretation | Action |
|--------------|--------------------------|--------|
| `idle` | Agent available for assignment | Include in candidate pool |
| `working` | Agent occupied | Exclude from candidate pool; track for staleness |
| `reviewing` | Agent occupied with review | Exclude from candidate pool |
| `blocked` | Agent stalled | Flag in plan; suggest unblock action |
| `done` | Agent available; may have context from last task | Include in candidate pool; consider affinity |

### 5.3 Stale Agent Detection

An agent is **stale** when:
- Roster status is `working` or `reviewing`
- `last_update` timestamp is older than `stale_agent_timeout_ms`
- No WorkResultReport exists for the assigned task (if working)
- No review artifact exists for the assigned task (if reviewing)

The controller **does not** automatically mark stale agents as `done` or `idle`. It flags them in the plan with a suggested operator action:

```text
⚠ Agent a6 is stale (working on task 470, no update for 45 min).
   Suggested action: narada task roster done a6 --task 470
   Or inspect: narada task evidence 470
```

### 5.4 Roster Is Operational, Not Task Truth

The controller respects the separation from Decision 444 and Task 463:

- **Roster state** tells us who the controller *thinks* is doing what. It is advisory.
- **WorkResultReport / task evidence** tells us what has actually been accomplished. It is authoritative evidence.
- The controller uses roster for assignment pool filtering.
- The controller uses task evidence for promotion gating and stale detection.
- The controller never infers task completion from roster `done` alone.

### 5.5 Chat Messages Are Not Authoritative

**Explicit invariant:** The controller must not parse chat messages, conversation history, or agent commentary as evidence of task completion, review verdict, or block resolution.

Only these artifacts are authoritative:
- Task file front matter (`status`, acceptance criteria checkboxes)
- WorkResultReport files
- Review record files
- Closure decision files
- Promotion audit records

If an agent reports status in chat but the roster is stale, the controller flags the discrepancy in the plan. It does not auto-update the roster.

---

## 6. Integration with Existing Operators

### 6.1 Loop Step → Operator Mapping

| Loop Step | Existing Operator | Gap / Notes |
|-----------|-------------------|-------------|
| Load policy | *New: policy loader* | Policy file does not exist yet |
| Observe roster | `narada task roster show` | Already implemented (Task 456) |
| Observe graph | `narada task graph --format json` | Already implemented (Task 465) |
| Inspect evidence | `narada task evidence <n>` | Already implemented (Task 463) |
| Derive chapter state | `narada chapter status <range>` | Implemented but Task 469 not closed |
| Generate recommendations | `narada task recommend` | Already implemented (Task 444) |
| Dry-run promotion | `narada task promote-recommendation --dry-run` | Already implemented (Task 468) |
| Emit plan | *New: plan formatter* | New surface |

### 6.2 No Operator Duplication

The controller **delegates** to existing operators. It does not:
- Reimplement roster parsing (uses `loadRoster` from `task-governance.ts`)
- Reimplement task graph parsing (uses `task-graph.ts` read model)
- Reimplement evidence inspection (uses `inspectTaskEvidence`)
- Reimplement recommendation scoring (uses `generateRecommendations`)
- Reimplement promotion validation (uses `taskPromoteRecommendationCommand` with `--dry-run`)

The controller is a **composition layer**, not a replacement layer.

### 6.3 CLI Surface

The controller exposes one new command:

```bash
narada construction-loop plan [--policy <path>] [--format json|human] [--max-tasks <n>]
```

Options:
- `--policy <path>`: Override default policy path
- `--format json|human`: Output format
- `--max-tasks <n>`: Override `max_tasks_per_cycle` for this run

Behavior:
- Runs steps 1–9 of the v0 loop
- Emits plan only; never mutates
- Returns non-zero if policy is invalid or no plan can be produced

Future commands (not in v0):
```bash
narada construction-loop run     # bounded auto-promotion (future)
narada construction-loop status  # controller state summary (future)
```

---

## 7. Follow-Up Implementation Tasks

The design supports three narrow, self-standing implementation tasks:

### Task 471 — v0 Inspect/Plan Command

**Scope:** Implement `narada construction-loop plan`.

**Deliverables:**
- `packages/layers/cli/src/commands/construction-loop.ts` — command implementation
- `packages/layers/cli/src/lib/construction-loop-policy.ts` — policy loader + validator
- `packages/layers/cli/src/lib/construction-loop-plan.ts` — plan builder (composes existing operators)
- `packages/layers/cli/test/commands/construction-loop.test.ts` — focused tests
- Wire in `main.ts`

**Narrowing:**
- Policy is read from `.ai/construction-loop/policy.json` (default policy created on first run if missing)
- Plan builder delegates 100% to existing operators
- Output is structured JSON or human-readable plan
- No mutations; no auto-promotion

### Task 472 — Policy File + Validation

**Scope:** Define, validate, and document the construction loop policy.

**Deliverables:**
- `.ai/construction-loop/README.md` — policy schema documentation
- `packages/layers/cli/src/lib/construction-loop-policy.ts` — `loadPolicy()`, `validatePolicy()`, `defaultPolicy()`
- Policy validation tests
- Default policy generation on first run

**Narrowing:**
- Schema version 1 only
- `allowed_autonomy_level` restricted to `inspect`, `recommend`, `plan`
- `bounded_auto` and `full_auto` fail with clear error

### Task 473 — Bounded Promotion Mode (Deferred Future Work)

**Scope:** Enable the controller to auto-promote recommendations under a tightened policy with hard gates.

**Hard gates required:**
- `allowed_autonomy_level: 'bounded_auto'`
- `require_operator_approval_for_promotion: false` (explicit opt-in)
- All validation checks from Task 468 pass with no overrides
- Write-set risk ≤ `low`
- Recommendation age ≤ 15 minutes
- Task evidence shows `incomplete` (not `attempt_complete` — the task is truly ready to start)
- Agent has been idle for ≥ 5 minutes
- No more than `max_simultaneous_assignments` active
- Operator has not paused the controller

**Deliverables:**
- `narada construction-loop run` command
- Append-only audit log of auto-promotions
- Pause/resume surface for operator
- Metrics: auto-promotion count, override count, failure count

**Explicitly deferred until:**
- Task 471 has been exercised for 20+ cycles
- Task 472 policy validation is stable
- Manual promotion override rate is <5%

---

## 8. Authority and Safety Invariants

### 8.1 What the Controller May NEVER Do

1. **Never auto-promote without explicit operator opt-in.** v0 is plan-only.
2. **Never mutate task files.** The controller is read-only.
3. **Never mutate roster.** Only `narada task roster ...` commands may mutate roster.
4. **Never close tasks or chapters.** Closure remains operator-owned.
5. **Never accept reviews or learning artifacts.** These require human judgment.
6. **Never parse chat messages as authoritative.** Only durable artifacts count.
7. **Never bypass `task promote-recommendation`.** If promotion is desired, it routes through the existing command.
8. **Never create derivative task-status files.** No `-EXECUTED`, `-DONE`, `-RESULT`, `-FINAL`, `-SUPERSEDED`.

### 8.2 What the Controller MAY Do

1. Read any task-governance artifact (tasks, roster, reports, reviews, decisions, learning, CCC posture).
2. Compose existing read-only operators into a unified plan.
3. Write append-only audit records in `.ai/construction-loop/audit/`.
4. Write/update the policy file (operator-owned configuration).
5. Suggest operator actions with exact command lines.

### 8.3 Advisory Signal Classification

Per Decision 464 and SEMANTICS.md §2.12:

| Controller Output | Classification | Overrideable? |
|-------------------|---------------|---------------|
| Roster observation | Authoritative mirror | N/A (reads durable state) |
| Task graph rendering | Derived | N/A (read-only) |
| Evidence verdict | Derived | N/A (read-only) |
| Recommendation | Advisory | Yes — operator may choose alternative |
| Promotion candidate | Advisory | Yes — operator may reject or override |
| Plan | Advisory | Yes — operator may execute partially or not at all |
| Stale agent flag | Advisory | Yes — operator may confirm agent is still working |

Removing the controller from the system must leave all durable boundaries intact.

---

## 9. Residual Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Operator over-relies on plan and stops manual verification | Medium | High | Plan explicitly includes verification reminders; policy defaults to dry-run |
| Recommendation false-positives waste agent time | Medium | Medium | v0 plan-only; operator reviews before promotion; metrics tracked |
| Policy file becomes stale (blocked tasks resolved but still blocked) | Medium | Low | Policy includes expiration fields; lint suggests policy review |
| Controller adds operational overhead (another thing to run) | Medium | Low | Single command `narada construction-loop plan`; can be run on demand or scheduled |
| Bounded auto-promotion (Task 473) introduces authority creep if rushed | Low | High | Explicitly deferred until manual override rate is <5%; hard gates listed |

---

## 10. Documentation Updates

### 10.1 `.ai/task-contracts/agent-task-execution.md`

Add a section on the construction loop controller:

```markdown
## Construction Loop Controller

The construction loop controller (`narada construction-loop plan`) is an advisory composition layer that automates mechanical observation and planning steps. It does not replace individual operators.

- It may **read** all task-governance artifacts.
- It may **not** mutate task files, roster, or assignment state.
- It produces a **plan** that the operator reviews before executing.
- All promotion, assignment, review, closure, and commit authority remains with the operator.
```

### 10.2 `docs/governance/task-graph-evolution-boundary.md`

Add §11:

```markdown
## 11. Construction Loop Controller

The construction loop controller is a read-plan-assist layer above individual task operators. It composes `task roster`, `task graph`, `task evidence`, `chapter status`, `task recommend`, and `task promote-recommendation --dry-run` into a single operator plan.

It is **not** an autonomous dispatcher. It does not assign agents, close tasks, or promote recommendations without operator approval.

Policy lives in `.ai/construction-loop/policy.json` and is operator-owned.
```

---

## 11. Acceptance Criteria (Design)

- [x] Controller autonomy class is explicitly chosen: **promotion assistant requiring operator approval**.
- [x] Minimal v0 loop is specified step-by-step (9 steps, plan-only).
- [x] Policy file shape is defined with schema, validation rules, and default values.
- [x] Agent state machine interaction is defined (roster observation + stale detection, no direct management).
- [x] Existing operator integration table is complete (7 steps mapped, no duplication).
- [x] Follow-up tasks are narrow, self-standing, and no more than three (Tasks 471, 472, 473).
- [x] Design explicitly preserves recommendation/authority separation (plan-only in v0, hard gates for future auto-promotion).
- [x] Design explicitly prevents chat-message completion from becoming authoritative (§5.5 invariant).
- [x] No implementation code is added (design-only task per acceptance criteria).
