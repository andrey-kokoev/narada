---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T04:16:30.903Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T04:16:31.046Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 790 — Extract backup and restore command registration

## Goal

Move backup, restore, backup-verify, and backup-ls command construction out of main.ts into a dedicated registrar without changing command semantics or output.

## Context

main.ts is being reduced to composition. Backup surfaces are administrative operators and should have a single command registration owner.

## Required Work

1. Create a dedicated backup/restore command registrar under packages/layers/cli/src/commands.
2. Move backup, restore, backup-verify, and backup-ls Commander construction from main.ts into that registrar.
3. Preserve all options, defaults, action handlers, exit-code behavior, and existing output format behavior.
4. Update main.ts to import and invoke the registrar only.

## Non-Goals

- Do not redesign backup semantics.
- Do not change backup archive format.
- Do not normalize unrelated command families in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] main.ts no longer directly constructs backup, restore, backup-verify, or backup-ls commands.
- [x] The new registrar owns the complete backup/restore command family.
- [x] Focused help or smoke checks show the command names and options remain available.
- [x] Typecheck/build succeeds.
