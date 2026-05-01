---
status: closed
closed_at: 2026-05-01T21:10:38.656Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add bounded architect next-obligation command

## Chapter

architect-loop-output-austerity

## Goal

Stop routine Architect loops from using broad compact workboard JSON when the needed answer is one bounded next obligation or review action.

## Context

Inbox envelope env_7fae8b6a-c46d-41c0-b236-43195c66eb0f reports a recurring CAPA: compact workboard still returned hundreds of lines and stale-dist warning text during routine architect-loop work. The broad dashboard is not a strict next-action packet and still burns context.

## Required Work

Add a bounded Architect-loop command or output mode that returns only the highest-priority next obligation, review, or routing action with a short reason and strict byte/line budget. Make broad workboard JSON opt-in for exploration, not the default Architect duty-loop probe. Separate diagnostics and stale-dist warnings from machine-readable result channels or summarize them into bounded fields. Add recurrence-aware CAPA handling or markers when previously reported ergonomics failures recur after mitigation.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Added `role-loop next-obligation` as the bounded Architect/role duty-loop probe.
   The command returns one packet containing action kind, selected ref, short
   reason, suggested command, bounded diagnostics, output-budget metadata, and
   explicit exploration commands.
2. Added `--recurrence-key` to mark repeated CAPA/ergonomics incidents as
   recurrence inside the bounded packet instead of creating another first-time
   observation shape.
3. Changed `role-loop next` so the compact workboard payload is no longer
   returned by default. It now returns `workboard_summary`; the fuller compact
   workboard is admitted only with explicit `--include-workboard` or by running
   `narada task workboard --view compact --format json`.
4. Kept diagnostics machine-safe: doctrine guard output is summarized into
   counts and one bounded next command; broad `blocked_or_hidden_work`,
   `architect_duty_loop`, and guidance arrays are not included in
   `next-obligation`.
5. Added focused tests in
   `packages/layers/cli/test/commands/role-loop.test.ts` for default workboard
   austerity, explicit workboard opt-in, bounded next-obligation output, JSON
   byte budget, and recurrence marker handling.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --dir packages/layers/cli exec vitest run test/commands/role-loop.test.ts --pool=forks` | Passed, 3/3 tests |
| `pnpm --filter @narada2/cli typecheck` | Passed |
| `pnpm --filter @narada2/cli build` | Passed |
| `narada test-run run --cmd-file /tmp/narada-1200-verification.cmd --task 1200 --timeout 120 --scope focused --requester builder --rationale "Verify bounded role-loop next-obligation command, explicit workboard exploration flag, typecheck, build, and CLI sample output."` | Passed, run `run_1777669739181_132i86`, command run `run_1777669739256_m7levh`, duration 34460 ms |

## Acceptance Criteria

- [x] There is a bounded next-obligation or architect-loop command whose default output fits a strict line/byte budget.
- [x] Broad workboard JSON remains available only through explicit exploratory flags or commands.
- [x] Diagnostics and warnings do not corrupt or bloat machine-readable result payloads.
- [x] Tests assert compact Architect-loop output remains under the configured output budget.
- [x] Recurring CAPA/ergonomics incidents can be marked as recurrence rather than appearing as first-time observations.
