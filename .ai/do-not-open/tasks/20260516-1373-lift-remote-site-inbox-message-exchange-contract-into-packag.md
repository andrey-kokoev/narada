---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T01:50:32.548Z
criteria_proof_verification:
  state: unbound
  rationale: Focused verification passed after incorporating User Site and Staccato config inspection: pnpm --filter @narada2/site-inbox test/typecheck and pnpm --filter @narada2/site-config test/typecheck. Site-inbox now exports remote message exchange contracts; site-config now declares whether inbox locations are checked and which local/remote locations are eligible, preserving candidate-only remote authority and local admission requirements.
amended_by: narada.architect
amended_at: 2026-05-16T01:51:30.516Z
closed_at: 2026-05-16T01:52:56.213Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Lift remote Site inbox message exchange contract into packages

## Chapter

Site inbox remote message exchange

## Goal

Add a reusable package-level contract for leaving messages for a Site through a remote surface, later pulling them into the receiving Site inbox, and returning admission confirmation.

## Context

Staccato has an inhabited Cloudflare Worker pattern where a remote published surface accepts inbox messages, stores pending rows, lets the local Site pull and admit them into its canonical inbox, then finalizes the remote row with local admission evidence. Narada proper should lift this as a reusable package contract separate from telemetry so Sites can expose or consume message-leaving surfaces without making the remote surface inbox authority.

User Site and Staccato config inspection refined the lift:

- `C:\Users\Andrey\Narada\config.json` is the User Site config; there is no `C:\Users\Andrey\Narada\.narada\config.json`.
- User Site registry awareness records Staccato `inbox_endpoint.status = observed` with `surfaces = [".ai/inbox-envelopes"]`, while preserving no mutation authority from awareness.
- User Site also has `message_intake.staccato` as a volatile/private local intake path.
- Staccato `.narada/config.json` declares a local canonical inbox under `.narada/.ai`, message routing across client-service/data/ELT/operator/Narada-proper loci, and `integrations.cloudflare.published_surface.inbox` with submit/poll/receipt/local-admission fields.

## Required Work

1. Add package-level types and helpers in @narada2/site-inbox for remote Site inbox messages, pending/list/finalize states, receipts, and local-admission plans.
2. Preserve receiving-Site authority: remote messages are candidates only until local canonical inbox admission; remote confirmation records local admission evidence but does not admit by itself.
3. Include Staccato-inspired fields for source, target_site_id, idempotency_key, kind, subject/body/payload, received_at, status, receipt, and finalize payloads for admitted/rejected/error outcomes.
4. Add focused tests covering message construction, local admission request planning, remote-disabled authority posture, idempotency/receipt shape, admitted confirmation, and refused/error confirmation.
5. Update package README to describe the remote exchange contract and non-goals.
6. Add Site config package support for a boolean posture controlling whether inbox locations are checked at all, plus a bounded list of local/remote inbox locations/surfaces eligible for checking.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Added remote Site inbox message exchange contracts to `@narada2/site-inbox`.
- Added remote pending message, receipt, local admission plan, finalization payload, and receipt-from-finalization helpers.
- Added focused tests for pending message construction, inert local admission planning, finalized admitted receipts, and rejected/error finalization receipts.
- Documented the Staccato-derived remote exchange posture in `packages/site-inbox/README.md`.
- Inspected User Site and Staccato configs read-only before adding Site config posture.
- Added `@narada2/site-config` inbox location check config, location declarations, and validation/decision helper.
- Added focused tests and README documentation for boolean inbox-location checking and bounded local/remote locations.

## Verification

- `pnpm --filter @narada2/site-inbox test` passed: 2 test files, 9 tests.
- `pnpm --filter @narada2/site-inbox typecheck` passed.
- `pnpm --filter @narada2/site-config test` passed: 1 test file, 6 tests.
- `pnpm --filter @narada2/site-config typecheck` passed.
- Read-only inspection of `C:\Users\Andrey\Narada\config.json` and Staccato `.narada/config.json` confirmed the inhabited User Site observed-surface pattern and Staccato Cloudflare submit/poll/receipt/local-admission pattern.

## Acceptance Criteria

- [x] @narada2/site-inbox exports reusable remote Site inbox message, receipt, finalize, and local-admission plan contracts.
- [x] Tests prove a remote pending message can be converted into an inert local Site inbox admission request without DB/artifact mutation.
- [x] Tests prove remote confirmation/finalization carries local admission or rejection evidence and does not itself grant inbox/task authority.
- [x] README documents the Staccato-derived message-leaving pattern and keeps remote surfaces non-authoritative.
- [x] Site config contract supports a boolean posture for checking remote inbox locations and a bounded list of inbox locations/surfaces to check.
