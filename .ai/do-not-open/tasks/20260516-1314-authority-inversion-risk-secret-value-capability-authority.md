---
status: closed
closed_at: 2026-05-16T00:38:45.612Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Authority inversion risk: secret-value-capability-authority

## Chapter

Canonical Inbox Promotions

## Goal

Secret values can still appear in command history, logs, or chat if command/output admission does not classify them as capabilities.

## Context

Source inbox envelope: env_6cfa09a7-e4c4-49b0-a47b-ab59569c0da6

Source: system_observation:coherence-scan:authority-inversion-secret-value-capability-authority

Envelope kind: task_candidate

Summary: Secret values can still appear in command history, logs, or chat if command/output admission does not classify them as capabilities.

Evidence:
- visible_artifact=Secret strings, env vars, redacted output, and copied tokens
- hidden_authority=Secret authority belongs to capability lifecycle: creation, reveal, use, rotation, revocation, and audit.
- current_guard=Capability-governed secret management doctrine and redaction posture.
- candidate_tasks=992

Recurrence severity: medium
Recurrence key: task_candidate:system_observation:coherence-scan:authority-inversion-secret-value-capability-authority
Prior related envelopes: env_1fa57ec0-7ae1-45b0-8b83-46f3a701e97b

## Required Work

0. Source summary: Secret values can still appear in command history, logs, or chat if command/output admission does not classify them as capabilities.
1. Read source inbox envelope env_6cfa09a7-e4c4-49b0-a47b-ab59569c0da6 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Read the promoted source envelope context for `env_6cfa09a7-e4c4-49b0-a47b-ab59569c0da6` from task context and inbox mutation evidence. The authority context is a system-observed coherence-scan task candidate promoted by Architect into Narada proper task 1314.
- Owning boundary: authority-inversion coherence scanning in `packages/layers/cli/src/commands/coherence-scan.ts`. The scanner may submit inert inbox observations/task candidates; it does not own secret lifecycle, credential reveal, command execution, or capability grants.
- Added a bounded secret-like artifact detector to the authority-inversion module. It scans changed text artifacts only, reports file path plus pattern class, and records `value_recorded=false` instead of matched secret material.
- Routed the finding to capability-governed secret management guidance: replace raw values with credential/capability references and route reveal/use/rotation through capability lifecycle.
- Added focused test coverage proving secret-like changed artifacts are flagged without persisting the raw token value.

## Verification

- `pnpm vitest run packages/layers/cli/test/commands/coherence-scan.test.ts` failed before executing code because the Windows shell did not have `/usr/bin/git`; reran with `NARADA_GIT_BINARY=git`.
- `$env:NARADA_GIT_BINARY='git'; pnpm vitest run packages/layers/cli/test/commands/coherence-scan.test.ts` passed with 9 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Source inbox envelope env_6cfa09a7-e4c4-49b0-a47b-ab59569c0da6 is handled through a governed task handoff.
- [x] Implementation does not bypass Narada authority boundaries.
- [x] Verification evidence is recorded before closure.
- [x] Residuals or blockers are reported explicitly.
