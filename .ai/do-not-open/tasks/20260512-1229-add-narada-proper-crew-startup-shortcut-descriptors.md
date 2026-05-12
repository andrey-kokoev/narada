---
status: closed
closed_at: 2026-05-12T20:50:02.414Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Add Narada proper crew startup shortcut descriptors

## Goal

Create minimal repo-local .narada/crew shortcut descriptors for launching narada.architect and future agents through governed startup posture.

## Context

Operator asked whether .narada/crew shortcuts are available after Windows-native Site substrate self-adoption. Existing capability was descriptor-only package/candidate; no .narada/crew surface existed.

## Required Work

Add target-local descriptor files under .narada/crew, preserve MCP-only/no-runtime-import posture, record audit evidence, and do not mutate PC shortcuts or launch processes.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Added repo-local `.narada/crew` descriptor surface for governed crew startup launch intents/templates.
- The surface is descriptor-only. It does not create `.lnk` files, start processes, mutate PC-locus state, copy operator-surface runtime state, or use native shell fallback.
- Added a Narada proper architect startup request descriptor and a reusable agent startup request template.
- Recorded admission and audit evidence under `.narada`.

## Verification

- Validated JSON descriptor/audit files with PowerShell `ConvertFrom-Json`.
- Verified `.narada/crew` exists and contains README, architect descriptor, and template.

## Acceptance Criteria

- [x] A .narada/crew README explains the governed shortcut posture
- [x] At least one narada.architect startup request descriptor exists
- [x] A reusable template for other agents exists
- [x] Audit records no PC shortcut/process/runtime state mutation
