# Task Graph Evolution Boundary

> **Governance contract for `.ai/tasks` as a controlled task-graph substrate.**
>
> This document defines the rules that govern how tasks may be created, numbered, renumbered, linked, reviewed, and evolved. It is the canonical boundary contract for task-graph correctness.
>
> Paired with: `.ai/task-contracts/agent-task-execution.md` and `.ai/task-contracts/question-escalation.md`.

---

## 1. Task Identity

A **task** is a self-standing Markdown file in `.ai/tasks/` that carries a unique task number and enough execution context for an agent to act from `execute <task-number>` alone.

### 1.1 Filename Format

```
YYYYMMDD-NNN-<kebab-title>.md
```

- `YYYYMMDD`: creation date (UTC)
- `NNN`: three-digit task number, zero-padded
- `<kebab-title>`: human-readable slug

### 1.2 Heading Identity

Every executable task file MUST contain exactly one first-level heading:

```markdown
# Task NNN — <Title>
```

The heading task number MUST match the filename task number.

### 1.3 Identity Invariants

| Invariant | Rule |
|-----------|------|
| **Uniqueness** | A task number MUST map to exactly one executable task file. |
| **Heading match** | Filename task number MUST match `# Task NNN` heading. |
| **Self-standing** | A task file MUST contain enough context for execution without extra pasted instructions. |
| **No conflict** | A task MUST NOT be both executable and deferred/closed in conflicting places. |
| **No derivatives** | No derivative task-status files may exist (no `-EXECUTED`, `-DONE`, `-RESULT`, `-FINAL`, `-SUPERSEDED` suffixes). |

### 1.4 Chapter DAG Files

A **chapter DAG file** is a non-executable planning artifact that defines a range of related tasks. It:

- MAY live in `.ai/tasks/` alongside executable tasks;
- MUST NOT claim a `# Task NNN` heading (it is not executable);
- MUST use a range in its filename (e.g., `YYYYMMDD-NNN-MMM-chapter-name.md`);
- MUST declare its task-number range explicitly in the front matter or body;
- MUST NOT collide with executable task numbers inside its declared range.

Chapter DAG range reservations are subject to the same allocation protocol as executable tasks (see §3).

#### Chapter State Machine

Chapter state is **derived from task statuses**, not stored independently. The canonical states are:

| State | Derivation Rule |
|-------|-----------------|
| `proposed` | Chapter DAG exists but no task files in the declared range. |
| `shaped` | All tasks in range exist; none are actively being worked on (`claimed`, `in_progress`, `in_review`, `needs_continuation`). |
| `executing` | At least one task in range is `claimed`, `in_progress`, `in_review`, or `needs_continuation`. |
| `review_ready` | All tasks in range are terminal (`closed`, `accepted`, `deferred`, or `confirmed`). |
| `closing` | A closure decision draft exists in `.ai/decisions/` for the range. |
| `closed` | A closure decision with `status: accepted` exists for the range. |
| `committed` | Closure decision accepted and unchanged for 24 hours. |

Commands:

```bash
# Derive and inspect chapter state (read-only)
narada chapter status <range> [--format json]

# Closure workflow
narada chapter close <range> --start   # Generate closure decision draft
narada chapter close <range> --finish  # Accept closure, transition closed→confirmed
narada chapter close <range> --reopen  # Return chapter to executing

# Chapter-scoped lint
narada task lint --chapter <range>
```

Rules:
- Chapter state is computed, not stored. No persistent chapter state file is mutated.
- `--start` requires all tasks to be terminal (`review_ready`).
- `--finish` requires the closure draft to exist and be complete (all required sections present).
- `--finish` transitions all `closed` tasks in range to `confirmed`.
- `--reopen` is advisory; it does not delete closure artifacts.

---

## 2. Task Lifecycle

Tasks move through a durable lifecycle recorded in the task file itself.

### 2.1 Canonical States

| State | Meaning | Authority |
|-------|---------|-----------|
| `opened` | Task created, ready for assignment | Task creator |
| `claimed` | Agent has claimed the task | Claiming agent |
| `in_progress` | Agent is actively working | Working agent |
| `reported` | WorkResultReport submitted, awaiting review | Reporting agent |
| `reviewing` | Reviewer assigned, review in progress | Reviewer |
| `accepted` | Review accepted, task complete | Reviewer |
| `rejected` | Review rejected, corrective work needed | Reviewer |
| `closed` | Task closed (done, obsolete, or superseded) | Operator / task creator |
| `deferred` | Blocked or postponed indefinitely | Operator |

### 2.2 State Recording

State is recorded in YAML front matter:

```yaml
---
status: opened
claimed_by: null
claimed_at: null
reported_at: null
reviewer: null
reviewed_at: null
closes: null
supersedes: null
---
```

