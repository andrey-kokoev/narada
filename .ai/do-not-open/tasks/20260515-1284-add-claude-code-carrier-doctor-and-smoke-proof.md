---
status: closed
depends_on: [1275]
closed_at: 2026-05-15T19:22:27.719Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add Claude Code carrier doctor and smoke proof

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1282-1284-claude-code-carrier-stage-2.md

## Goal

Provide readback and smoke-proof surfaces for Claude Code stage-2 readiness.

## Context

Operators and reviewers need a bounded way to determine whether Claude Code is represented only, policy-admitted for process launch, or actually attempted, without reading SQLite directly.

## Required Work

1. Add or extend doctor/readback output for Claude Code carrier readiness, policy posture, latest launch evidence, latest process attempt evidence, and withheld capabilities.
2. Add a smoke-proof command or fixture that exercises dry-run, refused exec, and policy-admitted launch planning without requiring live Claude Code installation.
3. Document the exact command sequence a Builder or Architect should use to verify readiness.
4. Ensure readback never treats process launch as task/inbox/outbox/publication authority.

## Non-Goals

- Do not assert full interactive Claude Code usability in this stage.
- Do not require external network or account credentials.
- Do not close stage 3 interaction/resume/handoff work.

## Execution Notes

- Extended the Claude Code carrier launch packet with `claude_code_readiness` readback in `tools/agent-start/start-agent.mjs`.
- Readiness reports represented-only versus process-launch-policy-admitted posture without direct SQLite inspection.
- Readiness includes policy posture, latest launch evidence path, latest process-attempt evidence path, current planned process-attempt path, smoke-proof commands, and the explicit withheld authority list.
- Added filesystem readback of latest `.narada/crew/agent-start-results/*.result.json` and `.narada/crew/agent-process-attempts/*.claude-code.process-attempt.json` evidence.
- Added tests covering represented dry-run readiness, refused exec without policy, policy-admitted launch planning, and readback of latest launch/process-attempt evidence in a temp Site.
- Preserved the rule that process launch readiness does not admit task, inbox, outbox, publication, Site mutation, credential, native shell, or external Site authority.

## Verification

- `node --test tools\agent-start\start-agent.test.mjs` passed with 12 tests.
- `node tools\agent-start\start-agent.mjs narada.builder --runtime claude-code --exec --dry-run --json` returned `claude_code_readiness.readiness_state: process_launch_policy_admitted`.
- The same dry-run returned `direct_sqlite_inspection_required: false`, smoke-proof commands, `current_process_attempt_path`, policy posture, and withheld authorities including task lifecycle, inbox, outbox, repository publication, Site mutation, credential, native shell, and external Site authority.
- Stage-2 verification commands recorded for Builder/Architect use: `node --test tools\agent-start\start-agent.test.mjs`, `node tools\agent-start\start-agent.mjs narada.builder --runtime claude-code --dry-run --json`, and `node tools\agent-start\start-agent.mjs narada.builder --runtime claude-code --exec --dry-run --json`.

## Acceptance Criteria

- [x] Doctor/readback reports Claude Code readiness state without direct SQLite inspection.
- [x] Smoke proof covers dry-run, refused exec, and policy-admitted launch planning.
- [x] Readback lists withheld authorities explicitly.
- [x] Stage-2 verification commands are recorded in the task report.
