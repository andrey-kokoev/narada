# Implement @narada/site-task-lifecycle First Slice From Admitted Candidate Packet

Task surface id: `narada-proper.task-0001`
Status: `implementation_authority_blocked_pending_admission`
Created: 2026-05-10

## Authority Basis

This is a markdown-only Narada proper task surface created under the admitted `.narada` seed/intake scope.

Authority evidence:

- Narada proper seed: `.narada/site.json`
- Candidate packet: `.narada/admission/candidates/site-task-lifecycle-first-slice-candidate.md`
- Source handoff: `C:\Users\Andrey\Narada\kb\proposals\site-task-lifecycle-first-slice-handoff.md`
- Inbound OSM: `osm_20260509_232218_379_79b45bee`

Implementation authority is not yet admitted. The current `D:\code\narada` locus remains temporary seed/intake evidence scope only unless separately admitted for package implementation.

## Goal

Implement the first Narada proper package slice for `@narada/site-task-lifecycle` from the admitted candidate packet.

The first slice should create a source package boundary plus neutral fixtures/tests for receiving-Site task lifecycle initialization and lifecycle behavior. It must preserve the receiving-Site admission contract and refuse narada-andrey runtime state imports.

## Non-Goals

- Do not import narada-andrey task lifecycle databases.
- Do not import narada-andrey task history or `.ai/do-not-open/tasks/`.
- Do not import narada-andrey inbox databases, inbox envelopes, or inbox history.
- Do not import narada-andrey rosters, checkpoints, agent-context databases, operator-surface bindings, PC-locus runtime data, YASB/Komorebi/display/HWND/PID evidence, secrets, tokens, credentials, or private operator preferences.
- Do not implement inbox-to-task bridging in this slice.
- Do not implement agent-context hydration or checkpointing in this slice.
- Do not register live MCP transports until the package boundary and schemas are admitted.

## Candidate Packet Ref

`.narada/admission/candidates/site-task-lifecycle-first-slice-candidate.md`

## Changed-File Scope

Future implementation, if admitted, should be limited to source package and neutral fixture/test files, expected under paths such as:

- `packages/site-task-lifecycle/`
- `packages/site-task-lifecycle/src/`
- `packages/site-task-lifecycle/test/`
- package/workspace metadata required to register the package
- focused docs inside the package, such as `packages/site-task-lifecycle/README.md`

Do not touch existing Narada proper runtime `.ai` task, inbox, roster, checkpoint, or PC-locus state as part of this task.

## Verification Checklist

- Empty receiving Site lifecycle initialization is covered.
- Task spec creation/projection uses neutral fixture identities.
- Claim, unclaim, continue, defer, reopen, finish, review, and close transitions are covered.
- Evidence admission gates and criteria proof behavior are covered.
- Workboard or `next` projection is covered.
- Preferred-agent mismatch behavior has explicit authority basis.
- `narada_andrey_task_role_preferences` is migrated or replaced with a neutral table name in package fixtures/logic.
- MCP tool list and representative input schemas are covered.
- Attempts to import narada-andrey runtime DBs or task history are refused.
- No fixture requires `narada-andrey.*` identities except narada-andrey-side compatibility regression evidence outside this package.

## Closeout Evidence Requirements

Closeout must record:

- final changed-file list;
- implementation authority admission evidence;
- package boundary summary;
- non-portable source-state rejection evidence;
- verification commands run and results;
- remaining gaps or deferred capabilities;
- confirmation that no narada-andrey runtime DB, task history, inbox history, roster, checkpoint, operator-surface binding, PC runtime data, or secrets were imported.
