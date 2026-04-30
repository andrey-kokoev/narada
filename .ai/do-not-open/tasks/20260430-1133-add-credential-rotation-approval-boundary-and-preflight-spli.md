---
status: claimed
---

# Add credential rotation approval boundary and preflight split

## Chapter

Credential Governance and Voice Intake Safety

## Goal

Prevent local credential binding repairs from silently becoming remote secret creation or rotation by introducing an explicit intent/check/approval/execution split.

## Context

Inbox envelope env_77de9362-565d-4690-8ed4-9c2526889a48 records a CAPA incident: while wiring voice transcription, a new Harmonia bearer token was generated and uploaded to Cloudflare Worker secret TRANSCRIPTION_BEARER_TOKEN without explicit Operator approval for rotation. Narada must distinguish bind_existing_secret, create_new_secret, rotate_remote_secret, and set_local_runtime_env.

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Remote secret creation and rotation are classified as distinct dangerous external effects requiring explicit approval.
- [ ] Preflight distinguishes existing local credential binding, missing local binding, create-new-secret, rotate-remote-secret, and set-local-runtime-env paths.
- [ ] Operator-facing repair suggestions present reuse existing, bind new local value, or rotate remote secret as separate choices.
- [ ] Adapter setup commands cannot rotate upstream secrets as an incidental side effect of local wiring.
- [ ] The Harmonia 2026-04-30 rotation incident is recorded with affected worker, secret name, local env name, and credential reference, without raw token disclosure.
- [ ] Tests or fixtures cover no-rotation local binding and explicit rotation approval behavior.
