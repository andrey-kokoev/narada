# Decision: Narada Learning Loop From Reviewed Work

**Date:** 2026-04-22  
**Task:** 396  
**Verdict:** **Design accepted — implementation deferred to follow-up tasks.**

---

## Summary

Narada now has a disciplined learning loop design that extracts durable procedural knowledge from reviewed work without allowing silent agent self-mutation.

The loop is inspired by Hermes-like persistent memory systems but stripped of agent-centric authority bypass. In Narada, learning artifacts are:

- **Extracted from reviewed work**, not raw action logs.
- **Inspectable as discrete artifacts** with a defined schema.
- **Non-authoritative until accepted** by a human operator or architect.
- **Linked to source material** (tasks, decisions, chapters) via stable identifiers.
- **Bounded by anti-bloat rules** that prevent accumulation of low-signal candidates.

The learning loop is an **advisory subsystem** per SEMANTICS.md §2.12. Removing every learning artifact from the system must leave all durable boundaries intact and all authority invariants satisfiable. Accepted artifacts influence future task guidance but do not mutate code, contracts, or governance without an explicit implementation task.

---

## 1. Eligible Source Material

Not all completed work is eligible for learning extraction. The loop requires **reviewed, bounded, and successful or repeatedly failed work**.

### 1.1 Eligibility Criteria

| Criterion | Required | Rationale |
|-----------|----------|-----------|
| **Reviewed** | Yes | Raw agent output is evidence, not doctrine. A task must have passed review (task status `reviewed` or `closed`) before its work can be mined for learning. |
| **Bounded** | Yes | Source must be a single task, a closed chapter (task range), or a single decision. Unbounded conversation threads are ineligible. |
| **Success pattern or repeated failure** | Yes | At least one of: (a) the task was completed successfully and review found reusable procedural insight; (b) the same failure mode appeared in ≥2 reviewed tasks; (c) a chapter closure decision explicitly identified a coherence gap that learning could close. |
| **Not every task** | Yes | Default is NO candidate. The extraction operator requires explicit `--from-task` or `--from-chapter`. |

### 1.2 Source Material Types

| Source Type | Example | Eligible When |
|-------------|---------|---------------|
| **Closed task** | `20260421-380-site-registry-storage-discovery.md` | Status is `reviewed` or `closed`; execution notes contain procedural insight |
| **Chapter closure decision** | `20260421-384-operator-console-site-registry-closure.md` | Decision is `accepted`; gap table or CCC assessment identifies reusable pattern |
| **Contract evolution** | `.ai/task-contracts/agent-task-execution.md` | Multiple tasks revealed a contract gap that a patch could close |
| **Decision** | Any `.ai/decisions/*.md` | Decision identifies a pattern, anti-pattern, or doctrine gap |

### 1.3 Ineligible Material

- Raw chat transcripts or conversational memory
- Tasks with status `opened`, `claimed`, or `abandoned`
- Tasks whose review findings were all mechanical (typo, format, naming) with no procedural insight
- Operator private notes or ephemeral context

---

## 2. Learning Artifact Classes

Five artifact classes are defined. Each has a distinct shape, authority implication, and consumption pattern.

### 2.1 `skill_candidate`

**Definition:** A procedural workflow extracted from successful reviewed work that can be reused in future tasks of the same or similar kind.

**Shape:**
- `trigger`: what situation activates this skill (e.g., "implementing a new SQLite-backed store")
- `steps`: ordered procedural guidance
- `authority_note`: any authority boundary the skill must respect
- `verification_hint`: how to verify the skill was applied correctly
- `not_applicable_when`: explicit negation conditions

**Example trigger:** "When adding a new persistence store to `packages/layers/control-plane/src/persistence/`."

**Consumption:** Injected into task context or referenced in `AGENTS.md` "Where to Find Things" table after acceptance.

### 2.2 `doctrine_candidate`

**Definition:** A semantic or coherence rule extracted from repeated drift or a chapter closure assessment.

**Shape:**
- `principle`: the rule in one sentence
- `rationale`: why this rule exists
- `detected_in`: list of source tasks/decisions where drift was observed
- `enforcement`: how the rule is checked (lint, review checklist, preflight)
- `not_applicable_when`: exceptions

**Example principle:** "Console surfaces must not query mailbox-era views directly; they must use the neutral `context_records` substrate."

