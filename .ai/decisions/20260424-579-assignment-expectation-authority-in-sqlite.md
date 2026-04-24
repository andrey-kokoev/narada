---
closes_tasks: [579]
decided_at: 2026-04-24
decided_by: a3
reviewed_by: a3
governance: derive -> propose
---

# Decision 579 — Assignment Expectation Authority In SQLite

## Goal

Define the canonical authority model for expected task duration, check-in thresholds, and overrun handling so Narada can monitor assigned work without duplicating truth across markdown, agent-kind priors, and runtime state.

---

## 1. Problem Statement

Narada task governance now has:

- Governed assignment (`task-claim`, `task-continue`)
- Recommendation and promotion (`task-recommend`, `task-promote-recommendation`)
- Dispatch packet / pickup with lease and heartbeat
- Execution start (`task dispatch start`)
- Release reasons including `abandoned` and `budget_exhausted`

But there is still **no first-class answer** to:

1. How long an assigned task is expected to take
2. When Narada should check in with an agent
3. What authority surface owns that timing truth

This creates the following failure modes:

- **Silent overrun**: an agent works well past reasonable expectation with no signal
- **False abandonment**: a lease expires because the agent missed a heartbeat, but the agent was actually making progress toward a legitimate long-running goal
- **Competing estimates**: task markdown may contain informal "Estimated effort" lines, agent roster may contain agent-kind priors, and neither is the live truth
- **Lease confusion**: the dispatch lease (30 min default, 4 hr max) is a mechanical timeout, not a progress expectation. Treating lease expiry as overrun signal produces false positives on legitimate multi-hour tasks

---

## 2. Authority Decision

### 2.1 The Assignment Instance Is The Single Authoritative Place

The **active assignment row in SQLite** (`task_assignments`) is the canonical durable boundary for live execution expectation.

| Aspect | Authority | Why |
|--------|-----------|-----|
| **Expected duration** | `task_assignments` row | Bound to the specific agent + task + moment of assignment |
| **Check-in schedule** | `task_assignments` row | Derived from expectation at assignment time |
| **Overrun state** | `task_assignments` row | Computed from expectation vs. elapsed time since pickup |
| **Escalation trigger** | `task_assignments` row | Governed transition, not ad-hoc alarm |

### 2.2 Why Not Task Markdown

Task markdown may contain informal effort estimates (e.g., `**Estimated effort:** 2-3 hours`). These are **authored specification**, not live state:

- Written at task creation time, before agent selection
- Not updated when task scope changes
- Not bound to the actual assigned agent's capabilities
- May be missing, inconsistent, or aspirational

**Rule**: Markdown effort hints are non-authoritative inputs. They may seed the assignment expectation at claim time, but they must not become competing authority.

### 2.3 Why Not Task-Level Estimate Fields

A dedicated `estimated_hours` field in markdown front matter or SQLite `task_lifecycle` would suffer the same problems:

- Bound to task, not to assignment instance
- Not updated when scope changes
- Not sensitive to agent capability

**Rule**: No task-level estimate field may be authoritative. If such a field exists for projection or planning, it is read-only input to the assignment expectation derivation.

### 2.4 Why Not `task × agentkind` Matrix

A lookup table mapping task families to agent kinds (e.g., "implementer: 2 hours, reviewer: 1 hour") is useful for recommendation scoring but must not become live truth:

- Priors are statistical, not deterministic
- Individual agent variance is high
- Task context varies within families
- Matrix values would require a second update path whenever an assignment is created

**Rule**: Agent-kind priors and historical averages are non-authoritative inputs. They may inform the initial expectation derivation but must not override the assignment instance.

### 2.5 Why Not Dispatch Lease

The dispatch packet lease (`lease_expires_at`) is a **mechanical liveness signal**, not a progress expectation:

| Lease | Expectation |
|-------|-------------|
| 30 min default, 4 hr max | Task-specific, agent-specific |
| Reset by heartbeat | Not reset by heartbeat |
| Expiry → re-dispatch eligible | Overrun → check-in required |
| Authority: dispatch surface | Authority: assignment instance |

