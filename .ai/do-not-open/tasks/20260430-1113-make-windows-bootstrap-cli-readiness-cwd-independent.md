---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T05:34:16.028Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-30T05:34:16.269Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Make Windows bootstrap CLI readiness cwd-independent

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1113-1118-windows-bootstrap-correctness.md

## Goal

Fix Windows bootstrap CLI readiness so it resolves Narada CLI build/readiness from the actual Narada installation or shim authority, not from the caller's current working directory.

## Context

Inbox observation env_ffeed7c4 reports that `narada_cli_readiness` currently resolves `packages/layers/cli/dist/main.js` from `process.cwd()`, which can falsely report CLI not ready when `bootstrap-windows` is run from a User Site, PC Site, or arbitrary directory.

## Required Work

1. Locate the Windows bootstrap CLI readiness implementation and the shim/source/dist freshness helpers.
2. Replace cwd-relative readiness with an installation-aware or command-path-aware resolution.
3. Preserve bounded output: report source path, resolved dist path, status, and repair command.
4. Add tests proving readiness is correct when invoked from Narada proper, a User Site directory, a PC Site directory, and an unrelated directory.

## Non-Goals

- Do not hide stale dist state.
- Do not require raw filesystem inspection by the Operator.
- Do not make User/PC Sites own Narada proper build authority.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] bootstrap-windows CLI readiness no longer depends on process.cwd() being Narada proper
- [x] Readiness output names the resolved CLI/shim/dist coordinates and exact repair command when stale or missing
- [x] Tests cover invocation from Narada proper, User Site, PC Site, and unrelated cwd
- [x] No raw SQLite or direct task-file reads are needed to verify readiness
