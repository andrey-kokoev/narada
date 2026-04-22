# Decision: Assignment Planner / Dispatcher Design

**Date:** 2026-04-22
**Task:** 411
**Depends on:** 410 (Construction Operation Boundary Contract), 408 (Readiness), 406 (PrincipalRuntime)
**Chapter:** Construction Operation (410–415)
**Verdict:** **Design accepted. Implementation deferred to Task 411 implementation task or Task 414 fixture.**

---

## 1. Input Model

The planner consumes five input domains. All are read-only; the planner never mutates durable state.

### 1.1 Task Graph (`TaskCandidate`)

Derived from `listRunnableTasks()` in `task-governance.ts`.

| Field | Type | Source |
|-------|------|--------|
| `task_id` | `string` | Filename |
| `task_number` | `number \| null` | Extracted from filename |
| `status` | `"opened" \| "needs_continuation"` | Front matter |
| `title` | `string \| null` | `# Heading` in body |
| `depends_on` | `number[]` | Front matter |
| `continuation_affinity` | `TaskContinuationAffinity \| undefined` | Front matter |
| `chapter` | `string \| null` | `## Chapter` in body |
| `required_capabilities` | `string[]` | Parsed from body (see §1.5) |

### 1.2 Agent Roster (`RosterEntry`)

Derived from `.ai/agents/roster.json`.

| Field | Type | Source |
|-------|------|--------|
| `agent_id` | `string` | Roster entry |
| `role` | `string` | Roster entry |
| `capabilities` | `string[]` | Roster entry |
| `status` | `"idle" \| "working" \| "reviewing" \| "blocked" \| "done"` | Roster entry |
| `current_task` | `number \| null` | Roster entry (`task` field) |
| `last_done` | `number \| null` | Roster entry |

### 1.3 PrincipalRuntime State (`PrincipalSnapshot`)

Derived from `PrincipalRuntimeSnapshot` (Decision 406).

| Field | Type | Relevance |
|-------|------|-----------|
| `principal_id` | `string` | Maps to `agent_id` |
| `state` | `PrincipalRuntimeState` | Only `available`, `attached_interact`, `detached` are considered ready |
| `budget_remaining` | `number \| null` | Advisory — low budget lowers score |
| `active_work_item_id` | `string \| null` | Non-null principals are excluded from claiming |

### 1.4 Assignment History (`AssignmentHistory`)

Derived from `.ai/tasks/assignments/{task-id}.json`.

| Field | Type | Relevance |
|-------|------|-----------|
| `task_id` | `string` | The task that was claimed |
| `agent_id` | `string` | Who claimed it |
| `release_reason` | `string \| null` | `completed` → positive signal; `abandoned` → negative signal |
| `claimed_at` / `released_at` | `string` | Temporal weighting (recent > old) |

### 1.5 Review Records (`ReviewHistory`)

Derived from `.ai/reviews/*.json`.

| Field | Type | Relevance |
|-------|------|-----------|
| `reviewer_agent_id` | `string` | Who reviewed |
| `task_id` | `string` | What was reviewed |
| `verdict` | `string` | `rejected` → reviewer may not be best fit for similar tasks |

### 1.6 Capability Extraction from Task Body

Tasks do not yet declare required capabilities explicitly. The planner uses a **coarse heuristic** until Task 414 provides telemetry:

| Heuristic | Capability Inferred |
|-----------|---------------------|
| Body contains `"TypeScript"` or `"typecheck"` | `typescript` |
| Body contains `"test"` or `"fixture"` | `testing` |
| Body contains `"SQLite"` or `"schema"` | `database` |
| Body contains `"Graph API"` or `"mail"` | `mailbox_vertical` |
| Body contains `"Cloudflare"` or `"DO"` or `"Worker"` | `cloudflare` |
| Body contains `"design"` or `"contract"` or `"boundary"` | `architecture` |
| Body contains `"documentation"` or `"README"` | `documentation` |

**Note:** This heuristic is intentionally coarse. Task 414 may refine it based on fixture outcomes.

---

## 2. Scoring Function

### 2.1 Candidate Pair

A candidate pair is `(task, principal)`. The score is a weighted sum of dimension scores in `[0, 1]`.

