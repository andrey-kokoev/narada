---
status: claimed
amended_by: architect
amended_at: 2026-04-30T16:16:51.162Z
---

# Add credential rotation approval boundary and preflight split

## Chapter

Credential Governance and Voice Intake Safety

## Goal

Prevent local credential binding repairs from silently becoming remote secret creation or rotation by introducing an explicit intent/check/approval/execution split.

## Context

Inbox envelope env_77de9362-565d-4690-8ed4-9c2526889a48 records a CAPA incident: while wiring voice transcription, a new Harmonia bearer token was generated and uploaded to Cloudflare Worker secret TRANSCRIPTION_BEARER_TOKEN without explicit Operator approval for rotation. Narada must distinguish bind_existing_secret, create_new_secret, rotate_remote_secret, and set_local_runtime_env.

## Required Work

1. Inspect current credential, capability, secret, setup, doctor/preflight, and voice/operator-surface setup surfaces for paths that can mutate remote secrets or local runtime credential state.
2. Define credential operation kinds for bind_existing_secret, create_new_secret, rotate_remote_secret, and set_local_runtime_env, keeping local binding distinct from remote secret mutation.
3. Introduce or update preflight/doctor output so it reports missing local binding separately from any need to create or rotate a remote secret before mutation occurs.
4. Require explicit Operator approval for remote secret creation or rotation unless the command name, dry-run output, and execution confirmation clearly declare rotation.
5. Ensure adapter/setup commands cannot rotate upstream secrets as an incidental side effect of local wiring.
6. Record the Harmonia 2026-04-30 rotation incident as governed evidence naming affected worker, secret name, local env name, and credential reference without raw token disclosure.
7. Add tests or fixtures proving local binding does not rotate upstream secrets by side effect and explicit rotation approval is required for remote secret changes.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-30T16:16:51.162Z: required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Remote secret creation and rotation are classified as distinct dangerous external effects requiring explicit approval.
- [ ] Preflight distinguishes existing local credential binding, missing local binding, create-new-secret, rotate-remote-secret, and set-local-runtime-env paths.
- [ ] Operator-facing repair suggestions present reuse existing, bind new local value, or rotate remote secret as separate choices.
- [ ] Adapter setup commands cannot rotate upstream secrets as an incidental side effect of local wiring.
- [ ] The Harmonia 2026-04-30 rotation incident is recorded with affected worker, secret name, local env name, and credential reference, without raw token disclosure.
- [ ] Tests or fixtures cover no-rotation local binding and explicit rotation approval behavior.
