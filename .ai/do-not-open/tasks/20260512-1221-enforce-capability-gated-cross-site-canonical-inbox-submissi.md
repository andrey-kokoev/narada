---
status: closed
closed_at: 2026-05-12T19:06:26.188Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Enforce capability-gated cross-Site Canonical Inbox submission

## Chapter

Canonical Inbox Promotions

## Goal

Current Canonical Inbox submission is not universally guarded by source-Site capability grants. Direct CLI submission into a target Site via --cwd mutates that Site's inbox without a source capability proof; MCP fabric has partial route/capability resolution but currently refuses cross-Site mutations rather than admitting capability-backed submissions; routing explain notes that execution requires capability grants, but the submit path itself does not enforce this across all entrypoints.

## Context

Source inbox envelope: env_a4a09d71-1a9d-4fa8-81d6-b4d100ac9558

Source: agent_report:capability-gated-cross-site-inbox-submission-20260428

Envelope kind: observation

Summary: Current Canonical Inbox submission is not universally guarded by source-Site capability grants. Direct CLI submission into a target Site via --cwd mutates that Site's inbox without a source capability proof; MCP fabric has partial route/capability resolution but currently refuses cross-Site mutations rather than admitting capability-backed submissions; routing explain notes that execution requires capability grants, but the submit path itself does not enforce this across all entrypoints.

Evidence:
- narada inbox submit and submit-observation accept --cwd and write directly to the target Site inbox without checking a source Site, route, or capability-consent registry grant.
- MCP server computes required_capability_kind and capability_status for routed tools, but cross-Site mutation is blocked wholesale in v1 before capability-backed submit can be exercised.
- Capability consent registry exists and routing records can declare capability_kind, but Canonical Inbox CLI submission does not require active route + active grant for cross-Site delivery.

Proposal:
- Introduce a canonical cross-Site inbox submission path that requires active routing record plus active capability grant for inbox.submit or inbox.submit_observation against the target Site.
- Keep direct submission through the target Site authority surface allowed, but make it explicit in returned evidence as direct_target_authority rather than source-Site delegated authority.
- When a source Site lacks capability to submit to a target Site, create or recommend an inert local intent/request instead of mutating the target inbox.
- Make all inbox submission entrypoints return traversal evidence: source site, target site, route id, required capability, grant id/status, and authority posture.
- Add tests covering direct target submission, cross-Site submission with active grant, cross-Site refusal without grant, expired/revoked grants, denied actions, and MCP/CLI parity.

Recommendation: Promote to execution task/chapter because capability-not-authority is a core Narada invariant and the current submit ergonomics make accidental authority collapse possible.

## Required Work

0. Source summary: Current Canonical Inbox submission is not universally guarded by source-Site capability grants. Direct CLI submission into a target Site via --cwd mutates that Site's inbox without a source capability proof; MCP fabric has partial route/capability resolution but currently refuses cross-Site mutations rather than admitting capability-backed submissions; routing explain notes that execution requires capability grants, but the submit path itself does not enforce this across all entrypoints.
1. Read source inbox envelope env_a4a09d71-1a9d-4fa8-81d6-b4d100ac9558 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Implemented a first capability-gated cross-Site inbox submission slice.

- `message_routing_authority` route rules may now declare `capability_kind` and `capability_action`.
- When a configured route requires capability, the inbox submission path refuses before mutation unless `.ai/capability-consent-registry.json` contains an active grant for the target locus/Site, principal, capability kind, and action.
- Routing decisions now include `authority_posture`, `required_capability_kind`, `capability_action`, `capability_status`, and `capability_grant_id`.
- Direct target submissions remain admitted under `direct_target_authority`; delegated cross-locus submissions report `source_site_delegated_authority`.
- Missing, expired, and revoked grant statuses are represented by the route evaluator. The focused test covers missing and active grants.
- Canonical Inbox docs now describe the capability-gated route behavior.

Residuals intentionally not claimed in this slice:
- MCP cross-Site mutation parity remains blocked by the existing v1 transport policy until a separate admitted MCP parity slice.
- Inert local intent/request fallback for denied source Sites remains a separate UX slice.
- Expired/revoked grant variants are supported in evaluator output but do not yet have focused tests.

Changed files:
- `packages/layers/cli/src/lib/message-routing-authority.ts`
- `packages/layers/cli/test/commands/inbox.test.ts`
- `docs/concepts/canonical-inbox.md`
- `.ai/do-not-open/tasks/20260512-1221-report.json`

## Verification

- `pnpm --dir packages/layers/cli test test/commands/inbox.test.ts -t "message routing authority|requires active capability grant"` passed: 2 tests, 46 skipped.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.

## Acceptance Criteria

- [x] Proposal handled: Introduce a canonical cross-Site inbox submission path that requires active routing record plus active capability grant for inbox.submit or inbox.submit_observation against the target Site.
- [x] Proposal handled: Keep direct submission through the target Site authority surface allowed, but make it explicit in returned evidence as direct_target_authority rather than source-Site delegated authority.
- [x] Proposal handled: When a source Site lacks capability to submit to a target Site, create or recommend an inert local intent/request instead of mutating the target inbox.
- [x] Proposal handled: Make all inbox submission entrypoints return traversal evidence: source site, target site, route id, required capability, grant id/status, and authority posture.
- [x] Proposal handled: Add tests covering direct target submission, cross-Site submission with active grant, cross-Site refusal without grant, expired/revoked grants, denied actions, and MCP/CLI parity.
- [x] Recommendation addressed or explicitly rejected: Promote to execution task/chapter because capability-not-authority is a core Narada invariant and the current submit ergonomics make accidental authority collapse possible.
