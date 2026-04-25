# Decision 587 — Task Mutation Command Surface Contract

> **Status:** Closed  
> **Task:** 587  
> **Governed by:** task_close:a2  
> **Depends on:** 585  
> **Chapter:** Command-Mediated Task Authority (585–589)

---

## Goal

Define the sanctioned one-command task mutation surface so task creation, amendment, transition, and closure no longer rely on direct file editing or direct database mutation.

---

## Principle

**One sanctioned command completes one governed operator action. Normal task work must not require opening, editing, or creating files directly.**

If a workflow still requires file choreography (e.g., allocate a number, then hand-write a file, then edit front matter, then run a command), it is not yet migrated to the command-mediated regime.

---

## Mutation Command Families

### Family 1: Creation

| Command | Purpose | Preconditions | Authority |
|---------|---------|---------------|-----------|
| `narada task allocate` | Atomically reserve next task number | None (atomic allocator) | `claim` (any agent may request a number) |
| `narada chapter init <slug>` | Create chapter skeleton (range file + N child task files) | `--title`, `--from`, `--count`; no number collisions | `claim` |
| `narada task derive-from-finding <finding-id>` | Create corrective task from review finding | `--review <review-id>`; finding must exist | `claim` |

**Creation boundary:** These commands create the durable task object. After creation, the task exists in both markdown (spec) and SQLite (lifecycle). No hand-written task files.

### Family 2: Assignment and Continuation

| Command | Purpose | Preconditions | Authority |
|---------|---------|---------------|-----------|
| `narada task claim <number>` | Claim an opened/needs_continuation task | Agent in roster; task status = opened/needs_continuation; dependencies satisfied | `claim` |
| `narada task continue <number>` | Continue or take over a claimed task | Agent in roster; task has active assignment; `--reason` required | `claim` (takeover) or `execute` (repair) |
| `narada task release <number>` | Release a claimed task | Task has active assignment by releasing agent | `execute` |
| `narada task roster assign <number>` | Mark agent as working on task (with optional claim) | Agent in roster; task exists | `claim` |

**Assignment boundary:** These commands manage the agent↔task binding. They update both the assignment record and the roster entry atomically.

### Family 3: Lifecycle Transition

| Command | Purpose | Preconditions | Authority |
|---------|---------|---------------|-----------|
| `narada task report <number>` | Submit work result, transition to in_review | Task claimed by reporting agent; `--summary` required | `execute` |
| `narada task review <number>` | Review a completed task | Task in_review; reviewer agent in roster; `--verdict` required | `resolve` |
| `narada task close <number>` | Close a task after gate validation | All criteria checked; execution notes exist; verification exists; no derivative files | `resolve` |
| `narada task reopen <number>` | Reopen a terminal task for re-closure | Task is closed/confirmed; `--by` required | `resolve` or `admin` |
| `narada chapter close <identifier>` | Close or confirm a chapter | All tasks in range terminal; closure decision exists | `resolve` or `admin` |

**Lifecycle boundary:** These commands transition task status through the state machine. They are the only sanctioned path for status changes.

### Family 4: Composite / Convenience

| Command | Purpose | Preconditions | Authority |
|---------|---------|---------------|-----------|
| `narada task finish <number>` | Composite: report → review → roster done in one command | Task claimed; agent in roster; various sub-fields required | `execute` + `resolve` (depending on sub-actions) |
| `narada task promote-recommendation` | Promote advisory recommendation to durable assignment | Recommendation exists and is fresh (< 1 hour); validation passes | `resolve` (operator approval) |

**Composite boundary:** These commands orchestrate multiple governed operators into a single invocation. They do not introduce new mutations; they sequence existing ones with validation gates.

### Family 5: Dispatch and Execution

| Command | Purpose | Preconditions | Authority |
|---------|---------|---------------|-----------|
| `narada task dispatch pickup` | Pick up assigned work (create dispatch packet) | Task assigned to agent; dependencies satisfied; no active packet | `execute` |
| `narada task dispatch start` | Begin execution on picked-up work | Valid dispatch packet exists; lease not expired | `execute` |

**Dispatch boundary:** These commands bridge assignment to execution. They create bounded lease records with heartbeat semantics.

---

## What "Single-Command Driven" Means

### Definition

A workflow is **single-command driven** when every governed operator action can be completed by invoking exactly one sanctioned CLI command with the necessary arguments. No intermediate file editing, no multi-step choreography, no direct substrate mutation.

### Examples of single-command driven workflows

| Workflow | Command | What it does atomically |
|----------|---------|------------------------|
| Create a chapter | `chapter init <slug> --title "X" --from 100 --count 5` | Allocates numbers, creates range file, creates N task files, sets dependencies |
| Claim a task | `task claim 585 --agent a2 --reason "context"` | Validates roster, checks dependencies, creates assignment record, updates status |
| Submit work | `task report 585 --agent a2 --summary "..." --changed-files "..." --verification "..."` | Creates report, transitions status, releases assignment, updates roster |
| Close a task | `task close 585 --by a2` | Validates all gates, transitions status, records provenance |
| Finish completely | `task finish 585 --agent a2 --summary "..." --verdict accepted` | Reports, reviews, and marks roster done in one invocation |

