---
status: closed
amended_by: architect
amended_at: 2026-04-28T21:58:29.736Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T22:03:27.415Z
criteria_proof_verification:
  state: unbound
  rationale: All criteria satisfied: inbox submit writes portable exported envelope artifact by default, output and mutation evidence include the artifact, docs explain inbox.db versus inbox-envelopes, focused tests cover behavior, and pnpm verify passed.
closed_at: 2026-04-28T22:03:40.706Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Make inbox submissions visible across embodiments

## Chapter

canonical-inbox

## Goal

Eliminate the invisible-inbox failure where an envelope submitted into one embodiment's ignored SQLite inbox is not visible to another embodiment until a manual export is run. Inbox submission and/or preflight must preserve Canonical Mutation Evidence and make portable inbox handoff explicit.

## Context

A Windows embodiment submitted envelope env_653b3570-94dc-4f86-9110-183a60f393c0 into D:/code/narada/.ai/inbox.db. The WSL authority clone could not see it because the SQLite DB is local runtime substrate and the envelope was not exported into .ai/inbox-envelopes. This recreates invisible work between embodiments.

## Required Work

1. Inspect inbox submit/export/import/work-next and mutation-evidence behavior. 2. Choose the smallest coherent fix that preserves SQLite as local runtime substrate and Git-visible exports as portable handoff evidence. 3. Ensure inbox submit either exports portable envelope artifacts by default or returns an unavoidable exact next step for export/handoff. 4. Ensure inbox import/work-next/preflight surfaces local-only or mutation-evidence-only inbox submissions with bounded actionable warnings. 5. Document the inbox.db versus inbox-envelopes authority split. 6. Add focused tests for the chosen behavior. 7. Verify, report, prove criteria, review, close, commit, push.

## Non-Goals

Do not make .ai/inbox.db a Git-tracked authority artifact. Do not merge SQLite databases across embodiments. Do not create a background daemon. Do not silently mutate another clone or embodiment.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-28T21:58:29.736Z: context, required work, non-goals

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Inbox submit path either writes a portable exported envelope artifact by default or emits an unavoidable next-step warning with exact export command and target path
- [x] Inbox work-next/import path can detect embodiment-local inbox mutations that are present only as mutation evidence or local SQLite and report a bounded actionable warning
- [x] Docs explain that .ai/inbox.db is local runtime substrate and .ai/inbox-envelopes is the Git-visible handoff surface
- [x] Focused tests cover submission visibility or warning behavior
- [x] pnpm verify passes
