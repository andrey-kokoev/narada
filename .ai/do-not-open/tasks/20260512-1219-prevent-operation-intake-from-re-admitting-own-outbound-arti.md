---
status: closed
closed_at: 2026-05-12T18:55:35.110Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Prevent operation intake from re-admitting own outbound artifacts

## Chapter

Canonical Inbox Promotions

## Goal

Staccato observed an operation-intake false positive: its own sent clarification reply from sentitems was routed into staccato-email-marketing as fresh work, producing a retryable clarification_needed item with no proposed action. Sent outbound artifacts should remain reconciliation evidence but not become inbound work by default.

## Context

Source inbox envelope: env_326f1616-a460-49cc-90ad-6a6a4fefaef6

Source: agent_report:staccato:.narada/requests/20260429-narada-proper-operation-intake-outbound-boundary.md

Envelope kind: observation

Summary: Staccato observed an operation-intake false positive: its own sent clarification reply from sentitems was routed into staccato-email-marketing as fresh work, producing a retryable clarification_needed item with no proposed action. Sent outbound artifacts should remain reconciliation evidence but not become inbound work by default.

Evidence:
- work item wi_2b6c858b-740b-42bf-b0f9-fa6a5de5d346, execution ex_1c0535d3-5a26-4e73-a2bd-762b8a694711
- materialized message was from staccato.narada@global-maxima.com to willem.driessen@staccato2011.com and sourced from sentitems

Proposal:
- Add canonical operation-intake source/direction/principal boundary: exclude self-authored sent/outbound artifacts from fresh work by default, while keeping them available for reconciliation and audit evidence; allow explicit override.

Recommendation: Promote to Narada proper implementation task.

## Required Work

0. Source summary: Staccato observed an operation-intake false positive: its own sent clarification reply from sentitems was routed into staccato-email-marketing as fresh work, producing a retryable clarification_needed item with no proposed action. Sent outbound artifacts should remain reconciliation evidence but not become inbound work by default.
1. Read source inbox envelope env_326f1616-a460-49cc-90ad-6a6a4fefaef6 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Implemented the operation-intake fresh-work boundary in Narada proper.

- Added `operation_intake.fresh_work_boundary` config shape with outbound folder refs and explicit `outbound_folder_behavior`.
- `OperationIntakeContextFormation` now excludes outbound artifact folders (`sentitems`, `sent`, `sent items`, `drafts`, `outbox`) from routed fresh-work formation by default.
- Outbound artifacts remain available as source facts for context, stitching, reconciliation, and audit evidence; Sites may explicitly set `outbound_folder_behavior: "admit"` to allow outbound folders to open routed work.
- Added regression coverage for default sentitems refusal and explicit outbound admission.
- Updated operation-intake docs and troubleshooting text.

Changed files:
- `packages/layers/control-plane/src/foreman/context.ts`
- `packages/layers/control-plane/test/unit/foreman/context.test.ts`
- `packages/layers/control-plane/src/config/types.ts`
- `packages/layers/control-plane/src/config/load.ts`
- `packages/layers/control-plane/src/config/schema.ts`
- `packages/layers/control-plane/config.schema.json`
- `docs/deployment/email-marketing-operation-contract.md`
- `packages/layers/control-plane/docs/09-troubleshooting.md`
- `packages/layers/cli/src/lib/law-sync.ts`
- `.ai/do-not-open/tasks/20260512-1219-report.json`

## Verification

- `pnpm --dir packages/layers/control-plane test test/unit/foreman/context.test.ts` passed: 27 tests.
- `pnpm --dir packages/layers/control-plane typecheck` passed.
- `pnpm --dir packages/layers/control-plane build` passed and regenerated `packages/layers/control-plane/config.schema.json`.
- `pnpm --dir packages/layers/cli test test/commands/law.test.ts` passed: 8 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- `pnpm --dir packages/layers/control-plane test test/unit/config/load.test.ts` could not execute in this shell because the test harness/memfs tries to create `/Users/Andrey/AppData/Local/Temp`; this is an environment temp-path blocker, not an assertion failure.

Lifecycle note:
- `narada task claim` cannot claim this task in the current Narada proper Windows embodiment because no roster projection exists for `architect`, `narada.architect`, or `builder`.
- `narada task finish` therefore cannot consume the report through the normal claimed-task path. Completion evidence is recorded here and in `.ai/do-not-open/tasks/20260512-1219-report.json`.

## Acceptance Criteria

- [x] Proposal handled: Add canonical operation-intake source/direction/principal boundary: exclude self-authored sent/outbound artifacts from fresh work by default, while keeping them available for reconciliation and audit evidence; allow explicit override.
- [x] Recommendation addressed or explicitly rejected: Promote to Narada proper implementation task.
