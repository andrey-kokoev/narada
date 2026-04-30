---
status: closed
amended_by: architect
amended_at: 2026-04-30T03:42:44.639Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T03:48:03.895Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-30T03:48:04.383Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Materialize Windows 11 substrate onboarding path

## Chapter

.ai/do-not-open/tasks/20260430-1105-1109-first-time-operator-ergonomics.md

## Goal

Provide an end-to-end Windows 11 first-time Operator onboarding path that creates or verifies User Site and PC Site, then guides or materializes Windows Terminal, Komorebi, YASB, and operator-surface substrate readiness through governed dry-run/execute boundaries.

## Context

The generic first-time Operator front door now exists, and Windows Operator Surface adapter posture is documented. What remains is the inhabited Windows 11 substrate path: a first-time Operator needs one coherent guide that creates or verifies the Windows User Site and PC Site, then handles Windows Terminal, Komorebi, YASB, WSL path translation, runtime binding, and substrate-specific operator-surface readiness without treating Narada proper as the authority locus for Windows-local mutation.

## Required Work

1. Inventory existing `narada sites bootstrap-windows`, `narada operator start`, operator-surface role/bind/send commands, Windows adapter posture docs, User Site/PC Site bootstrap outputs, and current Windows carrier scripts.
2. Design the Windows 11 onboarding front door as a composition of existing Site/bootstrap/readiness commands rather than a parallel bootstrap path.
3. Add or extend a command path that walks fresh Windows posture through User Site creation/verification, PC Site creation/verification, substrate checks, and role surface readiness.
4. Model Windows Terminal, Komorebi, and YASB actions as adapter plans with dry-run default, explicit execute, authority-locus reporting, and read-back evidence.
5. Integrate stale CLI/native dependency and WSL path translation diagnostics into the same bounded readiness output.
6. Add focused tests or fixtures for fresh posture, existing Sites, missing Komorebi, missing YASB, and dry-run adapter output.
7. Update first-time Operator and Windows adapter docs so the Operator sees one canonical Windows 11 path and exact unblock commands.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-30T03:42:44.639Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A single first-time Windows onboarding command or front-door path exists and composes User Site bootstrap, PC Site bootstrap, substrate readiness checks, and operator-surface role setup
- [x] The path detects or guides installation/readiness for Windows Terminal, Komorebi, YASB, PowerShell execution policy posture, WSL path translation, and Narada shim/CLI readiness
- [x] All adapter mutations are dry-run by default and require explicit execution; output names the authority locus for each mutation
- [x] The command reports exact unblock commands for missing Komorebi, missing YASB, missing Windows Terminal profile support, missing runtime binding, and stale CLI/native dependency state
- [x] The path emits bounded evidence for Site creation/readiness, adapter plan/read-back, and residual manual steps without raw SQLite or direct task-file inspection
- [x] Focused tests or fixtures cover fresh Windows posture, existing User/PC Sites, missing Komorebi, missing YASB, and dry-run adapter plan output
