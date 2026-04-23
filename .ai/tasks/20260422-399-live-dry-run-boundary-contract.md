---
status: closed
closed: 2026-04-22
depends_on: [398]
---

# Task 399 — Live Dry Run Boundary Contract

## Assignment

Define the exact boundary, input selection criteria, success criteria, and public/private artifact split for the email-marketing live dry run.

This is the chapter's boundary contract. All subsequent tasks (400–404) must reference it.

## Required Reading

- `.ai/decisions/20260422-398-email-marketing-live-dry-run-readiness.md`
- `docs/deployment/email-marketing-operation-contract.md`
- `docs/deployment/campaign-request-fact-model.md`
- `docs/deployment/klaviyo-intent-boundary.md`
- `SEMANTICS.md §2.14`
- `.ai/decisions/20260422-397-session-attachment-semantics.md`

## Required Work

1. Define the dry-run success criterion in one sentence.

   > Example shape: "One allowed-sender email to the designated mailbox is synced, evaluated, and produces either a `campaign_brief` outbound command or a `send_reply` missing-info follow-up, with no Klaviyo API call and no campaign send/publish."

2. Define input selection criteria.

   - Allowed sender list format and where it lives (private ops repo `config.json`)
   - Mailbox designation
   - Thread/subject selection rules
   - Lookback window (e.g., 7 days)
   - What to do with non-campaign mail (silently skip)

3. Define the public/private artifact boundary.

   - What goes in public Narada (code, schemas, interfaces)
   - What goes in the private ops repo (config values, knowledge sources, credentials)
   - What must never be committed to public repo

4. Define the no-effect proof criteria.

   - What observable evidence proves no Klaviyo mutation occurred?
   - What operator inspection commands must work?
   - What attention items must surface if something goes wrong?

5. Define session/attachment semantics for the dry run.

   - Operator invokes `narada cycle --site <site-id>` from a shell
   - Shell session is transient; Site persists independently
   - Operator inspects results via CLI after Cycle completes
   - No persistent `SiteAttachment` record required for v0 dry run

## Non-Goals

- Do not implement the dry run.
- Do not create private customer data in the public repo.
- Do not add Klaviyo API execution.
- Do not define a generic marketing automation framework.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] One-sentence success criterion exists and is unambiguous.
- [x] Input selection criteria are bounded (one mailbox, one thread, allowed sender).
- [x] Public/private artifact boundary is explicit with examples.
- [x] No-effect proof criteria are defined.
- [x] Task 397 vocabulary is referenced; no second attachment model is invented.
- [x] Document references all required reading.
- [x] No implementation code is added.