**Rule**: Lease expiry and expectation overrun are distinct concepts. A packet may be within lease while the assignment is overdue. An assignment may be within expectation while the packet lease has expired (agent missed heartbeat but was nearly done).

---

## 3. Authoritative SQLite Shape

### 3.1 Extended `task_assignments` Schema

The assignment row gains expectation fields. These are set at claim time (or promotion time) and updated only by governed operators.

```sql
-- New columns on task_assignments (Task 579)
ALTER TABLE task_assignments ADD COLUMN expected_duration_minutes INTEGER;
ALTER TABLE task_assignments ADD COLUMN first_check_in_due_at TEXT;
ALTER TABLE task_assignments ADD COLUMN max_silence_minutes INTEGER;
ALTER TABLE task_assignments ADD COLUMN escalation_threshold_minutes INTEGER;
ALTER TABLE task_assignments ADD COLUMN expectation_source TEXT;
ALTER TABLE task_assignments ADD COLUMN overrun_state TEXT;
```

### 3.2 TypeScript Interface

```typescript
export interface TaskAssignmentRow {
  assignment_id: string;
  task_id: string;
  agent_id: string;
  claimed_at: string;
  released_at: string | null;
  release_reason: string | null;
  intent: AssignmentIntent;

  // --- Expectation authority (Decision 579) ---
  /** Expected wall-clock duration from pickup to report, in minutes */
  expected_duration_minutes: number | null;

  /** First check-in is due by this timestamp */
  first_check_in_due_at: string | null;

  /** Max allowed silence (no heartbeat, no report, no status update) before check-in */
  max_silence_minutes: number | null;

  /** Time after expected_duration before escalation is triggered */
  escalation_threshold_minutes: number | null;

  /** How the expectation was derived */
  expectation_source:
    | "task_hint"           // from markdown effort hint
    | "agentkind_prior"     // from task × agentkind matrix
    | "historical_average"  // from agent's recent assignments
    | "operator_override"   // explicitly set by operator
    | null;

  /** Current overrun classification */
  overrun_state:
    | "within_expectation"
    | "check_in_due"
    | "overrun"
    | "escalated"
    | null;
}
```

### 3.3 Derivation Timing

Expectation fields are derived at **assignment creation time** (`task-claim`, `task-continue`, promotion from recommendation) and stored atomically with the assignment row.

They are **not recomputed on every read**. Recomputation requires a governed operator:
- `operator_override` — operator explicitly adjusts expectation
- `scope_change` — task scope changes materially (new governed assignment)
- `continuation` — `task-continue` creates a new assignment with fresh expectation

---

## 4. Non-Authoritative Inputs

These may feed into the expectation derivation but are never authoritative on their own.

| Input | Source | How Used |
|-------|--------|----------|
| **Task complexity hint** | Markdown body (e.g., `**Estimated effort:** 2-3 hours`) | Parsed at claim time; contributes to initial expectation if present |
| **Task family / chapter locality** | Task number range or chapter tag | Adjusts prior lookup; chapter tasks may have different baseline |
| **Agent-kind prior** | Roster or external matrix | Statistical baseline for agent capability class |
| **Recent assignment history** | SQLite `task_assignments` + `task_reports` | Historical average for same agent on similar tasks |
| **Dependency chain depth** | `depends_on` in markdown | May extend expectation for deeply dependent tasks |

**Rule**: All inputs are advisory. The assignment instance row is the only live truth.

---

## 5. No-Duplication Rule

Live expectation truth may exist in **only one authoritative place**.

### 5.1 Forbidden Dual Authority

| Violation | Severity | Detection |
|-----------|----------|-----------|
| Markdown front matter contains `expected_duration`, `check_in_due`, or `overrun_state` | Critical | `task lint` rule `LINT-EXPECT-001` |
| Dispatch packet contains expectation fields | High | Schema review — packet owns lease, not expectation |
| Roster entry contains live task expectation | High | Design review — roster owns agent state, not task state |
| Two assignment rows for same task both claim active expectation | Critical | Unique active assignment invariant |

### 5.2 Projection Is Read-Only

