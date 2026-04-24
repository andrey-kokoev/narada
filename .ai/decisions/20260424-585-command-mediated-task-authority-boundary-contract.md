# Decision 585 — Command-Mediated Task Authority Boundary Contract

> **Status:** Closed  
> **Task:** 585  
> **Governed by:** task_close:a2  
> **Depends on:** 546, 547, 548, 549, 550, 570, 580  
> **Chapter:** Command-Mediated Task Authority (585–589)

---

## Goal

Define the canonical task-authority boundary for Narada once direct task-file and direct SQLite interaction are removed from normal work.

---

## The Irreducible Object

A **Narada Task** is a durable, governed work object whose entire interaction surface — creation, mutation, observation, and closure — is mediated exclusively through sanctioned Narada CLI commands. It is **not** a markdown file, **not** a SQLite row, and **not** any other substrate artifact. Those substrates exist only to persist and display the task; they are not the task itself.

In the command-mediated regime:

| What the task IS | What the task is NOT |
|------------------|----------------------|
| A governed work object with a canonical command surface | A markdown file that happens to have front matter |
| An entity whose lifecycle transitions are auditable and actor-attributed | A SQLite row that can be UPDATE'd by any tool with DB access |
| A specification whose authoritative form is reached through sanctioned operators | A text file that agents may edit directly |

---

## Authoritative Loci

### 1. Task Specification Authority

- **Owner:** Markdown (`.ai/tasks/NNN-slug.md`)
- **Content:** Goal, required work, acceptance criteria, execution notes, verification, dependencies, continuation affinity
- **Access rule:** Read via projection; written once at creation; body sections appended by sanctioned report operators
- **Posture:** **Authored spec only** (Model A from Decision 546). Markdown is the human-readable container for specification intent. It is not a working surface for lifecycle edits.

### 2. Task Lifecycle Authority

- **Owner:** SQLite (`task_lifecycle`, `task_assignments`, `task_reports`, `task_reviews`, `dispatch_packets` tables)
- **Content:** Status, governed_by, closed_at, closed_by, reopened_at, assignment history, dispatch state
- **Access rule:** Written exclusively by sanctioned command operators (`task-claim`, `task-release`, `task-report`, `task-review`, `task-close`, `task-reopen`, `task-continue`, `task-dispatch`)
- **Posture:** SQLite is the **substrate behind sanctioned operators**. Direct SQL access for task operations is classified as non-normal maintenance.

### 3. Task Observation Authority

- **Owner:** Projection layer (SQLite + Markdown merged read view)
- **Content:** Task list, status filters, evidence panels, dependency checks, audit trails
- **Access rule:** Read-only. Produced by sanctioned inspection commands (`task-list`, `task-evidence`, `task-graph`, `task-lint`)
- **Posture:** Derived and non-authoritative. Removing every observation view must leave all durable boundaries intact.

### 4. Task Creation Authority

- **Owner:** `narada task allocate` (and future chapter-init commands)
- **Content:** Assigns task number, creates markdown spec scaffold, initializes SQLite lifecycle row
- **Access rule:** Only the allocator command may create new task entries
- **Posture:** Creation is a governed operator, not freeform file authoring.

### 5. Task Closure Authority

- **Owner:** Governed terminal operators (`task-close`, `task-review`, `chapter-close`)
- **Content:** Status transition to terminal state, provenance marker (`governed_by`), closure timestamp
- **Access rule:** Only operators with `resolve` or `admin` authority class may transition tasks to terminal states
- **Posture:** Closure is the most authority-sensitive transition. Raw file edits that set `status: closed` without governed provenance are violations.

---

## Forced Structure vs. Contingent Policy

### Forced (must be command-mediated by necessity)

| Structure | Why forced |
|-----------|-----------|
| Lifecycle state transitions | Require atomicity, audit trail, and actor attribution that filesystem editing cannot guarantee |
| Assignment claims/releases | Require race-safe concurrency control (roster lock + SQLite transaction) |
| Closure to terminal status | Requires `resolve` authority class enforcement; raw edits bypass governance |
| Task number allocation | Requires atomic reservation to prevent duplicate numbers |
| Dispatch packet creation | Requires lease semantics, heartbeat, and expiration that markdown cannot express |

### Contingent (current implementation choice, not mathematically required)

| Policy | Why contingent |
|--------|---------------|
| Markdown as spec container | Could theoretically be a different format (JSON, TOML), but markdown is human-legible |
| SQLite as lifecycle substrate | Could theoretically be another durable store (PostgreSQL, KV store), but SQLite is local-first |
| 19 specific CLI commands | The command family may be refactored, merged, or renamed; the boundary matters more than the exact surface |
| `.ai/tasks/` directory path | A convention, not a law |

### Projected (may remain for human legibility)

| Projection | Source |
|------------|--------|
| Markdown front matter showing status | SQLite `status` projected into markdown at build time |
| Task list with colored status | SQLite + markdown merged on read |
| Dependency graph visualization | Markdown `depends_on` + SQLite status merged |

---

## Markdown Posture

**Markdown is an authored spec container and a projected read view. It is not a working surface for normal task operations.**

Specifically:

- Markdown files **may** be read by humans directly for narrative context
- Markdown files **must not** be edited to change `status`, `governed_by`, `closed_at`, or `closed_by`
- Markdown front matter **may** be regenerated by a projection layer to reflect current SQLite state
- Markdown body sections (execution notes, verification) **may** be appended by sanctioned report operators
- Markdown creation **must** go through `task allocate`, not manual file authoring

If an agent or human edits a task markdown file directly to mutate lifecycle fields, that edit is **outside the sanctioned regime** and will be flagged as a `terminal_without_governed_provenance` violation by `narada task lint`.

