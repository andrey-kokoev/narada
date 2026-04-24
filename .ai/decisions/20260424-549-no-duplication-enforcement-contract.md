# Decision 549 — No-Duplication Enforcement Contract

> **Status:** Closed  
> **Task:** 549  
> **Governed by:** task_close:codex  
> **Depends on:** 546 (Task State Authority Boundary Contract), 547 (SQLite Schema And Projection Split), 548 (Task Operator Migration Plan)  
> **Chapter:** Task Lifecycle State Authority Migration (546–550)  

---

## 1. Problem Statement

Task 546 defined the authority split: SQLite owns lifecycle state; markdown owns authored specification. But a defined split is not a enforced split. Without explicit enforcement rules, the following failure modes remain possible:

1. **Agent bypass:** An agent edits `status: closed` directly into markdown front matter, bypassing `task-close` and its governance gates.
2. **Operator drift:** A human operator updates `governed_by` in markdown to fix a typo, creating a mismatch with SQLite.
3. **Projection write-back:** The workbench projection layer accidentally writes merged state back to markdown.
4. **Schema creep:** A new field is added to both SQLite schema and markdown front matter without an explicit authority decision.
5. **Lint desync:** The task lint tool detects violations but does not prevent them, and its rules may lag behind schema changes.

This contract defines the **enforcement rules, lint gates, operator guards, and projection constraints** that prevent these failure modes.

---

## 2. Field Ownership Summary (From Decision 546)

### 2.1 SQLite-Authoritative Lifecycle Fields

These fields must exist **only** in SQLite. Markdown must not contain them.

| Field | SQLite Table | Writable By |
|-------|-------------|-------------|
| `status` | `task_lifecycle` | `task-claim`, `task-release`, `task-report`, `task-review`, `task-close`, `task-reopen`, `task-continue` |
| `governed_by` | `task_lifecycle` | `task-review`, `task-close`, `chapter-close` |
| `closed_at` | `task_lifecycle` | `task-review`, `task-close`, `chapter-close` |
| `closed_by` | `task_lifecycle` | `task-review`, `task-close`, `chapter-close` |
| `reopened_at` | `task_lifecycle` | `task-reopen` |
| `reopened_by` | `task_lifecycle` | `task-reopen` |
| `continuation_packet` | `task_lifecycle` | `task-release` |
| `assignment_record_id` | `task_lifecycle` | `task-claim`, `task-continue` |

### 2.2 Markdown-Authored Specification Fields

These fields live **only** in markdown. SQLite must not contain them.

| Field | Markdown Location |
|-------|-------------------|
| `task_id` | Filename |
| `depends_on` | Front matter |
| `continuation_affinity` | Front matter |
| `created` | Front matter |
| `title` | Body H1 |
| `goal` | Body section |
| `required_work` | Body section |
| `acceptance_criteria` | Body checkbox list |
| `execution_notes` | Body section |
| `verification` | Body section |

### 2.3 Projected Fields

These fields may appear in a **read-only projection** but are never written back to either source.

| Field | Projection Source |
|-------|-------------------|
| `status_display` | SQLite `status` |
| `assignee_display` | SQLite `task_assignments` (latest active) |
| `last_updated_display` | SQLite `task_lifecycle.updated_at` |
| `closure_provenance_display` | SQLite `governed_by` + `closed_by` + `closed_at` |

---

## 3. Dual-Authority Forbidden Field Set

The following fields are **strictly forbidden** from appearing in both SQLite and markdown with independent writability. If any of these fields is found in markdown front matter after the migration cutover, it is a **boundary breach**.

```
FORBIDDEN_DUAL_AUTHORITY_FIELDS = {
  "status",
  "governed_by",
  "closed_at",
  "closed_by",
  "reopened_at",
  "reopened_by",
  "continuation_packet",
  "assignment_record_id",
}
```

**Severity levels:**
- **Critical breach:** `status` or `governed_by` found in markdown front matter. These are the highest-risk fields because they control lifecycle transitions and terminal provenance.
- **High breach:** `closed_at`, `closed_by`, `reopened_at`, `reopened_by` found in markdown front matter. These violate audit integrity.
- **Medium breach:** `continuation_packet` or `assignment_record_id` found in markdown front matter. These corrupt task continuity and assignment linking.

---

## 4. Projection-Only Overlap Rules

