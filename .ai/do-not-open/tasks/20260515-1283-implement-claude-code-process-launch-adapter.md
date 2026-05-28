---
status: closed
depends_on: [1275]
closed_at: 2026-05-15T19:22:03.307Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement Claude Code process launch adapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1282-1284-claude-code-carrier-stage-2.md

## Goal

Implement the smallest actual Claude Code carrier process launch path behind the admitted execution policy.

## Context

The existing launcher can represent Claude Code carrier sessions but refuses exec. This task should add the minimal execution adapter while preserving launch packet evidence, startup hydration, MCP approval boundaries, and no-authority claims.

## Required Work

1. Add a Claude Code runtime command adapter that builds argv/environment from the canonical carrier launch packet.
2. Gate adapter execution on the stage-2 Claude Code execution policy.
3. Materialize agent start event, carrier session evidence, launch result packet, and process attempt evidence before spawning or handing off to the runtime.
4. Ensure the adapter passes only the target-local Narada proper MCP startup affordance and withheld capability posture into the carrier environment.

## Non-Goals

- Do not require Claude Code to be installed for unit tests.
- Do not add autonomous task selection or mutation inside the carrier.
- Do not bypass existing command execution intent or shell policy boundaries for arbitrary commands.

## Execution Notes

- Extended `tools/agent-start/start-agent.mjs` with a Claude Code process adapter readback behind the target-local execution policy from task 1282.
- The adapter builds the runtime command from the canonical carrier launch packet: command `claude`, argv from `runtimeArgsFor`, startup affordance `agent_context_hydrate_current`, and environment projection from `required_environment`.
- Added planned process-attempt evidence in dry-run output and a `writeClaudeCodeProcessAttempt` path for real `--exec` runs.
- Real `--exec` now writes launch result evidence and a `.narada/crew/agent-process-attempts/*.claude-code.process-attempt.json` record before spawning the Claude Code runtime.
- The process-attempt evidence records only the Narada carrier environment projection, marks raw secret values as not recorded, and preserves the withheld task/inbox/outbox/publication/Site/credential/native-shell/external-Site authorities.
- The existing no-policy path still refuses `claude-code --exec` with `runtime_exec_not_admitted:claude-code`.

## Verification

- `node --test tools\agent-start\start-agent.test.mjs` passed with 12 tests.
- `node tools\agent-start\start-agent.mjs narada.builder --runtime claude-code --exec --dry-run --json` passed and returned `claude_code_process_adapter.status: ready`.
- The same dry-run returned `claude_code_process_attempt.status: planned_not_spawned`, command `claude`, an empty argv, `process_launch_admitted: true`, `raw_secret_values_recorded: false`, and recorded `NARADA_AGENT_ID`, `NARADA_AGENT_START_EVENT_ID`, `NARADA_CARRIER_SESSION_ID`, `NARADA_SITE_ROOT`, `NARADA_AGENT_CONTEXT_DB`, and `NARADA_PC_SITE_ROOT`.
- Test coverage writes and reads a real process-attempt file in a temp Site, proving the launch result and process-attempt evidence are reconstructable before spawn handoff without requiring Claude Code to be installed.

## Acceptance Criteria

- [x] Claude Code exec path is reachable only when the policy admits it.
- [x] The launch adapter emits reconstructable launch and process-attempt evidence.
- [x] The runtime environment contains agent/session/startup evidence and no unintended authority-bearing secrets.
- [x] Focused tests prove refusal without policy and planned launch with policy.
