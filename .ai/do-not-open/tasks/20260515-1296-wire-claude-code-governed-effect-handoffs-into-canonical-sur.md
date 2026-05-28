---
status: confirmed
depends_on: [1288, 1289, 1290, 1291, 1292, 1293]
closed_at: 2026-05-15T23:49:26.738Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Wire Claude Code governed effect handoffs into canonical surfaces

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1294-1299-agent-carriers-stage-4-operationalization.md

## Goal

Connect Claude Code-originating mediated requests to canonical task, inbox, command, outbox, and publication request surfaces instead of stopping at local inert files.

## Context

Stage 3 defined safe mediation and stored inert request evidence. Stage 4 should route admitted request types to the existing governed Narada surfaces while preserving approval and capability boundaries.

## Required Work

1. Map each supported Claude Code request kind to its canonical target surface: task candidate, inbox envelope, command execution intent, outbox intent, or publication intent.
2. Implement the adapter path from mediated request evidence to canonical request/admission commands without granting direct mutation authority to the carrier.
3. Add capability and target-locus checks before any request is promoted beyond inert evidence.
4. Add regression coverage for accepted inert handoff, refused missing capability, refused ambiguous locus, and bounded canonical request creation.

## Non-Goals

- Do not auto-execute command, outbox, publication, or external effects.
- Do not let carrier request text bypass output admission or secret redaction.
- Do not create a parallel authority implementation outside canonical services.

## Execution Notes

- Added `tools/agent-start/claude-code-canonical-handoff.mjs` to map Claude Code mediated request kinds to canonical request surfaces: task candidate, inbox envelope, command execution intent, outbox intent, and publication intent.
- Implemented bounded canonical request artifact creation from admitted `inert_candidate` mediation decisions, carrying carrier session id, agent id, source request id, mediation evidence ref, target locus, requested capability, and payload summary only.
- Missing capability, ambiguous target locus, unsupported effect kind, and any non-`inert_candidate` mediation decision refuse promotion and do not create a canonical request.
- Canonical handoff artifacts now create a separate canonical request file and a concrete canonical admission command shape instead of advisory placeholder strings. Task candidates route through `narada inbox submit --kind task_candidate`, inbox proposals and command requests route through canonical inbox envelopes, outbox requests route through `narada outbox compose --payload-ref`, and publication requests route through `narada publication prepare --include`.
- Added an explicit optional canonical admission runner hook. When enabled, the adapter delegates to the canonical CLI surface and records the bounded result while preserving `direct_mutation_performed: false` for the carrier.
- Added regression coverage for accepted inert handoff, missing capability refusal, ambiguous locus refusal, full surface mapping, and bounded request evidence without raw payload or secret values.
- Rejected review repair: removed invalid `narada inbox task --payload-file <request>` and all `--intent-file <request>` placeholders; tests now prove every generated admission command uses an existing canonical CLI shape and does not include raw request payload text.

## Verification

- `node --test tools\agent-start\claude-code-canonical-handoff.test.mjs` passed with 6 tests.
- `node --test tools\agent-start\claude-code-effect-mediator.test.mjs` passed with 4 tests.
- `node --test tools\agent-start\claude-code-smoke.test.mjs` passed with 2 tests.

## Acceptance Criteria

- [x] Claude Code mediated requests can be routed to canonical request surfaces where appropriate.
- [x] Missing capability or ambiguous target locus prevents promotion.
- [x] Generated canonical requests carry carrier-session evidence refs and no raw secret payloads.
- [x] Tests prove canonical authorities remain outside the carrier.