---

## SQLite Posture

**SQLite is the durable lifecycle substrate behind sanctioned operators. It is not part of the normal human/agent working surface.**

Specifically:

- SQLite **must** be the source of truth for all lifecycle queries
- SQLite **must** be written only by sanctioned command operators
- Direct SQLite access (e.g., `sqlite3 .ai/tasks/task-lifecycle.db` then `UPDATE task_lifecycle SET status = 'closed'...`) is classified as **non-normal maintenance/repair**, not ordinary task work
- The only legitimate exceptions for direct SQLite access:
  - Disaster recovery (coordinator loss, corruption)
  - Schema migration during controlled upgrades
  - Debugging by operators with `admin` authority class
  - All exceptions must leave an explicit `governed_by` or audit trail when they mutate state

---

## The Key Invariant

> **Task interaction authority belongs to sanctioned command operators, not to substrates.**

No durable task mutation may be performed by editing a markdown file, running raw SQL, or mutating JSON artifacts directly. Every task mutation must route through a sanctioned CLI command that:
1. Validates authority (agent identity, assignment state, role permissions)
2. Enforces state machine transitions
3. Writes to SQLite atomically
4. Updates the projection layer
5. Leaves an audit record

---

## The Main Collapse Prevented

### Substrate Bypass

Without this boundary, the following collapse is possible:

1. An agent edits `.ai/tasks/260.md` front matter to set `status: closed`
2. The SQLite `task_lifecycle` table still shows `status: claimed`
3. The projection layer shows conflicting states depending on which source it queries
4. Governance is meaningless because any filesystem edit bypasses `governed_by`, `closed_by`, and audit trails
5. The lint tool detects the violation after the fact but cannot prevent it
6. The system reverts to "whatever is in the markdown file" as the practical source of truth

This boundary prevents that collapse by making the command surface the **exclusive** mutation path and treating direct substrate edits as violations (or explicitly classified maintenance).

---

## Command Surface Summary (Current State)

The following sanctioned commands form the task interaction surface:

| Family | Commands |
|--------|----------|
| **Observation** | `task list`, `task evidence`, `task evidence-list`, `task graph`, `task lint`, `task recommend`, `task roster` |
| **Mutation** | `task allocate`, `task claim`, `task release`, `task report`, `task review`, `task close`, `task reopen`, `task continue`, `task finish`, `task derive-from-finding`, `task promote-recommendation` |
| **Dispatch** | `task dispatch` |

These commands are the **only** normal working surface for tasks. Everything else (reading markdown, querying SQLite, editing files) is either:
- A read-only projection (observation family)
- A non-normal maintenance action (repair, recovery, debugging)
- A violation (direct mutation)

---

## Verification and Bounded Blockers

### What is already true

- [x] Decision 546 defines the SQLite/markdown authority split ✅
- [x] SQLite schema exists (`task_lifecycle`, `task_assignments`, `task_reports`, `task_reviews`, `dispatch_packets`) ✅
- [x] Projection-backed read surfaces exist (`task list`) ✅
- [x] `narada task lint` detects `terminal_without_governed_provenance` violations ✅
- [x] 19 CLI commands provide a comprehensive command surface ✅
- [x] `pnpm typecheck` — all 11 packages clean ✅

### Bounded blockers (residual direct access)

The following operators **still mutate markdown front matter** directly. They are bounded blockers to full command-mediated authority:

| Operator | Markdown Mutation | SQLite Adoption | Status |
|----------|-------------------|-----------------|--------|
| `task-claim` | Sets `status: claimed` | Partial (writes assignment JSON) | Needs full SQLite migration |
| `task-release` | Sets `status: opened/needs_continuation` | Partial | Needs full SQLite migration |
| `task-report` | Sets `status: in_review` | Partial | Needs full SQLite migration |
| `task-review` | Sets `status: closed`, `governed_by`, `closed_at` | Partial | Needs full SQLite migration |
| `task-close` | Sets `status: closed`, `governed_by`, `closed_at` | Partial | Needs full SQLite migration |
| `task-reopen` | Sets `status: opened`, deletes `governed_by` | Partial | Needs full SQLite migration |
| `task-continue` | Sets `status: claimed` | Partial | Needs full SQLite migration |

**Mitigation:** The `terminal_without_governed_provenance` lint rule detects raw edits. The SQLite store is authoritative when both sources exist. Full migration of all 7 operators is the subject of Tasks 586–588.

### Non-normal maintenance exceptions (explicitly classified)

| Exception | Classification | Required Authority |
|-----------|---------------|-------------------|
| Direct SQLite `UPDATE` for recovery | Maintenance/repair | `admin` |
| Manual markdown edit to fix corruption | Maintenance/repair | `admin` |
| Schema migration | Controlled upgrade | `admin` |
| `narada task lint` violation repair | Violation remediation | `admin` or operator |

---

## Closure Statement

Task 585 closes with an unambiguous definition: **A Narada Task is a governed work object whose sole normal interaction surface is sanctioned CLI commands.** Markdown is the authored spec container. SQLite is the lifecycle substrate. Neither is a working surface for normal task operations. Direct substrate mutation is classified as non-normal maintenance or a violation. The residual bounded blockers (7 operators still mutating markdown front matter) are acknowledged and assigned to Tasks 586–588 for remediation.

---

## Next Executable Line

**Task 586 — Task Observation Command Surface Contract:** Define which commands constitute the sanctioned observation surface and eliminate direct file/DB reading from normal task work.

**Closed by:** a2  
**Closed at:** 2026-04-24