**Consumption:** Becomes an `AGENTS.md` invariant or a contract clause after acceptance.

### 2.3 `contract_patch`

**Definition:** A proposed amendment to a task contract, agent contract, or governance document.

**Shape:**
- `target_file`: the contract file being patched
- `proposed_change`: diff or structured replacement description
- `motivation`: what reviewed work revealed
- `risk`: what could break if applied incorrectly
- `migration`: how existing in-flight tasks adapt

**Authority note:** Contract patches are the most sensitive artifact class. Agents must **never** apply a contract patch automatically. Acceptance requires explicit operator action, usually via a dedicated task.

### 2.4 `memory_note`

**Definition:** A short, bounded note for active project context that is not yet procedural enough to be a skill or doctrine.

**Shape:**
- `context`: narrow situation where note is relevant
- `content`: the note itself (≤500 characters preferred)
- `ttl`: optional expiration hint (e.g., "until Cloudflare Sites are implemented")
- `source_tasks`: backing task numbers

**Consumption:** Displayed in task context preparation or `narada task learn show` output. Advisory only.

### 2.5 `anti_pattern`

**Definition:** A repeated failure mode with detection criteria and remediation guidance.

**Shape:**
- `symptom`: how to recognize the anti-pattern
- `frequency`: how many times observed (≥2 required)
- `observed_in`: source tasks
- `root_cause`: why it happens
- `remediation`: how to fix or avoid
- `detection`: static check, review checklist item, or test pattern that can catch it

**Consumption:** Added to review checklists, lint rules, or preflight validation after acceptance.

---

## 3. Authority Lifecycle

Learning artifacts move through a five-state lifecycle. Only `accepted` artifacts may affect future task guidance.

### 3.1 State Machine

```
                    +------------+
                    |  candidate |  (created by extraction operator)
                    +-----+------+
                          |
                          | review (operator or architect)
                          v
                    +------------+
               +--->|  reviewed  |  (human has assessed)
               |    +-----+------+
               |          |
      reject   |     accept     |   supersede (of accepted)
               |          |       |
               |          v       v
               |    +------------+   +------------+
               +--- |  accepted  |-->| superseded |
                    +------------+   +------------+
                          |
                    +-----+------+
                    |  rejected  |
                    +------------+
```

### 3.2 State Definitions

| State | Meaning | Authority to Enter |
|-------|---------|-------------------|
| `candidate` | Extracted from source material; awaiting review | `derive` (extraction operator or agent-triggered CLI command) |
| `reviewed` | A human operator or architect has read and assessed the candidate | `resolve` (operator review action) |
| `accepted` | Candidate is approved for use in future task guidance | `admin` (explicit operator/architect acceptance) |
| `rejected` | Candidate is declined; remains in index for audit | `admin` (explicit rejection) |
| `superseded` | Previously accepted artifact is replaced by a newer one | `admin` (explicit supersession or auto-triggered by newer acceptance) |

### 3.3 Authority Mapping to SEMANTICS.md

| Transition | From → To | Required Authority | Invariant |
|------------|-----------|-------------------|-----------|
| Extract | source → `candidate` | `derive` | Extraction is read-only over source material; creates advisory artifact only |
| Review | `candidate` → `reviewed` | `resolve` | Review does not mutate any code, contract, or task file |
| Accept | `reviewed` → `accepted` | `admin` | Only accepted artifacts may be referenced in future task context |
| Reject | `reviewed` → `rejected` | `admin` | Rejected artifact remains inspectable but is ineligible for guidance |
| Supersede | `accepted` → `superseded` | `admin` | Superseded artifact remains in index with `superseded_by` link |

### 3.4 Critical Invariant

> **No Silent Mutation:** An agent may create a `candidate`. An agent may NOT transition a candidate to `accepted`. The `accepted` state is exclusively human-operator authority. This prevents agents from silently mutating their own behavior by accepting their own extracted skills.

---

## 4. Storage Layout

Repository-local, inspectable, and version-controlled.

### 4.1 Directory Structure

