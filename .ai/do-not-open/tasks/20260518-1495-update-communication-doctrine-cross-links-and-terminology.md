---
status: confirmed
depends_on: [1488]
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T03:41:23.442Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T03:41:23.935Z
closed_by: narada.builder
governed_by: chapter_close:narada.builder
closure_mode: agent_finish
---

# Update communication doctrine cross-links and terminology

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1494-1498-operator-site-communication-relation.md

## Goal

Align existing communication, intake, surface, and registry doctrine with the new relation terminology without changing implementation behavior.

## Context

Existing docs mention Site Communication Surface, Incoming Message Intake Edge, Remote Candidate Exchange, Canonical Inbox, Canonical Outbox, Operator Surface, and Site Factorization. The new relation must sit above these without duplicating their authority or creating a competing term.

## Required Work

1. Update Site Communication Surface docs to point to OperatorSiteCommunicationRelation as the relation/configuration object behind per-Site communication UI.
2. Update Incoming Message Intake Edge docs to clarify that it is one directional component of a bidirectional Operator/Site communication relation when used in that context.
3. Update Canonical Inbox and Canonical Outbox docs only where needed to preserve inbound/outbound relation posture.
4. Update Site Factorization or Operator Surface docs if needed to name the relation as an interface/crossing configuration, not a Site or authority locus.
5. Search for ambiguous OperatorSiteCommunicationEdge or site communication edge language and either replace it or add compatibility wording.

## Non-Goals

- Do not change CLI behavior or Worker routes in this task.
- Do not broaden the relation into registry-wide chat.
- Do not remove existing Site Communication Surface terminology; relate it precisely.

## Execution Notes

- Updated `docs/product/site-communication-surface.v0.md` so the product shape routes through `OperatorSiteCommunicationRelation` projection before message composer/chat and inbound candidate crossing.
- Clarified that the Site Communication Surface cannot mutate `OperatorSiteCommunicationRelation` lifecycle, and that `IncomingMessageIntakeEdge` is only the directional inbound component when used in this context.
- Updated `docs/product/incoming-message-intake-edge.md` to state that an intake edge inside an `OperatorSiteCommunicationRelation` is the Operator-to-Site directional component, not the whole bidirectional relation.
- Updated `docs/concepts/canonical-inbox.md` to state that Canonical Inbox is the possible local inbound artifact after relation/intake delivery or preservation, and does not own the relation, UI projection, outbound reply path, or operator approval.
- Preserved the 1494 cross-links from Site Communication Surface, Operator Surface, Site Factorization, Incoming Message Intake Edge, and Canonical Outbox to the Operator Site Communication Relation artifact.
- Searched for ambiguous `OperatorSiteCommunicationEdge` / site communication edge language and found no product/concept doc uses requiring replacement.

## Verification

- `git diff --check -- docs/product/site-communication-surface.v0.md docs/product/incoming-message-intake-edge.md docs/concepts/canonical-inbox.md docs/concepts/canonical-outbox.md docs/concepts/operator-surface.md docs/product/site-factorization.md docs/product/operator-site-communication-relation.v0.md` passed; Git emitted existing LF/CRLF working-copy warnings for several docs.
- `rg -n "OperatorSiteCommunicationEdge|Operator Site Communication Edge|site communication edge|communication edge|relation authority|UI delivery is local admission|UI delivery is.*approval" docs/product docs/concepts -g "*.md"` returned no matches.
- `rg -n "OperatorSiteCommunicationRelation|operator-site-communication-relation|directional component|inbound artifact|projection-only|local admission|operator approval|Canonical Outbox|IncomingMessageIntakeEdge" docs/product/site-communication-surface.v0.md docs/product/incoming-message-intake-edge.md docs/concepts/canonical-inbox.md docs/concepts/canonical-outbox.md docs/concepts/operator-surface.md docs/product/site-factorization.md` confirmed relation links, directional wording, inbound artifact wording, projection-only language, and authority distinctions are present.

## Acceptance Criteria

- [x] Neighboring doctrine links to the Operator Site Communication Relation artifact.
- [x] Ambiguous edge-only wording is corrected or explicitly scoped to directional transport.
- [x] Docs preserve the distinction between relation, projection, intake edge, outbox item, chat, and target Site authority.
- [x] No document claims UI delivery is local admission or approval.
