# Decision 589 — Command-Mediated Task Authority Closure

> **Status:** Closed  
> **Task:** 589  
> **Governed by:** task_close:a2  
> **Depends on:** 585, 586, 587, 588  
> **Chapter:** Command-Mediated Task Authority (585–589)

---

## Chapter Summary

The Command-Mediated Task Authority chapter (Tasks 585–589) defines the end-state regime in which Narada tasks are no longer worked through direct markdown or SQLite access, but only through sanctioned Narada CLI commands.

### What was ambiguous before

The task working surface was smeared across:
- command operators,
- markdown files,
- SQLite tables,
- and local human/agent habits.

A task could be defined as "whatever is in the markdown file," "whatever is in SQLite," or "whatever the agent happened to touch." That ambiguity is now removed.

### What is explicit now

| Aspect | Pre-Chapter State | Post-Chapter State |
|--------|-------------------|-------------------|
| **What a task IS** | Ambiguous (file? row? command?) | A governed work object with a sanctioned command surface as its sole interaction boundary |
| **Authoritative loci** | Smeared across markdown and SQLite | Spec → markdown; lifecycle → SQLite; observation → projection; creation → allocator; closure → governed operators |
| **Observation surface** | Direct file reading, SQLite queries, filesystem search | Seven sanctioned command families (`list`, `evidence`, `graph`, `lint`, `recommend`, `roster`, `dispatch`) |
| **Mutation surface** | Direct file editing, hand-writing tasks, front-matter edits | Five sanctioned command families (creation, assignment, lifecycle, composite, dispatch) |
| **Substrate posture** | Working surface and authority | Substrate only — implementation detail, not interaction boundary |
| **Direct access** | Implicitly permitted | Explicitly prohibited for normal work; six bounded exception classes defined |
| **Single-command driven** | Rhetorical | Defined precisely: one command completes one governed action with no file choreography |

---

## Contract Inventory

| Decision | Title | Core Contribution |
|----------|-------|-------------------|
| **585** | Command-Mediated Task Authority Boundary Contract | Irreducible object definition; five authoritative loci; substrate bypass collapse prevented |
| **586** | Task Observation Command Surface Contract | Seven observation families; canonical selectors; projection-only return posture; direct-reading prohibitions |
| **587** | Task Mutation Command Surface Contract | Five mutation families; "single-command driven" definition; spec/lifecycle/artifact boundary; authority separation |
| **588** | Direct-Access Prohibition And Sanctioned-Substrate Contract | Four precise prohibitions; six exception classes with standing; five-layer enforcement posture |

---

## What Is Now Explicit

### 1. Authoritative Task Interaction Regime

A Narada Task is a governed work object. Its entire interaction surface — creation, mutation, observation, closure — is mediated exclusively through sanctioned CLI commands. Markdown is the authored spec container. SQLite is the lifecycle substrate. Neither is the task itself.

### 2. Observation Command Family

Seven families of read-only `derive`-class commands:
1. **Task Listing** — `task list`, `task evidence list`, `task recommend`
2. **Single-Task Inspection** — `task evidence inspect`
3. **Graph/Dependency** — `task graph`
4. **Structural Validation** — `task lint`
5. **Chapter State** — `chapter status`
6. **Roster Observation** — `task roster show`
7. **Dispatch Observation** — `task dispatch status`

### 3. Mutation Command Family

Five families of write commands:
1. **Creation** — `task allocate`, `chapter init`, `task derive-from-finding`
2. **Assignment/Continuation** — `task claim`, `task continue`, `task release`, `task roster assign`
3. **Lifecycle Transition** — `task report`, `task review`, `task close`, `task reopen`, `chapter close`
4. **Composite/Convenience** — `task finish`, `task promote-recommendation`
5. **Dispatch/Execution** — `task dispatch pickup`, `task dispatch start`

### 4. Substrate Prohibition Regime

