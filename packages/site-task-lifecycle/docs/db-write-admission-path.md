# DB Write Admission Path

This package remains adapter-interface-only. It prepares a task admission write request for an admitted receiving-Site adapter, but it does not own a SQLite dependency and does not execute SQLite mutations.

## Flow

1. A single admitted inbox envelope is projected into a `TaskCandidate`.
2. `buildTaskAdmissionWriteRequest` validates the candidate and local admitting identity.
3. The function refuses source Site DB/history/state references in task evidence.
4. The returned request describes adapter capabilities and write operations.
5. A separately admitted concrete adapter performs the mutation outside this package.
6. `buildTaskAdmissionWriteResult` records the handoff shape as `ready_for_adapter`; it does not confirm database mutation.

## Refusals

The write path refuses source task databases, task history, inbox databases/history, rosters, checkpoints, operator-surface state, PC-locus runtime state, secrets, and non-neutral local identities.

Live MCP registration and SQLite execution remain outside this package until admitted through a concrete adapter boundary.