```
.ai/
├── learning/
│   ├── index.json           # lightweight registry for fast lookup
│   ├── candidates/          # all non-terminal artifacts
│   │   ├── 20260422-001-skill-store-impl.json
│   │   ├── 20260422-002-doctrine-neutral-tables.json
│   │   └── ...
│   └── accepted/            # only accepted artifacts
│       ├── 20260415-001-skill-sqlite-atomic-write.json
│       └── ...
```

### 4.2 Artifact File Schema

Each artifact is a single JSON file with this canonical shape:

```json
{
  "artifact_id": "20260422-001",
  "artifact_type": "skill_candidate",
  "state": "candidate",
  "created_at": "2026-04-22T15:38:00-05:00",
  "source": {
    "kind": "task",
    "task_number": 380,
    "task_file": ".ai/do-not-open/tasks/20260421-380-site-registry-storage-discovery.md"
  },
  "title": "SQLite-backed store implementation pattern",
  "content": {
    "trigger": "When adding a new persistence store...",
    "steps": ["1. Define interface in src/types/runtime.ts", "..."],
    "authority_note": "...",
    "verification_hint": "...",
    "not_applicable_when": ["Non-filesystem stores", "Stores without atomic write requirements"]
  },
  "reviewed_at": null,
  "reviewed_by": null,
  "accepted_at": null,
  "accepted_by": null,
  "superseded_by": null,
  "rejection_reason": null
}
```

### 4.3 Index Schema

`index.json` is a lightweight registry. It must be kept in sync with the file system but is not the source of truth for artifact content.

```json
{
  "version": 1,
  "updated_at": "2026-04-22T15:38:00-05:00",
  "artifacts": {
    "20260422-001": {
      "artifact_type": "skill_candidate",
      "state": "candidate",
      "title": "SQLite-backed store implementation pattern",
      "created_at": "2026-04-22T15:38:00-05:00",
      "path": "candidates/20260422-001-skill-store-impl.json"
    }
  },
  "accepted_index": {
    "skill": ["20260415-001"],
    "doctrine": [],
    "contract_patch": [],
    "memory_note": [],
    "anti_pattern": []
  }
}
```

### 4.4 File Naming Convention

```
<YYYYMMDD>-<NNN>[-<short-slug>].json
```

- `YYYYMMDD`: creation date
- `NNN`: zero-padded sequential number per day
- `short-slug`: optional, kebab-case, ≤5 words

Example: `20260422-001-skill-store-impl.json`

### 4.5 Atomicity

Index updates and artifact moves (`candidates/` → `accepted/`) must be atomic (temp file + rename), consistent with existing `.ai/` file mutation rules from task-governance.

---

## 5. Anti-Bloat Rules

The learning loop must not become a hoarding mechanism. These rules are mandatory.

### 5.1 No Default Candidate Creation

- **Rule:** No candidate is created automatically when a task closes.
- **Enforcement:** The extraction operator (`narada task learn --from-task`) requires explicit invocation. A daemon or hook must not auto-extract.

### 5.2 Repeated Pattern Requirement

- **Rule:** A candidate must be backed by either (a) a chapter closure decision that explicitly names a pattern, or (b) ≥2 reviewed tasks showing the same success or failure pattern.
- **Exception:** A `contract_patch` may be backed by a single decision if the decision explicitly recommends a contract amendment.
- **Enforcement:** The extraction operator validates the source material before creating a candidate. `memory_note` is exempt from repetition but is TTL-bounded.

### 5.3 Negation Condition Required

- **Rule:** Every accepted `skill_candidate`, `doctrine_candidate`, and `anti_pattern` must declare `not_applicable_when` conditions.
- **Rationale:** Prevents over-application of procedural knowledge to dissimilar contexts.
- **Enforcement:** Validation rejects acceptance of artifacts missing negation conditions.

### 5.4 Supersession of Stale Artifacts

- **Rule:** Accepted artifacts must be periodically reviewed. An artifact that has not been referenced in 90 days may be marked `stale` by the operator. An artifact that is contradicted by newer accepted doctrine must be superseded.
- **Mechanism:** `narada task learn supersede <artifact-id> --replace-with <new-artifact-id>`
- **Effect:** The old artifact moves to `superseded` state. Its file remains in `accepted/` for audit but is excluded from active guidance.

### 5.5 Memory Note TTL

- **Rule:** `memory_note` artifacts should declare a `ttl` or context window. They are advisory and may be garbage-collected after their context expires.
- **Enforcement:** No automatic garbage collection in v0. Operator must explicitly reject or supersede.

