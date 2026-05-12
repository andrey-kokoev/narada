# Live Execution Admission Checklist

This checklist names the external executions required before Narada proper can claim a live receiving Site task-lifecycle setup.

`@narada2/site-task-lifecycle` remains descriptor-only for this surface. It does not execute initializer writes, admit a concrete adapter, mutate SQLite, or register live MCP transport.

## Required External Admissions

- Initializer execution under receiving Site authority.
- Real adapter admission outside `@narada2/site-task-lifecycle`.
- DB mutation execution under receiving Site task DB authority.
- Live MCP registration under Narada proper MCP/runtime authority.

Each admission must carry evidence, refusal checks, rollback posture, and a terminal criterion. Terminal live Site setup is not claimable until all four external admissions complete and are verified.

## Refusals

Refuse any path that imports narada-andrey DBs, task/inbox history, roster/checkpoint/operator-surface/PC state, secrets, identity-specific data, or source history. Refuse any path that makes this package own a SQLite dependency or execute DB mutation.
