# Decision 588 — Direct-Access Prohibition And Sanctioned-Substrate Contract

> **Status:** Closed  
> **Task:** 588  
> **Governed by:** task_close:a2  
> **Depends on:** 585, 586, 587  
> **Chapter:** Command-Mediated Task Authority (585–589)

---

## Goal

Define the prohibition regime that removes direct markdown and SQLite access from normal task operations, while making explicit the few cases where low-level access may still be sanctioned.

---

## The Four Prohibitions — Precise Definitions

### 1. Direct Task Editing

**Prohibited:** Any mutation to a task's lifecycle fields, specification fields, or body content by opening a task file in an editor and saving changes, where the mutation bypasses a sanctioned command.

**Specifically prohibited:**
- Changing `status`, `governed_by`, `closed_at`, `closed_by`, `reopened_at` in front matter
- Checking/unchecking acceptance criteria boxes
- Adding or modifying execution notes or verification sections
- Editing the goal, required work, or title
- Modifying `depends_on` or `continuation_affinity`

**Not prohibited (incidental contact):**
- Reading a task file to understand narrative context (though `narada task read` is preferred)
- Grepping task files during development of new observation commands
- Automated projection regeneration (command-mediated, not hand-editing)

### 2. Direct Task Reading

**Prohibited:** Using filesystem access as a substitute for sanctioned observation commands to determine task state, status, assignment, or evidence.

**Specifically prohibited:**
- `cat .ai/do-not-open/tasks/NNN.md` to check task status — use `narada task read <n>` instead
- `ls .ai/do-not-open/tasks/` to enumerate tasks — use `narada task list` instead
- `grep 'status: claimed' .ai/do-not-open/tasks/*.md` to find claimed tasks — use `narada task list` instead
- `sqlite3 .ai/do-not-open/tasks/task-lifecycle.db "SELECT ..."` to query lifecycle state — use `narada task read` or `narada task evidence` instead
- Reading `.ai/do-not-open/tasks/tasks/assignments/*.json` directly to check who claimed what — use `narada task read` instead

**Not prohibited:**
- Using observation commands (`narada task read`, `narada task list`, `narada task evidence`, `narada task graph`, etc.)
- Reading markdown for narrative context when observation commands are insufficient
- Automated tools that read substrates to build projections (implementing new commands)

### 3. Direct Task Creation

**Prohibited:** Creating a new task file by hand-writing markdown, copying an existing file, or using a text editor/template tool outside the sanctioned command surface.

**Specifically prohibited:**
- `touch .ai/do-not-open/tasks/20260424-999-my-task.md`
- Copying an existing task file and editing it
- Using an IDE template or snippet to create task files
- Any creation path that bypasses the task number allocator

**Not prohibited:**
- `narada task allocate` (reserves number)
- `narada chapter init` (creates chapter skeleton)
- `narada task derive-from-finding` (creates corrective task)
- Future: `narada task create` (standalone task creation)

### 4. Direct SQLite Access for Task Operations

**Prohibited:** Using raw SQL, database browsers, or programmatic SQLite access to mutate or query task lifecycle state as a substitute for sanctioned commands.

**Specifically prohibited:**
- `sqlite3 .ai/do-not-open/tasks/task-lifecycle.db "UPDATE task_lifecycle SET status = 'closed' WHERE task_number = 585"`
- `UPDATE task_assignments SET released_at = '...' WHERE ...`
- Direct INSERT into `task_reports`, `task_reviews`, or `task_lifecycle`
- Using a GUI database tool to edit task tables

**Not prohibited:**
- Schema migration scripts (controlled upgrade)
- Backup and restore operations
- Sanctioned commands using SQLite internally (this is normal operation)

---

## The Substrate Rule

> **Markdown and SQLite are implementation substrates, not direct working surfaces, and not direct authorities for operator/agent task interaction.**

### What this means

| Substrate | Role | Not Role |
|-----------|------|----------|
| **Markdown** | Human-readable spec container; projection target | Working surface for lifecycle edits; authoritative status source |
| **SQLite** | Durable lifecycle substrate; query engine behind commands | Direct working surface for operators; source of truth for ad-hoc queries |
| **JSON artifacts** (assignments, reports, reviews, promotions) | Derived durable records created by commands | Hand-editable files; direct working surface |

### The substrate hierarchy

```
┌─────────────────────────────────────────┐
│  Sanctioned CLI Commands (working surface) │
├─────────────────────────────────────────┤
│  Projection Layer (read-only merge)      │
├─────────────────────────────────────────┤
│  Markdown (spec substrate)               │
│  SQLite (lifecycle substrate)            │
│  JSON artifacts (derived records)        │
└─────────────────────────────────────────┘
```

