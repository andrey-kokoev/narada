---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T16:39:06.120Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-16T16:39:06.580Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Add Site publisher and registry puller client tools

## Chapter

Cloudflare hosted Site Registry projection

## Goal

Add local client tools that publish bounded Site events and pull/finalize hosted messages through governed local admission.

## Context

Staccato has Publish-StaccatoSurface, Publish-StaccatoSyncStatus, and Pull-StaccatoSurfaceInbox scripts. Narada needs generic equivalents that read local Site projection/config, send typed events to the hosted registry, pull pending remote messages, and hand them to the canonical local inbox admission path.

## Required Work

1. Add CLI/script entrypoints or package helpers for publishing bounded Site projection events to the hosted registry. 2. Add a puller that fetches pending hosted messages, writes only governed local admission candidates/evidence, and finalizes the remote row with admitted/rejected/error status. 3. Read endpoint/capability refs from Site config/projection, not raw secrets in repo. 4. Support dry-run mode and bounded output. 5. Add tests using mocked fetch and local temp Site state.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Added `@narada2/site-registry-cloudflare/client` package helpers for local Sites to publish bounded Site projection events and pull/finalize hosted remote messages. The helpers take capability references plus a resolver function, so endpoint/capability posture is explicit and raw token values are not embedded in repo files or returned output.

`publishBoundedSiteEvent` builds `narada.site_event.envelope.v0` payloads with raw-value exclusion, authority limits, and dry-run planning. `pullHostedMessages` fetches pending hosted messages, optionally calls a local admission callback, and finalizes remote receipts only after that callback returns admitted/rejected/error evidence. Dry-run mode performs no fetch, no finalization, and no local inbox mutation.

Added mocked-fetch tests proving bounded event construction, raw-secret refusal, dry-run publishing, transport-time capability resolution, dry-run pulling, and pull/finalize sequencing after local admission evidence.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 2 test files, 24 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Publisher emits bounded typed Site events without raw logs, secrets, or task DB dumps.
- [x] Puller routes hosted messages through local admission evidence before remote finalization.
- [x] Dry-run and mocked-fetch tests prove no live network or local inbox mutation occurs unless explicitly admitted.
