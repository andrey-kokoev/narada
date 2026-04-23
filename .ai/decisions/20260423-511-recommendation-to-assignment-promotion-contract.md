---
closes_tasks: [511]
decided_at: 2026-04-23
decided_by: a2
---

# Decision: Recommendation to Assignment Promotion Contract

## Date

2026-04-23

## Problem

Narada has three separate concepts that touch recommendation-to-assignment:

1. **`task recommend`** — produces ephemeral, scored, ranked candidate assignments.
2. **`construction-loop plan`** — produces promotion candidates with policy-filtered dry-run results.
3. **`task promote-recommendation`** — validates and executes promotion with operator approval.

But there is no single contract that defines the durable artifacts, preconditions, authority requirements, and residual risks across all three stages. Task 510 established the self-governance boundary; Task 511 must now define the specific promotion path within that boundary.

## Decision

Formalize the recommendation-to-assignment promotion path as a three-stage pipeline with explicit artifacts, validation gates, and authority requirements at each stage.

```text
Recommendation → Promotion Request → Assignment
   (advisory)      (durable intent)    (authoritative)
```

## Stage 1: Recommendation

**Artifact:** `TaskRecommendation` (ephemeral)

**Produced by:** `narada task recommend`

**Contents:**
- `recommendation_id`: stable ID for this recommendation batch
- `generated_at`: ISO timestamp
- `primary`: top-scored candidate (task, agent, score, confidence, rationale)
- `alternatives`: other viable candidates
- `abstained`: tasks that could not be assigned with reasons

**Authority:** `derive` (read-only advisory)

**Self-governed?** **Yes.** Recommendations may be generated automatically at any `allowed_autonomy_level >= recommend`.

**Preconditions:** None. Recommendations are pure computation over existing task graph, roster, and posture.

## Stage 2: Promotion Request

**Artifact:** `AssignmentPromotionRequest` (durable, append-only)

**Produced by:** `narada task promote-recommendation` (operator-confirmed) or construction-loop auto-promotion (bounded auto)

**Contents:**
- `promotion_id`: unique ID for this promotion attempt
- `recommendation_id`: links back to the recommendation that triggered this
- `task_id` / `task_number`: target task
- `agent_id`: target agent
- `requested_by`: operator or `construction-loop`
- `requested_at` / `executed_at`: timestamps
- `status`: `requested` | `executed` | `rejected` | `stale` | `failed`
- `recommendation_snapshot`: captured primary candidate at promotion time
- `validation_results`: array of 9 check results
- `override_reason`: if operator overrode a warning
- `assignment_id`: links to the resulting assignment (if executed)

**Authority:** `propose` (durable intent record) + `claim` (if executing)

**Self-governed?** **Conditional.** Only when `allowed_autonomy_level = bounded_auto` AND `require_operator_approval_for_promotion = false` AND all validation gates pass.

### Validation Gates (9 Checks)

| # | Check | Hard Gate? | Overrideable? | Auto-Promotion Behavior |
|---|-------|------------|---------------|------------------------|
| 1 | Task exists | **Yes** | No | Block |
| 2 | Task status claimable (`opened` / `needs_continuation`) | **Yes** | No | Block |
| 3 | Dependencies satisfied | **Yes** | No | Block |
| 4 | Agent exists in roster | **Yes** | No | Block |
| 5 | Agent assignable (`idle` / `done`) | **Yes** | No | Block |
| 6 | No active assignment | **Yes** | No | Block |
| 7 | Write-set risk ≤ policy max | Warning | **Yes** (`--override-risk`) | Block unless overridden by policy |
| 8 | Recommendation fresh (< TTL) | Warning | **Yes** (`--override-risk`) | Block unless policy allows stale |
| 9 | PrincipalRuntime available | Advisory | No | Warn but proceed |

**Key invariant:** Hard gates (1–6) are NEVER overridable. Only advisory risks (7–8) may be overridden with explicit reason. Auto-promotion blocks on ALL warnings unless the policy explicitly configures otherwise.

### Operator-Confirmed vs Bounded Auto-Promotion

| Aspect | Operator-Confirmed | Bounded Auto-Promotion |
|--------|-------------------|------------------------|
| **Trigger** | Operator runs `task promote-recommendation` | Construction loop executes when policy allows |
| **Requested by** | Explicit operator ID | `construction-loop` |
| **Override** | Operator provides `--override-risk <reason>` | Policy pre-configures acceptable risk levels |
| **Write-set risk** | Operator decides case-by-case | Policy `max_write_set_risk_severity` decides |
| **Recommendation age** | Operator decides case-by-case | Policy `max_recommendation_age_minutes` decides |
| **Audit trail** | Same `AssignmentPromotionRequest` format | Same format, `requested_by: 'construction-loop'` |
| **Failure handling** | Operator sees error, can retry | Logged as `rejected`/`stale`/`failed`; operator inspects later |

## Stage 3: Assignment

**Artifact:** `TaskAssignmentRecord` (durable) + Task front matter mutation + Roster mutation

**Produced by:** `task claim` (delegated from promotion)

**Contents:**
- `agent_id`: assigned agent
- `claimed_at`: timestamp
- `claim_context`: free-text context
- `intent`: `primary` | `review` | `repair` | `takeover` (from Task 490)
- `released_at`: null while active
- `release_reason`: null while active

