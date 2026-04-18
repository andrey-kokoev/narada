# Task 135: Materialize 124-D Rename CLI Scope-Id To Operation

## Source

Derived from Task 124-D in `.ai/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md`.

## Why

User-facing Narada language should be `operation`, not `scope`.

`scope_id` is a correct internal/config term, but exposing `<scope-id>` in the CLI leaks implementation language into the product surface and contradicts the repo's terminology guidance.

## Goal

Rename user-facing CLI argument names and messages from `<scope-id>` to `<operation>` while preserving `scope_id` internally.

## Required Outcomes

### 1. CLI arguments become user-facing

Commands such as:

- `preflight`
- `inspect`
- `explain`
- `activate`

should use `<operation>` instead of `<scope-id>` in their CLI declaration/help.

### 2. Output text stops teaching `scope`

User-facing output and errors should prefer `operation` unless the context is explicitly internal/debugging.

### 3. Internal terms remain internal

Config fields, DB fields, and internal code may continue using `scope_id`.

## Deliverables

- CLI argument surface updated to `operation`
- user-facing command output aligned with that terminology
- internal `scope_id` usage preserved where appropriate

## Definition Of Done

- [ ] user-facing CLI args no longer expose `<scope-id>`
- [ ] user-facing command text prefers `operation`
- [ ] internal/config/runtime `scope_id` usage remains intact where needed

