# Do Not Open

This directory contains compatibility projections for Narada task authority.

Operator and agent contract:

- Do not read task artifacts here directly for task state.
- Do not edit task artifacts here directly for task mutation.
- Use `narada task read` for task inspection.
- Use `narada task create` for task creation.
- Use `narada task amend` for task specification changes.
- Use `narada task evidence inspect|prove-criteria|admit|list` for evidence.
- Use `narada task claim|report|review|close|finish` for lifecycle crossings.
- Use `narada task reconcile inspect|record|repair` for projection repair.

The files below remain present because the current repository still uses a
normal filesystem checkout. A normal checkout cannot technically prevent a
human or process from opening a file. Narada therefore treats direct access as
an inadmissible substrate bypass and makes sanctioned command paths the
governed boundary.

Detectable repair classes currently include:

- SQLite lifecycle versus markdown status drift.
- Missing `task_specs` authority rows with markdown projection present.
- Terminal lifecycle state without complete evidence.
- Stale roster assignment versus lifecycle/assignment authority.
- Duplicate task-number ownership.

If a new direct-edit failure mode appears, add it to reconciliation as a
detectable finding instead of making task files authoritative again.
