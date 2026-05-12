# @narada2/site-task-lifecycle

First slice for a receiving-Site task lifecycle package.

This package owns neutral initialization contracts and import-refusal guards. It does not import narada-andrey runtime state, task history, inbox history, rosters, checkpoints, operator-surface bindings, PC-locus state, or secrets.

The first proven Narada proper runtime slice is documented in [`docs/first-slice-extraction.md`](docs/first-slice-extraction.md). The package portion remains pure descriptor/contract code: no SQLite dependency, no package-executed mutation, no source Site import. Concrete sqlite3 execution belongs to an admitted receiving-Site CLI/runtime adapter outside this package.

## Current Slice

- Build a receiving-Site lifecycle directory plan.
- Initialize local receiving-Site directories in a supplied Site root.
- Write a small admission manifest naming local paths and rejected source imports.
- Build an admission contract for the first slice: package/version, local paths, neutral roster source, MCP registration snippet, package verification, identity mapping, refused source paths, and compatibility projection policy.
- Expose descriptor-only MCP facade binding metadata for local tools without registering live transport.
- Project one admitted inbox envelope into a pending task candidate without importing source inbox history.
- Produce neutral task lifecycle schema statements and init plans for a receiving-Site task DB.
- Declare the SQLite boundary as adapter-interface-only; this package does not own a SQLite driver or execute DB mutations.
- Build descriptor-only task admission write requests for a separately admitted receiving-Site adapter.
- Build descriptor/request/result-oriented MCP runtime binding requests constrained by Narada proper authority and adapter capability.
- Define a concrete-adapter conformance contract and neutral in-memory conformance fixture for package tests.
- Compose a descriptor-only receiving-Site setup plan/result from initializer, adapter conformance, DB write request, and MCP runtime binding surfaces.
- Name live-execution admissions required before terminal receiving-Site task-lifecycle functionality can be claimed.
- Preserve the first-slice evidence chain: Narada proper audit, append-only ledger, local mutation evidence, DB readback, and MCP `read_task` proof.
- Refuse narada-andrey runtime DBs, task history, inbox history, and PC-locus paths.
- Require neutral fixture identities.
- Keep compatibility projection neutral when source examples mention narada-andrey-specific legacy tables.

## Out Of Scope

- Live MCP transport registration.
- Importing inbox history rather than projecting one admitted envelope.
- Executing SQLite mutations; this slice returns schema/init plans only.
- Owning a concrete SQLite dependency or driver adapter.
- Confirming DB writes; this package can describe a write request and ready-for-adapter result only.
- Performing live MCP runtime registration.
- Treating the neutral in-memory conformance fixture as a runtime adapter.
- Claiming receiving-Site setup is live before separate execution admissions are present.
- Executing live setup admission checklist items.
- Agent-context hydration or checkpoints.
- Importing any source-Site runtime database or task history.
- PC-locus repair or operator-surface carriers.
- Richer list/query tools, richer lifecycle transitions, cross-Site mutation, OSM policy, or arbitrary SQL execution.
