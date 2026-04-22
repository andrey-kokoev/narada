---
status: closed
closed: 2026-04-22
depends_on: [391]
---

# Task 392 — Operator Console Fit

## Assignment

Ensure the operator console (Tasks 378–384) can surface email-marketing Operation state correctly: pending campaign drafts, missing credentials, missing campaign info, and attention items.

## Context

The operator console is substrate-neutral and vertical-neutral by design. It observes Sites and routes control requests. The email-marketing Operation introduces new artifact types (campaign briefs) and new attention scenarios (missing sender info, missing Klaviyo credentials).

## Goal

Document how the operator console handles email-marketing Operation artifacts without becoming vertical-specific.

## Required Work

1. Map campaign artifacts to console surfaces:
   | Artifact | Console Surface | Current Status |
   |----------|----------------|----------------|
   | `campaign_brief` outbound | Drafts pending review | Needs design |
   | `send_reply` follow-up | Drafts pending review | Already works |
   | Missing sender info | Attention queue | Needs design |
   | Missing Klaviyo credentials | Attention queue + health | Needs design |
   | Stuck campaign work item | Attention queue | Already works |
2. Design generic campaign brief observation:
   - The console should not contain "campaign"-specific UI code.
   - Campaign briefs are surfaced as generic `outbound_command` rows with `actionType: "campaign_brief"`.
   - The console displays `actionType`, `payload_json` summary, and `status`.
   - Operator drills down via `narada show-draft <outbound-id>`.
3. Design missing-info attention:
   - Work items stuck in `opened` because sender never responded to follow-up.
   - Attention queue entry: `missing_campaign_info` with `context_id` and `sender_email`.
   - Derived from `work_items` + `outbound_commands` join, not hardcoded.
4. Design credential-missing attention:
   - Site health `auth_failed` when Klaviyo credentials are missing (v1) or Graph credentials are missing.
   - Attention queue entry: `missing_credentials` with `site_id` and `credential_name`.
   - Derived from `site_health` table, not hardcoded.
5. Verify CLI commands work for marketing Site:
   - `narada ops` discovers marketing Site and shows health.
   - `narada status --site marketing` returns health + trace.
   - `narada doctor --site marketing` checks directory, DB, lock, health.
   - `narada console attention` shows marketing attention items alongside helpdesk.

## Execution Notes

### Specification Document

Created `docs/deployment/operator-console-fit.md` with:
- Vertical-neutrality design principle: console displays raw `action_type`, not semantic labels
- Campaign artifact → console surface mapping table
- `campaign_brief` surfaced as generic `outbound_command` with `action_type: "campaign_brief"`
- Missing-info attention derived from generic `work_items` + `outbound_handoffs` join
- Credential-missing attention uses existing `auth_failed` / `credential_required` paths
- CLI command coverage verified: `narada ops`, `status --site`, `doctor --site`, `console attention` all work without changes
- Required changes list: only 4 minimal runtime changes (add `campaign_brief` to action type enums, exclude from `approve-draft-for-send`)
- No-changes-needed list: 9 surfaces require no modification

### No Implementation

No console code was modified. The specification documents what will work unchanged and what minimal changes are required in Tasks 391 and 393.

## Non-Goals

- Do not implement console changes.
- Do not add campaign-specific UI labels.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Campaign artifacts are mapped to console surfaces.
- [x] Generic observation design avoids vertical-specific UI code.
- [x] Missing-info attention derivation is documented.
- [x] Credential-missing attention derivation is documented.
- [x] CLI command coverage is verified/documented.