### 5.6 Rejection Retention

- **Rule:** Rejected candidates are kept in `candidates/` with `state: rejected` and `rejection_reason` for audit, but are excluded from all guidance lookups.
- **Rationale:** Prevents re-extraction of the same rejected insight.

---

## 6. Source Linking

Every artifact must be traceable to its origin.

### 6.1 Source Kinds

| Source Kind | Required Fields | Example |
|-------------|-----------------|---------|
| `task` | `task_number`, `task_file` | `{ "kind": "task", "task_number": 380, "task_file": ".ai/do-not-open/tasks/20260421-380-site-registry-storage-discovery.md" }` |
| `chapter` | `chapter_range`, `closure_decision` | `{ "kind": "chapter", "chapter_range": "378-384", "closure_decision": ".ai/decisions/20260421-384-operator-console-site-registry-closure.md" }` |
| `decision` | `decision_file` | `{ "kind": "decision", "decision_file": ".ai/decisions/20260422-396-narada-learning-loop-design.md" }` |
| `contract` | `contract_file`, `evidence_tasks` | `{ "kind": "contract", "contract_file": ".ai/task-contracts/agent-task-execution.md", "evidence_tasks": [385, 396] }` |

### 6.2 Deep Linking

Where possible, artifacts should reference specific sections of source documents:

```json
{
  "source": {
    "kind": "task",
    "task_number": 380,
    "task_file": ".ai/do-not-open/tasks/20260421-380-site-registry-storage-discovery.md",
    "section": "Execution Notes"
  }
}
```

### 6.3 Bidirectional Traceability

The design recommends (but does not mandate in v0) that task files and decisions reference back to derived learning artifacts:

```markdown
## Learning Artifacts Derived

- `20260422-001` (skill_candidate) — SQLite store pattern extracted from this task.
```

This is optional because it creates a write dependency on task files that may be undesirable.

---

## 7. Extraction Operator Surface (CLI)

The CLI surface is the extraction and governance boundary for learning artifacts.

### 7.1 Command Reference

| Command | Authority | Effect | Description |
|---------|-----------|--------|-------------|
| `narada task learn --from-task <n>` | `derive` | Creates `candidate` | Extract learning candidate from a reviewed task |
| `narada task learn --from-chapter <range>` | `derive` | Creates `candidate` | Extract candidate from a chapter closure decision |
| `narada task learn show [artifact-id]` | — | Read-only | Display artifact(s) |
| `narada task learn review <artifact-id>` | `resolve` | `candidate` → `reviewed` | Mark candidate as reviewed |
| `narada task learn accept <artifact-id>` | `admin` | `reviewed` → `accepted` | Accept artifact for future guidance |
| `narada task learn reject <artifact-id> --reason <text>` | `admin` | `reviewed` → `rejected` | Reject artifact |
| `narada task learn supersede <old-id> --replace-with <new-id>` | `admin` | `accepted` → `superseded` | Replace old artifact with new |

### 7.2 Extraction Operator Semantics

`narada task learn --from-task <n>` is a **read-only extraction** over the source task file. It:

1. Validates the task is reviewed/closed.
2. Parses the task for procedural insight (execution notes, patterns, corrections).
3. Creates ONE candidate file in `candidates/`.
4. Updates `index.json` atomically.

It does NOT:
- Mutate the source task file.
- Create more than one candidate per invocation.
- Accept its own output.

### 7.3 Chapter Extraction

`narada task learn --from-chapter <range>` (e.g., `378-384`) reads the chapter closure decision and any gap table entries. It produces candidates for:
- Each identified pattern (skill or doctrine)
- Each anti-pattern observed across the chapter
- Any recommended contract amendment (contract_patch)

### 7.4 Show Command

```bash
narada task learn show                  # list all artifacts
narada task learn show --state accepted # filter by state
narada task learn show --type skill     # filter by type
narada task learn show 20260422-001     # display single artifact
```

---

## 8. Subagent Final-Summary Discipline

Worker and reviewer agents currently produce a final summary at task completion. The learning loop captures this summary as **evidence**, not doctrine.

### 8.1 Summary as Evidence

