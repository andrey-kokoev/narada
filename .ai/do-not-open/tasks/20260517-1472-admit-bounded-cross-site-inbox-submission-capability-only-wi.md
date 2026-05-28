---
status: deferred
depends_on: [1471]
amended_by: narada.architect
amended_at: 2026-05-17T20:37:23.624Z
deferred_by: narada.architect
deferred_at: 2026-05-17T20:44:42.195Z
defer_reason: No explicit reusable consent artifact exists for Narada proper to submit future inert envelopes into narada-andrey through MCP fabric; one-off delivery and relation admission are insufficient.
unblock_condition: Obtain target-side or operator-admitted consent artifact, then run: narada capability grant --site narada-andrey --principal narada.architect --kind canonical_inbox_cross_site_submission --credential-ref none --scope '{\
continuation_packet:
  kind: task_defer
  deferred_by: narada.architect
  deferred_at: 2026-05-17T20:44:42.195Z
  reason: No explicit reusable consent artifact exists for Narada proper to submit future inert envelopes into narada-andrey through MCP fabric; one-off delivery and relation admission are insufficient.
  unblock_condition: Obtain target-side or operator-admitted consent artifact, then run: narada capability grant --site narada-andrey --principal narada.architect --kind canonical_inbox_cross_site_submission --credential-ref none --scope '{\
  residuals: [Standing cross-Site submission remains unavailable until explicit consent is admitted., Route addressability exists separately and does not grant send authority.]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T20:44:57.503Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779050673195_sk3mk4
---

# Admit bounded cross-Site inbox submission capability only with explicit consent basis

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1469-1474-principled-narada-andrey-cross-site-inbox-route.md

## Goal

Create or defer the standing capability grant for Narada proper to submit inert envelopes to narada-andrey based on explicit authority evidence.

## Context

Reusable cross-Site inbox submission capability can be admitted or deferred only after the narada-andrey route addressability record exists. It is not dependent on the old deferred route-mediated retry task.

## Required Work

1. Inspect available consent evidence: operator statements, target inbox replies, direct delivery decision, and route contract.
2. If explicit reusable consent exists, run `narada capability grant` for `site narada-andrey`, `principal narada.architect`, `kind canonical_inbox_cross_site_submission`, `credential-ref none`, and a scope limited to source Site `narada-proper`, target ref `narada-andrey`, filesystem transport, inert envelope submission only, and allowed envelope kinds `proposal`, `observation`, and `message`.
3. If explicit reusable consent does not exist, defer this task and record the exact missing consent artifact and command shape to run after consent.
4. Do not describe source-local capability as target-side consent unless target evidence exists.

## Non-Goals

- Do not create a broad or secret-bearing capability.
- Do not grant task lifecycle, Site config, registry registration, or secret access.
- Do not use one-off delivery evidence alone as target consent.

## Execution Notes

- Amended by narada.architect at 2026-05-17T20:37:23.624Z: context, dependencies
- Inspected route contract, direct-delivery evidence, and narada-andrey reply posture for explicit reusable consent.
- Found evidence of direct one-off delivery and narada-andrey local admission of the registry relation in principle, but not an explicit standing consent artifact authorizing Narada proper to submit future envelopes into narada-andrey's inbox through MCP fabric.
- Did not create a capability grant. Source-local route addressability is not target-side consent.
- Concrete unblock: obtain a target-side or operator-admitted consent artifact naming `site=narada-andrey`, `principal=narada.architect` or Narada proper agent class, `capability_kind=canonical_inbox_cross_site_submission`, source Site `narada-proper`, target ref `narada-andrey`, filesystem transport, inert envelope submission only, and allowed kinds `proposal`, `observation`, `message`.
- Command shape after unblock:
  `narada capability grant --site narada-andrey --principal narada.architect --kind canonical_inbox_cross_site_submission --credential-ref none --scope '{"source_site":"narada-proper","target_ref":"narada-andrey","transport":"filesystem","effect":"inert_inbox_submission","allowed_envelope_kinds":["proposal","observation","message"]}' --allow inbox_stage_submission_workflow,inbox_submit_observation,inbox_submit_typed_envelope --evidence-ref <explicit-consent-artifact> --by <consenting-principal> --format json --cwd D:\code\narada`

## Verification

- `rg -n "env_be44e421|env_37e5cd13|admits the registry relation|canonical_inbox_cross_site_submission|reusable|consent|capability" .ai docs C:\Users\Andrey\Narada\.ai\inbox-envelopes` found route contract and direct delivery evidence but no explicit reusable cross-Site inbox submission consent artifact.
- `narada capability grant --help` confirmed the command shape supports `--site`, `--principal`, `--kind`, `--scope`, `--allow`, `--credential-ref none`, and `--evidence-ref`.
- `narada task defer --help` confirmed deferral can record explicit reason and unblock command.

## Acceptance Criteria

- [x] Either a scoped active grant exists with explicit consent evidence, or the task is deferred with a precise unblock condition.
- [x] Grant scope is limited to inert inbox submission.
- [x] No raw secrets or credential values are stored.
- [x] Source-local authority and target-side consent are not conflated.
