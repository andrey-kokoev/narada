# task-0001 Execution Carrier Admission Candidate

Candidate id: `narada-proper.carrier.task-0001.package-implementation.v0`
Status: `admitted_for_task_0001_pending_execution`
Prepared: 2026-05-10
Inbound OSM: `osm_20260509_232905_985_d3572029`
Owning surface: `.narada/surfaces/package-implementation-task-surface.md`
Task surface: `.narada/tasks/task-0001-site-task-lifecycle-first-slice.md`

## Carrier Id / Name

- Carrier id: `narada-proper.carrier.task-0001.package-implementation.v0`
- Carrier name: `task-0001 bounded package implementation carrier`

This carrier is admitted for task-0001 package implementation only after the admission decision in `.narada/admission/decisions/task-0001-execution-carrier-admission.md`.

## Exact Root It Would Mutate

Preferred root:

- `/home/andrey/src/narada`

Fallback root only if separately and explicitly admitted:

- `D:\code\narada`

Admitted root for this carrier and task:

- `D:\code\narada`

This is an explicit operator-authorized fallback root admission for `narada-proper.carrier.task-0001.package-implementation.v0` and `narada-proper.task-0001` only. It does not broadly admit `D:\code\narada` for other Narada proper implementation writes.

## Mechanical Authority Verification

Before admission, the carrier must mechanically verify:

- the target root contains `.ai/authority-clone.json`;
- `site_id` is `narada-proper`;
- `authority_root` is `/home/andrey/src/narada`;
- the active mutation root either equals `/home/andrey/src/narada` or has an explicit implementation admission record naming task-0001;
- `.narada/surfaces/package-implementation-task-surface.md` exists and owns `narada-proper.task-0001`;
- `.narada/admission/decisions/task-0001-implementation-admission.md` is superseded by a later admission decision before writes;
- preflight `git status --short` is captured so unrelated dirty files are not overwritten.

## Allowed Command / Mutation Forms

If later admitted, allowed mutation forms are:

- bounded file creation/edit under the admitted changed-file scope;
- package/workspace metadata edits required to register `@narada/site-task-lifecycle`;
- focused verification commands recorded in closeout evidence;
- local read-only inspection of narada-andrey source artifacts as external evidence.

Allowed write paths must remain within:

- `packages/site-task-lifecycle/`
- `packages/site-task-lifecycle/src/`
- `packages/site-task-lifecycle/test/`
- package/workspace metadata required to register `@narada/site-task-lifecycle`
- package-local README/docs

## Denied Forms

Denied:

- raw WSL crossing as an authority shortcut;
- treating `D:\code\narada` seed/intake admission as package implementation admission;
- copying `C:\Users\Andrey\Narada\.ai\` or any narada-andrey runtime database;
- copying narada-andrey task history, inbox history, rosters, checkpoints, operator-surface bindings, PC runtime data, or secrets;
- writing Narada proper runtime `.ai` task/inbox/roster/checkpoint state as part of task-0001 implementation;
- broad reset/revert commands;
- package implementation outside the admitted changed-file scope;
- live MCP transport registration before package boundary and schemas are admitted.

## Changed-File Scope

Candidate implementation scope:

- `packages/site-task-lifecycle/`
- `packages/site-task-lifecycle/src/`
- `packages/site-task-lifecycle/test/`
- package/workspace metadata required for workspace registration;
- package-local documentation.

## Audit Log Shape

The carrier must produce an audit record with:

```json
{
  "schema": "narada.execution_carrier.audit.v0",
  "carrier_id": "narada-proper.carrier.task-0001.package-implementation.v0",
  "task_surface_id": "narada-proper.task-0001",
  "authority_surface_id": "narada-proper.surface.package-implementation-task.v0",
  "admitted_root": "path",
  "authority_verification": {},
  "preflight_git_status": [],
  "changed_files": [],
  "denied_inputs_checked": [],
  "verification_commands": [],
  "rollback_evidence": [],
  "handoff_to_surface": {
    "surface_path": ".narada/surfaces/package-implementation-task-surface.md",
    "closeout_status": "pending"
  }
}
```

## Rollback Evidence

Rollback evidence must include:

- changed-file list grouped by purpose;
- for each changed file, whether it is additive, modified, or metadata registration;
- reversal plan per group;
- confirmation that unrelated pre-existing dirty files were not touched;
- no broad reset/revert use.

## Test Invocation Shape

Verification should start bounded:

- package-local typecheck if available;
- package-local focused tests for neutral fixtures and import-refusal behavior;
- root/workspace verification only after package metadata changes justify it.

No full test suite unless separately requested or admitted.

## Handoff Back To Authority Surface

The carrier must hand results back to:

- `.narada/surfaces/package-implementation-task-surface.md`
- `.narada/admission/admission-ledger.jsonl`
- `.narada/tasks/task-0001-site-task-lifecycle-first-slice.md`

Handoff payload must include:

- admitted root;
- mutation mechanism;
- changed files;
- verification results;
- no-import proof;
- rollback evidence;
- residual gaps.

## Admission Outcome

Carrier admission in this session: `admitted`.

Mutation mechanism: bounded Codex file edits and bounded verification commands from `D:\code\narada`, constrained by this carrier's changed-file scope and audit/closeout requirements.

Execution has not started.
