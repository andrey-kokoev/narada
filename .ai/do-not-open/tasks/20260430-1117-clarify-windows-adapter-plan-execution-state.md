---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T05:52:37.621Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, typecheck/build, and bounded CLI readback prove adapter_plan planned_only semantics, non-execution under Site bootstrap --execute, owning-locus command hints, and non-misleading dry-run/execute output.
closed_at: 2026-04-30T05:52:45.804Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Clarify Windows adapter plan execution state

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1113-1118-windows-bootstrap-correctness.md

## Goal

Remove ambiguity where adapter_plan entries appear executable under `--execute` while mutation_performed remains false and execute_required remains true.

## Context

Inbox observation env_ffeed7c4 reports that with `--execute`, adapter_plan entries become `dry_run:false` while no adapter mutation occurs. Adapter plans should be planned_only or split into owning-locus execution commands.

## Required Work

1. Inspect adapter_plan schema emitted by `bootstrap-windows`.
2. Rename or augment fields so planned-only topology is visibly distinct from executed adapter mutations.
3. Add owning-locus command hints for Windows Terminal profile, Komorebi rule, YASB button, and runtime binding execution.
4. Ensure JSON and human output cannot imply adapter mutation occurred when it did not.
5. Add tests for dry-run, --execute paired Site bootstrap, and future owning-locus adapter command hints.

## Non-Goals

- Do not implement full adapter mutation in this task unless already available through an owning-locus command.
- Do not collapse Narada proper planning authority into Windows User/PC mutation authority.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] adapter_plan output distinguishes planned_only from executed mutations
- [x] --execute does not mark adapter entries as executed when only paired Site bootstrap ran
- [x] Output includes owning-locus command hints for each adapter mutation class
- [x] Tests prove dry-run and execute output are not misleading
