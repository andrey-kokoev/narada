---
status: confirmed
amended_by: narada.builder
amended_at: 2026-05-18T02:08:44.876Z
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T02:08:51.492Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T02:08:51.963Z
closed_by: narada.builder
governed_by: chapter_close:narada.builder
closure_mode: agent_finish
---

# Define Incoming Message Intake Edge and reuse boundaries

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1488-1493-incoming-message-intake-edge-coherence.md

## Goal

Specify IncomingMessageIntakeEdge as the configured path from a source surface to a Site intake boundary, and explicitly map arrivals to existing Narada artifacts instead of inventing a new candidate layer.

## Context

Current incoming-message sources include Exchange mailbox admission, leave-message/file-drop paths, CLI/MCP inbox submission, hosted registry message candidates, webhook receipts, pub/sub doctrine, agent reports, and system observations. The missing first-class object is the edge/lifecycle that governs a source path. Remote Candidate Exchange, Canonical Inbox, Admission/Rejection Ledger, and SourceRecord/Fact already cover different arrival/admission artifacts.

## Required Work

1. Create or update product doctrine to define IncomingMessageIntakeEdge, its owner, target authority, capability/trust posture, transport mode, health, and lifecycle.
2. Define the edge lifecycle: declared, configured, reachable, receiving, degraded, suspended, retired.
3. Define arrival mapping rules: local direct submissions can become Canonical Inbox envelopes; hosted/remote preservation remains Remote Candidate Exchange; rejected/deferred decisions go to Admission/Rejection Ledger; daemon/runtime observations may remain SourceRecord/Fact until governed admission.
4. State explicitly that this task does not introduce a generic MessageCandidate ontology that overlaps Remote Candidate Exchange.
5. Cross-link Canonical Inbox, Remote Candidate Exchange, Admission/Rejection Ledger, Site Communication Surface, Site Pub/Sub, mailbox vertical, and Site-local daemon sources.

## Non-Goals

- Do not rename existing inbox, site-communication, remote-candidate, or admission commands.
- Do not implement new CLI commands.
- Do not alter mailbox sync behavior.
- Do not treat hosted receipts as target Site admission.

## Execution Notes

Added `docs/product/incoming-message-intake-edge.md`.

The new doctrine defines `IncomingMessageIntakeEdge` as the configured path from a source surface to a Site intake boundary. It assigns the edge lifecycle and health posture to the path itself while keeping arrived material mapped to existing Narada artifact families:

- Canonical Inbox envelopes for local inert typed intake.
- Remote Candidate Exchange messages and receipts for hosted/remote preservation.
- Canonical Admission Rejection Ledger entries for considered, rejected, deferred, malformed, unauthorized, stale, duplicate, superseded, or unsupported arrivals.
- SourceRecord/Fact for mailbox, webhook, daemon, and filesystem observations that remain in the compiler pipeline until governed admission.

The document explicitly rejects a new generic `MessageCandidate` ontology and treats surface-specific `message_candidate` schemas as compatibility or Remote Candidate Exchange instantiations.

Added cross-links from:

- `docs/concepts/canonical-inbox.md`
- `docs/product/remote-candidate-exchange.v0.md`
- `docs/concepts/canonical-admission-rejection-ledger.md`
- `docs/product/site-communication-surface.v0.md`
- `docs/product/site-pubsub-signal-exchange.md`
- `docs/product/site-local-daemon-sources.md`
- `docs/product/mailbox-runtime-readiness.md`

No CLI commands, mailbox behavior, or implementation code were changed.

## Verification

- Read the current Canonical Inbox, Remote Candidate Exchange, Admission Rejection Ledger, Site Communication Surface, Site Pub/Sub, Site-local daemon source, and mailbox readiness doctrine before editing.
- Ran `git diff --check -- docs\product\incoming-message-intake-edge.md docs\concepts\canonical-inbox.md docs\product\remote-candidate-exchange.v0.md docs\concepts\canonical-admission-rejection-ledger.md docs\product\site-communication-surface.v0.md docs\product\site-pubsub-signal-exchange.md docs\product\site-local-daemon-sources.md docs\product\mailbox-runtime-readiness.md`; no whitespace errors were reported. Git emitted line-ending warnings for existing markdown files.
- Ran `rg -n "IncomingMessageIntakeEdge|No Generic MessageCandidate|Canonical Inbox|Remote Candidate Exchange|Admission Rejection Ledger|SourceRecord/Fact|Site Communication Surface|Site Pub/Sub|Site-Local Daemon|Mailbox" ...` over the new and linked docs; confirmed the definition, lifecycle, artifact reuse, duplicate ontology rejection, and cross-links are present.

## Acceptance Criteria

- [x] IncomingMessageIntakeEdge is defined as the first-class lifecycle object.
- [x] The doctrine reuses existing Remote Candidate Exchange, Canonical Inbox, Admission/Rejection Ledger, and SourceRecord/Fact artifacts.
- [x] The edge lifecycle is documented with authority and health semantics.
- [x] The document rejects a duplicate generic candidate ontology.
- [x] Relevant existing docs are cross-linked.
