---
status: closed
depends_on: [1260]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T05:06:46.954Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T05:06:47.592Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Adapt architect shortcut to Narada proper agent-start carrier

## Chapter

narada-proper-crew-launch-intent-sequences

## Goal

Replace direct Codex invocation with a Narada proper agent-start carrier modeled on the working narada-andrey command shape.

## Context

The operator showed the working User Site launch shape: .\narada-andrey.ps1 agent-start -Agent narada-andrey.Robin -Runtime codex -Exec. Narada proper should reuse the pattern, not copy User Site runtime state. Current shortcut carrier verifies launch intent sequence but invokes codex directly.

## Required Work

Create a minimal Narada proper agent-start carrier that validates narada.architect, materializes a local agent start event, sets NARADA_AGENT_ID and NARADA_AGENT_START_EVENT_ID, and spawns Codex with stdio inheritance in exec mode. Update Start-NaradaArchitect.ps1 to call the carrier instead of invoking codex directly. Add dry-run/no-launch verification and audit evidence. Do not import narada-andrey runtime state, checkpoint history, rosters, operator-surface runtime state, PC state, secrets, or credentials.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Narada proper has a local tools/agent-start/start-agent.mjs carrier with dry-run JSON and exec mode.
- [x] Start-NaradaArchitect.ps1 invokes the local carrier with narada.architect --runtime codex rather than direct codex.
- [x] No-launch verification materializes or previews local start evidence without spawning Codex.
- [x] Shortcut readback still points at the Narada proper launch carrier.
- [x] No narada-andrey runtime state is imported.
