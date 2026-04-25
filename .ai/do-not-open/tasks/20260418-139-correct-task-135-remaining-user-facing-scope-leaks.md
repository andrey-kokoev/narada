# Task 139: Correct Task 135 Remaining User-Facing Scope Leaks

## Why

Task 135 moved the main shaping commands to `<operation>`, but the user-facing surface is still not clean.

Review found that Narada still teaches the internal word `scope` in places users directly encounter:

- interactive CLI prompts still ask for `Scope ID`
- CLI docs still say `Scope ID`
- setup output still reports `scope(s)` instead of `operation(s)`

This means the repo still violates its own terminology rule:

- users should work with **operations**
- `scope` remains internal

## Findings Being Corrected

### 1. Interactive config still exposes `Scope ID`

`packages/layers/cli/src/commands/config-interactive.ts` still prompts:

- `Scope ID (e.g. email address):`
- `Scope ID is required`

That is direct user-facing leakage of the internal term.

### 2. CLI README still teaches `Scope ID`

`packages/layers/cli/README.md` still documents interactive setup as prompting for:

- `Scope ID (e.g., mailbox email address)`

That keeps teaching the wrong product-language surface.

### 3. Setup summary still reports `scope(s)`

`packages/ops-kit/src/commands/setup.ts` still returns:

- `Setup complete for X scope(s): ...`

That summary should say `operation(s)`.

## Goal

Finish Task 135 properly by removing the remaining user-facing `scope` wording from the shaping/setup surface.

## Required Outcomes

### 1. Interactive prompts speak in `operation` language

Update interactive config prompts and validation messages so the user-facing text no longer says `Scope ID`.

Use wording that matches the operation model.

### 2. CLI docs stop teaching `scope`

Update the CLI package README and any nearby user-facing command docs so they describe the same surface language as the CLI itself.

### 3. Setup summaries prefer `operation`

User-facing setup summaries should say `operation(s)`, not `scope(s)`.

### 4. Preserve internal `scope_id`

Do not rename internal config fields, code variables, or storage surfaces that correctly use `scope_id`.

## Deliverables

- interactive CLI prompt text no longer says `Scope ID`
- CLI README no longer teaches `scope` as a user-facing term
- setup summary says `operation(s)`
- internal `scope_id` usage remains unchanged

## Definition Of Done

- [ ] interactive user prompts no longer expose `Scope ID`
- [ ] CLI docs no longer teach `scope` to users
- [ ] setup summary uses `operation(s)` instead of `scope(s)`
- [ ] internal/config/runtime `scope_id` terms remain intact

## Notes

This is a narrow corrective task for the unfinished user-surface portion of Task 135.

It should not reopen the correct internal boundary:

- user-facing term: `operation`
- internal term: `scope`