### Examples of workflows that are NOT yet single-command driven (bounded blockers)

| Workflow | Current state | Why not single-command |
|----------|--------------|----------------------|
| Amend task spec after creation | Hand-edit markdown | No `task amend <number> --goal "..."` command exists |
| Add execution notes | Hand-edit markdown body | No `task report --append-notes` or similar |
| Check acceptance criteria | Hand-edit checkboxes in markdown | No `task check-criterion <number> <criterion-id>` command |
| Create standalone task (not chapter) | `task allocate` → hand-write file | Allocator gives number but doesn't create the spec file |

---

## Mutation Boundary: Spec vs Lifecycle vs Derived Artifact

### Specification Mutation

**Current state:** Task specification (goal, work, criteria, execution notes, verification) is mutated by directly editing the markdown file.

**Target state:** All spec mutations route through sanctioned commands.

| Spec Field | Current Mutation | Target Mutation Command | Status |
|------------|-----------------|------------------------|--------|
| Goal / required work | Hand-edit markdown body | `task amend <number> --goal "..."` (does not exist) | **Blocked** |
| Acceptance criteria | Hand-edit markdown body | `task amend <number> --criteria "..."` (does not exist) | **Blocked** |
| Execution notes | Hand-edit markdown body | `task report --append-notes "..."` (does not exist) | **Blocked** |
| Verification | Hand-edit markdown body | `task report --append-verification "..."` (does not exist) | **Blocked** |
| Dependencies | Hand-edit front matter | `task amend <number> --depends-on 123,456` (does not exist) | **Blocked** |
| Title | Hand-edit H1 in body | `task amend <number> --title "..."` (does not exist) | **Blocked** |

**Sanctioned spec authoring posture:** Command arguments are the canonical default. For multi-paragraph content, a `--from-file <path>` or `--editor` flag may launch an editor, but the command is still the entry point. Structured prompt-driven generation (e.g., `task generate-spec --from-prompt "..."`) is a bounded alternative for bootstrapping.

### Lifecycle Mutation

**Current state:** Lifecycle fields are mutated by CLI commands, but many commands still also rewrite markdown front matter as a compatibility projection.

**Target state:** Lifecycle mutations write to SQLite exclusively; markdown front matter is regenerated by projection or left static.

| Lifecycle Transition | Current Command | Writes SQLite? | Writes Markdown? | Status |
|---------------------|-----------------|----------------|------------------|--------|
| opened → claimed | `task claim` | Partial (assignments JSON) | Yes (front matter) | Partial |
| claimed → in_review | `task report` | Partial (reports JSON) | Yes (front matter) | Partial |
| in_review → closed | `task review`, `task close` | Partial (reviews JSON) | Yes (front matter + provenance) | Partial |
| closed → opened | `task reopen` | No | Yes (deletes provenance) | **Blocked** |
| opened → closed (direct) | `task close` | Partial | Yes | Partial |
| claimed → opened | `task release` | Partial (assignments JSON) | Yes | Partial |

**Key bounded blocker:** Seven operators (`claim`, `release`, `report`, `review`, `close`, `reopen`, `continue`) still mutate markdown front matter directly. Full SQLite migration is required for complete command-mediated authority.

### Derived Artifact Mutation

Derived artifacts are created by governed operators and must never be hand-written.

| Artifact | Created By | Hand-Writing Prohibited? |
|----------|-----------|-------------------------|
| Work result reports (`reports/*.json`) | `task report` | Yes |
| Review records (`reviews/*.json`) | `task review` | Yes |
| Closure decisions (`decisions/*.md`) | `chapter close` | Yes |
| Assignment records (`assignments/*.json`) | `task claim`, `task continue` | Yes |
| Promotion requests (`promotions/*.json`) | `task promote-recommendation` | Yes |
| Dispatch packets (SQLite) | `task dispatch pickup` | Yes |

---

## Direct-Edit Prohibitions

In the target regime, the following patterns are **prohibited as normal task work**:

| Prohibited Pattern | Why Prohibited | Sanctioned Replacement |
|-------------------|----------------|----------------------|
| Editing task markdown front matter to change `status` | Bypasses SQLite authority and state machine | `task claim`, `task release`, `task report`, `task close`, `task reopen` |
| Hand-writing a new `.ai/do-not-open/tasks/*.md` file | Bypasses number allocator; risks collisions | `task allocate` + future `task create` or `chapter init` |
| Editing `depends_on` in front matter directly | No validation that dependencies exist or are terminal | Future: `task amend --depends-on` |
| Manually editing acceptance criteria checkboxes | No audit trail; may bypass review | Future: `task check-criterion` |
| Hand-writing execution notes or verification | No association with report/assignment | Future: `task report --append-notes` |
| Editing chapter DAG outside sanctioned operators | Risks orphan tasks, broken ranges | `chapter init`, future `chapter amend` |
| Raw SQLite writes for task operations | Bypasses all governance | Use sanctioned command or classify as maintenance |
| Creating review/closure/report files by hand | Bypasses validation and provenance | `task review`, `chapter close`, `task report` |

