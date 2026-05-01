---
status: closed
closed_at: 2026-05-01T21:22:48.186Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Fail closed or evidence stale CLI governance mutations

## Chapter

governance-embodiment-freshness

## Goal

Prevent governance mutations from silently continuing through stale CLI dist without an explicit accepted posture and durable evidence.

## Context

Inbox envelope env_c5efbc89-6760-4f9c-89eb-5159d1452ac4 reports that a narada-andrey task review command warned that CLI dist was stale relative to source, then continued and closed a task. That may be pragmatic, but governance mutation behavior can diverge from current source or doctrine if the embodiment is stale.

## Required Work

Update the Narada shim/governance command posture so governance mutations fail closed by default when CLI dist is stale, or require an explicit allow-stale-governance flag with a reason. If stale continuation is allowed, mutation evidence must record stale_dist=true, the stale source path(s), command identity, acceptance reason, and freshness posture. Read-only governance commands may remain available if they clearly report stale substrate posture. Workboard/preflight surfaces should expose stale governance posture compactly before review, close, claim, route, or other lifecycle mutations.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Updated the installed `narada`/`narada-mcp` shim template to check CLI,
   task-governance, and control-plane source freshness against their dist
   markers before execution.
2. Kept read-only governance inspection available under stale dist, including
   `task workboard`, while emitting compact embodiment-readiness diagnostics.
3. Made stale authority mutations fail closed unless
   `NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION=1` is paired with
   `--allow-stale-governance <reason>` or
   `NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION_REASON`.
4. Stripped the shim-only `--allow-stale-governance` flag before invoking the
   CLI so Commander command parsers do not receive an unknown option.
5. Propagated accepted stale-governance posture through environment variables
   and recorded it in task-lifecycle and inbox mutation evidence under
   `replay_payload.governance_freshness`.
6. Added focused regression coverage for stale implementation blocking,
   read-only stale admission, stale authority mutation reason requirement,
   accepted stale mutation environment propagation, and mutation-evidence
   freshness recording.

## Verification

| Command | Result |
| --- | --- |
| `bash -n scripts/install-narada-shim.sh` | Passed |
| `node scripts/test-narada-shim-posture.mjs` | Passed |
| `pnpm --dir packages/layers/cli exec vitest run test/commands/task-lifecycle-mutation-evidence.test.ts --pool=forks` | Passed, 5/5 tests |
| `pnpm --filter @narada2/cli typecheck` | Passed |
| `pnpm --filter @narada2/control-plane build` | Passed |
| `pnpm --filter @narada2/task-governance build` | Passed |
| `pnpm --filter @narada2/cli build` | Passed |
| `narada test-run run --cmd-file /tmp/narada-1201-verification.cmd --task 1201 --timeout 180 --scope focused --requester builder --rationale "Verify stale governance mutation fail-closed posture, explicit stale continuation reason, mutation-evidence freshness posture, typecheck, and build chain."` | Passed, run `run_1777670456421_55ql8g`, command run `run_1777670456627_8tvlch`, duration 31152 ms |

## Acceptance Criteria

- [x] Governance mutations do not silently continue on stale CLI dist by default.
- [x] Any allowed stale governance mutation requires an explicit reason and records stale_dist evidence.
- [x] Mutation evidence records stale source paths, command identity, acceptance reason, and freshness posture.
- [x] Read-only commands expose stale substrate posture without blocking safe inspection.
- [x] Regression coverage proves stale CLI dist blocks or records accepted stale posture for review/close-style mutations.
