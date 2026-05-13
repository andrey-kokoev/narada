---
status: closed
depends_on: [1261]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T05:10:40.698Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T05:10:41.198Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Add Narada proper PowerShell agent-start surface

## Chapter

narada-proper-crew-launch-intent-sequences

## Goal

Provide a repo-root PowerShell surface matching the working narada-andrey.ps1 agent-start invocation style.

## Context

The operator wants to avoid .cmd wrappers and use the same ergonomic shape as `.
arada-andrey.ps1 agent-start -Agent narada-andrey.Robin -Runtime codex -Exec`. Narada proper has a local tools/agent-start/start-agent.mjs carrier from task 1261 but no repo-root PowerShell wrapper.

## Required Work

Add `narada.ps1` at the Narada proper repo root with an `agent-start` command that delegates to tools/agent-start/start-agent.mjs. Update Start-NaradaArchitect.ps1 and docs to use `.
arada.ps1 agent-start -Agent narada.architect -Runtime codex -Exec`. Verify dry-run/no-launch and command shape. Preserve no source Site import and no operator-surface runtime copying.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Repo root `narada.ps1` exists and supports `agent-start -Agent <id> -Runtime codex -Exec`.
- [x] `narada.ps1 agent-start -Agent narada.architect -Runtime codex -DryRun -Json` returns the local agent-start dry-run result.
- [x] Start-NaradaArchitect.ps1 delegates through narada.ps1 rather than node directly.
- [x] Documentation names the PowerShell invocation as the preferred command surface.
- [x] No narada-andrey runtime state, operator-surface runtime copying, or source Site import is introduced.
