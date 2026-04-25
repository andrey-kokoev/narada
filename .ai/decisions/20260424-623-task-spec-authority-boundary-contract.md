---
status: accepted
created: 2026-04-24
decision_type: authority_boundary
---

# Decision 623 - Task Spec Authority Boundary Contract

## Question

What is the final authority boundary for task specification once Narada finishes the command-mediated task cutover?

## Decision

SQLite becomes the authoritative source of task specification in the normal path.

Markdown task files cease to be authored source and become projection or export only.

## Task Spec Authority Split

### SQLite-owned task specification

The normal-path authoritative task specification consists of:

- task identity
- task number
- title
- goal
- context
- required work
- non-goals
- acceptance criteria
- dependency list
- chapter membership or chapter linkage
- explicit operator-entered notes that are part of the task spec itself

These fields must be created, read, and amended through sanctioned task operators only.

### SQLite-owned task state

Task lifecycle and runtime surfaces remain SQLite-owned:

- lifecycle status
- governed provenance
- assignments
- reports
- reviews
- promotions
- dispatch
- verification runs
- numbering and reservations

### Markdown posture after cutover

Markdown task files are not authored source.

They may exist only as one of:

- generated projection for human inspection
- explicit export artifact
- debug/maintenance regeneration target

They are not part of the normal authority path for:

- task creation
- task read
- task amend
- dependency truth
- lifecycle truth

## Normal Command Surface

The sanctioned normal-path operator family must cover:

- `task create`
- `task read`
- `task amend`
- `task list`
- `task graph`
- `task recommend`
- lifecycle operators
- assignment/dispatch operators

After cutover, a human or agent should not need direct file access to author or interpret a task in the normal path.

## No-Dual-Authority Invariant

No task-spec field may be independently authoritative in both SQLite and markdown.

If a field appears in both places:

- SQLite is authoritative
- markdown is projection only

## Maintenance Exception

Direct substrate access may exist only as explicit non-normal maintenance or repair posture.

That means:

- no normal workflow depends on direct markdown edits
- no normal workflow depends on direct SQL edits
- any repair path is classified as maintenance, not ordinary task work

## Main Collapse Prevented

This boundary prevents spec-authority smear:

- task meaning split between markdown and SQLite
- task read telling one story while task amend mutates another source
- command surfaces acting as wrappers over whichever substrate happened to be edited last

## Consequences

The remaining implementation line must do all of the following:

1. persist task spec in SQLite
2. move `task read` to SQLite-backed spec
3. move `task amend` to SQLite-backed spec
4. demote markdown generation to projection/export
5. remove normal-path markdown-source fallback

