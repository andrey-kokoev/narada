---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T00:39:15.706Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-28T00:39:16.260Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Implement Canonical Inbox file-drop intake

## Chapter

Canonical Inbox File-Drop Intake

## Goal

Add a governed inbox file-drop intake command so human-authored dated numbered files or folders can be dry-run inspected and admitted as canonical inbox envelopes without treating .ai/inbox-envelopes as the human authoring surface.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] CLI exposes narada inbox ingest-files with --from
- [x] default dry-run
- [x] and explicit --admit mutation.
- [x] Intake accepts items named YYYYMMDD-NNN-slug as either files or folders.
- [x] Folder intake reads README.md
- [x] message.md
- [x] or intent.md as the body and treats other child files as supporting attachments metadata.
- [x] Repeated admits are idempotent by stable file_drop source_ref and content digest.
- [x] Tests cover dry-run
- [x] file admit
- [x] folder admit
- [x] invalid item rejection
- [x] and duplicate admit skipping.