Four prohibitions:
1. No direct task editing
2. No direct task reading
3. No direct task creation
4. No direct SQLite access for task operations

Normal standing for direct substrate access: **none**.

### 5. Exception Standing

Six bounded exception classes:
1. Migration/bootstrap (`admin`, time-bounded)
2. Low-level repair (`admin`, per-incident)
3. Forensic/debug (`derive` read / `admin` mutate, per-session)
4. Export/import (`admin`, per-operation)
5. Command development (read-only, during development)
6. Violation detection — `task lint` (`derive`, ongoing)

### 6. "Single-Command Driven"

Every governed operator action can be completed by invoking exactly one sanctioned CLI command with necessary arguments. No intermediate file editing, no multi-step choreography, no direct substrate mutation.

---

## What Remains Deferred or Risky

### Deferred to Future Implementation

| # | Item | Risk Level | Why Deferred |
|---|------|-----------|-------------|
| 1 | **Filesystem permission enforcement** | Medium | Lint catches violations, but technical enforcement requires OS/container changes |
| 2 | **Pre-commit hooks blocking direct edits** | Medium | CI lint is sufficient for now; git hooks add complexity |
| 3 | **SQLite service-account ownership** | Low | Same-repo trust model is acceptable for current scale |
| 4 | **`task amend` / `task create` commands** | Medium | Spec editing still requires hand-editing; no command-mediated path exists |
| 5 | **`task check-criterion` command** | Low | Criteria checkboxes are edited by hand; lint validates terminal state |
| 6 | **Unified `task show` command** | Low | `task evidence inspect` + markdown reading covers most needs |
| 7 | **Full markdown front-matter migration** | High | Seven operators still write markdown front matter; full SQLite migration is a large refactor |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Agents continue hand-editing task files out of habit | High | Governance bypass, stale state | `task lint` detects violations; cultural enforcement via onboarding |
| Markdown front matter and SQLite drift out of sync | Medium | Conflicting authority | SQLite is canonical when both exist; operators prefer SQLite |
| New contributors unaware of prohibition regime | Medium | Unintentional direct edits | Documented in AGENTS.md and CLI help; lint catches violations |
| Emergency repairs bypass audit trail | Low | Loss of provenance | Repair exception requires `admin` and explicit logging |

---

## First Executable Implementation Line

**Implement `narada task create` — a standalone task creation command that combines number allocation with spec authoring.**

This is the highest-value next step because:

1. It closes the most visible gap in the command-mediated regime: task creation still requires `task allocate` followed by hand-writing a file.
2. It validates the "single-command driven" principle with a concrete user-facing feature.
3. It establishes the pattern for spec-authoring via commands (arguments, `--from-file`, `--editor`).
4. It is self-contained — does not require completing the full SQLite migration first.

**Proposed interface:**

```bash
narada task create \
  --title "Implement warm-context affinity" \
  --goal "Add warm-context scoring to recommendation engine" \
  --chapter "Assignment Recommendation" \
  --depends-on 580 \
  --criteria "Score computed correctly","Decay applied correctly"
```

This command would:
1. Allocate a task number atomically
2. Generate the markdown file with proper front matter
3. Initialize the SQLite lifecycle row
4. Return the created task ID and number

**Alternative first line:** If `task create` is judged too large, the first line could be `narada task amend <number> --goal "..." --criteria "..."` to establish spec mutation via commands.

---

## Verification

- [x] Four decision artifacts exist (585, 586, 587, 588) ✅
- [x] Chapter closure artifact exists (this document) ✅
- [x] Target regime is explicit and unambiguous ✅
- [x] Observation and mutation families are catalogued ✅
- [x] Direct-access prohibitions and exceptions are defined ✅
- [x] Deferred risks are honestly stated ✅
- [x] First implementation line is named with rationale ✅
- [x] `pnpm typecheck` — all 11 packages clean ✅

---

**Closed by:** a2  
**Closed at:** 2026-04-24
