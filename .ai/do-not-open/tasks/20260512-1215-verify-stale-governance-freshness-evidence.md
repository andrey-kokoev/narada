---
status: closed
closed_at: 2026-05-12T18:26:08.467Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Verify stale governance freshness evidence

## Chapter

Canonical Inbox Promotions

## Goal

Confirm governance mutations do not silently lose stale CLI dist posture and that mutation evidence records explicit stale-dist acceptance details.

## Context

Source inbox envelope: env_c5efbc89-6760-4f9c-89eb-5159d1452ac4

Source: agent_report:narada-andrey:stale-cli-governance-warning

Envelope kind: observation

Summary: While reviewing narada-andrey task 81, the Narada CLI emitted: "narada CLI dist is stale relative to source ... continuing with installed dist for governance command". A governance mutation then succeeded. Continuing may be pragmatic, but it is risky: lifecycle review/closure should either run through a freshness-approved embodiment or record an explicit operator/agent acceptance of stale-dist posture.

Evidence:
- Command: narada task review 81 --agent narada-andrey.Kevin --verdict accepted_with_notes ...
- Warning: narada CLI dist is stale relative to source: /home/andrey/src/narada/packages/layers/cli/src/commands/operator-surface.ts
- Warning: continuing with installed dist for governance command; set NARADA_SHIM_ALLOW_STALE_GOVERNANCE=0 to block
- The command closed task 81 successfully despite stale dist warning.

## Required Work

0. Source summary: While reviewing narada-andrey task 81, the Narada CLI emitted: "narada CLI dist is stale relative to source ... continuing with installed dist for governance command". A governance mutation then succeeded. Continuing may be pragmatic, but it is risky: lifecycle review/closure should either run through a freshness-approved embodiment or record an explicit operator/agent acceptance of stale-dist posture.
1. Read source inbox envelope env_c5efbc89-6760-4f9c-89eb-5159d1452ac4 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Target locus: Narada proper task/inbox mutation evidence freshness posture in `D:\code\narada`.
- Preserved source envelope `env_c5efbc89-6760-4f9c-89eb-5159d1452ac4` as external observation evidence.
- Inspected `packages/layers/cli/src/lib/governance-freshness.ts`, `packages/layers/cli/src/lib/mutation-evidence-writer.ts`, and `packages/layers/cli/test/commands/task-lifecycle-mutation-evidence.test.ts`.
- No source change was needed. Current mutation evidence can include `replay_payload.governance_freshness` with `stale_dist`, `accepted`, source paths, command identity/class, acceptance reason, and freshness posture.
- Explicit non-claim: this increment verifies recorded stale-governance acceptance evidence. It does not newly change the CLI/shim to fail closed by default for stale governance commands.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/task-lifecycle-mutation-evidence.test.ts` passed: 5 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- Relevant regression: `records accepted stale governance freshness posture in mutation evidence`.

## Acceptance Criteria

- [x] Task/inbox mutation evidence can include stale_dist freshness posture.
- [x] Evidence records source paths, command identity/class, acceptance reason, and freshness posture when stale governance execution is admitted.
- [x] The task records that fail-closed-by-default is not newly claimed in this increment.
