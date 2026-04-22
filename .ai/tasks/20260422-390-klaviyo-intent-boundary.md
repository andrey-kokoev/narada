---
status: completed
closed: 2026-04-22
depends_on: [387]
---

# Task 390 — Klaviyo Intent Boundary

## Assignment

Define the durable intent boundary for Klaviyo campaign operations: which actions are allowed as intents, which are forbidden, how credentials are bound, and how observation confirms execution.

## Context

The email-marketing Operation will eventually need to create campaigns in Klaviyo. In v0, the Operation drafts campaign briefs but does not execute Klaviyo mutations. Task 390 defines the boundary so that v1 can add Klaviyo execution without redesign.

## Goal

Produce a contract document defining the Klaviyo intent boundary, credential seam, and observation model.

## Required Work

1. Define allowed intent types:
   | Intent Type | v0 | v1 | Description |
   |-------------|----|----|-------------|
   | `klaviyo_campaign_create` | ❌ | ✅ | Create a draft campaign in Klaviyo |
   | `klaviyo_campaign_update` | ❌ | ⚠️ | Update campaign content (deferred) |
   | `klaviyo_campaign_read` | ❌ | ✅ | Read campaign state for reconciliation |
   | `klaviyo_campaign_send` | ❌ | ❌ | Forbidden in all versions without explicit operator policy |
   | `klaviyo_list_read` | ❌ | ✅ | Read list/segment metadata (no customer data) |
   | `klaviyo_list_update` | ❌ | ❌ | Forbidden — customer data mutation |
2. Define the `KlaviyoEffectAdapter` interface:
   - `createCampaign(brief): CampaignResult`
   - `getCampaignStatus(campaignId): CampaignStatus`
   - Error classification: terminal vs. retryable.
3. Define credential binding:
   - `KLAVIYO_API_KEY` env binding or Windows Credential Manager entry.
   - `KLAVIYO_PRIVATE_API_KEY` for read operations.
   - Fail-closed if credentials missing.
4. Define observation/confirmation model:
   - Campaign creation is `submitted` when Klaviyo accepts the API call.
   - Campaign creation is `confirmed` when reconciliation observes the campaign exists via `getCampaignStatus`.
   - No self-confirmation: API success ≠ confirmed.
5. Define rate-limit and backoff behavior:
   - Klaviyo API rate limits: respect `Retry-After` or default exponential backoff.
   - Per-command retry limit: max 5 `failed_retryable` before `failed_terminal`.
6. Document v0 posture:
   - v0 does NOT implement `KlaviyoEffectAdapter`.
   - v0 uses `campaign_brief` action type which is non-executable (document-only).
   - v0 operator manually enters approved briefs into Klaviyo UI.
   - v1 adds the adapter and makes `klaviyo_campaign_create` a real intent.

## Non-Goals

- Do not implement Klaviyo API calls.
- Do not create real Klaviyo credentials.
- Do not write adapter code.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Intent type table exists with v0/v1/forbidden classification.
- [x] `KlaviyoEffectAdapter` interface is specified.
- [x] Credential binding is documented.
- [x] Observation/confirmation model follows Narada confirmation semantics (API success ≠ confirmed).
- [x] Rate-limit and backoff behavior is documented.
- [x] v0 posture is explicit: no Klaviyo adapter, manual operator entry.
