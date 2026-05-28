---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:52:16.405Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779054731574_qqxluh
closed_at: 2026-05-17T21:52:38.120Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Crystallize Agent Identity object and schema

## Chapter

Canonical Inbox Promotions

## Goal

Narada doctrine has a clean Agent/Session/Carrier/Substrate/Surface/Channel/Trace split, but implementation vocabulary still mixes agent_id, principal_id, role, runtime, and carrier surfaces. Architect should consider admitting a crystallization task to define a canonical Agent Identity object/schema and migration vocabulary so task, capability, qualification, MCP, and operator-surface surfaces converge.

## Context

Source inbox envelope: env_e709666a-903b-4eaf-9b3c-3c25820ee3b8

Source: agent_report:codex-session:agent-factorization-crystallization-20260517

Envelope kind: observation

Summary: Narada doctrine has a clean Agent/Session/Carrier/Substrate/Surface/Channel/Trace split, but implementation vocabulary still mixes agent_id, principal_id, role, runtime, and carrier surfaces. Architect should consider admitting a crystallization task to define a canonical Agent Identity object/schema and migration vocabulary so task, capability, qualification, MCP, and operator-surface surfaces converge.

Evidence:
- docs/concepts/agent-carrier.md defines Agent as durable Site-recognized identity and separates Session, Carrier, Substrate, Operator Surface, Control Channel, and Trace substrate.
- docs/concepts/agent-carrier.md anti-collapse rules explicitly say a carrier is not an Agent, a Session is not an Agent, a substrate is not an Agent, and a model backend is not Narada authority.
- docs/concepts/runtime-identity-binding.md separates durable identity from volatile substrate handles and carrier evidence such as titles, terminal profiles, launch args, URLs, transcript labels, process ids, and HWNDs.
- docs/product/site-qualification-policy.md frames admission as principal + role + Site + work_class + law_version + capability_class, and says qualification is about admitted work classes, not the whole person or agent.
- Current CLI and code surfaces still use agent_id, principal_id, role, runtime identity, and carrier/session terms unevenly across task lifecycle, capability, qualification, MCP startup evidence, operator-surface identity, and work-next outputs.

Proposal:
- Admit an Architect task to crystallize a canonical Agent Identity object/schema: Site-scoped durable identity plus role bindings, lifecycle/history refs, law receipt posture, capability posture, qualification posture, and session/carrier trace refs.
- Define exclusion rules in the schema: Agent Identity is not a Session, Carrier, model substrate, tool surface, terminal/window/profile, control channel, prompt, transcript, route, or capability channel.
- Produce a vocabulary migration map for task lifecycle, capability consent, qualification, MCP startup evidence, operator-surface identity, and work-next outputs that explains when to use agent_id, principal_id, role_id, carrier_session_id, runtime_id, and identity_id.
- Add at least one doctrine fixture showing narada.builder embodied by a Codex carrier session, with principal/role/capability/qualification/runtime fields kept distinct.
- Classify whether this is pure doctrine/spec work or requires follow-up CLI/schema implementation tasks; avoid renaming public flags until compatibility posture is specified.

Recommendation: Architect should create or route a bounded crystallization task before more carrier/native-agent work lands, because this vocabulary blur affects review identity, capability binding, qualification gates, startup packets, and operator-surface routing.

## Required Work

0. Source summary: Narada doctrine has a clean Agent/Session/Carrier/Substrate/Surface/Channel/Trace split, but implementation vocabulary still mixes agent_id, principal_id, role, runtime, and carrier surfaces. Architect should consider admitting a crystallization task to define a canonical Agent Identity object/schema and migration vocabulary so task, capability, qualification, MCP, and operator-surface surfaces converge.
1. Read source inbox envelope env_e709666a-903b-4eaf-9b3c-3c25820ee3b8 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Added `docs/product/agent-identity.v0.md` as the canonical Agent Identity object contract.
- The contract defines Site-scoped durable Agent Identity, separates it from Session, Carrier, substrate, Operator Surface, control channel, capability grant, qualification, and task assignment, and records the consumer resolution order.
- Added the vocabulary migration map for `agent_identity_id`, `agent_id`, `principal_id`, `role_id`, `carrier_session_id`, `runtime_id`, and `identity_id`.
- Added fixture `docs/product/fixtures/agent-identity/narada-builder-codex-session.valid.json` showing `narada.builder` embodied by a Codex carrier session while keeping principal, role, capability, qualification, runtime, surface, channel, and trace references distinct.
- Cross-linked the new contract from `docs/concepts/agent-carrier.md` and `AGENTS.md`.
- Classified this task as doctrine/spec plus fixture work only; public CLI flags, database columns, and package APIs remain unchanged until a separate compatibility task is admitted.

## Verification

- `narada test-run run --task 1487 --cmd 'node -e "JSON.parse(require(\"fs\").readFileSync(\"docs/product/fixtures/agent-identity/narada-builder-codex-session.valid.json\",\"utf8\"))"' --cwd D:\code\narada --format json` passed as `run_1779054685418_nk1efj`.
- `narada test-run run --task 1487 --cmd 'rg -n agent_identity_id docs/product/agent-identity.v0.md docs/product/fixtures/agent-identity/narada-builder-codex-session.valid.json' --cwd D:\code\narada --format json` passed as `run_1779054680519_2cqvcg`.
- `narada test-run run --task 1487 --cmd 'rg -n "Agent Identity Object" docs/product/agent-identity.v0.md docs/concepts/agent-carrier.md AGENTS.md' --cwd D:\code\narada --format json` passed as `run_1779054680520_f8o3pb`.
- Earlier PowerShell-nested quoting attempts failed before exercising product behavior; the passing runs above are the admitted verification evidence.

## Acceptance Criteria

- [x] Proposal handled: Admit an Architect task to crystallize a canonical Agent Identity object/schema: Site-scoped durable identity plus role bindings, lifecycle/history refs, law receipt posture, capability posture, qualification posture, and session/carrier trace refs.
- [x] Proposal handled: Define exclusion rules in the schema: Agent Identity is not a Session, Carrier, model substrate, tool surface, terminal/window/profile, control channel, prompt, transcript, route, or capability channel.
- [x] Proposal handled: Produce a vocabulary migration map for task lifecycle, capability consent, qualification, MCP startup evidence, operator-surface identity, and work-next outputs that explains when to use agent_id, principal_id, role_id, carrier_session_id, runtime_id, and identity_id.
- [x] Proposal handled: Add at least one doctrine fixture showing narada.builder embodied by a Codex carrier session, with principal/role/capability/qualification/runtime fields kept distinct.
- [x] Proposal handled: Classify whether this is pure doctrine/spec work or requires follow-up CLI/schema implementation tasks; avoid renaming public flags until compatibility posture is specified.
- [x] Recommendation addressed or explicitly rejected: Architect should create or route a bounded crystallization task before more carrier/native-agent work lands, because this vocabulary blur affects review identity, capability binding, qualification gates, startup packets, and operator-surface routing.