**Authority:** `claim`

**Self-governed?** **Never.** Assignment is the first authoritative mutation. Even bounded auto-promotion delegates to `task claim` — the promotion request is the self-governed part; the claim itself is a standard operator-owned mutation that happens to be triggered automatically.

**Preconditions:** All 9 promotion validation checks passed.

### Assignment Intent Reconciliation

Promotion always produces `intent: primary` because it is the default claim/assign path. Other intents are produced by other operators:

| Operator | Intent | Rationale |
|----------|--------|-----------|
| `task promote-recommendation` → `task claim` | `primary` | Default forward-work assignment |
| `task roster review` | `review` | Parallel evaluation attachment |
| `task continue --reason evidence_repair` | `repair` | Evidence gap fix without supersession |
| `task continue --reason handoff` | `takeover` | Ownership transfer |

**Key invariant:** A promotion request that results in `executed` status MUST produce an assignment with `intent: primary`. If the task already has an active primary assignment, promotion MUST be blocked (check 6: no active assignment).

## Durable Artifact Chain

The full promotion path leaves a durable trace:

```
TaskRecommendation (ephemeral)
    ↓
AssignmentPromotionRequest (durable, .ai/tasks/promotions/{id}.json)
    ↓
TaskAssignmentRecord (durable, .ai/tasks/assignments/{task_id}.json)
    ↓
Task front matter update (status: claimed, claimed_by)
    ↓
Roster update (agent.status: working, agent.task: N)
```

Each step is append-only or atomic-update. No step overwrites prior steps without a new artifact.

## Construction Loop Integration

The construction loop controller (`construction-loop plan`) currently:

1. Generates recommendations (Stage 1)
2. Produces promotion candidates with policy-filtered dry-run results (Stage 2 preview)
3. Suggests promotion commands as `SuggestedAction` items

**It does NOT automatically execute promotions.** True bounded auto-promotion execution requires:
- `allowed_autonomy_level = bounded_auto`
- `require_operator_approval_for_promotion = false`
- A mechanism to call `taskPromoteRecommendationCommand` with `dryRun: false` from the controller

**Status:** Auto-promotion execution is **deferred.** The current implementation produces the plan; the operator must execute the suggested command. This is the correct posture for v0.

## Residual Risks and Unsafe Cases

These cases MUST remain blocked regardless of policy level:

1. **Override of hard gates.** No policy setting can make `task promote-recommendation` succeed when the task does not exist, is not claimable, has unsatisfied dependencies, the agent does not exist, the agent is not assignable, or the task already has an active assignment.

2. **Auto-promotion with override.** Bounded auto-promotion MUST NOT override write-set or freshness warnings. If a candidate has these warnings, auto-promotion blocks even if the policy risk level would permit them. Overrides require explicit operator judgment.

3. **Review separation violation.** Auto-promotion MUST NOT assign a task to an agent who is also the most recent submitter of a WorkResultReport for that task. This is a hard invariant even at `bounded_auto`.

4. **Chapter boundary crossing.** Promotion MUST NOT assign a task from chapter A to an agent currently working on chapter B if the policy does not allow cross-chapter assignment. (Current policy does not model this; it is a future policy enhancement.)

5. **Roster race condition.** Two simultaneous auto-promotion attempts could target the same idle agent. The roster mutation is serialized via `withRosterMutation`, but the promotion request itself is not atomic with the roster read. This is a known low-frequency risk mitigated by roster serialization.

6. **Stale recommendation after plan generation.** The construction loop plan takes time to generate. By the time the operator reads the suggested action, the recommendation may have expired. The operator must re-run `task recommend` or use `task promote-recommendation` which recomputes at execution time.

## Existing Surface Mapping

Map every existing command against the three-stage promotion path:

| Command | Stage | Mutates? | Authority |
|---------|-------|----------|-----------|
| `task recommend` | 1 | No | `derive` |
| `construction-loop plan` | 1 + 2 preview | No | `derive` |
| `task promote-recommendation` | 2 + 3 | Yes (promotion request + assignment) | `propose` + `claim` |
| `task claim` | 3 | Yes (assignment + front matter + roster) | `claim` |
| `task roster assign` | 3 (roster only) | Yes (roster) | `claim` |

## Invariants

1. **Recommendation is never authoritative.** Even after promotion, the recommendation record remains advisory.
2. **Promotion request is pre-mutation audit.** It records intent before the claim executes.
3. **Assignment is the first authoritative boundary.** Task front matter and roster updates are the source of truth.
4. **Auto-promotion is plan-only in v0.** The construction loop suggests; the operator executes.
5. **Hard gates are invariant.** No policy level overrides checks 1–6.

## What This Decision Does NOT Do

- It does not implement auto-promotion execution. That remains plan-only in v0.
- It does not change the `task promote-recommendation` command schema.
- It does not add new CLI surfaces.
- It does not weaken the 9 validation checks.
- It does not make promotion bypass review separation.

## Closure Statement

The recommendation-to-assignment promotion path is formalized as a three-stage pipeline with explicit artifacts, 9 validation gates, operator-confirmed vs bounded auto-promotion distinction, and assignment intent reconciliation. Residual risks are recorded. Auto-promotion execution remains plan-only in v0.