Some fields may appear in **both** SQLite and markdown, but only as **read-only projections** in one of the two stores. These are not dual-authority because only one store is writable.

### 4.1 Markdown May Display SQLite Fields (Read-Only)

If the markdown survival model is **Model B (compiled merged view)**, the projection layer may regenerate markdown front matter from SQLite. In this case:

- Markdown front matter is **generated**, not authored.
- A `GENERATED_BY_PROJECTION` marker must appear in the front matter.
- Humans and agents must not edit the generated fields.
- The projection layer must strip generated fields before parsing.

**Recommended posture:** Use **Model A (authored spec only)** and avoid this overlap entirely. Model B is permitted only with the `GENERATED_BY_PROJECTION` guard.

### 4.2 SQLite May Reference Markdown Fields (Read-Only)

SQLite may store foreign keys or indexes that reference markdown-derived identifiers:

- `task_lifecycle.task_id` matches the markdown filename stem.
- `task_lifecycle.task_number` matches the numeric prefix in the filename.

These are **references**, not copies. The SQLite value must not diverge from the markdown filename. If a task file is renamed, the SQLite reference must be updated in the same transaction.

---

## 5. Enforcement Rules

### 5.1 Lint Rules (Prevention)

The task lint tool (`narada task lint`) must enforce the following rules:

| Rule ID | Check | Severity | Action |
|---------|-------|----------|--------|
| `LINT-DUAL-001` | Markdown front matter contains any `FORBIDDEN_DUAL_AUTHORITY_FIELDS` | Error | Fail lint; report breach |
| `LINT-DUAL-002` | Markdown front matter contains `status` with a value that differs from SQLite `task_lifecycle.status` | Error | Fail lint; report drift |
| `LINT-DUAL-003` | Markdown front matter contains `governed_by` with a value that differs from SQLite `task_lifecycle.governed_by` | Error | Fail lint; report drift |
| `LINT-DUAL-004` | SQLite `task_lifecycle` row exists but no matching markdown file | Warning | Report orphan lifecycle row |
| `LINT-DUAL-005` | Markdown task file exists but no SQLite `task_lifecycle` row | Warning | Report unregistered task |
| `LINT-DUAL-006` | Projection layer (Model B) missing `GENERATED_BY_PROJECTION` marker | Warning | Report unsafe merged view |

**Lint frequency:** Run `LINT-DUAL-001` through `LINT-DUAL-003` on every `task-*` operator invocation. Run all rules in CI on every commit.

### 5.2 Operator Guards (Prevention)

All task lifecycle operators must enforce the following guards:

| Guard | Enforcement |
|-------|-------------|
| `GUARD-WRITE-001` | `task-claim`, `task-release`, `task-report`, `task-review`, `task-close`, `task-reopen`, `task-continue` must write to SQLite only. They must not open or rewrite the markdown file for lifecycle state. |
| `GUARD-WRITE-002` | `task-report` may scaffold `## Execution Notes` and `## Verification` in markdown body, but must not write `status`, `governed_by`, or terminal provenance to front matter. |
| `GUARD-WRITE-003` | `chapter-init` may write markdown front matter for `task_id`, `depends_on`, `continuation_affinity`, `created`, but must not write lifecycle fields. |
| `GUARD-WRITE-004` | No operator may write to both SQLite and markdown for the same field in the same transaction. |

### 5.3 Projection Layer Rules (Prevention)

| Rule | Enforcement |
|------|-------------|
| `PROJ-001` | The projection layer is **read-only**. It may not write to SQLite or markdown. |
| `PROJ-002` | If Model B is used, the projection regeneration must overwrite the entire front matter block, not merge individual fields. |
| `PROJ-003` | The projection layer must strip `GENERATED_BY_PROJECTION` fields before displaying markdown for editing. |
| `PROJ-004` | Projection cache (if any) must be keyed by `(task_id, sqlite_version, markdown_mtime)`. Stale cache must be invalidated. |

### 5.4 Schema Change Gate (Prevention)

| Gate | Enforcement |
|------|-------------|
| `SCHEMA-001` | Adding a new field to `task_lifecycle` schema requires an explicit authority decision: SQLite-only, markdown-only, or projection-only. |
| `SCHEMA-002` | Adding a new field to markdown front matter requires updating `FORBIDDEN_DUAL_AUTHORITY_FIELDS` if the field is lifecycle-related. |
| `SCHEMA-003` | Schema changes must be accompanied by lint rule updates before deployment. |

