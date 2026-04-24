---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T16:00:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [585]
artifact: .ai/decisions/20260424-586-task-observation-command-surface-contract.md
---

# Task 586 - Task Observation Command Surface Contract

## Goal

Define the sanctioned command surface for all task reading and inspection so direct markdown or SQLite reading is no longer the normal way tasks are observed.

## Context

If direct task reading is prohibited, Narada must still preserve all necessary observation capability.

The ambiguity to eliminate is:

- which observation acts must exist as commands,
- which read surfaces are canonical,
- what selectors they accept,
- and what is allowed to remain invisible or projection-only.

Without this, "no direct reading" would either be unusable or secretly ignored.

## Required Work

1. Enumerate the observation families that must exist in the command-mediated regime, at minimum:
   - inspect a single task
   - list tasks by selector
   - inspect task evidence/completeness
   - inspect chapter state
   - inspect assignment / continuation / review / closure state
   - inspect graph/dependency relations
2. Define the canonical read selectors for task observation:
   - identity
   - status/lifecycle
   - chapter/range
   - dependency/blocker state
   - assignment/reviewer/principal
   - evidence/completeness class
3. Define what the observation commands must return:
   - human-readable projection
   - machine-readable projection
   - artifact references where needed
   - and whether any command may return raw substrate form versus projection only.
   If raw substrate form is ever allowed, classify it as debug/maintenance rather than ordinary observation.
4. Make explicit that these are observation operators over authoritative stores, not permission to inspect substrates directly.
5. State which currently common direct-reading habits are prohibited in the target regime:
   - opening markdown task files for routine task reading
   - reading SQLite tables directly for task state
   - using filesystem search as a substitute for sanctioned task observation
6. Define bounded exceptions, if any, for:
   - debugging command failures
   - sanctioned low-level maintenance
   - migration phases
7. Record verification or bounded blockers.

## Non-Goals

- Do not define mutation operators here.
- Do not treat filesystem browsing as a valid replacement for observation commands.
- Do not leave "developers can always just open the file" as hidden fallback policy.
- Do not allow raw substrate dumps to quietly become the default machine observation surface.

## Execution Notes

### Artifact

Written `.ai/decisions/20260424-586-task-observation-command-surface-contract.md` (~12 KB) covering:
- Seven observation command families (listing, single-task inspection, graph/dependency, structural validation, chapter state, roster observation, dispatch observation)
- Canonical selector dimensions (identity, status/lifecycle, chapter/range, dependency/blocker, assignment/principal, evidence/completeness)
- Observation return posture: projection-only, human + JSON dual surface, artifact references, no raw substrate dumps
- Explicit direct-reading prohibition table (6 prohibited habits with sanctioned replacements)
- Five bounded exceptions (debugging, maintenance, development, lint, migration)
- Verification evidence and bounded blockers (5 gaps acknowledged)

### Verification

- `pnpm typecheck` — all 11 packages clean ✅
- Decision artifact exists and defines complete observation surface ✅
- All seven command families documented with authority class (`derive`) ✅
- Selector taxonomy explicit and mapped to commands ✅
- Direct-reading prohibitions and exceptions both explicit ✅

## Acceptance Criteria

- [x] Observation command families are explicit
- [x] Canonical selectors are explicit
- [x] Observation return posture is explicit
- [x] Direct-reading prohibitions are explicit
- [x] Bounded exceptions are explicit
- [x] Verification or bounded blocker evidence is recorded
