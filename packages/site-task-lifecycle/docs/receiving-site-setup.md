# Receiving-Site Setup Plan

The receiving-Site setup surface composes existing package descriptors into one plan/result pair. It does not execute setup.

The plan includes:

- receiving-Site initializer options and paths;
- adapter conformance evidence;
- task DB init plan;
- task admission write request;
- MCP runtime binding request;
- remaining admissions required before live task-lifecycle functionality exists.

## Non-Execution Boundary

`@narada2/site-task-lifecycle` still owns no SQLite dependency, performs no SQLite mutation, performs no live MCP registration, and imports no source Site state. A receiving Site must separately admit the live initializer execution, concrete adapter execution, DB mutation, and live MCP registration.

## Refusals

Setup planning refuses source task DBs, task/inbox history, rosters, checkpoints, operator-surface state, PC-locus state, secrets, and non-neutral local identities.
