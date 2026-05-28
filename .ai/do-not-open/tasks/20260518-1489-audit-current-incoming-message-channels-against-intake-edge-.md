---
status: confirmed
depends_on: [1488]
amended_by: narada.builder
amended_at: 2026-05-18T02:11:08.316Z
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T02:11:13.684Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T02:11:14.129Z
closed_by: narada.builder
governed_by: chapter_close:narada.builder
closure_mode: agent_finish
---

# Audit current incoming message channels against Intake Edge model

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1488-1493-incoming-message-intake-edge-coherence.md

## Goal

Classify current implemented and documented incoming message channels as Intake Edges and identify which artifact each edge produces today.

## Context

The system has working Canonical Inbox commands, mailbox sync, file-drop intake, MCP inbox submission, hosted Site Communication routes, Remote Candidate Exchange doctrine, Site Pub/Sub doctrine, webhook source doctrine, and daemon source doctrine. Their relation is not yet captured as one intake-edge inventory.

## Required Work

1. Create an audit table of current incoming surfaces: Exchange mailbox, external leave-message/file-drop, CLI inbox submit, MCP inbox submit, hosted registry message candidate, webhook source, pub/sub signal, agent report, system observation, and daemon source.
2. For each surface, record source owner, target authority, current artifact, current admission boundary, lifecycle status, capability/trust posture, and known gaps.
3. Identify which channels are implemented, doctrine-only, compatibility-only, or missing.
4. Record local current findings from `narada inbox doctor`, including unconfigured message_routing_authority and inbox artifact publication pending, as operational posture not semantic authority.

## Non-Goals

- Do not fix every gap found by the audit.
- Do not publish inbox artifacts or commit unrelated work.
- Do not create tasks from every residual unless the chapter explicitly needs them.

## Execution Notes

Created `docs/product/incoming-message-intake-edge-audit-20260518.md` and linked it from `docs/product/incoming-message-intake-edge.md`.

The audit table classifies:

- Exchange mailbox.
- Human file drop / leave-message file path.
- CLI inbox submit.
- MCP inbox submit.
- Hosted registry message candidate.
- Webhook source.
- Site pub/sub signal.
- Agent report.
- System observation.
- Site-local daemon source.
- External leave-message / hosted communication form.

For each row, the audit records edge reading, source owner, target authority, current artifact, admission boundary, lifecycle status, capability/trust posture, implementation posture, and known gaps.

The audit separates implemented/compatibility-implemented surfaces from doctrine-only or not-yet-materialized surfaces. It also records residuals specific enough for future tasks, including first-class edge registry/read model, cross-Site MCP submission capability, pub/sub materialization, ledger integration, hosted route alignment, and source family edge health.

Local operational posture from `narada inbox doctor` was recorded without overclaim:

- `message_routing_authority` is unconfigured and local legacy direct submission is admitted, but that does not prove delegated cross-Site routing.
- `publication_pending` with `uncommitted_envelope_artifacts_count=200` means portable inbox visibility is pending, not that the inbox substrate or intake model is invalid.
- Runtime posture is `unknown_or_external_entrypoint`; the expected repo dist entrypoint exists, so this is command embodiment posture rather than semantic intake-edge failure.

## Verification

- Ran `narada inbox doctor --format json` and recorded bounded findings in the audit.
- Ran `rg -n "inbox submit|submit-observation|narada_inbox_submit|message_candidate|remote_candidate|WebhookSource|InboxDropSource|ExchangeSource|TimerSource|filesystem.change|system_observation|agent_report|message_routing_authority" packages docs -g "*.ts" -g "*.md" -g "*.json"` to confirm implemented and documented surfaces.
- Ran `git diff --check -- docs\product\incoming-message-intake-edge-audit-20260518.md docs\product\incoming-message-intake-edge.md`; no whitespace errors were reported.
- Ran `rg -n "Exchange mailbox|Human file drop|CLI inbox submit|MCP inbox submit|Hosted registry message candidate|Webhook source|Site pub/sub signal|Agent report|System observation|Site-local daemon source|message_routing_authority|publication_pending|Doctrine-only|Implemented|Residuals" docs\product\incoming-message-intake-edge-audit-20260518.md`; confirmed required channel coverage, implementation classification, operational posture, and residuals.

## Acceptance Criteria

- [x] Every known incoming channel is classified under the Intake Edge model.
- [x] Implemented versus doctrine-only surfaces are clearly separated.
- [x] Current operational incoherencies are recorded without overclaiming them as semantic failures.
- [x] Residuals are specific enough to become follow-up tasks.
