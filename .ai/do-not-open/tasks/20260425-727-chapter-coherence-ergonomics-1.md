---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T22:21:47.331Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T22:21:48.784Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 727 — Fix Human Output For Evidence Range Assertion

## Goal

Make `narada task evidence assert-complete <range>` produce readable human/default output instead of `[object Object]`.

## Context

The JSON result is correct, but default human invocation currently admits an object directly to the global emitter. This breaks the operator surface even though machine semantics are coherent.

## Required Work

1. Ensure the command emits a readable success message in default/human mode.
2. Ensure failure output remains bounded and readable.
3. Avoid duplicating formatter output through the global object emitter.
4. Add regression coverage for default/human output shape.

## Non-Goals

- Do not change evidence verdict semantics.
- Do not make evidence list unbounded.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Default invocation no longer prints `[object Object]`.
- [x] Human success output includes the range and checked task count.
- [x] Human failure output includes a concise incomplete-task table.
- [x] JSON output remains unchanged.
