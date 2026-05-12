# ADR 0001: SQLite Adapter Boundary

## Status

Accepted for task-0001 first package slice.

## Context

`@narada2/site-task-lifecycle` has earned neutral task lifecycle contracts, import-refusal guards, MCP descriptor metadata, inbox-envelope projection, and task DB schema/init plans. It has not earned live receiving-Site storage authority, a runtime SQLite driver choice, or a DB write/admission path.

The next implementation fork is whether the package owns a SQLite dependency, exposes an adapter interface only, or ships both.

## Decision

Use an adapter interface only.

The package does not own a SQLite dependency and does not execute SQLite mutations in this slice. It exports the neutral schema/init plan and a typed adapter boundary describing required future capabilities:

- execute schema statements;
- insert task records;
- record admission events.

An admitted receiving-Site runtime or separate storage package must provide the concrete SQLite adapter before DB writes are admitted.

## Rejected Alternatives

- Own a SQLite dependency here: rejected because driver choice and native/runtime posture belong to the receiving Site or admitted storage substrate.
- Ship both dependency and adapter: rejected for now because it would create two authority paths before the DB write/admission path is admitted.
- Import source Site DBs or task history: rejected because external source state remains evidence only, not receiving-Site truth.

## Refusal Guards

The package continues to refuse source task DBs, task history, inbox DB/history, rosters, checkpoints, operator-surface state, PC-locus state, secrets, and identity-specific data. Tests cover adapter-boundary source import findings and confirm package metadata has no SQLite runtime dependency.

## Consequences

The DB write/admission path remains blocked on an admitted adapter implementation. MCP runtime binding may expose descriptor metadata, but live mutation still requires the adapter capability and task admission surface.
