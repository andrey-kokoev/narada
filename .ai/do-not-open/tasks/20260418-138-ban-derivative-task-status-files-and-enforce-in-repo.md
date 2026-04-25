# Task 138: Ban Derivative Task Status Files and Enforce In-Repo

## Why

The repo has accumulated a large number of derivative task files such as:

- `*-EXECUTED.md`
- `*-RESULT.md`
- `*-SUPERSEDED.md`

This is semantically incoherent.

Task files in `.ai/do-not-open/tasks/` should be durable task artifacts, not a growing shadow log of status variants. Creating sibling files for execution or completion status causes:

- duplicated truth surfaces
- stale or contradictory task state
- broken monotonic task hygiene
- noisy reviews, because agents can "complete" a task by writing a second file instead of updating the original

We want one coherent rule:

- the original task file remains the canonical task artifact
- execution evidence is written in place
- derivative status files are forbidden unless the user explicitly asks for one

## Problem

Today the repo still permits and normalizes status-file sprawl:

- agents create `-EXECUTED` files instead of updating the original task
- some review/correction tasks refer to those derivative files as if they were canonical
- there is no lint or verification guard to stop new derivative files from appearing
- root guidance does not currently forbid this strongly enough

## Goal

Make derivative task-status files impossible to create casually and remove the ones already present.

## Required Outcomes

### 1. Root policy forbids derivative task status files

Update root `AGENTS.md` so it explicitly states:

- `.ai/do-not-open/tasks/*.md` task files are durable specs/reviews, not execution-log variants
- agents must not create `-EXECUTED.md`, `-DONE.md`, `-RESULT.md`, `-FINAL.md`, `-SUPERSEDED.md`, or similar derivative files unless the user explicitly asks
- task completion evidence belongs in the original task file, in a bounded section such as `Execution Notes`, `Verification`, `Outcome`, or equivalent
- if a task is obsolete or superseded, mark that in the original task file rather than creating a sibling status file

This must be written as a hard rule, not as soft preference.

### 2. Add mechanical lint enforcement

Add a repo lint/guard script that scans `.ai/do-not-open/tasks/` and fails if forbidden derivative filenames are present.

At minimum, forbid filenames matching:

- `*-EXECUTED.md`
- `*-DONE.md`
- `*-RESULT.md`
- `*-FINAL.md`
- `*-SUPERSEDED.md`

The script should explain:

- which files violate the rule
- what the expected replacement is

Keep it simple and deterministic.

### 3. Wire the guard into normal verification

The derivative-task-file guard must run from normal repo verification, so agents hit it during routine work.

At minimum, wire it into `pnpm verify`.

If there is a more coherent existing lint entrypoint, use that too, but `pnpm verify` is mandatory.

### 4. Clean up existing derivative task files

Remove existing derivative status files from `.ai/do-not-open/tasks/` and fold any necessary durable evidence back into the canonical task file where needed.

This includes current `-EXECUTED`, `-RESULT`, and `-SUPERSEDED` task-file variants already in the repo.

Do not silently discard meaningful content. If a derivative file contains unique durable information, migrate that information into the original canonical task file before deletion.

### 5. Repair references that still point at derivative files

Update any task/docs references that currently treat derivative files as canonical.

After this task lands:

- references should point to the canonical task file
- derivative task filenames should not remain part of normal repo semantics

## Deliverables

- root `AGENTS.md` explicitly bans derivative task status files
- lint/guard script rejects forbidden task filename patterns
- `pnpm verify` runs that guard
- existing derivative task status files are removed or their content migrated first
- references are updated to canonical task files

## Definition Of Done

- [ ] root `AGENTS.md` contains a hard prohibition on derivative task status files
- [ ] repo verification fails if a forbidden derivative task filename exists
- [ ] `pnpm verify` includes that guard
- [ ] existing derivative task status files in `.ai/do-not-open/tasks/` are removed after content migration where needed
- [ ] docs/tasks no longer rely on derivative task files as canonical references

## Notes

This task is about repo coherence, not about banning all task-state expression.

State is still allowed, but it must live:

- in the original task file
- in code/tests
- in review output

not in sibling pseudo-final task documents.
