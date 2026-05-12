# Package Implementation Task Surface v0

Surface id: `narada-proper.surface.package-implementation-task.v0`
Status: `admitted_for_task_implementation_admission_control`
Created: 2026-05-10
Created from inbound OSM: `osm_20260509_232723_010_8f572b98`

## Authority Basis

This surface is admitted under the Narada proper `.narada` seed/intake authority records:

- `.narada/site.json`
- `.narada/tasks/task-0001-site-task-lifecycle-first-slice.md`
- `.narada/admission/decisions/task-0001-implementation-admission.md`
- `.narada/admission/candidates/site-task-lifecycle-first-slice-candidate.md`

This surface exists because no full Narada proper MCP/task lifecycle substrate is available yet. It is a minimal markdown authority surface for owning implementation admission decisions and closeout gates.

It does not admit `D:\code\narada` for implementation writes by implication. It does not use raw WSL crossing. It does not import narada-andrey state.

## Owned Task

Task id/path:

- `narada-proper.task-0001`
- `.narada/tasks/task-0001-site-task-lifecycle-first-slice.md`

## Allowed Changed-File Scope For Future Admission

If task-0001 implementation is later admitted by this surface, the admitted changed-file scope is limited to:

- `packages/site-task-lifecycle/`
- `packages/site-task-lifecycle/src/`
- `packages/site-task-lifecycle/test/`
- package/workspace metadata required to register `@narada/site-task-lifecycle`
- package-local documentation such as `packages/site-task-lifecycle/README.md`

Out of scope:

- Narada proper runtime `.ai` task lifecycle databases or task files;
- Narada proper inbox, roster, checkpoint, operator-surface, or PC-locus runtime state;
- any narada-andrey `.ai` database, task history, inbox history, roster, checkpoint, operator-surface binding, PC runtime state, or secret.

## Mutation Mechanism

Current mutation mechanism status: `missing`.

This surface can own the admission decision and gates, but it cannot yet execute package implementation because no admitted mutation mechanism has been recorded for package source writes.

Acceptable future mutation mechanisms:

- a Narada proper MCP/task lifecycle implementation tool that applies bounded package changes under this surface;
- a separately admitted task execution carrier that records the implementation root, changed-file scope, and closeout evidence before writes.

Not acceptable by implication:

- raw WSL crossing to `/home/andrey/src/narada`;
- treating `D:\code\narada` as package implementation authority because it was admitted for seed/intake work;
- copying narada-andrey runtime or PC-locus state.

## Verification Gates

Before implementation closeout can be accepted:

- task-0001 implementation authority decision must name an admitted root and mutation mechanism;
- final changed-file list must stay within the admitted scope;
- package boundary summary must be recorded;
- verification commands and results must be recorded;
- tests or fixtures must prove refusal of narada-andrey runtime DB/task-history imports;
- fixtures must use neutral identities;
- no narada-andrey `.ai` runtime state or PC-locus state may be copied.

## Closeout Gates

Closeout evidence must include:

- implementation authority admission event;
- admitted root and mutation mechanism;
- final changed-file list;
- rollback or reversibility notes per changed-file group;
- non-portable source-state rejection evidence;
- verification results;
- residual missing capabilities;
- explicit no-import confirmation for narada-andrey runtime state and PC-locus state.
