---
status: closed
closed: 2026-04-22
depends_on: [387]
---

# Task 389 — Campaign Charter + Knowledge Binding

## Assignment

Define the campaign-production charter behavior, required knowledge sources, and the missing-info escalation path.

## Context

The campaign-production charter is the intelligence layer of the email-marketing Operation. It reads campaign-request facts and produces either:
- A campaign brief (structured specification)
- A follow-up request (asking for missing information)

The charter must know about campaign standards, brand voice constraints, and segment conventions. It must not know about private customer data.

## Goal

Specify the charter behavior, knowledge binding, and escalation rules without implementing the charter runtime or prompts.

## Required Work

1. Define charter inputs:
   - `CharterInvocationEnvelope` containing campaign-request context facts.
   - Extracted fields: sender_email, subject, body, requested_campaign_name, requested_timing, mentioned_segments.
2. Define charter outputs (evaluation envelope):
   - `campaign_brief` outcome: structured brief with name, audience, content_summary, timing, approval_needed.
   - `request_info` outcome: list of missing fields + draft follow-up email.
   - `no_action` outcome: not a campaign request (residual).
3. Define required knowledge sources:
   - Campaign naming conventions (ops repo).
   - Brand voice guidelines (ops repo).
   - Segment definitions (ops repo — names only, no customer data).
   - Timing constraints (e.g., "campaigns need 3-day lead time") (ops repo).
4. Define missing-info escalation:
   - If required fields are missing, charter produces `request_info`.
   - Follow-up email is drafted as `send_reply` outbound.
   - Operator must approve the follow-up before sending.
   - If sender does not respond after N follow-ups, work item is marked `failed_terminal` with residual.
5. Define governance rules:
   - Charter may only propose `campaign_brief` or `send_reply`. No other action types.
   - Charter may not reference private customer data.
   - Charter may not assume Klaviyo API access.
6. Document knowledge injection pattern:
   - How knowledge sources are bound to the charter at evaluation time.
   - How ops repo knowledge is loaded into the `CharterInvocationEnvelope`.

## Execution Notes

### Specification Document

Created `docs/deployment/campaign-charter-knowledge-binding.md` with:
- Charter identity (`campaign_producer`, primary role, derive+propose authority)
- Charter inputs: `CharterInvocationEnvelope` with `CampaignRequestContextMaterialization` containing messages, extracted fields, prior evaluations, and knowledge sources
- Charter outputs: three outcomes with payload schemas:
  - `campaign_brief`: structured brief document (name, audience, content_summary, timing, approval_needed)
  - `request_info`: missing fields + draft follow-up via `send_reply`
  - `no_action`: not a campaign request
- Knowledge source catalog: 5 knowledge files (naming conventions, brand voice, segment definitions, timing constraints, campaign templates) all private ops repo
- Knowledge injection pattern: config binding → `CampaignRequestContextMaterializer` loading → system prompt injection
- Missing-info escalation: 3-follow-up limit before terminal escalation; foreman owns `failed_terminal` classification
- Governance rules: allowed actions (`campaign_brief`, `send_reply`, `no_action`), forbidden actions (all Klaviyo mutations, `send_new_message`, tools in v0)
- `campaign_brief` semantics: document-only, non-executable in v0; no sending/submission state
- Confidence requirements: high for brief, medium+ for reply, any for escalation
- Private data prohibition: no customer emails, PII, or Klaviyo customer lists
- v0/v1/deferred boundary table

### No Implementation

No code was added. The following runtime changes are documented as required for Task 391 implementation:
- Add `campaign_brief` to `AllowedActionSchema`
- Add `campaign_brief` to `OutboundActionType`
- Add `campaign_brief` payload validator to `payloadValidators`
- Add `campaign_brief` transition logic to `isValidTransition`
- Implement `CampaignRequestContextMaterializer`

### No Private Brand Data Created

All knowledge source contents are referenced by filename only. No actual brand voice, segment, or naming data is committed.

## Non-Goals

- Do not implement the charter runtime.
- Do not write OpenAI/Kimi prompts.
- Do not create private brand data.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Charter inputs and outputs are specified.
- [x] Knowledge sources are catalogued with ownership (public vs. private).
- [x] Missing-info escalation path is documented.
- [x] Governance rules restrict charter to allowed action types.
- [x] Knowledge injection pattern is documented.