```
score(task, principal) =
  w_affinity   × affinity_score   +
  w_capability × capability_score +
  w_load       × load_score       +
  w_history    × history_score    +
  w_review     × review_separation_score +
  w_budget     × budget_score
```

**Default weights (advisory, operator-tunable):**

| Weight | Value | Rationale |
|--------|-------|-----------|
| `w_affinity` | `0.30` | Continuation coherence is important but not absolute |
| `w_capability` | `0.25` | Capability match is strong predictor of quality |
| `w_load` | `0.20` | Load balancing prevents hot-spotting one agent |
| `w_history` | `0.10` | Past success is a weak signal (tasks vary) |
| `w_review` | `0.10` | Review separation is a hygiene signal |
| `w_budget` | `0.05` | Budget is advisory; low weight avoids over-penalizing |

Weights sum to `1.0`. The operator may adjust weights via config or CLI flag.

### 2.2 Dimension Scores

#### `affinity_score`

```
if task.continuation_affinity.preferred_agent_id == principal.agent_id:
    if manual:   score = 1.0
    if history:  score = 0.7
else:
    score = 0.0
```

Manual affinity (set by operator in task file) overrides history-derived affinity.

#### `capability_score`

```
task_caps = extract_capabilities(task.body)
principal_caps = principal.capabilities

if task_caps.empty:
    score = 0.5  # No preference expressed; neutral
else:
    intersection = task_caps ∩ principal_caps
    union = task_caps ∪ principal_caps
    score = |intersection| / |task_caps|  # Jaccard-like: coverage of task needs
```

#### `load_score`

```
active_tasks = count of tasks currently claimed by principal
max_concurrent = 3  # Operator-tunable default

if principal.status in ("working", "reviewing", "blocked"):
    score = max(0, 1 - active_tasks / max_concurrent)
else:
    score = 1.0  # idle or done
```

Principals with `active_work_item_id` non-null are excluded entirely (score = 0, not considered).

#### `history_score`

```
completed = count of principal's completed tasks in last 30 days
abandoned = count of principal's abandoned tasks in last 30 days

if completed + abandoned == 0:
    score = 0.5  # New principal; neutral
else:
    score = completed / (completed + abandoned)
```

#### `review_separation_score`

```
# Check if principal was the last worker on this task's chapter or similar tasks
last_worker = get_last_worker_for_context(task.chapter, task.depends_on)

if last_worker == principal.agent_id:
    score = 0.0  # Strong signal: this principal should not also review
else:
    score = 1.0
```

This is a **pre-emptive** check: the planner warns that the principal may later be disqualified as reviewer. It does not block assignment.

#### `budget_score`

```
if principal.budget_remaining is null:
    score = 1.0  # No budget tracking; neutral
elif principal.budget_remaining <= 0:
    score = 0.0  # Exhausted; exclude
else:
    score = min(1.0, principal.budget_remaining / 10000)  # Normalize arbitrarily
```

---

## 3. Output Model

### 3.1 Recommendation Record Schema

```typescript
interface AssignmentRecommendation {
  /** Unique recommendation ID for audit */
  recommendation_id: string;

  /** When this recommendation was generated */
  generated_at: string;

  /** Principal that produced the recommendation (usually "system") */
  recommender_id: string;

  /** The recommended assignment */
  primary: CandidateAssignment;

  /** Alternative candidates, sorted by score descending */
  alternatives: CandidateAssignment[];

  /** Tasks for which no suitable principal was found */
  abstained: AbstainedTask[];

  /** Human-readable summary */
  summary: string;
}

interface CandidateAssignment {
  /** The task being assigned */
  task_id: string;
  task_number: number | null;
  task_title: string | null;

  /** The recommended principal */
  principal_id: string;
  principal_type: "operator" | "agent" | "worker" | "external";

  /** Composite score [0, 1] */
  score: number;

  /** Confidence level */
  confidence: "high" | "medium" | "low";

  /** Per-dimension score breakdown */
  breakdown: ScoreBreakdown;

  /** Human-readable rationale */
  rationale: string;
}

interface ScoreBreakdown {
  affinity: number;
  capability: number;
  load: number;
  history: number;
  review_separation: number;
  budget: number;
}

interface AbstainedTask {
  task_id: string;
  task_number: number | null;
  reason: string;
}
```

