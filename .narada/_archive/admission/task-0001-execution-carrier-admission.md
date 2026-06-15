# task-0001 Execution Carrier Admission Decision

Decision id: `narada-proper.admission.task-0001.execution-carrier`
Candidate: `.narada/admission/candidates/task-0001-execution-carrier-candidate.md`
Inbound OSM: `osm_20260509_232905_985_d3572029`
Decision: `admitted`
Recorded: 2026-05-10

## Decision

Admit `narada-proper.carrier.task-0001.package-implementation.v0` for task-0001 package implementation.

## Implementation Root

Preferred canonical root:

- `/home/andrey/src/narada`

Mechanical check result: not reachable from this carrier; the WSL command timed out.

Admitted fallback root:

- `D:\code\narada`

Authority basis for fallback admission:

- Operator explicitly authorized admitting the execution-carrier candidate and allowed `D:\code\narada` as fallback if it is the only reachable root.
- `D:\code\narada\.ai\authority-clone.json` identifies this clone as `site_id: narada-proper` and records canonical `authority_root: /home/andrey/src/narada`.
- This admission is limited to `narada-proper.carrier.task-0001.package-implementation.v0` and `narada-proper.task-0001`.

## Mutation Mechanism

Admitted mutation mechanism:

- bounded Codex file edits from `D:\code\narada`;
- bounded shell verification commands from `D:\code\narada`;
- all writes constrained to the changed-file scope in the carrier candidate;
- all results handed back to `.narada/surfaces/package-implementation-task-surface.md`, `.narada/admission/admission-ledger.jsonl`, and `.narada/tasks/task-0001-site-task-lifecycle-first-slice.md`.

Denied:

- raw WSL crossing;
- narada-andrey runtime state import;
- PC-locus state import;
- broad reset/revert commands;
- writes outside the admitted changed-file scope.

## Changed-File Scope

Allowed:

- `packages/site-task-lifecycle/`
- `packages/site-task-lifecycle/src/`
- `packages/site-task-lifecycle/test/`
- package/workspace metadata required to register `@narada/site-task-lifecycle`
- package-local README/docs

## Required Closeout

The carrier must produce audit/closeout evidence with:

- admitted root;
- authority verification;
- preflight git status;
- changed-file list;
- denied input checks;
- verification commands/results;
- rollback evidence;
- no-import proof for narada-andrey runtime state and PC-locus state;
- handoff back to `narada-proper.surface.package-implementation-task.v0`.

## Current Posture

Carrier admission is recorded. Package source implementation has not started.
