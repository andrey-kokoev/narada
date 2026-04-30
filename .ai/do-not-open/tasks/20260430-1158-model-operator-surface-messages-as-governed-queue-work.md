---
status: opened
---

# Model operator-surface messages as governed queue work

## Goal

Turn operator-surface messaging from best-effort text delivery into typed, tracked, admitted, and reconciled message work.

## Context

Source inbox envelope env_fa1dbd0c-2e46-42af-9930-9a73a7c6a7e0 proposes a stronger operator-surface message queue/intake/execution process for nudges, notes, handoffs, review requests, CAPAs, questions, and command intents.

## Required Work

1. Define operator-surface message as a governed crossing: message intent to addressed envelope to delivery attempt to recipient intake to execution or admission to reply or report to reconciliation. 2. Specify the message record fields: sender identity, recipient identity, Site plane, kind, expected response posture, delivery status, intake status, evidence links, and reply linkage. 3. Distinguish delivery_attempt, delivered_to_surface, admitted_by_recipient, acted, replied, and reconciled lifecycle states. 4. Add or specify recipient intake/work-next commands so agents can process queued messages without relying only on visible terminal text. 5. Define authority rules for which roles/loci may send which message kinds to which recipients. 6. Use the model to prevent informal completion claims or review requests from being mistaken for lifecycle truth. 7. Add first implementation slice or explicit follow-up task split if the full queue is too large.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Docs or code model operator-surface messages as typed governed records, not only text sent to windows.
- [ ] Message lifecycle distinguishes delivery from recipient admission and action.
- [ ] Recipient intake or work-next path is specified or implemented.
- [ ] Reply/report linkage to source message is specified or implemented.
- [ ] The model preserves task lifecycle authority and prevents message claims from becoming lifecycle truth.
