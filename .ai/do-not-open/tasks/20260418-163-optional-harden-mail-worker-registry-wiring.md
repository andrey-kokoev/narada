# Task 163: Optional Hardening For Mail Worker Registry Wiring

## Why

Task 150 registered mail outbound workers in `WorkerRegistry`, but review found the proof is weaker than the implementation. Current tests prove generic workers can coexist in one registry, but they do not prove the daemon registers the actual mail workers it later drains.

There is also duplicated string ownership for worker IDs in daemon service registration and dispatch.

## Goal

Make mail worker registry wiring mechanically harder to regress.

## Scope

This is hardening, not architecture redesign.

## Findings To Address

### 1. Daemon-level proof is missing

Current code registers:

- `send_reply`
- `non_send_actions`
- `outbound_reconciler`

and dispatch drains those IDs.

But the existing test only registers fake workers in `DefaultWorkerRegistry`; it does not instantiate daemon dispatch dependencies and assert the real daemon worker registry contains the actual mail workers.

### 2. Worker IDs are duplicated

The same worker IDs appear in registration and dispatch:

- registration: `send_reply`, `non_send_actions`, `outbound_reconciler`
- dispatch drain loop: same strings repeated

A typo or future rename could leave a worker registered but never drained.

## Deliverables

- Add a shared constant for daemon outbound worker IDs, e.g. `OUTBOUND_WORKER_IDS`.
- Use the constant for both registration and dispatch.
- Add a daemon test that initializes dispatch dependencies enough to inspect the actual `workerRegistry`.
- Assert the registry contains:
  - `process_executor`
  - `send_reply`
  - `non_send_actions`
  - `outbound_reconciler`
- Assert outbound worker IDs used for dispatch come from the same constant.
- Keep behavior unchanged.

## Definition Of Done

- [ ] Worker IDs are not duplicated between registration and dispatch.
- [ ] Daemon-level test proves actual mail workers are registered.
- [ ] Test proves dispatch uses the shared outbound worker ID list.
- [ ] `pnpm --filter @narada2/daemon typecheck` passes.
- [ ] Relevant daemon unit test passes.
- [ ] No derivative task-status files are created.
