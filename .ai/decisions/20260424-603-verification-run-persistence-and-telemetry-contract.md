---
closes_tasks: [603]
decided_at: 2026-04-24
decided_by: a3
reviewed_by: a3
governance: derive -> propose
---

# Decision 603 — Verification Run Persistence And Telemetry Contract

## Status
**Accepted** — defines how governed test runs are persisted and how durable records relate to task verification surfaces.

## Context
Decisions 600–602 defined the zone boundary, request/result artifacts, and execution regime. This decision defines where those artifacts live durably and how they are consumed.

## Decision

### 1. Persistence Posture

Verification records are persisted in **SQLite**, adjacent to the existing task lifecycle store.

- **Why SQLite**: Same database as tasks, assignments, and dispatch packets; enables atomic cross-table queries; no new infrastructure.
- **What belongs there**: `verification_requests` and `verification_results` tables (authoritative boundaries).
- **What remains projected/read-only**: Trend views, flakiness reports, duration histograms (derived projections).

### 2. Minimum Durable Record Set

**Table: `verification_requests`**

| Column | Type | Purpose |
|--------|------|---------|
| `request_id` | TEXT PK | Canonical identity |
| `task_id` | TEXT FK | Linkage to task (nullable) |
| `target_command` | TEXT | Registered verification unit |
| `scope` | TEXT | `focused` or `full` |
| `timeout_seconds` | INTEGER | Declared timeout |
| `env_posture_json` | TEXT | Serialized environment posture |
| `requester_identity` | TEXT | Who requested |
| `requested_at` | TEXT ISO | Timestamp |
| `rationale` | TEXT | Why (nullable) |

**Table: `verification_results`**

| Column | Type | Purpose |
|--------|------|---------|
| `result_id` | TEXT PK | Canonical identity |
| `request_id` | TEXT FK | Links to request |
| `status` | TEXT | Terminal classification |
| `exit_code` | INTEGER | Raw exit code (nullable) |
| `duration_ms` | INTEGER | Wall-clock duration |
| `metrics_json` | TEXT | Serialized metrics |
| `stdout_digest` | TEXT | SHA-256 of stdout (nullable) |
| `stderr_digest` | TEXT | SHA-256 of stderr (nullable) |
| `stdout_excerpt` | TEXT | First 2KB (nullable) |
| `stderr_excerpt` | TEXT | First 2KB (nullable) |
| `completed_at` | TEXT ISO | Timestamp |

### 3. Telemetry Posture

| Telemetry | Classification | Stored | Purpose |
|-----------|---------------|--------|---------|
| Duration | First-class | `duration_ms` | Performance regression detection |
| Pass/fail/skip counts | First-class | `metrics_json` | Health trends |
| Terminal status | First-class | `status` | Verification truth |
| Full stdout/stderr | Incidental | File refs / 24h retention | Debugging only |
| Exit code | Incidental | `exit_code` | Diagnostic detail |

First-class telemetry is queryable in SQLite. Incidental telemetry may be stored elsewhere with shorter retention.

### 4. Retention Posture

| Phase | Age | Policy |
|-------|-----|--------|
| Active | 0–7 days | Full records retained |
| Recent | 7–30 days | Full records retained; eligible for read-only projection rebuild |
| Aged | 30–90 days | Summary retained (counts, durations, statuses); excerpts and digests pruned |
| Archive | 90+ days | Summary only; detailed records pruned |

Summaries are immutable rollups: total runs, pass rate, average duration per target command.

### 5. Task-Verification Consumption

Task verification surfaces **consume** result records without duplicating them:

- **Latest status**: Query `verification_results` by `task_id`, order by `completed_at` DESC, limit 1.
- **History**: Query last N results for trend.
- **Evidence reference**: Task verification note stores `result_id`, not status text.

This preserves the single-writer principle: only the execution regime writes results; task surfaces read them.

### 6. Raw Output Retention

| Output | Retention | Storage |
|--------|-----------|---------|
| Excerpt (2KB) | Same as result record | Inline in SQLite |
| Full stream digest | Same as result record | Inline in SQLite |
| Full stream content | 24 hours | Filesystem temp or blob store; eligible for immediate pruning |

Full stdout/stderr are **debug-only**. They are not required for verification truth and may be discarded aggressively.

## Consequences

- **Positive**: Verification history is queryable alongside task history.
- **Positive**: No duplication between task notes and result store.
- **Positive**: Retention policy keeps the database bounded.
- **Trade-off**: Full output retention is minimal; deep debugging may require re-running tests.
- **Trade-off**: Requires schema migration to add verification tables to the existing SQLite store.
