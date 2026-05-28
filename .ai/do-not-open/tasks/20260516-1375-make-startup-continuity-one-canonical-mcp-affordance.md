---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T14:43:06.279Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria proven by focused verification commands recorded in .ai/tmp/task-1375-report.json and direct JSON-RPC smoke of agent_context_startup_sequence.
closed_at: 2026-05-16T14:51:14.330Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Make startup continuity one canonical MCP affordance

## Goal

Replace hydrate-only startup with an agent_context_startup_sequence MCP affordance that performs launcher hydration plus advisory checkpoint continuity.

## Context

Operator observed run startup sequence only called agent_context_hydrate_current, so memory checkpoint continuity was not loaded despite startup_sequence metadata. Critical review found the active AGENTS instruction, launch packet, MCP surfaces, carrier affordance/readback code, and tests still present hydrate_current as the startup command.

## Required Work

Add agent_context_startup_sequence as the startup command, keep hydrate_current as a read-only primitive, align AGENTS/docs/launch packet/carrier surfaces/tests, and verify the wrapper returns hydrate, memory plan, and optional checkpoint summary without mutation or runtime hydration.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Implemented `agent_context_startup_sequence` in the Narada proper MCP package as the canonical read-only startup affordance. The wrapper hydrates launcher/site identity evidence, plans advisory checkpoint continuity from the verified `agent_id`, and reads the selected checkpoint summary when available.

Updated the active startup instruction, launch packet contract, carrier affordance/readback helpers, Narada-native harness posture, and focused tests so the operator-facing startup command is `agent_context_startup_sequence` while `agent_context_hydrate_current` remains exposed as a diagnostic primitive.

Left unrelated pre-existing dirty worktree changes untouched.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` - passed, 22 tests.
- `pnpm --filter @narada2/narada-proper-mcp typecheck` - passed.
- `node --test tools\agent-start\start-agent.test.mjs` - passed, 12 tests.
- `node --test tools\agent-start\claude-code-affordance.test.mjs tools\agent-start\claude-code-live-runtime.test.mjs tools\narada-native-carrier\harness.test.mjs tools\narada-native-carrier\launch-command-posture.test.mjs` - passed, 11 tests.
- `pnpm --dir packages/layers/cli test -- test/docs/agent-carrier-contract.test.ts` - passed, 3 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` - passed, 135 tests.
- JSON-RPC smoke through `node --import tsx packages/narada-proper-mcp/src/main.ts` calling `agent_context_startup_sequence` - passed; returned `hydrate_current`, `memory_plan`, `checkpoint_summary`, `startupSequenceExecuted=true`, `checkpointSummaryLoaded=true`, `mutationAttempted=false`, and `runtimeHydrationExecuted=false`.

## Acceptance Criteria

- [x] Generated launch packets expose startup_command_name agent_context_startup_sequence.
- [x] AGENTS startup instruction names agent_context_startup_sequence, not hydrate_current.
- [x] Narada proper MCP exposes agent_context_startup_sequence and executing it returns hydrate_current, memory_plan, and checkpoint_summary/null.
- [x] Existing hydrate_current remains exposed as a read-only diagnostic primitive.
- [x] Focused MCP, launch packet, and carrier tests pass.
