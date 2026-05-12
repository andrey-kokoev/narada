---
status: closed
closed_at: 2026-05-12T19:35:25.761Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Migrate Narada proper to Windows-native setup posture

## Chapter

Narada Proper Windows Native Migration

## Goal

Record and implement the Windows-native direction for Narada proper: prefer Windows-native carriers, config, CLI shims, MCP surfaces, and Site setup paths; treat WSL crossings as future-only unless explicitly admitted.

## Context

Operator selected full Windows-native setup posture after task 1211 showed the older WSL-to-Windows EE-MCP premise was stale for current work.

## Required Work

Inventory current WSL-dependent assumptions and Windows-native surfaces; record the canonical Windows-native authority/config posture; identify smallest implementation slices for Windows-native Site creation and MCP/runtime carriers; preserve no raw WSL crossing and no source Site runtime import.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Recorded Narada proper Windows-native setup posture under `.narada/admission/decisions/windows-native-setup-posture.md`.
- Recorded audit evidence under `.narada/audit/task-1223-windows-native-posture.json`.
- Superseded task 1211 for current work: WSL-to-Windows EE-MCP is not required for the Windows-native setup path.
- Preserved boundary: future WSL runtime work must be admitted separately and raw WSL-to-Windows shell fallback remains denied.
- No source Site runtime state, task/inbox histories, rosters, checkpoints, operator-surface runtime, PC-locus state, secrets, or credentials were imported.
- Next smallest implementation slice: create a Windows-native Site setup carrier/task surface using Narada repo package descriptors and admitted Windows transports, dry-run first, with live mutation behind explicit apply authority.

## Verification

- `narada task lifecycle status --format json` showed task 1211 as the sole blocked/deferred item before supersession.
- `narada task unblock 1211 --agent narada.architect --evidence "operator_direct:2026-05-12:windows-native-migration-selected" ...` reopened task 1211 for superseded closure.
- `narada task evidence admit 1211 --by narada.architect --format json` admitted evidence `ear_1211_1778614410089_ujk9dw`.
- `narada task close 1211 --by narada.architect --mode operator_direct ... --format json` closed task 1211 as superseded for current work.
- Posture decision and audit files were created under `.narada`.

## Acceptance Criteria

- [x] Narada proper has a durable Windows-native migration posture.
- [x] WSL-to-Windows EE-MCP is not treated as required for current work.
- [x] Next implementation slice is named with authority boundaries.
