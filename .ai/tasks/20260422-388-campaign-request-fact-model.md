---
status: closed
closed: 2026-04-22
depends_on: [387]
---

# Task 388 — Campaign Request Fact Model

## Assignment

Define the canonical fact model for campaign requests extracted from inbound email.

## Context

The email-marketing Operation admits mail facts from designated senders. Not all mail facts are campaign requests. The fact model must distinguish campaign-request mail from other mail, and it must define what canonical data is extracted from a campaign request.

## Goal

Define the fact types, payload shapes, and extraction rules that transform inbound email into campaign-request facts.

## Required Work

1. Define `mail.message.discovered` fact reuse:
   - Same fact type as helpdesk vertical.
   - Different admission rule: sender must be on `campaign_request_senders` allowlist.
2. Define `campaign.request.discovered` fact type (optional enrichment):
   - Extracted fields: sender_email, subject, body_text, requested_campaign_name, requested_timing, mentioned_segments
   - Derived by a transform step after mail fact admission.
3. Define context formation strategy:
   - Group by `conversation_id` (thread).
   - Context is a campaign request thread.
   - One work item per open context.
4. Define fact payload JSON schema for `campaign.request.discovered`.
5. Document extraction rules:
   - Plain-text body is canonical (HTML is stripped).
   - Subject line is scanned for campaign name hints.
   - Body is scanned for timing words ("by Friday", "next week", "ASAP").
   - Mentioned segments are extracted via simple keyword matching (v0) or NLP (v1).
6. Document what happens to non-campaign mail from allowed senders:
   - Admitted as `mail.message.discovered` but not promoted to `campaign.request.discovered`.
   - No work item opened.
   - Optionally logged as residual.

## Non-Goals

- Do not implement extraction code.
- Do not train or deploy an NLP model.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Fact types are defined with payload schemas.
- [x] Context formation strategy is documented.
- [x] Extraction rules are explicit and bounded.
- [x] Non-campaign mail handling is documented.
- [x] Document references the operation contract (Task 387).

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
