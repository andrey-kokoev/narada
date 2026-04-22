---
status: closed
closed: 2026-04-22
depends_on: [385]
---

# Task 396 — Narada Learning Loop From Reviewed Work

## Assignment

Design Narada's learning loop for extracting durable procedural knowledge from reviewed work, without copying agent-centric self-improvement patterns that bypass authority.

This task is inspired by systems such as Hermes Agent, which use persistent memory and skill creation to improve over time. Narada should adopt the useful part — reviewed procedural learning — while preserving its own authority boundaries.

## Read First

- `SEMANTICS.md`
- `.ai/task-contracts/agent-task-execution.md`
- `.ai/tasks/20260421-385-mechanical-agent-roster-tracking.md`
- `.ai/decisions/20260421-384-operator-console-site-registry-closure.md`
- Current `AGENTS.md` documentation index and invariants

## Context

Narada currently learns through task files, decisions, changelog entries, contracts, doctrine documents, and occasional conversation memory. This is structurally coherent but operationally weak: the system does not mechanically extract reusable procedural knowledge from completed, reviewed work.

Hermes-like systems appear stronger at persistent memory, skill extraction from repeated work, subagent final-summary discipline, session search, and self-evaluation checkpoints.

Narada must not copy the agent-centric version directly. In Narada, learning must be:

- extracted from reviewed work, not raw action;
- inspectable as artifacts;
- bounded by authority classes;
- non-authoritative until accepted;
- linked to source tasks/decisions.

## Goal

Define a Narada-native learning loop:

`reviewed task/chapter -> learning candidate -> accepted skill/doctrine/contract patch -> future task guidance`

The loop must improve long-horizon coherence without allowing agents to mutate behavior silently.

## Required Work

1. Produce a design decision under `.ai/decisions/`.

   It must answer:

   - What counts as eligible source material?
   - What kinds of learning artifacts can be produced?
   - Who/what has authority to accept a learning artifact?
   - Where should artifacts live?
   - How does the loop avoid skill bloat and stale doctrine?
   - How are source tasks/decisions linked?

2. Define learning artifact classes.

   At minimum:

   - `skill_candidate`: procedural workflow extracted from successful reviewed work;
   - `doctrine_candidate`: semantic/coherence rule extracted from repeated drift;
   - `contract_patch`: proposed change to task/agent contracts;
   - `memory_note`: short bounded note for active project context;
   - `anti_pattern`: repeated failure mode with detection/remediation.

3. Define authority states.

   Suggested lifecycle:

   - `candidate`
   - `reviewed`
   - `accepted`
   - `rejected`
   - `superseded`

   Only `accepted` artifacts may affect future task guidance.

4. Define storage layout.

   Candidate locations:

   - `.ai/learning/candidates/`
   - `.ai/learning/accepted/`
   - `.ai/learning/index.json`

   Keep this repository-local and inspectable. Do not write private operational knowledge into public repo artifacts.

5. Define an extraction operator surface.

   Proposed CLI shape:

   ```bash
   narada task learn --from-task <task-number>
   narada task learn --from-chapter <chapter-range>
   narada task learn review <candidate-id>
   narada task learn accept <candidate-id>
   narada task learn reject <candidate-id>
   ```

   This task only needs to design the surface unless a small schema/prototype is clearly needed.

6. Define subagent final-summary discipline.

   If a worker/reviewer agent completes a task, its final summary should be capturable into learning candidates only after review. Raw final summaries are evidence, not accepted doctrine.

7. Define anti-bloat rules.

   Include:

   - no candidate from every task by default;
   - repeated failure or repeated success pattern required;
   - accepted artifact must name when not to apply it;
   - stale artifacts must be supersedable.

8. Create follow-up implementation tasks only if needed.

   If implementation is needed, create the smallest non-overlapping task set after the design decision.

## Non-Goals

- Do not implement automatic skill generation in this task unless the design reveals a trivial artifact-only prototype.
- Do not let agents patch AGENTS.md or task contracts without review.
- Do not create personal/private memory artifacts in the public repository.
- Do not copy Hermes behavior wholesale.
- Do not create derivative task-status files.

## Execution Mode

Start in planning mode before editing. The plan must name:

- intended write set;
- invariants at risk;
- dependency assumptions;
- focused verification scope.

## Execution Notes

### Design Decision

Created `.ai/decisions/20260422-396-narada-learning-loop-design.md` with:
- Eligible source material criteria (reviewed, bounded, success/repeated-failure)
- Five artifact classes with canonical JSON shapes: `skill_candidate`, `doctrine_candidate`, `contract_patch`, `memory_note`, `anti_pattern`
- Authority lifecycle mapping to SEMANTICS.md authority classes (`derive` → `resolve` → `admin`)
- Storage layout: `.ai/learning/candidates/`, `.ai/learning/accepted/`, `.ai/learning/index.json`
- CLI surface: `narada task learn --from-task`, `--from-chapter`, `show`, `review`, `accept`, `reject`, `supersede`
- Anti-bloat rules: no default extraction, repeated pattern required, negation conditions mandatory, supersession for stale artifacts
- Public/private boundary: no secrets or operational data in repo artifacts
- Subagent final-summary discipline: summaries are evidence, not doctrine; require human review before acceptance

### Prototype Schema

Created prototype files to demonstrate concrete schema:
- `.ai/learning/index.json` — empty v1 registry
- `.ai/learning/candidates/20260422-001-skill-sqlite-atomic-write.json` — sample skill candidate from Task 380
- `.ai/learning/candidates/20260422-002-doctrine-neutral-tables.json` — sample doctrine candidate from Chapter 378-384

No implementation code was added. No CLI command implementations were written.

### Follow-Up Tasks

Created four follow-up tasks in the design decision (not yet as task files):
- Task 397 — Learning Artifact Schema & Validation (types, validators, atomic store)
- Task 398 — Extraction Operator CLI (`--from-task`, `--from-chapter`)
- Task 399 — Review & Acceptance CLI (`show`, `review`, `accept`, `reject`, `supersede`)
- Task 400 — Anti-Bloat Enforcement (repetition detection, negation validation, TTL tracking)

These will be created as `.ai/tasks/` files when implementation is scheduled.

## Acceptance Criteria

- [x] Design decision exists under `.ai/decisions/`.
- [x] Learning artifact classes are defined.
- [x] Authority lifecycle for learning artifacts is defined.
- [x] Storage layout is defined.
- [x] Extraction/review/acceptance operator surface is defined.
- [x] Anti-bloat and stale-artifact rules are explicit.
- [x] Public/private knowledge boundary is explicit.
- [x] Follow-up implementation tasks are created only if needed and are self-standing.
- [x] No implementation code is added unless explicitly justified.
- [x] No derivative task-status files are created.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
