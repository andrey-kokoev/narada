---
status: closed
depends_on: [1282, 1283, 1284]
closed_at: 2026-05-15T21:21:13.745Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Mediate Claude Code tool and effect requests

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1288-1290-claude-code-carrier-stage-3.md

## Goal

Route Claude Code-originating tool/effect requests through governed Narada crossings instead of granting direct authority.

## Context

Once Claude Code can run interactively, it must request effects through canonical task, inbox, outbox, command execution, publication, and capability consent surfaces.

## Required Work

1. Define the request envelope shape for Claude Code-originating proposed effects.
2. Implement or stub the adapter path that turns carrier requests into inert candidates or governed command intents.
3. Add refusal/diagnostic behavior for unsupported direct effects, missing capability grants, and target-locus ambiguity.
4. Record evidence linking carrier request, admission decision, and resulting command/inbox/task/publication handoff where applicable.

## Non-Goals

- Do not allow Claude Code to mutate Narada state directly.
- Do not store raw secrets or credentials in carrier evidence.
- Do not bypass operator approval or canonical capability consent.

## Execution Notes

- Added `tools/agent-start/claude-code-effect-mediator.mjs` to define Claude Code-originating effect request envelopes and mediation decisions.
- Supported governed target kinds are task, inbox, outbox, command, and publication; each routes to its canonical authority owner as an inert candidate.
- The carrier never receives mutation authority: admitted requests become `inert_candidate` handoffs with `carrier_mutation_admitted: false`.
- Unsupported direct effects, missing target locus, and missing capability grants are refused with actionable diagnostics.
- Added evidence writing under `.narada/crew/claude-code-effect-requests/<request_id>.json` to link carrier request, admission decision, and canonical owner.
- Repaired rejected review finding: mediation evidence now omits raw payload values, records only payload shape/keys, and refuses secret-bearing payloads before handoff admission.
- Added tests proving task/inbox/outbox/publication/command authority remains outside the carrier and raw secret values are not persisted.

## Verification

- `node --test tools\agent-start\claude-code-effect-mediator.test.mjs` passed with 4 tests.

## Acceptance Criteria

- [x] Claude Code effect requests are represented as governed envelopes or intents before execution.
- [x] Unsupported direct effects are refused with actionable diagnostics.
- [x] Capability grants are checked before effect admission.
- [x] Tests prove task/inbox/outbox/publication authority remains outside the carrier.
