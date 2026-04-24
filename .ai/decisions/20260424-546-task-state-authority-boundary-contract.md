# Decision 546 — Task State Authority Boundary Contract

> **Status:** Closed  
> **Task:** 546  
> **Governed by:** task_close:a2  
> **Depends on:** 501, 507, 509  
> **Chapter:** Task Lifecycle State Authority Migration (546–550)

---

## Goal

Define the authoritative split between SQLite-backed task lifecycle state and markdown-authored task specification.

---

## Current State (Before Migration)

Task lifecycle authority currently lives in **markdown front matter** (`.ai/tasks/*.md`). CLI operators read the markdown file, mutate the front matter, and rewrite the file atomically. This means:

- Any agent or human with filesystem access can bypass governed transitions by editing markdown directly.
- The lint tool (`narada task lint`) detects violations after the fact but cannot prevent them.
- There is no durable queryable store for task lifecycle — only filesystem scanning.
- Race conditions exist on read-modify-write sequences across concurrent agents.

---

## Proposed Authority Split

### SQLite-Authoritative Lifecycle Fields

These fields represent the **canonical durable state** of a task's lifecycle. They live in SQLite and are the sole source of truth. Markdown may display them as a **projected read view**, but markdown is not authoritative.

| Field | Type | Authority | Written By |
|-------|------|-----------|------------|
| `status` | `opened \| claimed \| in_review \| closed \| needs_continuation` | SQLite | `task-claim`, `task-release`, `task-report`, `task-review`, `task-close`, `task-reopen`, `task-continue` |
| `governed_by` | `string` (provenance marker) | SQLite | `task-review`, `task-close`, `chapter-close` |
| `closed_at` | `ISO timestamp` | SQLite | `task-review`, `task-close`, `chapter-close` |
| `closed_by` | `agent_id` | SQLite | `task-review`, `task-close`, `chapter-close` |
| `reopened_at` | `ISO timestamp` | SQLite | `task-reopen` |
| `reopened_by` | `agent_id` | SQLite | `task-reopen` |
| `continuation_packet` | `JSON` | SQLite | `task-release` (budget_exhausted) |
| `assignment_record_id` | `string` (FK to assignments) | SQLite | `task-claim`, `task-continue` |

### Markdown-Authored Specification Fields

These fields represent the **human-authored intent and narrative** of a task. They live in markdown and are never mutated by lifecycle operators.

| Field | Type | Authority | Written By |
|-------|------|-----------|------------|
| `task_id` | `string` | Markdown (filename-derived) | Human author at creation |
| `title` | `string` | Markdown (H1 in body) | Human author |
| `depends_on` | `number[]` | Markdown | Human author |
| `continuation_affinity` | `object` | Markdown (advisory) | Human author |
| `created` | `ISO date` | Markdown | Human author |
| `goal` | `text` | Markdown (body section) | Human author |
| `required_work` | `text` | Markdown (body section) | Human author |
| `acceptance_criteria` | `checkbox list` | Markdown (body section) | Human author |
| `execution_notes` | `text` | Markdown (body section) | Agent (via `task-report` scaffolding) |
| `verification` | `text` | Markdown (body section) | Agent (via `task-report` scaffolding) |

### Projected / Derived Read View

A **projection layer** merges SQLite lifecycle state with markdown specification to produce the operator-facing task view:

| View | Source |
|------|--------|
| Task card in workbench | SQLite `status` + Markdown `title` + SQLite `assignment` |
| Task list with status filter | SQLite `status` (queryable, not filesystem scan) |
| Dependency check | SQLite `status` + Markdown `depends_on` |
| Evidence panel | Markdown body sections (execution notes, verification, criteria) |
| Audit trail | SQLite assignment history + report/review records |

---

## What Must Stop

### 1. Direct Markdown Front-Matter Mutation for Lifecycle

The following operators currently rewrite `.ai/tasks/*.md` front matter. After the migration, they must **write to SQLite instead** and let the projection layer update the markdown view (or leave markdown as a static authored document):

| Operator | Current Action | Future Action |
|----------|---------------|---------------|
| `task-claim` | `frontMatter.status = 'claimed'` | Insert SQLite row; update `assignments` table |
| `task-release` | `frontMatter.status = 'opened'` etc. | Update SQLite status; write release record |
| `task-report` | `frontMatter.status = 'in_review'` | Update SQLite status; insert report record |
| `task-review` | `frontMatter.status = 'closed'`; sets `governed_by`, `closed_at` | Update SQLite status/provenance; insert review record |
| `task-close` | `frontMatter.status = 'closed'`; sets `governed_by`, `closed_at` | Update SQLite status/provenance |
| `task-reopen` | `frontMatter.status = 'opened'`; deletes `governed_by` | Update SQLite status/provenance |
| `task-continue` | `frontMatter.status = 'claimed'` | Update SQLite status; insert continuation record |

### 2. Markdown as Durable Query Target

After migration, no correctness logic may query `.ai/tasks/*.md` for `status`, `governed_by`, `closed_at`, or `closed_by`. These queries must target SQLite.