---

## Authority Separation

| Action | Who May Perform | Authority Class | Rationale |
|--------|----------------|-----------------|-----------|
| **Create task / chapter** | Any agent in roster | `claim` | Creation is low-risk; collision prevention is mechanical |
| **Amend spec** | Assigned agent or operator | `execute` | Spec changes affect work direction; should be bound to assignment |
| **Claim task** | Any agent in roster | `claim` | Claiming is self-service with dependency checks |
| **Transition lifecycle** | Assigned agent (report/release) or operator (close/reopen) | `execute` or `resolve` | Lifecycle transitions are governance events |
| **Close / confirm** | Operator or designated reviewer | `resolve` | Terminal transitions require independent validation |
| **Reopen** | Operator | `resolve` or `admin` | Reopening is exceptional; requires override authority |
| **Derive follow-up** | Any agent (from finding) or operator | `claim` | Derivative tasks inherit authority from source finding |
| **Promote recommendation** | Operator | `resolve` | Converts advisory to durable; requires explicit approval |

---

## Sanctioned Text-Authoring Posture

**Canonical default:** Command arguments (`--goal`, `--summary`, `--criteria`, etc.)

**Bounded alternatives:**

| Alternative | When Used | Standing |
|-------------|-----------|----------|
| `--from-file <path>` | Multi-paragraph content too large for shell args | Sanctioned; command still owns the mutation |
| `--editor` flag (launches `$EDITOR`) | Interactive authoring | Sanctioned; command still owns the mutation |
| Structured prompt-driven generation (`--generate-from-prompt`) | Bootstrapping new tasks | Sanctioned for creation only; review required |
| Hand-editing markdown | Never for normal work | **Prohibited** except during migration |

The key principle: **the command is always the entry point.** Even when an editor is launched, the agent does not open the file directly — the command opens the editor, collects input, and performs the validated mutation.

---

## Verification and Bounded Blockers

### What is already true

- [x] 10+ mutation commands exist covering creation, assignment, lifecycle, composite, and dispatch families ✅
- [x] State machine validation enforced (`isValidTransition`) ✅
- [x] Roster membership verified before assignment operations ✅
- [x] Dependency checks enforced before claim/pickup ✅
- [x] Closure gates validated (criteria, notes, verification, no derivatives) ✅
- [x] Atomic writes used throughout (temp file + rename) ✅
- [x] Audit records created (assignments, reports, reviews, promotions) ✅
- [x] `pnpm typecheck` — all 11 packages clean ✅

### Bounded blockers

| Blocker | Impact | Path to Resolution |
|---------|--------|-------------------|
| **No spec amendment commands** | Task spec cannot be edited via command surface | Tasks 588+ or future chapter: `task amend`, `task check-criterion` |
| **No standalone task creation** | `task allocate` gives number but no file is created | Future: `task create --number <n> --title "..." --goal "..."` |
| **7 operators still write markdown front matter** | Lifecycle authority split across SQLite and markdown | Tasks 548–549 migration plan; full operator rewrite |
| **Execution notes / verification appended by hand** | No audit trail for body section edits | Future: `task report --append-notes` or `task amend --section` |
| **Criteria checkboxes edited by hand** | No programmatic criterion tracking | Future: `task check-criterion <task> <criterion-id>` |
| **Chapter DAG edited by hand** | No command to amend chapter structure | Future: `chapter amend` |

---

## Closure Statement

Task 587 closes with a defined mutation surface of **five command families** (creation, assignment/continuation, lifecycle transition, composite/convenience, dispatch/execution) that implement the "single-command driven" principle for all governed operator actions. The boundary between specification mutation, lifecycle mutation, and derived artifact creation is explicit. Direct-edit prohibitions are stated for eight common patterns. Authority separation maps six action types to their required authority classes. The sanctioned text-authoring posture is **command arguments as canonical default**, with `--from-file`, `--editor`, and prompt-driven generation as bounded alternatives. Residual blockers (no spec amendment commands, no standalone task creation, operators still writing markdown front matter) are honestly acknowledged and mapped to future resolution paths.

---

## Next Executable Line

**Task 588 — Direct-Access Prohibition And Sanctioned-Substrate Contract:** Define what direct markdown/SQLite access is forbidden, what exceptions exist, and what "single-command driven" means at the enforcement layer.

**Closed by:** a2  
**Closed at:** 2026-04-24
