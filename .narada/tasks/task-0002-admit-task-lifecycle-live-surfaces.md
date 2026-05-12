# narada-proper.task-0002

Title: Admit task-0001 live task-lifecycle carriers and MCP surface
Status: `completed_descriptor_admission`
Created: 2026-05-10
Source OSM: `osm_20260510_141155_707_3ce3f401`

## Authority Basis

Narada proper received a correction/next-step request from `narada-andrey.Kevin` asking for a Narada proper implementation task to create/admit the missing carriers and surface named by `.narada/audit/task-0001-live-execution-missing-carriers-20260510.json`.

This task runs under Narada proper `.narada` authority and the previously admitted task-0001 package implementation carrier. It does not admit `D:\code\narada` as an unbounded live receiving-Site write root.

## Goal

Create and admit descriptor surfaces for:

- `narada-proper.carrier.task-0001.initializer-execution.v0`
- `narada-proper.carrier.task-0001.concrete-adapter.v0`
- `narada-proper.carrier.task-0001.db-mutation.v0`
- `narada-proper.surface.task-0001.live-task-lifecycle-mcp-registration.v0`

Update `.narada/capabilities/mcp-surfaces.json` so site-local task lifecycle MCP is visible as an admitted Narada proper descriptor surface.

## Non-Goals

- No live initializer execution.
- No concrete SQLite dependency admission inside `@narada2/site-task-lifecycle`.
- No SQLite mutation.
- No live MCP transport registration.
- No narada-andrey DB, task history, inbox history, roster, checkpoint, operator-surface, PC-locus, secret, identity-specific state, or source history import.

## Changed-File Scope

Allowed:

- `.narada/tasks/task-0002-admit-task-lifecycle-live-surfaces.md`
- `.narada/surfaces/task-0001-*-carrier.md`
- `.narada/surfaces/task-0001-live-task-lifecycle-mcp-registration-surface.md`
- `.narada/admission/decisions/task-0002-live-carriers-surface-admission.md`
- `.narada/capabilities/mcp-surfaces.json`
- `.narada/audit/task-0002-live-carriers-surface-admission-audit.json`
- append-only `.narada/admission/admission-ledger.jsonl`

## Verification Checklist

- `.narada/capabilities/mcp-surfaces.json` parses as JSON and lists `narada-proper.surface.task-0001.live-task-lifecycle-mcp-registration.v0`.
- `site-local task lifecycle MCP` is no longer in `missing_capabilities`.
- Admission ledger parses as JSONL.
- Package-local typecheck passes.
- Package-local tests pass without importing narada-andrey runtime state.

## Closeout Evidence Requirements

- Audit path: `.narada/audit/task-0002-live-carriers-surface-admission-audit.json`
- Decision path: `.narada/admission/decisions/task-0002-live-carriers-surface-admission.md`
- OSM reply to `narada-andrey.Kevin` reporting task id, changed files, verification, rollback note, and remaining blockers.
