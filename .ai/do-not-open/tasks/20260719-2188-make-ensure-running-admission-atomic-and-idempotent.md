---
status: opened
depends_on: [2187]
---

# Make ensure-running admission atomic and idempotent

## Goal

Concurrent ensure-running requests for one agent admit exactly one launch and share one idempotent outcome

## Context

Covers finding 2 from the Site-and-Agent overview review. packages/layers/cli/src/commands/site-agent-launch-gateway.ts launch() does overview.read() then state check then launchCommand (read-then-launch). Two concurrent calls both observe stopped and both launch, producing duplicate concurrent sessions.

## Required Work

Serialize ensure-running per canonical agent id inside the gateway (single-flight lease map; a concurrent launch for the same agent joins the in-flight result). Re-validate runtime state inside the lease after the overview read and again before launching. Lease joiners receive the idempotent outcome (launched or reused with the same session_id). Failed launches release the lease so retry works. Degraded and ambiguous refusals unchanged.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Concurrency test: N parallel launch calls for the same agent cause exactly one workspaceLaunchCommand invocation and identical idempotent responses
- [ ] A launch racing a session that appears mid-flight returns reused
- [ ] A failed launch releases the lease and a later retry can launch
- [ ] Gateway tests green; tsc clean
