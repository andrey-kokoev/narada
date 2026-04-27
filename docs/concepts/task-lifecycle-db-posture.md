# Task Lifecycle Database Posture

## Decision

For the Narada self-build Site, `.ai/task-lifecycle-snapshot.json` is the tracked Git handoff artifact for task lifecycle authority.

The local `.ai/task-lifecycle.db` remains the runtime SQLite authority used by sanctioned Narada commands, but it is ignored Git-local state. It is not a cache, projection, or disposable test fixture while operating locally; it carries governed task lifecycle, assignment, evidence, roster, review, report, reconciliation, and execution records for this repository's own buildout. Git transports that authority through the snapshot artifact, not the binary DB file.

## Rules

- Do not edit `.ai/task-lifecycle.db` directly with ad hoc SQLite shells or scripts.
- Mutate it only through sanctioned Narada commands.
- Before committing lifecycle changes, refresh the tracked handoff with `narada task lifecycle export --output .ai/task-lifecycle-snapshot.json`.
- On a fresh checkout or after pulling a newer snapshot, reconstruct local runtime state with `narada task lifecycle import --input .ai/task-lifecycle-snapshot.json`.
- Treat markdown task files under `.ai/do-not-open/tasks/` as compatibility projections unless a command explicitly says it is amending task specification.
- Do not commit `.ai/task-lifecycle.db`; it is local runtime state.
- `pnpm narada:guard-task-db` is a posture guard only: it checks tracked snapshot and ignored local DB posture, but it does not prove whether local DB changes came from sanctioned commands.

## Rationale

Narada is currently using its own task lifecycle as a live Site. The repository needs a portable authority handoff that avoids binary SQLite merge conflicts without pretending task lifecycle state is disposable.

The snapshot-backed posture keeps local SQLite fast and command-owned, while moving Git synchronization to a deterministic JSON artifact. That aligns task lifecycle state with the same export/import pattern already used for inbox envelopes.

## Snapshot Workflow

Refresh the tracked handoff after sanctioned lifecycle mutations:

```bash
narada task lifecycle export --output .ai/task-lifecycle-snapshot.json
```

Reconstruct local runtime state from the tracked handoff:

```bash
narada task lifecycle import --input .ai/task-lifecycle-snapshot.json
```

Validate repository posture:

```bash
pnpm narada:guard-task-db
```

## Residual Requirements

1. Add automatic snapshot freshness checks that compare local DB state to a freshly generated snapshot without admitting large JSON output.
2. Add a mutation ledger so sanctioned commands can prove provenance more strongly than filesystem posture.
3. Decide whether future multi-Site task lifecycle handoffs should use one full snapshot or append-only lifecycle events.

## Provenance Gap

True direct-mutation prevention requires a DB mutation ledger that sanctioned commands write and ad hoc SQLite mutation cannot forge through normal paths. Until that exists, the guard must not claim stronger provenance than it has.
