---
status: closed
depends_on: []
amended_by: operator
amended_at: 2026-04-25T03:01:58.965Z
governed_by: task_review:a3
closed_at: 2026-04-25T03:21:39.163Z
closed_by: a3
---

# Bounded Agent Recommendation Output

## Goal

Prevent `task recommend --agent <id> --limit 1 --format json` from dumping hundreds of abstentions.

## Context

During the agent self-cycle probe, `narada task recommend --agent architect --limit 1 --format json` returned no primary recommendation but emitted 295 abstained candidates, producing a 1500-line transcript. That violates the output austerity and output-admission discipline already established for agent-facing CLI surfaces.

## Required Work

1. Make `--limit` or a separate abstention limit bound abstained output by default.
2. Include summary counts so bounded output cannot be mistaken for complete raw state.
3. Require explicit `--full` or equivalent for unbounded abstentions.
4. Preserve exact blocker detail for returned abstentions.
5. Add tests proving default bounded output and explicit full output.

## Non-Goals

Do not remove abstention diagnostics. Do not hide blocker details for returned abstentions.

## Execution Notes

1. Added bounded recommendation output metadata: total, returned, truncation flag, and effective limit for abstentions.
2. Added the same output-admission guard for alternatives, because live verification showed `--limit 1` still emitted 288 alternatives on the success path.
3. Added explicit `--full` opt-in and `--abstained-limit <n>` to `narada task recommend`.
4. Fixed the recommend CLI success path so JSON mode prints proper JSON only, instead of human messages plus a raw Node object dump.
5. Removed the recommend subcommand's local `--format` default so global `-f json` and local `--format json` are not accidentally overridden by `human`.
6. Added focused tests for bounded abstained JSON output, explicit full opt-in, and unknown-agent JSON shape.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @narada2/cli build` | Pass |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/task-recommend.test.ts --pool=forks -t 'abstained JSON|unknown'"` | Pass, 3/3 targeted |
| `narada task recommend --agent a1 --limit 1 --format json` | Bounded JSON: 0 alternatives returned out of 288, 1 abstention returned out of 9 |

## Acceptance Criteria

- [x] Default recommendation output cannot emit hundreds of abstentions.
- [x] JSON includes total abstained count, returned abstained count, truncation flag, and limit.
- [x] Human output is terse by default.
- [x] Full abstention dumps require explicit opt-in.
- [x] Focused test covers the previous large-output shape.



