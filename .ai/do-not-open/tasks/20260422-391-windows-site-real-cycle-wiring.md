---
status: closed
closed: 2026-04-22
depends_on: [388, 389, 390]
---

# Task 391 — Windows Site Real-Cycle Wiring

## Assignment

Identify and document what must exist for a Windows 11 Site to run the email-marketing Operation Cycle end-to-end.

## Context

The Windows Site materialization (Tasks 371–377) proved a bounded Cycle for the helpdesk vertical. The email-marketing Operation is a different vertical running on the same substrate. Task 391 determines what substrate changes, if any, are needed.

## Goal

Produce a document listing the wiring required for Windows to host the email-marketing Operation, and identify any gaps between what exists and what is needed.

## Required Work

1. Inventory existing Windows Site capabilities:
   - Cycle runner: FileLock, sync, derive, evaluate, handoff, reconcile, trace, health
   - Source adapter: Graph delta sync
   - Charter runtime: fixture/mock evaluator
   - Effect worker: `executeApprovedCommands` with `send_reply`
   - Operator surface: `narada status --site`, `narada doctor --site`, `narada ops`
   - Notification: `LogNotificationAdapter`, `WebhookNotificationAdapter`
2. Identify gaps for email-marketing Operation:
   - Context formation strategy: need `CampaignRequestContextFormation` (new)
   - Charter binding: need campaign-production charter registered in config (new)
   - Action type: need `campaign_brief` in allowed actions (new)
   - Effect adapter: `send_reply` exists; Klaviyo adapter does not (v1)
   - Reconciliation: helpdesk uses `GraphLiveObservationAdapter`; marketing needs none in v0
3. Determine substrate changes:
   - Does the Cycle runner need modification? (Likely no — same 8-step pipeline)
   - Does the Site schema need new tables? (Likely no — reuse `outbound_commands`)
   - Does the CLI need new commands? (Possibly `narada show-campaign-brief`)
4. Document Windows 11-specific requirements:
   - Site root directory structure
   - Credential binding for Graph API + Klaviyo API key
   - Task Scheduler interval recommendation
   - Log retention for campaign audit trails
5. Produce a gap table:
   | Gap | Exists? | Needed For | Resolution |
   |-----|---------|------------|------------|
   | (fill in) | | | |

## Non-Goals

- Do not implement Windows Site changes.
- Do not create Task Scheduler scripts.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Existing Windows Site capabilities are inventoried.
- [x] Gaps for email-marketing Operation are identified.
- [x] Substrate changes are assessed (runner, schema, CLI).
- [x] Windows 11-specific requirements are documented.
- [x] Gap table exists with at least 8 entries.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