Markdown may display expectation as a **projected read view** (e.g., `## Assignment Expectation` section regenerated from SQLite), but:

- Must carry `GENERATED_BY_PROJECTION` marker if in front matter
- Must not be edited by agents or humans
- Must be stripped before parsing

**Recommended posture**: Do not project expectation into markdown at all. Keep it in SQLite only, with CLI and workbench surfaces for visibility.

---

## 6. Overrun / Check-In / Escalation Path

### 6.1 State Machine

```
within_expectation ──[first_check_in_due_at passed]──> check_in_due
      │                                                     │
      │                                              [check-in received]
      │                                                     │
      │                                              [expectation extended]
      └─────────────────────────────────────────────────────┘
      │
      └──[expected_duration + escalation_threshold passed]──> overrun
                                                                 │
                                                    [operator acknowledges]
                                                                 │
                                                           escalated
```

### 6.2 Check-In Required

When `first_check_in_due_at` passes:

1. `overrun_state` transitions to `check_in_due`
2. Narada surfaces a check-in request to the assigned agent's session
3. The agent may respond with:
   - **Progress update** — expectation remains valid, `first_check_in_due_at` is extended
   - **Scope change request** — operator review required, may trigger `operator_override`
   - **Blocker report** — task is blocked, may trigger release or continuation

### 6.3 Overrun

When `expected_duration_minutes + escalation_threshold_minutes` passes since `picked_up_at`:

1. `overrun_state` transitions to `overrun`
2. The assignment is flagged for operator attention
3. Operator options:
   - **Extend expectation** (`operator_override`) — agent continues
   - **Release assignment** — task returns to `opened`, agent freed
   - **Continue / takeover** — new assignment with fresh expectation
   - **Escalate** — `overrun_state` → `escalated`, operator takes direct control

### 6.4 Escalation

`escalated` is a terminal overrun state:

- The assignment remains active but is under operator direct review
- The agent may still report, but all reports require operator acknowledgment
- Only an operator may transition out of `escalated` (extend, release, or close)

---

## 7. Non-Goals

| Non-Goal | Rationale |
|----------|-----------|
| **Opaque runtime ML for expectation prediction** | All derivation inputs must be inspectable and traceable. No black-box model may set assignment expectation. |
| **Second authoritative estimate in markdown** | Would violate Decision 546/549 single-source-of-truth per field. Markdown owns authored specification only. |
| **Lease heartbeat treated as progress expectation** | Lease is mechanical liveness; expectation is semantic progress. Conflating them produces false positives and false negatives. |
| **Real-time progress percentage tracking** | Out of scope for v0. Progress is coarse-grained: pickup → check-in → report → review. |
| **Automatic task splitting on overrun** | Operator decision only. Narada surfaces the signal; the operator chooses the response. |
| **Cross-task expectation pooling** | Each assignment is independent. Averages and priors are inputs, not live state. |

---

## 8. Deferred Work

| Item | Why Deferred | Destination |
|------|-------------|-------------|
| **SQLite schema migration** | Assignment table needs new columns; migration script needed | Task 580+ |
| **Expectation derivation function** | Requires historical data + priors + parsing; not needed for authority model | Task 580+ |
| **Check-in surface** | Needs session-aware notification; depends on Task 577 execution-start path | Task 581+ |
| **Operator override CLI** | Simple `ALTER` on assignment row; needs UI design | Task 582+ |
| **Workbench expectation pane** | UI rendering deferred until observation schema settles | Task 583+ |
| **Historical average computation** | Needs sufficient assignment history to be meaningful | Future chapter |

---

## 9. Verification Evidence

- Assignment instance declared as single authoritative place for live expectation state ✅
- SQLite field shape explicit with TypeScript interface ✅
- Task-level and agent-kind priors classified as non-authoritative inputs ✅
- No-duplication rule explicit with severity levels and detection rules ✅
- Overrun / check-in / escalation path explicit with state machine ✅
- Non-goals explicit with rationale ✅
- `pnpm verify`: 5/5 steps pass ✅
- `pnpm typecheck`: all 11 packages clean ✅

---

**Closed by:** a3  
**Closed at:** 2026-04-24
