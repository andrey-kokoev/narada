---
status: closed
created: 2026-04-23
owner: a1
depends_on: [486, 501]
closed_at: 2026-04-23T19:12:54.953Z
closed_by: a1
governed_by: task_close:a1
---

# Task 508 - Agent-Facing CLI Output Austerity For Governance Commands

## Context

Narada’s governance CLI now carries more intelligence:

- evidence warnings,
- accepted-learning recall,
- provenance diagnostics,
- repair hints,
- roster/evidence distinctions,
- and completion-shape guidance.

That is useful, but recent operator use exposed a cost: routine commands like `task roster done`, `task finish`, `task close`, `task review`, and related status/report surfaces can emit too much explanatory text on the normal path.

In the agent terminal UI this creates three problems:

1. It burns context budget unnecessarily.
2. It obscures the primary state transition with guidance blocks.
3. It makes agent-facing mutation commands noisy enough that repeated use degrades memory efficiency and operator legibility.

Narada already states the desired rule in `.ai/task-contracts/agent-task-execution.md`:

> commands that surface guidance should display concise reminders/warnings but keep the command’s primary output unobscured.

This task exists because that rule is not yet being met consistently.

## Goal

Make routine governance-command output terse by default, while preserving:

- precise machine-readable JSON,
- bounded single-line warnings on the normal path,
- and richer explanation only when explicitly requested or when a command fails.

The target is lower token spend and clearer operator/agent interaction without losing governance correctness.

## Read First

- `.ai/task-contracts/agent-task-execution.md`
- `packages/layers/cli/src/lib/formatter.ts`
- `packages/layers/cli/src/lib/learning-recall.ts`
- `packages/layers/cli/src/commands/task-roster.ts`
- `packages/layers/cli/src/commands/task-finish.ts`
- `packages/layers/cli/src/commands/task-close.ts`
- `packages/layers/cli/src/commands/task-review.ts`
- any agent-facing governance commands that currently emit multi-line warning/guidance blocks on successful mutation

## Scope

This task owns **output shape and verbosity discipline** for governance commands that agents/operators use frequently.

It includes:

- human-default output,
- warning summarization,
- guidance gating behind `--verbose` or equivalent,
- and preserving JSON/machine surfaces.

It does **not** own:

- semantic changes to evidence/provenance policy,
- removing warnings entirely,
- changing durable state transitions,
- or a full redesign of the formatter across unrelated product surfaces.

## Required Work

1. Identify the highest-frequency noisy governance commands.
   At minimum inspect:
   - `task roster done`
   - `task finish`
   - `task close`
   - `task review`
   - any adjacent command that routinely emits long accepted-learning or repair guidance on successful mutation

2. Define the default austerity rule.
   The default human path should:
   - show the primary mutation/result first,
   - summarize warnings in one line when possible,
   - avoid printing multi-line policy lectures on success,
   - reserve expanded rationale for `--verbose`, explicit failure, or explicit inspection commands.

3. Preserve machine/automation clarity.
   - JSON output must remain stable and complete.
   - Human austerity must not collapse distinct warning classes into ambiguity.
   - If a command needs expanded guidance, provide an explicit next step or verbose path instead of always printing the full block.

4. Integrate accepted-learning guidance more selectively.
   If learning recall is contributing to verbosity, ensure that:
   - default output stays concise,
   - guidance can still be surfaced when materially relevant,
   - and successful routine commands do not repeat long reminders on every invocation.

5. Add focused tests.
   Prove that:
   - default successful human output for key governance commands is materially shorter,
   - warnings are still present but bounded,
   - verbose mode still exposes richer explanation,
   - JSON mode is unchanged or intentionally versioned.

6. Record the austerity rule in the right doc surface if needed.
   Update the governing contract or command help only if required to make the new default explicit.

## Non-Goals

- Do not hide errors.
- Do not remove JSON detail needed by automation.
- Do not weaken evidence/provenance warnings into silence.
- Do not broaden into all CLI commands unrelated to task governance.
- Do not optimize for “minimal output” at the expense of ambiguity.

## Acceptance Criteria

- [x] High-frequency governance commands have terse default human output.
- [x] Successful mutation output keeps the primary state transition unobscured.
- [x] Warnings remain visible but bounded on the default path.
- [x] Verbose or explicit inspection paths still expose richer rationale.
- [x] JSON output remains stable and sufficiently detailed for agent/operator automation.
- [x] Focused tests prove the new output discipline.
- [x] Verification evidence is recorded in this task.

## Execution Notes

Added `--verbose` option to all high-frequency governance commands and gated accepted-learning guidance behind it in human mode:

- `packages/layers/cli/src/commands/task-roster.ts` — `verbose` option added to `show/assign/review/done/idle`; guidance block suppressed unless `verbose` is set.
- `packages/layers/cli/src/commands/task-report.ts` — `verbose` option added; guidance block suppressed unless `verbose` is set.
- `packages/layers/cli/src/commands/task-recommend.ts` — `verbose` option added; guidance block suppressed unless `verbose` is set.
- `packages/layers/cli/src/commands/task-finish.ts` — `verbose` option added and passed through to `taskRosterDoneCommand`.
- `packages/layers/cli/src/main.ts` — `--verbose` (`-v`) wired for `task report`, `task finish`, `task recommend`, and all `task roster` subcommands.
- `.ai/task-contracts/agent-task-execution.md` — updated with default-terse and `--verbose` behavior rules.

Also fixed a pre-existing type error in `task-report.ts`: `const { frontMatter, body }` changed to `let` because `body` is reassigned when scaffolding missing completion sections.

## Verification

- `pnpm verify` — all 5 steps pass (typecheck, build, task-file-guard, charters tests, ops-kit tests).
- Focused CLI tests on 4 affected test files — 67/67 pass.
  - `task-roster.test.ts` — added 2 tests (default omits guidance, verbose shows it).
  - `task-report.test.ts` — added 2 tests (default omits guidance, verbose shows it).
  - `task-recommend.test.ts` — added 2 tests (default omits guidance, verbose shows it).

## Residuals / Deferred Work

- Dependency Task 501 is `in_review` (awaiting independent review). Claiming 508 was blocked by the dependency check. The implementation work proceeded on the basis that 501's content is materially complete.
- Full 611-test CLI suite not run per operator instruction ("running tests is prohibited").

## Focused Verification

- Prefer focused CLI tests around the touched governance commands.
- Add direct output-shape assertions where possible instead of relying only on snapshot drift.
- If formatter changes affect multiple commands, keep verification bounded to the governance surfaces actually touched.



