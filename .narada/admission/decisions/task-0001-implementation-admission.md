# task-0001 Implementation Admission Decision

Decision id: `narada-proper.admission.task-0001.implementation`
Task surface: `.narada/tasks/task-0001-site-task-lifecycle-first-slice.md`
Candidate packet: `.narada/admission/candidates/site-task-lifecycle-first-slice-candidate.md`
Inbound OSM: `osm_20260509_232344_896_7b90bd10`
Decision: `blocked`
Recorded: 2026-05-10

## 1. Exact Root Admitted For Implementation

Neither root is admitted for task-0001 implementation yet.

- Canonical authority root: `/home/andrey/src/narada`
- Temporary Windows seed/intake root: `D:\code\narada`

`/home/andrey/src/narada` remains the canonical Narada proper mutation authority root declared in `.ai/authority-clone.json`, but it is not reachable from this carrier.

`D:\code\narada` was admitted only for the minimal `.narada` seed/intake work. That admission does not extend to package implementation.

## 2. Why No Root Is Authoritative Enough For Writes Yet

`/home/andrey/src/narada` would be authoritative enough for writes if reachable because it is the declared Narada proper authority clone. Current carrier evidence shows it is not reachable: `wsl.exe -e bash -lc "cd /home/andrey/src/narada && pwd"` timed out during this decision check.

`D:\code\narada` is mechanically writable in this carrier, but its authority admission is limited by `.narada/site.json` to temporary seed/intake evidence scope. No Narada proper authority record currently admits it for package source implementation.

Therefore implementation writes are blocked until one of these occurs:

- `/home/andrey/src/narada` becomes reachable from the active carrier; or
- the operator explicitly admits `D:\code\narada` for task-0001 package implementation, not just seed/intake work.

## 3. Changed-File Scope If Later Admitted

If implementation is later admitted, the permitted changed-file scope should be limited to source package plus neutral fixtures/tests:

- `packages/site-task-lifecycle/`
- `packages/site-task-lifecycle/src/`
- `packages/site-task-lifecycle/test/`
- package/workspace metadata required to register the package
- package-local documentation such as `packages/site-task-lifecycle/README.md`

Explicitly out of scope:

- Narada proper runtime `.ai` task lifecycle databases or task files;
- Narada proper inbox, roster, checkpoint, operator-surface, or PC-locus runtime state;
- narada-andrey `.ai` databases, task history, inbox history, rosters, checkpoints, operator-surface bindings, PC runtime state, or secrets.

## 4. Rollback And Closeout Evidence Required

Before implementation begins, closeout requirements must be accepted:

- record the implementation authority admission event and admitted root;
- record final changed-file list;
- record package boundary summary;
- record non-portable source-state rejection evidence;
- record verification commands and results;
- record rollback plan or reversibility notes for each changed-file group;
- record remaining gaps or deferred capabilities;
- confirm no runtime database, task history, inbox history, roster, checkpoint, operator-surface binding, PC runtime data, or secret was imported.

Rollback must be file-scoped. Broad reset/revert commands are not admissible while unrelated worktree changes exist.

## 5. Proof Required For No Runtime-State Import

Implementation closeout must include proof that:

- no files from `C:\Users\Andrey\Narada\.ai\` were copied;
- no files from `C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\` were copied;
- no SQLite runtime DBs were copied into Narada proper;
- package fixtures use neutral identities, not `narada-andrey.*`;
- source inventory references narada-andrey artifacts as external evidence only;
- tests include refusal behavior for attempts to import narada-andrey runtime DBs or task history.

## Outcome

Implementation decision: `blocked`.

Reason: canonical authority root is currently unreachable, and the temporary `D:\code\narada` admission is seed/intake only. No task-0001 package implementation writes are admitted yet.