### 3.2 JSON Example

```json
{
  "recommendation_id": "rec-20260422-abc123",
  "generated_at": "2026-04-22T14:30:00Z",
  "recommender_id": "system",
  "primary": {
    "task_id": "20260422-411-assignment-planner-design",
    "task_number": 411,
    "task_title": "Assignment Planner / Dispatcher Design",
    "principal_id": "architect-alpha",
    "principal_type": "agent",
    "score": 0.87,
    "confidence": "high",
    "breakdown": {
      "affinity": 0.7,
      "capability": 1.0,
      "load": 1.0,
      "history": 0.8,
      "review_separation": 1.0,
      "budget": 1.0
    },
    "rationale": "architect-alpha has capability match [architecture, design] and is idle. Task 410 (same chapter) was completed by this agent; continuation affinity applies."
  },
  "alternatives": [
    {
      "task_id": "20260422-411-assignment-planner-design",
      "task_number": 411,
      "task_title": "Assignment Planner / Dispatcher Design",
      "principal_id": "agent-beta",
      "principal_type": "agent",
      "score": 0.62,
      "confidence": "medium",
      "breakdown": { "affinity": 0, "capability": 0.5, "load": 1.0, "history": 0.5, "review_separation": 1.0, "budget": 1.0 },
      "rationale": "agent-beta is idle and has partial capability match. No affinity."
    }
  ],
  "abstained": [],
  "summary": "1 recommendation, 1 alternative, 0 abstained."
}
```

---

## 4. Algorithm

### 4.1 High-Level Flow

```
INPUT: cwd, optional weights, optional principal_filter
OUTPUT: AssignmentRecommendation

1. LOAD task graph
   a. Call listRunnableTasks(cwd) → runnable_tasks
   b. For each task, extract required_capabilities from body heuristic
   c. Filter out tasks with blocked dependencies ( defensive; listRunnableTasks should already do this )

2. LOAD principals
   a. Load roster → roster_entries
   b. Load PrincipalRuntime snapshots → runtime_states
   c. Merge: principal = roster_entry + runtime_state (if available)
   d. FILTER to principals with state in (available, attached_interact, detached)
      AND active_work_item_id == null
      AND status in (idle, done)

3. LOAD history
   a. Scan assignments directory → assignment_records
   b. Build per-principal completion/abandonment counts (last 30 days)
   c. Scan reviews directory → review_records
   d. Build per-task last-worker map

4. SCORE all candidate pairs
   a. For each task in runnable_tasks:
      For each principal in available_principals:
        Compute dimension scores
        Compute weighted sum → score
        If score == 0: skip (principal unsuitable)
   b. Sort candidates per task by score desc

5. RESOLVE conflicts (one task per principal, one principal per task)
   a. Use greedy assignment: highest-scoring pair first
   b. Mark task and principal as assigned
   c. Continue until no candidates remain

6. CLASSIFY confidence
   a. high: score >= 0.8 and top candidate领先 second by >= 0.2
   b. medium: score >= 0.5
   c. low: score < 0.5

7. BUILD abstained list
   a. Any task with no candidates → abstained
   b. Reason: "no available principal" or "no capability match" or "all principals excluded"

8. RECORD recommendation
   a. Write to .ai/tasks/recommendations/{rec-id}.json (if durable recording enabled)
   b. Return AssignmentRecommendation object
```

### 4.2 Abstain Conditions

The planner abstains (does not recommend) when:

| Condition | Abstain Reason |
|-----------|---------------|
| Zero runnable tasks | "No runnable tasks in task graph" |
| Zero available principals | "No principals in available state" |
| All principals lack required capabilities | "No capability match for task" |
| All principals have `active_work_item_id` | "All principals are currently executing" |
| All principals have `budget_remaining <= 0` | "All principals have exhausted budget" |
| Task has manual affinity to unavailable principal | "Preferred principal is not available" |

---

## 5. Rationale Format

Each recommendation includes a human-readable rationale string. The format is:

```
{principal_id} is {state} with {capability_summary}. {affinity_clause}. {load_clause}. {history_clause}. {caveat_clause}.
```

**Clauses:**