Lifecycle transitions are documented in the task body under `## Execution Notes` or `## Outcome`, not in derivative files.

### 2.3 State Transition Rules

- Only `claimed` → `in_progress` → `reported` are agent-driven.
- `reviewing` → `accepted` / `rejected` are reviewer-driven.
- `accepted` → `closed` is operator-driven (or automatic after a grace period).
- A task in `rejected` returns to `claimed` or `in_progress` for corrective work.
- `deferred` and `closed` are terminal unless explicitly reopened.

---

## 3. Numeric Allocation and Range Reservation

### 3.1 Allocation Principle

Task numbers are allocated **sequentially from a shared namespace**. The next available number is the smallest positive integer not currently assigned to any executable task heading.

### 3.2 Forbidden Allocation Methods

Agents MUST NOT:

- Allocate task numbers by `ls .ai/tasks | tail` or similar shell patterns;
- Reuse a task number that already has a `# Task NNN` heading;
- Guess the next number from filename ordering alone;
- Create a task without checking for collisions.

### 3.3 Range Reservation Protocol

Before creating a chapter DAG or a batch of related tasks, an agent or operator MUST reserve the task-number range.

#### Reservation Record

Reservations are stored in `.ai/tasks/.registry.json`:

```json
{
  "version": 1,
  "last_allocated": 443,
  "reservations": [
    {
      "range_start": 444,
      "range_end": 448,
      "purpose": "Task graph evolution boundary implementation",
      "reserved_by": "agent-name",
      "reserved_at": "2026-04-22T00:00:00Z",
      "expires_at": "2026-04-23T00:00:00Z",
      "status": "active"
    }
  ]
}
```

#### Reservation Rules

| Rule | Description |
|------|-------------|
| **Who may reserve** | Any agent or operator with task-creation authority. |
| **Range size** | Must be bounded (max 20 tasks per reservation without operator approval). |
| **Expiration** | Reservations expire after 24 hours unless extended. |
| **Release** | Expired reservations are automatically released. Completed reservations are marked `released`. |
| **Collision avoidance** | A reservation blocks the range. No other agent may create tasks in a reserved range. |
| **Partial recovery** | If a chapter is partially created, the reservation remains active until explicitly released or the remaining numbers are reclaimed. |

#### Next-Number Selection

```
next_number = max(last_allocated, max(reserved_range_ends)) + 1
```

If `.registry.json` does not exist, the next number is `max(existing task numbers) + 1`.

### 3.4 Registry Schema

```typescript
interface TaskRegistry {
  version: number;
  last_allocated: number;
  reservations: Array<{
    range_start: number;
    range_end: number;
    purpose: string;
    reserved_by: string;
    reserved_at: string;   // ISO 8601
    expires_at: string;    // ISO 8601
    status: "active" | "released" | "expired";
  }>;
}
```

---

## 4. Dependency Edges and Blockers

### 4.1 `depends_on`

A task MAY declare `depends_on` in front matter:

```yaml
---
depends_on: [260, 261, 262]
---
```

Rules:
- Each element MUST reference an existing task number, unless marked external/deferred.
- External dependencies MUST be prefixed with `ext:` (e.g., `ext:upstream-project#42`).
- A task MUST NOT be claimed until all non-external `depends_on` tasks are `accepted` or `closed`.
- Circular dependencies are forbidden.

### 4.2 `blocked_by`

A task MAY declare `blocked_by` for runtime blockers:

```yaml
---
blocked_by: [267, 271]
---
```

Rules:
- `blocked_by` references MUST be existing task numbers.
- A `blocked_by` task may be in any state; it is an advisory signal, not a hard dependency.
- `blocked_by` does not prevent claim, but agents SHOULD check blocker status before starting work.

### 4.3 Chapter DAG Ranges

Chapter DAG files define implicit dependencies across a range. The chapter file itself:

- MUST list all tasks in its range;
- MUST declare explicit edges (e.g., `431 → 433`);
- MUST NOT introduce edges that cross into another chapter's range without explicit coordination.

---

## 5. Assignment, Roster, and WorkResultReport Relationship

### 5.1 Assignment Source of Truth

The operational agent roster (`.ai/agents/roster.json`) is the canonical source of truth for which agent is currently working on which task. See `.ai/task-contracts/agent-task-execution.md` §Agent Roster as Assignment Source of Truth.

Roster mutations are serialized through an exclusive file lock (`.ai/agents/roster.lock`) to prevent lost updates under concurrent or rapid sequential use. All roster writes must route through the `withRosterMutation` primitive; direct file edits are unsafe.

### 5.2 WorkResultReport Relationship

A WorkResultReport is durable evidence submitted by an agent when work is ready for review. It:

- is linked to exactly one task;
- does NOT close the task;
- awaits independent review.

Reports are stored in `.ai/reports/` or referenced from the task file. The exact storage mechanism is implementation-defined (see Task 449+).

