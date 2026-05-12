---
status: closed
closed_at: 2026-05-12T19:21:57.418Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Execute routed-work observability and replay hardening

## Chapter

Canonical Inbox Promotions

## Goal

Staccato shared-mailbox onboarding proved operation_intake now works end to end only after patches, but it exposed remaining execution-worthy gaps: routed work is created in the arrival mailbox DB while target-scope observability reads the inert target DB; replay/recovery previously bypassed the configured context strategy; routed context materialization needs source-conversation fallback; body_preview must be prioritized over raw HTML for charter semantics; clarification_needed with valid draft_reply should create a governed draft; and existing facts need a governed reroute/migration command instead of manual SQLite supersession.

## Context

Source inbox envelope: env_628ef8b4-01ad-408d-b5c2-c32ac772bc35

Source: agent_report:staccato-inhabited-onboarding-20260428-operation-intake

Envelope kind: observation

Summary: Staccato shared-mailbox onboarding proved operation_intake now works end to end only after patches, but it exposed remaining execution-worthy gaps: routed work is created in the arrival mailbox DB while target-scope observability reads the inert target DB; replay/recovery previously bypassed the configured context strategy; routed context materialization needs source-conversation fallback; body_preview must be prioritized over raw HTML for charter semantics; clarification_needed with valid draft_reply should create a governed draft; and existing facts need a governed reroute/migration command instead of manual SQLite supersession.

Evidence:
- Live Staccato replay routed Willem Driessen's message from staccato-narada to staccato-email-marketing and produced confirmed managed draft AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0A-8rK5BDw5E_n5akWjJ12pAAAAAHgCQAA.
- Narada commits cd71ed9 and f5fb60c completed operation_intake daemon wiring, replay dispatch, materialization fallback, and clarification draft governance.
- pnpm drafts still omits the routed target draft from the staccato-email-marketing report because the draft state lives in the arrival DB, proving observability/state factorization remains incoherent.

Proposal:
- Create an execution chapter for routed-work observability: status/drafts/ops must display target-scoped routed work even when durable runtime state lives in the source arrival DB.
- Add fixture-backed e2e tests for shared mailbox operation intake: mail fact -> route -> target charter -> draft_reply -> managed draft visible in operator surface.
- Add a governed reroute/replay/migration command for already-admitted facts after operation_intake config changes, including dry-run that shows target context, policy, charter, and planned supersessions before mutation.
- Model inert operation scopes so daemon does not emit worker-not-registered noise for target-only scopes.
- Preserve the doctrine that replay/recovery paths must use the same context strategy and policy lookup as live ingestion.

Recommendation: Promote to execution task/chapter; this is required before shared-mailbox subordinate operations can be considered operator-ready.

## Required Work

0. Source summary: Staccato shared-mailbox onboarding proved operation_intake now works end to end only after patches, but it exposed remaining execution-worthy gaps: routed work is created in the arrival mailbox DB while target-scope observability reads the inert target DB; replay/recovery previously bypassed the configured context strategy; routed context materialization needs source-conversation fallback; body_preview must be prioritized over raw HTML for charter semantics; clarification_needed with valid draft
1. Read source inbox envelope env_628ef8b4-01ad-408d-b5c2-c32ac772bc35 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Implemented the bounded Narada proper slice for routed-work observability and replay hardening:

- `narada ops` now reads target-scope rows from every configured storage scope instead of only the target scope root. This matches the existing `narada drafts` storage-scope posture and lets target-scoped routed drafts surface even when durable state lives in the arrival mailbox DB.
- Operation-intake mail signal extraction now prefers explicit `body_preview` / normalized body preview before raw body text, preventing raw HTML bodies from defeating keyword routing semantics when Graph preview text is available.
- Foreman replay/stitch candidate extraction uses the same body-preview preference, preserving replay/recovery context semantics.
- Added focused tests for routed target draft visibility, body-preview routing, and prefixed operation-intake source-conversation materialization.

Residuals explicitly left as separate work:

- Governed reroute/replay/migration command for already-admitted historical facts remains unimplemented; this requires a distinct mutation design and dry-run/supersession authority.
- Inert target-only scope daemon noise is not changed in this slice.
- No live Staccato/User Site DB, task, inbox, runtime, or outbound state was imported or mutated.

## Verification

- `pnpm --dir packages/layers/control-plane test test/unit/foreman/context.test.ts test/unit/charter/mailbox-materializer.test.ts` — passed, 32 tests.
- `pnpm --dir packages/layers/cli test test/commands/ops.test.ts` — passed, 8 tests.
- `pnpm --dir packages/layers/control-plane typecheck` — passed.
- `pnpm --dir packages/layers/cli typecheck` — passed.
- `pnpm --dir packages/layers/control-plane build` — passed.
- `pnpm --dir packages/layers/cli build` — passed.

Report artifact: `.ai/do-not-open/tasks/20260512-1222-report.json`.

## Acceptance Criteria

- [x] Proposal handled: Create an execution chapter for routed-work observability: status/drafts/ops must display target-scoped routed work even when durable runtime state lives in the source arrival DB.
- [x] Proposal handled for this slice: Add fixture-backed e2e-style unit coverage for shared mailbox operation intake routing, source-conversation materialization, and target-scoped draft visibility in operator surface data.
- [x] Explicitly deferred: Add a governed reroute/replay/migration command for already-admitted facts after operation_intake config changes, including dry-run that shows target context, policy, charter, and planned supersessions before mutation.
- [x] Explicitly deferred: Model inert operation scopes so daemon does not emit worker-not-registered noise for target-only scopes.
- [x] Proposal handled: Preserve the doctrine that replay/recovery paths must use the same context strategy and policy lookup as live ingestion.
- [x] Recommendation addressed or explicitly rejected: Promote to execution task/chapter; this is required before shared-mailbox subordinate operations can be considered operator-ready.
