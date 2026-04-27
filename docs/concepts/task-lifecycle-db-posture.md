# Task Lifecycle Database Posture

## Decision

For the Narada self-build Site, `.ai/task-lifecycle.db` is a tracked Site authority artifact.

It is not a cache, projection, or disposable test fixture. It carries governed task lifecycle, assignment, evidence, roster, review, report, reconciliation, and execution records for this repository's own buildout.

## Rules

- Do not edit `.ai/task-lifecycle.db` directly with ad hoc SQLite shells or scripts.
- Mutate it only through sanctioned Narada commands.
- Treat markdown task files under `.ai/do-not-open/tasks/` as compatibility projections unless a command explicitly says it is amending task specification.
- If the repository later moves to an export/import posture, that change must introduce sanctioned export and import commands before removing the DB from the git index.
- Do not `git rm --cached .ai/task-lifecycle.db` as a cleanup shortcut.
- `pnpm narada:guard-task-db` is a posture guard only: it detects tracked/dirty state, but it does not prove whether a dirty DB was changed by sanctioned commands.

## Rationale

Narada is currently using its own task lifecycle as a live Site. Removing the database from versioned state before an equivalent governed export exists would erase the durable authority boundary and push operators back toward direct markdown reconstruction.

The tracked-DB posture is imperfect for merge ergonomics, but it is less incoherent than pretending the SQLite authority is disposable while commands already depend on it.

## Future Cutover

A future cutover may replace the tracked DB with a deterministic export artifact. The first prerequisite now exists:

```bash
narada task lifecycle export --output .ai/task-lifecycle-snapshot.json
narada task lifecycle import --input .ai/task-lifecycle-snapshot.json
```

Remaining cutover requirements:

1. Reconciliation checks proving export/import round trip preserves lifecycle, assignments, evidence admissions, reviews, reports, roster, task specs, command runs, verification runs, repo publication rows, and reconciliation findings.
2. A deterministic policy for when the snapshot is written and committed.
3. An explicit one-time index migration that removes `.ai/task-lifecycle.db` only after the snapshot artifact is the accepted authority handoff.

## Provenance Gap

True direct-mutation prevention requires a DB mutation ledger that sanctioned commands write and ad hoc SQLite mutation cannot forge through normal paths. Until that exists, the guard must not claim stronger provenance than it has.
