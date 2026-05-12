# Adapter Conformance

`@narada2/site-task-lifecycle` remains adapter-interface-only. It defines a conformance contract that a receiving Site can use when admitting a concrete task DB adapter outside this package.

## Package Boundary

The package owns:

- the adapter interface;
- the conformance contract shape;
- neutral tests using an in-memory fixture;
- refusal checks for source Site DB/history/state references.

The package does not own:

- a SQLite dependency;
- a concrete storage adapter;
- live database mutation;
- source Site state import.

## Receiving-Site Adapter Admission

A receiving Site that wants live task-lifecycle writes must admit a concrete adapter under its own authority. That adapter must provide:

- `executeSchemaStatement`;
- `executeAdmissionWriteOperation`;
- evidence that it does not import source Site DBs, task/inbox history, rosters, checkpoints, operator-surface state, PC-locus state, secrets, or identity-specific data;
- rollback and closeout evidence for any real DB mutation it performs.

The neutral in-memory fixture used by package tests is not a runtime adapter and is not evidence of SQLite mutation readiness.
