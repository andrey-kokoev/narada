---
status: closed
closed: 2026-04-22
depends_on: [386, 395]
---

# Task 387 — Email Marketing Operation Contract

## Assignment

Define the boundary contract for the email-marketing Operation: what it is, what it is not, which actions are allowed, which are forbidden, and which authority boundaries must hold.

## Context

This is Narada's first non-helpdesk Operation. The helpdesk Operation (mailbox vertical) proved the kernel pipeline. The email-marketing Operation must prove the kernel can host a second vertical without either collapsing them together or prematurely abstracting them.

The Operation watches inbound mail from designated colleagues, extracts campaign requests, drafts campaign briefs or follow-up responses, and routes Klaviyo work through governed intents.

## Goal

Produce `docs/deployment/email-marketing-operation-contract.md` that governs Tasks 388–393.

## Required Work

1. Define the Operation's Aim using SEMANTICS.md §2.14 vocabulary.
2. Define in-scope boundaries:
   - Source: mailbox delta sync from designated senders
   - Fact admission: `mail.message.discovered` + sender verification
   - Context formation: campaign-request thread grouping
   - Charter evaluation: campaign-production charter
   - Handoff: `campaign_brief` and `send_reply` action types
   - Effect execution: `send_reply` only in v0
   - Reconciliation: none required for v0 (campaign briefs are non-executable documents)
3. Define out-of-scope boundaries:
   - Klaviyo campaign publish/send
   - Customer list/segment mutation
   - Generic marketing automation framework
   - Real-time Klaviyo webhooks
   - Auto-approval of any campaign draft
4. Produce an authority table:
   | Concern | Owner | Allowed | Forbidden |
   |---------|-------|---------|-----------|
   | (fill in) | | | |
5. Define public/private data boundary.
6. Define Windows 11 v0 requirements.
7. Document no-overclaim language guide.

## Non-Goals

- Do not implement any code.
- Do not create Klaviyo API credentials.
- Do not define charter prompts or knowledge sources (that is Task 389).
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Contract document exists at `docs/deployment/email-marketing-operation-contract.md`.
- [x] Aim is stated in crystallized vocabulary.
- [x] Authority table covers source, fact, context, work, evaluation, decision, intent, execution, confirmation, observation.
- [x] Klaviyo publish/send is explicitly forbidden in v0.
- [x] Public/private data boundary is explicit.
- [x] No-overclaim language guide is included.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
