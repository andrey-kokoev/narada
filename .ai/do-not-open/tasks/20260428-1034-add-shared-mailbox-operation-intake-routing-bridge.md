---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T21:15:31.634Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented operation_intake route config/loading, context strategy routing into target operation scope, missing-info draft_reply mapping helper, docs, focused tests, control-plane typecheck, and pnpm verify.
closed_at: 2026-04-28T21:15:36.431Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add shared mailbox operation-intake routing bridge

## Chapter

operation-intake-routing

## Goal

Support v0 routing from shared/client-service mailbox messages into subordinate operation charters, starting with email-marketing campaign intake that can produce governed draft replies or document-only campaign briefs without external marketing effects.

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

- [x] A configuration or runtime type can declare a mailbox scope as an intake source for subordinate operations
- [x] Operation-intent routing can select an operation-specific charter such as campaign_producer instead of default support_steward
- [x] Missing campaign inputs can map to a governed mailbox draft_reply shape
- [x] campaign_brief remains document-only and non-executable in v0
- [x] Implementation is generic enough for subordinate operations and not hard-coded only to Staccato
- [x] Focused tests and pnpm verify pass
