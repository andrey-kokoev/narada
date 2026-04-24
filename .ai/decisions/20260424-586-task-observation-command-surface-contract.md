# Decision 586 — Task Observation Command Surface Contract

> **Status:** Closed  
> **Task:** 586  
> **Governed by:** task_close:a2  
> **Depends on:** 585  
> **Chapter:** Command-Mediated Task Authority (585–589)

---

## Goal

Define the sanctioned command surface for all task reading and inspection so that direct markdown or SQLite reading is no longer the normal way tasks are observed.

---

## Principle

**Observation is a derived, read-only operation over authoritative stores. It is not permission to inspect substrates directly.**

All task observation must route through sanctioned CLI commands that merge SQLite lifecycle state with markdown specification into a coherent projection. Direct file reading, direct SQL queries, and filesystem browsing are classified as non-normal activities.

---

## Observation Command Families

### Family 1: Task Listing

| Command | Purpose | Selectors |
|---------|---------|-----------|
| `narada task list` | List runnable tasks sorted by continuation affinity | Implicit: status = opened/claimed/needs_continuation |
| `narada task evidence list` | List tasks classified by completion evidence | `--verdict`, `--status`, `--range` |
| `narada task recommend` | Recommend task/agent assignments (advisory) | `--agent`, `--task`, `--limit` |

**Authority class:** `derive` (read-only, no side effects)

**Return posture:**
- Human: formatted table with status, title, affinity, score/rationale
- JSON: structured arrays with full metadata
- Never returns raw markdown text or raw SQL rows

### Family 2: Single-Task Inspection

| Command | Purpose | Selectors |
|---------|---------|-----------|
| `narada task evidence inspect <task-number>` | Inspect completion evidence for one task | Identity (task number) |

**Authority class:** `derive` (read-only)

**Return posture:**
- Human: structured text with status, verdict, criteria check, evidence flags, violations, warnings
- JSON: full `TaskCompletionEvidence` object
- Never returns raw markdown front matter or raw SQLite row

**Gap acknowledged:** There is no unified "show task" command that merges full spec + lifecycle + assignment + evidence into a single view. The current surface requires using `task evidence inspect` for evidence and implicitly reading the task file for spec. A unified `task show <number>` command is a future enhancement.

### Family 3: Graph and Dependency Inspection

| Command | Purpose | Selectors |
|---------|---------|-----------|
| `narada task graph` | Render task dependency graph | `--range`, `--status`, `--include-closed` |

**Authority class:** `derive` (read-only)

**Return posture:**
- Human: Mermaid flowchart
- JSON: `{ nodes, edges }` graph structure
- Never returns raw `depends_on` arrays or filesystem listings

### Family 4: Structural Validation

| Command | Purpose | Selectors |
|---------|---------|-----------|
| `narada task lint` | Lint task files for structural issues | `--chapter <range>` |

**Authority class:** `derive` (pure tool/compiler, no mutations)

**Return posture:**
- Human: issue count + typed issue list
- JSON: `{ status, issues[] }`
- This command reads markdown directly because it is a **violation detector**, not a correctness dependency. It is the exception that proves the rule: its purpose is to find problems in the substrate itself.

### Family 5: Chapter State Inspection

| Command | Purpose | Selectors |
|---------|---------|-----------|
| `narada chapter status <range>` | Derive chapter state from task statuses | Identity (numeric range) |

**Authority class:** `derive` (read-only)

**Return posture:**
- Human: chapter state label + task counts + blocker list
- JSON: structured chapter summary

### Family 6: Agent Roster Observation

| Command | Purpose | Selectors |
|---------|---------|-----------|
| `narada task roster show` | Show current agent operational state | `--verbose` (includes learning guidance) |

**Authority class:** `derive` (read-only)

**Return posture:**
- Human: formatted roster table
- JSON: full roster object + guidance

### Family 7: Dispatch Observation

| Command | Purpose | Selectors |
|---------|---------|-----------|
| `narada task dispatch status` | Show dispatch queue and packet state | `--task-number`, `--agent` |

**Authority class:** `derive` (read-only)

**Return posture:**
- Human/JSON: packet state, lease expiration, heartbeat

---

## Canonical Selectors

All observation commands accept selectors from the following canonical dimensions:

| Selector | Type | Example | Commands |
|----------|------|---------|----------|
| **Identity** | Task number or ID | `585`, `20260424-585-...` | `evidence inspect`, `graph` (via range), `dispatch` |
| **Status / Lifecycle** | Comma-separated statuses | `--status opened,claimed` | `evidence list`, `graph` |
| **Chapter / Range** | Numeric range | `--range 585-589`, `--chapter 585-589` | `lint`, `graph`, `evidence list`, `chapter status` |
| **Dependency / Blocker** | Implicit via graph | N/A | `graph` renders dependency edges |
| **Assignment / Principal** | Agent ID | `--agent a2` | `recommend`, `dispatch` |
| **Evidence / Completeness** | Verdict class | `--verdict incomplete,needs_review` | `evidence list` |

