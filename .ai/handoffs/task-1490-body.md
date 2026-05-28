# Specify routing authority posture for cross-locus incoming messages

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1488-1493-incoming-message-intake-edge-coherence.md

## Goal

Define how message_routing_authority should govern cross-locus and cross-Site incoming submissions while preserving local legacy compatibility.

## Context

`narada inbox doctor` currently reports message_routing_authority as unconfigured with legacy allow_when_unconfigured behavior. This is usable locally but too loose for coherent cross-Site or target-locus message intake.

## Required Work

1. Specify when unconfigured local submission remains acceptable compatibility behavior.
2. Specify when target-locus or cross-Site messages must require declared message_routing_authority and capability checks.
3. Define required fields for route policy entries: principal, target_locus, kinds, authority_levels, capability_kind when applicable, condition, refusal posture.
4. Define doctor/preflight output expectations that distinguish legacy-local allowance from enforced routing.
5. Produce examples for local CLI submission, Builder-to-Architect handoff, hosted message pull, and cross-Site delegated submission.

## Non-Goals

- Do not enforce routing in code in this task.
- Do not grant any capability or credential.
- Do not break current local inbox submit workflows.

## Execution Notes

Added `docs/product/message-routing-authority-posture.md`.

The doctrine distinguishes:

- unconfigured local direct submission as compatibility behavior for the current authority Site;
- target-locus and cross-locus routing as requiring declared `message_routing_authority`;
- cross-Site delegated submission as requiring declared route policy plus active capability grant;
- MCP inbox mutation tools as sharing the CLI routing decision rather than having a separate routing law.

The doctrine defines required route policy fields and refusal output posture, including `principal`, `target_locus` / `target_loci`, `kinds`, `authority_levels`, `condition`, `capability_kind`, `capability_action`, and `reason`.

It also defines doctor/preflight output expectations for unconfigured local compatibility, configured local routes, cross-locus routes, capability-gated cross-Site routes, missing/expired/revoked capability grants, and no-rule matched refusals.

Examples cover:

- local CLI submission;
- Builder-to-Architect handoff;
- hosted message pull;
- cross-Site delegated submission.

Cross-linked the new doctrine from:

- `docs/concepts/canonical-inbox.md`
- `docs/concepts/narada-mcp-facade.md`
- `docs/product/site-governance-coordinates.md`
- `docs/product/incoming-message-intake-edge.md`

No code enforcement, capability grants, credentials, or current local inbox workflows were changed.

## Verification

- Read `packages/layers/cli/src/lib/message-routing-authority.ts` to confirm current implemented fields and decisions: `allow_when_unconfigured`, `deny_cross_locus_unless_allowed`, `deny_unless_allowed`, `may_send`, `may_not_send`, `capability_kind`, `capability_action`, `direct_target_authority`, and `source_site_delegated_authority`.
- Read CLI and MCP tests covering configured message routing and capability-gated cross-Site inbox submission.
- Ran `git diff --check -- docs\product\message-routing-authority-posture.md docs\concepts\canonical-inbox.md docs\product\site-governance-coordinates.md docs\concepts\narada-mcp-facade.md docs\product\incoming-message-intake-edge.md`; no whitespace errors were reported. Git emitted line-ending warnings for existing markdown files.
- Ran `rg -n "Compatibility And Enforcement|Required Policy Shape|target_locus|kinds|authority_levels|capability_kind|capability_action|Refusal Posture|Doctor And Preflight|Local CLI Submission|Builder-To-Architect|Hosted Message Pull|Cross-Site Delegated" docs\product\message-routing-authority-posture.md`; confirmed required sections, fields, refusal posture, doctor/preflight expectations, and examples are present.
- Ran `Select-String` across linked docs for `Message Routing Authority Posture` / `message-routing-authority-posture`; confirmed cross-links are present.

## Acceptance Criteria

- [x] Local compatibility and cross-locus enforcement are distinguished.
- [x] message_routing_authority required fields and refusal posture are documented.
- [x] Doctor/preflight expectation is specified.
- [x] Examples cover local, role, hosted, and cross-Site routes.
