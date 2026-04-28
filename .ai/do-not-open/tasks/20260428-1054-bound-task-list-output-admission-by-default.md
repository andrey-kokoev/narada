---
status: opened
amended_by: architect
amended_at: 2026-04-28T23:44:03.213Z
---

# Task 1054 — Bound task list output admission by default

## Chapter

cli-output-admission

## Goal

Make `narada task list` output bounded by default or require explicit unbounded admission, while preserving machine-readable workflows through explicit flags.

## Context

Builder reported inbox envelope `env_c3e9ab46-26b8-4d1b-9036-2d5b2442c416`: running raw `narada task list` emitted roughly 2.9k lines because the command has `--range` but no `--limit` or bounded default. This repeats the CLI output admission failure pattern: read surfaces can flood the Operator transcript even when the caller intended a compact task check.

## Required Work

1. Inspect the `task list` command implementation and tests.
2. Add a bounded default for human/auto output, or add an explicit `--limit` with a safe default.
3. Preserve deliberate full output through an explicit opt-in flag such as `--all`, `--unbounded`, or an explicit high `--limit`.
4. Ensure JSON output is still machine-usable but not accidentally massive by default.
5. Update command help and docs/examples so Operator-facing use is compact by default.
6. Add focused tests for default bounded output, explicit larger/unbounded output, and range interaction.
7. Run focused task-list tests and `pnpm verify`.

## Non-Goals

- Do not remove JSON output support.
- Do not hide tasks from explicit bounded/range queries.
- Do not change task lifecycle authority.
- Do not solve all large-output commands in this task; capture further offenders as follow-up observations/tasks.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] `narada task list` has bounded default output.
- [ ] A caller can explicitly request more/full output.
- [ ] Help text documents the output-admission behavior.
- [ ] Focused tests cover default bounded behavior and explicit expanded behavior.
- [ ] `pnpm verify` passes.
