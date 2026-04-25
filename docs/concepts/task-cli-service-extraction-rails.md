# Task CLI Service Extraction Rails

Task governance is being extracted from CLI command files into
`@narada2/task-governance`. This document is the migration rail: it names the
current adapter boundary, the remaining command families, and the order in which
they should move.

## Target Boundary

CLI command files may own:

- Commander option parsing and defaulting.
- Cwd resolution and output format selection.
- Human/table/JSON output formatting.
- Process exit code adaptation across package boundaries.

CLI command files must not own:

- lifecycle transition rules;
- evidence admission decisions;
- assignment or roster authority;
- recommendation scoring;
- task graph semantics;
- reconciliation repair semantics;
- direct task-spec mutation rules.

Package services should return bounded, serializable result objects. The CLI
may render those objects, but must not reinterpret their authority outcome.

## Extracted Adapters

| Command | Package Service | Status |
| --- | --- | --- |
| `task close` | `@narada2/task-governance/task-close-service` | Adapter-complete |
| `task allocate` | `@narada2/task-governance/task-allocate-service` | Adapter-complete |
| `task search` | `@narada2/task-governance/task-search-service` | Adapter-complete |

## Remaining Service Families

| Priority | CLI Surface | Target Service Seam | Why First |
| --- | --- | --- | --- |
| 1 | `task claim`, `task continue`, `task release` | `assignment-lifecycle-service` | These commands own the highest-risk roster/lifecycle crossing. |
| 2 | `task report`, `task review`, `task finish` | `work-result-service` + `review-admission-service` | `finish` is still an orchestrator over report, review, evidence, close, and roster. |
| 3 | `task evidence`, `task evidence list` | `evidence-inspection-service` + `evidence-admission-service` | Evidence outcome must be package-owned and CLI-output bounded. |
| 4 | `task roster`, `task recommend`, `task next`, `task promote-recommendation` | `assignment-intent-service` + `recommendation-service` | Agent routing must stop depending on CLI-local interpretation. |
| 5 | `task graph`, `task list`, `task read` | `task-observation-service` | Inspection output needs Observation Artifact Zone admission and hard output limits. |
| 6 | `task create`, `task amend`, `task derive-from-finding` | `task-spec-service` | Specification authority is still transitional and must be cut over carefully. |
| 7 | `task reconcile` | `task-reconciliation-service` | Repair must be package-owned once all target surfaces have service seams. |
| 8 | `task lint` | `task-invariant-service` | Lint should inspect package-owned invariants, not CLI-local shape assumptions. |

## Extraction Rules

1. Move semantics first, then tests. A service extraction is not complete until
   package tests cover the moved rules and the CLI test only proves adapter
   behavior.
2. Export each service through `packages/task-governance/package.json`.
3. Rebuild `@narada2/task-governance` before running CLI typecheck or CLI tests.
4. Keep result objects bounded. Any large observation must become an admitted
   observation artifact, not terminal output.
5. Do not use the CLI command as the service API. The package service owns the
   stable contract; the CLI adapts to it.

## Completion Shape

The migration is complete when task command files are no longer authority
owners. A task command file should be readable as:

1. parse input;
2. call one package service;
3. render the service result;
4. return the service exit code.

If a command needs to call multiple services, it is an orchestrator and should
be classified explicitly. `task finish` is the current canonical example.
