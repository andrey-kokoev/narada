# Task 278: Correct Task 256 Daemon Vertical Neutrality Gaps

## Chapter

Product Surface Coherence

## Context

Task 256 materially improved daemon vertical neutrality, but review found one concrete acceptance miss and one artifact overclaim.

## Findings

### 1. Missing Filesystem Example

Task 256 required commented examples of timer, webhook, **and filesystem** scopes in `packages/layers/control-plane/config.example.json`.

The file currently contains timer and webhook examples, but no filesystem example.

### 2. Task Notes Overclaim Completeness

Task 256 execution notes say:

- `config.example.json` includes non-mail scope examples

That is directionally true, but not sufficient for the task’s stated requirement because filesystem is missing.

## Goal

Finish the config-example neutrality work and make the task artifact exact.

## Required Work

### 1. Add Filesystem Scope Example

Update `packages/layers/control-plane/config.example.json` with a commented filesystem scope example that is coherent with existing timer/webhook examples.

It should include at minimum:

- `scope_id`
- `root_dir`
- `sources: [{ "type": "filesystem" }]` or the correct filesystem source shape used by Narada
- `context_strategy`
- minimal `scope`, `normalize`, `runtime`, `charter`, and `policy`

Do not invent a source shape if the kernel already expects a more specific filesystem-source structure; inspect existing vertical expectations first.

### 2. Correct Task 256 Notes

Update `.ai/tasks/20260420-256-daemon-vertical-neutrality.md` so execution notes explicitly mention timer, webhook, and filesystem examples once all three are present.

If any part remains deferred, record that honestly instead of claiming completion.

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Non-Goals

- Do not redesign daemon source initialization.
- Do not add new vertical projector logic.
- Do not run broad/full test suites.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] `config.example.json` includes a filesystem scope example in addition to timer and webhook.
- [x] The filesystem example uses a coherent source/config shape.
- [x] Task 256 execution notes no longer overclaim the config-example requirement.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
