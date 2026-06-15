# Crew Startup Shortcut Capability Candidate

Candidate id: `narada-proper.capability.crew-startup-shortcut.v0`

Task: `narada-proper.task-0022`

State: `admitted_candidate`

Exposure class: `descriptor_only`

## Authority Basis

This candidate is admitted from operator-confirmed Narada proper proposal envelope:

- `env_f2c20035-bec3-4790-b223-3fccebc6de24`
- `codex-chat:2026-05-11:operator-propose-narada-proper-lift-crew-startup-shortcuts`

The envelope is proposal evidence only. It does not admit User Site runtime state, shortcut files, process state, workboard state, checkpoint history, secrets, or operator-surface runtime.

## Capability Boundary

Crew startup shortcuts are a governed startup/rehydration capability, not direct substrate convenience authority.

The portable capability should define:

- admissible startup triggers
- target Site/locus selection
- role/agent startup identity requirements
- workboard/hydration evidence required before action
- allowed MCP/Inbox/task-lifecycle surfaces
- missing capability refusal behavior
- carrier/session relation without granting native shell
- audit evidence required for launch/focus/bind/rehydrate actions

## MCP-Only Constraint

Future implementation must compose with Narada proper `agent_execution_policy.default_posture=mcp_only`.

Required behavior:

- shell-like startup actions route through admitted audited MCP/carrier surfaces
- missing MCP capability stops the startup shortcut and reports the missing surface
- native shell fallback is not the normal model
- local shortcut paths are carrier projections, not portable authority

## First Implementation Slice

The first implementation slice should be read-only/descriptor oriented:

- schema for a crew startup shortcut request
- schema for startup plan/status result
- fixture for a valid MCP-only startup plan
- fixture for refused direct native shortcut fallback
- docs explaining how future Sites consume the capability from Narada proper templates

No live launch, focus, bind, or process mutation belongs in this candidate.

## Refusals

This candidate refuses:

- copying User Site shortcut files
- importing User Site runtime state
- importing workboard state or checkpoint history
- direct substrate shortcut execution
- native shell fallback
- PC-locus mutation
- operator-surface runtime copying
- secrets or credentials
- implicit capability grants

## Future Admissions

Future implementation tasks may separately admit:

- descriptor package/API
- MCP request/response surface
- carrier-specific Windows shortcut materialization
- operator-surface launch/focus/bind adapter
- workboard hydration proof surface

Each live carrier action requires its own authority and evidence.
