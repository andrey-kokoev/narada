---
status: closed
depends_on: [1262]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T05:15:14.219Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T05:15:14.737Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Remove legacy Narada architect cmd shortcut wrapper

## Chapter

narada-proper-crew-launch-intent-sequences

## Goal

Retire the temporary .cmd launch wrapper now that Narada proper has a repo-root PowerShell agent-start surface.

## Context

Task 1262 added the preferred command shape: .\narada.ps1 agent-start -Agent narada.architect -Runtime codex -Exec. The older .crew/agent-shortcuts/narada-architect.cmd wrapper is now legacy and should not remain as a suggested or tracked entrypoint.

## Required Work

Remove the tracked .crew/agent-shortcuts/narada-architect.cmd wrapper, update .narada/crew/README.md to name only narada.ps1 and the clickable .lnk aliases, verify narada.ps1 dry-run and shortcut readback, record audit/ledger evidence, and do not alter historical audit records except by superseding them.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] The tracked .crew/agent-shortcuts/narada-architect.cmd file is removed.
- [x] Current README no longer presents .cmd as an entrypoint.
- [x] Preferred PowerShell invocation is verified.
- [x] Shortcut readback still verifies the .lnk aliases.
- [x] A superseding audit/ledger event records the legacy retirement.
