---
status: closed
no_continuation_needed_rationale: First slice complete: read-only work availability surface exists as narada work-available; richer duty-loop/roster policy is separate.
closed_at: 2026-05-12T18:07:55.392Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Add read-only work availability surface

## Chapter

Canonical Inbox Promotions

## Goal

Provide a safe one-command read-only work availability surface so architect-loop and availability checks do not accidentally claim tasks.

## Context

Source inbox envelope: env_ddf1c8a6-dee7-430f-a7f0-99f0eda3033f

Source: agent_report:narada-andrey-kevin:mutating-work-next-accidental-claim

Envelope kind: observation

Summary: While checking what Bob would see next, I ran mutating work-next instead of a read-only inspection surface. It claimed task 89 for Bob before returning blocked on underspecified handoff. I released the claim, but the pathway shows that inspection and mutation remain too easy to confuse.

Evidence:
- Command returned primary task 89 with pulled=true and assignment to narada-andrey.Bob, then blocked because Required Work was placeholder text.
- Corrective action released task 89 back to opened state and committed release evidence in narada-andrey commit 23035d2.

Proposal:
- Make architect-loop and availability checks default to read-only posture, name mutating commands more explicitly, and require confirmation or an explicit --mutate flag when a command can claim work as another agent.

Recommendation: Add a safe one-command read-only work availability surface and tests proving it cannot mutate assignments.

## Required Work

0. Source summary: While checking what Bob would see next, I ran mutating work-next instead of a read-only inspection surface. It claimed task 89 for Bob before returning blocked on underspecified handoff. I released the claim, but the pathway shows that inspection and mutation remain too easy to confuse.
1. Read source inbox envelope env_ddf1c8a6-dee7-430f-a7f0-99f0eda3033f and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Added `workAvailableCommand`, a read-only wrapper over unified `workNextCommand` with `peek: true`.
- Registered a top-level `narada work-available --agent <id>` command that never accepts claim/start/exec flags.
- Preserved the existing explicit mutating paths:
  - `narada task pull-next --agent <id>`
  - `narada task work-next --agent <id>`
  - `narada work-next --agent <id>` without `--peek`
- Repaired adjacent authority/check portability found while executing this task:
  - temporary `.narada/site.json` authority admission is recognized by authority clone routing;
  - Windows paths are normalized as Windows paths when running on Windows;
  - git binary default is platform-aware instead of hardcoded to `/usr/bin/git`.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/work-next.test.ts test/lib/narada-proper-authority.test.ts test/commands/doctor.test.ts` passed, 45 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- `narada work-available --agent architect --format json` returned `surface=work_available` and `mutates=false`; it did not claim work and correctly reported the local roster blocker.

## Acceptance Criteria

- [x] Availability/work-next inspection has a non-mutating command path.
- [x] Tests prove the safe path cannot claim or assign work.
- [x] Existing mutating claim path remains explicit and separately named.
