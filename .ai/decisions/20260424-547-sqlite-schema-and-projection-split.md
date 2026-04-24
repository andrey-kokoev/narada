---
closes_tasks: [547]
decided_at: 2026-04-24
decided_by: codex
reviewed_by: codex
governance: derive -> propose
---

# Decision 547 — SQLite Schema And Projection Split

## Problem

Decision 546 established the authority boundary:

- SQLite owns task lifecycle state
- markdown owns authored task specification
- projection may merge both for read surfaces, but must not become a second authority store

What remained open was the concrete schema and projection split:

- which tables are minimally required
- what exact fields belong in each table
- how markdown survives without reintroducing duplicate authority
- how read surfaces combine SQLite + markdown without write-back drift

## Decision

Narada adopts **Model A: authored markdown spec + SQLite lifecycle authority + read-only merged projection**.

### 1. SQLite-Authoritative Tables

#### `task_lifecycle`

```sql
CREATE TABLE task_lifecycle (
  task_id TEXT PRIMARY KEY,
  task_number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('opened','claimed','in_review','closed','needs_continuation')),
  governed_by TEXT,
  closed_at TEXT,
  closed_by TEXT,
  reopened_at TEXT,
  reopened_by TEXT,
  continuation_packet_json TEXT,
  updated_at TEXT NOT NULL
);
```

Purpose:
- canonical lifecycle state
- terminal provenance
- continuation handoff state

#### `task_assignments`

```sql
CREATE TABLE task_assignments (
  assignment_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  released_at TEXT,
  release_reason TEXT,
  intent TEXT NOT NULL CHECK (intent IN ('primary','review','repair','takeover')),
  FOREIGN KEY (task_id) REFERENCES task_lifecycle(task_id)
);
```

Purpose:
- append-only assignment history
- current active assignee derived as latest unreleased assignment

#### `task_reports`

```sql
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
```

Purpose:
- durable execution evidence records
- report-level summaries and verification payloads

#### `task_reviews`

```sql
CREATE TABLE task_reviews (
  review_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  reviewer_agent_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('accepted','rejected','needs_changes')),
  findings_json TEXT,
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES task_lifecycle(task_id)
);
```

Purpose:
- durable review decisions
- separation from task markdown narrative

#### `task_number_sequence`

```sql
CREATE TABLE task_number_sequence (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  last_allocated INTEGER NOT NULL DEFAULT 0
);
```

Purpose:
- replace `.ai/tasks/.registry.json` as authoritative allocator state

### 2. Markdown-Authored Task Spec

Markdown remains authoritative for:

- `task_id` (filename-derived identity)
- `created`
- `depends_on`
- `continuation_affinity`
- title / goal / required work
- acceptance criteria
- `## Execution Notes`
- `## Verification`

Markdown is not authoritative for:

- `status`
- `governed_by`
- `closed_at`
- `closed_by`
- `reopened_at`
- `reopened_by`
- `continuation_packet`
- assignment linkage

### 3. Projection Model

Read surfaces construct a merged task view from:

- markdown-authored spec
- SQLite lifecycle rows
- SQLite assignment/report/review rows

Canonical projection shape:

```ts
interface ProjectedTaskView {
  task_id: string;
  task_number: number;
  title: string;
  created: string | null;
  depends_on: number[];
  continuation_affinity?: unknown;
  status: 'opened' | 'claimed' | 'in_review' | 'closed' | 'needs_continuation';
  governed_by?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  active_assignment?: {
    assignment_id: string;
    agent_id: string;
    intent: string;
    claimed_at: string;
  } | null;
  report_count: number;
  review_count: number;
  body_sections: {
    goal?: string;
    required_work?: string;
    acceptance_criteria?: string[];
    execution_notes?: string;
    verification?: string;
  };
}
```

### 4. Projection Rules

1. Projection is read-only.
2. Projection must never write lifecycle state back to markdown.
3. Lifecycle queries (`status`, closure provenance, assignment state) must come from SQLite.
4. Evidence/body queries (`execution notes`, `verification`, criteria text) come from markdown.
5. If markdown and SQLite disagree on a lifecycle field present in markdown, SQLite wins and lint reports breach.

### 5. Human-Readable Posture

Narada chooses **not** to keep status in markdown front matter after migration cutover.

Why:
- it avoids dual authority
- preserves clean authored files
- keeps lifecycle inspection in CLI/workbench where queryability matters

If a merged printable/export view is needed later, it should be generated on demand rather than persisted back to the task file.

## Migration Posture

Incremental migration is acceptable:

1. add SQLite schema alongside existing markdown authority
2. backfill lifecycle rows from current task files and assignment JSON
3. switch read surfaces to projection/SQLite
4. switch lifecycle writers to SQLite
5. strip lifecycle authority from markdown front matter

## Verification

- Decision 546 boundary split is preserved exactly ✅
- Minimum schema is now explicit, normalized, and field-owned ✅
- Projection model is explicit and read-only ✅
- Anti-duplication posture is preserved via Model A ✅
- Git-readable markdown survives as authored specification ✅

## Closure Statement

Task 547 closes with a concrete schema and projection split: SQLite holds authoritative lifecycle state in five minimal tables, markdown remains authored task specification, and operator/read surfaces consume a read-only merged projection. No lifecycle field remains independently authoritative in both stores.
