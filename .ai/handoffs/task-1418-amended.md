---
status: claimed
depends_on: [1375]
---

# Add startup sequence first-work onboarding for launched Builder agents

## Chapter

Agent Carrier Startup Continuity

## Goal

Close the gap where newly launched Builder agents hydrate identity/continuity but do not receive governed first-work orientation or an explicit startup handoff target.

## Context

Operator observed that narada.builder2 is admitted and launchable, but onboarding still depends on chat instructions. This should be encoded in the launch packet startup_sequence the same way startup continuity is encoded: hydrate current identity, plan/read checkpoint continuity, then expose governed work orientation for the launched named agent. The immediate case is narada.builder2 starting task 1406, but the fix must be generic for Builder startup and explicit task handoffs.

## Required Work

1. Inspect tools/agent-start/start-agent.mjs, launch packet docs, and Narada proper MCP/task surfaces for current startup_sequence and task handoff/work-next affordances. 2. Specify and implement a startup_sequence continuation step that gives launched Builder agents first-work orientation after continuity hydration, without relying on chat instructions. 3. Support an explicit startup handoff target such as task 1406 so launch does not accidentally select another task through generic work-next when the Operator intended a specific assignment. 4. Preserve authority boundaries: startup may read or plan governed work and may present a claim/read command, but must not silently claim tasks unless the launch packet explicitly admits that mutation. 5. Update launch packet contract docs and focused tests for narada.builder2 showing identity, role, target locus, startup continuity, explicit handoff target, and no Cloudflare/publish/deploy authority. 6. Record residuals for any missing MCP facade tool needed to make this fully native.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Implemented startup first-work orientation in tools/agent-start/start-agent.mjs. The launcher now accepts --startup-task <number>, validates it as a positive integer, and appends first-work orientation after agent_context_hydrate_current and agent_context_memory.plan_hydration. Explicit task handoffs emit a narada_task_read startup_sequence step for the concrete task_number. Generic launches emit narada_task_work_next with claim=false. Both modes carry narada.agent_start.first_work_orientation.v0 and record mutation_attempted=false, claim_attempted=false, and publish_or_deploy_authority_admitted=false.

Updated docs/product/agent-carrier-launch-packet.v0.json to document startup_first_work_orientation and the optional post-continuity startup_sequence work-orientation step. Updated tools/agent-start/start-agent.test.mjs with narada.builder2 coverage for explicit task 1406 handoff and no silent claim or publication authority.

Residual: agent_context_startup_sequence remains the MCP startup affordance for identity and checkpoint continuity. First-work orientation is presently carried in the launch packet startup_sequence for the carrier to execute through narada_task_read or narada_task_work_next. A future MCP-native startup sequence executor could execute the declared steps directly.

## Verification

- node --test tools/agent-start/start-agent.test.mjs: passed, 14 tests.
- node -e "JSON.parse(require('node:fs').readFileSync('docs/product/agent-carrier-launch-packet.v0.json','utf8')); console.log('json ok')": passed, json ok.
- node tools/agent-start/start-agent.mjs narada.builder2 --runtime codex --dry-run --startup-task 1406 --json: passed; packet includes narada_task_read task_number 1406 and startup_first_work_orientation mode explicit_task_handoff with claim_attempted false.

## Acceptance Criteria

- [x] Builder launch packet includes first-work onboarding after continuity hydration.
- [x] Explicit task handoff target is supported without generic work-next misselection.
- [x] Tests cover narada.builder2 startup orientation and preserve no silent claim/publish authority.