Normal work happens at the command layer. The projection layer serves observation. Substrates exist only to persist and display.

---

## Sanctioned Command Definition

A **sanctioned command** for task operations is a command registered under the `narada task` or `narada chapter` namespaces that:

1. Validates preconditions before mutation
2. Enforces state machine transitions
3. Writes to SQLite atomically where applicable
4. Leaves an audit record (timestamp, actor, action)
5. Updates the projection layer
6. Is listed in the CLI help (`narada task --help`, `narada chapter --help`)

Commands that are **not** sanctioned for task operations:
- Shell scripts that edit task files directly
- `sed` / `awk` / `perl` one-liners that mutate front matter
- Custom scripts that INSERT/UPDATE SQLite directly
- Git operations that modify task files as a side effect (e.g., merge conflict resolution must be followed by command-mediated reconciliation)

---

## Bounded Exception Classes

### Exception Class 1: Migration / Bootstrap

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Transitioning from old regime to new; initial setup |
| **Standing** | Operator with `admin` authority |
| **Read or mutate?** | Both |
| **Authority class** | `admin` |
| **Audit trail** | Migration log entry; timestamp; operator ID; actions taken |
| **Time-bounded?** | Yes — must have explicit end date or completion condition |
| **Examples** | Backfilling SQLite from markdown; initial chapter creation before `chapter init` existed |

### Exception Class 2: Low-Level Repair of Broken Command Surface

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Fixing corruption or command failures that prevent normal operation |
| **Standing** | Operator with `admin` authority |
| **Read or mutate?** | Both |
| **Authority class** | `admin` |
| **Audit trail** | Repair log entry; before/after state; operator ID; justification |
| **Time-bounded?** | Per-incident; repair must be followed by root-cause analysis |
| **Examples** | SQLite corruption requiring manual row fix; markdown front matter desync after crash |

### Exception Class 3: Forensic / Debug Access

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Understanding why a command failed or investigating anomalies |
| **Standing** | Any agent debugging their own work, or operator with `admin` for cross-agent issues |
| **Read or mutate?** | Read-only strongly preferred; mutation only if it fixes the bug |
| **Authority class** | `derive` (read) or `admin` (mutate) |
| **Audit trail** | Debug session notes; findings; any mutations must be logged |
| **Time-bounded?** | Per-session; temporary |
| **Examples** | Reading raw SQLite to understand why `task close` failed; inspecting markdown front matter to verify projection correctness |

### Exception Class 4: Export / Import

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Moving task data between repos, systems, or formats |
| **Standing** | Operator with `admin` authority |
| **Read or mutate?** | Both (read at source, mutate at target) |
| **Authority class** | `admin` |
| **Audit trail** | Export/import manifest; checksums; operator ID; timestamp |
| **Time-bounded?** | Per-operation |
| **Examples** | Exporting task history for archival; importing tasks from another Narada repo |

### Exception Class 5: Command Implementation / Development

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Building new sanctioned commands that read substrates to produce projections |
| **Standing** | Developer implementing new CLI commands |
| **Read or mutate?** | Read-only (new commands must not mutate substrates directly) |
| **Authority class** | N/A (development context) |
| **Audit trail** | Code review of the new command; tests |
| **Time-bounded?** | During development only |
| **Examples** | Implementing `task show` by reading SQLite + markdown to build a projection |

### Exception Class 6: Violation Detection (`task lint`)

| Attribute | Definition |
|-----------|-----------|
| **Purpose** | Detecting substrate violations (direct edits, stale state, structural issues) |
| **Standing** | Any agent may run `narada task lint` |
| **Read or mutate?** | Read-only |
| **Authority class** | `derive` |
| **Audit trail** | Lint output itself is the record |
| **Time-bounded?** | Ongoing |
| **Examples** | `narada task lint` detecting `terminal_without_governed_provenance` |

### Summary: Normal Standing for Direct Substrate Access

> **None.** In normal task work, no operator or agent has standing to read or mutate substrates directly. All six exception classes require either `admin` authority, development context, or explicit command-mediated paths (`task lint`).

---

## Target Enforcement Posture

### Layer 1: Lint (Detective)

`narada task lint` detects violations after they occur:
- `terminal_without_governed_provenance` — detects raw front-matter edits
- `terminal_with_unchecked_criteria` — detects incomplete closures
- `orphan_closure`, `orphan_review` — detects missing artifacts
- `stale_review_reference`, `stale_closure_reference` — detects broken references

**Posture:** Run automatically in CI or pre-commit hooks. Fail the build on violations.

### Layer 2: Operator Guards (Preventive)

