---
status: closed
depends_on: [1311, 1327]
closed_at: 2026-05-16T03:47:23.448Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement outbox and publication handoff families

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1345-1350-narada-native-governed-effect-handoff.md

## Goal

Implement inert outbox and repository publication proposal packets.

## Context

Outbound transport and repository publication must remain owned by canonical outbox and publication zones.

## Required Work

1. Define outbox intent shape with target kind/ref, transport, route/capability refs, bounded payload body/ref, and approval posture.
2. Define RPIZ publication intent draft with repo root, branch, task linkage, include paths, message summary, and preparation command.
3. Add tests proving no transport send, commit, or push occurs.

## Non-Goals

- Do not send outbound messages.
- Do not commit or push repositories.
- Do not treat publication preparation as publication confirmation.

## Execution Notes

- Added `tools/narada-native-carrier/outbox-publication-handoff-families.mjs`.
- Implemented `emitOutboxIntentHandoffPacket` for inert outbox intent drafts with target kind/ref, transport, route/capability refs, bounded payload body ref/summary, approval posture, canonical outbox admission surface, and explicit no-transport/no-outbox-mutation flags.
- Implemented `emitRepositoryPublicationHandoffPacket` for inert RPIZ publication drafts with repo root, branch, remote, task linkage, include paths, message summary, preparation command, canonical publication admission surface, and explicit no-commit/no-push flags.
- Added redaction and bounded-summary handling so raw payload bodies, raw diffs, transcripts, prompts, provider output, and secret-like values are not recorded.
- Added `tools/narada-native-carrier/outbox-publication-handoff-families.test.mjs` covering reconstructable payload refs, canonical admission boundaries, no outbound transport, no repository publication, and redaction.

## Verification

- `node --test tools\narada-native-carrier\outbox-publication-handoff-families.test.mjs` passed: 5 tests.
- `node --test tools\narada-native-carrier\carrier-action-packet.test.mjs` passed: 3 tests.

## Acceptance Criteria

- [x] Outbox and publication handoff packets are inert and reconstructable.
- [x] Canonical admission boundaries are explicit.
- [x] Tests prove no outbound transport, commit, or push occurs.
