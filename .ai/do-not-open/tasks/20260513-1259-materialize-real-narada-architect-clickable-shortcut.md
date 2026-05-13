---
status: closed
depends_on: [1258]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T04:54:18.607Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T04:54:19.070Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Materialize real Narada architect clickable shortcut

## Chapter

narada-proper-crew-launch-intent-sequences

## Goal

Create a bounded PC-locus Windows shortcut for launching narada.architect from the existing Narada proper crew launch intent sequence.

## Context

The operator admitted PC-locus shortcut materialization for Narada proper architect launch, bounded to the existing .narada/crew launch intent sequence. Prior tasks 1254-1258 established descriptor sequence, verifier, carrier packet, and request artifact. This task may create a real .lnk under the repo-local .crew/agent-shortcuts directory and a launch carrier script, but must preserve no source Site import and no native shell fallback.

## Required Work

Create a Windows PowerShell launch carrier script that verifies the Narada proper architect launch intent sequence, verifies the durable request artifact, records launch evidence, then starts Codex in D:\code\narada through the installed codex shim. Create a repo-local Windows .lnk pointing at that carrier. Add verification for shortcut target/arguments and carrier dry-run/preflight. Record audit/ledger evidence. Do not copy operator-surface runtime state, mutate Desktop/Start Menu, import source Site state, or create arbitrary shell fallback paths.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A real clickable .lnk exists under .crew/agent-shortcuts for Narada architect.
- [x] The .lnk target points to the admitted Narada proper launch carrier script.
- [x] The carrier verifies the launch intent sequence and request artifact before invoking Codex.
- [x] Audit evidence records shortcut path, target, arguments, verification, rollback, and explicit non-claims.
- [x] No Desktop/Start Menu mutation, source Site import, operator-surface runtime copying, or native shell fallback is introduced.
