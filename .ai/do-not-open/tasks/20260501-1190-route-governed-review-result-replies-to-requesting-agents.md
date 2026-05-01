---
status: claimed
---

# Route governed review result replies to requesting agents

## Chapter

task-review-reply-obligation

## Goal

Make task review closure produce a durable, governed reply to the requesting agent when a review request originated from an agent or operator-surface identity.

## Context

Inbox envelope env_d2e1a171-2b3b-4a36-8c45-a76c91691bf4 reports that narada-andrey task 79 was reviewed and closed correctly, but the requesting builder was not notified until the Operator corrected the reviewer. The lifecycle state was correct while inhabited coordination remained incomplete.

## Required Work

Extend task review or review-request handling so a review decision records and routes a review_result message to the requester. The reply must include task number, verdict, review id or commit reference when available, blocking findings, residual notes, and next expected action. Delivery should prefer an admitted operator-surface message when the requester is a reachable operator-surface identity, fall back to canonical inbox or queued delivery when direct OSM is unavailable, and record the delivery or deferral as evidence. Expose the obligation in output so reviewers know whether reply routing succeeded, deferred, or failed.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A review request from an agent or operator-surface identity creates a durable reply obligation when the review is completed.
- [ ] Review result replies include task number, verdict, review/evidence id, blocking findings, residual notes, and next expected action.
- [ ] Reply routing uses admitted channels only and records OSM, inbox, queued, deferred, or failed delivery evidence.
- [ ] Review CLI output reports the reply obligation status without requiring reviewers to remember a manual follow-up.
- [ ] Regression coverage proves a review-request envelope can be closed and produces a governed reply artifact or explicit deferral.
