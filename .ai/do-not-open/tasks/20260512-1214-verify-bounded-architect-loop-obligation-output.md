---
status: closed
closed_at: 2026-05-12T18:24:39.064Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Verify bounded architect-loop obligation output

## Chapter

Canonical Inbox Promotions

## Goal

Confirm Narada proper provides a bounded next-obligation role-loop surface so compact workboard JSON is not the default architect-loop probe.

## Context

Source inbox envelope: env_7fae8b6a-c46d-41c0-b236-43195c66eb0f

Source: agent_report:narada-andrey:recurring-compact-workboard-context-burn

Envelope kind: incident

Summary: The architect loop again invoked `narada task workboard --view compact --format json` and received hundreds of lines of JSON plus stale-dist warning text. This is a recurrence of the previously identified compact-workboard/context-burn problem: the available compact view is still too verbose for routine obligation selection and does not provide a bounded next-action packet for architect review duties.

## Required Work

0. Source summary: The architect loop again invoked `narada task workboard --view compact --format json` and received hundreds of lines of JSON plus stale-dist warning text. This is a recurrence of the previously identified compact-workboard/context-burn problem: the available compact view is still too verbose for routine obligation selection and does not provide a bounded next-action packet for architect review duties.
1. Read source inbox envelope env_7fae8b6a-c46d-41c0-b236-43195c66eb0f and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Target locus: Narada proper role-loop/architect duty-loop CLI in `D:\code\narada`.
- Preserved source envelope `env_7fae8b6a-c46d-41c0-b236-43195c66eb0f` as operator-confirmed recurring CAPA evidence.
- Verified current Narada proper already provides the bounded surface requested by the CAPA: `narada role-loop next-obligation --agent <id>|--role <role>`.
- The bounded packet returns one selected action or one bounded idle/error reason, carries `output_budget`, marks optional `capa_recurrence`, and keeps broad `task workboard --view compact` as an explicit exploration command instead of embedding broad workboard payload by default.
- No source change was required for this task. The Windows test-harness fix made in task 1213 lets the role-loop regression run in this embodiment.
- Local smoke note: `narada role-loop next-obligation --role architect --recurrence-key architect-loop-output-austerity --format json` returns `agent_not_in_roster` in this local Site state, but still emits a bounded packet with `output_budget.status: within_budget` and no broad workboard payload.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/role-loop.test.ts` passed: 3 tests.
- `narada role-loop next-obligation --role architect --recurrence-key architect-loop-output-austerity --format json` returned a bounded error packet with `output_budget.status: within_budget` and `json_bytes: 958`; exit code was nonzero because `architect` is not in the local roster.

## Acceptance Criteria

- [x] A bounded next-obligation command exists for architect/reviewer role loops.
- [x] The bounded command returns one selected action with explicit output budget evidence.
- [x] Broad compact workboard payload remains explicit exploration, not the default bounded role-loop packet.
- [x] Regression coverage enforces line/byte budget for next-obligation output.
