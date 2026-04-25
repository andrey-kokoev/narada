---
status: closed
closed_by: codex
closed_at: 2026-04-23T15:35:00-05:00
depends_on: [409, 412]
---

# Task 514 - Agent Runtime Boundary Contract

## Goal

Define the agent runtime boundary in Narada terms: principals, roles, sessions, assignments, authority, and evidence.

## Acceptance Criteria

- [x] A boundary contract artifact exists.
- [x] Agent runtime objects are mapped against existing Narada concepts.
- [x] Authority boundaries are explicit.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

Produced boundary contract at `.ai/decisions/20260423-514-agent-runtime-boundary-contract.md` (23KB, 10 sections).

Key findings from codebase review:

1. **Agent runtime is already substantially implemented** — PrincipalRuntime (Task 406), AgentSession (coordinator), AgentTrace (trace store), task governance bridge (Decision 444), and roster/assignment system all exist. Task 514's value is ontological mapping, not new implementation.

2. **Core thesis**: Agent runtime is a composition layer, not a new authority boundary. All agent-facing concepts map to existing Narada canonical objects:
   - Agent → `Principal` of type `"agent"`
   - Session → `AgentSession` (durable SQLite)
   - Assignment → `TaskAssignmentRecord` + roster
   - Work → `WorkItem` + `ExecutionAttempt`
   - Trace → `AgentTrace` (advisory commentary)
   - Health → `PrincipalRuntimeHealth` (advisory signal)

3. **Authority boundaries documented**: 8 permitted actions, 8 forbidden actions, and the golden rule that PrincipalRuntime state does not grant authority.

4. **Control Cycle phase mapping**: Agents participate in phases 4 (Evaluate), 7 (Execute), and 9 (Trace) only. All other phases are kernel-owned.

5. **Verification by inspection**: All 8 claims in §9 verified against existing code with specific file references.

## Verification

- Boundary contract artifact exists: `.ai/decisions/20260423-514-agent-runtime-boundary-contract.md`
- Object mapping table: 14 agent runtime terms → Narada concepts
- Authority table: 8 may-do + 8 must-not-do actions
- Phase mapping: 9 Control Cycle phases with agent role per phase
- Composition architecture diagram documenting read-only vs governed mutation surfaces
- Cross-reference table: 12 related documents/code locations