### 5.3 Review Relationship

Reviews:

- are separate from reports;
- may be recorded in `.ai/reviews/`;
- must reference the task number being reviewed;
- transition the task to `accepted` or `rejected`.

### 5.4 Accepted-Learning Relationship

Accepted learning artifacts (`.ai/learning/accepted/`) may reference tasks as source material. When a learning artifact's `source_kind` is `task`, the referenced task number MUST exist.

---

## 6. Renumbering and Correction Operator

### 6.1 When to Renumber

Renumbering is required when:

- two tasks share the same task number (collision);
- a task heading number does not match its filename;
- a chapter DAG range overlaps with executable task numbers outside the chapter;
- `depends_on` or `blocked_by` references point to wrong numbers after a correction.

### 6.2 Renumbering Rules

| Rule | Requirement |
|------|-------------|
| **Patch filenames** | Rename files to match the corrected number. |
| **Patch headings** | Update `# Task NNN` headings. |
| **Patch front matter** | Update `depends_on`, `blocked_by`, `closes`, `supersedes`. |
| **Patch chapter DAGs** | Update range declarations and task tables in chapter files. |
| **Patch decisions** | Update task references in `.ai/decisions/` if explicitly listed. |
| **Preserve history** | Note the correction in the affected original task or decision under `## Corrections`. |
| **No derivative files** | Do not create `*-SUPERSEDED.md` or `*-RENAMED.md` files. |
| **Explicit operator** | Renumbering must be performed by an explicit operator or script, not ad hoc shell edits. |

### 6.3 Correction Notation

When a task is renumbered, append to its body:

```markdown
## Corrections

- **2026-04-22**: Renumbered from Task 430 to Task 450 to resolve collision with active-learning-recall task.
```

---

## 7. Lint and Check Requirements

### 7.1 Required Checks

A task graph lint command MUST detect:

| Check | Severity | Description |
|-------|----------|-------------|
| `duplicate-task-number` | error | Two files claim the same `# Task NNN` heading. |
| `filename-heading-mismatch` | error | Filename number does not match heading number. |
| `stale-dependency` | warning | `depends_on` references a non-existent task number. |
| `stale-blocker` | warning | `blocked_by` references a non-existent task number. |
| `range-collision` | error | Chapter DAG range overlaps with executable task numbers. |
| `derivative-file` | error | Forbidden suffix found (`-EXECUTED`, `-DONE`, `-RESULT`, `-FINAL`, `-SUPERSEDED`). |
| `missing-heading` | warning | Markdown file in `.ai/tasks/` lacks `# Task NNN` heading and is not a declared chapter DAG. |
| `missing-self-standing-context` | warning | Task file lacks required sections (Context, Goal, Acceptance Criteria). |
| `stale-report-reference` | warning | WorkResultReport references a missing task number. |
| `stale-review-reference` | warning | Review file references a missing task number. |
| `stale-assignment` | warning | Roster entry references a missing task number. |
| `stale-learning-reference` | warning | Accepted learning artifact references a missing task number when `source_kind === "task"`. |

### 7.2 Lint Command Design

The lint command MAY extend the existing `scripts/task-file-guard.ts` or be a separate command:

```bash
# Option A: extend task-file-guard
narada task lint

# Option B: separate command
scripts/task-graph-lint.ts
```

The lint must:
- scan `.ai/tasks/`, `.ai/reviews/`, `.ai/decisions/`, `.ai/agents/roster.json`, `.ai/learning/accepted/`;
- return non-zero exit code on any `error`-severity finding;
- report `warning`-severity findings but not fail;
- support `--fix` for renumbering operations (see Task 451).

### 7.3 Graph Inspection Operator

```bash
narada task graph --format mermaid
narada task graph --format json --range 429-454 --status opened,claimed
```

This is a **read-only inspection operator**:

- **Read-only**: It does not mutate task files, roster files, reports, reviews, or registry state.
- **Non-authoritative**: It renders the current state of `.ai/tasks` for human observability; it does not enforce rules or transition states.
- **Safe for humans and agents**: Safe to use before assignment, during planning, or when reviewing chapter progress.
- **Not a replacement** for `task lint`, `task claim`, `task roster`, or `chapter close`.

Behavior:

- Renders tasks as nodes and `depends_on` / `blocked_by` as edges.
- `depends_on` edges are shown as solid arrows (`-->`).
- `blocked_by` edges are shown as dotted arrows with a `blocked` label (`-.->|blocked|`).
- Closed tasks are omitted by default; include them with `--include-closed`.
- If a visible task depends on a filtered-out task, the dependency is included as compact context.
- Roster assignments are overlaid on nodes when available (`working: a6`).
- Output is stable across runs for the same graph.

---

## 8. Agent Execution Contract Updates

Agents MUST:

