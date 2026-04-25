---
status: closed
depends_on: []
amended_by: operator
amended_at: 2026-04-25T03:01:51.791Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:16:40.475Z
closed_by: a3
---

# Agent Identity Bootstrap For Self Cycle

## Goal

Make a named agent able to enter Narada's task cycle without failing on missing roster identity.

## Context

When acting as agent `architect`, `narada task pull-next --agent architect` and `narada task work-next --agent architect` failed with `Agent architect not found in roster`. `peek-next` did not fail the same way; it returned `"No admissible next task for architect"`. A real agent needs a canonical bootstrap or registration path before recommendation, peek, pull, and work surfaces are useful.

## Required Work

1. Define the canonical behavior when `--agent <id>` is absent from roster.
2. Decide whether next-task surfaces should auto-register, return a typed `agent_not_found` result, or point to a sanctioned registration command.
3. Implement the selected behavior consistently across `recommend`, `peek-next`, `pull-next`, and `work-next`.
4. Ensure the behavior is safe: no implicit capability escalation, no accidental task claim for an unknown identity.
5. Add focused tests for missing-agent behavior.

## Non-Goals

Do not redesign principal runtime identity. Do not infer capabilities from the agent name.

## Execution Notes

1. Selected typed rejection, not auto-registration, as the canonical unknown-agent behavior. This avoids implicit capability escalation and accidental claims by names that have not been admitted to the roster.
2. Added shared unknown-agent handling in `task-next.ts` for `peek-next`, `pull-next`, and `work-next`, returning `status: "error"`, `reason: "agent_not_found"`, the agent id, action name, and a sanctioned next step.
3. Added the same `agent_not_found` guard to `task-recommend.ts` when `--agent` targets a non-roster identity, preventing the prior giant abstention dump for an unknown agent.
4. Updated `main.ts` so JSON-mode failures for `recommend`, `peek-next`, `pull-next`, and `work-next` emit the full structured result instead of collapsing to a bare stderr string.
5. Preserved safe mutation boundaries: unknown agents still cannot claim work, and known legacy markdown-only tasks are backfilled into SQLite before `pull-next` writes assignment records.
6. Added focused tests for `architect`-style unknown-agent handling across next-task and recommendation surfaces.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/cli build` | Pass |
| `narada task peek-next --agent architect --format json` | Structured `agent_not_found` JSON |
| `narada task pull-next --agent architect --format json` | Structured `agent_not_found` JSON |
| `narada task work-next --agent architect --format json` | Structured `agent_not_found` JSON |
| `narada task recommend --agent architect --limit 1 --format json` | Structured `agent_not_found` JSON; no abstention dump |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/task-next.test.ts --pool=forks"` | Pass, 14/14 |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/task-recommend.test.ts --pool=forks -t unknown"` | Pass, 1/1 targeted |

## Acceptance Criteria

- [x] Missing-agent behavior is consistent across agent-facing next-task surfaces.
- [x] The response names the sanctioned next step for registration or admission.
- [x] No unknown agent can claim work without an admitted roster/principal record.
- [x] JSON output is structured, not a bare string.
- [x] Focused tests cover the `architect`-style unknown agent case.



