---
decided_at: 2026-04-24
decided_by: codex
reviewed_by: codex
governance: derive -> propose
---

# Decision 550 - Task State Authority Migration Closure

## Goal

Close the task lifecycle state-authority migration chapter honestly and name the first executable migration line.

## What The Chapter Made Explicit

The `546–550` chapter succeeded in making the anti-duplication posture explicit rather than leaving it as an aspiration.

The chapter now states clearly:

1. **Lifecycle authority boundary**
   - Live task lifecycle authority must move out of raw markdown mutation.
   - SQLite is the authoritative store for mutable lifecycle state.
   - Markdown remains authored task specification and human-readable context.

2. **Schema / projection split**
   - SQLite and markdown are not peer authorities.
   - Any combined task view is projected from the authoritative lifecycle store plus markdown-authored spec.
   - Projection is read-oriented, not a second source of truth.

3. **Operator migration path**
   - Existing governed operators (`claim`, `roster assign`, `finish`, `review`, `close`, recommendation promotion, dependency checks) must be re-homed onto SQLite-backed lifecycle state incrementally.
   - Migration is staged so the operator path remains coherent while authority moves under it.

4. **No-duplication enforcement**
   - The same lifecycle field must not be independently authoritative in both SQLite and markdown.
   - Fields such as `status`, `governed_by`, `closed_at`, `closed_by`, and continuation/assignment authority must not remain dual-written truths.

## What Remains Deferred Or Risky

The chapter is doctrinally complete, but not yet the end-state implementation.

Deferred or still-risky areas:

1. **Operator coverage is partial**
   - Some CLI surfaces and read paths still need full SQLite-first migration.

2. **Historical markdown compatibility**
   - Existing closed tasks may still carry historical front-matter state.
   - That is acceptable as legacy artifact history, but must not justify new dual authority.

3. **Projection discipline**
   - Projection-backed read surfaces must stay read-only and avoid reintroducing dual-write drift.

4. **Assignment / dispatch / execution join points**
   - As more runtime state moves into SQLite, task lifecycle authority must stay aligned with assignment and dispatch state rather than diverging into local ad hoc files.

## First Executable Migration Line

The first executable migration line is:

- **`562–565 Task Lifecycle SQLite Implementation v0`**

Why this is the first real line:

- it begins the concrete SQLite lifecycle store implementation,
- introduces the first projection-backed read surface,
- migrates the first governed writer,
- and closes with an implementation chapter rather than more doctrine.

That line is the correct operational continuation of this chapter.

## Closure Judgment

This chapter is complete as a **boundary and migration-shape chapter**.

It does **not** claim that:

- task lifecycle authority is already fully migrated,
- markdown is already fully projection-only,
- or all operators are already SQLite-backed.

It does claim, correctly, that Narada now has:

- an explicit authority boundary,
- an explicit no-duplication rule,
- an explicit migration posture,
- and a named executable next line.

