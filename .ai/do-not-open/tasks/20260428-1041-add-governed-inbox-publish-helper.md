---
status: closed
amended_by: architect
amended_at: 2026-04-28T22:15:36.863Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T22:23:55.217Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented inbox publish, documented use, and verified with focused inbox tests, typecheck, command help, lifecycle export, and pnpm verify.
closed_at: 2026-04-28T22:24:11.488Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add governed inbox publish helper

## Chapter

canonical-inbox

## Goal

Provide a one-command operator path for publishing Git-visible inbox envelope artifacts after local submission or recovery: export portable artifacts, detect pending artifacts, optionally commit and push, and preserve .ai/inbox.db as local runtime substrate.

## Context

After inbox submit began writing portable artifacts by default and inbox doctor began reporting publication posture, the remaining ergonomic gap is a one-command operator path for publishing those artifacts from the embodiment that created them. The Windows envelope env_653b3570 showed the failure mode: local SQLite was updated, but the Git-visible handoff was not exported/committed/pushed.

## Required Work

1. Inspect inbox export/doctor and CLI registration patterns. 2. Add inbox publish as a governed helper with dry-run by default and explicit --execute for mutation. 3. In publish, run bulk/replay export, detect Git-visible inbox envelope artifacts, stage only .ai/inbox-envelopes, optionally commit, and optionally push. 4. Refuse to stage .ai/inbox.db. 5. Return bounded JSON/human output with exported count, pending artifact count, commit/push posture, and next steps. 6. Document the command and when to use it. 7. Add focused tests for dry-run and execute staging/commit behavior without remote side effects. 8. Verify, report, prove criteria, review, close, commit, push.

## Non-Goals

Do not auto-push by default. Do not track or merge .ai/inbox.db. Do not inspect other embodiments' SQLite databases. Do not replace inbox export/import; publish composes them for operator ergonomics.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-28T22:15:36.863Z: context, required work, non-goals

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A sanctioned inbox publish command exposes dry-run and execute modes for exporting
- [x] staging
- [x] committing
- [x] and optionally pushing inbox envelope artifacts
- [x] The command refuses to publish raw .ai/inbox.db and reports publication posture with bounded output
- [x] The command can recover pre-fix SQLite-only envelopes by running bulk/replay export before commit
- [x] Docs explain when to use inbox publish versus inbox submit/export/import
- [x] Focused tests and pnpm verify pass