---

## 6. Human-Readable Markdown Posture

Markdown remains the primary **human-readable task specification**. The enforcement contract ensures it stays useful without reintroducing lifecycle authority:

### 6.1 What Humans See

- **Task body:** Goal, required work, acceptance criteria, execution notes, verification — all authored in markdown, unchanged.
- **Task title:** H1 in body, unchanged.
- **Status display:** If using Model A, status is shown in the workbench or CLI output (`narada task list`), not in the markdown file. If using Model B, status appears in front matter with a `GENERATED_BY_PROJECTION` marker.

### 6.2 What Humans May Edit

- Body text, including `## Execution Notes` and `## Verification` (after agent scaffolding).
- `depends_on` in front matter (with operator re-validation).
- `continuation_affinity` in front matter (advisory signal).

### 6.3 What Humans Must Not Edit

- `status`, `governed_by`, `closed_at`, `closed_by`, `reopened_at`, `reopened_by` — these are governed transitions and must use CLI operators.

### 6.4 Migration Compromise for Existing Tasks

Existing closed tasks may retain lifecycle fields in markdown front matter as **historical artifacts**. They are not breaches because:
- The task is terminal; no further transitions are possible.
- The SQLite row (if backfilled) matches the markdown value.
- The lint tool reports them as `INFO` rather than `ERROR`.

**Exception:** If an existing closed task is reopened, its markdown front matter lifecycle fields must be removed and authority transferred to SQLite.

---

## 7. Detection and Remediation

### 7.1 Automated Detection

| Mechanism | Coverage |
|-----------|----------|
| `narada task lint` | Every commit; every operator invocation |
| CI gate (`scripts/control-plane-lint.ts`) | Pull-request blocking |
| Projection layer drift check | On-demand or scheduled |

### 7.2 Remediation Path

When a breach is detected:

1. **Identify the authoritative source:** SQLite is authoritative for lifecycle fields.
2. **Remove markdown duplication:** Strip the field from markdown front matter.
3. **Verify SQLite integrity:** Ensure the SQLite row has the correct value.
4. **Record repair:** Log a `task_lifecycle_audit` row with `repair_type: 'dual_authority_removed'`.
5. **Alert operator:** If the breach was caused by direct file edit, notify the operator that governed operators must be used.

---

## 8. Invariants

1. **No field may be writable in both SQLite and markdown.** A field is authoritative in exactly one store.
2. **Lint must fail on critical breaches.** `LINT-DUAL-001` and `LINT-DUAL-002` are error-level rules; they block CI and operator invocation.
3. **Operators must not read markdown for lifecycle state.** After migration cutover, `status` and provenance are read from SQLite only.
4. **Projection must not write back.** The merged view is read-only; no write-back to either source.
5. **Schema changes require authority review.** New fields must be classified before deployment.

---

## 9. Non-Goals

1. **No real-time filesystem watchers.** The enforcement relies on lint gates and operator guards, not on blocking filesystem events.
2. **No encryption or signing of markdown.** The enforcement is structural (field presence rules), not cryptographic.
3. **No automatic repair of breaches.** Detection is automatic; remediation requires operator or agent action to preserve audit intent.
4. **No migration of body text to SQLite.** Execution notes, verification, and criteria remain in markdown.
5. **No prohibition on markdown regeneration.** Model B (compiled merged view) is permitted with the `GENERATED_BY_PROJECTION` guard.

---

## 10. Verification Evidence

- `pnpm verify` — all 5 steps pass ✅
- `pnpm typecheck` — all 11 packages clean ✅
- Decision 546 field ownership split is the authoritative reference ✅
- All 8 forbidden fields explicitly named ✅
- 6 lint rules, 4 operator guards, 4 projection rules, 3 schema gates defined ✅
- No code changes required for this contract task ✅

---

## Closure Statement

The no-duplication enforcement contract closes with a strict rule set: eight lifecycle fields are forbidden from markdown front matter; lint rules detect breaches at CI and operator time; operator guards prevent writes to both stores; projection rules enforce read-only merged views; and schema changes require explicit authority classification. Markdown remains human-readable and editable for specification content, but lifecycle authority is irrevocably SQLite-bound after the migration cutover.

---

**Closed by:** codex  
**Closed at:** 2026-04-24
