---
status: opened
amended_by: architect
amended_at: 2026-04-30T17:27:23.498Z
---

# Add compact inbox submit output for architect loops

## Chapter

Architect Loop Output Austerity

## Goal

Make routine inbox submission output compact by default or via a first-class architect-loop mode, avoiding repeated full payload echo in chat transcripts.

## Context

Inbox envelope env_cd01e2e9-7d54-45d6-9ebc-79202be70a87 reports that `narada inbox submit` echoes the full submitted payload plus delivery metadata. Routine architect loops need status, envelope id, artifact coordinates, warnings, and next steps, while full payload echo should remain explicit debug output.

## Required Work

1. Inspect inbox submit, submit-observation, publish/export, human/json formatting, and architect-loop usage paths.
2. Define compact output shape for routine inbox submit: status, envelope_id, artifact/export path if available, warnings, and next_steps only.
3. Move full payload echo behind explicit verbose/full-json/debug mode while preserving machine-readable access when requested.
4. Ensure compact output is safe to paste into chat without repeating submitted payload text.
5. Add tests for compact default or compact mode, full/debug mode, JSON stability, and no payload echo in compact output.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-30T17:27:23.498Z: required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Routine inbox submit can return compact output without full payload echo.
- [ ] Compact output includes status, envelope_id, artifact coordinates when available, warnings, and next_steps.
- [ ] Full payload echo remains available only through explicit verbose/full/debug mode.
- [ ] Human and JSON/compact-json behavior is documented or discoverable in help.
- [ ] Tests prove compact output omits submitted payload body while full mode retains it.
