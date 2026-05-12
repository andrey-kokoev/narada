# Package Implementation Task Surface Admission

Decision id: `narada-proper.admission.surface.package-implementation-task.v0`
Inbound OSM: `osm_20260509_232723_010_8f572b98`
Decision: `admitted_surface_missing_mutation_mechanism`
Surface: `.narada/surfaces/package-implementation-task-surface.md`
Recorded: 2026-05-10

## Decision

Admit a minimal Narada proper markdown authority surface that can own task-0001 implementation admission decisions and closeout gates.

Implementation remains blocked because the surface does not yet have an admitted package source mutation mechanism.

## Surface Details

- Surface id: `narada-proper.surface.package-implementation-task.v0`
- Task id: `narada-proper.task-0001`
- Task path: `.narada/tasks/task-0001-site-task-lifecycle-first-slice.md`
- Candidate packet: `.narada/admission/candidates/site-task-lifecycle-first-slice-candidate.md`
- Prior blocking evidence: `.narada/admission/decisions/task-0001-implementation-admission.md`

## Authority Basis

The surface is admitted under Narada proper `.narada` seed/intake authority. It does not broaden the existing root admission.

No implementation root is admitted by this surface admission:

- `/home/andrey/src/narada`: canonical authority root, still not reached through an admitted carrier.
- `D:\code\narada`: seed/intake evidence root only, not package implementation root.

## Changed-File Scope

If a future implementation admission occurs, scope is limited to:

- `packages/site-task-lifecycle/`
- `packages/site-task-lifecycle/src/`
- `packages/site-task-lifecycle/test/`
- package/workspace metadata required to register `@narada/site-task-lifecycle`
- package-local README/docs

## Mutation Mechanism

Missing capability:

No admitted Narada proper MCP/task execution mechanism currently exists that can apply package source writes while recording admitted root, changed-file scope, verification, rollback, and no-import evidence.

## Verification And Closeout Gates

The surface requires:

- explicit implementation admission before source writes;
- final changed-file list;
- verification commands/results;
- file-scoped rollback notes;
- proof that narada-andrey runtime state and PC-locus state were not imported;
- neutral fixtures and import-refusal tests.

## Outcome

Surface decision: `admitted_surface_missing_mutation_mechanism`.

Implementation decision for task-0001 remains: `blocked`.
