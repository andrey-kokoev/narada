# @narada2/agent-context-memory

Reusable first-slice contracts for Site-local agent-context checkpoint memory.

This package is descriptor-only. It defines named-agent registry fragments, session start contracts, checkpoint and hydration descriptors, schema/init plans, MCP descriptor shapes, capability registry fragments, refusal guards, and neutral conformance fixtures.

It does not own a SQLite dependency, mutate SQLite, import source Site state, hydrate a live runtime, register MCP transport, copy operator-surface or PC runtime state, or carry secrets.

## Identity Doctrine

Named agent identity, role assignment, and claimed runtime identity are distinct:

- `namedAgentId` names a configured Site-local agent participant.
- `roleName` is an assignment or compatibility role and does not rename the agent.
- `claimedIdentity` is runtime evidence only.
- mechanical verification basis must be explicit before a session/checkpoint/hydration contract can be treated as admitted.
- role-name compatibility identities are represented only when explicitly admitted with evidence.

## Current Slice

- Build named-agent registry config fragments.
- Build session start contracts.
- Build checkpoint memory descriptors.
- Build hydration request descriptors.
- Build SQLite schema/init descriptors without executing them.
- Build MCP registration descriptor shape without live registration.
- Build capability registry fragment.
- Refuse source DBs, checkpoint history, rosters, task/inbox state, operator-surface state, PC-locus state, secrets, and identity-specific runtime state.

## Out Of Scope

- Live database mutation.
- Live MCP registration.
- Runtime hydration execution.
- Copying narada-andrey, CPY, Narada proper, operator-surface, or PC runtime state.
- Treating role assignment or claimed identity as naming authority.
