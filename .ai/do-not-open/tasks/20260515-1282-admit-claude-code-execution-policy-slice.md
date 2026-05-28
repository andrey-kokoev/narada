---
status: closed
depends_on: [1275]
closed_at: 2026-05-15T19:21:42.219Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Admit Claude Code execution policy slice

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1282-1284-claude-code-carrier-stage-2.md

## Goal

Define the governed policy slice required before Claude Code carrier execution can move beyond represented dry-run posture.

## Context

Stage 1 represented Claude Code carrier sessions but intentionally refused runtime execution with runtime_exec_not_admitted:claude-code. Stage 2 must admit a narrow execution policy without granting task, inbox, outbox, repository publication, Site mutation, credential, or native shell authority by implication.

## Required Work

1. Inventory the current Claude Code dry-run result packet and identify the exact execution blockers that must remain versus the one blocker this stage intends to lift.
2. Define an explicit Claude Code execution policy record or config shape that admits launching the Claude Code runtime process while keeping effectful Narada crossings withheld unless separately approved.
3. Add policy readback that explains whether Claude Code execution is admitted, why, and which capabilities remain withheld.
4. Ensure the policy is target-local to Narada proper and does not import User Site or PC runtime authority as proof of admission.

## Non-Goals

- Do not grant Claude Code native shell, task mutation, inbox mutation, outbox transport, repository publication, credential, or external Site authority.
- Do not make Claude Code an agent identity; it remains a carrier runtime.
- Do not repair unrelated Codex or Kimi behavior except where shared code requires a regression fix.

## Execution Notes

- Inventoried the current Claude Code carrier path in `tools/agent-start/start-agent.mjs`: stage 1 already represented Claude Code carrier sessions, startup hydration, Narada proper MCP posture, and refused `--exec` with `runtime_exec_not_admitted:claude-code`.
- Added target-local policy loading for `.narada/agent-carriers/claude-code-execution-policy.v0.json`.
- Added the Narada proper policy record admitting only `claude_code_runtime_process_launch` for `claude_code_carrier` under `target_locus: narada_proper`.
- Added readback on `claude_code_launch.execution_policy` that distinguishes process launch admission from effectful Narada authority.
- Kept task lifecycle, inbox, outbox, repository publication, Site mutation, credential, native shell, and external Site authority explicitly withheld.
- Preserved refusal when the policy file is missing or malformed; temp-site tests prove `--exec` remains refused without the target-local policy.

## Verification

- `node --test tools\agent-start\start-agent.test.mjs` passed with 11 tests.
- `node tools\agent-start\start-agent.mjs narada.builder --runtime claude-code --exec --dry-run --json` returned `claude_code_launch.status: process_launch_policy_admitted`, `execution_admitted: true`, `execution_blocker: null`, and `effectful_narada_authority.admitted: false`.
- The real-site dry-run readback showed policy path `D:\code\narada\.narada\agent-carriers\claude-code-execution-policy.v0.json`, `source_site_runtime_imported: false`, `pc_runtime_authority_imported: false`, and no missing withheld authorities.

## Acceptance Criteria

- [x] A durable policy/config shape exists for the narrow Claude Code execution admission slice.
- [x] Readback distinguishes process launch admission from effectful Narada authority.
- [x] Attempting Claude Code execution without the policy remains refused.
- [x] Tests cover the admitted and refused policy states.