Selectors may be combined where the command supports it. Unspecified selectors mean "all" (within the command's natural scope).

---

## Observation Return Posture

### What observation commands MUST return

1. **Projection only** — merged views of SQLite + markdown, not raw substrate
2. **Both human and machine surfaces** — every command supports `--format json` and human output
3. **Artifact references** — when evidence includes files (reports, reviews, decisions), return paths or IDs, not file contents
4. **Authority class annotation** — the command's authority class is documented (all observation commands are `derive`)

### What observation commands MUST NOT return

1. **Raw markdown front matter** — never return the unprocessed YAML block
2. **Raw SQLite rows** — never return table rows directly
3. **File contents** — never dump report JSON or review text inline; reference by ID/path
4. **Substrate paths as primary identifiers** — always use task number or task_id, not filesystem paths

### Exception: Debug/Maintenance Raw Dumps

If a raw substrate dump is needed for debugging, it must be:
- Behind a `--debug` or `--raw` flag
- Clearly labeled as non-canonical
- Restricted to `admin` authority class where possible
- Not used in scripts or automation

No existing observation command provides raw dumps. This is contingency policy only.

---

## Direct-Reading Prohibitions

In the target regime, the following habits are **prohibited as normal task work**:

| Prohibited Habit | Why Prohibited | Sanctioned Replacement |
|------------------|----------------|----------------------|
| Opening `.ai/tasks/NNN.md` to check task status | Bypasses SQLite authority; may see stale front matter | `narada task evidence inspect NNN` |
| Running `sqlite3 .ai/tasks/task-lifecycle.db "SELECT * FROM task_lifecycle"` to list tasks | Bypasses projection layer; returns raw rows | `narada task list` or `narada task evidence list` |
| Using `find .ai/tasks -name '*.md'` or `ls .ai/tasks/` to see what tasks exist | Filesystem search is not queryable, filterable, or authoritative | `narada task list` or `narada task evidence list --status ...` |
| Reading `.ai/tasks/assignments/*.json` directly to check who claimed what | Bypasses SQLite assignment table | `narada task dispatch status` or `narada task roster show` |
| Grepping markdown files for `status: closed` to count closed tasks | Fragile, may miss SQLite-only records, may find stale front matter | `narada task evidence list --status closed` |
| Opening `.ai/reviews/*.json` to read review findings | Bypasses SQLite review table | Future: `narada task review show <review-id>` |

**These prohibitions apply to normal work.** They do not apply to:
- Debugging a command failure (temporarily, to understand the failure)
- Writing new observation commands (the implementer must read substrates to build the projection)
- Disaster recovery (when SQLite is corrupt and projection is unavailable)
- The `task lint` command itself (which exists to detect substrate violations)

---

## Bounded Exceptions

| Exception | Classification | Conditions |
|-----------|---------------|------------|
| **Debugging command failures** | Temporary, agent-local | Only when a sanctioned command returns an unexpected result; must be followed by either fixing the command or reporting the bug |
| **Sanctioned low-level maintenance** | `admin` authority | Schema migrations, corruption repair, backfill operations |
| **Implementing new observation commands** | Development-time only | The implementer reads substrates to build the projection; end users never do |
| **`task lint`** | Violation detector | Reads markdown directly to find governance violations; this is its explicit purpose |
| **Migration phases** | Time-bounded | During active migration from markdown to SQLite, dual-reading is tolerated with clear deprecation dates |

---

## Verification and Bounded Blockers

### What is already true

- [x] `narada task list` — SQLite-backed projection with markdown fallback ✅
- [x] `narada task evidence inspect` — projection-backed evidence inspection ✅
- [x] `narada task evidence list` — filterable by verdict, status, range ✅
- [x] `narada task graph` — Mermaid/JSON dependency graph with selectors ✅
- [x] `narada task lint` — structural validation with chapter range selector ✅
- [x] `narada task recommend` — advisory assignment recommendations ✅
- [x] `narada task roster show` — agent operational state ✅
- [x] `narada chapter status` — chapter state derivation ✅
- [x] `narada task dispatch status` — dispatch packet observation ✅
- [x] All observation commands support `--format json` ✅
- [x] `pnpm typecheck` — all 11 packages clean ✅

### Bounded blockers (gaps in observation surface)

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No unified `task show <number>` command | Users must combine `evidence inspect` + implicit file reading for full task view | Use `evidence inspect` for lifecycle; spec is read-only in markdown anyway |
| No `task review show <review-id>` command | Review findings are only accessible via JSON file or SQLite directly | Review data is small; `evidence inspect` shows `has_review` flag |
| No `task report show <report-id>` command | Report details only accessible via JSON file or SQLite directly | `evidence inspect` shows `has_report` flag |
| No `task assignment history <number>` command | Assignment history only in SQLite or JSON files | SQLite table `task_assignments` is queryable for maintenance |
| `task lint` still reads markdown directly | It is a violation detector, not a normal observation command | Acceptable by explicit exception classification |

---

## Closure Statement

Task 586 closes with a defined observation surface consisting of **seven command families** (listing, single-task inspection, graph/dependency, structural validation, chapter state, roster observation, dispatch observation) all operating as `derive`-class read-only projections over SQLite + markdown. Direct substrate reading is explicitly prohibited for normal work, with five bounded exceptions documented. The residual gaps (no unified `task show`, no `review show`, no `report show`) are acknowledged as bounded blockers that do not prevent the regime from functioning.

---

## Next Executable Line

**Task 587 — Task Mutation Command Surface Contract:** Define sanctioned task creation, amendment, transition, and closure operators so direct editing is no longer part of task work.

**Closed by:** a2  
**Closed at:** 2026-04-24
