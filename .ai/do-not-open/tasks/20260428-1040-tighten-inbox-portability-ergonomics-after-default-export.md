---
status: closed
amended_by: architect
amended_at: 2026-04-28T22:07:42.686Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T22:12:59.042Z
criteria_proof_verification:
  state: unbound
  rationale: All criteria satisfied: inbox doctor reports publication posture, docs explain SQLite-only recovery and normal handoff loop, export is described as bulk/replay, slow inbox verification posture is documented, focused tests and pnpm verify passed.
closed_at: 2026-04-28T22:13:10.391Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Tighten inbox portability ergonomics after default export

## Chapter

canonical-inbox

## Goal

Complete the ergonomics arc after making inbox submit write portable artifacts by default: surface uncommitted/unpushed envelope artifacts, clarify inbox export as bulk/replay export, document recovery for pre-fix stranded SQLite-only envelopes, and reduce or isolate slow inbox verification posture.

## Context

After task 1039, new inbox submissions write portable envelope artifacts by default. Remaining friction: older Windows-local SQLite-only envelopes still need manual export; submit cannot force commit/push; import/work-next coherently cannot see another embodiment's ignored SQLite; inbox export is now a bulk/replay command; the focused inbox command suite is slow.

## Required Work

1. Inspect inbox doctor/delivery and Git posture helpers. 2. Add bounded detection of uncommitted or unpushed .ai/inbox-envelopes artifacts to an appropriate inspection surface, preferably inbox doctor. 3. Clarify inbox export help/docs as bulk/replay export. 4. Document recovery for pre-fix SQLite-only envelopes and the normal submit -> artifact -> commit/push -> import loop. 5. Add focused tests for publication-warning behavior and/or docs anchors. 6. If test speed cannot be fixed safely in this arc, document the slow test posture and preserve bounded invocation. 7. Verify, report, prove criteria, review, close, commit, push.

## Non-Goals

Do not auto-commit or auto-push inbox artifacts. Do not inspect or merge other embodiments' ignored SQLite databases. Do not create a daemon or cross-clone watcher. Do not delete existing inbox export/import commands.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-28T22:07:42.686Z: context, required work, non-goals

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Inbox doctor or a nearby inspection surface reports uncommitted or unpushed .ai/inbox-envelopes artifacts with bounded actionable guidance
- [x] Canonical Inbox docs explain recovery for pre-fix SQLite-only envelopes and the submit artifact commit/push/import loop
- [x] inbox export help/docs describe bulk or replay export rather than the normal post-submit path
- [x] Verification guidance or tests isolate slow inbox-focused test posture
- [x] Focused tests and pnpm verify pass
