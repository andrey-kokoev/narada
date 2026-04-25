---
status: closed
depends_on: []
amended_by: operator
amended_at: 2026-04-25T03:02:03.728Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:25:44.939Z
closed_by: a3
---

# Agent Next Surface Result Shape Consistency

## Goal

Make `peek-next`, `pull-next`, and `work-next` return consistent structured results in JSON mode.

## Context

`narada task peek-next --agent architect --format json` returned a JSON string, not a JSON object. `pull-next` and `work-next` returned plain errors for the same missing agent. Agent-facing tools need machine-readable result shapes with stable status codes and reasons.

## Required Work

1. Define canonical result envelopes for `peek-next`, `pull-next`, and `work-next`.
2. Return `status`, `agent_id`, `action`, `primary`, `reason`, and `next_step` where applicable.
3. Ensure errors are emitted as structured JSON when `--format json` is requested.
4. Align exit-code policy: read-only no-work results should not look like runtime failures, while invalid agent identity should be explicit.
5. Add tests for no-work, missing-agent, blocked, and available-task cases.

## Non-Goals

Do not change task recommendation scoring. Do not implement execution dispatch beyond the current work-next packet surface.

## Execution Notes

1. Defined a stable JSON envelope for next-task surfaces with `status`, `agent_id`, `action`, `primary`, `reason`, and `next_step` where applicable.
2. Extended missing-agent errors to include `agent_id`, `action`, and `primary: null` across `peek-next`, `pull-next`, and `work-next`.
3. Added a shared no-work result helper so empty results are distinct from invalid-agent failures: `status: "empty"`, `reason: "no_admissible_task"`, and success exit code.
4. Added `primary` aliases for available-task and work-packet JSON results while preserving the existing `task` and `packet` fields.
5. Normalized secondary error envelopes for pull/work failures with `agent_id`, `action`, and `primary: null`.
6. Added focused tests for missing-agent, no-work, and available-task shapes across all three next-task commands.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/cli build` | Pass |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/task-next.test.ts --pool=forks"` | Pass, 14/14 |

## Acceptance Criteria

- [x] `peek-next --format json` never returns a bare string.
- [x] `pull-next --format json` and `work-next --format json` use the same error envelope for invalid agent identity.
- [x] No-work is distinct from invalid-agent.
- [x] Human output remains concise.
- [x] Focused tests cover all three next-task commands.



