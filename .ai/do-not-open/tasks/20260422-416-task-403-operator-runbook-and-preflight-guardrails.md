---
status: closed
closed_at: 2026-04-22
depends_on: [399, 400, 401, 402]
---

# Task 416 — Task 403 Operator Runbook and Preflight Guardrails

## Execution Mode

Direct execution is allowed. This is a documentation and guardrail task.

Do not execute the live dry run. Do not use real credentials. Do not inspect private mailbox content.

## Assignment

Prepare Task 403 for human/operator execution by creating a precise runbook and adding any missing preflight guardrails needed to prevent accidental unbounded processing or Klaviyo mutation.

## Context

Task 403 is operator-gated. It requires real Graph credentials, live mailbox access, and human selection of one controlled campaign-request thread. A coding agent must not execute it autonomously.

The useful agent work before live execution is:
- make the operator steps explicit;
- verify command surfaces are understandable;
- ensure failure modes are safe;
- ensure no-effect boundaries are inspectable.

## Required Reading

- `.ai/do-not-open/tasks/20260422-403-controlled-live-input-and-dry-run-execution.md`
- `.ai/do-not-open/tasks/20260422-399-live-dry-run-boundary-contract.md`
- `docs/deployment/email-marketing-live-dry-run-boundary-contract.md`
- `docs/deployment/email-marketing-operation-contract.md`
- `docs/deployment/klaviyo-intent-boundary.md`
- `docs/deployment/windows-site-real-cycle-wiring.md`
- `docs/deployment/operator-console-fit.md`
- `packages/layers/cli/src/commands/cycle.ts`
- `packages/layers/cli/src/commands/doctor.ts`
- `packages/sites/windows/src/runner.ts`
- `packages/sites/windows/src/cycle-coordinator.ts`

## Required Work

1. Create an operator runbook.

   Create:
   - `docs/deployment/email-marketing-live-dry-run-runbook.md`

   It must include:
   - prerequisites;
   - environment variables / credential sources to check;
   - config file locations;
   - how to choose exactly one controlled thread;
   - command sequence for doctor/preflight/cycle/status/inspection;
   - expected success outputs;
   - expected safe failure outputs;
   - rollback/cleanup instructions;
   - explicit no-Klaviyo-mutation verification.

2. Define bounded input guardrails.

   The runbook must require:
   - one mailbox/source only;
   - one selected thread or equivalent narrow selector;
   - allowed sender check;
   - no unbounded inbox sweep;
   - no auto-approval;
   - no effect execution beyond campaign brief / missing-info draft.

3. Audit command surfaces.

   Check whether existing CLI surfaces can support the runbook:
   - `narada doctor`
   - `narada cycle`
   - `narada status`
   - `narada ops`
   - any relevant Windows Site command

   If a command is missing a necessary dry-run/preflight flag, document it as a blocker or add a minimal guard if safe.

4. Audit no-effect path.

   Confirm from code/docs that:
   - Klaviyo adapter execution is not present or not wired;
   - `campaign_brief` is document-only in v0;
   - `approve-draft-for-send` does not apply to `campaign_brief`;
   - send/publish cannot happen during Task 403.

5. Update Task 403.

   Add a short reference to the runbook and any explicit human/operator inputs required.

## Non-Goals

- Do not execute Task 403.
- Do not use real credentials.
- Do not read private mailbox data.
- Do not implement Klaviyo API calls.
- Do not send or publish anything.
- Do not create private ops data in the public repo.
- Do not create derivative task-status files.

## Verification

Use focused checks only.

Suggested:

```bash
pnpm verify
```

If code is changed, also run the smallest relevant focused test suggested by `narada verify suggest`.

## Acceptance Criteria

- [x] Runbook exists at `docs/deployment/email-marketing-live-dry-run-runbook.md`.
- [x] Runbook includes exact operator inputs required before Task 403 can run.
- [x] Runbook includes bounded input guardrails.
- [x] Runbook includes command sequence and expected outputs.
- [x] Runbook includes explicit no-Klaviyo-mutation verification.
- [x] Task 403 references the runbook and remains operator-gated.
- [x] No live credentials or private mailbox data are committed.
- [x] No derivative task-status files are created.
