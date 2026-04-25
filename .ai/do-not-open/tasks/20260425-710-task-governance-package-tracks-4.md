---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T19:57:56.251Z
criteria_proof_verification:
  state: unbound
  rationale: Proved through task finish orchestration; verification evidence remains separately admitted.
closed_at: 2026-04-25T19:57:58.252Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 710 — Repair Task Governance Local Development Build Ergonomics

## Goal

Make package extraction pleasant and non-surprising for agents and operators during local development.

## Context

CLI shims consume @narada2/task-governance through package exports, so source edits may require a package build before CLI tests see changes. This is coherent for consumers but rough for local development.

## Required Work

1. Document or implement the canonical local development path after task-governance source edits.
2. Ensure workspace build order is reliable and fast enough for normal verification.
3. Add a small guard, script, or README note that prevents stale dist confusion when CLI tests consume the package.
4. Review the earlier failed expectation around task allocate --count and decide whether multi-allocation is needed or should be explicitly out of scope.

## Non-Goals

- Do not introduce a custom build system.
- Do not make verify unbounded or slow by including every exhaustive task-governance test.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A developer or agent can tell exactly what to run after changing @narada2/task-governance.
- [x] Stale package dist confusion is either prevented mechanically or documented in the package contract.
- [x] pnpm verify remains green and includes the package fast suite.
- [x] The task allocate --count mismatch is either fixed as a small ergonomic improvement or recorded as deliberately unsupported.


