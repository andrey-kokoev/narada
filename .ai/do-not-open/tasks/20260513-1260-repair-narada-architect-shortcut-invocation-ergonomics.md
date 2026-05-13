---
status: closed
depends_on: [1259]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T05:00:00.274Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T05:00:00.782Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Repair Narada architect shortcut invocation ergonomics

## Chapter

narada-proper-crew-launch-intent-sequences

## Goal

Make the Narada architect launch shortcut easy to invoke from both Explorer and PowerShell without quoting a path with spaces.

## Context

The real shortcut created in task 1259 works as a Windows shortcut but has a space-bearing filename. The operator attempted to run `.crew/agent-shortcuts/Narada Architect (codex).lnk` from PowerShell and hit path tokenization plus terminal launch friction. This repair should preserve the admitted launch carrier while adding ergonomic no-space entrypoints.

## Required Work

Add a no-space PowerShell/cmd invocation wrapper under .crew/agent-shortcuts and update shortcut materialization to also create a no-space .lnk alias. Verify the wrapper preflights without launching Codex, verify both shortcuts target the admitted carrier, update docs/audit/ledger, and do not change Desktop/Start Menu placement or import source Site/runtime state.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A no-space command wrapper exists for PowerShell invocation.
- [x] A no-space .lnk alias exists for Explorer clicking.
- [x] Verification proves wrapper no-launch preflight and shortcut readback.
- [x] Documentation shows the exact command-safe path.
- [x] No Desktop/Start Menu mutation, source Site import, operator-surface runtime copying, or native shell fallback is introduced.
