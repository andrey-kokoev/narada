---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T15:45:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [546, 547, 548, 549, 550, 570, 580]
artifact: .ai/decisions/20260424-585-command-mediated-task-authority-boundary-contract.md
---

# Task 585 - Command-Mediated Task Authority Boundary Contract

## Goal

Define the canonical task-authority boundary for Narada once direct task-file and direct SQLite interaction are removed from normal work.

## Context

The current system still permits multiple possible answers to a critical question:

> What is the real working surface for tasks?

Possible continuations still include:

- task markdown as the practical source of truth,
- SQLite as the practical source of truth,
- commands as wrappers over whichever substrate someone happens to touch,
- or a mixed regime where command use is preferred but not required.

That ambiguity must be removed.

## Required Work

1. State the irreducible object precisely:
   - what a task is in the command-mediated regime,
   - what is authoritative,
   - what is merely projected,
   - and what is no longer a normal human/agent working surface.
   The task must not remain definable as "whatever is in the markdown file" or "whatever is in SQLite".
2. Define the authoritative loci at minimum:
   - task specification authority
   - task lifecycle authority
   - task observation authority
   - task creation authority
   - task closure authority
3. Separate forced structure from contingent policy:
   - which parts must be command-mediated by necessity,
   - which parts are merely current implementation choices,
   - which parts may remain projected for human legibility.
4. State whether task markdown remains:
   - a projection only,
   - an internal compiled artifact,
   - a historical export,
   - or something else.
   Choose one canonical posture; do not preserve multiple equally-valid readings.
5. State whether direct SQLite is ever part of task authority, or only a substrate behind sanctioned operators.
   If any exception exists, it must be classified as non-normal maintenance rather than ordinary task work.
6. Define the key invariant:
   - task interaction authority belongs to sanctioned command operators, not to substrates.
7. Name the main collapse this boundary prevents.
8. Record verification or bounded blockers.

## Non-Goals

- Do not enumerate every CLI command here if the family boundary can be defined more cleanly.
- Do not jump into implementation APIs yet.
- Do not preserve mixed-regime ambiguity for convenience.

## Execution Notes

### Artifact

Written `.ai/decisions/20260424-585-command-mediated-task-authority-boundary-contract.md` (~12 KB) covering:
- Irreducible object definition (task is not markdown, not SQLite, but a governed command-mediated work object)
- Five authoritative loci tables (spec, lifecycle, observation, creation, closure)
- Forced vs contingent vs projected structure separation
- Markdown posture: authored spec only (Model A), not a working surface
- SQLite posture: substrate behind sanctioned operators only, direct access classified as non-normal maintenance
- Key invariant: task interaction authority belongs to sanctioned command operators, not substrates
- Main collapse prevented: substrate bypass (direct markdown/SQLite mutation bypassing governance)
- Command surface summary (19 commands in observation/mutation/dispatch families)
- Verification evidence and bounded blockers (7 operators still mutate markdown front matter, acknowledged as residual)
- Non-normal maintenance exception classification table

### Verification

- `pnpm typecheck` — all 11 packages clean ✅
- Decision artifact exists and defines unambiguous authority boundary ✅
- All five loci explicit with access rules ✅
- Markdown and SQLite postures each choose one canonical reading ✅
- Bounded blockers honestly recorded (7 operators with residual markdown mutation) ✅

## Acceptance Criteria

- [x] The authoritative task interaction object is explicit
- [x] Task spec / lifecycle / observation / creation / closure loci are explicit
- [x] Markdown posture is explicit
- [x] SQLite posture is explicit
- [x] The anti-collapse invariant is explicit
- [x] Verification or bounded blocker evidence is recorded

