---
status: opened
amended_by: architect
amended_at: 2026-04-29T17:16:42.943Z
---

# Require approval and effect handoff closure for mailbox readiness

## Chapter

Mailbox Runtime Readiness

## Goal

Close the readiness gap where a mailbox Site can pass sync/evaluation smoke but remain non-operational because pending approval cannot be approved or refused into an outbound draft/effect through a governed operator path.

## Context

Inbox envelope env_9cac23a7-2f47-42c3-86f0-786a9339c87a reports that the Staccato client-service Site reached runtime_smoke_passed for mailbox sync/admission/evaluation/draft proposal, but the first real use case remained blocked because pending_approval could not be approved into an outbound draft through a governed operator path. Readiness must cover the full approval/effect handoff loop, not only sync and evaluation.

## Required Work

1. Inspect existing approval, foreman decision, outbound draft, doctor, and mailbox runtime readiness surfaces. 2. Add or specify a governed operator command/path to approve or refuse pending foreman decisions into outbound draft/effect handoff. 3. Update readiness vocabulary to distinguish sync_smoke_passed, evaluation_smoke_passed, draft_effect_smoke_passed, pending_approval_path_ready, full_runtime_ready, and blocked_missing_approval_path. 4. Update mailbox/operation doctor or readiness report so missing approval/effect handoff path blocks full readiness. 5. Add test coverage for a safe clarification draft_reply with uncertainty: pending approval should be approvable into a draft for operator review, not sent. 6. Require evidence/read-back for created draft fields: non-empty to, subject, and reply_to_message_id. 7. Link or document Staccato's blocked-upstream case as motivating evidence without mutating the Staccato Site. 8. Run pnpm verify and targeted tests for affected surfaces.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T17:16:42.943Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Readiness states distinguish sync smoke evaluation smoke draft effect smoke pending approval path ready full runtime ready and blocked missing approval path
- [ ] A governed operator command or path exists or is specified to approve or refuse pending foreman decisions into outbound draft/effect handoff
- [ ] Mailbox or operation doctor reports approval and effect handoff readiness rather than overstating runtime readiness
- [ ] Clarification draft reply with uncertainty is covered as a safe pending approval to draft creation path
- [ ] not send
- [ ] Evidence/read-back requirements include non-empty to subject and reply_to_message_id for created drafts and source inbox envelope is routed