Sanctioned commands validate preconditions before mutation:
- Roster membership check
- State machine transition validation
- Dependency satisfaction check
- Closure gate validation (criteria, notes, verification, no derivatives)
- Assignment consistency check

**Posture:** Commands reject invalid operations with clear error messages and remediation hints.

### Layer 3: Filesystem/Database Permission Posture (Technical)

**Target:** Substrate files should be read-only to normal agents and writable only by the sanctioned command process.

**Current reality:** Filesystem permissions are not enforced (all repo users can edit). This is a future hardening layer.

**Recommended future posture:**
- `.ai/do-not-open/tasks/task-lifecycle.db` owned by a dedicated service account
- Markdown files group-writable but lint-gated
- JSON artifacts (`assignments/`, `reports/`, `reviews/`, `promotions/`) owned by service account

**Status:** Not yet implemented. Documented as future work.

### Layer 4: Command-Only UX (Cultural)

The CLI help, documentation, and agent onboarding emphasize:
- "Use `narada task` commands for all task work"
- "Never edit task files directly"
- "Never query SQLite directly"
- Task creation workflow documented as `narada task allocate` → `narada task create` (future)

### Layer 5: Command Payload Restrictions

Sanctioned observation commands must not expose raw substrate payloads as their default output:
- `narada task read` returns a merged projection, never raw markdown front matter or SQLite rows
- `narada task evidence` returns evidence inspection, not raw file contents
- `narada task list` returns merged task views, not SQLite rows
- `narada task graph` returns Mermaid/JSON graph, not raw `depends_on` arrays

**Exception:** A `--debug` or `--raw` flag may expose substrate form for forensic use, but:
- The flag must be explicit
- The output must be labeled as non-canonical
- It should require `admin` authority where practical

---

## Out of Scope for First Implementation Line

| # | Item | Why Deferred |
|---|------|-------------|
| 1 | Filesystem permission enforcement | Requires OS-level or container-level changes; high coordination cost |
| 2 | SQLite service-account ownership | Requires runtime architecture changes (daemon mode, service user) |
| 3 | Automatic violation rollback | Detect-and-repair is complex; lint + manual repair is sufficient for now |
| 4 | Pre-commit hooks blocking direct edits | Requires git hook infrastructure; can be added later |
| 5 | `--debug` / `--raw` flag restriction to `admin` | Requires authority enforcement in CLI argument parsing |
| 6 | Audit log outside SQLite | Centralized audit is future work; SQLite timestamps + actor IDs are sufficient for now |

---

## Verification and Bounded Blockers

### What is already true

- [x] `narada task lint` detects `terminal_without_governed_provenance` and other violations ✅
- [x] Sanctioned commands enforce preconditions (roster, transitions, dependencies, gates) ✅
- [x] Decision 585 defines the command-mediated authority boundary ✅
- [x] Decision 586 defines the observation command surface ✅
- [x] Decision 587 defines the mutation command surface ✅
- [x] All four prohibitions are documented in this contract ✅
- [x] Six exception classes defined with standing, authority, and audit requirements ✅
- [x] `pnpm typecheck` — all 11 packages clean ✅

### Bounded blockers

| Blocker | Impact | Mitigation |
|---------|--------|------------|
| **No filesystem permission enforcement** | Any user with repo access can still edit files | Lint detection + cultural enforcement; technical enforcement deferred |
| **No pre-commit hooks** | Direct edits can be committed undetected | CI lint run catches them post-hoc |
| **No `--debug` flag restrictions** | Raw substrate dumps are theoretically possible | No command currently exposes raw dumps by default |
| **7 operators still mutate markdown front matter** | Commands themselves violate the substrate rule | Acknowledged in Decision 587; migration planned |
| **SQLite DB is user-writable** | Any process can open and mutate the DB | Same-repo trust model; future service-account ownership |

---

## Closure Statement

Task 588 closes with a precise prohibition regime defining four direct-access prohibitions (editing, reading, creation, SQLite access) and six bounded exception classes (migration, repair, forensic/debug, export/import, command development, violation detection). The substrate rule is explicit: markdown and SQLite are implementation substrates, not working surfaces or authorities. Normal standing for direct substrate access is **none**. Target enforcement spans five layers (lint, operator guards, filesystem permissions, command-only UX, payload restrictions), with three layers already active and two deferred to future hardening. Residual blockers (no filesystem permission enforcement, no pre-commit hooks, operators still mutating markdown) are honestly acknowledged with mitigations.

---

## Next Executable Line

**Task 589 — Command-Mediated Task Authority Closure:** Close the 585–589 chapter honestly, consolidate the four contracts into a coherent regime statement, and name the first implementation line.

**Closed by:** a2  
**Closed at:** 2026-04-24