| Clause | Example |
|--------|---------|
| `capability_summary` | `"capability match [typescript, testing] (2/2)"` or `"partial match [typescript] (1/2)"` or `"no capability match"` |
| `affinity_clause` | `"Manual affinity from task file"` or `"History affinity: completed 2 prerequisite tasks"` or `"No affinity"` |
| `load_clause` | `"Idle"` or `"Currently working on 1 task"` or `"Blocked"` |
| `history_clause` | `"Strong completion record (5/6 in last 30 days)"` or `"No recent history"` |
| `caveat_clause` | `"Warning: this principal may be disqualified as reviewer for this task"` or `"Budget low: 500 tokens remaining"` |

---

## 6. Confidence Levels

| Level | Criteria | Operator Action |
|-------|----------|-----------------|
| **High** | Score ≥ 0.8 and gap to next candidate ≥ 0.2 | Operator may accept with minimal review |
| **Medium** | Score ≥ 0.5 | Operator should review rationale before accepting |
| **Low** | Score < 0.5 | Operator should consider alternatives or wait for more principals |

Confidence is **not** a probability. It is a heuristic classification of recommendation quality based on score magnitude and separation from alternatives.

---

## 7. CLI Surface Design

### 7.1 Command: `narada task recommend`

```bash
narada task recommend \
  [--task <number>]          # Recommend for a specific task only
  [--agent <id>]             # Restrict to a specific principal
  [--weights <json>]         # Override scoring weights
  [--format json|human]      # Output format
  [--dry-run]                # Compute but do not record recommendation
  [--cwd <path>]             # Working directory
```

**Behavior:**
- Computes recommendations for all runnable tasks (or the specified task)
- Prints primary recommendation + alternatives + abstained
- Writes recommendation record to `.ai/tasks/recommendations/{rec-id}.json` unless `--dry-run`
- Returns exit code 0 if at least one recommendation is made; 1 if all tasks abstained

### 7.2 Command: `narada task claim` Extension

```bash
narada task claim <task-number> \
  --agent <id> \
  [--recommendation-id <id>]  # Reference the recommendation being acted on
  [--reason <text>]           # Override or augment rationale
```

**Behavior:**
- Existing `task claim` behavior is unchanged
- If `--recommendation-id` is provided, the claim command validates that the recommendation exists and the agent matches
- The recommendation record is updated with `acted_upon: true` and `acted_at` timestamp
- This creates an audit trail from recommendation → claim without making recommendation authoritative

### 7.3 Command: `narada task recommend --explain`

Future enhancement (not in this chapter):

```bash
narada task recommend --explain --task <number> --agent <id>
```

Shows the full score breakdown for a specific pair, useful for debugging why a recommendation was or was not made.

---

## 8. Integration with Existing Surfaces

| Existing Surface | Integration |
|------------------|-------------|
| `narada task list` | Add `recommendation` column showing top-scoring principal for each task |
| `narada task claim` | Add `--recommendation-id` support for audit trail |
| `narada task roster show` | Add workload count (active tasks per principal) |
| `narada principal status` | Consumed by planner to filter available principals |
| `narada task lint` | Could warn about tasks with no capability match in roster |

---

## 9. Acceptance Criteria

- [x] Decision artifact exists.
- [x] Scoring function is defined with explicit weights or heuristics.
- [x] Output model includes `recommendation_id`, `rationale`, `confidence`, and `alternative_candidates`.
- [x] Algorithm handles the case where no suitable principal exists (abstain).
- [x] Algorithm respects dependency constraints.
- [x] Algorithm respects review separation (does not recommend worker as reviewer).
- [x] No implementation code is added.

---

## 10. Residuals

| Item | Deferred To | Why |
|------|-------------|-----|
| Capability extraction heuristic refinement | Task 414 fixture | Needs empirical validation against real task-agent fit |
| Weight tuning | Task 414 fixture | Default weights are guesses; fixture metrics will inform |
| Write-set overlap scoring | Task 413 design | Overlap detection is not yet designed |
| Cost estimation integration | Post-415 chapter | No cost data exists yet |
| `narada task recommend --explain` | Future enhancement | Debugging surface; not critical for v0 |
| Durable recommendation storage format | Implementation task | Schema is defined; storage path is `.ai/tasks/recommendations/` |