1. **Never allocate task numbers by inspecting `ls | tail`.** Always use the reservation/allocation protocol.
2. **Check `.ai/tasks/.registry.json`** before creating tasks. If the registry does not exist, compute the next available number by scanning all task headings.
3. **Stop and invoke the correction path** if a collision is detected.
4. **Record the collision** in the task file or `.ai/feedback/governance.md` if no implementation exists yet.
5. **Respect range reservations.** Do not create tasks inside an active reserved range belonging to another agent or chapter.

---

## 9. Non-Goals

This contract does NOT require:

- A database-backed task tracker;
- Merge with Site runtime state;
- Rewrite of existing task history;
- Renaming of unrelated historical tasks;
- Enforcement automation (that is the subject of follow-up tasks).

---

## 11. Construction Loop Controller

The construction loop controller is a read-plan-assist layer above individual task operators. It composes `task roster`, `task graph`, `task evidence`, `chapter status`, `task recommend`, and `task promote-recommendation --dry-run` into a single operator plan.

It is **not** an autonomous dispatcher by default. The v0 default is plan-only. Bounded auto-promotion is available under explicit operator opt-in (see Auto-Promotion Boundary below).

Policy lives in `.ai/construction-loop/policy.json` and is operator-owned. The controller may never:
- Auto-promote without explicit operator opt-in (`bounded_auto` + `require_operator_approval_for_promotion: false`).
- Mutate task files, roster, or assignment state except through audited `task promote-recommendation` delegation.
- Parse chat messages as authoritative completion evidence.
- Create derivative task-status files.

### Policy Reference

The full policy schema, field descriptions, and examples are documented in `.ai/construction-loop/README.md`.

CLI operators:

```bash
# Display current effective policy
narada construction-loop policy show [--format json]

# Create default policy file (idempotent)
narada construction-loop policy init

# Create strict policy variant
narada construction-loop policy init --strict

# Validate existing policy and report all errors
narada construction-loop policy validate
```

Policy validation checks:
- Field types and ranges (e.g., `ccc_influence_weight` must be 0.0–1.0)
- Cross-field constraints (e.g., `max_simultaneous_assignments` ≥ `max_tasks_per_cycle`)
- Set disjointness (`blocked_agent_ids` and `preferred_agent_ids` must not overlap)
- Range non-overlap (`blocked_task_ranges` must not overlap)
- Unsupported autonomy levels (`full_auto` is rejected in v0; `bounded_auto` requires explicit opt-in)

### Auto-Promotion Boundary

`narada construction-loop run` enables **bounded auto-promotion** under a tightened 12-gate policy. It is the only surface that may call `task promote-recommendation` live without an explicit `--by <operator>` argument.

Hard gates (ALL must pass):

| # | Gate | Check |
|---|------|-------|
| 1 | `autonomy_level` | `bounded_auto` |
| 2 | `operator_approval_disabled` | `require_operator_approval_for_promotion: false` |
| 3 | `task_468_validation` | Dry-run promotion returns `dry_run_ok` |
| 4 | `write_set_risk_low` | Write-set risk ≤ `low` |
| 5 | `recommendation_freshness` | Recommendation age ≤ 15 min |
| 6 | `task_status_opened` | Task status is `opened` |
| 7 | `agent_idle_duration` | Agent idle/done for ≥ 5 min |
| 8 | `max_simultaneous` | Active assignments < cap |
| 9 | `task_not_blocked` | Task not in blocked lists |
| 10 | `agent_not_blocked` | Agent not in blocked list |
| 11 | `not_paused` | Controller not paused |
| 12 | `daily_agent_limit` | Agent daily promotions < cap |

Rules:
- Failed gates write append-only audit records to `.ai/construction-loop/audit/`.
- `--dry-run` previews without mutation.
- `pause` creates `.ai/construction-loop/pause`; `resume` removes it.
- Metrics are computed from the audit log and exposed via `narada construction-loop metrics`.

### CLI Reference

```bash
# Plan-only (default, read-only)
narada construction-loop plan

# Bounded auto-promotion (requires explicit opt-in policy)
narada construction-loop run [--dry-run]

# Pause / resume
narada construction-loop pause [--reason <text>]
narada construction-loop resume

# Metrics
narada construction-loop metrics

# Policy management
narada construction-loop policy show
narada construction-loop policy init [--strict]
narada construction-loop policy validate
```

## 10. Related Documents

| Document | Purpose |
|----------|---------|
| `.ai/task-contracts/agent-task-execution.md` | Agent behavior during task execution |
| `.ai/task-contracts/question-escalation.md` | When and how to escalate |
| `.ai/task-contracts/chapter-planning.md` | Chapter DAG creation guidelines |
| `AGENTS.md` | Project-wide agent guidance |
| `.ai/feedback/governance.md` | Governance feedback channel |