**Exceptions:**
- `narada task lint` may still scan markdown for violation detection (it is an inspection tool, not a correctness dependency).
- The projection layer may read markdown for display purposes only.

---

## Boundary Invariants

1. **Single source of truth per field.** A field is authoritative in exactly one store. No field may be independently authoritative in both SQLite and markdown.
2. **SQLite owns transitions.** All lifecycle state transitions are recorded as SQLite transactions with timestamps and actor IDs.
3. **Markdown owns intent.** The specification (goal, work, criteria) is authored in markdown and never mutated by lifecycle operators.
4. **Projection is read-only.** The merged view of SQLite + markdown is a derived surface. It must not be written back to either source.
5. **Audit completeness.** Every lifecycle transition leaves an audit record in SQLite (assignment history, report, review, or explicit audit row).

---

## SQLite Schema Minimum (for Task 547)

The following tables are required for authoritative task lifecycle:

```sql
-- Canonical task lifecycle state
CREATE TABLE task_lifecycle (
  task_id TEXT PRIMARY KEY,
  task_number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL,
  governed_by TEXT,
  closed_at TEXT,
  closed_by TEXT,
  reopened_at TEXT,
  reopened_by TEXT,
  continuation_packet_json TEXT,
  updated_at TEXT NOT NULL
);

-- Assignment history (migrates from .ai/tasks/assignments/*.json)
CREATE TABLE task_assignments (
  assignment_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  released_at TEXT,
  release_reason TEXT,
  intent TEXT NOT NULL, -- primary, review, repair, takeover
  FOREIGN KEY (task_id) REFERENCES task_lifecycle(task_id)
);

-- Work result reports (migrates from .ai/tasks/reports/*.json)
CREATE TABLE task_reports (
  report_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  changed_files_json TEXT,
  verification_json TEXT,
  submitted_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES task_lifecycle(task_id)
);

-- Review artifacts (migrates from .ai/reviews/*.json)
CREATE TABLE task_reviews (
  review_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  reviewer_agent_id TEXT NOT NULL,
  verdict TEXT NOT NULL,
  findings_json TEXT,
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES task_lifecycle(task_id)
);
```

The task number allocator (currently `.ai/tasks/.registry.json`) also moves to SQLite:

```sql
CREATE TABLE task_number_sequence (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  last_allocated INTEGER NOT NULL DEFAULT 0
);
```

---

## Markdown Survival Model

After the migration, markdown files have three possible roles. The chapter selects **one**:

| Model | Description | Pros | Cons |
|-------|-------------|------|------|
| **A. Authored spec only** | Markdown contains only `task_id`, `depends_on`, `continuation_affinity`, `created`, and body text. No lifecycle fields. | Cleanest split; no duplication | Workbench needs SQLite query for status |
| **B. Compiled merged view** | Markdown front matter is regenerated by projection layer from SQLite + authored fields. | Human-readable file still shows status | Risk of edit wars if humans mutate projected fields |
| **C. Split file** | `.ai/tasks/NNN.md` for spec; `.ai/tasks/NNN.state.json` for lifecycle. | Preserves current file layout | Adds a second file per task |

**Recommendation:** Model A (authored spec only) with a read-only projection that can regenerate a merged view on demand. This is the cleanest authority boundary.

---

## What Remains Out of Scope for the First Migration Line

| # | Item | Why Deferred |
|---|------|-------------|
| 1 | **Migrating operators** | Tasks 548–549 define the migration plan; actual operator rewrite is a subsequent chapter |
| 2 | **Roster migration** | Agent roster may also move to SQLite, but that is a separate concern from task lifecycle |
| 3 | **Report/review body text** | Report summaries and review findings are currently JSON; rich text migration is future work |
| 4 | **Real-time projection** | The workbench projection may start as on-demand regeneration; incremental update is future work |
| 5 | **Backfill of historical tasks** | Existing closed tasks may remain in markdown-only form; backfill is optional |
| 6 | **Multi-repo coordination** | Task state across multiple repos requires a federated model not yet designed |

---

## Verification Evidence

- Current task operators identified: 7 operators mutate markdown front matter ✅
- Current storage locations enumerated: markdown, JSON assignments, JSON roster, JSON registry, JSON reports, JSON reviews ✅
- SQLite schema proposed with no field duplication ✅
- Three markdown survival models evaluated ✅
- `pnpm typecheck`: all 11 packages pass ✅

---

## Closure Statement

Task 546 closes with a clear authority boundary: **SQLite owns lifecycle; markdown owns specification.** Seven operators currently mutate markdown front matter and will need to be rewired to SQLite in subsequent tasks. The projection layer will merge SQLite state with markdown body for human readability, but the projection is read-only. The recommended markdown survival model is "authored spec only" (Model A), which removes all lifecycle fields from markdown and eliminates the duplication risk entirely.

---

## Next Executable Line

**Task 547 — SQLite Schema And Projection Split:**
1. Create the minimum SQLite schema (task_lifecycle, task_assignments, task_reports, task_reviews, task_number_sequence).
2. Implement the projection layer that reads SQLite + markdown and produces the merged task view.
3. Verify the schema can represent all current task states without loss.

---

**Closed by:** a2  
**Closed at:** 2026-04-24
