---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T05:55:20.541Z
criteria_proof_verification:
  state: unbound
  rationale: Docs/help verification, focused tests, typecheck, and build prove separation of paired Site bootstrap from adapter execution, owning-locus command posture, and authority-locus preservation.
closed_at: 2026-04-30T05:55:27.286Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Align Windows bootstrap docs with owning-locus adapter commands

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1113-1118-windows-bootstrap-correctness.md

## Goal

Update Windows onboarding documentation so `bootstrap-windows --execute` and adapter execution are not conflated.

## Context

Inbox observation env_ffeed7c4 reports that docs show `bootstrap-windows --execute` and also say adapter mutation requires explicit `--execute` at the owning locus, which can be read as the same flag even though implementation does not mutate adapters.

## Required Work

1. Update first-time Windows onboarding docs to distinguish paired Site bootstrap execution from adapter mutation execution.
2. Name current owning-locus commands when they exist, and mark missing adapter materializers as planned-only residuals when they do not.
3. Align docs with JSON fields introduced by the adapter plan clarification task.
4. Add or update docs verification so help output and documented commands stay aligned.

## Non-Goals

- Do not document commands that do not exist as executable.
- Do not imply Narada proper can mutate Windows Terminal, Komorebi, or YASB by convenience.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Docs clearly separate paired User/PC Site bootstrap from Windows Terminal, Komorebi, YASB, and runtime-binding adapter execution
- [x] Docs name exact existing follow-up commands or explicitly label residual commands as not yet implemented
- [x] Docs preserve authority-locus ownership for User Site, PC Site, and Narada proper
- [x] A docs/help verification command is recorded and passes
