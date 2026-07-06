---
task_number: 1521
status: opened
created_at: 2026-07-06
---

# Architect: Implement NARS Affordance Action Request Boundary

## Chapter

NARS affordance action boundary.

## Goal

Implement a generic NARS protocol path for operator-triggered MCP surface affordance actions. The first slice should admit only read-only or idempotent tool-target actions and should explicitly refuse or require confirmation for mutating, destructive, high-danger, or authority-expanding actions.

## Context

Recent AgentWebUI work made MCP surface affordances visible, but visible affordances are not yet executable through a coherent Narada-owned boundary. The next sustained-entropy-gain step is not to add more one-off panels; it is to define and implement the generic path from rendered affordance to NARS frame to carrier runtime to MCP fabric.

Grounding references:

- `docs/concepts/nars-client-projection-contract.md`
- `docs/concepts/nars-runtime-contract.md`
- `docs/concepts/operator-surface-action-posture.md`
- `packages/nars-client-projection-contract/src/nars-client-projection-contract.mjs`
- `packages/carrier-runtime/src/runtime-dependencies.mjs`
- `packages/carrier-runtime/src/surface-affordances.mjs`
- `packages/agent-web-ui/src/app/components/GenericAffordancePanel.vue`
- `packages/agent-web-ui/src/app/lib/narsFrames.ts`

## Required Work

1. Add an admitted NARS frame method for `session.affordance.action.request` in the client projection contract, including a frame builder and focused contract tests.
2. Define the request payload shape with explicit `surface_id`, `action_id`, optional structured `args`, optional client correlation id, and no broad command strings.
3. Add carrier runtime handling that resolves the current `session.surface_affordances` projection, validates the requested surface/action pair, and refuses unknown or stale affordances with structured evidence.
4. Classify each action using the declared affordance posture/danger metadata. Execute only read-only or idempotent actions in this first implementation slice.
5. For mutating, destructive, high-danger, or confirmation-required actions, emit a structured refusal or confirmation-required event and do not call the target MCP tool.
6. Route admitted action execution through the existing MCP fabric authority. Do not add browser-direct MCP calls and do not route the request through a model prompt.
7. Wire `GenericAffordancePanel` so executable read-only actions render as controls that send the NARS frame and display pending/result/refusal state.
8. Emit durable runtime events for action requested, result, refusal, and confirmation-required outcomes.
9. Add focused tests covering the contract builder, runtime validation/refusal behavior, successful read-only execution, mutating-action refusal, and AgentWebUI frame emission.

## Non-Goals

- Do not implement generic browser-to-MCP direct calls.
- Do not execute mutating, destructive, high-danger, or authority-expanding affordance actions in this slice.
- Do not add Graph Mail or other domain-specific browser mutation controls as part of this task.
- Do not migrate every legacy bespoke affordance panel.
- Do not treat affordance declarations as authority grants; MCP policy and runtime authority remain authoritative.

## Execution Notes

No implementation yet.

## Verification

Recommended focused verification:

- `pnpm --filter @narada2/nars-client-projection-contract test`
- `pnpm --filter @narada2/carrier-runtime test`
- `pnpm --filter @narada2/agent-web-ui test`
- `pnpm --filter @narada2/agent-web-ui typecheck`

## Acceptance Criteria

- `session.affordance.action.request` is part of the NARS client projection contract and has a tested frame builder.
- Runtime rejects unknown surface/action requests with a structured refusal event.
- Runtime can execute an admitted read-only or idempotent affordance action through MCP fabric and emit a durable result event.
- Runtime refuses or requires confirmation for mutating, destructive, high-danger, or confirmation-required actions without invoking the target MCP tool.
- AgentWebUI sends a NARS protocol frame from `GenericAffordancePanel`; it does not call MCP directly.
- Focused tests cover contract, runtime, and WebUI wiring.