A subagent final summary (e.g., "I fixed X by doing Y; the key insight was Z") is raw evidence. It may be:
- Quoted inside a `candidate` artifact's `content`.
- Referenced via the task file link.

It must NOT be:
- Directly accepted as a skill or doctrine.
- Automatically promoted to `accepted`.

### 8.2 Capture Flow

```
Agent completes task
  → Agent writes final summary in task file (Execution Notes)
  → Reviewer assesses task
  → Reviewer (or operator) runs: narada task learn --from-task <n>
  → Extraction operator creates candidate from task file + summary
  → Candidate awaits human review
```

### 8.3 Reviewer Responsibility

The reviewer is the first human filter. During review, the reviewer should flag whether the task contains extractable procedural knowledge:

```markdown
## Review Findings

- [ ] Learning candidate warranted: this task establishes a reusable pattern for X.
```

If checked, the reviewer or operator may run the extraction command.

---

## 9. Public / Private Knowledge Boundary

### 9.1 Public Repository Artifacts

All artifacts in `.ai/learning/` are public (committed to the repository). They must contain:
- Procedural patterns
- Semantic rules
- Anti-patterns
- Contract amendments

They must NOT contain:
- Private operational data (credentials, tokens, mailbox contents)
- Personal operator preferences
- Site-specific configuration values
- Customer or user data

### 9.2 Private Context

Operator private notes, session context, and ephemeral memory belong outside the repository (e.g., local note-taking tools). The learning loop does not manage private memory.

### 9.3 Verification

Before committing a candidate, the extraction operator should validate that no sensitive patterns (e.g., `GRAPH_ACCESS_TOKEN`, `api_key`, password-like strings) appear in the artifact content.

---

## 10. Relationship to Existing Narada Infrastructure

| Existing Surface | Learning Loop Relationship |
|-----------------|---------------------------|
| **Task files** (`.ai/do-not-open/tasks/`) | Primary source material; read-only for extraction |
| **Decisions** (`.ai/decisions/`) | Source material and eventual destination for accepted doctrine |
| **Contracts** (`.ai/task-contracts/`) | Source material and destination for accepted contract patches |
| **AGENTS.md** | Destination for accepted skills and doctrines (reference section) |
| **Roster** (`.ai/agents/roster.json`) | Unrelated; learning loop does not depend on roster state |
| **Changelog** | Learning artifacts may reference changelog entries but do not write to it |

---

## 11. Follow-Up Implementation Tasks

The design is complete. Implementation is deferred to the following self-standing tasks:

### Task 397 — Learning Artifact Schema & Validation

Implement the JSON schema, validation rules, and TypeScript types for learning artifacts.

- `packages/layers/cli/src/lib/learning-artifact.ts` — types and validators
- `packages/layers/cli/src/lib/learning-store.ts` — atomic file operations for `.ai/learning/`
- `test/lib/learning-artifact.test.ts` — validation tests

### Task 398 — Extraction Operator CLI

Implement `narada task learn --from-task` and `narada task learn --from-chapter`.

- `packages/layers/cli/src/commands/task-learn.ts`
- Markdown parsing for procedural insight extraction
- Atomic candidate creation + index update

### Task 399 — Review & Acceptance CLI

Implement `narada task learn show`, `review`, `accept`, `reject`, `supersede`.

- Extend `packages/layers/cli/src/commands/task-learn.ts`
- Authority enforcement (only `admin` for accept/reject/supersede)

### Task 400 — Anti-Bloat Enforcement

Implement validation rules for anti-bloat constraints.

- Repetition detection (≥2 tasks for pattern)
- Negation condition enforcement
- TTL tracking for memory notes
- Stale artifact warnings

---

## Closure Checklist

- [x] Eligible source material defined.
- [x] Five artifact classes defined with shapes.
- [x] Authority lifecycle defined (candidate → reviewed → accepted/rejected/superseded).
- [x] Storage layout defined (`.ai/learning/candidates/`, `.ai/learning/accepted/`, `.ai/learning/index.json`).
- [x] CLI extraction/review/acceptance surface defined.
- [x] Anti-bloat rules explicit (no default candidate, repeated pattern, negation required, supersession).
- [x] Public/private boundary explicit.
- [x] Subagent final-summary discipline defined.
- [x] Follow-up tasks created (397–400).
- [x] No implementation code added.
- [x] No derivative task-status files created.
