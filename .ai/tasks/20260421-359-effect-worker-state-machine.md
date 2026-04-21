---
status: completed
depends_on: [358]
---

# Task 359 — Effect Worker State Machine

## Agent Instructions

This task is self-standing. Before editing, read:

- `docs/deployment/cloudflare-effect-execution-authority-contract.md`
- `.ai/tasks/20260421-358-364-cloudflare-effect-execution-boundary.md`

Execution mode: direct implementation is acceptable if the write set stays inside `packages/sites/cloudflare/`, this task file, and focused tests. Use planning mode if you need to change shared chapter semantics, outbound command states used by earlier tasks, or the effect-execution contract.

Do not call Graph. Do not send email. Do not create or invoke a mutating external adapter here. Task 360 owns the adapter boundary. Task 362 owns confirmation. This task only builds the worker state machine and durable attempt records.

## Context

Cloudflare Site has operator approval and outbound command records, but no worker that attempts external effects.

This task implements the internal state machine before binding to a live mutating API.

## Goal

Add an approved-only effect worker state machine for Cloudflare Site.

## Required Work

### 1. Define eligible commands

The worker must only consider commands in an explicitly approved state, such as `approved_for_send`.

It must reject or skip:

- pending
- draft_ready
- failed_terminal
- confirmed
- any unrecognized state

### 2. Add execution attempt records

Add or reuse durable records for:

- attempt id
- outbound id
- action type
- started_at
- finished_at
- status
- external reference if produced
- error class/message if failed

### 3. Add state transitions

Implement transitions such as:

```text
approved_for_send -> sending -> submitted
approved_for_send -> sending -> retry_wait
approved_for_send -> sending -> failed_terminal
```

Do not transition to `confirmed`; Task 362 owns confirmation.

### 4. Tests

Add focused tests proving:

- unapproved commands are not executed
- approved commands create execution attempts
- worker failure records retry/terminal state honestly
- submitted does not imply confirmed

## Non-Goals

- Do not call Graph.
- Do not send email.
- Do not confirm effects.
- Do not decide whether a command is semantically allowed beyond the explicit `approved_for_send` eligibility gate.
- Do not let `pending` or `draft_ready` commands execute.
- Do not implement retry scheduler beyond state recording unless necessary.
- Do not create derivative task-status files.

## Suggested Verification

Use focused tests first. Suggested shape:

```bash
pnpm --filter @narada2/cloudflare-site exec vitest run test/unit/effect-worker-state-machine.test.ts
pnpm verify
```

## Acceptance Criteria

- [ ] Worker considers only approved commands.
- [ ] Execution attempts are durable.
- [ ] Submitted and confirmed remain distinct.
- [ ] Failure states are explicit.
- [ ] Focused tests cover eligible and ineligible commands.
- [ ] No derivative task-status files are created.
