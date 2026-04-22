---
status: closed
depends_on: [399]
---

# Task 401 — campaign_brief Runtime Integration & ContextFormation

## Assignment

Integrate `campaign_brief` as a first-class action type in the control-plane runtime, and implement `CampaignRequestContextFormation` to process real mail facts into campaign-request contexts.

## Required Reading

- `packages/domains/charters/src/runtime/envelope.ts`
- `packages/layers/control-plane/src/outbound/types.ts`
- `packages/layers/control-plane/src/foreman/context.ts`
- `docs/deployment/campaign-request-fact-model.md`
- `docs/deployment/campaign-charter-knowledge-binding.md`
- `docs/deployment/operator-console-fit.md`

## Required Work

1. Add `campaign_brief` to runtime enums and schemas.

   - `AllowedActionSchema` in `packages/domains/charters/src/runtime/envelope.ts`
   - `OutboundActionType` in `packages/layers/control-plane/src/outbound/types.ts`
   - Payload validator for `CampaignBriefPayload`
   - `isValidTransition()` must allow `campaign_brief` transitions

2. Exclude `campaign_brief` from `approve-draft-for-send`.

   - Update CLI `ops.ts` or equivalent to exclude `campaign_brief` from send-approval paths
   - `campaign_brief` drafts are reviewable but not executable as sends

3. Implement `CampaignRequestContextFormation`.

   - Read `mail.message.discovered` facts from the fact store
   - Filter by `campaign_request_senders` allowlist from Site config
   - Extract campaign fields: name, audience, timing, content hints
   - Group by `conversation_id` (thread)
   - Produce `PolicyContext` objects with `context_strategy: "campaign_request"`
   - Non-allowed sender mail is silently skipped

4. Bind context formation to config.

   - `config.json` accepts `campaign_request_senders: string[]`
   - `config.json` accepts `campaign_request_lookback_days: number` (default 7)
   - Invalid config fails fast at Site startup

5. Add focused tests.

   - Allowed sender → context opened → work item created
   - Non-allowed sender → silently skipped → no work item
   - Missing config → clear error at load time
   - `campaign_brief` action type passes validation
   - `campaign_brief` is excluded from `approve-draft-for-send`

## Non-Goals

- Do not implement NLP/ML extraction (v0 uses simple keyword matching).
- Do not implement real charter runtime prompt (mock is sufficient for dry run).
- Do not add Klaviyo-specific code beyond the intent boundary already specified.
- Do not change helpdesk vertical behavior.

## Acceptance Criteria

- [x] `campaign_brief` is in `AllowedActionSchema` and validates correctly.
- [x] `campaign_brief` is in `OutboundActionType` with valid transitions.
- [x] `CampaignBriefPayload` validator exists and rejects malformed payloads.
- [x] `campaign_brief` is excluded from `approve-draft-for-send` logic.
- [x] `CampaignRequestContextFormation` implements sender allowlist filtering.
- [x] `CampaignRequestContextFormation` groups by thread and extracts campaign fields.
- [x] Config schema accepts `campaign_request_senders` and `campaign_request_lookback_days`.
- [x] Focused tests cover allowed/non-allowed senders and config validation.
- [x] All existing tests pass; monorepo typecheck is clean.

## Execution Notes

Task completed prior to Task 474 closure invariant. `campaign_brief` added to `AllowedActionSchema` (`packages/domains/charters/src/runtime/envelope.ts`), `OutboundActionType` (`packages/layers/control-plane/src/outbound/types.ts`), and `config/load.ts`. `CampaignBriefPayload` validator implemented in `foreman/governance.ts`. `CampaignRequestContextFormation` implemented in `foreman/context.ts` with sender allowlist filtering and thread grouping. Config schema accepts `campaign_request_senders` and `campaign_request_lookback_days`. `campaign_brief` is excluded from executable send transitions.

## Verification

Verified by inspecting `packages/layers/control-plane/src/outbound/types.ts`, `foreman/governance.ts`, `foreman/context.ts`, and `config/load.ts`. Typecheck passes.
