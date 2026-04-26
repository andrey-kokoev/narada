---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T05:25:44.843Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T05:25:45.240Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 822 — Name command output kinds in shared CLI helpers

## Goal

Make finite command and long-lived command output authority explicit instead of relying on scattered process/console conventions.

## Context

The previous chapter extracted shared silent context and formatter-backed result helpers, but long-lived commands and finite nonzero exits are still informal exceptions. This task should add shared helper names that encode the distinction without changing command behavior.

## Required Work

1. Add a shared helper for finite command result emission that can emit the formatted result and apply the exit code without duplicating process.exit branches.
2. Add a shared helper for long-lived command startup output so serve commands use a named exception surface rather than direct ad hoc console.log startup lines.
3. Keep the helpers small and registrar-oriented; do not redesign all CLI formatting.
4. Preserve JSON/human output behavior for existing finite commands.

## Non-Goals

- Do not migrate deep command implementation files such as sync.ts, integrity.ts, backup-ls.ts, or usc-init.ts.
- Do not start long-lived servers during verification.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Shared helper names distinguish finite result emission from long-lived process startup notices.
- [x] No command behavior changes are introduced beyond equivalent output routing.
- [x] Typecheck passes for @narada2/cli.
